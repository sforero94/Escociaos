import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  DIAS_VENTANA_ACTUALIZAR,
  MINUTOS_HUECO_MAX_COBERTURA,
  clasificarDia,
  diaEstaIncompleto,
  fechasVentanaActualizar,
  resumirActualizacion,
  seleccionarDiasIncompletos,
  type FilaResumenDia,
} from '../supabase/functions/server/clima-actualizar';

/**
 * ESCO-127 — el botón «Actualizar» de la vista de Clima.
 *
 * Hasta este cambio no había forma de completar la historia de clima sin
 * pedirlo en una sesión: `POST /clima/backfill` existe desde siempre y ningún
 * componente de `src/components` lo llamaba, y el único reintento automático
 * (cron de la migración 121) sólo mira la lluvia sin dato confiable — no mira
 * `horas_sol_duracion`, ni `lluvia_mm_evento`, ni `cobertura_hueco_max_min`.
 *
 * Estado real de producción el 2026-09-25, ventana de los últimos 10 días de
 * la estación Ecowitt: 2026-09-16 (`lecturas_count` 11) y 2026-09-17 (189)
 * quedaron `cobertura_parcial` con `horas_sol_duracion` en NULL, y siguen así.
 *
 * Lo que esta prueba fija es la lógica PURA: qué días entran, cómo se llama el
 * desenlace de cada uno, y que HOY nunca entra.
 */

const filaCompleta = (fecha: string): FilaResumenDia => ({
  fecha,
  lluvia_confianza: 'ok',
  lluvia_mm_evento: 0,
  horas_sol_duracion: 7.42,
  cobertura_hueco_max_min: 5.38,
  lecturas_count: 288,
});

describe('diaEstaIncompleto — los cinco criterios de ESCO-127', () => {
  it('un día completo NO entra', () => {
    expect(diaEstaIncompleto(filaCompleta('2026-09-24'))).toBe(false);
  });

  it('sin fila entra (el rollup nunca corrió para ese día)', () => {
    expect(diaEstaIncompleto(undefined)).toBe(true);
    expect(diaEstaIncompleto(null)).toBe(true);
  });

  it('cobertura_parcial entra', () => {
    expect(diaEstaIncompleto({ ...filaCompleta('2026-09-17'), lluvia_confianza: 'cobertura_parcial' })).toBe(true);
  });

  it('lluvia_mm_evento en NULL entra', () => {
    expect(diaEstaIncompleto({ ...filaCompleta('2026-09-17'), lluvia_mm_evento: null })).toBe(true);
  });

  it('horas_sol_duracion en NULL entra — es lo que el cron de la 121 no mira', () => {
    expect(diaEstaIncompleto({ ...filaCompleta('2026-09-16'), horas_sol_duracion: null })).toBe(true);
  });

  it('un hueco temporal por encima del umbral de la 159 entra; justo en el umbral no', () => {
    expect(diaEstaIncompleto({ ...filaCompleta('2026-09-20'), cobertura_hueco_max_min: MINUTOS_HUECO_MAX_COBERTURA })).toBe(false);
    expect(diaEstaIncompleto({ ...filaCompleta('2026-09-20'), cobertura_hueco_max_min: MINUTOS_HUECO_MAX_COBERTURA + 1 })).toBe(true);
  });

  it('contador_congelado NO entra — es firmware del sensor, no un hueco de captura', () => {
    expect(diaEstaIncompleto({ ...filaCompleta('2026-07-21'), lluvia_confianza: 'contador_congelado' })).toBe(false);
  });

  it('un cero medido no es un dato faltante: 0 mm de lluvia y 0 horas de sol están completos', () => {
    expect(diaEstaIncompleto({ ...filaCompleta('2026-09-22'), lluvia_mm_evento: 0, horas_sol_duracion: 0 })).toBe(false);
  });
});

describe('fechasVentanaActualizar — HOY nunca entra', () => {
  it('devuelve los 7 días anteriores, del más viejo al más nuevo', () => {
    expect(fechasVentanaActualizar('2026-09-25')).toEqual([
      '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21',
      '2026-09-22', '2026-09-23', '2026-09-24',
    ]);
  });

  it('nunca incluye el día en curso — su rollup corre esta noche y backfillearlo borraría las lecturas en vivo', () => {
    expect(fechasVentanaActualizar('2026-09-25')).not.toContain('2026-09-25');
  });

  it('cruza el fin de mes sin inventar fechas', () => {
    expect(fechasVentanaActualizar('2026-03-03', 4)).toEqual([
      '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02',
    ]);
  });

  it('la ventana son 7 días', () => {
    expect(DIAS_VENTANA_ACTUALIZAR).toBe(7);
    expect(fechasVentanaActualizar('2026-09-25')).toHaveLength(7);
  });
});

