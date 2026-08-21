import { describe, it, expect } from 'vitest';
import {
  calcularDesviacionInsumo,
  calcularInsumosConDesviacion,
  calcularExcepcionesCierre,
  derivarFechasEjecucionReal,
  agruparRegistrosPorLote,
  calcularKPIsLabores,
  formatearListaConY,
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
