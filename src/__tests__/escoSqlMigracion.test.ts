// Migración 192 contra Postgres real (PGlite): la RPC esco_sql_lectura y las vistas v_esco_*.
// El SQL que se prueba se EXTRAE del archivo de la migración, no se copia: si el archivo
// cambia, esta prueba lo recoge. Datos 100 % sintéticos.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VISTAS_ESCO } from '../utils/escoSql/prompt.ts';

const MIGRACION = readFileSync(new URL('../sql/migrations/192_esco_sql_vistas_y_rpc.sql', import.meta.url), 'utf8');

const GERENCIA = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const DESACTIVADA = '44444444-4444-4444-8444-444444444444';

function bloque(re: RegExp): string {
  const m = re.exec(MIGRACION);
  if (!m) throw new Error(`no encontré en la migración: ${re}`);
  return m[0];
}
const vista = (n: string) => bloque(new RegExp(`CREATE VIEW public\\.${n} WITH[\\s\\S]*?;\\n`));
const FUNCION = bloque(/CREATE FUNCTION public\.esco_sql_lectura[\s\S]*?\$fn\$;/);

const ESQUEMA = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create type rol_usuario as enum ('Administrador', 'Verificador', 'Gerencia');
create type fraccion_jornal as enum ('0.25', '0.5', '0.75', '1.0');
create table usuarios (id uuid primary key, rol rol_usuario, activo boolean not null default true);
create function public.get_user_role() returns rol_usuario language sql security definer
  set search_path to 'public', 'pg_temp' as $$ select rol from usuarios where id = auth.uid() and activo = true $$;
grant execute on function public.get_user_role() to anon, authenticated;
grant usage on schema public to anon, authenticated;

create table lotes (id uuid primary key default gen_random_uuid(), nombre text not null);
create table tipos_tareas (id uuid primary key default gen_random_uuid(), nombre text not null);
create table tareas (id uuid primary key default gen_random_uuid(), nombre text not null, tipo_tarea_id uuid);
create table empleados (id uuid primary key default gen_random_uuid(), nombre text not null);
create table contratistas (id uuid primary key default gen_random_uuid(), nombre varchar not null);
create table registros_trabajo (
  id uuid primary key default gen_random_uuid(), tarea_id uuid, empleado_id uuid, contratista_id uuid, lote_id uuid,
  fecha_trabajo date not null, fraccion_jornal fraccion_jornal not null, costo_jornal numeric);
create table fin_negocios (id uuid primary key default gen_random_uuid(), nombre text);
create table fin_regiones (id uuid primary key default gen_random_uuid(), nombre text);
create table fin_categorias_gastos (id uuid primary key default gen_random_uuid(), nombre text);
create table fin_conceptos_gastos (id uuid primary key default gen_random_uuid(), nombre text);
create table fin_proveedores (id uuid primary key default gen_random_uuid(), nombre text);
create table fin_gastos (id uuid primary key default gen_random_uuid(), fecha date, negocio_id uuid, region_id uuid,
  categoria_id uuid, concepto_id uuid, nombre text, proveedor_id uuid, valor numeric, estado text);

grant select, insert, update on all tables in schema public to authenticated;
-- Como producción: registros_trabajo lo lee cualquiera autenticado; fin_gastos solo Gerencia.
alter table fin_gastos enable row level security;
create policy gerencia_gastos on fin_gastos for all to authenticated
  using ((select get_user_role()) = 'Gerencia'::rol_usuario);
`;

const DATOS = `
insert into usuarios values ('${GERENCIA}','Gerencia',true), ('${ADMIN}','Administrador',true), ('${DESACTIVADA}','Gerencia',false);
insert into lotes(id,nombre) values ('a0000000-0000-4000-8000-000000000001','1. Norte');
insert into tipos_tareas(id,nombre) values ('b0000000-0000-4000-8000-000000000001','Guadaña');
insert into tareas(id,nombre,tipo_tarea_id) values ('c0000000-0000-4000-8000-000000000001','Guadaña general','b0000000-0000-4000-8000-000000000001');
insert into empleados(id,nombre) values ('e0000000-0000-4000-8000-000000000001','Ana');
insert into contratistas(id,nombre) values ('f0000000-0000-4000-8000-000000000001','Contratista Uno');
insert into registros_trabajo(tarea_id,empleado_id,contratista_id,lote_id,fecha_trabajo,fraccion_jornal,costo_jornal) values
  ('c0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001',null,'a0000000-0000-4000-8000-000000000001','2026-10-05','1.0',100),
  ('c0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001',null,'a0000000-0000-4000-8000-000000000001','2026-10-06','0.25',25),
  ('c0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001',null,null,'2026-10-06','0.5',50),
  ('c0000000-0000-4000-8000-000000000001',null,'f0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','2026-10-07','0.75',null);
