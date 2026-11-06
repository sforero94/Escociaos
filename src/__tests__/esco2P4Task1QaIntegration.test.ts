// Independent P4-1 QA obligations. Literal SQL and transport mutations are frozen before runtime.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { USUARIOS, type Traza } from './esco2ArnesRls.ts';
import { dependencies, forbidNetwork, ID, request } from './esco2P2Harness.ts';
import { qaFaultClient, type QaProjection } from './esco2P3Task2QaHarness.ts';
import { MON, MON_ORACLE, monQaDb, monQaSeed } from './esco2P4Task1QaHarness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await monQaDb(); }, 30000);
beforeEach(async () => { await monQaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });

type Fault = (table: string, response: RespuestaPostgrest) => RespuestaPostgrest;
interface QaRow {
  ronda_id: string; lote_id?: string | null; sublote_id?: string | null; plaga_id: string;
  afectados: number | null; muestreados: number | null; observaciones: number;
  incidencia: number | null; gravedad: string | { texto: string } | null; estado: string; fechas: string[];
}
interface QaMonResult { tipo: 'monitoreo'; estado: string; filas: QaRow[] }
const baseArgs = () => ({ ronda_ids: [MON.r1], lote_ids: [ID.l1], plaga_ids: [MON.pest1] });
const call = (args: Record<string, unknown>) => ({ nombre: 'consultar_monitoreo', argumentos: JSON.stringify(args) });
const rowsOverlay = (response: RespuestaPostgrest, change: (row: Record<string, unknown>) => void): RespuestaPostgrest => ({
  ...response, data: response.data?.map(value => { const row = { ...(value as Record<string, unknown>) }; change(row); return row; }) ?? null,
});
async function execute(args: Record<string, unknown> = baseArgs(), fault?: Fault, user: string = USUARIOS.gerencia) {
  const traza: Traza = { consultas: [] };
  const projections: QaProjection[] = [];
  const h = dependencies(db, [call(args)], { crearClienteUsuario: jwt => qaFaultClient(db,jwt,traza,projections,fault) });
  const response = await manejar(request({ pregunta: 'Incidencia y gravedad de QA Plaga Uno en QA Norte durante QA Alfa' },user),h.deps);
  const body = await response.json();
  return { ...h, traza, projections, response, body };
}
function result(body: { resultados?: unknown[] }): QaMonResult {
  const r = body.resultados?.find(x => typeof x === 'object' && x !== null && 'tipo' in x && x.tipo === 'monitoreo');
  expect(r, 'La operación debe responder monitoreo de forma sustantiva').toBeDefined();
  return r as QaMonResult;
}
const gravity = (row: QaRow) => typeof row.gravedad === 'string' ? row.gravedad : row.gravedad?.texto;
function expectWeighted(row: QaRow, expected = MON_ORACLE.weighted) {
  expect(row).toMatchObject({ afectados: expected.afectados, muestreados: expected.muestreados, observaciones: expected.observaciones });
  expect(row.incidencia).toBeCloseTo(expected.incidencia,10);
  expect(gravity(row)).toBe(expected.gravedad);
}

