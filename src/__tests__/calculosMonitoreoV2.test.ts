import { describe, it, expect } from 'vitest';
import {
  calcularEstadoFloracion,
  calcularEstadoCE,
  calcularEstadoColmenas,
  obtenerRondaActiva,
  agruparPorRonda,
} from '@/utils/calculosMonitoreoV2';
import type {
  RondaMonitoreo,
  MonitoreoConductividad,
  MonitoreoColmena,
} from '@/types/monitoreo';

// ============================================
// FLORACIÓN
// ============================================

describe('calcularEstadoFloracion', () => {
  it('returns zeros when no records', () => {
    const result = calcularEstadoFloracion([]);
    expect(result).toEqual({
      arbolesMonitoreados: 0,
      sinFlor: 0,
      brotes: 0,
      florMadura: 0,
      cuaje: 0,
      pctSinFlor: 0,
      pctBrotes: 0,
      pctFlorMadura: 0,
      pctCuaje: 0,
    });
  });

  it('deduplicates pest rows with same fecha+sublote and sums across distinct events', () => {
    const registros = [
      // Two pest rows for the same sublote visit — should deduplicate via MAX
      { fecha_monitoreo: '2026-01-01', sublote_id: 'sub1', arboles_monitoreados: 35, floracion_sin_flor: 5, floracion_brotes: 10, floracion_flor_madura: 5, floracion_cuaje: 2 },
      { fecha_monitoreo: '2026-01-01', sublote_id: 'sub1', arboles_monitoreados: 35, floracion_sin_flor: 5, floracion_brotes: 10, floracion_flor_madura: 5, floracion_cuaje: 2 },
      // A different sublote visit — should sum with the first
      { fecha_monitoreo: '2026-01-01', sublote_id: 'sub2', arboles_monitoreados: 35, floracion_sin_flor: 3, floracion_brotes: 8, floracion_flor_madura: 12, floracion_cuaje: 3 },
    ];
    const result = calcularEstadoFloracion(registros);
    expect(result.arbolesMonitoreados).toBe(70);
    expect(result.sinFlor).toBe(8);
    expect(result.brotes).toBe(18);
    expect(result.florMadura).toBe(17);
    expect(result.cuaje).toBe(5);
  });

  it('calculates percentages relative to arboles monitoreados', () => {
    const registros = [
      { fecha_monitoreo: '2026-01-01', sublote_id: 'sub1', arboles_monitoreados: 100, floracion_sin_flor: 10, floracion_brotes: 50, floracion_flor_madura: 30, floracion_cuaje: 20 },
    ];
    const result = calcularEstadoFloracion(registros);
    expect(result.pctSinFlor).toBe(10);
    expect(result.pctBrotes).toBe(50);
    expect(result.pctFlorMadura).toBe(30);
    expect(result.pctCuaje).toBe(20);
  });

  it('handles null/undefined values as 0', () => {
    const registros = [
      { floracion_brotes: null, floracion_flor_madura: undefined, floracion_cuaje: 5 },
    ];
    const result = calcularEstadoFloracion(registros as any);
    expect(result.brotes).toBe(0);
    expect(result.florMadura).toBe(0);
    expect(result.cuaje).toBe(5);
  });
});

// ============================================
// CONDUCTIVIDAD ELÉCTRICA
// ============================================

describe('calcularEstadoCE', () => {
  it('returns sin_datos when no records', () => {
    const result = calcularEstadoCE([]);
    expect(result.estado).toBe('sin_datos');
    expect(result.promedio).toBe(0);
  });

  it('returns verde when CE is in range 0.5-2.0', () => {
    const registros: Pick<MonitoreoConductividad, 'valor_ce'>[] = [
      { valor_ce: 1.0 },
      { valor_ce: 1.5 },
      { valor_ce: 1.8 },
    ];
    const result = calcularEstadoCE(registros);
    expect(result.estado).toBe('verde');
  });

  it('returns rojo when CE is above 1.5', () => {
    const registros: Pick<MonitoreoConductividad, 'valor_ce'>[] = [
      { valor_ce: 2.5 },
    ];
    const result = calcularEstadoCE(registros);
    expect(result.estado).toBe('rojo');
  });

  it('returns rojo when CE is above 3.0', () => {
    const registros: Pick<MonitoreoConductividad, 'valor_ce'>[] = [
      { valor_ce: 3.5 },
      { valor_ce: 4.0 },
    ];
    const result = calcularEstadoCE(registros);
    expect(result.estado).toBe('rojo');
  });

  it('calculates average CE', () => {
    const registros: Pick<MonitoreoConductividad, 'valor_ce'>[] = [
      { valor_ce: 1.0 },
      { valor_ce: 2.0 },
      { valor_ce: 3.0 },
    ];
    const result = calcularEstadoCE(registros);
    expect(result.promedio).toBe(2);
  });

  it('returns min and max values', () => {
    const registros: Pick<MonitoreoConductividad, 'valor_ce'>[] = [
      { valor_ce: 1.2 },
      { valor_ce: 2.8 },
      { valor_ce: 0.9 },
    ];
    const result = calcularEstadoCE(registros);
    expect(result.min).toBe(0.9);
    expect(result.max).toBe(2.8);
  });
});

