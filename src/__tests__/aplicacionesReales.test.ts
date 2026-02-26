import { describe, it, expect, beforeEach, vi } from 'vitest';

function createChainableMock(resolvedData: any = { data: [], error: null }) {
  const chain: any = {};
  const methods = ['select', 'eq', 'in'];
  methods.forEach((method) => {
    chain[method] = vi.fn(() => chain);
  });
  Object.defineProperty(chain, 'then', {
    value: (resolve: any, reject: any) => Promise.resolve(resolvedData).then(resolve, reject),
  });
  return chain;
}

const mockFrom = vi.fn();
const mockSupabase = {
  from: mockFrom,
};

vi.mock('../utils/supabase/client', () => ({
  getSupabase: () => mockSupabase,
}));

import {
  convertirUnidadBase,
  fetchDatosRealesAplicacion,
  fetchJornalesRealesPorLote,
} from '../utils/aplicacionesReales';

describe('aplicacionesReales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('convierte cc y g a unidades base', () => {
    expect(convertirUnidadBase(1500, 'cc')).toEqual({ cantidadBase: 1.5, unidadBase: 'Litros' });
    expect(convertirUnidadBase(2500, 'g')).toEqual({ cantidadBase: 2.5, unidadBase: 'Kilos' });
    expect(convertirUnidadBase(4, 'L')).toEqual({ cantidadBase: 4, unidadBase: 'Litros' });
    expect(convertirUnidadBase(3, 'kg')).toEqual({ cantidadBase: 3, unidadBase: 'Kilos' });
  });

  it('agrega movimientos y costos reales por lote', async () => {
    const movimientosChain = createChainableMock({
      data: [
        { id: 'mov-1', lote_id: 'lote-1', numero_canecas: 5, numero_bultos: 0 },
        { id: 'mov-2', lote_id: 'lote-1', numero_canecas: 3, numero_bultos: 0 },
        { id: 'mov-3', lote_id: 'lote-2', numero_canecas: 0, numero_bultos: 2 },
      ],
      error: null,
    });
    const productosMovChain = createChainableMock({
      data: [
        { movimiento_diario_id: 'mov-1', producto_id: 'prod-1', producto_nombre: 'Prod A', cantidad_utilizada: 1000, unidad: 'cc' },
        { movimiento_diario_id: 'mov-2', producto_id: 'prod-1', producto_nombre: 'Prod A', cantidad_utilizada: 500, unidad: 'cc' },
        { movimiento_diario_id: 'mov-3', producto_id: 'prod-2', producto_nombre: 'Prod B', cantidad_utilizada: 2, unidad: 'kg' },
      ],
      error: null,
    });
    const preciosChain = createChainableMock({
      data: [
        { id: 'prod-1', precio_unitario: 10000 },
        { id: 'prod-2', precio_unitario: 20000 },
      ],
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'movimientos_diarios') return movimientosChain;
      if (table === 'movimientos_diarios_productos') return productosMovChain;
      if (table === 'productos') return preciosChain;
      return createChainableMock();
    });

    const resultado = await fetchDatosRealesAplicacion('app-1');

    expect(resultado.movimientosPorLote.get('lote-1')).toEqual({ canecas: 8, bultos: 0 });
    expect(resultado.movimientosPorLote.get('lote-2')).toEqual({ canecas: 0, bultos: 2 });

    const insumosLote1 = resultado.insumosPorLote.get('lote-1');
    const insumosLote2 = resultado.insumosPorLote.get('lote-2');
    expect(insumosLote1?.cantidadTotal).toBeCloseTo(1.5);
    expect(insumosLote1?.costoTotal).toBeCloseTo(15000);
    expect(insumosLote2?.cantidadTotal).toBeCloseTo(2);
    expect(insumosLote2?.costoTotal).toBeCloseTo(40000);
  });

  it('agrega jornales y costo por lote desde tarea', async () => {
    const registrosChain = createChainableMock({
      data: [
        { lote_id: 'lote-1', fraccion_jornal: '1.0', costo_jornal: 50000 },
        { lote_id: 'lote-1', fraccion_jornal: '0.5', costo_jornal: 25000 },
        { lote_id: 'lote-2', fraccion_jornal: '1.0', costo_jornal: 60000 },
      ],
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'registros_trabajo') return registrosChain;
      return createChainableMock();
    });

    const resultado = await fetchJornalesRealesPorLote('tarea-1');
    expect(resultado.get('lote-1')).toEqual({ jornales: 1.5, costo: 75000 });
    expect(resultado.get('lote-2')).toEqual({ jornales: 1, costo: 60000 });
  });
});
