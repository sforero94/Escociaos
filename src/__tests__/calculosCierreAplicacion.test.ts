import { describe, it, expect } from 'vitest';
import {
  calcularDesviacionInsumo,
  calcularInsumosConDesviacion,
  calcularExcepcionesCierre,
  derivarFechasEjecucionReal,
  agruparRegistrosPorLote,
  calcularKPIsLabores,
  formatearListaConY,
  construirPayloadCierreAplicacion,
  etiquetaFraccionJornal,
  FRACCION_OPTIONS,
} from '@/utils/calculosCierreAplicacion';
import type { RegistroTrabajoCierre } from '@/types/aplicaciones';

function registro(overrides: Partial<RegistroTrabajoCierre>): RegistroTrabajoCierre {
  return {
    tarea_id: 't1',
    trabajador_nombre: 'Juan Pérez',
    trabajador_tipo: 'empleado',
    lote_id: 'l1',
    lote_nombre: 'Lote 1',
    fecha_trabajo: '2026-08-05',
    fraccion_jornal: 1,
    costo_jornal: 100000,
    empleado_id: 'e1',
    ...overrides,
  };
}

describe('calcularDesviacionInsumo', () => {
  it('planeado 0 nunca es crítico, sin importar el aplicado (regla histórica del módulo)', () => {
    const r = calcularDesviacionInsumo({ planeado: 0, aplicado: 5 });
    expect(r.esCritico).toBe(false);
    expect(r.diferencia).toBe(5);
  });

  it('desviación dentro del 15% no es crítica', () => {
    const r = calcularDesviacionInsumo({ planeado: 100, aplicado: 110 });
    expect(r.esCritico).toBe(false);
    expect(r.diferencia).toBe(10);
  });

  it('desviación por encima del 15% (sobre-aplicación) es crítica', () => {
    const r = calcularDesviacionInsumo({ planeado: 100, aplicado: 120 });
    expect(r.esCritico).toBe(true);
    expect(r.diferencia).toBe(20);
  });

  it('desviación por encima del 15% (sub-aplicación) también es crítica', () => {
    const r = calcularDesviacionInsumo({ planeado: 100, aplicado: 80 });
    expect(r.esCritico).toBe(true);
    expect(r.diferencia).toBe(-20);
  });
});

describe('calcularInsumosConDesviacion', () => {
  it('anota diferencia y esCritico por cada insumo, preservando el resto de campos', () => {
    const resultado = calcularInsumosConDesviacion([
      { nombre: 'Magister', unidad: 'Litros', planeado: 9.13, aplicado: 9.12 },
      { nombre: 'Citroemulsion', unidad: 'Litros', planeado: 45.5, aplicado: 60 },
    ]);
    expect(resultado[0]).toMatchObject({ nombre: 'Magister', esCritico: false });
    expect(resultado[1]).toMatchObject({ nombre: 'Citroemulsion', esCritico: true });
  });
});

describe('derivarFechasEjecucionReal', () => {
  it('sin registros ni movimientos → fuente "ninguna", fechas null', () => {
    const r = derivarFechasEjecucionReal([], []);
    expect(r).toEqual({ fechaInicio: null, fechaFin: null, fuente: 'ninguna' });
  });

  it('solo registros de labor → fuente "registros", min/max de esas fechas', () => {
    const r = derivarFechasEjecucionReal(['2026-08-05', '2026-08-02', '2026-08-09'], []);
    expect(r).toEqual({ fechaInicio: '2026-08-02', fechaFin: '2026-08-09', fuente: 'registros' });
  });

  it('solo movimientos diarios → fuente "movimientos", min/max de esas fechas', () => {
    const r = derivarFechasEjecucionReal([], ['2026-08-04', '2026-08-19']);
    expect(r).toEqual({ fechaInicio: '2026-08-04', fechaFin: '2026-08-19', fuente: 'movimientos' });
  });

  it('ambas fuentes → fuente "combinado", unión de rango (nunca angosta lo ya capturado)', () => {
    const r = derivarFechasEjecucionReal(
      ['2026-08-05', '2026-08-10'],
      ['2026-08-04', '2026-08-19'],
    );
    expect(r).toEqual({ fechaInicio: '2026-08-04', fechaFin: '2026-08-19', fuente: 'combinado' });
  });

  it('ignora strings vacíos/undefined mezclados en los arreglos', () => {
    const r = derivarFechasEjecucionReal(['2026-08-05', '', '2026-08-02'], []);
    expect(r).toEqual({ fechaInicio: '2026-08-02', fechaFin: '2026-08-05', fuente: 'registros' });
  });
});

