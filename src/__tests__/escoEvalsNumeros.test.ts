import { describe, it, expect } from 'vitest';
import { extraerNumeros, fechaPresente, numeroCerca } from '@/utils/escoEvals/numeros';

describe('extraerNumeros', () => {
  it('lee miles con punto y decimales con coma (formato colombiano)', () => {
    const n = extraerNumeros('Costo $9.262.976 y promedio 96.995; humedad 83,1 %');
    expect(n).toContain(9262976);
    expect(n).toContain(96995);
    expect(n).toContain(83.1);
  });

  it('un token ambiguo como 59.014 genera las dos lecturas', () => {
    const n = extraerNumeros('Cartama vendió 59.014 kg');
    expect(n).toContain(59014);
    expect(n).toContain(59.014);
  });

  it('un punto decimal que no es de miles se lee como decimal', () => {
    const n = extraerNumeros('Llovió 54.33 mm y 0.25 mm');
    expect(n).toContain(54.33);
    expect(n).toContain(0.25);
    expect(n).not.toContain(5433);
  });

  it('mezcla de separadores: el último es el decimal', () => {
    expect(extraerNumeros('1.234,56')).toContain(1234.56);
    expect(extraerNumeros('1,234.56')).toContain(1234.56);
  });

  it('sufijos: M y millones multiplican, mm (milímetros) no', () => {
    expect(extraerNumeros('$385,9M')).toContain(385900000);
    expect(extraerNumeros('2 millones')).toContain(2000000);
    expect(extraerNumeros('54 mm de lluvia')).toEqual([54]);
  });

  it('ignora un punto o coma final de oración', () => {
    expect(extraerNumeros('Fueron 87.25.')).toContain(87.25);
  });

  it('does not turn a negative balance into a matching positive amount', () => {
    expect(extraerNumeros('Saldo -87,25; diferencia −12.5')).toEqual([-87.25, -12.5]);
    expect(numeroCerca(87.25, 0, extraerNumeros('-87.25'))).toBe(false);
  });
});

describe('numeroCerca', () => {
  it('respeta la tolerancia y exige igualdad sin ella', () => {
    expect(numeroCerca(54.33, 2, [53.1])).toBe(true);
    expect(numeroCerca(54.33, 2, [48.2])).toBe(false);
    expect(numeroCerca(117, null, [117])).toBe(true);
    expect(numeroCerca(117, null, [118])).toBe(false);
  });
});

describe('fechaPresente', () => {
  it('reconoce ISO, d/m/aaaa y nombres de mes en español', () => {
    expect(fechaPresente('2026-08-12', 'última lluvia: 2026-08-12')).toBe(true);
    expect(fechaPresente('2026-08-12', 'el 12/08/2026 llovió')).toBe(true);
    expect(fechaPresente('2026-08-12', 'el 12 de agosto de 2026')).toBe(true);
    expect(fechaPresente('2026-08-12', 'Agosto 12')).toBe(true);
    expect(fechaPresente('2026-08-12', '12-ago')).toBe(true);
  });

  it('no confunde día y mes ni otra fecha', () => {
    expect(fechaPresente('2026-08-12', 'el 8 de diciembre')).toBe(false);
    expect(fechaPresente('2026-08-12', 'el 13 de agosto')).toBe(false);
    expect(fechaPresente('2026-04-27', 'el 24 de abril')).toBe(false);
  });

  it('no toma «112 de agosto» como día 12', () => {
    expect(fechaPresente('2026-08-12', '112 de agosto')).toBe(false);
  });

  it('rejects an explicitly different year in written and numeric dates', () => {
    for (const texto of ['12 de agosto de 2025', 'Agosto 12, 2025', '12/08/2025', '2025-08-12']) {
      expect(fechaPresente('2026-08-12', texto)).toBe(false);
    }
  });

  it('does not reinterpret the suffix of an ISO date as day/month', () => {
    expect(fechaPresente('2026-12-08', '2026-08-12')).toBe(false);
    expect(fechaPresente('2026-08-12', '2026-12-08')).toBe(false);
  });
});
