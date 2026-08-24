// ARCHIVO: __tests__/semanaISO.test.ts
// DESCRIPCIÓN: Contrato de `semanaISO()` (src/utils/fechas.ts) y del agrupador
// semanal de `TablaMonitoreos`.
//
// Defecto que cierra (hallazgo #27 de la operación de mantenimiento):
// `agruparPorSemana()` construía `new Date(m.fecha_monitoreo)` — que para un
// `AAAA-MM-DD` es medianoche **UTC** — y luego lo leía con `getFullYear()`,
// `getMonth()`, `getDate()`, `getDay()`, que son **locales**. En Bogotá (UTC-5)
// esa Date es el día anterior a las 19:00, así que cada fecha se corría un día
// hacia atrás. Consecuencia exacta: **un monitoreo hecho un lunes se archivaba
// en la semana anterior**, porque lunes−1 = domingo, y el domingo cierra la
// semana ISO precedente.
//
// Medido en producción 2026-08-24: **677 de 4.200 monitoreos (16,1 %)** caen en
// lunes, sobre 14 fechas y 13 rondas — y esas 13 rondas quedaban **partidas en
// dos grupos semanales**, con su mitad del lunes en la semana de antes.
//
// El segundo defecto era el año: la etiqueta usaba el año del CALENDARIO local.
// Un monitoreo del 1 de enero se archivaba bajo el año anterior (31-dic local),
// y aun sin el corrimiento, el año de calendario y el año ISO no coinciden en el
// cambio de año — «Semana 53 · 2027» es una combinación que no existe.

import { describe, it, expect } from 'vitest';
import { semanaISO } from '@/utils/fechas';

describe('semanaISO — casos canónicos ISO 8601', () => {
  it.each([
    // fecha        semana  añoISO  lunes         domingo
    ['2026-01-05', 2, 2026, '2026-01-05', '2026-01-11'], // lunes
    ['2026-01-01', 1, 2026, '2025-12-29', '2026-01-04'], // jueves: semana 1 de 2026
    ['2025-12-29', 1, 2026, '2025-12-29', '2026-01-04'], // lunes que abre la semana 1 de 2026
    ['2027-01-01', 53, 2026, '2026-12-28', '2027-01-03'], // viernes: semana 53 de 2026
    ['2026-08-03', 32, 2026, '2026-08-03', '2026-08-09'], // último monitoreo real, un lunes
    ['2025-01-03', 1, 2025, '2024-12-30', '2025-01-05'], // primer monitoreo real, un viernes
  ])('%s → semana %i de %i (%s a %s)', (fecha, semana, anioISO, lunes, domingo) => {
    expect(semanaISO(fecha as string)).toEqual({ semana, anioISO, lunes, domingo });
  });

  it('el lunes y el domingo de la misma semana caen en el mismo grupo', () => {
    const lunes = semanaISO('2026-08-03');
    const domingo = semanaISO('2026-08-09');
    expect(`${lunes.anioISO}-S${lunes.semana}`).toBe(`${domingo.anioISO}-S${domingo.semana}`);
  });

  it('el domingo anterior pertenece a la semana anterior, no a la del lunes', () => {
    expect(semanaISO('2026-08-02').semana).toBe(31);
    expect(semanaISO('2026-08-03').semana).toBe(32);
  });

  it('ignora cualquier hora que traiga el string', () => {
    expect(semanaISO('2026-08-03T23:45:00Z')).toEqual(semanaISO('2026-08-03'));
  });

  it('el lunes y el domingo devueltos están a exactamente 6 días', () => {
    const { lunes, domingo } = semanaISO('2026-02-18');
    const dias = (Date.parse(domingo) - Date.parse(lunes)) / 86400000;
    expect(dias).toBe(6);
  });
});

describe('regresión — el agrupador ya no corre las fechas un día hacia atrás', () => {
  /**
   * Reproduce la aritmética vieja de `TablaMonitoreos.agruparPorSemana()`
   * **con el huso de Bogotá fijado a mano**, para que el test sea determinista
   * en cualquier runner. `new Date('AAAA-MM-DD')` es medianoche UTC; en UTC-5
   * los getters locales ven el día anterior a las 19:00, y eso es lo que
   * simula el `- 5h`. Un runner en UTC no reproduce el bug por sí solo, así que
   * un `it.runIf(offset > 0)` habría dejado el caso sin correr en CI.
   */
  const viejoAgrupadorEnBogota = (iso: string) => {
    const utc = new Date(`${iso}T00:00:00Z`);
    const local = new Date(utc.getTime() - 5 * 3600 * 1000); // UTC-5
    const anio = local.getUTCFullYear();
    const d = new Date(Date.UTC(anio, local.getUTCMonth(), local.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const semana = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return { semana, anio };
  };

  it('las fechas de lunes con monitoreos reales ya no bajan una semana', () => {
    const lunesReales = [
      '2025-01-20', '2025-02-10', '2025-04-21', '2025-05-12', '2025-06-09',
      '2025-07-21', '2025-09-08', '2025-09-29', '2026-08-03',
    ];
    for (const fecha of lunesReales) {
      const nuevo = semanaISO(fecha);
      const viejo = viejoAgrupadorEnBogota(fecha);
      expect(viejo.semana, `${fecha}: la aritmética vieja debía quedar una semana atrás`).toBe(
        nuevo.semana - 1,
      );
    }
  });

  it('los días que NO son lunes caían en la semana correcta por casualidad', () => {
    for (const fecha of ['2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09']) {
      expect(viejoAgrupadorEnBogota(fecha).semana).toBe(semanaISO(fecha).semana);
    }
  });

  it('un monitoreo del 1 de enero ya no se archiva bajo el año anterior', () => {
    expect(viejoAgrupadorEnBogota('2026-01-01').anio).toBe(2025);
    expect(semanaISO('2026-01-01').anioISO).toBe(2026);
  });
});