describe('seleccionarDiasIncompletos', () => {
  const ventana = fechasVentanaActualizar('2026-09-25');

  it('devuelve sólo los incompletos, del más viejo al más nuevo, con lecturasPrevias', () => {
    const filas: FilaResumenDia[] = [
      filaCompleta('2026-09-18'),
      { ...filaCompleta('2026-09-19'), horas_sol_duracion: null, lecturas_count: 189 },
      filaCompleta('2026-09-20'),
      filaCompleta('2026-09-22'),
      filaCompleta('2026-09-23'),
      filaCompleta('2026-09-24'),
    ];
    expect(seleccionarDiasIncompletos(ventana, filas)).toEqual([
      { fecha: '2026-09-19', lecturasPrevias: 189 },
      // 2026-09-21 no tiene fila: entra, y sin lecturas previas que comparar.
      { fecha: '2026-09-21', lecturasPrevias: null },
    ]);
  });

  it('si no hay ninguno incompleto devuelve lista vacía — cero llamadas a Ecowitt', () => {
    const filas = ventana.map(filaCompleta);
    expect(seleccionarDiasIncompletos(ventana, filas)).toEqual([]);
  });

  it('como máximo pide un día por fecha de la ventana', () => {
    expect(seleccionarDiasIncompletos(ventana, []).length).toBeLessThanOrEqual(DIAS_VENTANA_ACTUALIZAR);
  });
});

describe('clasificarDia — verificación por fila, nunca por la respuesta HTTP', () => {
  const antes: FilaResumenDia = { ...filaCompleta('2026-09-17'), lluvia_confianza: 'cobertura_parcial', horas_sol_duracion: null, lecturas_count: 189 };

  it('recuperado: el día dejó de estar incompleto', () => {
    expect(clasificarDia(antes, filaCompleta('2026-09-17'), { ok: true })).toBe('recuperado');
  });

  it('sin_cambio: la consulta salió bien pero el día sigue incompleto', () => {
    expect(clasificarDia(antes, antes, { ok: true })).toBe('sin_cambio');
  });

  it('sin_cambio: el día se omitió por la guarda de no-empeorar', () => {
    expect(clasificarDia(antes, antes, { ok: true, omitido: true })).toBe('sin_cambio');
  });

  it('sin_datos_ecowitt: Ecowitt contesta bien pero no tiene ese día', () => {
    expect(clasificarDia(antes, antes, { ok: false, error: 'sin datos de Ecowitt para ese día' })).toBe('sin_datos_ecowitt');
    expect(clasificarDia(antes, antes, { ok: false, error: '0 lecturas parseadas' })).toBe('sin_datos_ecowitt');
  });

  it('error: cualquier otro fallo, y no se confunde con «no hay datos»', () => {
    expect(clasificarDia(antes, antes, { ok: false, error: 'Ecowitt API HTTP 500 — upstream' })).toBe('error');
    expect(clasificarDia(antes, antes, { ok: false, error: 'insert clima_lecturas falló — 504' })).toBe('error');
  });

  it('nunca dice «recuperado» de un día que ya estaba completo antes', () => {
    expect(clasificarDia(filaCompleta('2026-09-24'), filaCompleta('2026-09-24'), { ok: true })).toBe('sin_cambio');
  });
});

describe('resumirActualizacion', () => {
  it('cuenta por desenlace y conserva el total revisado', () => {
    expect(resumirActualizacion(
      ['recuperado', 'recuperado', 'sin_cambio', 'sin_datos_ecowitt', 'error'],
      5,
    )).toEqual({ revisados: 5, recuperados: 2, sinCambio: 1, sinDatos: 1, errores: 1 });
  });

  it('cero revisados es un resultado válido: «todo al día»', () => {
    expect(resumirActualizacion([], 0)).toEqual({ revisados: 0, recuperados: 0, sinCambio: 0, sinDatos: 0, errores: 0 });
  });
});

/**
 * Los dos árboles de edge function se despliegan por separado y hay que
 * mantenerlos byte a byte (ver `CLAUDE.md`). Un módulo nuevo es exactamente
 * donde se olvida la segunda copia.
 */
describe('paridad entre los dos árboles de edge function', () => {
  const raiz = resolve(__dirname, '../..');
  const copias = [
    'src/supabase/functions/server/clima-actualizar.ts',
    'supabase/functions/make-server-1ccce916/clima-actualizar.ts',
  ];

  it('las dos copias de clima-actualizar.ts son idénticas', () => {
    const [a, b] = copias.map((p) => readFileSync(resolve(raiz, p), 'utf8'));
    expect(b).toBe(a);
  });

  it('las dos copias de clima.tsx exponen handleClimaActualizar', () => {
    for (const p of [
      'src/supabase/functions/server/clima.tsx',
      'supabase/functions/make-server-1ccce916/clima.tsx',
    ]) {
      expect(readFileSync(resolve(raiz, p), 'utf8')).toContain('export async function handleClimaActualizar');
    }
  });

  it('las dos copias del index registran POST /clima/actualizar', () => {
    for (const p of [
      'src/supabase/functions/server/index.tsx',
      'supabase/functions/make-server-1ccce916/index.ts',
    ]) {
      expect(readFileSync(resolve(raiz, p), 'utf8')).toContain('/make-server-1ccce916/clima/actualizar');
    }
  });
});
