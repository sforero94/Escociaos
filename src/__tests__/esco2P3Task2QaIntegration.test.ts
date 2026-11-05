// Acceptance criteria/oracles frozen against the source contract before runtime implementation.
// Given visible and invisible parents with permissive child reads, when an application cohort is
// selected by an explicit date basis, then only distinct visible parent IDs enter its count.
// Given null/unread fields or independent source failures, when the cohort needs that evidence,
// then the response distinguishes unknown from verified empty and preserves independent parts.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar, type Dependencias } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { USUARIOS, type Traza } from './esco2ArnesRls.ts';
import { dependencies, forbidNetwork, ID, plan, request, tool } from './esco2P2Harness.ts';
import { APPS, EXPECTED, MOVEMENTS, qaFaultClient, task2QaDb, task2QaSeed, type QaProjection } from './esco2P3Task2QaHarness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task2QaDb(); }, 30000);
beforeEach(async () => { await task2QaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });

const appCall = (base: string, overrides: Record<string, unknown> = {}) => ({ nombre: 'consultar_aplicaciones', argumentos: JSON.stringify({ desde: '2026-11-01', hasta: '2026-11-03', base_fecha: base, ...overrides }) });
interface QaAppRow { id: string; estado: string | null; tarea_id?: string | null; nombre_aplicacion?: string | null }
interface QaAppResult { tipo: 'aplicaciones'; id: string; estado: string; conteo: number | null; filas: QaAppRow[]; excluidos: { sin_fecha: number; sin_cierre: number; sin_estado?: number } }
function appResult(body: { resultados: unknown[] }, index = 0): QaAppResult {
  const candidates = body.resultados.filter(r => r && typeof r === 'object' && 'tipo' in r && r.tipo === 'aplicaciones');
  expect(candidates.length).toBeGreaterThan(index);
  return candidates[index] as QaAppResult;
}
function appIds(result: QaAppResult) { return result.filas.map(r => r.id).sort(); }
async function execute(calls: ReturnType<typeof appCall>[], fault?: (table: string, response: RespuestaPostgrest) => RespuestaPostgrest, extra: Partial<Dependencias> = {}) {
  const traza: Traza = { consultas: [] };
  const projections: QaProjection[] = [];
  const h = dependencies(db, calls, { crearClienteUsuario: jwt => qaFaultClient(db, jwt, traza, projections, fault), ...extra });
  const response = await manejar(request({ pregunta: 'Consulta de aplicaciones sintéticas por fecha explícita' }), h.deps);
  return { ...h, traza, projections, response, body: await response.json() };
}

const cohortOracles: Array<[string, string, string, readonly string[]]> = [
  ['fecha_inicio_planeada', '2026-11-01', '2026-11-02', EXPECTED.planned],
  ['fecha_movimiento', '2026-11-02', '2026-11-03', EXPECTED.executed],
  ['fecha_cierre_operativo', '2026-11-02', '2026-11-02', EXPECTED.closed],
];

