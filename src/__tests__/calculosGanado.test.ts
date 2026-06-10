import { describe, it, expect } from 'vitest';
import {
  calcularKPIsInventario,
  cabezasPorHaFinca,
  calcularVariacion,
  construirMovimientosTraslado,
  validarSplitConfirmacion,
  cabezasDePendiente,
  construirAjustesMasivos,
  validarCargaInicial,
  construirMovimientosCargaInicial,
} from '@/utils/calculosGanado';
import type { InventarioPotreroRow } from '@/types/ganado';

function row(overrides: Partial<InventarioPotreroRow>): InventarioPotreroRow {
  return {
    potrero_id: 'p1',
    potrero: 'Potrero 1',
    finca_id: 'f1',
    finca: 'La Esperanza',
    ubicacion_id: 'u1',
    ubicacion: 'San Francisco',
    hectareas: 10,
    novillos: 0,
    toros: 0,
    peso_promedio_kg: null,
    updated_at: null,
    ...overrides,
  };
}

describe('calcularKPIsInventario', () => {
  it('suma novillos y toros y cuenta hectáreas una sola vez por finca', () => {
    const rows = [
      row({ potrero_id: 'p1', novillos: 30, toros: 2, hectareas: 10 }),
      row({ potrero_id: 'p2', novillos: 20, toros: 1, hectareas: 10 }), // misma finca f1
      row({ potrero_id: 'p3', finca_id: 'f2', finca: 'Otra', ubicacion: 'Supata', ubicacion_id: 'u2', novillos: 10, toros: 0, hectareas: 5 }),
    ];
    const kpis = calcularKPIsInventario(rows);
    expect(kpis.totalNovillos).toBe(60);
    expect(kpis.totalToros).toBe(3);
    expect(kpis.totalCabezas).toBe(63);
    // f1 = 10 ha (una vez), f2 = 5 ha
    expect(kpis.hectareasTotales).toBe(15);
    expect(kpis.cabezasPorHa).toBeCloseTo(63 / 15);
  });

  it('agrupa cabezas/ha por ubicación', () => {
    const rows = [
      row({ potrero_id: 'p1', novillos: 50, hectareas: 10 }),
      row({ potrero_id: 'p2', finca_id: 'f2', finca: 'Otra', ubicacion: 'Supata', ubicacion_id: 'u2', novillos: 8, hectareas: 4 }),
    ];
    const kpis = calcularKPIsInventario(rows);
    const sf = kpis.porUbicacion.find((u) => u.ubicacion === 'San Francisco')!;
    const sup = kpis.porUbicacion.find((u) => u.ubicacion === 'Supata')!;
    expect(sf.cabezas).toBe(50);
    expect(sf.cabezasPorHa).toBeCloseTo(5);
    expect(sup.cabezasPorHa).toBeCloseTo(2);
  });

  it('cabezasPorHa es null sin hectáreas configuradas', () => {
    const kpis = calcularKPIsInventario([row({ novillos: 10, hectareas: 0 })]);
    expect(kpis.cabezasPorHa).toBeNull();
  });
});

describe('cabezasPorHaFinca', () => {
  it('suma los potreros de la finca contra sus hectáreas', () => {
    const rows = [
      row({ potrero_id: 'p1', novillos: 12, hectareas: 10 }),
      row({ potrero_id: 'p2', novillos: 8, hectareas: 10 }),
    ];
    expect(cabezasPorHaFinca(rows, 'f1')).toBeCloseTo(2);
    expect(cabezasPorHaFinca(rows, 'inexistente')).toBeNull();
  });
});

describe('calcularVariacion', () => {
  it('separa entradas y salidas de movimientos confirmados en la ventana', () => {
    const movs = [
      { estado: 'confirmado' as const, fecha: '2026-06-01', novillos_delta: 10, toros_delta: 1 },
      { estado: 'confirmado' as const, fecha: '2026-06-05', novillos_delta: -4, toros_delta: 0 },
      { estado: 'pendiente' as const, fecha: '2026-06-05', novillos_delta: 99, toros_delta: 0 }, // ignorado
      { estado: 'confirmado' as const, fecha: '2026-04-01', novillos_delta: 50, toros_delta: 0 }, // fuera de ventana
    ];
    const v = calcularVariacion(movs, '2026-05-15');
    expect(v.entradas).toBe(11);
    expect(v.salidas).toBe(4);
    expect(v.neto).toBe(7);
  });
});