// ============================================
// COLMENAS
// ============================================

describe('calcularEstadoColmenas', () => {
  it('returns sin_datos when no records', () => {
    const result = calcularEstadoColmenas([]);
    expect(result.estado).toBe('sin_datos');
  });

  it('returns verde when >80% fuertes', () => {
    const registros: Pick<MonitoreoColmena, 'colmenas_fuertes' | 'colmenas_debiles' | 'colmenas_muertas'>[] = [
      { colmenas_fuertes: 9, colmenas_debiles: 1, colmenas_muertas: 0 },
    ];
    const result = calcularEstadoColmenas(registros);
    expect(result.estado).toBe('verde');
    expect(result.pctFuertes).toBe(90);
  });

  it('returns amarillo when 50-80% fuertes', () => {
    const registros: Pick<MonitoreoColmena, 'colmenas_fuertes' | 'colmenas_debiles' | 'colmenas_muertas'>[] = [
      { colmenas_fuertes: 6, colmenas_debiles: 3, colmenas_muertas: 1 },
    ];
    const result = calcularEstadoColmenas(registros);
    expect(result.estado).toBe('amarillo');
  });

  it('returns rojo when <50% fuertes', () => {
    const registros: Pick<MonitoreoColmena, 'colmenas_fuertes' | 'colmenas_debiles' | 'colmenas_muertas'>[] = [
      { colmenas_fuertes: 2, colmenas_debiles: 5, colmenas_muertas: 3 },
    ];
    const result = calcularEstadoColmenas(registros);
    expect(result.estado).toBe('rojo');
    expect(result.pctFuertes).toBe(20);
  });

  it('sums across multiple apiario records', () => {
    const registros: Pick<MonitoreoColmena, 'colmenas_fuertes' | 'colmenas_debiles' | 'colmenas_muertas'>[] = [
      { colmenas_fuertes: 8, colmenas_debiles: 1, colmenas_muertas: 1 },
      { colmenas_fuertes: 7, colmenas_debiles: 2, colmenas_muertas: 1 },
    ];
    const result = calcularEstadoColmenas(registros);
    expect(result.totalFuertes).toBe(15);
    expect(result.totalDebiles).toBe(3);
    expect(result.totalMuertas).toBe(2);
    expect(result.total).toBe(20);
  });
});

// ============================================
// RONDAS
// ============================================

describe('obtenerRondaActiva', () => {
  it('returns null when no rondas', () => {
    expect(obtenerRondaActiva([])).toBeNull();
  });

  it('returns ronda with fecha_fin null', () => {
    const rondas: RondaMonitoreo[] = [
      { id: '1', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-05' },
      { id: '2', fecha_inicio: '2026-02-01', fecha_fin: null },
    ];
    const result = obtenerRondaActiva(rondas);
    expect(result?.id).toBe('2');
  });

  it('returns null when all rondas are closed', () => {
    const rondas: RondaMonitoreo[] = [
      { id: '1', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-05' },
      { id: '2', fecha_inicio: '2026-02-01', fecha_fin: '2026-02-10' },
    ];
    expect(obtenerRondaActiva(rondas)).toBeNull();
  });
});

describe('agruparPorRonda', () => {
  it('returns empty map when no records', () => {
    const result = agruparPorRonda([]);
    expect(result.size).toBe(0);
  });

  it('groups records by ronda_id', () => {
    const registros = [
      { id: 'a', ronda_id: 'r1' },
      { id: 'b', ronda_id: 'r1' },
      { id: 'c', ronda_id: 'r2' },
    ];
    const result = agruparPorRonda(registros);
    expect(result.get('r1')?.length).toBe(2);
    expect(result.get('r2')?.length).toBe(1);
  });

  it('groups records without ronda_id under "sin_ronda"', () => {
    const registros = [
      { id: 'a', ronda_id: null },
      { id: 'b', ronda_id: undefined },
    ];
    const result = agruparPorRonda(registros as any);
    expect(result.get('sin_ronda')?.length).toBe(2);
  });
});