describe('agruparRegistrosPorLote', () => {
  it('agrupa solo los registros activos (no eliminados) por lote_id, con _index estable', () => {
    const registros: RegistroTrabajoCierre[] = [
      registro({ id: 'r1', lote_id: 'l1', lote_nombre: 'Piedra Paula' }),
      registro({ id: 'r2', lote_id: 'l2', lote_nombre: 'La Vega' }),
      registro({ id: 'r3', lote_id: 'l1', lote_nombre: 'Piedra Paula', _deleted: true }),
    ];
    const porLote = agruparRegistrosPorLote(registros);
    expect(porLote.size).toBe(2);
    expect(porLote.get('l1')?.registros).toHaveLength(1);
    expect(porLote.get('l1')?.registros[0]._index).toBe(0);
    expect(porLote.get('l2')?.lote_nombre).toBe('La Vega');
  });
});

describe('calcularKPIsLabores', () => {
  it('suma jornales/costo y cuenta trabajadores y días únicos', () => {
    const registros: RegistroTrabajoCierre[] = [
      registro({ empleado_id: 'e1', fecha_trabajo: '2026-08-04', fraccion_jornal: 2, costo_jornal: 174000 }),
      registro({ empleado_id: 'e1', fecha_trabajo: '2026-08-05', fraccion_jornal: 2, costo_jornal: 174000 }),
      registro({ empleado_id: undefined, contratista_id: 'c1', fecha_trabajo: '2026-08-05', fraccion_jornal: 1.5, costo_jornal: 142500 }),
    ];
    const kpis = calcularKPIsLabores(registros);
    expect(kpis.totalJornales).toBe(5.5);
    expect(kpis.costoManoObra).toBe(490500);
    expect(kpis.trabajadoresUnicos).toBe(2);
    expect(kpis.diasTrabajados).toBe(2);
  });
});

describe('formatearListaConY', () => {
  it('lista vacía → cadena vacía', () => {
    expect(formatearListaConY([])).toBe('');
  });

  it('un solo elemento → tal cual, sin "y"', () => {
    expect(formatearListaConY(['Magister (9,12 Litros)'])).toBe('Magister (9,12 Litros)');
  });

  it('dos elementos → unidos por "y", sin coma', () => {
    expect(formatearListaConY(['A', 'B'])).toBe('A y B');
  });

  it('tres o más elementos → coma entre todos salvo el último, que lleva "y"', () => {
    expect(formatearListaConY(['A', 'B', 'C', 'D'])).toBe('A, B, C y D');
  });
});

