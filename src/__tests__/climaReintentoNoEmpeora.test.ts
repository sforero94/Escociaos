import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { debeReagregarDia } from '../supabase/functions/server/clima-reagregacion';

/**
 * El reintento diario de días sin dato (migración 121) no puede DEGRADAR un día.
 *
 * Qué pasó, con fechas y números de producción:
 *
 *  - `CLAUDE.md` (migración 103, verificada contra producción el 2026-08-21):
 *    «2026-08-19 quedó con `lecturas_count` = 167 de las 288 esperadas».
 *  - El 2026-08-27, en la PRIMERA corrida del cron de la 121, el log dice
 *    `[clima-reintento-sin-dato] 2026-08-19: 105 lecturas reagregadas` y
 *    `0/2 día(s) resuelto(s) a 'ok' en esta corrida`. La fila quedó en 105.
 *  - El 2026-08-28 volvió a pasar lo mismo (`105 lecturas reagregadas`,
 *    `0/3 día(s) resuelto(s)`): no es un incidente, es lo que hace cada día.
 *
 * Mecanismo: `backfillUnDia` inserta lo que devuelva la History API de Ecowitt
 * y vuelve a correr `fn_clima_rollup_diario`, que agrega sobre `clima_lecturas`
 * — una tabla que la migración 036 poda a 24 h. Para un día viejo las lecturas
 * originales ya no existen, así que el rollup sólo ve las recién insertadas y
 * `lecturas_count` BAJA. Y `lecturas_count` ES exactamente el predicado del
 * umbral de la migración 103, así que una respuesta parcial de Ecowitt puede
 * empujar a `cobertura_parcial` un día que estaba mejor clasificado.
 *
 * La guarda es de PREVENCIÓN, no de detección: una vez que el rollup corrió, la
 * fila anterior ya no se puede reconstruir — las lecturas que la sostenían
 * fueron podadas hace días. Por eso `debeReagregarDia` se consulta ANTES de
 * insertar nada.
 *
 * El caso que la guarda SÍ deja pasar es justamente aquel para el que existe el
 * cron: la estación estuvo sin luz, se reconectó, y Ecowitt subió el búfer del
 * día. Ahí la historia trae MÁS lecturas de las que se capturaron en vivo.
 */

const RAIZ = resolve(__dirname, '..', '..');
const COPIAS_CLIMA = [
  'src/supabase/functions/server/clima.tsx',
  'supabase/functions/make-server-1ccce916/clima.tsx',
];
const COPIAS_REAGREGACION = [
  'src/supabase/functions/server/clima-reagregacion.ts',
  'supabase/functions/make-server-1ccce916/clima-reagregacion.ts',
];

function leer(rel: string): string {
  return readFileSync(resolve(RAIZ, rel), 'utf-8');
}

describe('debeReagregarDia — el reintento nunca empeora un día', () => {
  it('NO reagrega cuando Ecowitt devuelve menos lecturas de las que la fila ya declara (2026-08-19: 167 -> 105)', () => {
    expect(debeReagregarDia(105, 167)).toBe(false);
  });

  it('reagrega cuando la estación se reconectó y Ecowitt subió el búfer (204 en vivo -> 288 en la historia)', () => {
    expect(debeReagregarDia(288, 204)).toBe(true);
  });

  it('reagrega cuando el día no tiene fila todavía (sin_registro)', () => {
    expect(debeReagregarDia(105, null)).toBe(true);
    expect(debeReagregarDia(105, undefined)).toBe(true);
  });

  it('reagrega con la misma cobertura — igual no es peor', () => {
    expect(debeReagregarDia(288, 288)).toBe(true);
  });

  it('reagrega cuando la fila declara 0 lecturas', () => {
    expect(debeReagregarDia(1, 0)).toBe(true);
  });

  it('no reagrega si Ecowitt no devolvió ninguna lectura para un día que ya tenía cobertura', () => {
    expect(debeReagregarDia(0, 105)).toBe(false);
  });
});

describe('clima.tsx — la guarda está cableada en las dos copias del árbol', () => {
  it('la consulta de candidatos trae `lecturas_count` junto a `lluvia_confianza`', () => {
    for (const rel of COPIAS_CLIMA) {
      const src = leer(rel);
      expect(src, rel).toContain('select=fecha,lluvia_confianza,lecturas_count');
    }
  });

  it('`backfillUnDia` consulta la guarda ANTES de disparar `fn_clima_rollup_diario`', () => {
    for (const rel of COPIAS_CLIMA) {
      const src = leer(rel);
      const iGuarda = src.indexOf('debeReagregarDia(');
      const iRollup = src.indexOf('rpc/fn_clima_rollup_diario');
      expect(iGuarda, `${rel}: no llama a debeReagregarDia`).toBeGreaterThan(-1);
      expect(iRollup, `${rel}: no llama al rollup`).toBeGreaterThan(-1);
      expect(iGuarda, `${rel}: la guarda va DESPUÉS del rollup`).toBeLessThan(iRollup);
    }
  });

  it('el comentario del endpoint ya no afirma que un día sin resolver queda intacto sin condición', () => {
    for (const rel of COPIAS_CLIMA) {
      const src = leer(rel);
      expect(src, rel).not.toContain('Si Ecowitt TODAVÍA no lo tiene, el día queda');
    }
  });

  it('las dos copias del árbol de edge function son idénticas', () => {
    expect(leer(COPIAS_CLIMA[0])).toBe(leer(COPIAS_CLIMA[1]));
    expect(leer(COPIAS_REAGREGACION[0])).toBe(leer(COPIAS_REAGREGACION[1]));
  });
});
