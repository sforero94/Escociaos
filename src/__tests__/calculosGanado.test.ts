import { describe, it, expect } from 'vitest';
import {
  calcularKPIsInventario,
  cabezasPorHaFinca,
  calcularVariacion,
  validarRepartoConfirmacion,
  validarTrasladoMulti,
  validarExistencias,
  filasConCabezas,
  totalCabezasReparto,
  cabezasDePendiente,
  construirAjustesMasivos,
  validarCargaInicial,
  construirMovimientosCargaInicial,
  derivarLoteEtapaDeNombre,
  construirArbolInventario,
  resumirEtapas,
  agruparMovimientos,
  calcularSaldosPorPotrero,
  cabezasFueraDeFincaActiva,
  antiguedadEnDias,
} from '@/utils/calculosGanado';
import type { InventarioPotreroRow, MovimientoConContexto } from '@/types/ganado';

/** Atajo semántico para el snapshot `potrero_id -> cabezas` que pide `calcularSaldosPorPotrero`. */
function snap(obj: Record<string, number>): Record<string, number> {
  return obj;
}

function row(overrides: Partial<InventarioPotreroRow>): InventarioPotreroRow {
  return {
    potrero_id: 'p1',
    potrero: 'Potrero 1',
    finca_id: 'f1',
    finca: 'La Esperanza',
    ubicacion_id: 'u1',
    ubicacion: 'San Francisco',
    hectareas: 10,
    lote_id: null,
    lote: null,
    etapa: null,
    novillos: 0,
    toros: 0,
    ultimo_peso_kg: null,
    ultimo_peso_fecha: null,
    updated_at: null,
    ...overrides,
  };
}

function mov(overrides: Partial<MovimientoConContexto>): MovimientoConContexto {
  return {
    id: 'm1',
    tipo: 'ajuste',
    estado: 'confirmado',
    fecha: '2026-06-10',
    potrero_origen_id: null,
    potrero_destino_id: 'p1',
    novillos_delta: 1,
    toros_delta: 0,
    peso_promedio_kg: null,
    transaccion_ganado_id: null,
    notas: null,
    created_at: '2026-06-10T10:00:00Z',
    created_by: null,
    grupo_id: null,
    potrero_origen: null,
    finca_origen: null,
    lote_origen: null,
    etapa_origen: null,
    potrero_destino: 'Potrero 1',
    finca_destino: 'La Esperanza',
    lote_destino: null,
    etapa_destino: null,
    valor_total: null,
    kilos_pagados: null,
    cabezas_transaccion: null,
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

  it('agrega porEtapa, potrerosSinEtapa y cabezasFueraDeFincaActiva (residual inyectado)', () => {
    const rows = [
      row({ potrero_id: 'p1', etapa: 'ceba', novillos: 12, toros: 0 }),
      row({ potrero_id: 'p2', etapa: null, novillos: 5, toros: 0 }),
    ];
    const rowsInactivas = [{ finca: 'Maryland', novillos: 18, toros: 0 }];
    const kpis = calcularKPIsInventario(rows, rowsInactivas);
    expect(kpis.porEtapa.ceba).toBe(12);
    expect(kpis.porEtapa.sin_clasificar).toBe(5);
    expect(kpis.potrerosSinEtapa).toEqual({ potreros: 1, cabezas: 5 });
    expect(kpis.cabezasFueraDeFincaActiva).toBe(18);
  });

  it('cabezasFueraDeFincaActiva es 0 sin residual (compatibilidad hacia atrás)', () => {
    const kpis = calcularKPIsInventario([row({ novillos: 10 })]);
    expect(kpis.cabezasFueraDeFincaActiva).toBe(0);
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
      { tipo: 'compra' as const, estado: 'confirmado' as const, fecha: '2026-06-01', novillos_delta: 10, toros_delta: 1 },
      { tipo: 'venta' as const, estado: 'confirmado' as const, fecha: '2026-06-05', novillos_delta: -4, toros_delta: 0 },
      { tipo: 'compra' as const, estado: 'pendiente' as const, fecha: '2026-06-05', novillos_delta: 99, toros_delta: 0 }, // ignorado
      { tipo: 'compra' as const, estado: 'confirmado' as const, fecha: '2026-04-01', novillos_delta: 50, toros_delta: 0 }, // fuera de ventana
    ];
    const v = calcularVariacion(movs, '2026-05-15');
    expect(v.entradas).toBe(11);
    expect(v.salidas).toBe(4);
    expect(v.neto).toBe(7);
  });

  it('la muerte cuenta como salida real del hato', () => {
    const movs = [
      { tipo: 'muerte' as const, estado: 'confirmado' as const, fecha: '2026-08-10', novillos_delta: -3, toros_delta: 0 },
    ];
    expect(calcularVariacion(movs, '2026-07-18')).toEqual({ entradas: 0, salidas: 3, neto: -3 });
  });

  it('excluye los ajustes: corregir el registro no es que el hato haya crecido', () => {
    // Reproduce agosto 2026: la carga inicial (+238) y el conteo físico de
    // Emiliano cayeron dentro de la ventana y hacían que el KPI dijera +214
    // cuando lo único que entró de verdad fueron las 19 cabezas compradas.
    const movs = [
      { tipo: 'ajuste' as const, estado: 'confirmado' as const, fecha: '2026-08-16', novillos_delta: 111, toros_delta: 127 },
      { tipo: 'ajuste' as const, estado: 'confirmado' as const, fecha: '2026-08-16', novillos_delta: -111, toros_delta: -127 },
      { tipo: 'ajuste' as const, estado: 'confirmado' as const, fecha: '2026-08-17', novillos_delta: 0, toros_delta: -19 },
      { tipo: 'compra' as const, estado: 'confirmado' as const, fecha: '2026-08-06', novillos_delta: 0, toros_delta: 19 },
    ];
    expect(calcularVariacion(movs, '2026-07-18')).toEqual({ entradas: 19, salidas: 0, neto: 19 });
  });

  it('PU-9: excluye traslados — las 11 parejas del 2026-07-02 no mueven el KPI', () => {
    const movs = Array.from({ length: 11 }, (_, i) => [
      { tipo: 'traslado_salida' as const, estado: 'confirmado' as const, fecha: '2026-07-02', novillos_delta: -(i + 1), toros_delta: 0 },
      { tipo: 'traslado_entrada' as const, estado: 'confirmado' as const, fecha: '2026-07-02', novillos_delta: i + 1, toros_delta: 0 },
    ]).flat();
    const v = calcularVariacion(movs, '2026-06-01');
    expect(v).toEqual({ entradas: 0, salidas: 0, neto: 0 });
  });

  it('sigue contando compras/ventas/muertes/ajustes junto a traslados que se excluyen', () => {
    const movs = [
      { tipo: 'compra' as const, estado: 'confirmado' as const, fecha: '2026-06-01', novillos_delta: 19, toros_delta: 0 },
      { tipo: 'traslado_salida' as const, estado: 'confirmado' as const, fecha: '2026-06-02', novillos_delta: -5, toros_delta: 0 },
      { tipo: 'traslado_entrada' as const, estado: 'confirmado' as const, fecha: '2026-06-02', novillos_delta: 5, toros_delta: 0 },
      { tipo: 'muerte' as const, estado: 'confirmado' as const, fecha: '2026-06-03', novillos_delta: -1, toros_delta: 0 },
    ];
    const v = calcularVariacion(movs, '2026-05-15');
    expect(v).toEqual({ entradas: 19, salidas: 1, neto: 18 });
  });
});

