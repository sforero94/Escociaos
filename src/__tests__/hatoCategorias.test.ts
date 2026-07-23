// ARCHIVO: __tests__/hatoCategorias.test.ts
// DESCRIPCIÓN: TDD de `clasificarCategoriaHato` -- las 3 categorías de
// inventario pedidas por el dueño (terneras / hato / horro, decisión
// 2026-07-22, ver cabecera de `hatoCategorias.ts` para la asunción
// documentada sobre el límite hato/horro).

import { describe, it, expect } from 'vitest';
import { clasificarCategoriaHato } from '../utils/hatoCategorias';
import type { EstadoReproductivo } from '../utils/calculosHato';

describe('clasificarCategoriaHato', () => {
  it('clasifica una ternera como "ternera" sin importar el estado reproductivo', () => {
    expect(clasificarCategoriaHato('ternera', 'cria')).toBe('ternera');
  });

  it('clasifica una vaca seca (secado_real registrado) como "horro"', () => {
    expect(clasificarCategoriaHato('vaca', 'seca')).toBe('horro');
  });

  it('clasifica una vaca "proxima_a_secar" como "hato" -- todavía no se secó', () => {
    expect(clasificarCategoriaHato('vaca', 'proxima_a_secar')).toBe('hato');
  });

  const estadosActivosNoSecos: EstadoReproductivo[] = [
    'novilla',
    'servida',
    'preñada',
    'parida_reciente',
    'vacia_por_servir',
    'indeterminado',
  ];
  it.each(estadosActivosNoSecos)('clasifica una vaca en estado "%s" como "hato"', (estado) => {
    expect(clasificarCategoriaHato('vaca', estado)).toBe('hato');
  });

  const estadosTerminales: EstadoReproductivo[] = ['vendida', 'muerta', 'descartada'];
  it.each(estadosTerminales)('no clasifica un animal en estado terminal "%s" (null)', (estado) => {
    expect(clasificarCategoriaHato('vaca', estado)).toBeNull();
    expect(clasificarCategoriaHato('novilla', estado)).toBeNull();
  });

  it('una novilla activa (aún sin ciclo) cae en "hato", no en "ternera"', () => {
    expect(clasificarCategoriaHato('novilla', 'novilla')).toBe('hato');
  });
});
