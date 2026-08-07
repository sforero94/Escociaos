import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
// `@tailwindcss/node` is the filesystem-aware loader `@tailwindcss/vite` itself uses to turn
// `src/index.css` into a live design system (it resolves `@import "tailwindcss"` and
// `@import "tw-animate-css"` from node_modules, unlike the bare `tailwindcss` package, which
// requires the caller to supply its own module/stylesheet loader).
import { __unstable__loadDesignSystem } from '@tailwindcss/node';

/**
 * Guarda estructural: ninguna regla de `globals.css` puede redefinir a mano, fuera de un
 * `@layer`, el nombre de una clase que Tailwind (o `tw-animate-css`, instalado como plugin)
 * genera de verdad.
 *
 * Por qué existe: `src/index.css` compone capas nativas de CSS (`@layer theme/base/utilities`,
 * ver `tailwindcss.com/docs/theme`). Por especificación CSS, una regla que NO vive dentro de
 * ninguna `@layer` gana *siempre* sobre cualquier regla dentro de `@layer utilities`, sin
 * importar especificidad ni orden de aparición. Antes de que F1 encendiera el compilador,
 * `globals.css` acumuló ~116 reglas escritas a mano para suplir clases que el build congelado no
 * traía — y dos de ellas resultaron ser bombas: `.shadow-none { box-shadow: none }` y
 * `.data-[variant=outline]:shadow-xs` escribían `box-shadow` con un valor final en vez de
 * componerlo desde las capas `--tw-*` que Tailwind usa, y eso anulaba silenciosamente
 * `focus-visible:ring-*` en todo `Toggle`/`ToggleGroup` de la app — sin error, sin test rojo, sin
 * nada visible hasta que alguien miró la pantalla. F1 las borró; esta guarda impide que una
 * regla con esa misma forma vuelva a escribirse.
 *
 * Qué SÍ vigila: la *forma* de la regla — ¿su nombre de clase colisiona con un candidato que
 * Tailwind reconoce, y vive fuera de cualquier `@layer`? — nunca un inventario de nombres
 * congelado. La respuesta a "¿qué genera Tailwind?" se pide en vivo al compilador real
 * (`@tailwindcss/node`, la misma versión que compila el build de producción), así que la guarda
 * sigue siendo válida si el tema cambia, si se agregan plugins, o si sube la versión de Tailwind
 * — no depende de una lista que alguien tenga que recordar actualizar.
 *
 * Qué NO vigila (límites explícitos, ver el reporte de la sesión que introdujo este archivo):
 * - No verifica que el VALOR de una regla legítima dentro de `@layer utilities` sea correcto —
 *   solo que las reglas fuera de capa no colisionen por NOMBRE.
 * - No detecta colisiones dentro de `[class*="…"]`/`:has(…)`/`:not(…)` — esos son valores de
 *   coincidencia, no clases que la regla define, y se excluyen a propósito (ver
 *   `stripParenGroups`) para no marcar en falso selectores legítimos como `.foo:not(.bar)`.
 * - No mira archivos `.tsx` ni clases usadas en JSX — ese es el barrido de F2 (clases muertas /
 *   restricciones de ancho), un problema distinto. Esta guarda solo lee `globals.css`.
 */

const SRC_DIR = resolve(__dirname, '..');
const GLOBALS_CSS_PATH = resolve(SRC_DIR, 'styles/globals.css');
const ENTRY_CSS_PATH = resolve(SRC_DIR, 'index.css');

type DesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>;

interface OutOfLayerRule {
  header: string;
  line: number;
}

interface Offender {
  /** El candidato Tailwind tal como se escribiría en un `className` (ya sin escapes CSS). */
  candidate: string;
  occurrences: OutOfLayerRule[];
}

/** Quita comentarios `/* … *\/` preservando saltos de línea, para que los números de línea
 * reportados en un fallo sigan apuntando al lugar correcto del archivo real. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** Vacía el contenido de grupos `(…)` balanceados, preservando el resto del selector.
 * Necesario para que `:not(.hidden)`, `:has([class*='text-'])`, `@media (min-width: 640px)`
 * no hagan que la clase referenciada ADENTRO del paréntesis se lea como una clase que la regla
 * está definiendo — es una condición de coincidencia, no una redefinición. */
function stripParenGroups(text: string): string {
  let out = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') {
      depth++;
      continue;
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    out += depth > 0 ? ' ' : ch;
  }
  return out;
}