describe('filasConCabezas / totalCabezasReparto', () => {
  it('ignora las filas vacías del formulario', () => {
    const filas = [
      { potrero_id: 'pA', novillos: 12, toros: 0 },
      { potrero_id: '', novillos: 0, toros: 0 },
      { potrero_id: 'pB', novillos: 10, toros: 2 },
    ];
    expect(filasConCabezas(filas)).toHaveLength(2);
    expect(totalCabezasReparto(filasConCabezas(filas))).toBe(24);
  });
});

describe('validarRepartoConfirmacion', () => {
  it('acepta un reparto de un solo potrero que cierra', () => {
    expect(validarRepartoConfirmacion([{ potrero_id: 'pA', novillos: 18, toros: 2 }], 20)).toBeNull();
  });

  it('acepta el reparto en varios potreros cuando el total cierra', () => {
    const filas = [
      { potrero_id: 'mochuelos', novillos: 12, toros: 0 },
      { potrero_id: 'quebradas', novillos: 12, toros: 0 },
    ];
    expect(validarRepartoConfirmacion(filas, 24)).toBeNull();
  });

  it('rechaza cuando la suma no cierra contra la transacción', () => {
    const filas = [
      { potrero_id: 'mochuelos', novillos: 12, toros: 0 },
      { potrero_id: 'quebradas', novillos: 10, toros: 0 },
    ];
    expect(validarRepartoConfirmacion(filas, 24)).toContain('24');
  });

  it('rechaza un potrero repetido — sería doble conteo en el mismo potrero', () => {
    const filas = [
      { potrero_id: 'mochuelos', novillos: 12, toros: 0 },
      { potrero_id: 'mochuelos', novillos: 12, toros: 0 },
    ];
    expect(validarRepartoConfirmacion(filas, 24)).toMatch(/repetido/i);
  });

  it('rechaza una fila con cabezas y sin potrero', () => {
    const filas = [
      { potrero_id: 'mochuelos', novillos: 12, toros: 0 },
      { potrero_id: '', novillos: 12, toros: 0 },
    ];
    expect(validarRepartoConfirmacion(filas, 24)).toMatch(/potrero/i);
  });

  it('rechaza negativos y no enteros', () => {
    expect(validarRepartoConfirmacion([{ potrero_id: 'pA', novillos: -1, toros: 21 }], 20)).not.toBeNull();
    expect(validarRepartoConfirmacion([{ potrero_id: 'pA', novillos: 1.5, toros: 18.5 }], 20)).not.toBeNull();
  });

  it('rechaza un reparto vacío', () => {
    expect(validarRepartoConfirmacion([{ potrero_id: '', novillos: 0, toros: 0 }], 24)).not.toBeNull();
  });
});

describe('validarExistencias', () => {
  const inventario = { pA: { novillos: 10, toros: 2 }, pB: { novillos: 0, toros: 5 } };
  const nombre = (id: string) => (id === 'pA' ? 'Mochuelos Ceba' : 'Quebradas');

  it('acepta una salida dentro de las existencias', () => {
    expect(validarExistencias([{ potrero_id: 'pA', novillos: 10, toros: 2 }], inventario, nombre)).toBeNull();
  });

  it('rechaza sacar más novillos de los que hay, nombrando el potrero', () => {
    const error = validarExistencias([{ potrero_id: 'pA', novillos: 11, toros: 0 }], inventario, nombre);
    expect(error).toContain('Mochuelos Ceba');
  });

  it('trata un potrero sin inventario como cero', () => {
    expect(validarExistencias([{ potrero_id: 'pZ', novillos: 1, toros: 0 }], inventario, nombre)).not.toBeNull();
  });
});

