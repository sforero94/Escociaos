// Last actual observation differs from a later synthetic "not reviewed" combination.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, ID, request } from './esco2P2Harness.ts';
import { monQaDb, monQaSeed, MON } from './esco2P4Task1QaHarness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await monQaDb(); }, 30_000);
beforeEach(async () => { await monQaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
async function run(plaga_ids: string[] = [MON.pest1], extra: Record<string, unknown> = {}) {
  const h = dependencies(db, [{ nombre: 'consultar_monitoreo', argumentos: JSON.stringify({ ronda_ids: [MON.r1, MON.last], lote_ids: [ID.l1], sublote_ids: [MON.s1], plaga_ids, agrupar_por: ['sublote'], analisis: { ultima_por_entidad: true, agrupar_por: ['sublote', 'plaga'] }, ...extra }) }]);
  const response = await manejar(request({ pregunta: 'Última observación disponible por sublote y plaga' }), h.deps);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.resultados).toHaveLength(1);
  return body.resultados[0];
}

describe('M6 QA: latest monitoring observation versus later empty combinations', () => {
  it('selects the prior actual observation instead of a later not-reviewed placeholder', async () => {
    const r = await run();
    const gap = await db.query<{ n: number }>('select count(*)::int n from monitoreos where ronda_id=$1 and lote_id=$2 and sublote_id=$3 and plaga_enfermedad_id=$4', [MON.last, ID.l1, MON.s1, MON.pest1]);
    expect(gap.rows[0].n).toBe(0);
    expect(r.analisis.filas).toHaveLength(1);
    expect(r.analisis.filas[0].clave).toContain(MON.r1);
    expect(r.analisis.filas[0].metricas.incidencia.estado).toBe('completo');
    expect(Math.abs(r.analisis.filas[0].metricas.incidencia.valor - 100 / 6)).toBeLessThanOrEqual(4 * Number.EPSILON * (100 / 6));
  });

  it('keeps a latest actual incompatible observation instead of substituting an older valid value', async () => {
    await db.query("insert into monitoreos values('74000000-0000-4000-8000-000000000012',$1,'2026-10-10',$2,$3,$4,0,0)", [MON.last, ID.l1, MON.s1, MON.pest1]);
    const r = await run();
    expect(r.analisis.filas).toHaveLength(1);
    expect(r.analisis.filas[0].clave).toContain(MON.last);
    expect(r.analisis.filas[0].metricas.incidencia.valor).toBeNull();
    expect(r.analisis.estado).toBe('parcial');
  });

  it('preserves a never-observed combination separately as unknown rather than dropping it or showing zero', async () => {
    const never = '73000000-0000-4000-8000-000000000004';
    await db.query("insert into plagas_enfermedades_catalogo values($1,'QA Nunca observada')", [never]);
    const r = await run([MON.pest1, never]);
    expect(r.analisis.filas).toHaveLength(2);
    const absent = r.analisis.filas.find((f: { clave: string }) => f.clave.includes(never));
    expect(absent).toBeDefined();
    expect(absent.metricas.incidencia).toMatchObject({ valor: null, estado: 'sin_dato' });
    const actual = r.analisis.filas.find((f: { clave: string }) => f.clave.includes(MON.pest1));
    expect(actual.clave).toContain(MON.r1);
    expect(Math.abs(actual.metricas.incidencia.valor - 100 / 6)).toBeLessThanOrEqual(4 * Number.EPSILON * (100 / 6));
  });

  it('selects the latest actual round before the thirty-row detail cap can hide it', async () => {
    await db.exec('truncate rondas_monitoreo,monitoreos;');
    await db.exec(`insert into rondas_monitoreo select ('71000000-0000-4000-8000-'||lpad((100+g)::text,12,'0'))::uuid,'QA Ronda '||g,date '2026-10-01'+g-1,date '2026-10-01'+g-1 from generate_series(1,31)g`);
    await db.query(`insert into monitoreos select ('74000000-0000-4000-8000-'||lpad((100+g)::text,12,'0'))::uuid,('71000000-0000-4000-8000-'||lpad((100+g)::text,12,'0'))::uuid,date '2026-10-01'+g-1,$1,$2,$3,100,g from generate_series(1,31)g`, [ID.l1, MON.s1, MON.pest1]);
    const r = await run([MON.pest1], { ronda_ids: undefined, seleccion_ronda: 'todas', desde: '2026-10-01', hasta: '2026-10-31' });
    expect(r.analisis.estado).toBe('ok');
    expect(r.analisis.filas).toHaveLength(1);
    expect(r.analisis.filas[0].clave).toContain('71000000-0000-4000-8000-000000000131');
    expect(r.analisis.filas[0].metricas.incidencia.valor).toBe(31);
  });
});
