// Independent population evidence through HTTP, real readers and synthetic SQL/RLS.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, ID, plan, request, tool } from './esco2P2Harness.ts';
import { hatoQaDb, hatoQaSeed, HATO_QA } from './esco2P4Task4QaHarness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await hatoQaDb(); }, 30_000);
beforeEach(async () => { await hatoQaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
async function herd(args: Record<string, unknown>) {
  const h = dependencies(db, [{ nombre: 'consultar_hato', argumentos: JSON.stringify(args) }], { ahora: () => new Date('2026-11-05T17:00:00Z') });
  const response = await manejar(request({ pregunta: 'Consulta sintética de población de animales visible' }), h.deps);
  expect(response.status).toBe(200);
  return { body: await response.json(), h };
}

describe('M6 QA: selected, excluded, unknown and verified empty populations', () => {
  it('labels the selected labor universe and never reports excluded null-lot rows as an observed zero', async () => {
    const h = dependencies(db, [tool(plan({ lote_ids: [ID.l3], agrupar_por: ['lote'] }))]);
    const response = await manejar(request({ pregunta: 'Jornales del lote seleccionado' }), h.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resultados[0].total.jornales).toBe(0.75);
    expect(body.resultados[0].poblacion).toMatchObject({ universo: 'seleccion_efectiva', sin_lote: { estado: 'excluido', registros: null } });
    expect(body.resultados[0].poblacion.miembros).toEqual([ID.r4]);
    expect(body.respuesta.toLowerCase()).not.toMatch(/sin lote:\s*0(?:\D|$)/);
    expect(body.respuesta.toLowerCase()).toMatch(/seleccion|excluid/);
  });

  it('uses all visible animal IDs matching state despite duplicate names and tags elsewhere', async () => {
    const { body } = await herd({ poblacion: { estados: ['activa'] } });
    expect(body.resultados).toHaveLength(1);
    expect(body.resultados[0].filas.map((f: { animal_id: string }) => f.animal_id).sort()).toEqual([HATO_QA.main, HATO_QA.twinActive, HATO_QA.provisional, HATO_QA.calf].sort());
    expect(body.respuesta).not.toContain('NO PUBLICAR');
  });

  it('does not choose the active animal when a name or tag identifies multiple visible animals', async () => {
    for (const args of [{ nombres: ['QA Homónima'] }, { chapetas: [602] }]) {
      const { body } = await herd(args);
      expect(body.resultados[0].estado).toBe('no_resuelto');
      expect(body.resultados[0].filas).toEqual([]);
    }
  });

  it('preserves explicit animal identity across renumbering', async () => {
    const before = await herd({ animal_ids: [HATO_QA.twinActive] });
    await db.query('update hato_animales set numero=777 where id=$1', [HATO_QA.twinActive]);
    const after = await herd({ animal_ids: [HATO_QA.twinActive] });
    expect(before.body.resultados[0].filas[0].animal_id).toBe(HATO_QA.twinActive);
    expect(after.body.resultados[0].filas[0].animal_id).toBe(HATO_QA.twinActive);
    expect(after.body.resultados[0].filas[0].numero).toBe(777);
  });

  it('does not turn unknown farm membership into a verified empty farm population', async () => {
    // Every visible ficha has SQL NULL finca_id: the source does not establish membership.
    const { body } = await herd({ poblacion: { finca_ids: ['f9000000-0000-4000-8000-000000000001'] } });
    expect(body.resultados[0].estado).toBe('no_disponible');
    expect(body.resultados[0].filas).toEqual([]);
  });

  it('keeps presumed pregnancy distinct from confirmed pregnancy in a population filter', async () => {
    await db.query('delete from hato_eventos where id=$1', [HATO_QA.eventConfirmation]);
    const { body } = await herd({ poblacion: { estados_reproductivos: ['preñada'] } });
    expect(body.resultados[0].estado).toBe('vacio_verificado');
    expect(body.resultados[0].filas).toEqual([]);
  });

  it('does not resolve missing reproductive configuration to a zero-sized reproductive population', async () => {
    await db.exec("delete from hato_config where clave='meses_gestacion_default'");
    const { body } = await herd({ poblacion: { estados_reproductivos: ['preñada'] } });
    expect(body.resultados[0].estado).toBe('no_disponible');
    expect(body.resultados[0].filas).toEqual([]);
  });
});