describe('validarTrasladoMulti', () => {
  const base = { fecha: '2026-06-10' };

  it('acepta un traslado de un origen a dos destinos que cierra por categoría', () => {
    const error = validarTrasladoMulti({
      ...base,
      origenes: [{ potrero_id: 'pA', novillos: 20, toros: 4 }],
      destinos: [
        { potrero_id: 'pB', novillos: 12, toros: 2 },
        { potrero_id: 'pC', novillos: 8, toros: 2 },
      ],
    });
    expect(error).toBeNull();
  });

  it('rechaza sacar novillos y meter toros aunque el total coincida', () => {
    const error = validarTrasladoMulti({
      ...base,
      origenes: [{ potrero_id: 'pA', novillos: 10, toros: 0 }],
      destinos: [{ potrero_id: 'pB', novillos: 0, toros: 10 }],
    });
    expect(error).not.toBeNull();
  });

  it('rechaza que un potrero sea origen y destino a la vez', () => {
    const error = validarTrasladoMulti({
      ...base,
      origenes: [{ potrero_id: 'pA', novillos: 10, toros: 0 }],
      destinos: [{ potrero_id: 'pA', novillos: 10, toros: 0 }],
    });
    expect(error).toMatch(/origen y destino/i);
  });

  it('rechaza cuando un lado está vacío', () => {
    expect(validarTrasladoMulti({
      ...base,
      origenes: [{ potrero_id: 'pA', novillos: 10, toros: 0 }],
      destinos: [{ potrero_id: '', novillos: 0, toros: 0 }],
    })).not.toBeNull();
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
      'Conteo físico',
      'grupo-1'
    );
    expect(ajustes).toHaveLength(2);
    expect(ajustes[0]).toMatchObject({ potrero_destino_id: 'p1', novillos_delta: 2, toros_delta: 0, notas: 'Conteo físico' });
    expect(ajustes[1]).toMatchObject({ potrero_destino_id: 'p3', novillos_delta: -2, toros_delta: -1 });
  });

  it('PU-17: propaga el grupoId inyectado a todas las filas', () => {
    const ajustes = construirAjustesMasivos(
      [
        { potrero_id: 'p1', novillosActual: 10, torosActual: 1, novillosNuevo: 12, torosNuevo: 1 },
        { potrero_id: 'p3', novillosActual: 8, torosActual: 2, novillosNuevo: 6, torosNuevo: 1 },
      ],
      '2026-06-10',
      'Conteo físico',
      'grupo-abc'
    );
    expect(ajustes.every((a) => a.grupo_id === 'grupo-abc')).toBe(true);
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
      'Inventario inicial',
      'grupo-carga-1'
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
      grupo_id: 'grupo-carga-1',
    });
    expect(movs[1].potrero_destino_id).toBe('pg3');
    expect(movs[1].toros_delta).toBe(5);
  });

  it('omite fincas sin potrero mapeado (defensa contra mapa incompleto)', () => {
    const movs = construirMovimientosCargaInicial(
      [{ finca_id: 'f1', novillos: 10, toros: 0 }],
      {},
      '2026-06-10',
      'n',
      'grupo-carga-2'
    );
    expect(movs).toHaveLength(0);
  });

  it('PU-17: propaga el grupoId inyectado a todas las filas', () => {
    const movs = construirMovimientosCargaInicial(
      [
        { finca_id: 'f1', novillos: 30, toros: 2 },
        { finca_id: 'f3', novillos: 0, toros: 5 },
      ],
      { f1: 'pg1', f3: 'pg3' },
      '2026-06-10',
      'Inventario inicial',
      'grupo-xyz'
    );
    expect(movs.every((m) => m.grupo_id === 'grupo-xyz')).toBe(true);
  });
});

describe('derivarLoteEtapaDeNombre', () => {
  it('PU-1: patrón <Lote> <Etapa>', () => {
    expect(derivarLoteEtapaDeNombre('Sierra Morena Ceba')).toEqual({ lote: 'Sierra Morena', etapa: 'ceba' });
  });

  it('PU-2: patrón <Etapa> <Lote>', () => {
    expect(derivarLoteEtapaDeNombre('Terneros Cedral')).toEqual({ lote: 'Cedral', etapa: 'terneros' });
    expect(derivarLoteEtapaDeNombre('Terneros Maryland')).toEqual({ lote: 'Maryland', etapa: 'terneros' });
  });

  it('PU-3: sin etapa reconocible — y no conoce la excepción Carrizal', () => {
    expect(derivarLoteEtapaDeNombre('Bosque')).toEqual({ lote: 'Bosque', etapa: null });
    expect(derivarLoteEtapaDeNombre('Peña Blanca')).toEqual({ lote: 'Peña Blanca', etapa: null });
  });

  it('PU-4: pliega acentos/mayúsculas solo para comparar; el lote conserva el original', () => {
    expect(derivarLoteEtapaDeNombre('ANDALUCÍA CEBA')).toEqual({ lote: 'ANDALUCÍA', etapa: 'ceba' });
    expect(derivarLoteEtapaDeNombre('andalucia  ceba')).toEqual({ lote: 'andalucia', etapa: 'ceba' });
  });

  it('un nombre de una sola palabra que ES una etapa: lote null', () => {
    expect(derivarLoteEtapaDeNombre('Ceba')).toEqual({ lote: null, etapa: 'ceba' });
  });

  it('nombre vacío: ambos null', () => {
    expect(derivarLoteEtapaDeNombre('   ')).toEqual({ lote: null, etapa: null });
  });
});