describe('Task 2 QA: real handler, fixed readers, SQL/RLS and independent application populations', () => {
  it('freezes SQL population oracles while proving hidden-parent children remain individually readable', async () => {
    const truth = await db.transaction(async tx => {
      await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: USUARIOS.gerencia, role: 'authenticated' })]);
      await tx.exec('set local role authenticated');
      return tx.query<{ planned: string[]; executed: string[]; closed: string[]; parents: number; children: number }>(`
        select
          ARRAY(select id::text from aplicaciones where fecha_inicio_planeada between '2026-11-01' and '2026-11-02' order by id) planned,
          ARRAY(select distinct a.id::text from aplicaciones a join movimientos_diarios m on m.aplicacion_id=a.id where m.fecha_movimiento between '2026-11-02' and '2026-11-03' order by a.id::text) executed,
          ARRAY(select a.id::text from aplicaciones a join aplicaciones_cierre c on c.aplicacion_id=a.id where c.fecha_cierre='2026-11-02' order by a.id) closed,
          (select count(*)::int from aplicaciones) parents,
          (select count(*)::int from movimientos_diarios) children`);
    });
    expect(truth.rows[0]).toEqual({ planned: EXPECTED.planned, executed: EXPECTED.executed, closed: EXPECTED.closed, parents: 5, children: 4 });
  });

  it.each(cohortOracles)('selects %s inclusively by its own source date, not another date or display label', async (base, desde, hasta, expected) => {
    const h = await execute([appCall(base, { desde, hasta })]);
    expect(h.response.status).toBe(200);
    const result = appResult(h.body);
    expect(result.estado).toBe('ok');
    expect(appIds(result)).toEqual(expected);
    expect(result.conteo).toBe(expected.length);
    expect(h.body.respuesta).not.toContain('NO PUBLICAR PADRE OCULTO');
    expect(h.body.respuesta).not.toContain(APPS.hidden);
    expect(h.solicitudes).toHaveLength(1);
    expect(h.body.llamadas).toHaveLength(1);
    expect(h.traza.consultas.every(q => q.rol === 'authenticated')).toBe(true);
    expect(h.projections.every(q => !q.columnas.includes('*'))).toBe(true);
  });

  it('keeps duplicate labels, null labels/state and the unlinked application as distinct visible rows', async () => {
    const h = await execute([appCall('fecha_inicio_planeada')]);
    const result = appResult(h.body);
    expect(appIds(result)).toEqual(EXPECTED.planned);
    expect(result.conteo).toBe(3);
    expect(result.filas.find(r => r.id === APPS.nullMetadata)?.estado).toBeNull();
    expect(result.filas.find(r => r.id === APPS.unlinked)).toBeDefined();
    expect(h.body.respuesta).toMatch(/Planificada/);
    expect(h.body.respuesta).toMatch(/estado actual/i);
    expect(h.body.respuesta).toMatch(/sin estado registrado/i);
    expect(h.body.respuesta).not.toMatch(/0 jornales|costo de mano de obra:\s*\$0/i);
  });

  it('does not clip a future planned-start cohort to Bogotá today', async () => {
    const h = await execute([appCall('fecha_inicio_planeada', { desde: '2026-11-10', hasta: '2026-11-10' })]);
    expect(h.body.hoy).toBe('2026-11-04');
    expect(appIds(appResult(h.body))).toEqual(EXPECTED.future);
    expect(h.body.respuesta).toContain('10 de noviembre de 2026');
  });

  it.each(['fecha_movimiento', 'fecha_cierre_operativo'])('retains future %s records with an explicit uncertainty qualifier', async base => {
    if (base === 'fecha_movimiento') await db.query("update movimientos_diarios set fecha_movimiento='2026-11-10' where id=$1", [MOVEMENTS.current]);
    else await db.query("update aplicaciones_cierre set fecha_cierre='2026-11-10' where aplicacion_id=$1", [APPS.closed]);
    const h = await execute([appCall(base, { desde: '2026-11-10', hasta: '2026-11-10' })]);
    expect(appIds(appResult(h.body))).toEqual([base === 'fecha_movimiento' ? APPS.future : APPS.closed]);
    expect(h.body.respuesta).toMatch(/posteriores a hoy|futur/i);
    expect(h.body.respuesta).toMatch(/no prueban|no prueba/i);
  });

  it('never substitutes execution metadata for an actual movement or fans out a parent with two movements', async () => {
    const h = await execute([appCall('fecha_movimiento', { desde: '2026-11-03', hasta: '2026-11-03' })]);
    const result = appResult(h.body);
    expect(appIds(result)).toEqual([APPS.closed]);
    expect(result.conteo).toBe(1);
    expect(result.filas).toHaveLength(1);
    expect(result.filas.some(r => r.id === APPS.unlinked)).toBe(false);
  });

  it('uses recorded operational close date and never administrative created_at or parent timestamp conversion', async () => {
    const operational = await execute([appCall('fecha_cierre_operativo', { desde: '2026-11-02', hasta: '2026-11-02' })]);
    expect(appIds(appResult(operational.body))).toEqual([APPS.closed]);
    expect(operational.body.respuesta).toMatch(/operativ/i);
    const administrative = await execute([appCall('fecha_cierre_operativo', { desde: '2026-12-01', hasta: '2026-12-01' })]);
    expect(appResult(administrative.body).estado).toBe('vacio_verificado');
    expect(appResult(administrative.body).conteo).toBe(0);
  });

  it('binds the current states of duplicate application labels to distinguishable displayed identities', async () => {
    const h = await execute([appCall('fecha_inicio_planeada')]);
    expect(appIds(appResult(h.body))).toEqual(EXPECTED.planned);
    expect(h.body.respuesta).toContain('QA-B');
    const lines = h.body.respuesta.split('\n').filter((line: string) => line.includes('Aplicación repetida'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toBe(lines[1]);
    expect(lines.find((line: string) => line.includes('QA-B'))).toMatch(/Planificada/);
  });

  it('selects a stable application ID without merging its same-name neighbor', async () => {
    const h = await execute([appCall('fecha_inicio_planeada', { aplicacion_ids: [APPS.unlinked] })]);
    expect(appIds(appResult(h.body))).toEqual([APPS.unlinked]);
    expect(appResult(h.body).conteo).toBe(1);
  });

  it.each(['  ÁLFA  ', 'COD-A'])('prefers exact normalized application identity %s over a longer prefix neighbor', async selector => {
    await db.query("update aplicaciones set nombre_aplicacion='Alfa',codigo_aplicacion='COD-A' where id=$1", [APPS.closed]);
    await db.query("update aplicaciones set nombre_aplicacion='Alfa adicional',codigo_aplicacion='COD-AB' where id=$1", [APPS.unlinked]);
    const h = await execute([appCall('fecha_inicio_planeada', { aplicaciones: [selector] })]);
    expect(appIds(appResult(h.body))).toEqual([APPS.closed]);
    expect(appResult(h.body).conteo).toBe(1);
  });

  it.each(['Aplicación repetida', 'Aplicación'])('refuses ambiguous duplicate/excerpt selector %s instead of silently broadening membership', async selector => {
    const h = await execute([appCall('fecha_inicio_planeada', { aplicaciones: [selector] })]);
    expect(appResult(h.body).estado).toBe('no_resuelto');
    expect(appResult(h.body).conteo).toBeNull();
    expect(appResult(h.body).filas).toEqual([]);
  });

  it('permits a uniquely identifying partial application label as a positive control', async () => {
    const h = await execute([appCall('fecha_inicio_planeada', { aplicaciones: ['Plan fut'], desde: '2026-11-10', hasta: '2026-11-10' })]);
    expect(appIds(appResult(h.body))).toEqual([APPS.future]);
    expect(appResult(h.body).conteo).toBe(1);
  });

  it.each(['QA-B', 'No existe en etiquetas conocidas'])('an unread visible name cannot certify the text selector %s', async selector => {
    const h = await execute([appCall('fecha_inicio_planeada', { aplicaciones: [selector] })], (table, response) => table !== 'aplicaciones' ? response : { ...response, data: response.data?.map(row => {
      const r = row as Record<string, unknown>;
      if (r.id !== APPS.nullMetadata) return row;
      const changed = { ...r };
      delete changed.nombre_aplicacion;
      return changed;
    }) ?? null });
    expect(appResult(h.body).estado).toBe('no_disponible');
    expect(appResult(h.body).conteo).toBeNull();
  });

  it('recorded NULL labels are known absence for text matching, unlike unread labels', async () => {
    const h = await execute([appCall('fecha_inicio_planeada', { aplicaciones: ['QA-B'] })]);
    expect(appIds(appResult(h.body))).toEqual([APPS.unlinked]);
    expect(appResult(h.body).conteo).toBe(1);
  });

  it('optional unread labels do not erase proven date/ID membership without a text selector', async () => {
    const h = await execute([appCall('fecha_inicio_planeada', { aplicacion_ids: [APPS.nullMetadata] })], (table, response) => table !== 'aplicaciones' ? response : { ...response, data: response.data?.map(row => {
      const r = row as Record<string, unknown>;
      if (r.id !== APPS.nullMetadata) return row;
      const changed = { ...r };
      delete changed.nombre_aplicacion;
      delete changed.codigo_aplicacion;
      return changed;
    }) ?? null });
    expect(appIds(appResult(h.body))).toEqual([APPS.nullMetadata]);
    expect(appResult(h.body).conteo).toBe(1);
  });

  it('does not turn an unresolved selector into a verified empty application population', async () => {
    const h = await execute([appCall('fecha_inicio_planeada', { aplicacion_ids: ['e1000000-0000-4000-8000-999999999999'] })]);
    expect(appResult(h.body).estado).toBe('no_resuelto');
    expect(appResult(h.body).conteo).toBeNull();
    expect(appResult(h.body).filas).toEqual([]);
  });

  it('publishes a literal zero only for a complete verified empty date cohort', async () => {
    const h = await execute([appCall('fecha_inicio_planeada', { desde: '2026-01-01', hasta: '2026-01-01' })]);
    const result = appResult(h.body);
    expect(result.estado).toBe('vacio_verificado');
    expect(result.conteo).toBe(0);
    expect(result.filas).toEqual([]);
    expect(h.body.respuesta).toMatch(/no (?:hay|se|encontr)|sin aplicaciones|0 aplicaciones/i);
  });

  it('excludes a NULL planned date with a qualifier instead of inventing a date from created_at', async () => {
    const h = await execute([appCall('fecha_inicio_planeada', { desde: '2026-11-02', hasta: '2026-11-02' })]);
    expect(appIds(appResult(h.body))).toEqual([APPS.unlinked]);
    expect(appResult(h.body).excluidos.sin_fecha).toBe(1);
    expect(h.body.respuesta).toMatch(/sin fecha|fecha.*sin dato|fecha.*registrad/i);
  });

  it('discloses NULL current state when an explicit state filter excludes it', async () => {
    const h = await execute([appCall('fecha_inicio_planeada', { estados: ['Calculada'] })]);
    const result = appResult(h.body);
    expect(appIds(result)).toEqual([APPS.unlinked]);
    expect(result.excluidos.sin_estado).toBe(1);
    expect(h.body.respuesta).toMatch(/sin estado registrado/i);
  });

  it.each(['fecha_inicio_planeada', 'fecha_movimiento', 'fecha_cierre_operativo'])('an unread required field for %s is not verified empty', async base => {
    const table = base === 'fecha_inicio_planeada' ? 'aplicaciones' : base === 'fecha_movimiento' ? 'movimientos_diarios' : 'aplicaciones_cierre';
    const field = base === 'fecha_inicio_planeada' ? 'fecha_inicio_planeada' : base === 'fecha_movimiento' ? 'fecha_movimiento' : 'fecha_cierre';
    const h = await execute([appCall(base)], (t, response) => t !== table ? response : { ...response, data: response.data?.map((row, i) => {
      if (i !== 0) return row;
      const changed = { ...(row as Record<string, unknown>) };
      delete changed[field];
      return changed;
    }) ?? null });
    expect(appResult(h.body).estado).toBe('no_disponible');
    expect(appResult(h.body).conteo).toBeNull();
    expect(appResult(h.body).filas).toEqual([]);
  });

  it.each(['fecha_movimiento', 'fecha_cierre_operativo'])('rejects a spoofed wrong-base date property for %s', async base => {
    const table = base === 'fecha_movimiento' ? 'movimientos_diarios' : 'aplicaciones_cierre';
    const required = base === 'fecha_movimiento' ? 'fecha_movimiento' : 'fecha_cierre';
    const spoof = base === 'fecha_movimiento' ? 'fecha_cierre' : 'fecha_movimiento';
    const h = await execute([appCall(base)], (t, response) => t !== table ? response : { ...response, data: response.data?.map((row, i) => {
      if (i) return row;
      const changed = { ...(row as Record<string, unknown>), [spoof]: '2026-11-02' };
      delete changed[required];
      return changed;
    }) ?? null });
    expect(appResult(h.body).estado).toBe('no_disponible');
    expect(appResult(h.body).conteo).toBeNull();
  });

  it('does not publish malformed source names or invented state labels as factual metadata', async () => {
    const h = await execute([appCall('fecha_inicio_planeada')], (table, response) => table !== 'aplicaciones' ? response : { ...response, data: response.data?.map(row => {
      const r = row as Record<string, unknown>;
      return r.id === APPS.closed ? { ...r, nombre_aplicacion: { secret: 'QA MALFORMED NAME' }, estado: 'QA INVENTED STATE' } : r;
    }) ?? null });
    expect(h.response.status).toBe(200);
    expect(typeof h.body.respuesta).toBe('string');
    expect(h.body.respuesta).not.toContain('QA MALFORMED NAME');
    expect(h.body.respuesta).not.toContain('QA INVENTED STATE');
    expect(h.body.respuesta).not.toContain('[object Object]');
  });

  it('rejects an invalid visible source date before the malformed row can be filtered out', async () => {
    const h = await execute([appCall('fecha_inicio_planeada', { desde: '2026-01-01', hasta: '2026-01-01' })], (table, response) => table !== 'aplicaciones' ? response : { ...response, data: response.data?.map((row, i) => i ? row : { ...(row as Record<string, unknown>), fecha_inicio_planeada: '2026-02-30' }) ?? null });
    expect(appResult(h.body).estado).toBe('no_disponible');
    expect(appResult(h.body).conteo).toBeNull();
  });

  it.each(['aplicaciones', 'movimientos_diarios', 'aplicaciones_cierre'])('does not convert a failed %s read into zero applications', async table => {
    const base = table === 'aplicaciones' ? 'fecha_inicio_planeada' : table === 'movimientos_diarios' ? 'fecha_movimiento' : 'fecha_cierre_operativo';
    const h = await execute([appCall(base)], (t, response) => t === table ? { data: null, count: null, error: { message: 'synthetic table read failure' } } : response);
    expect(appResult(h.body).estado).toBe('no_disponible');
    expect(appResult(h.body).conteo).toBeNull();
    expect(h.body.respuesta).not.toContain('synthetic table read failure');
  });

  it('cannot certify a partially paginated child read as a complete execution cohort', async () => {
    const h = await execute([appCall('fecha_movimiento')], (table, response) => table !== 'movimientos_diarios' || response.count === null ? response : { ...response, count: (response.count ?? 0) + 1 });
    expect(appResult(h.body).estado).toBe('no_disponible');
    expect(appResult(h.body).conteo).toBeNull();
  });

  it('rejects duplicate visible child IDs instead of certifying a complete execution population', async () => {
    const h = await execute([appCall('fecha_movimiento')], (table, response) => table !== 'movimientos_diarios' ? response : { ...response, data: response.data?.map(row => {
      const r = row as Record<string, unknown>;
      return r.id === MOVEMENTS.second ? { ...r, id: MOVEMENTS.first } : r;
    }) ?? null });
    expect(appResult(h.body).estado).toBe('no_disponible');
    expect(appResult(h.body).conteo).toBeNull();
  });

  it('does not leak unread/malformed hidden-parent child content into a visible application claim', async () => {
    const h = await execute([appCall('fecha_movimiento')], (table, response) => table !== 'movimientos_diarios' ? response : { ...response, data: response.data?.map(row => {
      const r = row as Record<string, unknown>;
      return r.aplicacion_id === APPS.hidden ? { ...r, fecha_movimiento: 'HIDDEN SECRET BAD DATE' } : r;
    }) ?? null });
    expect(appIds(appResult(h.body))).toEqual([APPS.closed]);
    expect(h.body.respuesta).not.toContain('HIDDEN SECRET BAD DATE');
    expect(h.body.respuesta).not.toContain('NO PUBLICAR PADRE OCULTO');
  });

  it('retains complete current-state rows after pagination and counts the parent once for >1000 child movements', async () => {
    await db.query(`insert into movimientos_diarios select ('f2000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,$1,$2,'2026-11-03' from generate_series(1,1002) g`, [APPS.closed, ID.l1]);
    const h = await execute([appCall('fecha_movimiento', { desde: '2026-11-03', hasta: '2026-11-03' })]);
    expect(appIds(appResult(h.body))).toEqual([APPS.closed]);
    expect(appResult(h.body).conteo).toBe(1);
    expect(h.traza.consultas.filter(q => q.tabla === 'movimientos_diarios').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps inventory answerable when the independent labor task catalog cannot be read', async () => {
    const h = await execute([appCall('fecha_inicio_planeada')], (table, response) => table === 'tareas' ? { data: null, count: null, error: { message: 'synthetic labor source unavailable' } } : response);
    expect(appIds(appResult(h.body))).toEqual(EXPECTED.planned);
    expect(appResult(h.body).conteo).toBe(3);
    expect(h.body.respuesta).not.toContain('synthetic labor source unavailable');
  });

  it('keeps a valid labor answer when the independent application reader fails', async () => {
    const h = await execute([tool(plan()), appCall('fecha_movimiento')], (table, response) => table === 'movimientos_diarios' ? { data: null, count: null, error: { message: 'synthetic unavailable child' } } : response);
    expect(appResult(h.body).estado).toBe('no_disponible');
    expect(h.body.resultados[0].id).toBe('p1');
    expect(h.body.resultados[0].total).toMatchObject({ jornales: 2.5, costo: 250 });
    expect(h.body.resultados[1].id).toBe('p2');
    expect(h.body.respuesta).toContain('2,5 jornales');
    expect(h.body.respuesta).not.toContain('synthetic unavailable child');
  });

  it.each(cohortOracles)('resolves the offered %s date choice with server state and no new planner call', async (base, _from, _to, expected) => {
    const h = await execute([appCall('sin_precisar')]);
    expect(appResult(h.body).estado).toBe('aclaracion');
    const option = h.body.opcionesAclaracion.find((o: { id: string }) => o.id === base);
    expect(option).toBeDefined();
    expect(typeof h.body.estadoToken).toBe('string');
    const response = await manejar(request({ pregunta: option.etiqueta, estadoToken: h.body.estadoToken, respuestaAclaracion: option.id }), h.deps);
    const body = await response.json();
    expect(appIds(appResult(body))).toEqual(expected);
    expect(appResult(body).conteo).toBe(expected.length);
    expect(h.solicitudes).toHaveLength(1);
    expect(body.llamadas).toEqual([]);
  });

  it('cannot resolve an application date pending with a labor-choice ID or another caller token', async () => {
    const h = await execute([appCall('sin_precisar')]);
    const wrongDomain = await manejar(request({ pregunta: 'Tarea', estadoToken: h.body.estadoToken, respuestaAclaracion: 'tarea' }), h.deps);
    const retained = await wrongDomain.json();
    expect(appResult(retained).estado).toBe('aclaracion');
    expect(retained.opcionesAclaracion).toEqual(h.body.opcionesAclaracion);
    expect(appResult(retained).conteo).toBeNull();
    const foreign = await manejar(request({ pregunta: 'Fecha planeada', estadoToken: retained.estadoToken, respuestaAclaracion: 'fecha_inicio_planeada' }, ID.other), h.deps);
    const reset = await foreign.json();
    expect(reset.origen).toBe('aclaracion');
    expect(reset.resultados).toEqual([]);
    expect(reset.avisoEstado).toBe('contexto_no_disponible');
    expect(h.solicitudes).toHaveLength(1);
  });

  it('free text that names a date basis cannot resolve its pending typed choice', async () => {
    const h = await execute([appCall('sin_precisar')]);
    const response = await manejar(request({ pregunta: 'fecha_inicio_planeada', estadoToken: h.body.estadoToken }), h.deps);
    const body = await response.json();
    expect(appResult(body).estado).toBe('aclaracion');
    expect(appResult(body).conteo).toBeNull();
    expect(body.opcionesAclaracion).toEqual(h.body.opcionesAclaracion);
    expect(body.respuesta).toMatch(/elige|selecciona|escoge/i);
    expect(h.solicitudes).toHaveLength(1);
    expect(body.llamadas).toEqual([]);
  });

  it.each([true, false])('preserves global obligation IDs across both pending kinds with application-first=%s', async applicationFirst => {
    await db.query("update tipos_tareas set nombre='Cosecha',categoria='Cosecha' where id=$1", [ID.ty]);
    await db.query("update tareas set nombre=case when id=$1 then 'Cosecha puntual' else 'Otra labor' end", [ID.t1]);
    const labor = tool(plan({ categorias: ['Cosecha'] }));
    const application = appCall('sin_precisar');
    const h = await execute([...(applicationFirst ? [application, labor] : [labor, application]), tool(plan())]);
    expect(h.body.resultados.map((r: { id: string }) => r.id)).toEqual(['p1', 'p2', 'p3']);
    expect(h.body.resultados[2].total).toMatchObject({ jornales: 2.5, costo: 250 });
    const firstChoice = applicationFirst ? 'fecha_movimiento' : 'tarea';
    expect(h.body.opcionesAclaracion.some((o: { id: string }) => o.id === firstChoice)).toBe(true);
    const secondResponse = await manejar(request({ pregunta: 'Primera opción sintética', estadoToken: h.body.estadoToken, respuestaAclaracion: firstChoice }), h.deps);
    const second = await secondResponse.json();
    const secondChoice = applicationFirst ? 'tarea' : 'fecha_movimiento';
    expect(second.opcionesAclaracion.some((o: { id: string }) => o.id === secondChoice)).toBe(true);
    const thirdResponse = await manejar(request({ pregunta: 'Segunda opción sintética', estadoToken: second.estadoToken, respuestaAclaracion: secondChoice }), h.deps);
    const third = await thirdResponse.json();
    expect(third.resultados.map((r: { id: string }) => r.id)).toEqual(['p1', 'p2', 'p3']);
    expect(appIds(appResult(third))).toEqual([APPS.closed]);
    const laborIndex = applicationFirst ? 1 : 0;
    expect(third.resultados[laborIndex].total).toMatchObject({ jornales: 1.25, costo: 100 });
    expect(third.resultados[2].total).toMatchObject({ jornales: 2.5, costo: 250 });
    expect(third.opcionesAclaracion ?? []).toEqual([]);
    expect(h.solicitudes).toHaveLength(1);
    expect(third.llamadas).toEqual([]);
  });

  it('preserves original multipart order and independent labor through application date clarification', async () => {
    const h = await execute([tool(plan()), appCall('sin_precisar')]);
    expect(h.body.resultados[0].total).toMatchObject({ jornales: 2.5, costo: 250 });
    expect(h.body.resultados[0].id).toBe('p1');
    expect(appResult(h.body).id).toBe('p2');
    const response = await manejar(request({ pregunta: 'Fecha de movimiento', estadoToken: h.body.estadoToken, respuestaAclaracion: 'fecha_movimiento' }), h.deps);
    const body = await response.json();
    expect(body.resultados[0].total).toMatchObject({ jornales: 2.5, costo: 250 });
    expect(body.resultados[0].id).toBe('p1');
    expect(appResult(body).id).toBe('p2');
    expect(appIds(appResult(body))).toEqual([APPS.closed]);
    expect(h.solicitudes).toHaveLength(1);
  });

  it.each(['sin_precisar', 'cierre_administrativo'])('does not manufacture application counts for base %s', async base => {
    const h = await execute([appCall(base)]);
    expect(appResult(h.body).estado).toBe(base === 'sin_precisar' ? 'aclaracion' : 'no_soportada');
    expect(appResult(h.body).conteo).toBeNull();
    expect(appResult(h.body).filas).toEqual([]);
  });

  it.each([USUARIOS.administrador, USUARIOS.verificador, USUARIOS.gerenciaDesactivada, USUARIOS.sinPerfil])('rejects caller %s before app readers or planner', async user => {
    const h = dependencies(db, [appCall('fecha_inicio_planeada')]);
    const response = await manejar(request({ pregunta: 'Aplicaciones sintéticas' }, user), h.deps);
    expect(response.status).toBe(403);
    expect(h.solicitudes).toHaveLength(0);
    expect(h.traza.consultas.map(q => q.tabla)).toEqual(['usuarios']);
  });
});
