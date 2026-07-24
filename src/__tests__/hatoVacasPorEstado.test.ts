// ARCHIVO: __tests__/hatoVacasPorEstado.test.ts
// DESCRIPCIÓN: TDD de la aritmética pura de proporciones que alimenta la
// card "Vacas por estado" (E3.3, VacasPorEstadoCard.tsx) -- sin ningún
// umbral de negocio, solo porcentajes con guarda de división por cero
// (total 0 -> 0%, nunca NaN/Infinity).

import { describe, it, expect } from 'vitest';
import { calcularProporcionesDosValores, calcularProporcionesN } from '../utils/hatoVacasPorEstado';

describe('calcularProporcionesDosValores', () => {
  it('divide dos valores en porcentajes que suman 100', () => {
    const { pctA, pctB } = calcularProporcionesDosValores(33, 8);
    expect(pctA).toBeCloseTo((33 / 41) * 100, 5);
    expect(pctB).toBeCloseTo((8 / 41) * 100, 5);
    expect(pctA + pctB).toBeCloseTo(100, 5);
  });

  it('devuelve 0/0 cuando ambos valores son 0 -- nunca NaN', () => {
    expect(calcularProporcionesDosValores(0, 0)).toEqual({ pctA: 0, pctB: 0 });
  });

  it('devuelve 0/100 cuando el lado izquierdo es 0', () => {
    expect(calcularProporcionesDosValores(0, 10)).toEqual({ pctA: 0, pctB: 100 });
  });

  it('devuelve 100/0 cuando el lado derecho es 0', () => {
    expect(calcularProporcionesDosValores(10, 0)).toEqual({ pctA: 100, pctB: 0 });
  });
});

describe('calcularProporcionesN', () => {
  it('divide N valores en porcentajes que suman ~100', () => {
    const pcts = calcularProporcionesN([49, 20, 17]);
    const total = 49 + 20 + 17;
    expect(pcts).toHaveLength(3);
    expect(pcts[0]).toBeCloseTo((49 / total) * 100, 5);
    expect(pcts[1]).toBeCloseTo((20 / total) * 100, 5);
    expect(pcts[2]).toBeCloseTo((17 / total) * 100, 5);
    expect(pcts.reduce((s, p) => s + p, 0)).toBeCloseTo(100, 5);
  });

  it('devuelve todos 0 cuando el total es 0 -- nunca NaN', () => {
    expect(calcularProporcionesN([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('preserva el orden de entrada (un valor en 0 no altera el orden de los demás)', () => {
    const pcts = calcularProporcionesN([0, 20, 10]);
    expect(pcts[0]).toBe(0);
    expect(pcts[1]).toBeCloseTo((20 / 30) * 100, 5);
    expect(pcts[2]).toBeCloseTo((10 / 30) * 100, 5);
  });
});