describe('resumirEtapas', () => {
  it('PU-8: Σ buckets = total; 4 potreros sin etapa → 56 en sin_clasificar (fixture real)', () => {
    const rows = [
      row({ potrero_id: 'p1', etapa: 'terneros', novillos: 19, toros: 0 }),
      row({ potrero_id: 'p2', etapa: null, novillos: 19, toros: 0 }), // Bosque
      row({ potrero_id: 'p3', etapa: null, novillos: 13, toros: 0 }), // Quebradas
      row({ potrero_id: 'p4', etapa: null, novillos: 12, toros: 0 }), // Colinas
      row({ potrero_id: 'p5', etapa: null, novillos: 12, toros: 0 }), // Los Olivos
    ];
    const resumen = resumirEtapas(rows);
    expect(resumen.sin_clasificar).toBe(56);
    expect(resumen.terneros).toBe(19);
    const total = Object.values(resumen).reduce((s, n) => s + n, 0);
    expect(total).toBe(rows.reduce((s, r) => s + r.novillos + r.toros, 0));
  });
});

describe('construirArbolInventario', () => {
  const rows: InventarioPotreroRow[] = [
    row({ potrero_id: 'p1', potrero: 'Bosque', finca_id: 'f1', finca: 'Escocia', ubicacion_id: 'u1', ubicacion: 'San Francisco', hectareas: 100, lote_id: 'l1', lote: 'Bosque', etapa: null, novillos: 10, toros: 0 }),
    row({ potrero_id: 'p2', potrero: 'Quebradas', finca_id: 'f1', finca: 'Escocia', ubicacion_id: 'u1', ubicacion: 'San Francisco', hectareas: 100, lote_id: 'l2', lote: 'Quebradas', etapa: null, novillos: 5, toros: 0 }),
    row({ potrero_id: 'p3', potrero: 'La Joya Ceba', finca_id: 'f2', finca: 'Supatá', ubicacion_id: 'u2', ubicacion: 'Supata', hectareas: 50, lote_id: 'l3', lote: 'La Joya', etapa: 'ceba', novillos: 8, toros: 0 }),
    row({ potrero_id: 'p4', potrero: 'Andalucía Ceba', finca_id: 'f2', finca: 'Supatá', ubicacion_id: 'u2', ubicacion: 'Supata', hectareas: 50, lote_id: 'l4', lote: 'Andalucía', etapa: 'ceba', novillos: 4, toros: 0 }),
    row({ potrero_id: 'p5', potrero: 'General', finca_id: 'f3', finca: 'Macondo', ubicacion_id: 'u1', ubicacion: 'San Francisco', hectareas: 20, lote_id: null, lote: null, etapa: null, novillos: 0, toros: 0 }),
  ];

  it('PU-5: finca = Σ lotes = Σ potreros', () => {
    const arbol = construirArbolInventario(rows);
    const escocia = arbol.flatMap((u) => u.fincas).find((f) => f.finca === 'Escocia')!;
    expect(escocia.cabezas).toBe(15);
    expect(escocia.lotes.reduce((s, l) => s + l.cabezas, 0)).toBe(15);
    expect(escocia.lotes.flatMap((l) => l.potreros).reduce((s, p) => s + p.cabezas, 0)).toBe(15);
  });

  it('PU-6: una finca con 0 cabezas aparece igual, con 0', () => {
    const arbol = construirArbolInventario(rows);
    const macondo = arbol.flatMap((u) => u.fincas).find((f) => f.finca === 'Macondo');
    expect(macondo).toBeDefined();
    expect(macondo!.cabezas).toBe(0);
  });

  it('PU-7: cabezasPorHa solo existe en finca/ubicación, nunca en lote ni potrero', () => {
    const arbol = construirArbolInventario(rows);
    const escocia = arbol.flatMap((u) => u.fincas).find((f) => f.finca === 'Escocia')!;
    expect(escocia.cabezasPorHa).toBeCloseTo(15 / 100);
    expect((escocia.lotes[0] as unknown as { cabezasPorHa?: number }).cabezasPorHa).toBeUndefined();
    expect((escocia.lotes[0].potreros[0] as unknown as { cabezasPorHa?: number }).cabezasPorHa).toBeUndefined();
  });

  it('los potreros sin lote caen en un nodo "Sin lote" al final de su finca', () => {
    const arbol = construirArbolInventario(rows);
    const macondo = arbol.flatMap((u) => u.fincas).find((f) => f.finca === 'Macondo')!;
    expect(macondo.lotes).toHaveLength(1);
    expect(macondo.lotes[0].lote_id).toBeNull();
    expect(macondo.lotes[0].lote).toBe('Sin lote');
  });

  it('filtra por finca y por etapa', () => {
    const soloEscocia = construirArbolInventario(rows, { fincaId: 'f1' });
    expect(soloEscocia.flatMap((u) => u.fincas).every((f) => f.finca === 'Escocia')).toBe(true);

    const soloCeba = construirArbolInventario(rows, { etapa: 'ceba' });
    const cabezasCeba = soloCeba.flatMap((u) => u.fincas).reduce((s, f) => s + f.cabezas, 0);
    expect(cabezasCeba).toBe(12);
  });
});

