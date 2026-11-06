// Independent close-out oracle: the complete HTTP response, not only its text, is bounded.
// Literal synthetic SQL fixture; expected rows/counts do not call the monitoring executor.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, ID, request } from './esco2P2Harness.ts';
import { monQaDb } from './esco2P4Task1QaHarness.ts';

let db: PGlite;
const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const round = (n: number) => uuid('61000000', n);
const sublot = (n: number) => uuid('62000000', n);
const pest = (n: number) => uuid('63000000', n);
beforeAll(async () => { forbidNetwork(); db = await monQaDb(); }, 30000);
beforeEach(async () => {
  await db.exec(`
    truncate rondas_monitoreo,sublotes,plagas_enfermedades_catalogo,monitoreos;
    insert into rondas_monitoreo
      select ('61000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Ronda sintética '||i,'2026-10-01','2026-10-02' from generate_series(1,50) i;
    insert into sublotes
      select ('62000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${ID.l1}','Sublote sintético '||i from generate_series(1,20) i;
    insert into plagas_enfermedades_catalogo
      select ('63000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Plaga sintética '||i from generate_series(1,20) i;
    insert into monitoreos
      select ('64000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${round(1)}','2026-10-02','${ID.l1}','${sublot(1)}',('63000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,100,1 from generate_series(1,20) i;
  `);
});
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });

async function execute(extra: Record<string, unknown> = {}) {
  const pregunta = 'Muestra incidencia y gravedad de todas las rondas y plagas, separadas por sublote';
  const calls = [{ nombre: 'consultar_monitoreo', argumentos: JSON.stringify({ seleccion_ronda: 'todas', agrupar_por: ['sublote'], parte_ids: ['s1'], cobertura: { version: 1, partes: [{ id: 's1', texto: pregunta, capacidad: 'monitoreo', disposicion: 'consultar' }] }, ...extra }) }];
  const h = dependencies(db, calls, { modoCobertura: 'obligatoria' });
  const response = await manejar(request({ pregunta }), h.deps);
  const raw = await response.text();
  return { ...h, response, raw, body: JSON.parse(raw) };
}

describe('M5 close-out independent QA: bounded monitoring construction and HTTP output', () => {
  it('bounds the synthetic 50×20×20 product to thirty structured rows and a compact full HTTP body', async () => {
    const h = await execute();
    expect(h.response.status).toBe(200);
    expect(h.body.origen).toBe('determinista');
    expect(h.body.resultados).toHaveLength(1);
    const r = h.body.resultados[0];
    expect(r.filas).toHaveLength(30);
    expect(r.detalle).toEqual({ filas_totales: 20000, filas_mostradas: 30, limitado: true });
    expect(new TextEncoder().encode(h.raw).byteLength).toBeLessThan(256 * 1024);
    expect(h.body.respuesta).toMatch(/Se muestran 30 de 20\.000 filas/);
    expect(h.body.cobertura.partes[0]).toMatchObject({ capacidad: 'monitoreo', disposicion: 'respondida', resultado_ids: ['p1'] });
    expect(h.body.respuesta).not.toContain('No tengo todos los datos necesarios');
    // First thirty rows follow the original round/pest/sublote order, with exact values.
    expect(r.filas[0]).toMatchObject({ ronda_id: round(1), plaga_id: pest(1), sublote_id: sublot(1), afectados: 1, muestreados: 100, incidencia: 1, gravedad: 'Baja', observaciones: 1, fechas: ['2026-10-02'] });
    expect(r.filas[19]).toMatchObject({ ronda_id: round(1), plaga_id: pest(1), sublote_id: sublot(20), estado: 'no_revisado', incidencia: null, gravedad: null });
    expect(r.filas[20]).toMatchObject({ ronda_id: round(1), plaga_id: pest(2), sublote_id: sublot(1), afectados: 1, muestreados: 100, incidencia: 1 });
    expect(r.filas[29]).toMatchObject({ ronda_id: round(1), plaga_id: pest(2), sublote_id: sublot(10), estado: 'no_revisado', incidencia: null });
    expect(r.excluidos).toEqual({ sin_ronda: 0, padre_no_visible: 0, incompatibles: 0 });
  });

  it('preserves a complete selection below the limit and keeps unobserved combinations distinct from explicit zero', async () => {
    await db.query('update monitoreos set arboles_afectados=0 where plaga_enfermedad_id=$1', [pest(1)]);
    const h = await execute({ seleccion_ronda: undefined, ronda_ids: [round(1)], plaga_ids: [pest(1)] });
    const r = h.body.resultados[0];
    expect(r.filas).toHaveLength(20);
    expect(r.detalle).toEqual({ filas_totales: 20, filas_mostradas: 20, limitado: false });
    expect(r.filas[0]).toMatchObject({ estado: 'ok', afectados: 0, incidencia: 0, gravedad: 'Baja' });
    expect(r.filas[1]).toMatchObject({ estado: 'no_revisado', afectados: null, muestreados: null, incidencia: null, gravedad: null });
    expect(h.body.respuesta).not.toMatch(/Se muestran 30 de/);
    expect(h.body.respuesta).toContain('no revisado');
  });

  it('counts incompatible observations beyond the displayed prefix and preserves the partial source warning', async () => {
    await db.query(`insert into monitoreos values($1,$2,'2026-10-02',$3,$4,$5,0,1)`, [uuid('64000000', 100), round(50), ID.l1, sublot(20), pest(20)]);
    const h = await execute();
    const r = h.body.resultados[0];
    expect(r.filas).toHaveLength(30);
    expect(r.detalle).toEqual({ filas_totales: 20000, filas_mostradas: 30, limitado: true });
    expect(r.estado).toBe('parcial');
    expect(r.excluidos.incompatibles).toBe(1);
    expect(h.body.cobertura.partes[0]).toMatchObject({ disposicion: 'fuente_no_disponible', parcial: true });
    expect(h.body.respuesta).toContain('observaciones incompatibles');
  });
});
