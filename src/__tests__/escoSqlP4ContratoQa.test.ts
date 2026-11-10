// QA P4: aplica la migración candidata REAL a Postgres local con RLS y datos sintéticos.
// La IR se construye directamente: el contrato de base no depende del parser de la edge.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import catalogo from '../utils/escoSql/catalogoConsulta.json';
import { convertirSqlSeguro } from '../utils/escoSql/consultaSegura.ts';
import { manejar, type ClienteUsuario, type Dependencias } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { RespuestaLLM } from '../utils/esco2/llm.ts';
import type { CatalogoConsulta, ConsultaSegura, ExprNode, FuenteConsulta, ParametroConsulta, ProyeccionConsulta, QueryNode, SelectNode } from '../utils/escoSql/contratoConsulta.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const INACTIVO = '44444444-4444-4444-8444-444444444444';
const col = (source: string, name: string): ExprNode => ({ kind: 'column', source, name });
const param = (index: number): ExprNode => ({ kind: 'param', index });
const salida = (name: string): ExprNode => ({ kind: 'output', name });
const projection = (expr: ExprNode, alias: string): ProyeccionConsulta => ({ expr, alias });
const view = (name: string, alias: string): FuenteConsulta => ({ kind: 'view', name, alias });
const query = (columns: ProyeccionConsulta[], from?: FuenteConsulta): QueryNode => ({ with: [], body: { kind: 'select', distinct: false, columns, ...(from ? { from } : {}), joins: [], groupBy: [] }, orderBy: [] });
const consulta = (query: QueryNode, params: ParametroConsulta[] = []): ConsultaSegura => ({ version: 1, query, params });
const aggregate = (fn: 'count' | 'sum' | 'avg' | 'min' | 'max', args: ExprNode[] = [], star = false): ExprNode => ({ kind: 'aggregate', fn, args, star, distinct: false });
const binary = (op: '=' | '>=' | '+' | '-', left: ExprNode, right: ExprNode): ExprNode => ({ kind: 'binary', op, left, right });
const select = (q: QueryNode): SelectNode => { if (q.body.kind !== 'select') throw new Error('Fixture no SELECT'); return q.body; };
const TIPO_SQL: Record<string, string> = { boolean: 'boolean', integer: 'integer', bigint: 'bigint', numeric: 'numeric', text: 'text', date: 'date', timestamptz: 'timestamptz', timestamp: 'timestamp', uuid: 'uuid', interval: 'interval' };
const identificador = (valor: string) => '"' + valor.replace(/"/g, '""') + '"';
let db: PGlite;
type Resultado = { filas: Record<string, unknown>[]; n_filas: number; truncado: boolean };

async function rpc(ir: unknown, uid = A): Promise<Resultado> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.exec('set local role authenticated');
    return (await tx.query<{ r: Resultado }>('select public.esco_sql_consultar_v1($1::jsonb) r', [JSON.stringify(ir)])).rows[0].r;
  });
}
async function actor(ir: unknown, uid: string): Promise<Resultado> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<{ r: Resultado }>('select public.esco_sql_consultar_actor_v1($1::uuid,$2::jsonb) r', [uid, JSON.stringify(ir)])).rows[0].r;
  });
}

