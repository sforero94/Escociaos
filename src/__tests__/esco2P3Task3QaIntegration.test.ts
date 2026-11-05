// Independent Task 3 acceptance/table oracles, fixed before engine implementation.
// Given saved per-class trees/doses and distinct IDs, exact plan quantities are reconstructed
// with the original arithmetic, while movement-child execution remains a separate population.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { USUARIOS, type Traza } from './esco2ArnesRls.ts';
import { dependencies, forbidNetwork, ID, plan, request, tool } from './esco2P2Harness.ts';
import { APPS, MOVEMENTS, qaFaultClient, type QaProjection } from './esco2P3Task2QaHarness.ts';
import { T3, T3_ORACLE, task3QaDb, task3QaSeed } from './esco2P3Task3QaHarness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task3QaDb(); }, 30000);
beforeEach(async () => { await task3QaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });

type QaQuantity = { lote_id: string | null; producto_id: string; unidad: string | null; cantidad: number | null; estado: string; motivos: string[] };
type QaRecipient = { lote_id: string | null; cantidad: number | null; estado: string };
type QaStored = { mezcla_id: string; producto_id: string; unidad: string | null; cantidad: number | null; estado?: string };
type QaReconciliation = { mezcla_id: string; producto_id: string; unidad: string | null; guardado: number | null; reconstruido: number | null; estado: string };
type QaResult = { tipo: 'cantidades_aplicacion'; id: string; estado: string; plan: { estado: string; filas: QaQuantity[]; totales_guardados: QaStored[]; conciliacion: QaReconciliation[]; recipientes: QaRecipient[]; motivos: string[] }; ejecucion: { estado: string; filas: QaQuantity[]; recipientes: QaRecipient[]; motivos: string[] } };
const quantityCall = (overrides: Record<string, unknown> = {}) => ({ nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify({ aplicacion_id: T3.fertilizer, ...overrides }) });
function quantity(body: { resultados: unknown[] }): QaResult {
  const r = body.resultados.find(r => r && typeof r === 'object' && 'tipo' in r && r.tipo === 'cantidades_aplicacion');
  expect(r).toBeDefined();
  return r as QaResult;
}
const UNITS: Record<string, string> = { kg: 'Kilos', L: 'Litros', unidades: 'Unidades' };
const canonicalUnit = (unit: string | null) => UNITS[unit ?? ''] ?? unit;
function rows(values: QaQuantity[]) {
  return values.map(r => ({ lote_id: r.lote_id, producto_id: r.producto_id, unidad: canonicalUnit(r.unidad), cantidad: r.cantidad })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function oracle(values: ReadonlyArray<{ lote_id: string; producto_id: string; unidad: string; cantidad: number }>) {
  return [...values].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
async function execute(calls = [quantityCall()], fault?: (table: string, response: RespuestaPostgrest) => RespuestaPostgrest) {
  const traza: Traza = { consultas: [] };
  const projections: QaProjection[] = [];
  const h = dependencies(db, calls, { crearClienteUsuario: jwt => qaFaultClient(db, jwt, traza, projections, fault) });
  const response = await manejar(request({ pregunta: 'Plan y ejecución de productos por lote de la aplicación sintética' }), h.deps);
  return { ...h, traza, projections, response, body: await response.json() };
}
const updateRows = (response: RespuestaPostgrest, mutate: (row: Record<string, unknown>) => Record<string, unknown>) => ({ ...response, data: response.data?.map(row => mutate({ ...(row as Record<string, unknown>) })) ?? null });

// Physical units are intentionally not pooled by this helper.
function knownSum(values: QaQuantity[], product: string, unit: string) {
  return values.filter(r => r.producto_id === product && r.unidad === unit && r.estado === 'conocido').reduce((sum, r) => sum + (r.cantidad ?? 0), 0);
}

describe('Task 3 QA: literal quantities through real handler + fixed readers + synthetic SQL/RLS', () => {
  it('validates the frozen SQL oracle and proves permissive grandchildren outlive hidden parents', async () => {
    const actual = await db.transaction(async tx => {
      await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: USUARIOS.gerencia, role: 'authenticated' })]);
      await tx.exec('set local role authenticated');
      return tx.query<{ lote_id: string; producto_id: string; unidad: string; cantidad: number }>(`select m.lote_id::text,p.producto_id::text,p.unidad,sum(p.cantidad_utilizada)::float8 cantidad from aplicaciones a join movimientos_diarios m on m.aplicacion_id=a.id join movimientos_diarios_productos p on p.movimiento_diario_id=m.id where a.id=$1 group by m.lote_id,p.producto_id,p.unidad`, [T3.fertilizer]);
    });
    expect(oracle(actual.rows)).toEqual(oracle(T3_ORACLE.executionFertilizer));
    const all = await db.query<{ n: number }>('select count(*)::int n from movimientos_diarios_productos');
    expect(all.rows[0].n).toBe(7);
  });

  it('reconstructs fertilizer product-by-tree-class plan instead of bulto-proportional allocation', async () => {
    const h = await execute();
    expect(h.response.status).toBe(200);
    const r = quantity(h.body);
    expect(rows(r.plan.filas)).toEqual(oracle(T3_ORACLE.planFertilizer));
    expect(r.plan.filas.every(x => x.estado === 'conocido')).toBe(true);
    expect(r.plan.filas.find(x => x.lote_id === ID.l1 && x.producto_id === T3.productQ)?.cantidad).toBe(0);
    expect(r.plan.filas.find(x => x.lote_id === ID.l2 && x.producto_id === T3.productP)?.cantidad).toBe(0);
    expect(r.plan.estado).toBe('conocido');
    expect(r.plan.conciliacion).toEqual(expect.arrayContaining([
      expect.objectContaining({ mezcla_id: T3.mix1, producto_id: T3.productP, guardado: 10, reconstruido: 10, estado: 'coincide' }),
      expect.objectContaining({ mezcla_id: T3.mix1, producto_id: T3.productQ, guardado: 10, reconstruido: 10, estado: 'coincide' }),
      expect.objectContaining({ mezcla_id: T3.mix2, producto_id: T3.productP, guardado: 20, reconstruido: 20, estado: 'coincide' }),
    ]));
  });

  it('accumulates the same product across different mixes once without display-name joins or lot fanout', async () => {
    const h = await execute();
    const r = quantity(h.body);
    expect(knownSum(r.plan.filas, T3.productP, 'kg')).toBe(30);
    expect(knownSum(r.plan.filas, T3.productQ, 'kg')).toBe(10);
    expect(r.plan.totales_guardados.filter(x => x.producto_id === T3.productP).map(x => x.cantidad).sort((a, b) => Number(a) - Number(b))).toEqual([10, 20]);
    expect(r.plan.filas.filter(x => x.producto_id === T3.productP)).toHaveLength(3);
    expect(r.plan.filas.filter(x => x.lote_id === ID.l1 || x.lote_id === ID.l2)).toHaveLength(4);
  });

  it('keeps execution child quantities distinct from the complete saved plan with no combined physical total', async () => {
    const h = await execute();
    const r = quantity(h.body);
    expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionFertilizer));
    expect(knownSum(r.plan.filas, T3.productP, 'kg')).toBe(30);
    expect(knownSum(r.ejecucion.filas, T3.productP, 'kg')).toBe(15);
    expect(h.body.respuesta).toMatch(/plan/i);
    expect(h.body.respuesta).toMatch(/ejecuci[oó]n/i);
    expect(h.body.respuesta).not.toMatch(/45\s*kg/);
    expect(h.solicitudes).toHaveLength(1);
    expect(h.body.llamadas).toHaveLength(1);
    expect(h.traza.consultas.every(q => q.rol === 'authenticated')).toBe(true);
    expect(h.projections.every(q => !q.columnas.includes('*'))).toBe(true);
    expect(h.projections.some(q => q.tabla === 'aplicaciones_lotes_planificado' || q.tabla === 'aplicaciones_compras')).toBe(false);
  });

  it('filters only execution by movement date while the plan stays complete', async () => {
    const h = await execute([quantityCall({ desde: '2026-11-02', hasta: '2026-11-03' })]);
    const r = quantity(h.body);
    expect(rows(r.plan.filas)).toEqual(oracle(T3_ORACLE.planFertilizer));
    expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionFertilizerPeriod));
    expect(h.body.respuesta).toMatch(/plan.*completo/i);
    expect(h.body.respuesta).toContain('2 de noviembre de 2026');
    expect(h.body.respuesta).toContain('3 de noviembre de 2026');
  });

  it('uses the original unrounded caneca intermediate before product ceil2 for Drench', async () => {
    const h = await execute([quantityCall({ aplicacion_id: T3.liquid })]);
    const r = quantity(h.body);
    expect(rows(r.plan.filas)).toEqual(oracle(T3_ORACLE.planLiquid));
    expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionLiquid));
    expect(r.plan.filas[0].cantidad).not.toBe(0.04);
    expect(r.plan.conciliacion[0]).toMatchObject({ guardado: 0.03, reconstruido: 0.03, estado: 'coincide' });
  });

  it.each(['Fumigación', 'Drench'])('uses the same original liquid calculation for %s', async kind => {
    await db.query('update aplicaciones set tipo_aplicacion=$1 where id=$2', [kind, T3.liquid]);
    const h = await execute([quantityCall({ aplicacion_id: T3.liquid })]);
    expect(rows(quantity(h.body).plan.filas)).toEqual(oracle(T3_ORACLE.planLiquid));
  });

  it('binds different quantities for duplicate displayed lot labels to distinct lot identities', async () => {
    const h = await execute();
    const lines = h.body.respuesta.split('\n');
    expect(lines.some((line: string) => line.includes(ID.l1) && line.includes(T3.productP) && /10\s*kg/.test(line))).toBe(true);
    expect(lines.some((line: string) => line.includes(ID.l2) && line.includes(T3.productP) && /0\s*kg/.test(line))).toBe(true);
  });

  it('does not hide an actual fine stored-vs-reconstructed discrepancy behind a business-size epsilon', async () => {
    await db.query("update aplicaciones_productos set cantidad_total_necesaria='10.0000000001'::numeric where mezcla_id=$1 and producto_id=$2", [T3.mix1,T3.productP]);
    const r = quantity((await execute()).body);
    expect(r.plan.conciliacion.find(x => x.mezcla_id === T3.mix1 && x.producto_id === T3.productP)).toMatchObject({ guardado: 10.0000000001, reconstruido: 10, estado: 'discrepancia' });
  });

  it('accepts only floating-point residue when exact decimal source sum is 0.1 + 0.2 = 0.3', async () => {
    await db.query('update aplicaciones_productos set dosis_grandes=1,dosis_medianos=0,dosis_pequenos=2,dosis_clonales=0,cantidad_total_necesaria=0.3 where mezcla_id=$1 and producto_id=$2', [T3.mix1,T3.productP]);
    await db.query('update aplicaciones_calculos set kilos_totales=case when lote_id=$1 then 0.1 else 10.2 end where aplicacion_id=$2 and mezcla_id=$3', [ID.l1,T3.fertilizer,T3.mix1]);
    const r = quantity((await execute()).body);
    expect(r.plan.conciliacion.find(x => x.mezcla_id === T3.mix1 && x.producto_id === T3.productP)).toMatchObject({ guardado: 0.3, estado: 'coincide' });
    expect(r.plan.filas.find(x => x.lote_id === ID.l1 && x.producto_id === T3.productP)?.cantidad).toBe(0.1);
    expect(r.plan.filas.find(x => x.lote_id === ID.l2 && x.producto_id === T3.productP)?.cantidad).toBe(0.2);
  });

  it.each(['null', 'unread'])('does not turn a %s stored mix total into zero or erase the independently exact rows', async state => {
    const h = await execute(undefined, (table, response) => table !== 'aplicaciones_productos' ? response : updateRows(response, row => {
      if (row.mezcla_id === T3.mix1 && row.producto_id === T3.productP) {
        if (state === 'null') row.cantidad_total_necesaria = null;
        else delete row.cantidad_total_necesaria;
      }
      return row;
    }));
    const r = quantity(h.body);
    expect(rows(r.plan.filas)).toEqual(oracle(T3_ORACLE.planFertilizer));
    expect(r.plan.totales_guardados.find(x => x.mezcla_id === T3.mix1 && x.producto_id === T3.productP)).toMatchObject({ cantidad: null, estado: state === 'null' ? 'sin_dato' : 'no_leido' });
    expect(r.plan.conciliacion.find(x => x.mezcla_id === T3.mix1 && x.producto_id === T3.productP)).toMatchObject({ guardado: null, reconstruido: 10, estado: 'no_verificable' });
  });

  it.each([['plan', 'null'], ['plan', 'unread'], ['ejecucion', 'null'], ['ejecucion', 'unread']])('does not turn a %s recipient quantity %s into a recorded zero', async (side, state) => {
    const table = side === 'plan' ? 'aplicaciones_calculos' : 'movimientos_diarios';
    const h = await execute(undefined, (t, response) => t !== table ? response : updateRows(response, row => {
      if (row.aplicacion_id === T3.fertilizer && row.lote_id === ID.l1) {
        if (state === 'null') row.numero_bultos = null;
        else delete row.numero_bultos;
      }
      return row;
    }));
    const r = quantity(h.body);
    const recipients = side === 'plan' ? r.plan.recipientes : r.ejecucion.recipientes;
    expect(recipients.find(x => x.lote_id === ID.l1)).toMatchObject({ cantidad: null, estado: state === 'null' ? 'sin_dato' : 'no_leido' });
    expect(rows(r.plan.filas)).toEqual(oracle(T3_ORACLE.planFertilizer));
    expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionFertilizer));
  });

  it('reports stored/reconstructed mismatch without rescaling or deleting exact rows', async () => {
    await db.query('update aplicaciones_productos set cantidad_total_necesaria=99 where mezcla_id=$1 and producto_id=$2', [T3.mix1, T3.productP]);
    const h = await execute();
    const r = quantity(h.body);
    expect(rows(r.plan.filas)).toEqual(oracle(T3_ORACLE.planFertilizer));
    expect(r.plan.conciliacion.find(x => x.mezcla_id === T3.mix1 && x.producto_id === T3.productP)).toMatchObject({ guardado: 99, reconstruido: 10, estado: 'discrepancia' });
    expect(h.body.respuesta).toMatch(/discrepan|no coincide|diferencia/i);
  });

  it.each([null, '82000000-0000-4000-8000-999999999999'])('propagates unavailable mixture mapping %s without inventing product presence/reconciliation', async mapping => {
    await db.query('update aplicaciones_calculos set mezcla_id=$1 where aplicacion_id=$2 and lote_id=$3', [mapping, T3.fertilizer, ID.l1]);
    const h = await execute();
    const r = quantity(h.body);
    expect(r.plan.filas.filter(x => x.lote_id === ID.l1).every(x => x.cantidad === null)).toBe(true);
    expect(r.plan.estado).toBe('parcial');
    expect(r.plan.conciliacion.every(x => x.estado !== 'coincide')).toBe(true);
    expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionFertilizer));
  });

  it.each(['null', 'unread'])('distinguishes required dose %s from explicit zero, preserving the other mix and execution', async state => {
    if (state === 'null') await db.query('update aplicaciones_productos set dosis_grandes=null where mezcla_id=$1 and producto_id=$2', [T3.mix1, T3.productP]);
    const h = await execute(undefined, state !== 'unread' ? undefined : (table, response) => table !== 'aplicaciones_productos' ? response : updateRows(response, row => {
      if (row.mezcla_id === T3.mix1 && row.producto_id === T3.productP) delete row.dosis_grandes;
      return row;
    }));
    const r = quantity(h.body);
    const missing = r.plan.filas.find(x => x.lote_id === ID.l1 && x.producto_id === T3.productP)!;
    expect(missing.cantidad).toBeNull();
    expect(missing.estado).toBe(state === 'null' ? 'sin_dato' : 'no_leido');
    expect(missing.motivos.join(' ')).toMatch(state === 'null' ? /null|nulo/i : /no.le[ií]do|unread/i);
    expect(r.plan.filas.find(x => x.lote_id === ID.l3 && x.producto_id === T3.productP)?.cantidad).toBe(20);
    expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionFertilizer));
  });

  it.each([null, 0])('never supplies the helper default of 200 L when saved capacity is %s', async capacity => {
    await db.query('update aplicaciones_lotes set tamano_caneca=$1 where aplicacion_id=$2', [capacity, T3.liquid]);
    const h = await execute([quantityCall({ aplicacion_id: T3.liquid })]);
    const r = quantity(h.body);
    expect(r.plan.filas).toHaveLength(1);
    expect(r.plan.filas.every(x => x.cantidad === null)).toBe(true);
    expect(r.plan.estado).toBe('parcial');
    expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionLiquid));
  });

  it.each(['arboles_grandes', 'calibracion_litros_arbol'])('does not replace unread saved %s with current lot data or a default', async field => {
    const app = field === 'arboles_grandes' ? T3.fertilizer : T3.liquid;
    const h = await execute([quantityCall({ aplicacion_id: app })], (table, response) => table !== 'aplicaciones_lotes' ? response : updateRows(response, row => {
      if (row.aplicacion_id === app && row.lote_id === ID.l1) delete row[field];
      return row;
    }));
    const r = quantity(h.body);
    const affected = r.plan.filas.filter(x => x.lote_id === ID.l1 && x.producto_id === (app === T3.fertilizer ? T3.productP : T3.productR));
    expect(affected).toHaveLength(1);
    expect(affected[0]).toMatchObject({ cantidad: null, estado: 'no_leido' });
    expect(rows(r.ejecucion.filas)).toEqual(oracle(app === T3.fertilizer ? T3_ORACLE.executionFertilizer : T3_ORACLE.executionLiquid));
  });

  it('does not turn an unread required saved-base lote FK into verified absence of that base', async () => {
    const h = await execute(undefined, (table, response) => table !== 'aplicaciones_lotes' ? response : updateRows(response, row => {
      if (row.aplicacion_id === T3.fertilizer && row.lote_id === ID.l1) delete row.lote_id;
      return row;
    }));
    const r = quantity(h.body);
    const affected = r.plan.filas.find(x => x.lote_id === ID.l1 && x.producto_id === T3.productP);
    if (affected) expect(affected).toMatchObject({ cantidad: null, estado: 'no_leido' });
    else expect(r.plan.motivos.join(' ')).toMatch(/no.le[ií]do|no_disponible/i);
    expect(r.plan.estado).not.toBe('conocido');
    expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionFertilizer));
  });

  it('preserves an explicit zero saved tree base as a known zero calculation', async () => {
    await db.query('update aplicaciones_lotes set arboles_grandes=0,total_arboles=0 where aplicacion_id=$1', [T3.liquid]);
    await db.query('update aplicaciones_calculos set total_arboles=0,numero_canecas=0,litros_mezcla=0 where aplicacion_id=$1', [T3.liquid]);
    await db.query('update aplicaciones_productos set cantidad_total_necesaria=0 where mezcla_id=$1', [T3.liquidMix]);
    const h = await execute([quantityCall({ aplicacion_id: T3.liquid })]);
    expect(quantity(h.body).plan.filas[0]).toMatchObject({ cantidad: 0, estado: 'conocido' });
  });

  it('keeps kg and L separate in mixed-product fertilizer instead of pooling physical amounts', async () => {
    await db.query("update aplicaciones_productos set producto_unidad='Litros' where producto_id=$1", [T3.productQ]);
    const h = await execute();
    const r = quantity(h.body);
    expect(knownSum(r.plan.filas, T3.productP, 'kg')).toBe(30);
    expect(knownSum(r.plan.filas, T3.productQ, 'L')).toBe(10);
    expect(knownSum(r.plan.filas, T3.productQ, 'kg')).toBe(0);
    expect(h.body.respuesta).toMatch(/kg/);
    expect(h.body.respuesta).toMatch(/\bL\b/);
  });

  it.each([['Kilos', 'cc'], ['Litros', 'g'], ['Unidades', 'cc']])('refuses a liquid unit/dose incompatibility %s/%s without fake quantities', async (unit, doseUnit) => {
    await db.query('update aplicaciones_productos set producto_unidad=$1,unidad_dosis=$2 where mezcla_id=$3', [unit, doseUnit, T3.liquidMix]);
    const h = await execute([quantityCall({ aplicacion_id: T3.liquid })]);
    const r = quantity(h.body);
    expect(r.plan.filas).toHaveLength(1);
    expect(r.plan.filas.every(x => x.cantidad === null && x.estado === 'incompatible')).toBe(true);
    expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionLiquid));
  });

  it('supports liquid grams-to-kg as a legitimate conversion without merging execution liters', async () => {
    await db.query("update aplicaciones_productos set producto_unidad='Kilos',unidad_dosis='g' where mezcla_id=$1", [T3.liquidMix]);
    const h = await execute([quantityCall({ aplicacion_id: T3.liquid })]);
    const r = quantity(h.body);
    expect(r.plan.filas[0]).toMatchObject({ unidad: 'kg', cantidad: 0.03, estado: 'conocido' });
    expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionLiquid));
  });

  it('does not divide a fertilizer count in Unidades by 1000 as though it were g or cc', async () => {
    await db.query("update aplicaciones_productos set producto_unidad='Unidades' where producto_id=$1", [T3.productP]);
    const r = quantity((await execute()).body);
    expect(r.plan.filas.filter(x => x.producto_id === T3.productP).every(x => x.cantidad === null && x.estado === 'incompatible')).toBe(true);
    expect(knownSum(r.plan.filas, T3.productQ, 'kg')).toBe(10);
  });

  it.each(['aplicaciones_productos', 'aplicaciones_lotes', 'movimientos_diarios_productos'])('keeps the independent side when %s cannot be read', async table => {
    const h = await execute(undefined, (t, response) => t === table ? { data: null, count: null, error: { message: 'QA PRIVATE FAILURE' } } : response);
    const r = quantity(h.body);
    if (table === 'movimientos_diarios_productos') {
      expect(r.ejecucion.estado).toBe('no_leido');
      expect(rows(r.plan.filas)).toEqual(oracle(T3_ORACLE.planFertilizer));
    } else {
      expect(r.plan.estado).not.toBe('conocido');
      expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionFertilizer));
    }
    expect(h.body.respuesta).not.toContain('QA PRIVATE FAILURE');
  });

  it('represents a verified empty planned-product relation as no recorded products, not zero planned consumption', async () => {
    await db.query('delete from aplicaciones_productos where mezcla_id in($1,$2)', [T3.mix1,T3.mix2]);
    const h = await execute();
    const r = quantity(h.body);
    expect(r.plan.estado).toBe('sin_filas');
    expect(r.plan.filas).toEqual([]);
    expect(r.plan.totales_guardados).toEqual([]);
    expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionFertilizer));
    expect(h.body.respuesta).not.toMatch(/plan(?:eado|ificado)?[.: ]+0\s*kg/i);
  });

  it('distinguishes no products recorded on existing movements from no movements and explicit recorded zero', async () => {
    await db.query('delete from movimientos_diarios_productos where movimiento_diario_id in($1,$2,$3)', [MOVEMENTS.first,MOVEMENTS.second,MOVEMENTS.current]);
    const missing = quantity((await execute()).body);
    expect(missing.ejecucion.estado).toBe('sin_productos');
    await db.query("insert into movimientos_diarios_productos values('86000000-0000-4000-8000-000000000099',$1,$2,'Insumo repetido','Sintético',0,'Kilos')", [MOVEMENTS.first,T3.productP]);
    const zero = quantity((await execute()).body);
    expect(zero.ejecucion.filas.find(x => x.producto_id === T3.productP)).toMatchObject({ cantidad: 0, estado: 'conocido' });
    await db.query('delete from movimientos_diarios where aplicacion_id=$1', [T3.fertilizer]);
    const empty = quantity((await execute()).body);
    expect(empty.ejecucion.estado).toBe('sin_movimientos');
  });

  it('cannot leak quantities from a hidden application, mix, or movement through a permissive child table', async () => {
    const h = await execute();
    const r = quantity(h.body);
    expect(rows(r.plan.filas)).toEqual(oracle(T3_ORACLE.planFertilizer));
    expect(rows(r.ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionFertilizer));
    expect(r.plan.totales_guardados.some(x => x.producto_id === T3.hiddenProduct)).toBe(false);
    expect(h.body.respuesta).not.toMatch(/NO PUBLICAR|555|777|999/);
  });

  it('renders a known tiny nonzero execution quantity without rounding it into a false zero', async () => {
    await db.query('update movimientos_diarios_productos set cantidad_utilizada=0.004 where producto_id=$1', [T3.productR]);
    const h = await execute([quantityCall({ aplicacion_id: T3.liquid })]);
    expect(quantity(h.body).ejecucion.filas[0]).toMatchObject({ cantidad: 0.004, estado: 'conocido' });
    expect(h.body.respuesta).toContain('0,004');
    expect(h.body.respuesta).not.toMatch(/0,00\s*L/);
  });

  it('refuses a nonfinite aggregate of finite execution quantities while preserving independent rows', async () => {
    await db.query("update movimientos_diarios_productos set cantidad_utilizada='1e308'::numeric where movimiento_diario_id=$1 and producto_id=$2", [MOVEMENTS.first,T3.productP]);
    const h = await execute();
    const r = quantity(h.body);
    const overflow = r.ejecucion.filas.find(x => x.lote_id === ID.l1 && x.producto_id === T3.productP)!;
    expect(overflow.cantidad).toBeNull();
    expect(overflow.estado).not.toBe('conocido');
    expect(r.ejecucion.filas.find(x => x.lote_id === ID.l3 && x.producto_id === T3.productP)).toMatchObject({ cantidad: 8, estado: 'conocido' });
    expect(h.body.respuesta).not.toMatch(/Infinity|NaN/);
    expect(rows(r.plan.filas)).toEqual(oracle(T3_ORACLE.planFertilizer));
  });

  it('does not certify a truncated execution-product reader as complete', async () => {
    const h = await execute(undefined, (table, response) => table !== 'movimientos_diarios_productos' || typeof response.count !== 'number' ? response : { ...response, count: response.count + 1 });
    const r = quantity(h.body);
    expect(r.ejecucion.estado).toBe('no_leido');
    expect(rows(r.plan.filas)).toEqual(oracle(T3_ORACLE.planFertilizer));
  });

  it('retains a future execution movement as a dated record with uncertainty, not completed-work proof', async () => {
    await db.query("update movimientos_diarios set fecha_movimiento='2026-11-10' where id=$1", [MOVEMENTS.second]);
    const h = await execute([quantityCall({ desde: '2026-11-10', hasta: '2026-11-10' })]);
    expect(knownSum(quantity(h.body).ejecucion.filas, T3.productP, 'kg')).toBe(8);
    expect(h.body.respuesta).toMatch(/futur|posterior.*hoy/i);
    expect(h.body.respuesta).toMatch(/no prueba|no prueban/i);
  });

  it('preserves independent labor in a multipart request with unavailable plan quantities', async () => {
    const h = await execute([tool(plan()), quantityCall()], (table, response) => table === 'aplicaciones_productos' ? { data: null, count: null, error: { message: 'QA PRIVATE FAILURE' } } : response);
    expect(h.body.resultados[0].total).toMatchObject({ jornales: 2.5, costo: 250 });
    expect(h.body.resultados[0].id).toBe('p1');
    expect(quantity(h.body).id).toBe('p2');
    expect(rows(quantity(h.body).ejecucion.filas)).toEqual(oracle(T3_ORACLE.executionFertilizer));
  });

  it('does not resolve an invisible application selector using its readable children', async () => {
    const h = await execute([quantityCall({ aplicacion_id: APPS.hidden })]);
    expect(quantity(h.body).estado).toBe('no_resuelto');
    expect(h.body.respuesta).not.toMatch(/NO PUBLICAR|999|777|555/);
  });
});
