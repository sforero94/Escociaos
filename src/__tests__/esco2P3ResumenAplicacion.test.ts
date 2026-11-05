import { describe, expect, it } from 'vitest';
import { resumirCantidadesAplicacion } from '@/utils/esco2/cantidadesResumen';
import { renderCantidadesAplicacion } from '@/utils/esco2/cantidades';
import type { CantidadPorLote, RecipienteGuardado, ResultadoCantidadesAplicacion, TotalProductoGuardado } from '@/utils/esco2/cantidadesTipos';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P = id(1), Q = id(2), M1 = id(3), M2 = id(4), L1 = id(5), L2 = id(6);
const saved = (mix: string, quantity: number | null): TotalProductoGuardado => ({ mezcla_id: mix, producto_id: P, producto_nombre: 'Insumo sintético', unidad: 'kg', cantidad: quantity, estado: quantity === null ? 'sin_dato' : 'conocido', motivos: [] });
const lot = (lote_id: string, cantidad: number | null): CantidadPorLote => ({ lote_id, lote_nombre: 'Lote sintético', producto_id: P, producto_nombre: 'Insumo sintético', unidad: 'kg', cantidad, estado: cantidad === null ? 'sin_dato' : 'conocido', motivos: [], fuentes: [id(20), lote_id] });
const container = (lote_id: string, cantidad: number | null, mass: number | null): RecipienteGuardado => ({ lote_id, lote_nombre: 'Lote sintético', unidad: 'bultos', cantidad, estado: cantidad === null ? 'sin_dato' : 'conocido', motivos: [], fuentes: [lote_id], mezcla_litros_kilos: { unidad: 'kg de mezcla', cantidad: mass, estado: mass === null ? 'sin_dato' : 'conocido' } });
function fixture(): ResultadoCantidadesAplicacion {
  return { tipo: 'cantidades_aplicacion', id: 'p1', estado: 'ok', consulta: { aplicacion_id: id(9) }, aplicacion: { id: id(9), nombre_aplicacion: 'Aplicación sintética' }, plan: { estado: 'conocido', filas: [lot(L1, 200), lot(L2, 300)], totales_guardados: [saved(M1, 2), saved(M2, 3)], conciliacion: [], recipientes: [container(L1, 2, 10), container(L2, 3, 20)], motivos: [], avisos: [] }, ejecucion: { estado: 'conocido', filas: [lot(L1, 4), lot(L2, 5)], recipientes: [{ ...container(L1, 1, 90), mezcla_litros_kilos: undefined }, { ...container(L2, 2, 90), mezcla_litros_kilos: undefined }], motivos: [] }, fuente: 'lecturas_independientes' };
}
describe('resumen por aplicación, fuentes independientes', () => {
  it('sums saved mixture products once, execution by product/unit, and containers separately', () => {
    const summary = resumirCantidadesAplicacion(fixture());
    expect(summary.plan.productos[0]).toMatchObject({ producto_id: P, cantidad: 5, unidad: 'kg', estado: 'conocido' });
    expect(summary.ejecucion.productos[0]).toMatchObject({ producto_id: P, cantidad: 9, unidad: 'kg', estado: 'conocido' });
    expect(summary.plan.recipientes[0]).toMatchObject({ cantidad: 5, unidad: 'bultos' });
    expect(summary.plan.mezcla[0]).toMatchObject({ cantidad: 30, unidad: 'kg de mezcla' });
    expect(summary.ejecucion.recipientes[0].cantidad).toBe(3);
    expect(summary.ejecucion.mezcla).toEqual([]);
  });
  it('keeps separate identities even if labels coincide', () => {
    const r = fixture(); r.ejecucion.filas.push({ ...lot(L1, 7), producto_id: Q });
    const xs = resumirCantidadesAplicacion(r).ejecucion.productos;
    expect(xs).toHaveLength(2); expect(xs.map(x => x.cantidad)).toEqual([9, 7]);
  });
  it('retains the stored amount with no_concilia instead of adding reconstructed per-lot rows', () => {
    const r = fixture(); r.plan.estado = 'parcial';
    r.plan.conciliacion = [{ mezcla_id: M1, producto_id: P, unidad: 'kg', guardado: 2, reconstruido: 100, estado: 'discrepancia' }];
    expect(resumirCantidadesAplicacion(r).plan.productos[0]).toMatchObject({ cantidad: 5, estado: 'no_concilia' });
  });
  it('never labels a known subtotal as the total when one product amount is NULL', () => {
    const r = fixture(); r.plan.estado = 'parcial'; r.plan.totales_guardados[1] = saved(M2, null);
    expect(resumirCantidadesAplicacion(r).plan.productos[0]).toMatchObject({ cantidad: null, subtotal_conocido: 2, estado: 'parcial' });
  });
  it('retains incomplete container and mixture amounts as separate partial subtotals', () => {
    const r = fixture(); r.plan.recipientes[1] = container(L2, null, null);
    const s = resumirCantidadesAplicacion(r).plan;
    expect(s.recipientes[0]).toMatchObject({ cantidad: null, subtotal_conocido: 2, estado: 'parcial' });
    expect(s.mezcla[0]).toMatchObject({ cantidad: null, subtotal_conocido: 10, estado: 'parcial' });
  });
  it('preserves explicit zero and distinguishes no rows from unread rows', () => {
    const r = fixture(); r.plan.totales_guardados = [saved(M1, 0)];
    expect(resumirCantidadesAplicacion(r).plan.productos[0].cantidad).toBe(0);
    r.plan.estado = 'sin_filas'; r.plan.totales_guardados = []; r.plan.recipientes = [];
    expect(resumirCantidadesAplicacion(r).plan).toMatchObject({ estado: 'sin_filas', productos: [], recipientes: [], mezcla: [] });
    r.plan.estado = 'no_leido';
    expect(resumirCantidadesAplicacion(r).plan).toMatchObject({ estado: 'no_leido', productos: [], recipientes: [], mezcla: [] });
  });
  it('retains incompatible product units without adding or publishing a combined total', () => {
    const r = fixture(); r.plan.totales_guardados[1] = { ...saved(M2, 3), unidad: 'L' };
    const xs = resumirCantidadesAplicacion(r).plan.productos;
    expect(xs).toHaveLength(2); expect(xs.every(x => x.estado === 'incompatible' && x.cantidad === null)).toBe(true);
  });
  it('adds compact summaries while preserving the per-lot explanation and source labels', () => {
    const text = renderCantidadesAplicacion(fixture());
    expect(text).toContain('Resumen del plan guardado');
    expect(text).toContain('Insumo sintético 5 kg');
    expect(text).toContain('5 bultos; 30 kg de mezcla');
    expect(text).toContain('Resumen de ejecución');
    expect(text).toContain('Insumo sintético 9 kg');
    expect(text).toContain('Plan por lote:');
    expect(text).toContain('no son unidades de mezcla ni agua registrada');
    expect(text.split('\n').filter(x => /Resumen d/.test(x))).toHaveLength(2);
  });
});
