import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Guarda: un `<DialogContent>` no se dimensiona por fuera del sistema de tamaños.
 *
 * `DialogContent` (`src/components/ui/dialog.tsx`) toma su ancho Y su alto máximo de UN solo
 * lugar: el prop `size` (`sm`/`md`/`lg`/`xl` → `.dialog-sm/md/lg/xl`, `globals.css:258-263`), que
 * define los cuatro escalones documentados en "Dialog Size System" (root `CLAUDE.md`):
 *
 *   sm  448×384   md  576×512   lg  768×640   xl  1024×704   (px, ambos ejes acoplados)
 *
 * Una utilidad cruda de ancho/alto (`max-w-*`, `max-h-*`, `w-[…]`, `h-[…]`) escrita directamente
 * en el `className` de `<DialogContent>` pisa SOLO el eje que esa utilidad controla, mientras el
 * otro eje se lo sigue dando el tier por defecto (`dialog-md` cuando no hay `size`, o el `size`
 * declarado). El resultado es una caja que no corresponde a ninguno de los cuatro escalones.
 *
 * Caso real que motivó esta guarda: `IngresoForm.tsx` tenía
 * `<DialogContent className="max-w-md">` sin prop `size`. Sin `size` cae al `dialog-md` por
 * defecto (alto máximo 32rem/512px) mientras `max-w-md` le pisa solo el ancho (28rem/448px): el
 * resultado — 448×512 — no es ni `sm` (448×384) ni `md` (576×512), es una mezcla de los dos ejes
 * de dos escalones distintos. Corregido a `size="sm"`, que es el escalón real que ese formulario
 * de 3 campos necesita (mismo contenido que `CompradorDialog.tsx`, que ya usaba `size="sm"`
 * correctamente).
 *
 * Qué SÍ vigila: el `className` que aparece literalmente en el tag de apertura `<DialogContent
 * …>` de cada call site — nunca un inventario de diálogos ni de clases. Un diálogo nuevo que
 * cometa el mismo error cae en rojo sin que nadie tenga que añadirlo a ninguna lista.
 *
 * Qué NO vigila (límites explícitos):
 * - No revisa clases de ancho/alto en elementos DENTRO de `DialogContent` (`DialogHeader`,
 *   `DialogBody`, campos de formulario, badges…). Esos legítimamente usan `w-full`, `h-9`, etc.
 *   — el sistema de tamaños gobierna el PANEL, no su contenido interno.
 * - No revisa `className` construido dinámicamente (`className={cn(...)}`, `className={var}`).
 *   Solo strings literales `className="…"`, igual que el resto de los guards de este archivo de
 *   pruebas (`dialogScrollContract.test.ts`, `globalsCssTailwindCollisionGuard.test.ts`) — ninguno
 *   de los 55 call sites actuales usa esa forma para `DialogContent`, así que hoy no hay hueco,
 *   pero uno que empiece a hacerlo pasaría en verde sin ser inspeccionado.
 * - Debajo de 640px los cuatro escalones no aplican — todo diálogo es ancho completo
 *   (`globals.css:258` envuelve los 4 en `@media (min-width: 640px)`). Esta guarda no lo modela;
 *   simplemente prohíbe la utilidad cruda en TODOS los viewports, porque el prop `size` sigue
 *   siendo la fuente de verdad del escalón >=640px sin importar que <640px ambos caminos rindan
 *   full-width.
 * - No hay lista de excepciones. Se auditaron los 55 `<DialogContent>` del repo antes de escribir
 *   esta guarda: solo `IngresoForm.tsx` violaba la regla, y se corrigió (ver arriba). Si aparece un
 *   caso que de verdad necesite salirse del sistema de cuatro escalones, eso es un hueco en el
 *   sistema de tamaños — repórtalo, no lo silencies agregándolo aquí.
 */

const SRC = join(__dirname, '..');

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'supabase' || entry === '__tests__') continue;
      collectTsx(full, out);
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Extrae cada tag de apertura `<DialogContent …>` (hasta el primer `>` de cierre del tag). */
function extractDialogContentOpenTags(source: string): { tag: string; index: number }[] {
  const tags: { tag: string; index: number }[] = [];
  const re = /<DialogContent\b[\s\S]*?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    tags.push({ tag: m[0], index: m.index });
  }
  return tags;
}

