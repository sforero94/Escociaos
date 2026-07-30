// ARCHIVO: __tests__/hatoCorreccionChequeoTailwind.test.ts
// DESCRIPCIÓN: Guard estático de Tailwind congelado para los archivos de la
// ventana de corrección del chequeo (Fase 3a de
// `docs/plan_chequeo_captura_foto.md`). Mismo mecanismo que
// `hatoProduccionTableroTailwind.test.ts`: `src/index.css` es un build
// PRECOMPILADO, así que una clase ausente no falla en runtime -- simplemente no
// hace nada (CLAUDE.md, "Caution Zones"). En una tabla editable eso significa
// inputs sin borde ni ancho y una fila corregida que no se distingue de una
// intacta: la clase muerta se vuelve un problema de datos, no de estética.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const INDEX_CSS = readFileSync(join(ROOT, 'src', 'index.css'), 'utf-8');

/** Los dos archivos de esta fase que DECLARAN clases. `CrearAnimalDialog.tsx`
 * queda fuera a propósito: esta sesión solo le agregó props (`prellenado`), no
 * clases, y su `min-h-0` (del patrón `<form>` dentro de `DialogContent` que
 * documenta el CLAUDE.md raíz) está MUERTO en el build congelado -- junto con
 * otros 16 usos repo-wide. Es deuda app-wide preexistente, no de esta fase, y
 * revivirla toca el layout de todos los diálogos con formulario: se reporta,
 * no se cambia de refilón. */
const ARCHIVOS_FASE3A = [
  'src/components/hato/components/ChequeoDiffReview.tsx',
  'src/components/hato/components/SubirChequeoExcel.tsx',
];

/** El CSS compilado escapa `:`, `.`, `/`, `[`, `]`, `%`, `#` dentro del
 * selector (variantes Y valores arbitrarios/decimales por igual). */
function escaparParaCss(clase: string): string {
  return clase.replace(/([:./[\]%#])/g, '\\$1');
}

function claseExisteEnFrozenCss(clase: string): boolean {
  return INDEX_CSS.includes(`.${escaparParaCss(clase)}`);
}

/** Extrae tokens de `className="..."`, de los segmentos LITERALES de un
 * `className={`...`}` y de las constantes de clase declaradas como string
 * literal en el módulo (`const CLASE_... = '...'`), que es como la tabla
 * comparte el estilo de sus celdas. */
function extraerClases(source: string): string[] {
  const clases = new Set<string>();

  for (const m of source.matchAll(/className="([^"]*)"/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => clases.add(c));
  }

  for (const m of source.matchAll(/className=\{`([^`]*)`\}/g)) {
    const literal = m[1].replace(/\$\{[^}]*\}/g, ' ');
    literal.split(/\s+/).filter(Boolean).forEach((c) => clases.add(c));
  }

  // Listas de clases que NO están pegadas a un `className=`: la constante
  // compartida de las celdas (`CLASE_CELDA_BASE`), lo que devuelve
  // `claseCelda`, y los literales de un ternario multilínea dentro de un
  // template. Se acepta un string solo si TODOS sus tokens tienen forma de
  // utilidad y hay al menos dos (o uno con variante `foo:bar`) -- así un
  // especificador de import como 'lucide-react' no se cuela como clase.
  for (const m of source.matchAll(/'([^'\n]{4,200})'/g)) {
    const tokens = m[1].split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const parecenClases = tokens.every((t) => /^[a-z0-9:[\]/.#%_-]+$/.test(t) && /[a-z]/.test(t) && !t.includes('..'));
    if (!parecenClases) continue;
    if (tokens.length < 2 && !tokens[0].includes(':')) continue;
    if (!tokens.some((t) => /^[a-z]+(-[a-z0-9.[\]/%]+)+$/.test(t) || t.includes(':'))) continue;
    tokens.forEach((t) => clases.add(t));
  }

  return [...clases];
}

describe('Tailwind congelado -- Fase 3a (ventana de corrección del chequeo)', () => {
  for (const rel of ARCHIVOS_FASE3A) {
    it(`${rel}: toda clase estática existe en el build congelado de index.css`, () => {
      const source = readFileSync(join(ROOT, rel), 'utf-8');
      const clases = extraerClases(source);
      expect(clases.length).toBeGreaterThan(0);

      const faltantes = clases.filter((c) => !claseExisteEnFrozenCss(c));
      expect(
        faltantes,
        `Estas clases no existen en el build congelado de Tailwind (src/index.css) y NO harán nada en producción:\n  ${faltantes.join('\n  ')}`,
      ).toEqual([]);
    });
  }
});
