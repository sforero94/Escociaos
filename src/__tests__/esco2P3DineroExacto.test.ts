import { describe, expect, it } from 'vitest';
import { dineroConDetalleMensaje, dineroMensaje } from '../utils/esco2/formatoMensaje.ts';
import { extraerNumeros, numeroCerca } from '../utils/escoEvals/numeros.ts';

// Synthetic, literal monetary expectations frozen before implementation.
describe('P3: resumen D43 y detalle exacto cuando redondea', () => {
  it.each([
    [50432198, 'aprox. $50,4M (valor exacto: $50.432.198)'],
    [-50432198, 'aprox. -$50,4M (valor exacto: -$50.432.198)'],
    [100.4, 'aprox. $100 (valor exacto: $100,4)'],
    [999999.9, 'aprox. $1.000.000 (valor exacto: $999.999,9)'],
    [2000000000.25, 'aprox. $2.000M (valor exacto: $2.000.000.000,25)'],
    [0.000001, 'aprox. $0 (valor exacto: $0,000001)'],
  ] as const)('preserva el valor publicado de %s sin cambiar las anclas', (value, expected) => {
    const result = dineroConDetalleMensaje(value);
    expect(result).toBe(expected);
    expect(result.startsWith(dineroMensaje(value))).toBe(true);
    expect(numeroCerca(value, 0, extraerNumeros(result))).toBe(true);
    expect(result).not.toContain('COP');
  });

  it.each([0, -0, 1234, 1000000, 1500000, 100000000, 2000000000])('no duplica un resumen ya exacto para %s', value => {
    expect(dineroConDetalleMensaje(value)).toBe(dineroMensaje(value));
    expect(dineroConDetalleMensaje(value)).not.toContain('valor exacto');
  });

  it('no trunca ni convierte en cero una fracción menor que veinte decimales', () => {
    expect(dineroConDetalleMensaje(1.2345e-21)).toBe('aprox. $0 (valor exacto: $0,0000000000000000000012345)');
  });

  it('rechaza no finitos antes de afirmar un monto exacto', () => {
    for (const value of [NaN, Infinity, -Infinity]) expect(() => dineroConDetalleMensaje(value)).toThrow();
  });
});
