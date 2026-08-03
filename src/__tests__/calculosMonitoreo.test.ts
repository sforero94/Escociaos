// Tests del motor puro compartido de monitoreo (`src/utils/calculosMonitoreo.ts`).
//
// POR QUÉ EXISTE ESTE ARCHIVO: nueve módulos dependen de él -- la captura de
// registros (`RegistroMonitoreo.tsx`), el mapa de calor, el tablero V3, la
// priorización de scouting (`priorizacionMonitoreo.ts` y su port Deno
// `priorizacion-scouting.ts`, con paridad garantizada por
// `priorizacionScoutingParidad.test.ts`), la UI del hato y el bot de Telegram.
// Hasta ahora no tenía NINGÚN test propio: los cortes 10% / 30% que pintan de
// amarillo o rojo toda la finca no estaban fijados por nada.
//
// El corte NO es cosmético: `gravedad_texto` se PERSISTE en `monitoreos` y lo
// leen la tabla de registros, el reporte semanal (`fetchDatosReporteSemanal.ts`)
// y Esco (`chat.tsx`). Una copia paralela de esta regla ya se desincronizó
// (`CargaMasiva.tsx` usa 15% para "Media" en lugar de 10%).

import { describe, it, expect } from 'vitest';
import {
  calcularIncidencia,
  clasificarGravedad,
  calcularDensidad,
  calcularTendencia,
  formatearCambio,
} from '../utils/calculosMonitoreo';

describe('calcularIncidencia', () => {
  it('devuelve el porcentaje ponderado de árboles afectados', () => {
    expect(calcularIncidencia(5, 20)).toBe(25);
    expect(calcularIncidencia(35, 100)).toBe(35);
  });

  it('devuelve 0 -- no NaN ni Infinity -- cuando no se monitoreó ningún árbol', () => {
    // Este es el guard que las derivaciones inline del tablero replicaban a
    // mano (`monitoreados > 0 ? ... : 0`). Si desaparece, la vista muestra NaN%.
    expect(calcularIncidencia(0, 0)).toBe(0);
    expect(calcularIncidencia(3, 0)).toBe(0);
  });

  it('devuelve 0% cuando no hay árboles afectados y 100% cuando lo están todos', () => {
    expect(calcularIncidencia(0, 40)).toBe(0);
    expect(calcularIncidencia(40, 40)).toBe(100);
  });
});

describe('clasificarGravedad', () => {
  it('clasifica Baja por debajo del 10%', () => {
    expect(clasificarGravedad(0)).toEqual({ texto: 'Baja', numerica: 1 });
    expect(clasificarGravedad(9.99)).toEqual({ texto: 'Baja', numerica: 1 });
  });

  it('clasifica Media entre 10% (inclusive) y 30%', () => {
    expect(clasificarGravedad(10)).toEqual({ texto: 'Media', numerica: 2 });
    expect(clasificarGravedad(29.99)).toEqual({ texto: 'Media', numerica: 2 });
  });

  it('clasifica Alta desde 30% (inclusive)', () => {
    expect(clasificarGravedad(30)).toEqual({ texto: 'Alta', numerica: 3 });
    expect(clasificarGravedad(100)).toEqual({ texto: 'Alta', numerica: 3 });
  });

  it('fija los bordes exactos 10 y 30: son inclusivos, no exclusivos', () => {
    // Contrato explícito. La banda [10, 15) es justamente donde
    // `CargaMasiva.tsx` diverge hoy (guarda "Baja" donde esto dice "Media").
    expect(clasificarGravedad(10).texto).toBe('Media');
    expect(clasificarGravedad(12.5).texto).toBe('Media');
    expect(clasificarGravedad(14.9).texto).toBe('Media');
    expect(clasificarGravedad(30).texto).toBe('Alta');
  });

  it('texto y numérica nunca se contradicen', () => {
    for (const inc of [0, 5, 10, 15, 25, 30, 55, 100]) {
      const { texto, numerica } = clasificarGravedad(inc);
      const esperado = { Baja: 1, Media: 2, Alta: 3 }[texto];
      expect(numerica).toBe(esperado);
    }
  });
});

describe('calcularDensidad', () => {
  it('promedia individuos por árbol afectado', () => {
    expect(calcularDensidad(30, 10)).toBe(3);
  });

  it('devuelve 0 cuando no hay árboles afectados (evita división por cero)', () => {
    expect(calcularDensidad(30, 0)).toBe(0);
    expect(calcularDensidad(0, 0)).toBe(0);
  });
});

describe('calcularTendencia', () => {
  it('trata una serie de menos de dos puntos como estable', () => {
    // Una sola ronda no es una tendencia: la vista de priorización muestra el
    // valor sin flecha en vez de inventar una dirección.
    expect(calcularTendencia([])).toBe('estable');
    expect(calcularTendencia([42])).toBe('estable');
  });

  it('detecta subida cuando la pendiente supera +2 puntos por ronda', () => {
    expect(calcularTendencia([10, 20, 30])).toBe('subiendo');
  });

  it('detecta bajada cuando la pendiente cae por debajo de -2 puntos por ronda', () => {
    expect(calcularTendencia([30, 20, 10])).toBe('bajando');
  });

  it('considera estable un cambio menor al umbral de ±2', () => {
    expect(calcularTendencia([10, 11, 12])).toBe('estable');
    expect(calcularTendencia([12, 11, 10])).toBe('estable');
    expect(calcularTendencia([15, 15, 15])).toBe('estable');
  });

  it('usa la pendiente de toda la serie, no solo el último salto', () => {
    // Sube 20 puntos en total pero el último tramo baja: la tendencia global
    // sigue siendo "subiendo".
    expect(calcularTendencia([5, 15, 25, 24])).toBe('subiendo');
  });
});

describe('formatearCambio', () => {
  it('antepone el signo + a los cambios positivos y conserva el - de los negativos', () => {
    expect(formatearCambio(25.5)).toBe('(+25.5%)');
    expect(formatearCambio(-10.24)).toBe('(-10.2%)');
    expect(formatearCambio(0)).toBe('(+0.0%)');
  });

  it('redondea siempre a un decimal', () => {
    expect(formatearCambio(3.456)).toBe('(+3.5%)');
  });
});
