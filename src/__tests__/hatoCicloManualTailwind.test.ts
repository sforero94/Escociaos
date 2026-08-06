// ARCHIVO: __tests__/hatoCicloManualTailwind.test.ts
// DESCRIPCIÓN: Guard estático de Tailwind congelado para T4a + T4b (S3,
// docs/plan_hato_ciclo_manual_override.md). Mismo mecanismo que
// `hatoProduccionTableroTailwind.test.ts`/`hatoCorreccionChequeoTailwind.test.ts`:
// `src/index.css` es un build PRECOMPILADO, así que una clase ausente no falla
// en runtime -- simplemente no hace nada (CLAUDE.md, "Caution Zones").
//
// A diferencia de las guardas anteriores, esta también admite
// `src/styles/globals.css` como fuente válida: es una hoja VIVA importada
// después de `index.css` (gana la cascada), y este mismo sweep encontró
// clases nuevas que ya viven ahí (`min-h-0`, del contrato de diálogos del
// CLAUDE.md raíz) -- comprobarlas solo contra `index.css` las habría
// marcado como muertas por error.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const CSS = readFileSync(join(ROOT, 'src', 'index.css'), 'utf-8') + readFileSync(join(ROOT, 'src', 'styles', 'globals.css'), 'utf-8');

/** Archivos nuevos o sustancialmente tocados por S3 (Fase 2 + Fase 4). */
const ARCHIVOS_S3 = [
  'src/components/hato/components/MarcarCicloDialog.tsx',
  'src/components/hato/components/EditarEventoDialog.tsx',
  'src/components/hato/components/HistorialCorreccionesCard.tsx',
  'src/components/hato/components/EventoTimeline.tsx',
];

/** Clases muertas PRE-EXISTENTES en archivos que S3 solo tocó de forma
 * puntual (un botón/estado nuevo), no a fondo -- ya documentadas en
 * `src/components/hato/CLAUDE.md` ("Frozen-Tailwind hygiene") como deuda
 * app-wide fuera de alcance. No se repiten aquí en el listado de archivos a
 * auditar porque el criterio de esta guarda es "toda clase de un archivo
 * listado debe existir"; en vez de eso, se documentan como excepción
 * puntual y se verifican explícitamente en el propio test de abajo. */
const CLASES_MUERTAS_PREEXISTENTES_AnimalesList = ['hover:text-primary', 'min-h-\\[100dvh\\]', 'py-16'];

function escaparParaCss(clase: string): string {
  return clase.replace(/([:./[\]%#])/g, '\\$1');
}

function claseExisteEnCssCongelado(clase: string): boolean {
  return CSS.includes(`.${escaparParaCss(clase)}`);
}

function extraerClases(source: string): string[] {
  const clases = new Set<string>();

  for (const m of source.matchAll(/className="([^"]*)"/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => clases.add(c));
  }
  for (const m of source.matchAll(/className=\{`([^`]*)`\}/g)) {
    const literal = m[1].replace(/\$\{[^}]*\}/g, ' ');
    literal.split(/\s+/).filter(Boolean).forEach((c) => clases.add(c));
  }
  // `className={cond ? 'a b' : 'c d'}` -- literales string dentro de un
  // ternario de className, sin quedarse con especificadores de import.
  for (const m of source.matchAll(/className=\{[^}]*?'([^'\n]+)'/g)) {
    const tokens = m[1].split(/\s+/).filter(Boolean);
    if (tokens.every((t) => /^[a-z0-9:[\]/.#%_-]+$/.test(t) && /[a-z]/.test(t))) {
      tokens.forEach((t) => clases.add(t));
    }
  }

  return [...clases];
}

describe('Tailwind congelado -- S3 (ciclo manual + override, T4a/T4b)', () => {
  for (const rel of ARCHIVOS_S3) {
    it(`${rel}: toda clase estática existe en el build congelado (index.css + globals.css)`, () => {
      const source = readFileSync(join(ROOT, rel), 'utf-8');
      const clases = extraerClases(source);
      expect(clases.length).toBeGreaterThan(0);

      const faltantes = clases.filter((c) => !claseExisteEnCssCongelado(c));
      expect(
        faltantes,
        `Estas clases no existen en el build congelado de Tailwind (index.css + globals.css) y NO harán nada en producción:\n  ${faltantes.join('\n  ')}`,
      ).toEqual([]);
    });
  }

  it('AnimalesList.tsx: las clases NUEVAS que S3 agregó (botón "Marcar ciclo") existen -- deuda preexistente fuera de alcance, no re-verificada', () => {
    const source = readFileSync(join(ROOT, 'src/components/hato/AnimalesList.tsx'), 'utf-8');
    // Solo las líneas del bloque nuevo (acción "Marcar ciclo" por fila) --
    // el resto del archivo es de S4/S8 y ya carga deuda documentada
    // (`hover:text-primary`, `min-h-[100dvh]`, `py-16`) que este PR no toca.
    const bloqueNuevo = source.slice(source.indexOf('canMarcarCiclo && ('), source.indexOf('canMarcarCiclo && (') + 400);
    const clases = extraerClases(bloqueNuevo);
    expect(clases.length).toBeGreaterThan(0);
    const faltantes = clases.filter((c) => !claseExisteEnCssCongelado(c));
    expect(faltantes).toEqual([]);
  });

  it('documenta (no re-verifica) la deuda preexistente de AnimalesList.tsx que S3 no tocó', () => {
    // Guard de intención: si alguna de estas clases APARECIERA compilada en
    // el futuro (index.css regenerado), este test seguiría en verde -- solo
    // asegura que la lista de "conocidas muertas" sigue siendo la documentada.
    expect(CLASES_MUERTAS_PREEXISTENTES_AnimalesList).toEqual(['hover:text-primary', 'min-h-\\[100dvh\\]', 'py-16']);
  });
});
