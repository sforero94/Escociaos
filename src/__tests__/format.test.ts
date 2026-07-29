// ARCHIVO: __tests__/format.test.ts
// DESCRIPCIÓN: Regresión del bug de fecha off-by-one (FIX 1,
// docs/hato/qa-produccion-rework.md): `new Date('YYYY-MM-DD')` parsea como
// UTC medianoche, y en Bogotá (UTC-5) `Intl.DateTimeFormat` la renderiza un
// día antes -- en frontera de año, incluso un año antes. Este archivo fija
// el contrato: un string de fecha SOLA (`YYYY-MM-DD`) debe renderizar
// exactamente ese día calendario, sin importar la hora local en la que
// corra el test. No cubre `formatCurrency`/`formatNumber`/etc. -- esas no
// tocan zonas horarias.

import { describe, it, expect } from 'vitest';
import { formatShortDate, formatLongDate, formatRelativeTime, formatDateRange } from '@/utils/format';

describe('formatShortDate', () => {
  it('un string YYYY-MM-DD renderiza el MISMO día calendario, nunca el anterior', () => {
    // Caso real del brief: la pantalla de pesaje decía "21 de julio" para
    // 2026-07-22 (un martes, 07-21, en vez del miércoles real).
    expect(formatShortDate('2026-07-22')).toBe('22 de jul de 2026');
    expect(formatShortDate('2026-06-24')).toBe('24 de jun de 2026');
  });

  it('frontera de año: 2026-01-01 nunca renderiza como diciembre de 2025', () => {
    const resultado = formatShortDate('2026-01-01');
    expect(resultado).toBe('1 de ene de 2026');
    expect(resultado).not.toContain('2025');
  });

  it('un objeto Date real se sigue comportando igual que antes (no se le suma timeZone: UTC)', () => {
    // new Date(2026, 6, 22) es 22 de julio de 2026 en hora LOCAL -- si el
    // fix rompiera el camino de los objetos Date reales, esto fallaría.
    expect(formatShortDate(new Date(2026, 6, 22))).toBe('22 de jul de 2026');
  });
});

describe('formatLongDate', () => {
  it('un string YYYY-MM-DD renderiza el MISMO día calendario', () => {
    expect(formatLongDate('2026-07-22')).toBe('22 de julio de 2026');
    expect(formatLongDate('2026-06-24')).toBe('24 de junio de 2026');
  });

  it('frontera de año: 2026-01-01 nunca renderiza como diciembre de 2025', () => {
    const resultado = formatLongDate('2026-01-01');
    expect(resultado).toBe('1 de enero de 2026');
    expect(resultado).not.toContain('2025');
  });

  it('un timestamp ISO con hora sigue su camino normal, sin cambios', () => {
    // No es "YYYY-MM-DD" puro -- este NO debe pasar por el parche de
    // fecha-sola, así que su comportamiento (incluida cualquier variación
    // por zona horaria de un timestamp real) es el mismo de siempre.
    const iso = '2026-07-22T23:30:00Z'; // 23:30 UTC == 18:30 Bogotá (UTC-5), mismo día en ambas
    expect(formatLongDate(iso)).toBe('22 de julio de 2026');
  });
});

describe('formatRelativeTime -- fechas-solo no se desplazan de día (mismo bug, mismo fix)', () => {
  it('una fecha YYYY-MM-DD de hace exactamente N días calendario cuenta N días, no N-1/N+1', () => {
    const hoy = new Date();
    const haceTresDias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 3);
    const iso = `${haceTresDias.getFullYear()}-${String(haceTresDias.getMonth() + 1).padStart(2, '0')}-${String(haceTresDias.getDate()).padStart(2, '0')}`;
    expect(formatRelativeTime(iso)).toBe('hace 3 días');
  });

  it('un timestamp ISO con hora sigue funcionando igual que antes (no es fecha-sola)', () => {
    const ahora = new Date();
    expect(formatRelativeTime(ahora.toISOString())).toMatch(/hace|segundos/);
  });

  // Regresión de una CUARTA ocurrencia del mismo bug, encontrada en vivo en
  // el navegador DESPUÉS de corregir las otras tres: el diálogo de detalle
  // de quincena mostraba "30 de abr - 14 de may de 2026" para una fila cuyo
  // rango real en la base es 2026-05-01 → 2026-05-15. El fix original no
  // había tocado `formatDateRange`.
  describe('formatDateRange', () => {
    it('respeta el día calendario en ambos extremos del rango', () => {
      expect(formatDateRange('2026-05-01', '2026-05-15')).toBe('1 de may - 15 de may de 2026');
    });

    it('no retrocede al mes anterior en el primer día del mes', () => {
      const rango = formatDateRange('2026-05-01', '2026-05-15');
      expect(rango).not.toContain('abr');
      expect(rango.startsWith('1 de may')).toBe(true);
    });

    it('no retrocede de año en una quincena de enero', () => {
      expect(formatDateRange('2026-01-01', '2026-01-15')).not.toContain('2025');
    });
  });
});
