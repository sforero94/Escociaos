import { describe, it, expect, beforeAll } from 'vitest';
import type { ResumenDiario } from '@/types/clima';

/**
 * Regresión con datos REALES de producción (`clima_resumen_diario`, estación
 * Ecowitt, extraídos el 2026-08-27). No es un fixture inventado: es el estado
 * exacto que producía el defecto en el tablero.
 *
 * QUÉ FIJA ESTE ARCHIVO
 * ---------------------
 * 1. El patrón que delata la causa raíz. La migración 068 marcaba
 *    `contador_congelado` cuando el total de un día era >0 y EXACTAMENTE igual
 *    al del día anterior. En estos 86 días reales, TODOS los marcados así
 *    siguen a un día con el valor idéntico — 9 de 9:
 *
 *      06-04: 9,14  ok -> 06-05: 9,14  congelado
 *      06-08: 17,02 ok -> 06-09: 17,02 congelado
 *      06-15: 1,52  ok -> 06-16: 1,52  congelado
 *      06-17: 0,51  ok -> 06-18: 0,51  congelado
 *      06-28: 1,78  ok -> 06-29: 1,78  congelado
 *      06-30: 2,79  ok -> 07-01: 2,79  congelado
 *      07-03: 2,79  ok -> 07-04: 2,79  congelado
 *      07-09: 28,19 ok -> 07-10: 28,19 congelado
 *      07-20: 15,75 ok -> 07-21: 15,75 congelado
 *
 *    Ninguno entró por la señal de frescura de Ecowitt, que es la única de las
 *    dos vías con evidencia detrás. Si alguien vuelve a proponer la heurística
 *    "hoy == ayer => contador congelado", este bloque es la refutación.
 *
 * 2. El número que el tablero tiene que mostrar. Con la regla vieja el contador
 *    de días sin lluvia se detenía en el primer hueco y decía **5**. La
 *    respuesta correcta es **37** — la última lluvia >= 10 mm confirmada fue el
 *    2026-07-20 (15,75 mm).
 */

// Snapshot literal de producción: fecha -> [mm, confianza]. `null` = la fila
// existe pero sin valor. Los días que faltan (ninguno en este rango) serían
// filas ausentes.
const PRODUCCION: Array<[string, number | null, ResumenDiario['lluvia_confianza']]> = [
  ['2026-06-01', 0, 'ok'], ['2026-06-02', 0, 'ok'], ['2026-06-03', 0.25, 'ok'],
  ['2026-06-04', 9.14, 'ok'], ['2026-06-05', 9.14, 'contador_congelado'],
  ['2026-06-06', 4.06, 'ok'], ['2026-06-07', 12.95, 'ok'],
  ['2026-06-08', 17.02, 'ok'], ['2026-06-09', 17.02, 'contador_congelado'],
  ['2026-06-10', 0, 'ok'], ['2026-06-11', 0, 'ok'], ['2026-06-12', 0, 'ok'],
  ['2026-06-13', 0, 'ok'], ['2026-06-14', 0, 'ok'],
  ['2026-06-15', 1.52, 'ok'], ['2026-06-16', 1.52, 'contador_congelado'],
  ['2026-06-17', 0.51, 'ok'], ['2026-06-18', 0.51, 'contador_congelado'],
  ['2026-06-19', 0, 'ok'], ['2026-06-20', 0, 'ok'], ['2026-06-21', 0, 'ok'],
  ['2026-06-22', 0, 'ok'], ['2026-06-23', 0, 'ok'], ['2026-06-24', 0, 'ok'],
  ['2026-06-25', 0, 'ok'], ['2026-06-26', 0, 'ok'], ['2026-06-27', 0, 'ok'],
  ['2026-06-28', 1.78, 'ok'], ['2026-06-29', 1.78, 'contador_congelado'],
  ['2026-06-30', 2.79, 'ok'], ['2026-07-01', 2.79, 'contador_congelado'],
  ['2026-07-02', 0.76, 'ok'],
  ['2026-07-03', 2.79, 'ok'], ['2026-07-04', 2.79, 'contador_congelado'],
  ['2026-07-05', 1.78, 'ok'], ['2026-07-06', 0, 'ok'], ['2026-07-07', 0, 'ok'],
  ['2026-07-08', 0, 'ok'],
  ['2026-07-09', 28.19, 'ok'], ['2026-07-10', 28.19, 'contador_congelado'],
  ['2026-07-11', 0, 'ok'], ['2026-07-12', 0, 'ok'], ['2026-07-13', 0, 'ok'],
  ['2026-07-14', 0, 'ok'], ['2026-07-15', 0, 'ok'], ['2026-07-16', 0, 'ok'],
  ['2026-07-17', 0, 'ok'], ['2026-07-18', 0, 'ok'], ['2026-07-19', 1.78, 'ok'],
  ['2026-07-20', 15.75, 'ok'], ['2026-07-21', 15.75, 'contador_congelado'],
  ['2026-07-22', 1.02, 'ok'], ['2026-07-23', 5.84, 'ok'],
  ['2026-07-24', null, 'contador_congelado'],
  ['2026-07-25', 0, 'ok'], ['2026-07-26', 0, 'ok'], ['2026-07-27', 0, 'ok'],
  ['2026-07-28', 0, 'ok'], ['2026-07-29', 0, 'ok'], ['2026-07-30', 0.25, 'ok'],
  ['2026-07-31', null, 'contador_congelado'],
  ['2026-08-01', 0.25, 'ok'], ['2026-08-02', null, 'contador_congelado'],
  ['2026-08-03', 0, 'ok'], ['2026-08-04', 0, 'ok'], ['2026-08-05', 0, 'ok'],
  ['2026-08-06', 0.25, 'ok'], ['2026-08-07', 0.51, 'ok'],
  ['2026-08-08', null, 'contador_congelado'],
  ['2026-08-09', 0.25, 'ok'], ['2026-08-10', null, 'contador_congelado'],
  ['2026-08-11', 0, 'ok'], ['2026-08-12', 0.25, 'ok'],
  ['2026-08-13', null, 'contador_congelado'],
  ['2026-08-14', 0, 'ok'], ['2026-08-15', 0, 'ok'], ['2026-08-16', 1.78, 'ok'],
  ['2026-08-17', 3.81, 'ok'], ['2026-08-18', null, 'contador_congelado'],
  ['2026-08-19', null, 'cobertura_parcial'], ['2026-08-20', null, 'cobertura_parcial'],
  ['2026-08-21', 0, 'ok'], ['2026-08-22', 0, 'ok'], ['2026-08-23', 0, 'ok'],
  ['2026-08-24', 0, 'ok'], ['2026-08-25', 0, 'ok'],
  // 2026-08-26 NO tiene fila: el rollup corre a las 00:15 y todavía no pasó.
];

