// ARCHIVO: __tests__/hatoProduccionTableroTailwind.test.ts
// DESCRIPCIÓN: Guard estático de Tailwind congelado para los archivos del
// tablero de Producción (SOW 5, `docs/plan_hato_produccion_rework.md` §6:
// "Se agrega un guard estático de Tailwind congelado para las clases
// nuevas de este SOW"). `src/index.css` es un build precompilado -- una
// clase ausente NO falla en runtime, simplemente no hace nada (CLAUDE.md,
// "Caution Zones"). Este test extrae cada `className` literal de los
// archivos tocados por SOW 5 y verifica que exista en el CSS congelado, en
// su forma escapada cuando trae variante (`sm:flex` -> `sm\:flex`) o
// valores con punto/slash/corchete (`gap-1.5` -> `gap-1\.5`).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const INDEX_CSS = readFileSync(join(ROOT, 'src', 'index.css'), 'utf-8');

/** Archivos nuevos/tocados por SOW 5 (tablero de Producción + Hoja de
 * Vida). Lista explícita, no un recorrido del directorio completo -- el
 * resto del módulo hato ya tiene sus propias clases verificadas en
 * sesiones anteriores; este guard es específico de esta sesión. */
const ARCHIVOS_SOW5 = [
  'src/components/hato/components/TrackerProductividad.tsx',
  'src/components/hato/components/RankingVacas.tsx',
  'src/components/hato/components/KpisVentaHato.tsx',
  'src/components/hato/components/ChipVejezPesajes.tsx',
  'src/components/hato/components/CurvaSemanalProduccion.tsx',
  'src/components/hato/components/GraficoLitrosQuincenal.tsx',
  'src/components/hato/components/DetalleQuincenaVentaDialog.tsx',
  'src/components/hato/ProduccionView.tsx',
  'src/components/hato/HojaDeVida.tsx',
];

/** El CSS compilado escapa `:`, `.`, `/`, `[`, `]`, `%`, `#` dentro del
 * selector (variantes Y valores arbitrarios/decimales por igual) -- se
 * escapa SIEMPRE, nunca solo para variantes (ver CLAUDE.md: `sm\:flex`,
 * `gap-1\.5`). */
function escaparParaCss(clase: string): string {
  return clase.replace(/([:./[\]%#])/g, '\\$1');
}

function claseExisteEnFrozenCss(clase: string): boolean {
  return INDEX_CSS.includes(`.${escaparParaCss(clase)}`);
}

/** Extrae tokens de clase de los `className="..."` literales de un
 * archivo, más los segmentos LITERALES de un `className={`...`}` (las
 * interpolaciones `${...}` son dinámicas -- se descartan, no se pueden
 * verificar estáticamente; sus piezas fijas alrededor SÍ se extraen). */
function extraerClases(source: string): string[] {
  const clases = new Set<string>();

  for (const m of source.matchAll(/className="([^"]*)"/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => clases.add(c));
  }

  for (const m of source.matchAll(/className=\{`([^`]*)`\}/g)) {
    const literal = m[1].replace(/\$\{[^}]*\}/g, ' ');
    literal.split(/\s+/).filter(Boolean).forEach((c) => clases.add(c));
  }

  return [...clases];
}

describe('Tailwind congelado -- SOW 5 (tablero de Producción)', () => {
  for (const rel of ARCHIVOS_SOW5) {
    it(`${rel}: toda clase className estática existe en el build congelado de index.css`, () => {
      const source = readFileSync(join(ROOT, rel), 'utf-8');
      const clases = extraerClases(source);
      // No se exige al menos una clase encontrada: `ChipVejezPesajes.tsx`
      // solo REENVÍA un `className` recibido por prop (`className={className
      // ?? 'flex-shrink-0'}`), no declara ninguna clase propia -- 0 clases
      // estáticas es el resultado correcto ahí, no un archivo mal escaneado.

      const faltantes = clases.filter((c) => !claseExisteEnFrozenCss(c));
      expect(
        faltantes,
        `Estas clases no existen en el build congelado de Tailwind (src/index.css) y NO harán nada en producción:\n  ${faltantes.join('\n  ')}`,
      ).toEqual([]);
    });
  }
});