describe('calcularExcepcionesCierre', () => {
  const lotes = [
    { lote_id: 'l1', nombre: 'Piedra Paula' },
    { lote_id: 'l2', nombre: 'La Vega' },
    { lote_id: 'l3', nombre: 'Australia' },
  ];

  it('sin novedades: 4 insumos ok, todos los lotes con jornales, ningún costo en $0 → todo vacío', () => {
    const insumos = [{ nombre: 'Magister', unidad: 'Litros', planeado: 9.13, aplicado: 9.12 }];
    const registros = [
      registro({ lote_id: 'l1', costo_jornal: 100000 }),
      registro({ lote_id: 'l2', costo_jornal: 100000 }),
      registro({ lote_id: 'l3', costo_jornal: 100000 }),
    ];
    const r = calcularExcepcionesCierre(insumos, registros, lotes, true);
    expect(r).toEqual({ insumosCriticos: [], registrosSinTarifa: [], lotesSinLabor: [] });
  });

  it('detecta un insumo con desviación crítica', () => {
    const insumos = [{ nombre: 'Citroemulsion', unidad: 'Litros', planeado: 45.5, aplicado: 60 }];
    const r = calcularExcepcionesCierre(insumos, [], lotes, true);
    expect(r.insumosCriticos).toEqual([{ nombre: 'Citroemulsion', diferencia: 14.5, unidad: 'Litros' }]);
  });

  it('detecta registros con costo_jornal en 0', () => {
    const registros = [
      registro({ lote_id: 'l1', costo_jornal: 0, trabajador_nombre: 'Piedra Paula' }),
      registro({ lote_id: 'l2', costo_jornal: 100000 }),
    ];
    const r = calcularExcepcionesCierre([], registros, lotes, true);
    expect(r.registrosSinTarifa).toHaveLength(1);
    expect(r.registrosSinTarifa[0]).toMatchObject({ lote_id: 'l1', trabajador_nombre: 'Piedra Paula' });
  });

  it('detecta un lote de la aplicación sin ningún jornal registrado', () => {
    const registros = [registro({ lote_id: 'l1' }), registro({ lote_id: 'l2' })];
    const r = calcularExcepcionesCierre([], registros, lotes, true);
    expect(r.lotesSinLabor).toEqual([{ lote_id: 'l3', nombre: 'Australia' }]);
  });

  it('NO marca lotes sin labor cuando la aplicación no tiene tarea vinculada (ya hay otro aviso para eso)', () => {
    const r = calcularExcepcionesCierre([], [], lotes, false);
    expect(r.lotesSinLabor).toEqual([]);
  });

  it('NO marca lotes sin labor cuando el fetch de lotes llegó vacío (evita falso positivo masivo)', () => {
    const r = calcularExcepcionesCierre([], [registro({ lote_id: 'l1' })], [], true);
    expect(r.lotesSinLabor).toEqual([]);
  });
});

describe('etiquetaFraccionJornal — etiquetas literales del ENUM fraccion_jornal', () => {
  // Las 4 etiquetas verificadas contra pg_enum en produccion el 2026-08-21.
  it('1 se serializa como "1.0", NO como "1"', () => {
    // El defecto que este helper cierra: (1.0).toString() === "1", que el ENUM rechaza.
    // Es la fraccion mas comun de la finca (1.068 de 2.688 filas) y el valor por defecto
    // de un registro nuevo en la pantalla de Cierre.
    expect(etiquetaFraccionJornal(1)).toBe('1.0');
    expect(etiquetaFraccionJornal(1.0)).toBe('1.0');
    expect((1.0).toString()).toBe('1'); // deja constancia de POR QUE no sirve toString()
  });

  it('las otras tres etiquetas coinciden con su representacion decimal', () => {
    expect(etiquetaFraccionJornal(0.25)).toBe('0.25');
    expect(etiquetaFraccionJornal(0.5)).toBe('0.5');
    expect(etiquetaFraccionJornal(0.75)).toBe('0.75');
  });

  it('un valor fuera del ENUM lanza en vez de inventar un formato que la BD va a rechazar', () => {
    expect(() => etiquetaFraccionJornal(0.6)).toThrow(/fraccion_jornal invalida|fraccion_jornal inv/);
    expect(() => etiquetaFraccionJornal(0)).toThrow();
    expect(() => etiquetaFraccionJornal(2)).toThrow();
  });

  it('el payload del cierre lleva la etiqueta del ENUM para el jornal completo', () => {
    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'app1',
      registrosEditados: [
        registro({ id: 'r1', fraccion_jornal: 1, _modified: true }),
        registro({ id: 'r2', fraccion_jornal: 0.5, _isNew: true }),
      ],
      datosFinales: { fechaInicioReal: '2026-08-05', fechaFinReal: '2026-08-05', observaciones: '' },
      lotes: [{ lote_id: 'l1', nombre: 'Piedra Paula', arboles: 100 }],
      movimientos: [],
    });
    expect(payload.registros_trabajo[0].fraccion_jornal).toBe('1.0');
    expect(payload.registros_trabajo[1].fraccion_jornal).toBe('0.5');
  });
});