insert into fin_gastos(fecha,nombre,valor,estado) values
  ('2026-10-01','Abono',1000,'Confirmado'), ('2026-10-02','Pendiente de pago',500,'Pendiente');
`;

let db: PGlite;

async function como<T>(uid: string, sql: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.exec('set local role authenticated');
    return (await tx.query<T>(sql)).rows;
  });
}
const rpc = async (uid: string, p: string) =>
  (await como<{ r: { filas: Record<string, unknown>[]; n_filas: number; truncado: boolean } }>(uid, `select public.esco_sql_lectura($q$${p}$q$) as r`))[0].r;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ESQUEMA);
  await db.exec(DATOS);
  await db.exec(vista('v_esco_jornales'));
  await db.exec(vista('v_esco_gastos'));
  await db.exec(FUNCION);
  await db.exec('grant select on v_esco_jornales, v_esco_gastos to authenticated; grant execute on function public.esco_sql_lectura(text) to authenticated;');
});
afterAll(async () => { await db.close(); });

describe('migración 192 — v_esco_jornales', () => {
  it('suma jornales por fracción (no cuenta filas) y deja el costo NULL como NULL', async () => {
    const r = await rpc(GERENCIA, 'select count(*)::int filas, sum(jornales) jornales, sum(costo) costo, count(costo)::int con_costo from v_esco_jornales');
    expect(r.filas[0]).toMatchObject({ filas: 4, con_costo: 3 });
    expect(Number(r.filas[0].jornales)).toBe(2.5);
    expect(Number(r.filas[0].costo)).toBe(175);
  });

  it('los registros sin lote quedan con lote NULL y cuentan en el total general', async () => {
    const r = await rpc(GERENCIA, 'select lote, sum(jornales) j from v_esco_jornales group by lote order by lote nulls last');
    expect(r.filas.map((f) => [f.lote, Number(f.j)])).toEqual([['1. Norte', 2], [null, 0.5]]);
  });

  it('resuelve persona (empleado o contratista) y tipo de tarea', async () => {
    const r = await rpc(GERENCIA, "select distinct persona, tipo_persona, tipo_tarea from v_esco_jornales order by persona");
    expect(r.filas).toEqual([
      { persona: 'Ana', tipo_persona: 'empleado', tipo_tarea: 'Guadaña' },
      { persona: 'Contratista Uno', tipo_persona: 'contratista', tipo_tarea: 'Guadaña' },
    ]);
  });
});

describe('migración 192 — v_esco_gastos', () => {
  it('solo incluye los confirmados', async () => {
    const r = await rpc(GERENCIA, 'select count(*)::int n, sum(valor) v from v_esco_gastos');
    expect(r.filas[0]).toMatchObject({ n: 1 });
    expect(Number(r.filas[0].v)).toBe(1000);
  });

  it('security_invoker: Administrador (sin acceso a fin_gastos) ve 0 filas por la vista', async () => {
    const filas = await como<{ n: number }>(ADMIN, 'select count(*)::int n from v_esco_gastos');
    expect(filas[0].n).toBe(0);
  });
});

describe('migración 192 — esco_sql_lectura', () => {
  it('devuelve filas, n_filas y truncado', async () => {
    const r = await rpc(GERENCIA, 'select 1 as uno');
    expect(r).toEqual({ filas: [{ uno: 1 }], n_filas: 1, truncado: false });
  });

  it('acepta WITH, mayúsculas, punto y coma final y espacios', async () => {
    expect((await rpc(GERENCIA, 'WITH x AS (select 7 n) SELECT * FROM x ;  \n')).filas).toEqual([{ n: 7 }]);
  });

  it('corta en 500 filas y marca truncado', async () => {
    const r = await rpc(GERENCIA, 'select g from generate_series(1,700) g order by g');
    expect(r.n_filas).toBe(500);
    expect(r.truncado).toBe(true);
    expect(r.filas).toHaveLength(500);
    expect(r.filas[499]).toEqual({ g: 500 });
  });

  it('0 filas es una lista vacía, no un error', async () => {
    expect(await rpc(GERENCIA, 'select 1 where false')).toEqual({ filas: [], n_filas: 0, truncado: false });
  });

  it('un rol que no es Gerencia recibe 42501', async () => {
    await expect(rpc(ADMIN, 'select 1')).rejects.toMatchObject({ code: '42501' });
  });

  it('una cuenta Gerencia desactivada recibe 42501', async () => {
    await expect(rpc(DESACTIVADA, 'select 1')).rejects.toMatchObject({ code: '42501' });
  });

  it('rechaza varias sentencias, vacío y lo que no empieza por SELECT/WITH', async () => {
    await expect(rpc(GERENCIA, 'select 1; select 2')).rejects.toMatchObject({ code: '22023' });
    await expect(rpc(GERENCIA, '  ;; ')).rejects.toMatchObject({ code: '22023' });
    await expect(rpc(GERENCIA, "insert into lotes(nombre) values ('x')")).rejects.toMatchObject({ code: '22023' });
    await expect(rpc(GERENCIA, 'delete from lotes')).rejects.toMatchObject({ code: '22023' });
  });

  it('un CTE que modifica datos falla y no escribe nada', async () => {
    await expect(rpc(GERENCIA, "with x as (insert into lotes(nombre) values ('zz') returning id) select * from x")).rejects.toBeTruthy();
    await expect(rpc(GERENCIA, "with x as (update lotes set nombre = 'zz' returning id) select count(*) from x")).rejects.toBeTruthy();
    expect((await db.query<{ n: number }>("select count(*)::int n from lotes where nombre = 'zz'")).rows[0].n).toBe(0);
  });

  it('una función que escribe falla por solo lectura (25006)', async () => {
    await db.exec("create function public.escribe() returns int language plpgsql as $$ begin insert into lotes(nombre) values ('zz'); return 1; end $$; grant execute on function public.escribe() to authenticated;");
    await expect(rpc(GERENCIA, 'select public.escribe()')).rejects.toMatchObject({ code: '25006' });
    expect((await db.query<{ n: number }>("select count(*)::int n from lotes where nombre = 'zz'")).rows[0].n).toBe(0);
  });

  it('la consulta no puede volver a activar la escritura', async () => {
    await expect(rpc(GERENCIA, "select set_config('transaction_read_only', 'off', true)")).rejects.toMatchObject({ code: '25001' });
  });

  it('un error de la consulta llega como error de Postgres, con su mensaje', async () => {
    await expect(rpc(GERENCIA, 'select * from v_esco_no_existe')).rejects.toThrow(/v_esco_no_existe/);
  });

  it('anon no ejecuta la RPC aunque exista', async () => {
    await db.exec('revoke execute on function public.esco_sql_lectura(text) from public, anon');
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role anon');
        await tx.query("select public.esco_sql_lectura('select 1')");
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('migración 192 — contrato del archivo', () => {
  const vistasEnArchivo = [...MIGRACION.matchAll(/CREATE VIEW public\.(v_esco_\w+) WITH \(security_invoker = true\)/g)].map((m) => m[1]);

  it('hay 10 vistas y todas nacen con security_invoker', () => {
    expect(vistasEnArchivo).toHaveLength(10);
    expect([...MIGRACION.matchAll(/CREATE VIEW public\.v_esco_\w+/g)]).toHaveLength(10);
  });

  it('cada vista del archivo está descrita en el prompt, y al revés', () => {
    expect([...vistasEnArchivo].sort()).toEqual(VISTAS_ESCO.map((v) => v.nombre).sort());
  });

  it('la RPC es SECURITY INVOKER, con search_path pineado, y no se da a anon', () => {
    expect(FUNCION).toMatch(/SECURITY INVOKER/);
    expect(FUNCION).toMatch(/SET search_path = public, pg_temp/);
    expect(MIGRACION).toMatch(/REVOKE ALL ON FUNCTION public\.esco_sql_lectura\(text\) FROM PUBLIC, anon/);
  });

  it('el clima sale de clima_resumen_diario, nunca de clima_lecturas', () => {
    expect(vista('v_esco_clima_diario')).toContain('clima_resumen_diario');
    expect(vista('v_esco_clima_diario')).not.toContain('clima_lecturas');
  });
});