describe('agruparMovimientos — traslados', () => {
  const saldosVacio = new Map<string, Map<string, number> | null>();

  it('PU-10: traslado 1→1 con el mismo grupo_id → una fila', () => {
    const movs = [
      mov({
        id: 'a', tipo: 'traslado_salida', grupo_id: 'g1',
        potrero_origen_id: 'p1', potrero_origen: 'P1', finca_origen: 'F',
        potrero_destino_id: null, potrero_destino: null, finca_destino: null,
        novillos_delta: -5, toros_delta: 0,
      }),
      mov({
        id: 'b', tipo: 'traslado_entrada', grupo_id: 'g1',
        potrero_origen_id: null, potrero_origen: null, finca_origen: null,
        potrero_destino_id: 'p2', potrero_destino: 'P2', finca_destino: 'F',
        novillos_delta: 5, toros_delta: 0,
      }),
    ];
    const agrupado = agruparMovimientos(movs, saldosVacio);
    expect(agrupado).toHaveLength(1);
    const evento = agrupado[0];
    if (evento.clase !== 'traslado') throw new Error('se esperaba clase traslado');
    expect(evento.origenes).toHaveLength(1);
    expect(evento.destinos).toHaveLength(1);
    expect(evento.cabezas).toBe(5);
  });

  it('PU-10: traslado 3→2 que cierra por categoría → una fila con 3 orígenes y 2 destinos', () => {
    const movs = [
      mov({ id: 'a', tipo: 'traslado_salida', grupo_id: 'g2', potrero_origen_id: 'p1', potrero_origen: 'P1', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -3, toros_delta: 0 }),
      mov({ id: 'b', tipo: 'traslado_salida', grupo_id: 'g2', potrero_origen_id: 'p2', potrero_origen: 'P2', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -4, toros_delta: -1 }),
      mov({ id: 'c', tipo: 'traslado_salida', grupo_id: 'g2', potrero_origen_id: 'p3', potrero_origen: 'P3', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -5, toros_delta: 0 }),
      mov({ id: 'd', tipo: 'traslado_entrada', grupo_id: 'g2', potrero_origen_id: null, potrero_origen: null, finca_origen: null, potrero_destino_id: 'p4', potrero_destino: 'P4', finca_destino: 'F', novillos_delta: 6, toros_delta: 1 }),
      mov({ id: 'e', tipo: 'traslado_entrada', grupo_id: 'g2', potrero_origen_id: null, potrero_origen: null, finca_origen: null, potrero_destino_id: 'p5', potrero_destino: 'P5', finca_destino: 'F', novillos_delta: 6, toros_delta: 0 }),
    ];
    const agrupado = agruparMovimientos(movs, saldosVacio);
    expect(agrupado).toHaveLength(1);
    const evento = agrupado[0];
    if (evento.clase !== 'traslado') throw new Error('se esperaba clase traslado');
    expect(evento.origenes).toHaveLength(3);
    expect(evento.destinos).toHaveLength(2);
    expect(evento.cabezas).toBe(13);
  });

  it('un grupo que no cierra por categoría → todas sus filas sueltas', () => {
    const movs = [
      mov({ id: 'a', tipo: 'traslado_salida', grupo_id: 'g3', potrero_origen_id: 'p1', potrero_origen: 'P1', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -10, toros_delta: 0 }),
      mov({ id: 'b', tipo: 'traslado_entrada', grupo_id: 'g3', potrero_origen_id: null, potrero_origen: null, finca_origen: null, potrero_destino_id: 'p2', potrero_destino: 'P2', finca_destino: 'F', novillos_delta: 8, toros_delta: 0 }),
    ];
    const agrupado = agruparMovimientos(movs, saldosVacio);
    expect(agrupado).toHaveLength(2);
    expect(agrupado.every((e) => e.clase === 'simple')).toBe(true);
  });

  it('un grupo con solo salidas (sin destinos) → filas sueltas', () => {
    const movs = [
      mov({ id: 'a', tipo: 'traslado_salida', grupo_id: 'g4', potrero_origen_id: 'p1', potrero_origen: 'P1', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -5, toros_delta: 0 }),
      mov({ id: 'b', tipo: 'traslado_salida', grupo_id: 'g4', potrero_origen_id: 'p2', potrero_origen: 'P2', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -5, toros_delta: 0 }),
    ];
    const agrupado = agruparMovimientos(movs, saldosVacio);
    expect(agrupado).toHaveLength(2);
    expect(agrupado.every((e) => e.clase === 'simple')).toBe(true);
  });

  it('grupo_id NULL → fila suelta', () => {
    const movs = [
      mov({ id: 'a', tipo: 'traslado_salida', grupo_id: null, potrero_origen_id: 'p1', potrero_origen: 'P1', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -5, toros_delta: 0 }),
    ];
    const agrupado = agruparMovimientos(movs, saldosVacio);
    expect(agrupado).toEqual([{ clase: 'simple', movimiento: movs[0], saldo: null }]);
  });
});

