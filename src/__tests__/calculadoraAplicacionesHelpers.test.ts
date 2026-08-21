import { describe, it, expect } from 'vitest';
import {
  sugerirNombreAplicacion,
  sugerirFechaFin,
} from '../utils/calculadoraAplicacionesHelpers';

describe('sugerirNombreAplicacion', () => {
  it('arma "Tipo · N lotes · mes año" para fertilización con 4 lotes', () => {
    expect(sugerirNombreAplicacion('fertilizacion', 4, '2026-08-18')).toBe(
      'Fertilización · 4 lotes · ago 2026',
    );
  });

  it('usa singular "lote" cuando hay exactamente 1', () => {
    expect(sugerirNombreAplicacion('fumigacion', 1, '2026-01-05')).toBe(
      'Fumigación · 1 lote · ene 2026',
    );
  });

  it('capitaliza Drench igual que los otros tipos', () => {
    expect(sugerirNombreAplicacion('drench', 2, '2026-12-01')).toBe(
      'Drench · 2 lotes · dic 2026',
    );
  });

  it('sin tipo aún elegido, omite el segmento de tipo', () => {
    expect(sugerirNombreAplicacion(undefined, 3, '2026-08-18')).toBe('3 lotes · ago 2026');
  });

  it('sin lotes seleccionados, omite el segmento de lotes', () => {
    expect(sugerirNombreAplicacion('fertilizacion', 0, '2026-08-18')).toBe(
      'Fertilización · ago 2026',
    );
  });

  it('sin fecha de inicio, omite el segmento de mes/año', () => {
    expect(sugerirNombreAplicacion('fertilizacion', 4, '')).toBe('Fertilización · 4 lotes');
  });

  it('sin ningún dato, produce string vacío', () => {
    expect(sugerirNombreAplicacion(undefined, 0, '')).toBe('');
  });
});

describe('sugerirFechaFin', () => {
  it('suma un mes calendario a una fecha ISO local (18/08 -> 18/09)', () => {
    expect(sugerirFechaFin('2026-08-18')).toBe('2026-09-18');
  });

  it('cruza el fin de año correctamente (dic -> ene del siguiente año)', () => {
    expect(sugerirFechaFin('2026-12-15')).toBe('2027-01-15');
  });

  it('cae al último día del mes destino cuando el día de origen no existe (31 ene -> 28/29 feb)', () => {
    // 2026 no es bisiesto
    expect(sugerirFechaFin('2026-01-31')).toBe('2026-02-28');
  });

  it('respeta años bisiestos', () => {
    expect(sugerirFechaFin('2028-01-31')).toBe('2028-02-29');
  });

  it('string vacío devuelve string vacío', () => {
    expect(sugerirFechaFin('')).toBe('');
  });
});
