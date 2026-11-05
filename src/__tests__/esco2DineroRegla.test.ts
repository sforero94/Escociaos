import { describe, expect, it } from 'vitest';
import { dineroMensaje, numeroMensaje } from '@/utils/esco2/formatoMensaje';

describe('regla de dinero de Esco por el valor original', () => {
  it.each([
    [934567, '$934,567'],
    [50400000, '$50.4M'],
    [233000000, '$233M'],
    [0, '$0'],
    [1000000, '$1.0M'],
    [95000000, '$95.0M'],
    [100000000, '$100M'],
    [2000000000, '$2,000M'],
    [1449000, 'aprox. $1.4M'],
    [95499999, 'aprox. $95.5M'],
    [999999.4, 'aprox. $999,999'],
    [999999.5, 'aprox. $1,000,000'],
    [99999999, 'aprox. $100.0M'],
    [100499999, 'aprox. $100M'],
    [100500000, 'aprox. $101M'],
    [-934567, '-$934,567'],
    [-50400000, '-$50.4M'],
    [-233000000, '-$233M'],
    [-999999.5, 'aprox. -$1,000,000'],
    [-99999999, 'aprox. -$100.0M'],
  ])('%s → %s sin cambiar de banda por el redondeo', (value, expected) => {
    expect(dineroMensaje(value as number)).toBe(expected);
  });
  it('cambia solo dinero; cantidades siguen en es-CO y conservan precisión', () => {
    expect(numeroMensaje(1234.25)).toBe('1.234,25');
    expect(numeroMensaje(0.00005)).toBe('0,00005');
    expect(dineroMensaje(1234)).toBe('$1,234');
    expect(dineroMensaje(50400000)).not.toContain('COP');
  });
});