describe('agruparMovimientos — compra/venta repartida', () => {
  const saldosVacio = new Map<string, Map<string, number> | null>();

  it('PU-10b: 2 filas de compra con el mismo transaccion_ganado_id → 1 fila con 2 puntas (fixture real del 17-ago: 24 = 13 + 11)', () => {
    const movs = [
      mov({
        id: 'a', tipo: 'compra', transaccion_ganado_id: 'tx1',
        potrero_origen_id: null, potrero_origen: null, finca_origen: null,
        potrero_destino_id: 'quebradas', potrero_destino: 'Quebradas', finca_destino: 'Escocia',
        novillos_delta: 13, toros_delta: 0,
        valor_total: 101500000, kilos_pagados: 4500, cabezas_transaccion: 24,
      }),
      mov({
        id: 'b', tipo: 'compra', transaccion_ganado_id: 'tx1',
        potrero_origen_id: null, potrero_origen: null, finca_origen: null,
        potrero_destino_id: 'mochuelos', potrero_destino: 'Mochuelos Repele', finca_destino: 'Escocia',
        novillos_delta: 11, toros_delta: 0,
        valor_total: 101500000, kilos_pagados: 4500, cabezas_transaccion: 24,
      }),
    ];
    const agrupado = agruparMovimientos(movs, saldosVacio);
    expect(agrupado).toHaveLength(1);
    const evento = agrupado[0];
    if (evento.clase !== 'compra_venta') throw new Error('se esperaba clase compra_venta');
    expect(evento.tipo).toBe('compra');
    expect(evento.cabezas).toBe(24);
    expect(evento.valor_total).toBe(101500000);
    expect(evento.puntas).toHaveLength(2);
  });

  it('transaccion_ganado_id NULL → sueltas', () => {
    const movs = [
      mov({ id: 'a', tipo: 'compra', transaccion_ganado_id: null, potrero_destino_id: 'p1', potrero_destino: 'P1', finca_destino: 'F', novillos_delta: 5 }),
      mov({ id: 'b', tipo: 'compra', transaccion_ganado_id: null, potrero_destino_id: 'p2', potrero_destino: 'P2', finca_destino: 'F', novillos_delta: 5 }),
    ];
    const agrupado = agruparMovimientos(movs, saldosVacio);
    expect(agrupado.every((e) => e.clase === 'simple')).toBe(true);
  });

  it('una compra y una venta bajo la misma transacción (imposible, pero) → sueltas', () => {
    const movs = [
      mov({ id: 'a', tipo: 'compra', transaccion_ganado_id: 'tx2', potrero_destino_id: 'p1', potrero_destino: 'P1', finca_destino: 'F', novillos_delta: 5 }),
      mov({ id: 'b', tipo: 'venta', transaccion_ganado_id: 'tx2', potrero_origen_id: 'p2', potrero_origen: 'P2', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -5 }),
    ];
    const agrupado = agruparMovimientos(movs, saldosVacio);
    expect(agrupado.every((e) => e.clase === 'simple')).toBe(true);
  });
});

describe('agruparMovimientos — conteo físico', () => {
  const saldosVacio = new Map<string, Map<string, number> | null>();

  it('PU-10c: 21 ajustes con el mismo grupo_id → 1 grupo con 21 miembros', () => {
    const movs = Array.from({ length: 21 }, (_, i) =>
      mov({ id: `adj-${i}`, tipo: 'ajuste', grupo_id: 'conteo-1', potrero_destino_id: `p${i}`, potrero_destino: `P${i}`, finca_destino: 'F', novillos_delta: 1, toros_delta: 0 })
    );
    const agrupado = agruparMovimientos(movs, saldosVacio);
    expect(agrupado).toHaveLength(1);
    const evento = agrupado[0];
    if (evento.clase !== 'conteo_fisico') throw new Error('se esperaba clase conteo_fisico');
    expect(evento.miembros).toHaveLength(21);
    expect(evento.potrerosAfectados).toBe(21);
    expect(evento.deltaNeto).toBe(21);
  });

  it('un grupo de 1 ajuste no se agrupa: fila normal', () => {
    const movs = [mov({ id: 'a', tipo: 'ajuste', grupo_id: 'conteo-2', potrero_destino_id: 'p1', potrero_destino: 'P1', finca_destino: 'F', novillos_delta: 1 })];
    const agrupado = agruparMovimientos(movs, saldosVacio);
    expect(agrupado).toHaveLength(1);
    expect(agrupado[0].clase).toBe('simple');
  });

  it('grupo_id compartido entre un ajuste y un traslado_salida → sueltas (nunca se mezclan familias)', () => {
    const movs = [
      mov({ id: 'a', tipo: 'ajuste', grupo_id: 'mix-1', potrero_destino_id: 'p1', potrero_destino: 'P1', finca_destino: 'F', novillos_delta: 1 }),
      mov({ id: 'b', tipo: 'traslado_salida', grupo_id: 'mix-1', potrero_origen_id: 'p2', potrero_origen: 'P2', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -1 }),
    ];
    const agrupado = agruparMovimientos(movs, saldosVacio);
    expect(agrupado.every((e) => e.clase === 'simple')).toBe(true);
  });
});

