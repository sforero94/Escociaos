import { describe, expect, it } from 'vitest';
import { ejecutarCantidadesAplicacion, renderCantidadesAplicacion } from '@/utils/esco2/cantidades';
import type { DatosCantidadesAplicacion } from '@/utils/esco2/cantidadesTipos';
const A = '00000000-0000-4000-8000-000000000001', M = '00000000-0000-4000-8000-000000000002', P = '00000000-0000-4000-8000-000000000003';
const datos = (): DatosCantidadesAplicacion => ({ seleccion: 'ok', aplicacion: { id: A, tipo_aplicacion: 'Drench' }, mezclas: [], calculos: [], bases_lotes: [], productos_plan: [], movimientos: [{ id: M, aplicacion_id: A, lote_id: null, fecha_movimiento: '2026-11-01', numero_canecas: 0 }], productos_ejecutados: [{ id: P, movimiento_diario_id: M, producto_id: P, cantidad_utilizada: .004, unidad: 'Litros' }] });
describe('Task 3 precise source quantities', () => {
  it('never renders a nonzero sub-centesimal quantity as literal zero', () => {
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A }, datos(), 'p1');
    expect(renderCantidadesAplicacion(r)).toContain('0,004 L');
  });
  it('rejects overflow instead of publishing Infinity', () => {
    const d = datos(); d.productos_ejecutados![0].cantidad_utilizada = Number.MAX_VALUE;
    d.productos_ejecutados!.push({ ...d.productos_ejecutados![0], id: A });
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A }, d, 'p1');
    expect(r.ejecucion.filas[0].cantidad).toBeNull();
    expect(renderCantidadesAplicacion(r)).not.toMatch(/Infinity|∞/);
  });
  it('never accepts a different selected application ID', () => {
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: M }, datos(), 'p1');
    expect(r.estado).toBe('no_resuelto');
    expect(r.ejecucion.filas).toEqual([]);
  });
  it('does not filter an unread child relationship into a false empty set', () => {
    const d = datos(); Reflect.deleteProperty(d.productos_ejecutados![0], 'movimiento_diario_id');
    const r = ejecutarCantidadesAplicacion({ aplicacion_id: A }, d, 'p1');
    expect(r.ejecucion.estado).toBe('no_leido');
    expect(r.ejecucion.filas).toEqual([]);
  });
});
