// Independent structural option-3 oracle, frozen before implementation.
// All data reuse the synthetic QA fixture; the paid planner alone is substituted.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, ID, plan, request, tool as labor } from './esco2P2Harness.ts';
import { task3QaDb, task3QaSeed, T3 } from './esco2P3Task3QaHarness.ts';
import type { LlamadaHerramienta } from '../utils/esco2/registro.ts';
import { guardarEstado, leerEstado } from '../utils/esco2/estado.ts';
import { USUARIOS } from './esco2ArnesRls.ts';
import { qaFaultClient } from './esco2P3Task2QaHarness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task3QaDb(); }, 30000);
beforeEach(async () => { await task3QaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
const unsupported: LlamadaHerramienta = { nombre: 'fuera_de_alcance', argumentos: JSON.stringify({ motivo: 'NO PUBLICAR MOTIVO LIBRE 987654321' }) };
const quantity: LlamadaHerramienta = { nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify({ aplicacion_id: T3.liquid }) };
const clarification: LlamadaHerramienta = { nombre: 'pedir_aclaracion', argumentos: JSON.stringify({ pregunta: '¿Qué entidad?', motivo: 'No determinada' }) };
const partial = /respuesta parcial|partes? (?:no |fuera|sin)|resto[^.\n]*(?:no|fuera)/i;
const supportedScope = /corresponden únicamente a las partes sustentadas/i;
async function execute(calls: LlamadaHerramienta[]) {
  const h = dependencies(db, calls);
  const response = await manejar(request({ pregunta: 'Consulta sintética con una parte sustentada y otra fuera de las capacidades actuales' }), h.deps);
  return { ...h, response, body: await response.json() };
}
describe('P3 option3 QA: typed partial disposition survives real handler and state', () => {
  it('Given supported quantities and an unsupported part, When mixed tools run, Then HTTP preserves supported facts and explicit partial scope', async () => {
    const h = await execute([quantity, unsupported]);
    expect(h.body.origen).toBe('determinista');
    expect(h.body.resultados).toHaveLength(1);
    expect(h.body.resultados[0].ejecucion.filas[0].cantidad).toBe(0.01);
    expect(h.body.plan.parcialFueraDeAlcance).toBe(true);
    expect(h.body.respuesta).toMatch(/0,01 L/);
    expect(h.body.respuesta).toMatch(partial);
    expect(h.body.respuesta).toMatch(supportedScope);
    expect(h.body.respuesta).not.toContain('NO PUBLICAR');
    expect(h.body.respuesta).not.toContain('987654321');
    expect(h.body.estadoToken).toBeTruthy();
    const state = leerEstado(h.body.estadoToken, USUARIOS.gerencia, h.deps.ahora!().getTime());
    expect(state?.plan).toMatchObject({ parcialFueraDeAlcance: true });
  });
  it('Given pending D26 and a partial disposition, When the server choice resolves, Then partial scope survives without a second planner', async () => {
    await db.query("update tipos_tareas set nombre='Cosecha',categoria='Cosecha' where id=$1", [ID.ty]);
    await db.query("update tareas set nombre=case when id=$1 then 'Cosecha puntual' else 'Otra labor' end", [ID.t1]);
    const h = await execute([labor(plan({ categorias: ['Cosecha'] })), unsupported]);
    expect(h.body.origen).toBe('aclaracion');
    expect(h.body.respuesta).toMatch(partial);
    const r = await manejar(request({ pregunta: 'Tareas con ese nombre', estadoToken: h.body.estadoToken, respuestaAclaracion: 'tarea' }), h.deps);
    const body = await r.json();
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].total).toMatchObject({ jornales: 1.25, costo: 100 });
    expect(body.plan.parcialFueraDeAlcance).toBe(true);
    expect(body.respuesta).toMatch(partial);
    expect(body.respuesta).toMatch(supportedScope);
    expect(h.solicitudes).toHaveLength(1);
  });
  it('Given a pure unsupported request, When it is rejected, Then advertised capabilities include applications and labor', async () => {
    const h = await execute([unsupported]);
    expect(h.body.origen).toBe('fuera_de_alcance');
    expect(h.body.respuesta).toMatch(/labores/i);
    expect(h.body.respuesta).toMatch(/aplicaciones/i);
    expect(h.body.respuesta).not.toContain('NO PUBLICAR');
  });
  it('Given three queries and one disposition, When planned together, Then four calls remain permitted', async () => {
    const h = await execute([quantity, quantity, quantity, unsupported]);
    expect(h.body.origen).toBe('determinista');
    expect(h.body.resultados).toHaveLength(3);
    expect(h.body.respuesta).toMatch(partial);
  });
  it.each([
    ['five calls', [quantity, quantity, quantity, quantity, unsupported]],
    ['two unsupported dispositions', [quantity, unsupported, unsupported]],
    ['clarification and query', [quantity, clarification]],
  ] as const)('Given %s, When the invalid plan repeats, Then no factual result is emitted', async (_name, calls) => {
    const h = await execute([...calls]);
    expect(h.body.origen).toBe('error_plan');
    expect(h.body.resultados).toEqual([]);
    expect(h.solicitudes).toHaveLength(2);
  });
  it.each([false, 'true', {}, 1])('Given a server state with an invalid closed flag %s, When state is saved, Then it is rejected', async flag => {
    const h = await execute([quantity]);
    const state = leerEstado(h.body.estadoToken, USUARIOS.gerencia, h.deps.ahora!().getTime());
    expect(state).toBeDefined();
    Object.assign(state!.plan, { parcialFueraDeAlcance: flag });
    expect(guardarEstado(USUARIOS.gerencia, state!, h.deps.ahora!().getTime())).toBeUndefined();
  });
  it('Given a completed partial query, When a new supported query uses its token, Then the prior partial flag does not stick', async () => {
    const first = await execute([quantity, unsupported]);
    expect(first.body.estadoToken).toBeTruthy();
    const h = dependencies(db, [quantity]);
    const response = await manejar(request({ pregunta: 'Solo cantidades de Líquido sintético', estadoToken: first.body.estadoToken }), h.deps);
    const body = await response.json();
    expect(body.origen).toBe('determinista');
    expect(body.plan.parcialFueraDeAlcance).toBeUndefined();
    expect(body.respuesta).not.toMatch(/respuesta parcial/i);
    expect(h.solicitudes).toHaveLength(1);
  });
  it('Given a failed source within a supported query, When it runs without unsupported tool, Then unread data are not labeled outside capability', async () => {
    const h = dependencies(db, [quantity], { crearClienteUsuario: jwt => qaFaultClient(db, jwt, { consultas: [] }, [], (table, response) => table === 'movimientos_diarios' ? { data: null, error: { message: 'synthetic failure' }, count: null } : response) });
    const response = await manejar(request({ pregunta: 'Cantidades de Líquido sintético' }), h.deps);
    const body = await response.json();
    expect(body.origen).toBe('determinista');
    expect(body.plan.parcialFueraDeAlcance).toBeUndefined();
    expect(body.resultados[0].ejecucion.estado).not.toBe('ok');
    expect(body.respuesta).not.toMatch(/resto[^.\n]*fuera|partes? fuera de alcance/i);
  });
  it('Given no unsupported disposition, When the supported query runs, Then a partial-disposition flag is not fabricated', async () => {
    const h = await execute([quantity]);
    expect(h.body.origen).toBe('determinista');
    expect(h.body.plan.parcialFueraDeAlcance).toBeUndefined();
    expect(h.body.respuesta).not.toMatch(/respuesta parcial/i);
  });
});