describe('construirPayloadCierreAplicacion', () => {
  const datosFinalesBase = {
    fechaInicioReal: '2026-08-05',
    fechaFinReal: '2026-08-07',
    observaciones: 'Todo bien',
  };
  const lotesBase = [
    { lote_id: 'l1', nombre: 'Piedra Paula', arboles: 100 },
    { lote_id: 'l2', nombre: 'La Vega', arboles: 50 },
  ];
  const movimientosBase = [
    { producto_id: 'p1', producto_nombre: 'Magister', cantidad_utilizada: 10, costo_unitario: 1000 },
    { producto_id: 'p1', producto_nombre: 'Magister', cantidad_utilizada: 5, costo_unitario: 1000 },
    { producto_id: 'p2', producto_nombre: 'Citroemulsion', cantidad_utilizada: 2, costo_unitario: 5000 },
  ];

  it('calcula jornales, costos y días de aplicación igual que la versión no transaccional', () => {
    const registros = [
      registro({ id: 'r1', fraccion_jornal: 1, costo_jornal: 100000 }),
      registro({ id: 'r2', fraccion_jornal: 0.5, costo_jornal: 50000 }),
      registro({ id: 'r3', fraccion_jornal: 1, costo_jornal: 999999, _deleted: true }), // excluido
    ];
    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'app1',
      registrosEditados: registros,
      datosFinales: datosFinalesBase,
      lotes: lotesBase,
      movimientos: movimientosBase,
    });

    // jornales/costo mano de obra: solo activos (no _deleted)
    expect(payload.jornales_utilizados).toBe(1.5);
    expect(payload.costo_total_mano_obra).toBe(150000);
    // valor_jornal = costoManoObra / jornales, redondeado
    expect(payload.valor_jornal).toBe(100000);
    // costo insumos: 10*1000 + 5*1000 + 2*5000 = 25000
    expect(payload.costo_total_insumos).toBe(25000);
    expect(payload.costo_total).toBe(175000);
    // costo/árbol: 175000 / (100+50)
    expect(payload.costo_por_arbol).toBeCloseTo(175000 / 150, 6);
    // 2026-08-05 -> 2026-08-07 inclusive = 3 días
    expect(payload.dias_aplicacion).toBe(3);
  });

  it('jornales en 0 no divide por cero: valor_jornal y costo_por_arbol caen a 0', () => {
    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'app1',
      registrosEditados: [],
      datosFinales: datosFinalesBase,
      lotes: [],
      movimientos: [],
    });
    expect(payload.valor_jornal).toBe(0);
    expect(payload.costo_por_arbol).toBe(0);
  });

  it('observaciones_cierre conserva el texto crudo (incl. cadena vacía); observaciones_generales lo convierte a null', () => {
    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'app1',
      registrosEditados: [],
      datosFinales: { ...datosFinalesBase, observaciones: '' },
      lotes: [],
      movimientos: [],
    });
    expect(payload.observaciones_cierre).toBe('');
    expect(payload.observaciones_generales).toBeNull();
  });

  it('consolida insumos_aplicados por producto_id, sumando cantidad_utilizada', () => {
    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'app1',
      registrosEditados: [],
      datosFinales: datosFinalesBase,
      lotes: [],
      movimientos: movimientosBase,
    });
    expect(payload.insumos_aplicados).toEqual([
      { producto_id: 'p1', producto_nombre: 'Magister', cantidad: 15 },
      { producto_id: 'p2', producto_nombre: 'Citroemulsion', cantidad: 2 },
    ]);
  });

  it('lote_aplicacion une los nombres de lote con coma y espacio', () => {
    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'app1',
      registrosEditados: [],
      datosFinales: datosFinalesBase,
      lotes: lotesBase,
      movimientos: [],
    });
    expect(payload.lote_aplicacion).toBe('Piedra Paula, La Vega');
  });

  it('registros_trabajo: fraccion_jornal se serializa como la ETIQUETA del ENUM, no con toString()', () => {
    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'app1',
      registrosEditados: [registro({ id: 'r1', fraccion_jornal: 1 })],
      datosFinales: datosFinalesBase,
      lotes: [],
      movimientos: [],
    });
    // La version anterior de este test usaba 1.5 -> '1.5', que es justamente un valor que el ENUM
    // NO acepta; pasaba por casualidad porque toString() lo round-trippea. El caso que importa es
    // el jornal completo: 1 debe salir como '1.0'.
    expect(payload.registros_trabajo[0].fraccion_jornal).toBe('1.0');
    expect(typeof payload.registros_trabajo[0].fraccion_jornal).toBe('string');
  });

  it('FRACCION_OPTIONS solo ofrece fracciones que el ENUM puede guardar', () => {
    // Ofrecer 1.5 o 2.0 hacia que la escritura fallara en silencio (insert sin { error }).
    expect([...FRACCION_OPTIONS]).toEqual([0.25, 0.5, 0.75, 1.0]);
    for (const f of FRACCION_OPTIONS) {
      expect(() => etiquetaFraccionJornal(f)).not.toThrow();
    }
  });

  it('registros_trabajo: preserva los flags _isNew/_deleted/_modified tal cual', () => {
    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'app1',
      registrosEditados: [
        registro({ id: 'r1', _modified: true }),
        registro({ _isNew: true }),
        registro({ id: 'r3', _deleted: true }),
      ],
      datosFinales: datosFinalesBase,
      lotes: [],
      movimientos: [],
    });
    expect(payload.registros_trabajo.map((r) => [r._isNew, r._deleted, r._modified])).toEqual([
      [false, false, true],
      [true, false, false],
      [false, true, false],
    ]);
  });

  it('valor_jornal_empleado de un registro nuevo contratista usa tarifa_jornal', () => {
    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'app1',
      registrosEditados: [
        registro({ trabajador_tipo: 'contratista', empleado_id: undefined, tarifa_jornal: 85000, _isNew: true }),
      ],
      datosFinales: datosFinalesBase,
      lotes: [],
      movimientos: [],
    });
    expect(payload.registros_trabajo[0].valor_jornal_empleado).toBe(85000);
  });

  it('valor_jornal_empleado de un registro nuevo empleado usa la fórmula salario+prestaciones+auxilios', () => {
    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'app1',
      registrosEditados: [
        registro({
          salario: 1300000,
          prestaciones: 200000,
          auxilios: 50000,
          horas_semanales: 48,
          _isNew: true,
        }),
      ],
      datosFinales: datosFinalesBase,
      lotes: [],
      movimientos: [],
    });
    const esperado = Math.round(((1300000 + 200000 + 50000) / (48 * 4.33)) * 8);
    expect(payload.registros_trabajo[0].valor_jornal_empleado).toBe(esperado);
  });

  it('valor_jornal_empleado cae a 0 sin tarifa_jornal ni salario', () => {
    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'app1',
      registrosEditados: [registro({ empleado_id: undefined, salario: undefined, _isNew: true })],
      datosFinales: datosFinalesBase,
      lotes: [],
      movimientos: [],
    });
    expect(payload.registros_trabajo[0].valor_jornal_empleado).toBe(0);
  });

  it('empleado_id/contratista_id ausentes se normalizan a null, nunca undefined', () => {
    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'app1',
      registrosEditados: [registro({ empleado_id: undefined, contratista_id: undefined })],
      datosFinales: datosFinalesBase,
      lotes: [],
      movimientos: [],
    });
    expect(payload.registros_trabajo[0].empleado_id).toBeNull();
    expect(payload.registros_trabajo[0].contratista_id).toBeNull();
  });
});