const FILAS: ResumenDiario[] = PRODUCCION.map(([fecha, mm, confianza]) => ({
  fecha,
  station_id: '84:1F:E8:35:D8:73 ',
  temp_c_min: null, temp_c_max: null, temp_c_avg: null,
  humedad_pct_min: null, humedad_pct_max: null, humedad_pct_avg: null,
  lluvia_total_mm: mm,
  lluvia_confianza: confianza,
  viento_kmh_avg: null, rafaga_kmh_max: null, viento_dir_predominante: null,
  radiacion_wm2_avg: null, radiacion_wm2_max: null, uv_index_max: null,
  lecturas_count: 288,
}));

const HOY = '2026-08-27';

describe('Racha sin lluvia — datos reales de producción (2026-08-27)', () => {
  let calcularRachaSinLluvia: typeof import('@/utils/calculosClima').calcularRachaSinLluvia;

  beforeAll(async () => {
    const mod = await import('@/utils/calculosClima');
    calcularRachaSinLluvia = mod.calcularRachaSinLluvia;
  });

  it('LA CAUSA RAÍZ: los 9 días marcados con valor conservado siguen a uno idéntico', () => {
    const congeladosConValor = PRODUCCION
      .map(([fecha, mm, conf], i) => ({ fecha, mm, conf, anterior: PRODUCCION[i - 1] }))
      .filter((d) => d.conf === 'contador_congelado' && d.mm !== null);

    expect(congeladosConValor).toHaveLength(9);
    for (const d of congeladosConValor) {
      expect(d.anterior).toBeDefined();
      // hoy == ayer EXACTO en los 9. Ninguno entró por evidencia de frescura.
      expect(d.mm).toBe(d.anterior![1]);
    }
  });

  it('el tablero muestra 37 días, no 5 — la última lluvia ≥10 mm fue el 20-jul', () => {
    const racha = calcularRachaSinLluvia(FILAS, HOY, 10);

    expect(racha.dias).toBe(37);
    expect(racha.ultimaLluviaFecha).toBe('2026-07-20');
    expect(racha.ultimaLluviaMm).toBe(15.75);
    expect(racha.desdeFecha).toBe('2026-07-21');
    expect(racha.hastaFecha).toBe('2026-08-26');
  });

  it('declara cuántos días del tramo no están confirmados, sin esconderlo ni alarmar', () => {
    const racha = calcularRachaSinLluvia(FILAS, HOY, 10);
    // 8 congelados + 2 cobertura parcial + el 26-ago que aún no tiene fila.
    expect(racha.diasSinConfirmar).toBe(11);
    expect(racha.diasSinConfirmar).toBeLessThan(racha.dias);
  });

  it('con la regla vieja el conteo se detenía en el primer hueco: de ahí salía el 5 de la pantalla', () => {
    // Reproduce el comportamiento anterior sobre los mismos datos, con la fecha
    // en que se tomó la captura (26-ago): contaba 25, 24, 23, 22 y 21 de agosto
    // y se detenía en el 20, que es `cobertura_parcial`. Cinco días. Queda
    // asentado de dónde salía ese número y que el 37 no es una invención.
    let viejo = 0;
    for (let i = 1; i <= 60; i++) {
      const d = new Date(2026, 7, 26 - i);
      const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const fila = FILAS.find((r) => r.fecha === f);
      if (!fila) break;
      const mm = fila.lluvia_confianza === 'contador_congelado' || fila.lluvia_confianza === 'cobertura_parcial'
        ? null : fila.lluvia_total_mm;
      if (mm === null || mm >= 10) break;
      viejo++;
    }
    expect(viejo).toBe(5);

    // La regla nueva, sobre los MISMOS datos y la MISMA fecha: 36 días.
    const nuevo = calcularRachaSinLluvia(FILAS, '2026-08-26', 10);
    expect(nuevo.dias).toBe(36);
    expect(nuevo.ultimaLluviaFecha).toBe('2026-07-20');
  });
});