beforeAll(async () => {
  const migracion = readFileSync(new URL('../sql/migrations/194_esco_sql_ejecutor_compartido.sql', import.meta.url), 'utf8');
  const anterior = readFileSync(new URL('../sql/migrations/192_esco_sql_vistas_y_rpc.sql', import.meta.url), 'utf8').match(/CREATE FUNCTION public\.esco_sql_lectura[\s\S]*?\$fn\$;/)?.[0];
  if (!anterior) throw new Error('Fixture no encontró RPC192');
  db = new PGlite();
  await db.exec("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$; grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role; create table usuarios(id uuid primary key,rol text,activo boolean not null); create function public.get_user_role() returns text language sql security definer set search_path=public,pg_temp as $$select rol from usuarios where id=auth.uid() and activo$$; grant usage on schema public to anon,authenticated,service_role; grant execute on function public.get_user_role() to authenticated,service_role;");
  await db.query('insert into usuarios values($1,$5,true),($2,$5,true),($3,$6,true),($4,$5,false)', [A, B, ADMIN, INACTIVO, 'Gerencia', 'Administrador']);
  for (const vista of (catalogo as CatalogoConsulta).views) {
    const tabla = identificador('qa_' + vista.name);
    const columnas = vista.columns.map((c) => identificador(c.name) + ' ' + TIPO_SQL[c.type]).join(',');
    await db.exec('create table ' + tabla + '(qa_owner uuid,' + columnas + '); alter table ' + tabla + ' enable row level security; create policy qa_actor on ' + tabla + ' for select to authenticated using(qa_owner=auth.uid()); grant select on ' + tabla + ' to authenticated; create view public.' + identificador(vista.name) + ' with(security_invoker=true) as select ' + vista.columns.map((c) => identificador(c.name)).join(',') + ' from ' + tabla + '; grant select on public.' + identificador(vista.name) + ' to authenticated;');
  }
  await db.query("insert into qa_v_esco_jornales(qa_owner,fecha,lote,jornales,costo) values($1,'2026-10-01','Parcela A',1,10),($1,'2026-10-02','Parcela A',0.5,null),($2,'2026-10-01','Parcela B',2,30)", [A, B]);
  await db.query("insert into qa_v_esco_gastos(qa_owner,fecha,concepto,valor) values($1,'2026-10-01','Concepto A',100),($1,'2026-10-02','Concepto B',null),($2,'2026-10-01','Concepto C',200)", [A, B]);
  await db.query("insert into qa_v_esco_inventario(qa_owner,nombre,cantidad_actual) select $1::uuid,'Producto '||g,g from generate_series(1,501) g", [A]);
  await db.exec(anterior + ' grant execute on function public.esco_sql_lectura(text) to anon,authenticated,service_role;');
  await db.exec(migracion);
}, 30000);
afterAll(async () => { if (db) await db.close(); });

