// Arnés local de RLS para esco-consultas (M3). Postgres real (PGlite, WASM), sin Docker.
//
// - Esquema mínimo de las 5 tablas que lee la función, con los mismos tipos ENUM.
// - Políticas SELECT copiadas LITERALMENTE de producción (pg_policies, 2026-11-03,
//   ver docs/esco2/m3-rls.md) y `get_user_role()` igual a la de la migración 137.
// - Un cliente con la forma de supabase-js que ejecuta cada lectura como lo hace
//   PostgREST: en una transacción con `set local role authenticated` (o `anon`) y
//   `request.jwt.claims`, devolviendo JSON con `row_to_json` y cortando en max-rows.
// - Datos 100 % sintéticos: ningún nombre, id ni cifra de la finca.
//
// Lo que NO prueba: la firma del JWT (eso lo hace Auth/el gateway). Aquí el JWT es un
// token sintético `cabecera.payload.firma` y `getUser` solo acepta la firma "valida".

import { PGlite } from '@electric-sql/pglite';
import type { FiltroPostgrest, RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import type { ClienteUsuario } from '../../supabase/functions/esco-consultas/manejador.ts';

export const USUARIOS = {
  gerencia: '11111111-1111-4111-8111-111111111111',
  administrador: '22222222-2222-4222-8222-222222222222',
  verificador: '33333333-3333-4333-8333-333333333333',
  gerenciaDesactivada: '44444444-4444-4444-8444-444444444444',
  sinPerfil: '55555555-5555-4555-8555-555555555555',
} as const;

export const N_REGISTROS = 2300;
export const MAX_FILAS_POSTGREST = 1000;

const ESQUEMA = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create type rol_usuario as enum ('Administrador', 'Verificador', 'Gerencia');
create type fraccion_jornal as enum ('0.25', '0.5', '0.75', '1.0');
create type estado_tarea as enum ('Banco', 'Programada', 'En Proceso', 'Completada', 'Cancelada');
create type categoria_tarea as enum ('Mantenimiento del cultivo', 'Cosecha', 'Proyectos Especiales', 'Otras');

create table usuarios (id uuid primary key, rol rol_usuario, activo boolean not null default true);
create table lotes (id uuid primary key, nombre text not null, activo boolean, total_arboles integer, area_hectareas numeric);
create table tipos_tareas (id uuid primary key, nombre text not null, categoria categoria_tarea, activo boolean);
create table tareas (
  id uuid primary key, nombre text not null, estado estado_tarea, tipo_tarea_id uuid, jornales_estimados numeric, lote_id uuid,
  fecha_estimada_inicio date, fecha_estimada_fin date, fecha_inicio_real date, fecha_fin_real date
);
create table aplicaciones (id uuid primary key, tarea_id uuid, codigo_aplicacion text, nombre_aplicacion text, estado text);
create table registros_trabajo (
  id uuid primary key, tarea_id uuid not null, lote_id uuid, fecha_trabajo date not null,
  fraccion_jornal fraccion_jornal not null, costo_jornal numeric
);

-- Migración 137, literal.
create function public.get_user_role() returns rol_usuario language sql security definer
  set search_path to 'public', 'pg_temp' as $$
  SELECT rol FROM usuarios WHERE id = auth.uid() AND activo = true
$$;
grant execute on function public.get_user_role() to anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on usuarios, lotes, tipos_tareas, tareas, registros_trabajo, aplicaciones to anon, authenticated;

alter table usuarios enable row level security;
alter table lotes enable row level security;
alter table tipos_tareas enable row level security;
alter table tareas enable row level security;
alter table registros_trabajo enable row level security;
alter table aplicaciones enable row level security;

-- Políticas SELECT/ALL de producción (2026-11-03), predicados literales.
create policy "Gerencia acceso total" on usuarios for all to public using ((( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario));
create policy "Usuario ve su perfil" on usuarios for select to public using (((id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario)));

create policy "Administrador lee lotes" on lotes for select to public using ((( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario));
create policy "Gerencia acceso total" on lotes for all to public using ((( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario));
create policy "Usuarios autenticados pueden leer lotes" on lotes for select to authenticated using (true);

create policy "Administrador access registros_trabajo" on registros_trabajo for all to authenticated using ((EXISTS ( SELECT 1 FROM usuarios WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])) AND (usuarios.activo = true)))));
create policy "Gerencia full access on registros_trabajo" on registros_trabajo for all to authenticated using ((EXISTS ( SELECT 1 FROM usuarios WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Gerencia'::rol_usuario) AND (usuarios.activo = true)))));
create policy "Verificador read registros_trabajo" on registros_trabajo for select to authenticated using ((EXISTS ( SELECT 1 FROM usuarios WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Verificador'::rol_usuario) AND (usuarios.activo = true)))));
create policy "authenticated_select_registros_trabajo" on registros_trabajo for select to authenticated using (true);

create policy "Administrador read tareas" on tareas for select to authenticated using ((EXISTS ( SELECT 1 FROM usuarios WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])) AND (usuarios.activo = true)))));
create policy "Gerencia full access on tareas" on tareas for all to authenticated using ((EXISTS ( SELECT 1 FROM usuarios WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Gerencia'::rol_usuario) AND (usuarios.activo = true)))));
create policy "Verificador read tareas" on tareas for select to authenticated using ((EXISTS ( SELECT 1 FROM usuarios WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Verificador'::rol_usuario) AND (usuarios.activo = true)))));

-- Producción (2026-11-03): aplicaciones solo la lee Administrador o Gerencia; el Verificador no.
create policy "Administrador puede todo en aplicaciones" on aplicaciones for all to public using ((( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario));
create policy "Gerencia acceso total" on aplicaciones for all to public using ((( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario));

create policy "Administrador read tipos_tareas" on tipos_tareas for select to authenticated using ((EXISTS ( SELECT 1 FROM usuarios WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])) AND (usuarios.activo = true)))));
create policy "Gerencia full access on tipos_tareas" on tipos_tareas for all to authenticated using ((EXISTS ( SELECT 1 FROM usuarios WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Gerencia'::rol_usuario) AND (usuarios.activo = true)))));
create policy "Verificador read tipos_tareas" on tipos_tareas for select to authenticated using ((EXISTS ( SELECT 1 FROM usuarios WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Verificador'::rol_usuario) AND (usuarios.activo = true)))));
`;

const DATOS = `
insert into usuarios values
  ('${USUARIOS.gerencia}', 'Gerencia', true),
  ('${USUARIOS.administrador}', 'Administrador', true),
  ('${USUARIOS.verificador}', 'Verificador', true),
  ('${USUARIOS.gerenciaDesactivada}', 'Gerencia', false);
insert into lotes values
  ('a0000000-0000-4000-8000-000000000001', '1. Lote Norte', true, 1000, 5),
  ('a0000000-0000-4000-8000-000000000002', '2. Lote Sur', true, null, null);
insert into tipos_tareas values
  ('b0000000-0000-4000-8000-000000000001', 'Cosecha', 'Cosecha', true),
  ('b0000000-0000-4000-8000-000000000002', 'Guadaña', 'Mantenimiento del cultivo', true);
insert into tareas values
  ('c0000000-0000-4000-8000-000000000001', 'Cosecha fruta temprana', 'En Proceso', 'b0000000-0000-4000-8000-000000000001', 40, null, '2026-05-01', '2026-05-31', '2026-05-02', null),
  ('c0000000-0000-4000-8000-000000000002', 'Guadaña general', 'En Proceso', 'b0000000-0000-4000-8000-000000000002', null, null, null, null, null, null);
insert into aplicaciones values
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'APL-1', 'Aplicación de prueba', 'Cerrada');
insert into registros_trabajo
  select
    ('d0000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
    case when g % 3 = 0 then 'c0000000-0000-4000-8000-000000000001'::uuid else 'c0000000-0000-4000-8000-000000000002'::uuid end,
    case when g % 10 = 0 then null when g % 2 = 0 then 'a0000000-0000-4000-8000-000000000001'::uuid else 'a0000000-0000-4000-8000-000000000002'::uuid end,
    date '2026-05-01' + (g % 31),
    (array['0.25', '0.5', '0.75', '1.0'])[1 + g % 4]::fraccion_jornal,
    case when g = 7 then null else 25000 * (1 + g % 4) end
  from generate_series(1, ${N_REGISTROS}) g;
`;

export async function crearBaseRls(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(ESQUEMA);
  await db.exec(DATOS);
  return db;
}

// --- JWT sintético ---------------------------------------------------------------

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function jwtSintetico(sub: string, firma: 'valida' | 'falsa' = 'valida'): string {
  return `${b64({ alg: 'none' })}.${b64({ sub, role: 'authenticated' })}.${firma}`;
}

function leerJwt(jwt: string): { sub: string; valida: boolean } | null {
  const [, payload, firma] = jwt.split('.');
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub?: string };
    return p.sub ? { sub: p.sub, valida: firma === 'valida' } : null;
  } catch {
    return null;
  }
}

// --- Cliente con la forma de supabase-js -----------------------------------------

const IDENT = /^[a-z_][a-z0-9_]*$/;

export interface Traza {
  consultas: Array<{ tabla: string; rol: string; filas: number }>;
}

export function clienteRls(db: PGlite, jwt: string, traza: Traza = { consultas: [] }): ClienteUsuario {
  const leido = leerJwt(jwt);
  const rol = leido?.valida ? 'authenticated' : 'anon';
  const claims = leido?.valida ? JSON.stringify({ sub: leido.sub, role: 'authenticated' }) : JSON.stringify({ role: 'anon' });

  return {
    auth: {
      async getUser(token: string) {
        const l = leerJwt(token);
        return l?.valida ? { data: { user: { id: l.sub } }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } };
      },
    },
    from(tabla: string) {
      if (!IDENT.test(tabla)) throw new Error(`tabla inválida: ${tabla}`);
      return {
        select(columnas: string, opciones?: { count?: 'exact' }): FiltroPostgrest {
          const cols = columnas.split(',').map((c) => c.trim());
          if (cols.some((c) => !IDENT.test(c))) throw new Error(`columnas inválidas: ${columnas}`);
          const condiciones: string[] = [];
          const params: unknown[] = [];
          let orden = '';
          let limite = MAX_FILAS_POSTGREST;
          let desplazamiento = 0;
          const filtro = (col: string, op: string, v: string) => {
            if (!IDENT.test(col)) throw new Error(`columna inválida: ${col}`);
            params.push(v);
            condiciones.push(`${col}::text ${op} $${params.length}`);
          };
          const q: FiltroPostgrest = {
            eq(c, v) {
              filtro(c, '=', v);
              return q;
            },
            gte(c, v) {
              filtro(c, '>=', v);
              return q;
            },
            lte(c, v) {
              filtro(c, '<=', v);
              return q;
            },
            order(c, o) {
              if (!IDENT.test(c)) throw new Error(`orden inválido: ${c}`);
              orden = ` order by ${c} ${o?.ascending === false ? 'desc' : 'asc'}`;
              return q;
            },
            range(a, b) {
              desplazamiento = a;
              limite = Math.min(b - a + 1, MAX_FILAS_POSTGREST);
              return q;
            },
            then(resolver, rechazar) {
              const donde = condiciones.length ? ` where ${condiciones.join(' and ')}` : '';
              const ejecutar = async (): Promise<RespuestaPostgrest> => {
                try {
                  return await db.transaction(async (tx) => {
                    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
                    await tx.exec(`set local role ${rol}`);
                    const filas = await tx.query<{ fila: Record<string, unknown> }>(
                      `select row_to_json(t) as fila from (select ${cols.join(', ')} from public.${tabla}${donde}${orden} limit ${limite} offset ${desplazamiento}) t`,
                      params,
                    );
                    let count: number | null = null;
                    if (opciones?.count === 'exact') {
                      const n = await tx.query<{ n: number }>(`select count(*)::int as n from public.${tabla}${donde}`, params);
                      count = n.rows[0].n;
                    }
                    traza.consultas.push({ tabla, rol, filas: filas.rows.length });
                    return { data: filas.rows.map((r) => r.fila), error: null, count };
                  });
                } catch (e) {
                  return { data: null, error: { message: e instanceof Error ? e.message : String(e) }, count: null };
                }
              };
              return ejecutar().then(resolver, rechazar);
            },
          };
          return q;
        },
      };
    },
  };
}
