// ARCHIVO: __tests__/graficoLitrosQuincenal.test.ts
// DESCRIPCIÓN: TDD de la preparación de datos del gráfico de barras "Litros
// por quincena al camión" (Figma alignment spec Wave 2b, §6,
// `utils/graficoLitrosQuincenal.ts`). Cubre: reordenamiento cronológico a
// partir del orden más-reciente-primero de `fetchHistorialQuincenal`, la
// marca `esActual` sobre la última quincena, y que un historial vacío
// nunca produce un punto ni un promedio fabricado.

import { describe, it, expect } from 'vitest';
import { prepararPuntosLitrosQuincenal, promedioLitrosQuincenal } from '../utils/graficoLitrosQuincenal';
import type { HatoProduccionQuincenal } from '../types/hato';

function quincena(overrides: Partial<HatoProduccionQuincenal> = {}): HatoProduccionQuincenal {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    anio: 2026,
    mes: 7,
    quincena: 1,
    fecha_inicio: null,
    fecha_fin: null,
    litros_total: 1000,
    litros_pomar_confirmado: null,
    num_vacas_ordeno: null,
    notas: null,
    fuente: null,
    ...overrides,
  };
}

describe('prepararPuntosLitrosQuincenal', () => {
  it('reordena de más-reciente-primero (input) a cronológico ascendente (salida)', () => {
    const historial = [
      quincena({ id: 'c', anio: 2026, mes: 6, quincena: 2, litros_total: 900 }),
      quincena({ id: 'b', anio: 2026, mes: 6, quincena: 1, litros_total: 800 }),
      quincena({ id: 'a', anio: 2026, mes: 5, quincena: 2, litros_total: 700 }),
    ];
    const puntos = prepararPuntosLitrosQuincenal(historial);
    expect(puntos.map((p) => p.clave)).toEqual(['a', 'b', 'c']);
  });

  it('etiqueta con mes corto en español + Q1/Q2', () => {
    const puntos = prepararPuntosLitrosQuincenal([quincena({ mes: 7, quincena: 1 })]);
    expect(puntos[0].label).toBe('Jul Q1');
  });

  it('marca esActual SOLO en la quincena cronológicamente más reciente', () => {
    const historial = [
      quincena({ id: 'reciente', anio: 2026, mes: 7, quincena: 1 }),
      quincena({ id: 'vieja', anio: 2026, mes: 6, quincena: 2 }),
    ];
    const puntos = prepararPuntosLitrosQuincenal(historial);
    const porClave = Object.fromEntries(puntos.map((p) => [p.clave, p.esActual]));
    expect(porClave.reciente).toBe(true);
    expect(porClave.vieja).toBe(false);
  });

  it('un historial vacío produce un arreglo vacío -- nunca un punto en 0', () => {
    expect(prepararPuntosLitrosQuincenal([])).toEqual([]);
  });

  it('no muta el arreglo original', () => {
    const historial = [quincena({ id: 'a', mes: 6 }), quincena({ id: 'b', mes: 7 })];
    prepararPuntosLitrosQuincenal(historial);
    expect(historial.map((h) => h.id)).toEqual(['a', 'b']);
  });
});

describe('promedioLitrosQuincenal', () => {
  it('devuelve null para un arreglo vacío -- nunca 0', () => {
    expect(promedioLitrosQuincenal([])).toBeNull();
  });

  it('calcula el promedio simple de litros', () => {
    const puntos = prepararPuntosLitrosQuincenal([
      quincena({ id: 'a', litros_total: 1000 }),
      quincena({ id: 'b', mes: 8, litros_total: 2000 }),
    ]);
    expect(promedioLitrosQuincenal(puntos)).toBe(1500);
  });
});