describe('P4-1 QA: explicit intentions → real HTTP handler → fixed SQL/RLS readers → deterministic response', () => {
  it('validates the literal weighted oracle with independent SQL under the requesting user', async () => {
    const oracle = await db.transaction(async tx => {
      await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:USUARIOS.gerencia,role:'authenticated'})]);
      await tx.exec('set local role authenticated');
      return tx.query<{ afectados: number; muestreados: number; observaciones: number }>(`select sum(m.arboles_afectados)::int afectados,sum(m.arboles_monitoreados)::int muestreados,count(*)::int observaciones from monitoreos m join rondas_monitoreo r on r.id=m.ronda_id join lotes l on l.id=m.lote_id join plagas_enfermedades_catalogo p on p.id=m.plaga_enfermedad_id where m.ronda_id=$1 and m.lote_id=$2 and m.plaga_enfermedad_id=$3`,[MON.r1,ID.l1,MON.pest1]);
    });
    expect(oracle.rows).toEqual([{afectados:20,muestreados:120,observaciones:3}]);
  });

  it('sums every distinct observation once across dates and repeated group/date instead of MAX or a mean of percentages', async () => {
    const h = await execute();
    expect(h.response.status).toBe(200);
    const r = result(h.body);
    expect(r.filas).toHaveLength(1);
    expectWeighted(r.filas[0]);
    expect(r.filas[0].fechas).toEqual(MON_ORACLE.distinctDates);
    expect(h.body.respuesta).toMatch(/observaciones/i);
    expect(h.body.respuesta).toMatch(/muestread/i);
    expect(h.body.respuesta).not.toMatch(/[áa]rboles [úu]nicos|censo.*120/i);
    expect(h.solicitudes).toHaveLength(1);
    expect(h.body.llamadas).toHaveLength(1);
  });

  it('keeps two rounds with the same calendar date separate by round ID', async () => {
    const h = await execute({...baseArgs(),ronda_ids:[MON.r1,MON.r2]});
    const r = result(h.body);
    expect(r.filas).toHaveLength(2);
    expectWeighted(r.filas.find(f=>f.ronda_id===MON.r1)!);
    const zero = r.filas.find(f=>f.ronda_id===MON.r2)!;
    expect(zero).toMatchObject(MON_ORACLE.secondRound);
  });

  it('aggregates lots only when no lot grouping is requested, without requiring an unasked table', async () => {
    const h = await execute({ronda_ids:[MON.r1],plaga_ids:[MON.pest1]});
    const r = result(h.body);
    expect(r.filas).toHaveLength(1);
    const row = r.filas[0];
    expect(row).toMatchObject({afectados:22,muestreados:140,observaciones:4});
    expect(row.incidencia).toBeCloseTo(MON_ORACLE.roundOnePestOne.incidencia,10);
    expect(gravity(row)).toBe('Media');
    expect(h.body.respuesta).not.toMatch(/777|888|NO PUBLICAR/);
  });

  it('groups by lot and sublot only when explicitly requested', async () => {
    const h = await execute({ronda_ids:[MON.r1],plaga_ids:[MON.pest1],agrupar_por:['lote','sublote']});
    const r = result(h.body);
    expect(r.filas).toHaveLength(2);
    expectWeighted(r.filas.find(f=>f.lote_id===ID.l1 && f.sublote_id===MON.s1)!);
    expect(r.filas.find(f=>f.lote_id===ID.l2 && f.sublote_id===MON.s2)).toMatchObject({afectados:2,muestreados:20,incidencia:10});
  });

  it('never adds the denominators of different pests into a fictitious sampled-tree population', async () => {
    const h = await execute({...baseArgs(),plaga_ids:[MON.pest1,MON.pest2]});
    const r = result(h.body);
    expect(r.filas).toHaveLength(2);
    expectWeighted(r.filas.find(f=>f.plaga_id===MON.pest1)!);
    expect(r.filas.find(f=>f.plaga_id===MON.pest2)).toMatchObject({afectados:3,muestreados:10,incidencia:30});
  });

  it('reports an unobserved requested combination as no_revisado, preserving a measured zero separately', async () => {
    const h = await execute({...baseArgs(),ronda_ids:[MON.r2],plaga_ids:[MON.pest1,MON.pest2]});
    const r = result(h.body);
    expect(r.filas.find(f=>f.plaga_id===MON.pest1)).toMatchObject({incidencia:0,afectados:0,muestreados:10});
    const missing = r.filas.find(f=>f.plaga_id===MON.pest2)!;
    expect(missing).toMatchObject({estado:'no_revisado',incidencia:null,gravedad:null});
    expect(h.body.respuesta).toMatch(/no revisad/i);
  });

  it.each([[9,'Baja'],[10,'Media'],[29,'Media'],[30,'Alta']])('honors the shared gravity threshold at %s percent', async (affected,expectedGravity) => {
    await db.query('update monitoreos set arboles_afectados=$1,arboles_monitoreados=100 where id=$2',[affected,MON.o1]);
    await db.query('delete from monitoreos where id in($1,$2)',[MON.o2,MON.o3]);
    const row = result((await execute()).body).filas[0];
    // Shared engine division can retain machine residue (29/100*100); no formula change.
    expect(row.incidencia).toBeCloseTo(affected,10);
    expect(gravity(row)).toBe(expectedGravity);
  });

  it.each([0,null,-1,'unread','NaN'])('does not publish a zero incidence when one denominator is %s', async invalid => {
    const h = await execute(baseArgs(),(table,response)=>table!=='monitoreos'?response:rowsOverlay(response,row=>{
      if(row.id===MON.o1) { if(invalid==='unread') delete row.arboles_monitoreados; else row.arboles_monitoreados=invalid; }
    }));
    const r = result(h.body);
    expect(r.estado).not.toBe('ok');
    expect(r.filas.some(f=>f.estado!=='ok')).toBe(true);
    expect(r.filas.filter(f=>f.estado==='ok').every(f=>f.incidencia!==0)).toBe(true);
    expect(h.body.respuesta).not.toMatch(/NaN|Infinity/);
  });

  it.each([-1,11,null,'unread'])('rejects an incompatible affected-tree numerator %s without silently dropping the row', async invalid => {
    const h = await execute(baseArgs(),(table,response)=>table!=='monitoreos'?response:rowsOverlay(response,row=>{
      if(row.id===MON.o1) { if(invalid==='unread') delete row.arboles_afectados; else row.arboles_afectados=invalid; }
    }));
    const r = result(h.body);
    expect(r.estado).not.toBe('ok');
    expect(r.filas.some(f=>f.estado!=='ok')).toBe(true);
  });

  it('retains a foreign sublot as incompatible instead of silently certifying the remaining subtotal', async () => {
    await db.query('update monitoreos set sublote_id=$1 where id=$2',[MON.s2,MON.o1]);
    const r = result((await execute()).body);
    expect(r.estado).not.toBe('ok');
    expect(r.filas.some(f=>f.estado!=='ok')).toBe(true);
  });

  it('does not join observations without round IDs to a round by coincident date', async () => {
    const r = result((await execute()).body);
    expectWeighted(r.filas[0]);
    expect(r.filas[0].afectados).not.toBe(37);
  });

  it.each(['rondas_monitoreo','lotes','plagas_enfermedades_catalogo'])('does not authorize a visible child via an invisible %s parent', async parent => {
    const args = parent==='rondas_monitoreo'?{...baseArgs(),ronda_ids:[MON.hiddenRound]}:parent==='lotes'?{...baseArgs(),lote_ids:[MON.hiddenLot]}:{...baseArgs(),plaga_ids:[MON.hiddenPest]};
    const h = await execute(args);
    const r = result(h.body);
    expect(r.estado).not.toBe('ok');
    expect(r.filas.every(f=>f.incidencia===null)).toBe(true);
    expect(h.body.respuesta).not.toMatch(/NO PUBLICAR|777|888|99\s*%/);
  });

  it.each(['rondas_monitoreo','sublotes','plagas_enfermedades_catalogo','monitoreos'])('does not certify a failed %s reader as a complete population', async failedTable => {
    const h = await execute(baseArgs(),(table,response)=>table===failedTable?{data:null,count:null,error:{message:'QA PRIVATE TRANSPORT ERROR'}}:response);
    const r = result(h.body);
    expect(r.estado).not.toBe('ok');
    expect(h.body.respuesta).not.toContain('QA PRIVATE TRANSPORT ERROR');
    expect(r.filas.filter(f=>f.estado==='ok')).toHaveLength(0);
  });

  it('fails closed on duplicate observation transport IDs without counting or silently deduplicating them', async () => {
    const h = await execute(baseArgs(),(table,response)=>table!=='monitoreos'||!response.data?.length?response:{...response,data:[...response.data,response.data[0]],count:(response.count??0)+1});
    const r = result(h.body);
    expect(r.estado).not.toBe('ok');
    expect(r.filas.filter(f=>f.estado==='ok')).toHaveLength(0);
  });

  it('distinguishes an incomplete observation transport from verified empty', async () => {
    const h = await execute(baseArgs(),(table,response)=>table!=='monitoreos'||typeof response.count!=='number'?response:{...response,count:response.count+1});
    const r = result(h.body);
    expect(r.estado).not.toBe('ok');
    expect(r.filas.filter(f=>f.estado==='ok'||f.estado==='no_revisado')).toHaveLength(0);
  });

  it('does not substitute last available data of a combination for the latest global visible round', async () => {
    const h = await execute({seleccion_ronda:'ultima_global',lote_ids:[ID.l1],plaga_ids:[MON.pest1]});
    const r = result(h.body);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ronda_id:MON.last,estado:'no_revisado',incidencia:null});
  });

  it('resolves a round-date interval by round start, retaining the whole multi-date round', async () => {
    const h = await execute({desde:'2026-10-01',hasta:'2026-10-01',lote_ids:[ID.l1],plaga_ids:[MON.pest1]});
    const r = result(h.body);
    expect(r.filas).toHaveLength(2);
    expectWeighted(r.filas.find(f=>f.ronda_id===MON.r1)!);
    expect(r.filas.find(f=>f.ronda_id===MON.r2)).toMatchObject({incidencia:0});
  });

  it('asks to choose a round rather than assuming one when no selector was given', async () => {
    const h = await execute({lote_ids:[ID.l1],plaga_ids:[MON.pest1]});
    expect(result(h.body).estado).not.toBe('ok');
    expect(h.body.respuesta).toMatch(/ronda/i);
    expect(result(h.body).filas.filter(f=>f.estado==='ok')).toHaveLength(0);
  });

  it('uses explicit projection, user JWT/RLS and no live climate/legacy/capture tables', async () => {
    const h = await execute();
    expectWeighted(result(h.body).filas[0]);
    expect(h.projections.every(p=>!p.columnas.includes('*'))).toBe(true);
    const monitorProjection = h.projections.filter(p=>p.tabla==='monitoreos');
    expect(monitorProjection.length).toBeGreaterThan(0);
    expect(monitorProjection.every(p=>p.columnas.split(',').sort().join(',')===['id','ronda_id','fecha_monitoreo','lote_id','sublote_id','plaga_enfermedad_id','arboles_monitoreados','arboles_afectados'].sort().join(','))).toBe(true);
    expect(h.traza.consultas.every(t=>t.rol==='authenticated')).toBe(true);
    expect(h.traza.consultas.some(t=>/clima_|mon_conductividad|telegram|logs_auditoria/.test(t.tabla))).toBe(false);
    expect(h.body.respuesta).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4000-8000-[0-9a-f]{12}/i);
  });

  it('refuses an Administrator before planning or domain reads', async () => {
    const h = await execute(baseArgs(),undefined,USUARIOS.administrador);
    expect(h.response.status).toBe(403);
    expect(h.solicitudes).toHaveLength(0);
    expect(h.traza.consultas.every(q=>q.tabla==='usuarios')).toBe(true);
  });
});
