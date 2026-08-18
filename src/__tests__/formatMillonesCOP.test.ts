// ARCHIVO: __tests__/formatMillonesCOP.test.ts
// DESCRIPCIÓN: `formatMillonesCOP` es el formateador de dinero del bloque
// "Dinero" del Centro de Control (`docs/plan_dashboard_centro_control.md`
// §9.1: "$66,5M", coma decimal, sin sufijo COP, nunca billones -- "usa
// formato 2.000M"). `formatCompact` (ya existente en format.ts) no sirve
// para este bloque: usa `.toFixed(1)`, que produce coma inglesa ("66.5M"),
// no colombiana ("66,5M").

import { describe, it, expect } from 'vitest';
import { formatMillonesCOP } from '@/utils/format';

describe('formatMillonesCOP', () => {
  it('formatea con coma decimal colombiana, no punto', () => {
    expect(formatMillonesCOP(66_529_769)).toBe('$66,5M');
    expect(formatMillonesCOP(144_838_926)).toBe('$144,8M');
  });

  it('un millón exacto no arrastra decimales espurios', () => {
    expect(formatMillonesCOP(11_600_000)).toBe('$11,6M');
  });

  it('nunca usa la escala de billones -- miles con punto en vez de eso ("2.000M")', () => {
    expect(formatMillonesCOP(2_000_000_000)).toBe('$2.000M');
  });

  it('cero se formatea como "$0,0M", nunca se omite el signo $', () => {
    expect(formatMillonesCOP(0)).toBe('$0,0M');
  });

  it('valores menores a un millón conservan un decimal (nunca "$0M" para $500.000)', () => {
    expect(formatMillonesCOP(500_000)).toBe('$0,5M');
  });
});