/** Utilidades crudas de ancho/alto prohibidas en el className de un DialogContent.
 * Admite un prefijo de variante (`sm:max-w-md`) porque el hueco que ataca es el mismo por
 * encima o por debajo de cualquier breakpoint. */
const RAW_SIZING_TOKEN = /(?:^|:)(max-w-\S+|max-h-\S+|w-\[[^\]]*\]|h-\[[^\]]*\])$/;

function findRawSizingClasses(openTag: string): string[] {
  const m = /className\s*=\s*"([^"]*)"/.exec(openTag);
  if (!m) return [];
  return m[1]
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => RAW_SIZING_TOKEN.test(token));
}

function lineAt(source: string, idx: number): number {
  let line = 1;
  for (let k = 0; k < idx; k++) if (source[k] === '\n') line++;
  return line;
}

interface Offender {
  rel: string;
  line: number;
  bad: string[];
}

function scanFileForRawSizing(rel: string, source: string): Offender[] {
  const offenders: Offender[] = [];
  for (const { tag, index } of extractDialogContentOpenTags(source)) {
    const bad = findRawSizingClasses(tag);
    if (bad.length > 0) {
      offenders.push({ rel, line: lineAt(source, index), bad });
    }
  }
  return offenders;
}

function formatOffender(o: Offender): string {
  return (
    `  ${o.rel}:${o.line} — <DialogContent> usa "${o.bad.join(', ')}" en su className.\n` +
    `    Por qué es peligroso: el tamaño de un diálogo viene SOLO del prop "size"\n` +
    `    (sm/md/lg/xl → .dialog-sm/md/lg/xl, globals.css:258-263). Una utilidad cruda de\n` +
    `    ancho/alto pisa un solo eje del tier mientras el otro lo sigue dando el default\n` +
    `    (dialog-md), y el resultado no corresponde a ninguno de los 4 escalones documentados.\n` +
    `    Qué hacer: quita "${o.bad.join(', ')}" del className y usa\n` +
    `    <DialogContent size="sm|md|lg|xl"> según cuánto contenido lleve el diálogo.`
  );
}

describe('guarda: DialogContent no se dimensiona por fuera del sistema de tamaños (dialog-sm/md/lg/xl)', () => {
  const files = collectTsx(SRC).filter((f) => /<DialogContent[\s>]/.test(readFileSync(f, 'utf-8')));

  it('encuentra diálogos para auditar', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('ningún <DialogContent> usa max-w-*/max-h-*/w-[…]/h-[…] en su className', () => {
    const offenders: Offender[] = [];
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      offenders.push(...scanFileForRawSizing(rel, readFileSync(file, 'utf-8')));
    }

    expect(
      offenders,
      `${offenders.length} <DialogContent> se dimensionan por fuera del sistema de tamaños:\n\n` +
        offenders.map(formatOffender).join('\n\n'),
    ).toEqual([]);
  });

  it('SÍ marca una violación inyectada — max-w-* sin size (el guard puede fallar de verdad)', () => {
    const injected = '<DialogContent className="max-w-md">\n  <p>x</p>\n</DialogContent>';
    const offenders = scanFileForRawSizing('fixture.tsx', injected);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].bad).toContain('max-w-md');
  });

  it('SÍ marca una violación inyectada con variante — sm:h-[500px] (arbitrary value)', () => {
    const injected = '<DialogContent size="lg" className="sm:h-[500px]">\n  <p>x</p>\n</DialogContent>';
    const offenders = scanFileForRawSizing('fixture.tsx', injected);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].bad).toContain('sm:h-[500px]');
  });

  it('NO marca un DialogContent que solo usa el prop size', () => {
    const ok = '<DialogContent size="sm">\n  <p>x</p>\n</DialogContent>';
    expect(scanFileForRawSizing('fixture.tsx', ok)).toEqual([]);
  });

  it('NO marca clases de ancho/alto legítimas del contenido interno (w-full, h-9)', () => {
    const ok =
      '<DialogContent size="lg" className="p-0 gap-0">\n' +
      '  <div className="w-full h-9 max-w-[9999px]">interior, no el panel</div>\n' +
      '</DialogContent>';
    // La clase debe leerse SOLO del className del propio <DialogContent>, no de sus hijos.
    expect(scanFileForRawSizing('fixture.tsx', ok)).toEqual([]);
  });
});
