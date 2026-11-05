// Independent application-summary acceptance oracles, frozen before implementation.
// Only the pre-existing literal synthetic SQL/RLS fixture is used; no private case/source.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { USUARIOS, type Traza } from './esco2ArnesRls.ts';
import { dependencies, forbidNetwork, ID, request } from './esco2P2Harness.ts';
import { MOVEMENTS, qaFaultClient, type QaProjection } from './esco2P3Task2QaHarness.ts';
import { T3, task3QaDb, task3QaSeed } from './esco2P3Task3QaHarness.ts';

type TotalQa = { producto_id?: string; unidad: string | null; cantidad: number | null; subtotal_conocido: number | null; estado: string; motivos: string[]; fuentes: string[] };
type BloqueQa = { productos: TotalQa[]; recipientes: TotalQa[]; mezcla: TotalQa[] };
type ResultadoQa = { tipo: string; estado: string; resumen?: { plan: BloqueQa; ejecucion: BloqueQa }; plan: { estado: string; filas: { cantidad: number | null; estado: string }[]; totales_guardados: unknown[]; conciliacion: { estado: string }[] }; ejecucion: { estado: string; filas: { lote_id: string | null; cantidad: number | null }[] } };
let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task3QaDb(); }, 30000);
beforeEach(async () => {
  await task3QaSeed(db);
  await db.query("update aplicaciones_productos set producto_nombre=case when producto_id=$1 then 'Ingrediente P' when producto_id=$2 then 'Ingrediente Q' else producto_nombre end", [T3.productP,T3.productQ]);
  await db.query("update movimientos_diarios_productos set producto_nombre=case when producto_id=$1 then 'Ingrediente P' when producto_id=$2 then 'Ingrediente Q' else producto_nombre end", [T3.productP,T3.productQ]);
  await db.query("update aplicaciones_mezclas set nombre_mezcla=case when id=$1 then 'Mezcla alfa' when id=$2 then 'Mezcla beta' else nombre_mezcla end", [T3.mix1,T3.mix2]);
  await db.query("update lotes set nombre=case when id=$1 then 'Lote norte' when id=$2 then 'Lote sur' else 'Lote este' end", [ID.l1,ID.l2]);
});
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
const changedRows = (r: RespuestaPostgrest, f: (row: Record<string,unknown>) => Record<string,unknown>): RespuestaPostgrest => ({ ...r, data: r.data?.map(x => f({ ...(x as Record<string,unknown>) })) ?? null });
async function execute(overrides: Record<string,unknown> = {}, fault?: (table: string, r: RespuestaPostgrest) => RespuestaPostgrest, user: string = USUARIOS.gerencia) {
  const trace: Traza = { consultas: [] };
  const projections: QaProjection[] = [];
  const call = { nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify({ aplicacion_id: T3.fertilizer, ...overrides }) };
  const h = dependencies(db, [call], { crearClienteUsuario: jwt => qaFaultClient(db,jwt,trace,projections,fault) });
  const response = await manejar(request({ pregunta: 'Totales del plan y ejecución de la aplicación sintética, con su desglose' }, user), h.deps);
  const body = await response.json();
  const result = (body.resultados ?? []).find((r: ResultadoQa) => r.tipo === 'cantidades_aplicacion') as ResultadoQa | undefined;
  return { ...h, response, body, result, trace, projections };
}
function summary(r: ResultadoQa | undefined) {
  expect(r?.resumen, 'A valid application exposes its source-qualified application totals').toBeDefined();
  return r!.resumen!;
}
function product(block: BloqueQa, id: string, unit = 'kg') {
  const found = block.productos.find(x => x.producto_id === id && x.unidad === unit);
  expect(found, 'The summary retains the product identity and compatible unit').toBeDefined();
  return found!;
}
function unitTotal(rows: TotalQa[], unit: string) {
  const found = rows.find(x => x.unidad === unit);
  expect(found, 'A separately measured physical total remains available').toBeDefined();
  return found!;
}