describe('QA P4 — IR validada por PostgreSQL, sin pasar por el parser', () => {
  it('Given parámetro numérico canónico, When RPC web, Then produce resultado útil', async () => {
    expect(await rpc(consulta(query([projection(param(0), 'total')]), [{ type: 'numeric', value: '125.25' }]))).toEqual({ filas: [{ total: 125.25 }], n_filas: 1, truncado: false });
  });
  it('Given texto con puntuación y Unicode, When se enlaza como parámetro, Then conserva su contenido como dato', async () => {
    const valor = "Categoría 'nueva'; café";
    expect((await rpc(consulta(query([projection(param(0), 'etiqueta')]), [{ type: 'text', value: valor }]))).filas).toEqual([{ etiqueta: valor }]);
  });
  it('Given dos actores activos, When cada puerta consulta, Then RLS limita al actor correcto', async () => {
    const ir = consulta(query([projection(col('j', 'lote'), 'lote'), projection(col('j', 'costo'), 'costo')], view('v_esco_jornales', 'j')));
    expect((await rpc(ir)).filas.map((r) => r.lote)).toEqual(['Parcela A', 'Parcela A']);
    expect((await actor(ir, B)).filas).toEqual([{ lote: 'Parcela B', costo: 30 }]);
  });
  it('Given NULL y cero explícito, When proyecta, Then conserva ambos sin convertir NULL en cero', async () => {
    const q = query([projection({ kind: 'null' }, 'sin_dato'), projection(param(0), 'cero')]);
    expect((await rpc(consulta(q, [{ type: 'integer', value: '0' }]))).filas).toEqual([{ sin_dato: null, cero: 0 }]);
  });
  it('Given filtro sin coincidencias, When consulta, Then devuelve vacío verificado', async () => {
    const q = query([projection(col('j', 'costo'), 'costo')], view('v_esco_jornales', 'j'));
    select(q).where = binary('>=', col('j', 'fecha'), param(0));
    expect(await rpc(consulta(q, [{ type: 'date', value: '2100-01-01' }]))).toEqual({ filas: [], n_filas: 0, truncado: false });
  });
  it('Given 501 filas sintéticas, When no fija LIMIT, Then devuelve500 y truncado real', async () => {
    const q = query([projection(col('i', 'cantidad_actual'), 'cantidad')], view('v_esco_inventario', 'i'));
    q.orderBy = [{ expr: col('i', 'cantidad_actual'), direction: 'asc', nulls: 'last' }];
    const r = await rpc(consulta(q)); expect(r.n_filas).toBe(500); expect(r.truncado).toBe(true); expect(r.filas).toHaveLength(500); expect(r.filas[499]).toEqual({ cantidad: 500 });
  });
  it('Given agregaciones por fecha y dos CTE, When hace JOIN de resultados agregados, Then conserva los totales por clave', async () => {
    const j = query([projection(col('j', 'fecha'), 'fecha'), projection(aggregate('sum', [col('j', 'costo')]), 'total')], view('v_esco_jornales', 'j')); select(j).groupBy = [col('j', 'fecha')];
    const g = query([projection(col('g', 'fecha'), 'fecha'), projection(aggregate('sum', [col('g', 'valor')]), 'total')], view('v_esco_gastos', 'g')); select(g).groupBy = [col('g', 'fecha')];
    const q = query([projection(col('jj', 'fecha'), 'fecha'), projection(col('jj', 'total'), 'costo'), projection(col('gg', 'total'), 'gasto')], { kind: 'cte', name: 'jornales_dia', alias: 'jj' });
    q.with = [{ name: 'jornales_dia', query: j }, { name: 'gastos_dia', query: g }];
    select(q).joins = [{ type: 'left', source: { kind: 'cte', name: 'gastos_dia', alias: 'gg' }, on: binary('=', col('jj', 'fecha'), col('gg', 'fecha')) }];
    q.orderBy = [{ expr: col('jj', 'fecha'), direction: 'asc', nulls: 'last' }];
    expect((await rpc(consulta(q))).filas).toEqual([{ fecha: '2026-10-01', costo: 10, gasto: 100 }, { fecha: '2026-10-02', costo: null, gasto: null }]);
  });
  it('Given UNION ALL y orden por alias de salida, When consulta, Then usa el mismo esquema de salida', async () => {
    const q: QueryNode = { with: [], body: { kind: 'union_all', left: query([projection(param(0), 'valor')]), right: query([projection(param(1), 'valor')]) }, orderBy: [{ expr: salida('valor'), direction: 'asc', nulls: 'last' }] };
    expect((await rpc(consulta(q, [{ type: 'integer', value: '2' }, { type: 'integer', value: '1' }]))).filas).toEqual([{ valor: 1 }, { valor: 2 }]);
  });
  it('Given subconsulta relacional validada, When proyecta su alias, Then conserva la cifra', async () => {
    const q = query([projection(col('s', 'valor'), 'valor')], { kind: 'subquery', alias: 's', query: query([projection(param(0), 'valor')]) });
    expect((await rpc(consulta(q, [{ type: 'integer', value: '7' }]))).filas).toEqual([{ valor: 7 }]);
  });
  it('Given agregación FILTER sobre campos nulos, When cuenta, Then distingue población y dato disponible', async () => {
    const filtrado: ExprNode = { kind: 'aggregate', fn: 'count', args: [], star: true, distinct: false, filter: { kind: 'is_null', arg: col('j', 'costo'), not: true } };
    const q = query([projection(aggregate('count', [], true), 'filas'), projection(filtrado, 'con_costo'), projection(aggregate('sum', [col('j', 'jornales')]), 'jornales')], view('v_esco_jornales', 'j'));
    expect((await rpc(consulta(q))).filas).toEqual([{ filas: 2, con_costo: 1, jornales: 1.5 }]);
  });
  it('Given funciones del catálogo y CASE sobre NULL, When RPC real, Then conserva la semántica SQL', async () => {
    const q = query([projection({ kind: 'call', fn: 'coalesce', args: [col('j', 'costo'), param(0)] }, 'costo'), projection({ kind: 'case', branches: [{ when: { kind: 'is_null', arg: col('j', 'costo'), not: false }, then: param(1) }], else: param(2) }, 'estado')], view('v_esco_jornales', 'j'));
    q.orderBy = [{ expr: col('j', 'fecha'), direction: 'asc', nulls: 'last' }];
    expect((await rpc(consulta(q, [{ type: 'integer', value: '0' }, { type: 'text', value: 'Sin dato' }, { type: 'text', value: 'Con dato' }]))).filas).toEqual([{ costo: 10, estado: 'Con dato' }, { costo: 0, estado: 'Sin dato' }]);
  });
  it('Given funciones numéricas y texto registradas, When RPC real, Then sus valores son correctos', async () => {
    const q = query([projection({ kind: 'call', fn: 'round', args: [{ kind: 'call', fn: 'abs', args: [param(0)] }, param(1)] }, 'redondeado'), projection({ kind: 'call', fn: 'lower', args: [{ kind: 'call', fn: 'btrim', args: [param(2)] }] }, 'texto'), projection({ kind: 'call', fn: 'nullif', args: [param(1), param(1)] }, 'sin_dato')]);
    expect((await rpc(consulta(q, [{ type: 'numeric', value: '-12.345' }, { type: 'integer', value: '2' }, { type: 'text', value: '  AbC  ' }]))).filas).toEqual([{ redondeado: 12.35, texto: 'abc', sin_dato: null }]);
  });
  it('Given fechas de calendario y funciones registradas, When agrupa por mes, Then no cambia el mes', async () => {
    const q = query([projection({ kind: 'extract', field: 'month', arg: col('j', 'fecha') }, 'mes'), projection({ kind: 'date_trunc', unit: 'month', arg: col('j', 'fecha') }, 'inicio')], view('v_esco_jornales', 'j'));
    const r = await rpc(consulta(q)); expect(r.filas).toHaveLength(2);
    expect(r.filas.every((fila) => fila.mes === 10 && String(fila.inicio).startsWith('2026-10-01'))).toBe(true);
  });
  it('Given DISTINCT y LIMIT/OFFSET, When RPC real, Then aplica los límites al conjunto consultado', async () => {
    const q = query([projection(col('j', 'lote'), 'lote')], view('v_esco_jornales', 'j')); select(q).distinct = true;
    expect((await rpc(consulta(q))).filas).toEqual([{ lote: 'Parcela A' }]);
    const detalle = query([projection(col('j', 'costo'), 'costo')], view('v_esco_jornales', 'j'));
    detalle.orderBy = [{ expr: col('j', 'fecha'), direction: 'asc', nulls: 'last' }]; detalle.offset = 1; detalle.limit = 1;
    expect((await rpc(consulta(detalle))).filas).toEqual([{ costo: null }]);
    detalle.limit = 0; expect((await rpc(consulta(detalle))).filas).toEqual([]);
  });
  it('Given agregación y HAVING, When RPC real, Then filtra el resultado agregado sin cambiar su total', async () => {
    const q = query([projection(col('j', 'lote'), 'lote'), projection(aggregate('sum', [col('j', 'jornales')]), 'jornales')], view('v_esco_jornales', 'j'));
    select(q).groupBy = [col('j', 'lote')]; select(q).having = binary('>=', aggregate('sum', [col('j', 'jornales')]), param(0));
    expect((await rpc(consulta(q, [{ type: 'numeric', value: '1.5' }]))).filas).toEqual([{ lote: 'Parcela A', jornales: 1.5 }]);
  });
  it('Given SQL agregado conocido, When parser→RPC real, Then conserva resultado útil sin divergencia de límites', async () => {
    const ir = convertirSqlSeguro('SELECT coalesce(sum(CASE WHEN jornales > 0 THEN jornales ELSE NULL END) FILTER (WHERE costo > 0), 0) / nullif(count(*), 0) AS media FROM v_esco_jornales');
    expect((await rpc(ir)).filas).toEqual([{ media: 0.5 }]);
  });
  it('Given SQL CTE y JOIN admitido por parser, When RPC real, Then conserva agregación por clave', async () => {
    const sql = 'WITH j AS (SELECT fecha, sum(costo) AS total FROM v_esco_jornales GROUP BY fecha), g AS (SELECT fecha, sum(valor) AS total FROM v_esco_gastos GROUP BY fecha) SELECT j.fecha, j.total AS costo, g.total AS gasto FROM j LEFT JOIN g ON j.fecha = g.fecha ORDER BY j.fecha';
    expect((await rpc(convertirSqlSeguro(sql))).filas).toEqual([{ fecha: '2026-10-01', costo: 10, gasto: 100 }, { fecha: '2026-10-02', costo: null, gasto: null }]);
  });
  it('Given SQL con decimal exacto y bigint, When parser→RPC real y salida textual, Then conserva todos sus dígitos', async () => {
    const ir = convertirSqlSeguro('SELECT 9007199254740993::text AS entero, 0.123456789012345678::text AS decimal');
    expect((await rpc(ir)).filas).toEqual([{ entero: '9007199254740993', decimal: '0.123456789012345678' }]);
  });
  it('Given SQL de fechas e intervalos, When parser→RPC real, Then conserva el día calendario', async () => {
    const ir = convertirSqlSeguro("SELECT (fecha + INTERVAL '1 day')::text AS siguiente FROM v_esco_jornales WHERE fecha < DATE '2026-11-01' + INTERVAL '1 month' ORDER BY fecha");
    expect((await rpc(ir)).filas).toEqual([{ siguiente: '2026-10-02 00:00:00' }, { siguiente: '2026-10-03 00:00:00' }]);
  });
  it('Given timestamp derivado en CTE, When parser→RPC real aplica date_trunc, Then conserva tipo nativo sin zona añadida', async () => {
    const sql = "WITH s AS (SELECT fecha + INTERVAL '1 day' AS siguiente FROM v_esco_jornales) SELECT date_trunc('month', siguiente)::text AS inicio FROM s";
    expect((await rpc(convertirSqlSeguro(sql))).filas).toEqual([{ inicio: '2026-10-01 00:00:00' }, { inicio: '2026-10-01 00:00:00' }]);
  });
  it.each(['web', 'servicio'])('Given cadena HTTP %s completa, When parser→RPC/migración reales→visual, Then conserva actor y contratoP2/P3', async (canal) => {
    const uso = { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 };
    const llm = (texto: string, llamadas: RespuestaLLM['llamadas'] = []): RespuestaLLM => ({ texto, llamadas, uso, ms: 1, modelo: 'fixture', finishReason: llamadas.length ? 'tool_calls' : 'stop' });
    const cola = [llm('', [{ nombre: 'consultar_sql', argumentos: JSON.stringify({ sql: 'SELECT sum(jornales) AS total FROM v_esco_jornales', proposito: 'Total sintético' }) }]), llm('', [{ nombre: 'mostrar_visual', argumentos: JSON.stringify({ tipo: 'tarjeta', consulta: 1, items: [{ etiqueta: 'Jornales', columna: 'total', formato: 'numero' }] }) }]), llm(JSON.stringify({ texto: 'Total disponible', sugerencias: ['Ver detalle'] }))];
    const llamadasRpc: string[] = [];
    const cliente = {
      auth: { getUser: async () => ({ data: { user: { id: A } }, error: null }) },
      from: (tabla: string) => {
        if (tabla !== 'usuarios') throw new Error('Fixture perfil usa solo usuarios');
        return { select: () => ({ eq: async (_clave: string, uid: string) => ({ data: (await db.query('select id,rol,activo from usuarios where id=$1', [uid])).rows, error: null }) }) };
      },
      rpc: async (nombre: string, args: Record<string, unknown>) => {
        llamadasRpc.push(nombre);
        try {
          if (nombre === 'esco_sql_consultar_v1') return { data: await rpc(args.p_consulta), error: null };
          if (nombre === 'esco_sql_consultar_actor_v1') return { data: await actor(args.p_consulta, String(args.p_usuario)), error: null };
          throw new Error('Fixture no admite RPC fuera del contrato P4');
        } catch (error) { return { data: null, error }; }
      },
    } as unknown as ClienteUsuario;
    const env: Record<string, string> = { OPENROUTER_API_KEY: 'fixture', SUPABASE_URL: 'http://local', SUPABASE_ANON_KEY: 'fixture', SUPABASE_SERVICE_ROLE_KEY: 'service-fixture', ESCO_TELEGRAM_SECRET: 'secret-fixture' };
    const deps: Dependencias = { env: (n) => env[n], crearClienteUsuario: () => cliente, crearClienteServicio: () => cliente, crearLLM: () => ({ completar: async () => { const r = cola.shift(); if (!r) throw new Error('Fixture agotada'); return r; } }), ahora: () => new Date('2026-11-09T17:00:00Z') };
    const servicio = canal === 'servicio';
    const res = await manejar(new Request('http://local/esco-consultas', { method: 'POST', headers: { 'content-type': 'application/json', authorization: servicio ? 'Bearer service-fixture' : 'Bearer usuario-fixture', ...(servicio ? { 'x-esco-telegram-secret': 'secret-fixture' } : { accept: 'text/event-stream' }) }, body: JSON.stringify({ motor: 'sql', pregunta: 'Control sintético', ...(servicio ? { usuario_id: B } : {}) }) }), deps);
    expect(res.status).toBe(200);
    let resultado: Record<string, unknown>;
    if (servicio) resultado = await res.json() as Record<string, unknown>;
    else {
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const eventos = (await res.text()).split('\n\n').filter(Boolean).map((frame) => JSON.parse(frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')) as Record<string, unknown>);
      expect(eventos.map((evento) => evento.type)).toEqual(['consulta_inicio', 'consulta_fin', 'texto', 'bloques', 'sugerencias', 'done']);
      resultado = eventos[eventos.length - 1].resultado as Record<string, unknown>;
    }
    expect(resultado).toMatchObject({ motor: 'sql', texto: 'Total disponible', respuesta: 'Total disponible', bloques: [{ tipo: 'tarjeta', consulta: 1, items: [{ columna: 'total', valor: servicio ? 2 : 1.5 }] }] });
    expect(JSON.stringify(resultado.consultas)).not.toContain('filas_muestra');
    expect(llamadasRpc).toEqual([servicio ? 'esco_sql_consultar_actor_v1' : 'esco_sql_consultar_v1']);
  });
  it.each([ADMIN, INACTIVO])('Given actor sin Gerencia activa, When usa RPC web y actor, Then ambas rechazan42501', async (uid) => {
    const ir = consulta(query([projection(param(0), 'valor')]), [{ type: 'integer', value: '1' }]);
    await expect(rpc(ir, uid)).rejects.toMatchObject({ code: '42501' });
    await expect(actor(ir, uid)).rejects.toMatchObject({ code: '42501' });
  });
  it('Given migración local nueva, When comprueba permisos de rolesapp, Then RPC192 está cerrada y actor es solo servicio', async () => {
    const r = await db.query<{ rol: string; anterior: boolean; actor: boolean }>("select rol,has_function_privilege(rol,'public.esco_sql_lectura(text)','execute') anterior,has_function_privilege(rol,'public.esco_sql_consultar_actor_v1(uuid,jsonb)','execute') actor from (values('anon'),('authenticated'),('service_role')) r(rol)");
    expect(r.rows).toEqual([{ rol: 'anon', anterior: false, actor: false }, { rol: 'authenticated', anterior: false, actor: false }, { rol: 'service_role', anterior: false, actor: true }]);
  });
  it.each([
    ['versión', (ir: Record<string, unknown>) => ({ ...ir, version: 2 })],
    ['propiedad raíz', (ir: Record<string, unknown>) => ({ ...ir, extra: true })],
    ['nodo desconocido', (ir: Record<string, unknown>) => ({ ...ir, query: { with: [], body: { kind: 'unknown' }, orderBy: [] } })],
    ['función no catalogada', (ir: Record<string, unknown>) => ({ ...ir, query: query([projection({ kind: 'call', fn: 'funcion_desconocida', args: [] } as unknown as ExprNode, 'valor')]) })],
    ['parámetro inexistente', (ir: Record<string, unknown>) => ({ ...ir, params: [] })],
    ['texto largo', (ir: Record<string, unknown>) => ({ ...ir, params: [{ type: 'text', value: 'x'.repeat(4001) }] })],
    ['tipo desconocido', (ir: Record<string, unknown>) => ({ ...ir, params: [{ type: 'tipo_desconocido', value: '1' }] })],
    ['relación fuera de catálogo', (ir: Record<string, unknown>) => ({ ...ir, query: query([projection(col('j', 'valor'), 'valor')], view('tabla_desconocida', 'j')) })],
    ['columna fuera de catálogo', (ir: Record<string, unknown>) => ({ ...ir, query: query([projection(col('j', 'columna_desconocida'), 'valor')], view('v_esco_jornales', 'j')) })],
    ['alias no textual', (ir: Record<string, unknown>) => { const q = query([projection(param(0), 'valor')]); select(q).columns[0].alias = 7 as unknown as string; return { ...ir, query: q }; }],
    ['entero no canónico', (ir: Record<string, unknown>) => ({ ...ir, params: [{ type: 'integer', value: '1.0' }] })],
    ['unidad de intervalo nula', (ir: Record<string, unknown>) => ({ ...ir, params: [{ type: 'interval', value: { quantity: '1', unit: null } }] })],
    ['proyección vacía', (ir: Record<string, unknown>) => ({ ...ir, query: query([]) })],
  ])('Given IR inválida por %s, When llama directamente RPC sinparser, Then22023', async (_nombre, cambiar) => {
    const ir = consulta(query([projection(param(0), 'valor')]), [{ type: 'integer', value: '1' }]);
    await expect(rpc(cambiar(ir as unknown as Record<string, unknown>))).rejects.toMatchObject({ code: '22023' });
  });
});
