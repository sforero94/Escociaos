// ARCHIVO: __tests__/hatoPesajeFotoTailwind.test.ts
// DESCRIPCIÓN: Guard estático de Tailwind congelado (CLAUDE.md, "Caution
// Zones") para los archivos nuevos de S5 (`docs/plan_hato_ronda_agosto_2026.md`
// -- carga de la planilla mensual de pesaje por foto). `src/index.css` es un
// build precompilado -- una clase ausente NO falla en runtime, simplemente
// no hace nada. Mismo mecanismo que `hatoProduccionTableroTailwind.test.ts`.
//
// También admite `src/styles/globals.css` como fuente válida (patrón de
// `hatoCicloManualTailwind.test.ts`, más reciente): es una hoja VIVA
// importada después de `index.css` (gana la cascada), y la auditoría de UI
// 2026-08-06 agregó `.w-auto` ahí (`CargaPesajeMensual.tsx`, renombrado a
// `PesajeLecheCard.tsx` en la sesión de rediseño de la pestaña Registrar
// del mismo día) -- comprobarla solo contra `index.css` la habría marcado
// como muerta por error.
//
// Rediseño de la pestaña Registrar (2026-08-06, `/hato-lechero/producción`):
// suma los archivos nuevos/tocados de esa sesión (`PesajeLecheCard.tsx` es
// el renombre de `CargaPesajeMensual.tsx`; `ProduccionQuincenalDialog.tsx`
// es el renombre-a-diálogo de `ProduccionQuincenalForm.tsx`;
// `VentaQuincenalCard.tsx` y `CapturaArchivo.tsx` son nuevos/tocados).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const INDEX_CSS =
  readFileSync(join(ROOT, 'src', 'index.css'), 'utf-8') +
  readFileSync(join(ROOT, 'src', 'styles', 'globals.css'), 'utf-8');

const ARCHIVOS_S5_PESAJE_FOTO = [
  'src/components/hato/components/PesajeLecheCard.tsx',
  'src/components/hato/components/SubirPesajeFoto.tsx',
  'src/components/hato/components/RevisionPesajeFoto.tsx',
  'src/components/hato/components/ProduccionQuincenalDialog.tsx',
  'src/components/hato/components/VentaQuincenalCard.tsx',
  'src/components/hato/components/CapturaArchivo.tsx',
];

function escaparParaCss(clase: string): string {
  return clase.replace(/([:./[\]%#])/g, '\\$1');
}

function claseExisteEnFrozenCss(clase: string): boolean {
  return INDEX_CSS.includes(`.${escaparParaCss(clase)}`);
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

  return [...clases];
}

describe('Tailwind congelado -- S5 (carga de pesaje mensual por foto)', () => {
  for (const rel of ARCHIVOS_S5_PESAJE_FOTO) {
    it(`${rel}: toda clase className estática existe en el build congelado de index.css`, () => {
      const source = readFileSync(join(ROOT, rel), 'utf-8');
      const clases = extraerClases(source);
      const faltantes = clases.filter((c) => !claseExisteEnFrozenCss(c));
      expect(
        faltantes,
        `Estas clases no existen en el build congelado de Tailwind (src/index.css) y NO harán nada en producción:\n  ${faltantes.join('\n  ')}`,
      ).toEqual([]);
    });
  }
});
