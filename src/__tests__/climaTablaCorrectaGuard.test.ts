import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, relative } from 'path';

/**
 * Guarda estructural: nadie lee `clima_lecturas` salvo los sitios que de verdad
 * quieren la ventana de 24 h.
 *
 * `clima_lecturas` guarda lecturas de 5 minutos y un cron la poda diariamente a
 * ~24 h (migración 036). La historia — una fila por día desde 2020-07-01 — vive
 * en `clima_resumen_diario`. Leer la primera cuando querés la segunda no falla:
 * devuelve vacío, o peor, devuelve el pedacito de hoy como si fuera el período
 * completo. No hay error, no hay test rojo, solo un número equivocado.
 *
 * **Este bug ya ocurrió dos veces:**
 *
 *  1. 2026-04-16 — `fetchClimaResumenSemanal()` en el reporte semanal. El informe
 *     de una semana pasada mostraba un solo día.
 *     (`docs/archive/incidents/2026-04-16-clima-wrong-table-and-incidencia-avg.md`)
 *  2. 2026-08-16 — `execClimateData()`, la herramienta de clima de Esco. Toda
 *     pregunta climática histórica devolvía "no hay datos", el modelo se ponía a
 *     buscar rango por rango hasta agotar las rondas del tool-loop, y en algunas
 *     corridas rellenaba el hueco con cifras inventadas: reportó "47 días sin
 *     lluvia" cuando la última lluvia había sido 4 días antes.
 *
 * La segunda es la más instructiva: en julio de 2026, al aplicar la compuerta de
 * la migración 068, alguien pasó por esa función, anotó en el CLAUDE.md que
 * "consulta `clima_lecturas` directamente"… y arregló la compuerta, no la tabla.
 * La pista quedó escrita y nadie la accionó durante cuatro meses. Por eso esto es
 * una prueba y no un comentario.
 *
 * Para agregar un sitio a la lista blanca hace falta que sea genuinamente de
 * tiempo real: el tablero en vivo, el ingestor, o el día en curso que el rollup
 * de las 00:15 todavía no produjo.
 */

const SRC = resolve(__dirname, '..');

/** Sitios a los que la ventana de 24 h les sirve, con el motivo. */
const LISTA_BLANCA: Record<string, string> = {
  'hooks/useClimaData.ts':
    'Tablero de Clima en vivo: quiere justamente las lecturas de 5 min de las últimas 24 h.',
  'supabase/functions/server/clima.tsx':
    'Ingestor: es quien ESCRIBE las lecturas que vienen de Ecowitt.',
  'utils/fetchDatosReporteSemanal.ts':
    'Backfill del reporte semanal: completa los días que el rollup aún no produjo. La serie del reporte sale de clima_resumen_diario (arreglo de 2026-04-16).',
  'supabase/functions/server/chat.tsx':
    'execClimateData: condiciones actuales y el día en curso. La serie histórica sale de clima_resumen_diario (arreglo de 2026-08-16).',
  'types/database.ts': 'Tipos generados del esquema.',
};

function archivosFuente(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '__tests__') continue;
    const ruta = resolve(dir, entrada);
    if (statSync(ruta).isDirectory()) archivosFuente(ruta, acc);
    else if (/\.tsx?$/.test(entrada)) acc.push(ruta);
  }
  return acc;
}

describe('clima_lecturas solo se lee donde la ventana de 24 h es lo que se quiere', () => {
  const infractores = archivosFuente(SRC)
    .filter((f) => readFileSync(f, 'utf8').includes('clima_lecturas'))
    .map((f) => relative(SRC, f).split('\\').join('/'))
    .filter((rel) => !(rel in LISTA_BLANCA));

  it('ningún sitio nuevo consulta clima_lecturas sin justificarlo', () => {
    expect(infractores).toEqual([]);
  });

  it('la lista blanca no tiene entradas muertas', () => {
    const todos = archivosFuente(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('clima_lecturas'))
      .map((f) => relative(SRC, f).split('\\').join('/'));
    const muertas = Object.keys(LISTA_BLANCA).filter((k) => !todos.includes(k));
    expect(muertas).toEqual([]);
  });
});

describe('execClimateData saca la serie histórica de clima_resumen_diario', () => {
  const chat = readFileSync(resolve(SRC, 'supabase/functions/server/chat.tsx'), 'utf8');
  const fn = chat.slice(chat.indexOf('async function execClimateData'));
  const cuerpo = fn.slice(0, fn.indexOf('\n// ====') === -1 ? 12000 : fn.indexOf('\n// ===='));

  it('consulta la tabla permanente', () => {
    expect(cuerpo).toContain("supabaseQuery('clima_resumen_diario'");
  });

  it('la lluvia del período NO se arma sobre lecturas crudas', () => {
    // `lluvia_diaria_mm` es la columna de clima_lecturas. Solo puede aparecer
    // en el camino del día en curso (`lluviaDeHoy`), nunca en el agregado.
    const agregado = cuerpo.slice(cuerpo.indexOf('const resumen_periodo'));
    expect(agregado).not.toContain('lluvia_diaria_mm');
  });

  it('los dos árboles del edge function coinciden', () => {
    const espejo = readFileSync(
      resolve(SRC, '../supabase/functions/make-server-1ccce916/chat.tsx'),
      'utf8',
    );
    expect(espejo).toBe(chat);
  });
});
