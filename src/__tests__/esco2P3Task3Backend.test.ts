import { describe, expect, it } from 'vitest';
import { ejecutarCantidadesAplicacion, renderCantidadesAplicacion } from '@/utils/esco2/cantidades';
import type { DatosCantidadesAplicacion } from '@/utils/esco2/cantidadesTipos';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = id(1), M1 = id(2), M2 = id(3), L1 = id(4), L2 = id(5), L3 = id(6), P = id(7), Q = id(8);
function datos(): DatosCantidadesAplicacion {
  return {
    seleccion: 'ok', aplicacion: { id: A, tipo_aplicacion: 'Fertilización', nombre_aplicacion: 'Sintética', codigo_aplicacion: null },
    mezclas: [{ id: M1, aplicacion_id: A }, { id: M2, aplicacion_id: A }],
    calculos: [
      { id: id(11), aplicacion_id: A, lote_id: L1, mezcla_id: M1, total_arboles: 100, numero_bultos: 1, kilos_totales: 10 },
      { id: id(12), aplicacion_id: A, lote_id: L2, mezcla_id: M1, total_arboles: 100, numero_bultos: 1, kilos_totales: 10 },
      { id: id(13), aplicacion_id: A, lote_id: L3, mezcla_id: M2, total_arboles: 100, numero_bultos: 1, kilos_totales: 20 },
    ],
    bases_lotes: [
      { id: id(21), aplicacion_id: A, lote_id: L1, arboles_grandes: 100, arboles_medianos: 0, arboles_pequenos: 0, arboles_clonales: 0, total_arboles: 100 },
      { id: id(22), aplicacion_id: A, lote_id: L2, arboles_grandes: 0, arboles_medianos: 0, arboles_pequenos: 100, arboles_clonales: 0, total_arboles: 100 },
      { id: id(23), aplicacion_id: A, lote_id: L3, arboles_grandes: 50, arboles_medianos: 0, arboles_pequenos: 50, arboles_clonales: 0, total_arboles: 100 },
    ],
    productos_plan: [
      { id: id(31), mezcla_id: M1, producto_id: P, producto_nombre: 'Igual', producto_unidad: 'Kilos', cantidad_total_necesaria: 10, dosis_grandes: 100, dosis_medianos: 0, dosis_pequenos: 0, dosis_clonales: 0 },
      { id: id(32), mezcla_id: M1, producto_id: Q, producto_nombre: 'Igual', producto_unidad: 'Kilos', cantidad_total_necesaria: 10, dosis_grandes: 0, dosis_medianos: 0, dosis_pequenos: 100, dosis_clonales: 0 },
      { id: id(33), mezcla_id: M2, producto_id: P, producto_nombre: 'Igual', producto_unidad: 'Kilos', cantidad_total_necesaria: 20, dosis_grandes: 200, dosis_medianos: 200, dosis_pequenos: 200, dosis_clonales: 200 },
    ],
    movimientos: [{ id: id(41), aplicacion_id: A, lote_id: L1, fecha_movimiento: '2026-11-01', numero_bultos: 1 }, { id: id(42), aplicacion_id: A, lote_id: L3, fecha_movimiento: '2026-11-03', numero_bultos: 2 }],
    productos_ejecutados: [{ id: id(51), movimiento_diario_id: id(41), producto_id: P, producto_nombre: 'Igual', cantidad_utilizada: 3, unidad: 'Kilos' }, { id: id(52), movimiento_diario_id: id(41), producto_id: P, producto_nombre: 'Igual', cantidad_utilizada: 4, unidad: 'Kilos' }, { id: id(53), movimiento_diario_id: id(42), producto_id: P, producto_nombre: 'Igual', cantidad_utilizada: 8, unidad: 'Kilos' }],
    lotes: [{ id: L1, nombre: 'Igual' }, { id: L2, nombre: 'Igual' }, { id: L3, nombre: 'Tercero' }],
  };
}
describe('Task 3 exact saved-source quantity units', () => {
  it('uses product-specific class doses, never recipient proportions or product labels', () => {
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A }, datos(), 'p1');
    expect(r.plan.filas.find(x => x.lote_id === L1 && x.producto_id === P)?.cantidad).toBe(10);
    expect(r.plan.filas.find(x => x.lote_id === L2 && x.producto_id === P)?.cantidad).toBe(0);
    expect(r.plan.filas.find(x => x.lote_id === L1 && x.producto_id === Q)?.cantidad).toBe(0);
    expect(r.plan.filas.filter(x => x.producto_id === P).reduce((s, x) => s + x.cantidad!, 0)).toBe(30);
    expect(r.plan.totales_guardados.filter(x => x.producto_id === P).reduce((s, x) => s + x.cantidad!, 0)).toBe(30);
    expect(r.ejecucion.filas.filter(x => x.producto_id === P).reduce((s, x) => s + x.cantidad!, 0)).toBe(15);
    expect(r.plan.conciliacion.every(x => x.estado === 'coincide')).toBe(true);
    expect(r.estado).toBe('ok');
  });
  it('filters execution only, keeping the complete stored plan', () => {
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A, desde: '2026-11-03', hasta: '2026-11-03' }, datos(), 'p1');
    expect(r.plan.filas.filter(x => x.producto_id === P).reduce((s, x) => s + x.cantidad!, 0)).toBe(30);
    expect(r.ejecucion.filas.map(x => x.cantidad)).toEqual([8]);
    const text = renderCantidadesAplicacion(r);
    expect(text).toContain('Plan completo guardado'); expect(text).toContain('Ejecución');
    expect(text).toContain('3 de noviembre de 2026');
  });
  it('preserves NULL and unread bases separately without losing readable execution', () => {
    const d = datos(); d.bases_lotes![0].arboles_grandes = null; delete d.bases_lotes![1].arboles_grandes;
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A }, d, 'p1');
    expect(r.plan.filas.find(x => x.lote_id === L1)?.estado).toBe('sin_dato');
    expect(r.plan.filas.find(x => x.lote_id === L2)?.estado).toBe('no_leido');
    expect(r.ejecucion.estado).toBe('conocido');
    expect(renderCantidadesAplicacion(r)).toContain('sin dato para el plan exacto de este producto/lote');
  });
  it('reports stored-vs-exact discrepancies without scaling the result', () => {
    const d = datos(); d.productos_plan![0].cantidad_total_necesaria = 99;
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A }, d, 'p1');
    expect(r.plan.conciliacion.find(x => x.mezcla_id === M1 && x.producto_id === P)).toMatchObject({ guardado: 99, reconstruido: 10, estado: 'discrepancia' });
    expect(r.plan.filas.find(x => x.lote_id === L1 && x.producto_id === P)?.cantidad).toBe(10);
  });
  it('does not conceal a fine recorded discrepancy behind a business tolerance', () => {
    const d = datos(); d.productos_plan![0].cantidad_total_necesaria = 10 + 1e-10;
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A }, d, 'p1');
    expect(r.plan.conciliacion.find(x => x.mezcla_id === M1 && x.producto_id === P)?.estado).toBe('discrepancia');
  });
  it('allows only machine accumulation residue for a legitimate decimal sum', () => {
    const d = datos(); d.calculos![1].total_arboles = 200;
    d.bases_lotes![1].arboles_pequenos = 200; d.bases_lotes![1].total_arboles = 200;
    d.productos_plan![0] = { ...d.productos_plan![0], dosis_grandes: 1, dosis_medianos: 1, dosis_pequenos: 1, dosis_clonales: 1, cantidad_total_necesaria: .3 };
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A }, d, 'p1');
    expect(r.plan.conciliacion.find(x => x.mezcla_id === M1 && x.producto_id === P)?.estado).toBe('coincide');
  });
  it('uses the original unrounded liquid intermediate before ceil2', () => {
    const d = datos(); d.aplicacion!.tipo_aplicacion = 'Drench';
    d.mezclas = [d.mezclas![0]]; d.calculos = [{ id: id(11), aplicacion_id: A, lote_id: L1, mezcla_id: M1, total_arboles: 3, numero_canecas: .43, litros_mezcla: 3 }];
    d.bases_lotes = [{ id: id(21), aplicacion_id: A, lote_id: L1, total_arboles: 3, calibracion_litros_arbol: 1, tamano_caneca: 7 }];
    d.productos_plan = [{ id: id(31), mezcla_id: M1, producto_id: P, producto_unidad: 'Litros', cantidad_total_necesaria: .03, dosis_por_caneca: 70, unidad_dosis: 'cc' }];
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A }, d, 'p1');
    expect(r.plan.filas[0].cantidad).toBe(.03); expect(r.plan.filas[0].unidad).toBe('L');
    expect(r.plan.recipientes[0].cantidad).toBe(.43);
  });
  it('does not replace a NULL capacity by 200 L or a NULL dose by zero', () => {
    const d = datos(); d.aplicacion!.tipo_aplicacion = 'Fumigación'; d.bases_lotes![0].tamano_caneca = null;
    d.productos_plan![0].dosis_por_caneca = null;
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A }, d, 'p1');
    expect(r.plan.filas.find(x => x.lote_id === L1 && x.producto_id === P)?.cantidad).toBeNull();
  });
  it('does not turn unlinked mix mapping into product presence or missing execution into zero', () => {
    const d = datos(); d.calculos![0].mezcla_id = null; delete d.productos_ejecutados;
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A }, d, 'p1');
    expect(r.plan.filas.some(x => x.lote_id === L1)).toBe(false);
    expect(r.plan.recipientes.some(x => x.lote_id === L1)).toBe(true);
    expect(r.ejecucion.estado).toBe('no_leido'); expect(r.ejecucion.filas).toEqual([]);
  });
  it('rejects duplicate execution source IDs instead of counting twice', () => {
    const d = datos(); d.productos_ejecutados!.push(d.productos_ejecutados![0]);
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A }, d, 'p1');
    expect(r.ejecucion.estado).toBe('no_leido'); expect(r.plan.estado).toBe('conocido');
  });
});