/**
 * Extrae cada candidato de clase Tailwind de un selector CSS, revirtiendo los escapes que el
 * compilador genera (`\[`, `\]`, `\=`, `\:`, `\.`…) para recuperar el nombre tal como se
 * escribiría en un `className` — es lo que `designSystem.candidatesToCss()` espera recibir.
 * Ej.: `.data-\[state\=closed\]\:slide-out-to-right[data-state="closed"]` → `data-[state=closed]:slide-out-to-right`.
 */
function extractClassCandidates(selector: string): string[] {
  const tokens: string[] = [];
  const cleaned = stripParenGroups(selector);
  const re = /\.((?:\\.|[^\s.,>+~[:{}()])+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    tokens.push(m[1].replace(/\\(.)/g, '$1'));
  }
  return tokens;
}

/**
 * Recorre `globals.css` y devuelve el encabezado (selector) de cada regla que:
 *  - NO es un at-rule (`@media`, `@font-face`, `@theme`, `@keyframes`, `@layer`…) — esas nunca
 *    son, ellas mismas, un selector de clase.
 *  - NO vive dentro de ningún `@layer`, sin importar cuántos niveles de anidación (`@media`
 *    dentro de las cuales hay un selector normal SIGUE fuera de capa; un selector normal dentro
 *    de `@layer utilities` SIGUE dentro de capa, sin importar cuánto anide `:where()`/`@media`
 *    adentro).
 *
 * Es un escáner de un solo paso por caracteres (mismo estilo que el resto de `__tests__`: sin
 * dependencia de un parser CSS de terceros), que solo necesita distinguir `{`/`}`/`;` y saltar
 * el contenido de strings entre comillas.
 */
function findOutOfLayerRules(css: string): OutOfLayerRule[] {
  const src = stripComments(css);
  const n = src.length;
  let i = 0;
  let headerStart = 0;
  const stack: { insideLayer: boolean }[] = [];
  const results: OutOfLayerRule[] = [];

  function lineAt(idx: number): number {
    let line = 1;
    for (let k = 0; k < idx; k++) if (src[k] === '\n') line++;
    return line;
  }

  while (i < n) {
    const ch = src[i];

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }

    if (ch === '{') {
      const rawHeader = src.slice(headerStart, i);
      const header = rawHeader.trim();
      // Línea del primer carácter no-blanco del selector, no de `headerStart` (que puede
      // apuntar a una línea en blanco varias líneas antes si el selector previo dejó espacio).
      const leadingWs = rawHeader.length - rawHeader.trimStart().length;
      const headerActualStart = headerStart + leadingWs;

      const parentIsLayer = stack.length > 0 && stack[stack.length - 1].insideLayer;
      const isLayerHeader = /^@layer\b/.test(header);
      const insideLayer = parentIsLayer || isLayerHeader;
      const isAtRule = header.startsWith('@');

      if (!insideLayer && !isAtRule && header.length > 0) {
        results.push({ header, line: lineAt(headerActualStart) });
      }

      stack.push({ insideLayer });
      i++;
      headerStart = i;
      continue;
    }

    if (ch === '}') {
      stack.pop();
      i++;
      headerStart = i;
      continue;
    }

    if (ch === ';') {
      i++;
      headerStart = i;
      continue;
    }

    i++;
  }

  return results;
}

/** Junta el escaneo de reglas fuera de capa con la consulta al compilador real de Tailwind, y
 * agrupa por candidato único (una clase repetida en 14 selectores de `.chat-markdown`, por
 * ejemplo, se consulta una sola vez). */
function findUnlayeredTailwindCollisions(css: string, designSystem: DesignSystem): Offender[] {
  const rules = findOutOfLayerRules(css);

  const occurrencesByCandidate = new Map<string, OutOfLayerRule[]>();
  for (const rule of rules) {
    for (const candidate of extractClassCandidates(rule.header)) {
      const list = occurrencesByCandidate.get(candidate) ?? [];
      list.push(rule);
      occurrencesByCandidate.set(candidate, list);
    }
  }

  const candidates = [...occurrencesByCandidate.keys()];
  const generated = designSystem.candidatesToCss(candidates);

  const offenders: Offender[] = [];
  candidates.forEach((candidate, i) => {
    if (generated[i] !== null) {
      offenders.push({ candidate, occurrences: occurrencesByCandidate.get(candidate)! });
    }
  });
  return offenders;
}

