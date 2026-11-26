// Migración 203 contra Postgres real (PGlite): es_ultima_ronda_lote en v_esco_monitoreo (ESCO-184).
// Carga las vistas de monitoreo de la 195 y encima el CREATE OR REPLACE de la 203, EXTRAÍDO del archivo.
// Caso que importa: la finca no se monitorea entera en una ronda. Datos 100 % sintéticos.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const M195 = readFileSync(new URL('../sql/migrations/195_esco_sql_hato_monitoreo_vistas.sql', import.meta.url), 'utf8');
const M203 = readFileSync(new URL('../sql/migrations/203_v_esco_monitoreo_ultima_ronda_lote.sql', import.meta.url), 'utf8');

function vista195(nombre: string): string {
  const m = new RegExp(`CREATE VIEW public\\.${nombre} WITH[\\s\\S]*?;\\n`).exec(M195);
  if (!m) throw new Error(`no encontré la vista ${nombre}`);
  return m[0];
}
function reemplazo203(): string {
  const m = /CREATE OR REPLACE VIEW public\.v_esco_monitoreo WITH[\s\S]*?;\n/.exec(M203);
  if (!m) throw new Error('no encontré el CREATE OR REPLACE de la 203');
  return m[0];
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const R1 = uuid(1), R2 = uuid(2);
const LA = uuid(11), LB = uuid(12), LC = uuid(13);
const PL = uuid(21);

const ESQUEMA = `
create table lotes (id uuid primary key, nombre text);
create table sublotes (id uuid primary key, nombre text);
create table rondas_monitoreo (id uuid primary key, nombre text, fecha_inicio date, fecha_fin date);
create table plagas_enfermedades_catalogo (id uuid primary key, nombre text, tipo text);
create table monitoreos (id uuid primary key default gen_random_uuid(), ronda_id uuid, lote_id uuid, sublote_id uuid, plaga_enfermedad_id uuid,
  fecha_monitoreo date, arboles_afectados int, arboles_monitoreados int);
insert into lotes values ('${LA}', 'Lote A'), ('${LB}', 'Lote B'), ('${LC}', 'Lote C');
insert into plagas_enfermedades_catalogo values ('${PL}', 'Trips', 'plaga');
insert into rondas_monitoreo values ('${R1}', 'Ronda 1', '2026-10-01', '2026-10-05'), ('${R2}', 'Ronda 2', '2026-11-01', null);
insert into monitoreos(ronda_id, lote_id, plaga_enfermedad_id, fecha_monitoreo, arboles_afectados, arboles_monitoreados) values
  ('${R1}', '${LA}', '${PL}', '2026-10-02', 2, 20),
  ('${R2}', '${LA}', '${PL}', '2026-11-03', 1, 20),
  ('${R1}', '${LB}', '${PL}', '2026-10-03', 4, 20),
  (null,    '${LB}', '${PL}', '2026-11-20', 9, 20),
  (null,    '${LC}', '${PL}', '2026-11-21', 9, 20);
`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(ESQUEMA);
  for (const n of ['v_esco_monitoreo', 'v_esco_monitoreo_ronda_plaga']) await db.exec(vista195(n));
  await db.exec(reemplazo203());
}, 60000);
afterAll(async () => { await db.close(); });

type Fila = { lote: string; ronda: string | null; es_ultima_ronda: boolean; es_ultima_ronda_lote: boolean };
const marcadas = async () =>
  (await db.query<Fila>('select lote, ronda, es_ultima_ronda, es_ultima_ronda_lote from v_esco_monitoreo order by lote, ronda nulls last')).rows;

describe('203 · es_ultima_ronda_lote', () => {
  it('cada lote marca su propia ronda más reciente con lectura', async () => {
    const f = await marcadas();
    const porLote = (l: string) => f.filter((x) => x.lote === l && x.es_ultima_ronda_lote).map((x) => x.ronda);
    expect(porLote('Lote A')).toEqual(['Ronda 2']);
    expect(porLote('Lote B')).toEqual(['Ronda 1']);
  });

  it('una lectura sin ronda nunca queda marcada, aunque sea la más nueva del lote', async () => {
    const f = await marcadas();
    expect(f.filter((x) => x.ronda === null).every((x) => !x.es_ultima_ronda_lote)).toBe(true);
    expect(f.filter((x) => x.lote === 'Lote C').some((x) => x.es_ultima_ronda_lote)).toBe(false);
  });

  it('es_ultima_ronda (finca) no cambia: solo la Ronda 2', async () => {
    const r = await db.query<{ ronda: string }>('select distinct ronda from v_esco_monitoreo where es_ultima_ronda');
    expect(r.rows.map((x) => x.ronda)).toEqual(['Ronda 2']);
  });

  it('empate de fecha: gana el ronda_id mayor', async () => {
    const R3 = uuid(3);
    await db.exec(`insert into rondas_monitoreo values ('${R3}', 'Ronda 3', '2026-10-20', null);
      insert into monitoreos(ronda_id, lote_id, plaga_enfermedad_id, fecha_monitoreo, arboles_afectados, arboles_monitoreados)
      values ('${R3}', '${LB}', '${PL}', '2026-10-03', 0, 20);`);
    const f = await marcadas();
    expect(f.filter((x) => x.lote === 'Lote B' && x.es_ultima_ronda_lote).map((x) => x.ronda)).toEqual(['Ronda 3']);
    await db.exec(`delete from monitoreos where ronda_id = '${R3}'; delete from rondas_monitoreo where id = '${R3}';`);
  });

  it('la columna nueva es la última y las 19 de la 195 conservan su orden', async () => {
    const r = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'v_esco_monitoreo' order by ordinal_position");
    const cols = r.rows.map((x) => x.column_name);
    expect(cols).toHaveLength(20);
    expect(cols[18]).toBe('es_ultima_ronda');
    expect(cols[19]).toBe('es_ultima_ronda_lote');
  });

  it('v_esco_monitoreo_ronda_plaga sigue respondiendo', async () => {
    const r = await db.query<{ n: number }>('select count(*)::int n from v_esco_monitoreo_ronda_plaga');
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});

describe('203 · contrato del archivo', () => {
  const sinComentarios = M203.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  it('está escrita y sin aplicar, con CREATE OR REPLACE y la guarda de md5', () => {
    expect(M203).toMatch(/ESCRITA, SIN APLICAR/);
    expect(sinComentarios).toMatch(/CREATE OR REPLACE VIEW public\.v_esco_monitoreo WITH \(security_invoker = true\)/);
    expect(sinComentarios).toMatch(/md5\(pg_get_viewdef\('public\.v_esco_monitoreo'::regclass, true\)\)/);
  });

  it('no escribe datos ni borra objetos fuera de la tabla temporal', () => {
    expect(sinComentarios).not.toMatch(/\b(INSERT INTO|UPDATE public|DELETE FROM)\b/i);
    const drops = [...sinComentarios.matchAll(/^\s*DROP\s+(\w+)\s+([\w.]+)/gim)].map((m) => `${m[1]} ${m[2]}`);
    expect(drops).toEqual(['TABLE _m203_base']);
    expect(sinComentarios).not.toMatch(/CASCADE/i);
  });
});
