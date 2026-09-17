// ARCHIVO: __tests__/novedadesDiaBogota.test.ts
// DESCRIPCIÓN: `diaBogota()` (src/utils/fechas.ts) convierte un `timestamptz`
// AJENO al reloj del navegador -- `capturadoEn` de una novedad -- al día
// calendario Bogotá. No es lo mismo que `obtenerFechaHoy()`, que lee el
// reloj LOCAL del navegador para "hoy". Ver
// `docs/plan_novedades_implementacion.md` §4.2 y §13.3.
//
// Bogotá es UTC-5 todo el año (sin horario de verano), así que el corte
// entre "el día de ayer en Bogotá" y "el día de hoy en Bogotá" cae siempre a
// las 05:00 UTC.

import { describe, it, expect } from 'vitest';
import { diaBogota, obtenerFechaHoy } from '@/utils/fechas';

describe('diaBogota — día calendario Bogotá de un timestamp ajeno', () => {
  it('02:00 UTC del 16 de septiembre cae bajo el día 15 en Bogotá (21:00 del 15, hora local)', () => {
    expect(diaBogota('2026-09-16T02:00:00Z')).toBe('2026-09-15');
  });

  it('04:59:59 UTC del 16 de septiembre sigue siendo el día 15 en Bogotá', () => {
    expect(diaBogota('2026-09-16T04:59:59Z')).toBe('2026-09-15');
  });

  it('05:00:00 UTC del 16 de septiembre ya es el día 16 en Bogotá -- el corte es exacto', () => {
    expect(diaBogota('2026-09-16T05:00:00Z')).toBe('2026-09-16');
  });

  it('acepta un ISO con offset explícito, no sólo Z', () => {
    // 2026-09-15T21:00:00-05:00 (Bogotá) es el mismo instante que el primer caso.
    expect(diaBogota('2026-09-15T21:00:00-05:00')).toBe('2026-09-15');
  });
});

// ============================================================================
// Regresión: por qué existen DOS funciones y cuándo coinciden.
//
// `obtenerFechaHoy()` lee el reloj LOCAL del navegador -- sirve para "hoy".
// `diaBogota(iso)` convierte un instante AJENO (ya ocurrido, con su propio
// huso) al día calendario de Bogotá -- sirve para agrupar una captura que no
// es "ahora". Con el navegador físicamente en Bogotá, las dos preguntas
// tienen la misma respuesta para el instante actual; en cualquier otro huso,
// pueden diferir. Confundirlas rompe los encabezados "Hoy" / "Ayer" del
// feed de Novedades justo para las capturas de Telegram de la tarde-noche.
// ============================================================================
describe('regresión: obtenerFechaHoy() y diaBogota(now) coinciden en Bogotá, pueden diferir fuera', () => {
  it('con el reloj del proceso en América/Bogotá, diaBogota(ahora) == obtenerFechaHoy()', () => {
    const original = process.env.TZ;
    process.env.TZ = 'America/Bogota';
    try {
      const ahoraISO = new Date().toISOString();
      expect(diaBogota(ahoraISO)).toBe(obtenerFechaHoy());
    } finally {
      process.env.TZ = original;
    }
  });

  it('con el reloj del proceso en otro huso, obtenerFechaHoy() puede diferir de diaBogota(ahora)', () => {
    const original = process.env.TZ;
    // Auckland, UTC+12/+13 -- deliberadamente muy lejos de Bogotá (UTC-5) para
    // que el mismo instante caiga en días calendario distintos en cada huso.
    process.env.TZ = 'Pacific/Auckland';
    try {
      // 2026-09-16T02:00:00Z: en Auckland (UTC+12/13) ya es 16-sep o 17-sep
      // según DST; en Bogotá sigue siendo 15-sep (ver primer bloque arriba).
      const instante = '2026-09-16T02:00:00Z';
      const localAuckland = new Date(instante);
      const local = `${localAuckland.getFullYear()}-${String(localAuckland.getMonth() + 1).padStart(2, '0')}-${String(
        localAuckland.getDate(),
      ).padStart(2, '0')}`;

      expect(diaBogota(instante)).toBe('2026-09-15');
      expect(local).not.toBe('2026-09-15');
    } finally {
      process.env.TZ = original;
    }
  });
});
