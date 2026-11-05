// Independent synthetic acceptance oracles frozen on main 88facd2e before P3 close repair.
// Integration: real HTTP handler + fixed readers + PGlite SQL/RLS + deterministic renderer.
// No private case, reference, source row, answer or trace is included here.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, request } from './esco2P2Harness.ts';
import { qaFaultClient, APPS, type QaProjection } from './esco2P3Task2QaHarness.ts';
import { task3QaDb, task3QaSeed, T3 } from './esco2P3Task3QaHarness.ts';
import type { LlamadaHerramienta } from '../utils/esco2/registro.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import type { Traza } from './esco2ArnesRls.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task3QaDb(); }, 30000);
beforeEach(async () => { await task3QaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
const tool = (nombre: string, argumentos: Record<string, unknown>): LlamadaHerramienta => ({ nombre, argumentos: JSON.stringify(argumentos) });
async function execute(calls: LlamadaHerramienta[], fault?: (table: string, response: RespuestaPostgrest) => RespuestaPostgrest) {
  const projections: QaProjection[] = [];
  const trace: Traza = { consultas: [] };
  const h = dependencies(db, calls, { crearClienteUsuario: jwt => qaFaultClient(db, jwt, trace, projections, fault) });
  const response = await manejar(request({ pregunta: 'Productos ejecutados y agua utilizada de la aplicación Líquido sintético' }), h.deps);
  return { ...h, response, body: await response.json(), projections, trace };
}
const quantity = () => tool('consultar_cantidades_aplicacion', { aplicacion_id: T3.liquid });
const explicitWaterAbsence = /(?:agua[^.\n]*(?:sin (?:dato|registro)|no (?:se |hay |est[aá] )?registr)|(?:no hay|sin) (?:un )?registro[^.\n]*agua)/i;

describe('P3 cierre QA: supported parts, explicit source limits and application identity', () => {
  it('Given recorded product execution and no direct water field, When quantities run, Then water absence is explicit and quantities remain substantive', async () => {
    const h = await execute([quantity()]);
    expect(h.response.status).toBe(200);
    expect(h.body.respuesta).toMatch(explicitWaterAbsence);
    expect(h.body.respuesta).toMatch(/0,01 L/);
    expect(h.body.respuesta).not.toMatch(/(?:agua[^.\n]*\b0 L|costo completo de producci[oó]n)/i);
    expect(h.body.resultados[0].ejecucion.filas[0].cantidad).toBe(0.01);
  });
  it('Given a saved mixture volume, When water is requested, Then mixture is not substituted for water', async () => {
    const h = await execute([quantity()]);
    expect(h.body.respuesta).toMatch(explicitWaterAbsence);
    expect(h.body.respuesta).toMatch(/3 L de mezcla/);
    expect(h.body.respuesta).not.toMatch(/3 L (?:de )?agua/i);
  });
  it('Given a failed movement read, When quantities run, Then no water or execution zero is fabricated', async () => {
    const h = await execute([quantity()], (table, response) => table === 'movimientos_diarios' ? { data: null, error: { message: 'synthetic failure' }, count: null } : response);
    expect(h.body.respuesta).toMatch(explicitWaterAbsence);
    expect(h.body.resultados[0].ejecucion.estado).not.toBe('ok');
    expect(h.body.respuesta).not.toMatch(/(?:agua[^.\n]*\b0 L|0 movimientos)/i);
  });
  it('Given an application with no linked task, When the planner receives its catalog, Then its own name and code are visible', async () => {
    const h = await execute([quantity()]);
    const system = h.solicitudes[0].mensajes.find(m => m.role === 'system')?.content ?? '';
    expect(system).toContain('Líquido sintético');
    expect(system).toContain('QA-D');
    expect(system).not.toContain('NO PUBLICAR PADRE OCULTO');
    expect(h.trace.consultas.every(x => x.rol === 'authenticated')).toBe(true);
  });
  it('Given a task and application with different labels, When planning starts, Then the application selector is not inferred from the task label', async () => {
    await db.query("update tareas set nombre='Labor auxiliar distinta' where id=(select tarea_id from aplicaciones where id=$1)", [APPS.closed]);
    const h = await execute([quantity()]);
    const system = h.solicitudes[0].mensajes.find(m => m.role === 'system')?.content ?? '';
    expect(system).toContain('Labor auxiliar distinta');
    expect(system).toContain('Fertilizante sintético');
    expect(system).toContain('QA-F');
  });
  it('Given a genuinely ambiguous application, When a clarification is returned, Then it asks for entity rather than an unrelated period', async () => {
    const h = await execute([tool('pedir_aclaracion', { pregunta: '¿Cuál aplicación quieres revisar?', motivo: 'Hay varios nombres posibles.' })]);
    expect(h.body.origen).toBe('aclaracion');
    expect(h.body.respuesta).toMatch(/aplicaci[oó]n|entidad|alcance/i);
    expect(h.body.respuesta).not.toMatch(/qu[eé] per[ií]odo/i);
    expect(h.body.resultados).toHaveLength(0);
  });
});