describe('construirMovimientosTraslado', () => {
  it('genera salida negativa en origen y entrada positiva en destino', () => {
    const [salida, entrada] = construirMovimientosTraslado({
      fecha: '2026-06-10',
      potreroOrigenId: 'pA',
      potreroDestinoId: 'pB',
      novillos: 15,
      toros: 1,
      pesoPromedioKg: 420,
      notas: 'rotación',
    });
    expect(salida.tipo).toBe('traslado_salida');
    expect(salida.potrero_origen_id).toBe('pA');
    expect(salida.potrero_destino_id).toBeNull();
    expect(salida.novillos_delta).toBe(-15);
    expect(salida.toros_delta).toBe(-1);
    expect(entrada.tipo).toBe('traslado_entrada');
    expect(entrada.potrero_destino_id).toBe('pB');
    expect(entrada.novillos_delta).toBe(15);
    expect(entrada.toros_delta).toBe(1);
    expect(entrada.peso_promedio_kg).toBe(420);
  });
});

describe('validarSplitConfirmacion', () => {
  it('acepta split que suma las cabezas de la transacción', () => {
    expect(validarSplitConfirmacion(18, 2, 20)).toBeNull();
  });
  it('rechaza suma incorrecta', () => {
    expect(validarSplitConfirmacion(18, 1, 20)).toContain('20');
  });
  it('rechaza negativos y no enteros', () => {
    expect(validarSplitConfirmacion(-1, 21, 20)).not.toBeNull();
    expect(validarSplitConfirmacion(1.5, 18.5, 20)).not.toBeNull();
  });
});

describe('cabezasDePendiente', () => {
  it('devuelve el total absoluto (venta llega con delta negativo)', () => {
    expect(cabezasDePendiente({ novillos_delta: -25, toros_delta: 0 })).toBe(25);
    expect(cabezasDePendiente({ novillos_delta: 12, toros_delta: 0 })).toBe(12);
  });
});

describe('construirAjustesMasivos', () => {
  it('solo genera ajustes para filas modificadas, con delta correcto', () => {
    const ajustes = construirAjustesMasivos(
      [
        { potrero_id: 'p1', novillosActual: 10, torosActual: 1, novillosNuevo: 12, torosNuevo: 1 },
        { potrero_id: 'p2', novillosActual: 5, torosActual: 0, novillosNuevo: 5, torosNuevo: 0 }, // sin cambio
        { potrero_id: 'p3', novillosActual: 8, torosActual: 2, novillosNuevo: 6, torosNuevo: 1 },
      ],
      '2026-06-10',
      'Conteo físico'
    );
    expect(ajustes).toHaveLength(2);
    expect(ajustes[0]).toMatchObject({ potrero_destino_id: 'p1', novillos_delta: 2, toros_delta: 0, notas: 'Conteo físico' });
    expect(ajustes[1]).toMatchObject({ potrero_destino_id: 'p3', novillos_delta: -2, toros_delta: -1 });
  });
});

describe('validarCargaInicial', () => {
  const filas = [
    { finca_id: 'f1', novillos: 30, toros: 2 },
    { finca_id: 'f2', novillos: 0, toros: 0 },
  ];
  it('acepta carga válida con nota', () => {
    expect(validarCargaInicial(filas, 'Inventario inicial')).toBeNull();
  });
  it('exige nota', () => {
    expect(validarCargaInicial(filas, '  ')).toContain('obligatoria');
  });
  it('rechaza negativos y no enteros', () => {
    expect(validarCargaInicial([{ finca_id: 'f1', novillos: -1, toros: 0 }], 'n')).not.toBeNull();
    expect(validarCargaInicial([{ finca_id: 'f1', novillos: 1.5, toros: 0 }], 'n')).not.toBeNull();
  });
  it('exige al menos una cabeza', () => {
    expect(validarCargaInicial([{ finca_id: 'f1', novillos: 0, toros: 0 }], 'n')).toContain('al menos');
  });
});

describe('construirMovimientosCargaInicial', () => {
  it('genera un ajuste confirmado por finca con cabezas, omitiendo las vacías', () => {
    const movs = construirMovimientosCargaInicial(
      [
        { finca_id: 'f1', novillos: 30, toros: 2 },
        { finca_id: 'f2', novillos: 0, toros: 0 },
        { finca_id: 'f3', novillos: 0, toros: 5 },
      ],
      { f1: 'pg1', f3: 'pg3' },
      '2026-06-10',
      'Inventario inicial'
    );
    expect(movs).toHaveLength(2);
    expect(movs[0]).toEqual({
      tipo: 'ajuste',
      estado: 'confirmado',
      fecha: '2026-06-10',
      potrero_destino_id: 'pg1',
      novillos_delta: 30,
      toros_delta: 2,
      notas: 'Inventario inicial',
    });
    expect(movs[1].potrero_destino_id).toBe('pg3');
    expect(movs[1].toros_delta).toBe(5);
  });

  it('omite fincas sin potrero mapeado (defensa contra mapa incompleto)', () => {
    const movs = construirMovimientosCargaInicial(
      [{ finca_id: 'f1', novillos: 10, toros: 0 }],
      {},
      '2026-06-10',
      'n'
    );
    expect(movs).toHaveLength(0);
  });
});
