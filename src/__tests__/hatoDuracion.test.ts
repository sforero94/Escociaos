// ARCHIVO: __tests__/hatoDuracion.test.ts
// DESCRIPCIÓN: TDD de `duracionEstadoActual` (E3.2, HojaDeVida.tsx via
// FranjaEstadisticas) -- el contador de duración dinámico que reemplaza el
// "Días abiertos" estático de la franja de estadísticas: cambia de label y
// de campo fuente según el `estado` reproductivo YA derivado por
// `derivarEstadoReproductivo` (calculosHato.ts). `null` -> "—", nunca 0.

import { describe, it, expect } from 'vitest';
import { duracionEstadoActual } from '../utils/hatoDuracion';
import type { EstadoReproductivo } from '../utils/calculosHato';

function derivadoParcial(overrides: {
  estado: EstadoReproductivo;
  dias_abiertos?: number | null;
  tiempo_prenez_dias?: number | null;
  tiempo_secada_dias?: number | null;
}) {
  return {
    dias_abiertos: null,
    tiempo_prenez_dias: null,
    tiempo_secada_dias: null,
    ...overrides,
  };
}

describe('duracionEstadoActual', () => {
  it('"Tiempo de preñez" en formato meses+días para "preñada"', () => {
    expect(duracionEstadoActual(derivadoParcial({ estado: 'preñada', tiempo_prenez_dias: 75 }))).toEqual({
      label: 'Tiempo de preñez',
      value: '2 m 15 d',
    });
  });

  it('"Tiempo de preñez" también para "proxima_a_secar" (gestación tardía)', () => {
    expect(
      duracionEstadoActual(derivadoParcial({ estado: 'proxima_a_secar', tiempo_prenez_dias: 200 })),
    ).toEqual({ label: 'Tiempo de preñez', value: '6 m 20 d' });
  });

  it('"Tiempo de preñez" es "—" cuando el motor no lo derivó (nunca 0)', () => {
    expect(duracionEstadoActual(derivadoParcial({ estado: 'preñada', tiempo_prenez_dias: null }))).toEqual({
      label: 'Tiempo de preñez',
      value: '—',
    });
  });

  it('"Tiempo secada" en formato meses+días para "seca"', () => {
    expect(duracionEstadoActual(derivadoParcial({ estado: 'seca', tiempo_secada_dias: 45 }))).toEqual({
      label: 'Tiempo secada',
      value: '1 m 15 d',
    });
  });

  it('"Tiempo secada" es "—" cuando el motor no lo derivó', () => {
    expect(duracionEstadoActual(derivadoParcial({ estado: 'seca', tiempo_secada_dias: null }))).toEqual({
      label: 'Tiempo secada',
      value: '—',
    });
  });

  it('"Tiempo vacía" en días simples para "vacia_por_servir"', () => {
    expect(duracionEstadoActual(derivadoParcial({ estado: 'vacia_por_servir', dias_abiertos: 30 }))).toEqual({
      label: 'Tiempo vacía',
      value: '30',
    });
  });

  it('"Tiempo vacía" también para "parida_reciente"', () => {
    expect(duracionEstadoActual(derivadoParcial({ estado: 'parida_reciente', dias_abiertos: 10 }))).toEqual({
      label: 'Tiempo vacía',
      value: '10',
    });
  });

  it('"Tiempo vacía" es "—" cuando dias_abiertos es null', () => {
    expect(duracionEstadoActual(derivadoParcial({ estado: 'vacia_por_servir', dias_abiertos: null }))).toEqual({
      label: 'Tiempo vacía',
      value: '—',
    });
  });

  it('cae a "Días abiertos" para cualquier otro estado (ej. "servida")', () => {
    expect(duracionEstadoActual(derivadoParcial({ estado: 'servida', dias_abiertos: 5 }))).toEqual({
      label: 'Días abiertos',
      value: '5',
    });
  });

  it('formatea exactamente 30 días como "1 m" (sin sufijo "0 d")', () => {
    expect(duracionEstadoActual(derivadoParcial({ estado: 'seca', tiempo_secada_dias: 30 }))).toEqual({
      label: 'Tiempo secada',
      value: '1 m',
    });
  });

  it('formatea menos de un mes solo en días (sin "0 m")', () => {
    expect(duracionEstadoActual(derivadoParcial({ estado: 'preñada', tiempo_prenez_dias: 12 }))).toEqual({
      label: 'Tiempo de preñez',
      value: '12 d',
    });
  });

  it('formatea 0 días como "0 d"', () => {
    expect(duracionEstadoActual(derivadoParcial({ estado: 'preñada', tiempo_prenez_dias: 0 }))).toEqual({
      label: 'Tiempo de preñez',
      value: '0 d',
    });
  });
});