describe('P3 QA: fixed reader → application totals → factual response, independent SQL/RLS', () => {
  it('totals saved mix/product rows once, child execution once, and never fans out containers by products', async () => {
    const h = await execute(); const r = summary(h.result);
    expect(h.response.status).toBe(200);
    expect(product(r.plan,T3.productP)).toMatchObject({ cantidad: 30, subtotal_conocido: 30, estado: 'conocido' });
    expect(product(r.plan,T3.productQ)).toMatchObject({ cantidad: 10, estado: 'conocido' });
    expect(product(r.ejecucion,T3.productP)).toMatchObject({ cantidad: 15, estado: 'conocido' });
    expect(product(r.ejecucion,T3.productQ)).toMatchObject({ cantidad: 2, estado: 'conocido' });
    expect(unitTotal(r.plan.recipientes,'bultos').cantidad).toBe(3);
    expect(unitTotal(r.plan.mezcla,'kg de mezcla').cantidad).toBe(40);
    expect(unitTotal(r.ejecucion.recipientes,'bultos').cantidad).toBe(4);
    expect(r.ejecucion.mezcla).toEqual([]);
    expect(h.result!.plan.filas).toHaveLength(5);
    expect(h.result!.plan.conciliacion.every(x => x.estado === 'coincide')).toBe(true);
    expect(h.trace.consultas.every(x => x.rol === 'authenticated')).toBe(true);
    expect(h.projections.every(x => !x.columnas.includes('*'))).toBe(true);
    expect(h.solicitudes).toHaveLength(1);
  });

  it('publishes compact distinct plan/execution total lines using names and preserves their detailed evidence', async () => {
    const h = await execute(); summary(h.result);
    const lines: string[] = h.body.respuesta.split('\n');
    const totals = lines.filter(x => /resumen|total.*aplicaci[oó]n/i.test(x));
    expect(totals.some(x => /plan/i.test(x) && /Ingrediente P/.test(x) && /30\s*kg/.test(x))).toBe(true);
    expect(totals.some(x => /ejecuci[oó]n/i.test(x) && /Ingrediente P/.test(x) && /15\s*kg/.test(x))).toBe(true);
    expect(h.body.respuesta).toMatch(/Plan por lote/);
    expect(h.body.respuesta).toMatch(/Lote norte/);
    expect(h.body.respuesta).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(h.body.respuesta).not.toMatch(/NO PUBLICAR/);
    expect(h.body.respuesta).not.toMatch(/45\s*kg/);
  });

  it('keeps complete saved plan while period selection changes only execution totals', async () => {
    const h = await execute({ desde: '2026-11-02', hasta: '2026-11-03' }); const r = summary(h.result);
    expect(product(r.plan,T3.productP).cantidad).toBe(30);
    expect(unitTotal(r.plan.recipientes,'bultos').cantidad).toBe(3);
    expect(product(r.ejecucion,T3.productP).cantidad).toBe(8);
    expect(product(r.ejecucion,T3.productQ).cantidad).toBe(2);
    expect(unitTotal(r.ejecucion.recipientes,'bultos').cantidad).toBe(3);
    expect(h.body.respuesta).toMatch(/no se recorta/);
  });

  it('retains source-qualified saved totals on discrepancy without resurrecting an exact per-lot plan', async () => {
    await db.query('update aplicaciones_productos set cantidad_total_necesaria=99 where mezcla_id=$1 and producto_id=$2',[T3.mix1,T3.productP]);
    const h = await execute(); const r = summary(h.result);
    expect(product(r.plan,T3.productP)).toMatchObject({ cantidad: 119, estado: 'no_concilia' });
    expect(h.result!.plan.filas.filter(x => x.estado === 'no_concilia')).toHaveLength(2);
    expect(h.result!.plan.filas.filter(x => x.estado === 'no_concilia').every(x => x.cantidad === null)).toBe(true);
    expect(product(r.ejecucion,T3.productP).cantidad).toBe(15);
    expect(h.body.respuesta).toMatch(/No cuadra|no cuadra/);
  });

  it('retains a readable stored product total when a required exact-lot base is NULL', async () => {
    const h = await execute({},(table,r) => table==='aplicaciones_lotes' ? changedRows(r,row => row.lote_id===ID.l1 ? {...row,arboles_grandes:null} : row) : r);
    const r = summary(h.result);
    expect(product(r.plan,T3.productP).cantidad).toBe(30);
    expect(h.result!.plan.estado).toBe('parcial');
    expect(h.result!.plan.filas.some(x => x.cantidad===null)).toBe(true);
    expect(product(r.ejecucion,T3.productP).cantidad).toBe(15);
    expect(h.body.respuesta).toMatch(/sin plan exacto|Sin verificar/);
  });

  it('preserves NULL as an incomplete total with only an explicitly known subtotal', async () => {
    const h = await execute({},(table,r) => table==='aplicaciones_productos' ? changedRows(r,row => row.mezcla_id===T3.mix1 && row.producto_id===T3.productP ? {...row,cantidad_total_necesaria:null} : row) : r);
    const r = summary(h.result);
    expect(product(r.plan,T3.productP)).toMatchObject({ cantidad: null, subtotal_conocido: 20, estado: 'parcial' });
    expect(product(r.ejecucion,T3.productP).cantidad).toBe(15);
    expect(h.body.respuesta).toMatch(/subtotal|parcial|sin dato/i);
  });

  it('does not manufacture complete container or mixture totals from a NULL row', async () => {
    const h = await execute({},(table,r) => table==='aplicaciones_calculos' ? changedRows(r,row => row.lote_id===ID.l1 ? {...row,numero_bultos:null,kilos_totales:null} : row) : r);
    const r = summary(h.result);
    expect(unitTotal(r.plan.recipientes,'bultos')).toMatchObject({ cantidad: null, subtotal_conocido: 2 });
    expect(unitTotal(r.plan.mezcla,'kg de mezcla')).toMatchObject({ cantidad: null, subtotal_conocido: 30 });
    expect(product(r.plan,T3.productP).cantidad).toBe(30);
  });

  it('retains explicit zero execution as measured zero instead of no-data', async () => {
    await db.query('update movimientos_diarios_productos set cantidad_utilizada=0 where producto_id=$1',[T3.productP]);
    const h = await execute(); const r = summary(h.result);
    expect(product(r.ejecucion,T3.productP)).toMatchObject({ cantidad: 0, subtotal_conocido: 0, estado: 'conocido' });
    expect(product(r.plan,T3.productP).cantidad).toBe(30);
  });

  it('retains incompatible units of the same product as unavailable totals, never pooling kg and L', async () => {
    await db.query("update movimientos_diarios_productos set unidad='Litros' where movimiento_diario_id=$1 and producto_id=$2",[MOVEMENTS.second,T3.productP]);
    const h = await execute(); const r = summary(h.result);
    const units = r.ejecucion.productos.filter(x => x.producto_id===T3.productP);
    expect(units.map(x => x.unidad).sort()).toEqual(['L','kg']);
    expect(units.every(x => x.cantidad===null && x.estado==='incompatible')).toBe(true);
    expect(product(r.plan,T3.productP).cantidad).toBe(30);
    expect(h.body.respuesta).toMatch(/incompatible/i);
  });

  it('keeps unread execution distinct from verified emptiness and preserves readable plan', async () => {
    const h = await execute({},(table,r) => table==='movimientos_diarios_productos' ? {...r,data:null,error:{message:'synthetic_transport_failure'}} : r);
    const r = summary(h.result);
    expect(h.result!.ejecucion.estado).toBe('no_leido');
    expect(r.ejecucion.productos).toEqual([]);
    expect(product(r.plan,T3.productP).cantidad).toBe(30);
    expect(h.body.respuesta).toMatch(/no pude leer/i);
    expect(h.body.respuesta).not.toMatch(/ejecuci[oó]n[^\n]*0\s*kg/i);
  });

  it('keeps missing required saved columns unread instead of creating zero totals', async () => {
    const h = await execute({},(table,r) => table==='aplicaciones_productos' ? changedRows(r,row => {delete row.cantidad_total_necesaria;return row;}) : r);
    const r = summary(h.result);
    expect(h.result!.plan.estado).toBe('parcial');
    expect(r.plan.productos).toHaveLength(2);
    expect(r.plan.productos.every(x => x.cantidad===null && x.subtotal_conocido===null && x.estado==='no_leido')).toBe(true);
    expect(product(r.ejecucion,T3.productP).cantidad).toBe(15);
  });

  it('does not fabricate zero consumed product when a complete movement read has no product children', async () => {
    await db.query('delete from movimientos_diarios_productos where movimiento_diario_id in ($1,$2,$3)',[MOVEMENTS.first,MOVEMENTS.second,MOVEMENTS.current]);
    const h = await execute(); const r = summary(h.result);
    expect(h.result!.ejecucion.estado).toBe('sin_productos');
    expect(r.ejecucion.productos).toEqual([]);
    expect(unitTotal(r.ejecucion.recipientes,'bultos').cantidad).toBe(4);
    expect(h.body.respuesta).toMatch(/no prueba consumo real cero/);
  });

  it('includes execution-only lots without inventing a plan and does not expose hidden parents', async () => {
    await db.query('delete from aplicaciones_calculos where lote_id=$1',[ID.l3]);
    const h = await execute(); const r = summary(h.result);
    expect(product(r.ejecucion,T3.productP).cantidad).toBe(15);
    expect(h.result!.ejecucion.filas.some(x => x.lote_id===ID.l3)).toBe(true);
    expect(h.body.respuesta).not.toMatch(/NO PUBLICAR/);
    expect(r.ejecucion.productos.some(x => x.producto_id===T3.hiddenProduct)).toBe(false);
  });

  it('does not merge distinct product IDs merely because their display names are equal', async () => {
    await db.query("update aplicaciones_productos set producto_nombre='Ingrediente compartido' where producto_id in ($1,$2)",[T3.productP,T3.productQ]);
    await db.query("update movimientos_diarios_productos set producto_nombre='Ingrediente compartido' where producto_id in ($1,$2)",[T3.productP,T3.productQ]);
    const h = await execute(); const r = summary(h.result);
    expect(r.plan.productos).toHaveLength(2);
    expect(product(r.plan,T3.productP).cantidad).toBe(30);
    expect(product(r.plan,T3.productQ).cantidad).toBe(10);
    const lines: string[] = h.body.respuesta.split('\n');
    const total = lines.find(x => /resumen|total.*aplicaci[oó]n/i.test(x) && /plan/i.test(x));
    expect(total).toBeDefined();
    expect(total).toContain('Ingrediente compartido');
    expect(total!.indexOf('Ingrediente compartido')).toBeLessThan(total!.indexOf(T3.productP));
  });

  it('rejects an Administrator before reading domain rows or invoking the planner', async () => {
    const h = await execute({},undefined,USUARIOS.administrador);
    expect(h.response.status).toBe(403);
    expect(h.solicitudes).toHaveLength(0);
    expect(h.trace.consultas.filter(x => x.tabla!=='usuarios')).toEqual([]);
  });
});