describe('calcularSaldosPorPotrero', () => {
  it('PU-14: fixture Bosque real — compra 19 → ajuste +19 (doble conteo) → ajuste -19 (corrección) → snapshot 19', () => {
    const movs = [
      { id: 'compra', estado: 'confirmado' as const, fecha: '2026-08-06', created_at: '2026-08-06T10:00:00Z', potrero_origen_id: null, potrero_destino_id: 'bosque', novillos_delta: 19, toros_delta: 0 },
      { id: 'doble', estado: 'confirmado' as const, fecha: '2026-08-15', created_at: '2026-08-15T09:00:00Z', potrero_origen_id: null, potrero_destino_id: 'bosque', novillos_delta: 19, toros_delta: 0 },
      { id: 'correccion', estado: 'confirmado' as const, fecha: '2026-08-17', created_at: '2026-08-17T11:00:00Z', potrero_origen_id: null, potrero_destino_id: 'bosque', novillos_delta: -19, toros_delta: 0 },
    ];
    const saldos = calcularSaldosPorPotrero(movs, snap({ bosque: 19 }));
    const saldoBosque = saldos.get('bosque');
    expect(saldoBosque).not.toBeNull();
    expect(saldoBosque!.get('compra')).toBe(19);
    expect(saldoBosque!.get('doble')).toBe(38);
    expect(saldoBosque!.get('correccion')).toBe(19);
  });

  it('PU-11: el saldo de la última fila == snapshot; filtrar después no cambia el saldo calculado sobre la historia completa', () => {
    const movs = [
      { id: 'm1', estado: 'confirmado' as const, fecha: '2026-01-01', created_at: '2026-01-01T00:00:00Z', potrero_origen_id: null, potrero_destino_id: 'p1', novillos_delta: 10, toros_delta: 0 },
      { id: 'm2', estado: 'confirmado' as const, fecha: '2026-02-01', created_at: '2026-02-01T00:00:00Z', potrero_origen_id: null, potrero_destino_id: 'p1', novillos_delta: 5, toros_delta: 0 },
    ];
    const saldos = calcularSaldosPorPotrero(movs, snap({ p1: 15 }));
    expect(saldos.get('p1')!.get('m2')).toBe(15);

    const filtrados = movs.filter((m) => m.fecha >= '2026-02-01');
    expect(saldos.get('p1')!.get(filtrados[0].id)).toBe(15);
  });

  it('PU-12: Σ deltas ≠ snapshot → todos los saldos de ese potrero son null', () => {
    const movs = [
      { id: 'm1', estado: 'confirmado' as const, fecha: '2026-01-01', created_at: '2026-01-01T00:00:00Z', potrero_origen_id: null, potrero_destino_id: 'p1', novillos_delta: 10, toros_delta: 0 },
    ];
    const saldos = calcularSaldosPorPotrero(movs, snap({ p1: 999 }));
    expect(saldos.get('p1')).toBeNull();
  });

  it('ignora movimientos pendientes', () => {
    const movs = [
      { id: 'm1', estado: 'confirmado' as const, fecha: '2026-01-01', created_at: '2026-01-01T00:00:00Z', potrero_origen_id: null, potrero_destino_id: 'p1', novillos_delta: 10, toros_delta: 0 },
      { id: 'm2', estado: 'pendiente' as const, fecha: '2026-02-01', created_at: '2026-02-01T00:00:00Z', potrero_origen_id: null, potrero_destino_id: 'p1', novillos_delta: 999, toros_delta: 0 },
    ];
    const saldos = calcularSaldosPorPotrero(movs, snap({ p1: 10 }));
    expect(saldos.get('p1')!.get('m1')).toBe(10);
    expect(saldos.get('p1')!.has('m2')).toBe(false);
  });
});