function formatOffender(o: Offender): string {
  const locations = o.occurrences.map((occ) => `    L${occ.line}: ${occ.header}`).join('\n');
  return (
    `  ".${o.candidate}" — Tailwind SÍ genera esta utilidad, y la regla vive fuera de @layer:\n` +
    `${locations}\n` +
    `    Por qué es peligroso: una regla sin @layer gana SIEMPRE sobre @layer utilities, sin\n` +
    `    importar especificidad ni orden (así fue como ".shadow-none { box-shadow: none }"\n` +
    `    anuló focus-visible:ring-* en todo Toggle/ToggleGroup, sin error ni test rojo).\n` +
    `    Qué hacer: borra esta regla y usa la clase "${o.candidate}" directamente en el\n` +
    `    componente; si de verdad necesitas conservar CSS a mano con este nombre, envuélvelo en\n` +
    `    "@layer utilities { ... }".`
  );
}

describe('guarda: globals.css no redefine a mano el nombre de una utilidad de Tailwind fuera de @layer', () => {
  let designSystem: DesignSystem;

  beforeAll(async () => {
    const entryCss = readFileSync(ENTRY_CSS_PATH, 'utf-8');
    designSystem = await __unstable__loadDesignSystem(entryCss, { base: SRC_DIR });
  }, 20_000);

  it('el escáner efectivamente encuentra reglas fuera de capa para inspeccionar', () => {
    // Guarda de cordura del propio test: si esto cae a 0, el escáner se rompió (p.ej. un cambio
    // en el formato de globals.css) y el resto de este archivo pasaría en verde por nada.
    const rules = findOutOfLayerRules(readFileSync(GLOBALS_CSS_PATH, 'utf-8'));
    expect(rules.length).toBeGreaterThan(50);
  });

  it('ninguna regla fuera de @layer redefine el nombre de una utilidad real de Tailwind', () => {
    const css = readFileSync(GLOBALS_CSS_PATH, 'utf-8');
    const offenders = findUnlayeredTailwindCollisions(css, designSystem);

    if (offenders.length > 0) {
      const message =
        `${offenders.length} regla(s) de globals.css redefinen a mano, fuera de @layer, el ` +
        `nombre de una utilidad real de Tailwind:\n\n` +
        offenders.map(formatOffender).join('\n\n');
      expect(offenders, message).toEqual([]);
    }
  });

  it('SÍ marca una bomba inyectada como ".shadow-none" fuera de capa (el guard puede fallar de verdad)', () => {
    const injected = '.shadow-none {\n  box-shadow: none;\n}\n';
    const offenders = findUnlayeredTailwindCollisions(injected, designSystem);
    expect(offenders.map((o) => o.candidate)).toContain('shadow-none');
  });

  it('SÍ marca una utilidad con variante inyectada fuera de capa (ej. ".data-[variant=outline]:shadow-xs")', () => {
    const injected = '.data-\\[variant\\=outline\\]\\:shadow-xs[data-variant="outline"] {\n  box-shadow: 0 0 0 red;\n}\n';
    const offenders = findUnlayeredTailwindCollisions(injected, designSystem);
    expect(offenders.map((o) => o.candidate)).toContain('data-[variant=outline]:shadow-xs');
  });

  it('NO marca la misma regla si vive dentro de "@layer utilities" — la vía de escape documentada', () => {
    const wrapped = '@layer utilities {\n  .shadow-none {\n    box-shadow: none;\n  }\n}\n';
    const offenders = findUnlayeredTailwindCollisions(wrapped, designSystem);
    expect(offenders.map((o) => o.candidate)).not.toContain('shadow-none');
  });

  it('NO marca CSS propio del dominio que Tailwind no genera', () => {
    const custom =
      '.tabla-financiera-de-prueba { color: red; }\n' +
      '.mi-badge-inventado-xyz:hover { padding: 4px; }\n' +
      '.filtros-toggle { display: inline-flex; }\n';
    const offenders = findUnlayeredTailwindCollisions(custom, designSystem);
    expect(offenders).toEqual([]);
  });

  it('NO marca una clase referenciada dentro de ":not(...)" — es una condición, no una redefinición', () => {
    // "hidden" es una utilidad real de Tailwind (`display: none`), pero aquí solo se usa como
    // condición de exclusión dentro de :not(); la regla no está definiendo `.hidden`.
    const guardedSelector = '.mi-fila-personalizada:not(.hidden) { background: red; }\n';
    const offenders = findUnlayeredTailwindCollisions(guardedSelector, designSystem);
    expect(offenders.map((o) => o.candidate)).not.toContain('hidden');
  });
});
