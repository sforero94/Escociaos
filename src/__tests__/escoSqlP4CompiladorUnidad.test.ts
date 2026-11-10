import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import catalogo from '../utils/escoSql/catalogoConsulta.json';
const migracion = readFileSync(new URL('../sql/migrations/194_esco_sql_ejecutor_compartido.sql', import.meta.url), 'utf8');
const tipos: Record<string, string> = { boolean: 'boolean', integer: 'integer', bigint: 'bigint', numeric: 'numeric', text: 'text', date: 'date', timestamptz: 'timestamptz', timestamp: 'timestamp', uuid: 'uuid', interval: 'interval' };
let db: PGlite;
const q = (columns: unknown[], rest = {}) => ({ version: 1, params: [], query: { with: [], body: { kind: 'select', distinct: false, columns, joins: [], groupBy: [], ...rest }, orderBy: [] } });
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$; create function public.get_user_role() returns text language sql as $$ select 'Gerencia'::text $$; create function public.esco_sql_lectura(text) returns jsonb language sql as $$select '{}'::jsonb$$;");
  for (const v of catalogo.views) await db.exec(`create view public.${v.name} with (security_invoker=true) as select ${v.columns.map((c) => `null::${tipos[c.type]} as "${c.name}"`).join(',')}`);
  await db.exec(migracion);
});
afterAll(async () => { await db?.close(); });
async function compilar(value: unknown) { return (await db.query<{ sql: string }>('select esco_sql_privado.compilar_consulta($1::jsonb) as sql', [JSON.stringify(value)])).rows[0].sql; }
it('compila parámetros enlazados sin interpolar su contenido en SQL', async () => {
  const doc = { ...q([{ alias: 'texto', expr: { kind: 'param', index: 0 } }]), params: [{ type: 'text', value: "Una etiqueta con ' comillas" }] };
  const sql = await compilar(doc);
  expect(sql).not.toContain(doc.params[0].value);
  expect((await db.query(sql, [JSON.stringify(doc.params)])).rows).toEqual([{ texto: doc.params[0].value }]);
});
it('compila una proyección de vista registrada y preserva valores nulos', async () => {
  const sql = await compilar(q([{ alias: 'dato', expr: { kind: 'column', source: 'j', name: 'jornales' } }], { from: { kind: 'view', name: 'v_esco_jornales', alias: 'j' } }));
  expect((await db.query(sql)).rows).toEqual([{ dato: null }]);
});
it.each([
  { ...q([{ alias: 'n', expr: { kind: 'null' } }]), extra: true },
  q([{ alias: 'n', expr: { kind: 'desconocido' } }]),
  q([{ alias: 'n', expr: { kind: 'column', source: 'x', name: 'inexistente' } }], { from: { kind: 'view', name: 'v_esco_jornales', alias: 'x' } }),
  q([{ alias: 'n', expr: { kind: 'null' } }], { from: { kind: 'view', name: 'relacion_no_registrada', alias: 'x' } }),
])('rechaza estructuras fuera del contrato antes de compilar', async (doc) => { await expect(compilar(doc)).rejects.toMatchObject({ code: '22023' }); });