describe('agruparMovimientos + calcularSaldosPorPotrero — saldo en eventos N→M', () => {
  it('PU-13: traslado 1→1 expone dos saldos, uno por punta', () => {
    const movsSaldo = [
      // p1 arranca con 5 (carga inicial) para que su historia cierre contra el snapshot tras el traslado.
      { id: 'inicial', estado: 'confirmado' as const, fecha: '2026-01-01', created_at: '2026-01-01T00:00:00Z', potrero_origen_id: null, potrero_destino_id: 'p1', novillos_delta: 5, toros_delta: 0 },
      { id: 'sal', estado: 'confirmado' as const, fecha: '2026-06-10', created_at: '2026-06-10T10:00:00Z', potrero_origen_id: 'p1', potrero_destino_id: null, novillos_delta: -5, toros_delta: 0 },
      { id: 'ent', estado: 'confirmado' as const, fecha: '2026-06-10', created_at: '2026-06-10T10:00:00Z', potrero_origen_id: null, potrero_destino_id: 'p2', novillos_delta: 5, toros_delta: 0 },
    ];
    const saldos = calcularSaldosPorPotrero(movsSaldo, snap({ p1: 0, p2: 5 }));

    const movs = [
      mov({ id: 'sal', tipo: 'traslado_salida', grupo_id: 'g1', potrero_origen_id: 'p1', potrero_origen: 'P1', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -5, toros_delta: 0 }),
      mov({ id: 'ent', tipo: 'traslado_entrada', grupo_id: 'g1', potrero_origen_id: null, potrero_origen: null, finca_origen: null, potrero_destino_id: 'p2', potrero_destino: 'P2', finca_destino: 'F', novillos_delta: 5, toros_delta: 0 }),
    ];
    const agrupado = agruparMovimientos(movs, saldos);
    expect(agrupado).toHaveLength(1);
    const evento = agrupado[0];
    if (evento.clase !== 'traslado') throw new Error('se esperaba clase traslado');
    expect(evento.origenes[0].saldo).toBe(0);
    expect(evento.destinos[0].saldo).toBe(5);
  });

  it('un traslado 3→2 expone 5 saldos, uno por punta — la fila colapsada no tiene un único saldo', () => {
    const movsSaldo = [
      // Los 3 orígenes arrancan con carga inicial para que cada historia cierre.
      { id: 'inicial-a', estado: 'confirmado' as const, fecha: '2026-01-01', created_at: '2026-01-01T00:00:00Z', potrero_origen_id: null, potrero_destino_id: 'p1', novillos_delta: 3, toros_delta: 0 },
      { id: 'inicial-b', estado: 'confirmado' as const, fecha: '2026-01-01', created_at: '2026-01-01T00:00:00Z', potrero_origen_id: null, potrero_destino_id: 'p2', novillos_delta: 4, toros_delta: 0 },
      { id: 'inicial-c', estado: 'confirmado' as const, fecha: '2026-01-01', created_at: '2026-01-01T00:00:00Z', potrero_origen_id: null, potrero_destino_id: 'p3', novillos_delta: 5, toros_delta: 0 },
      { id: 'a', estado: 'confirmado' as const, fecha: '2026-06-10', created_at: '2026-06-10T10:00:00Z', potrero_origen_id: 'p1', potrero_destino_id: null, novillos_delta: -3, toros_delta: 0 },
      { id: 'b', estado: 'confirmado' as const, fecha: '2026-06-10', created_at: '2026-06-10T10:00:00Z', potrero_origen_id: 'p2', potrero_destino_id: null, novillos_delta: -4, toros_delta: 0 },
      { id: 'c', estado: 'confirmado' as const, fecha: '2026-06-10', created_at: '2026-06-10T10:00:00Z', potrero_origen_id: 'p3', potrero_destino_id: null, novillos_delta: -5, toros_delta: 0 },
      { id: 'd', estado: 'confirmado' as const, fecha: '2026-06-10', created_at: '2026-06-10T10:00:00Z', potrero_origen_id: null, potrero_destino_id: 'p4', novillos_delta: 6, toros_delta: 0 },
      { id: 'e', estado: 'confirmado' as const, fecha: '2026-06-10', created_at: '2026-06-10T10:00:00Z', potrero_origen_id: null, potrero_destino_id: 'p5', novillos_delta: 6, toros_delta: 0 },
    ];
    const saldos = calcularSaldosPorPotrero(movsSaldo, snap({ p1: 0, p2: 0, p3: 0, p4: 6, p5: 6 }));

    const movs = [
      mov({ id: 'a', tipo: 'traslado_salida', grupo_id: 'g2', potrero_origen_id: 'p1', potrero_origen: 'P1', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -3, toros_delta: 0 }),
      mov({ id: 'b', tipo: 'traslado_salida', grupo_id: 'g2', potrero_origen_id: 'p2', potrero_origen: 'P2', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -4, toros_delta: 0 }),
      mov({ id: 'c', tipo: 'traslado_salida', grupo_id: 'g2', potrero_origen_id: 'p3', potrero_origen: 'P3', finca_origen: 'F', potrero_destino_id: null, potrero_destino: null, finca_destino: null, novillos_delta: -5, toros_delta: 0 }),
      mov({ id: 'd', tipo: 'traslado_entrada', grupo_id: 'g2', potrero_origen_id: null, potrero_origen: null, finca_origen: null, potrero_destino_id: 'p4', potrero_destino: 'P4', finca_destino: 'F', novillos_delta: 6, toros_delta: 0 }),
      mov({ id: 'e', tipo: 'traslado_entrada', grupo_id: 'g2', potrero_origen_id: null, potrero_origen: null, finca_origen: null, potrero_destino_id: 'p5', potrero_destino: 'P5', finca_destino: 'F', novillos_delta: 6, toros_delta: 0 }),
    ];
    const agrupado = agruparMovimientos(movs, saldos);
    expect(agrupado).toHaveLength(1);
    const evento = agrupado[0];
    if (evento.clase !== 'traslado') throw new Error('se esperaba clase traslado');
    const todasLasPuntas = [...evento.origenes, ...evento.destinos];
    expect(todasLasPuntas).toHaveLength(5);
    expect(todasLasPuntas.every((p) => p.saldo !== null)).toBe(true);
  });
});

describe('cabezasFueraDeFincaActiva', () => {
  it('PU-15: suma total y desglosa por finca inactiva', () => {
    const rows = [
      { finca: 'Maryland', novillos: 18, toros: 0 },
      { finca: 'Mochuelos', novillos: 12, toros: 11 },
    ];
    const resultado = cabezasFueraDeFincaActiva(rows);
    expect(resultado.cabezas).toBe(41);
    expect(resultado.fincas).toEqual([
      { finca: 'Mochuelos', cabezas: 23 },
      { finca: 'Maryland', cabezas: 18 },
    ]);
  });

  it('lista vacía → 0 cabezas, sin fincas', () => {
    expect(cabezasFueraDeFincaActiva([])).toEqual({ cabezas: 0, fincas: [] });
  });
});

describe('antiguedadEnDias', () => {
  it('PU-16: 2026-08-05 a 2026-08-17 → 12 días', () => {
    expect(antiguedadEnDias('2026-08-05', '2026-08-17')).toBe(12);
  });

  it('misma fecha → 0', () => {
    expect(antiguedadEnDias('2026-08-17', '2026-08-17')).toBe(0);
  });
});
