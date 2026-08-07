import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Guard del contrato de scroll de los diálogos.
 *
 * `DialogContent` es un contenedor `flex flex-col` con `overflow-hidden` y una
 * altura máxima fija por tier (ver `.dialog-sm/md/lg/xl` en globals.css). Si el
 * contenido se monta como hijo directo sin `DialogBody` (que aporta
 * `flex-1 overflow-y-auto`) ni una región scrolleable propia, el panel recorta
 * el contenido en seco: sin barra de scroll y con los botones de acción
 * inalcanzables.
 *
 * Ver docs/bugs/2026-07-21-dialog-sin-scroll-usuarios.md
 *
 * Segundo test de este archivo — un `<form>` ancestro de `<DialogBody>` debe poder
 * encogerse (`flex-1 min-h-0`), o vuelve a producir el mismo recorte aunque DialogBody
 * exista. Ver el comentario junto a ese test para el porqué del "ancestro" y sus límites.
 */

const SRC = join(__dirname, '..');

/** Diálogos que gestionan su propio scroll y no necesitan `DialogBody`. */
const ALLOWLIST = new Set([
  // cmdk renderiza su propia lista scrolleable (`CommandList`).
  'components/ui/command.tsx',
  // Layout hecho a mano con `flex-1 overflow-y-auto min-h-0` entre header y footer sticky.
  'components/monitoreo/RegistroConductividad.tsx',
]);

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

/** Extrae cada bloque `<DialogContent ...>…</DialogContent>` de un archivo. */
function extractDialogContentBlocks(source: string): string[] {
  const blocks: string[] = [];
  const open = /<DialogContent[\s>]/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(source)) !== null) {
    const end = source.indexOf('</DialogContent>', m.index);
    if (end === -1) continue;
    blocks.push(source.slice(m.index, end));
  }
  return blocks;
}

/**
 * Dentro de un bloque `<DialogContent>…</DialogContent>`, encuentra cada `<form>` que
 * ENVUELVE (a cualquier profundidad) un `<DialogBody`, y devuelve su className literal.
 *
 * Se apoya en una regla real de HTML/JSX, no en una suposición: un `<form>` no puede anidar
 * otro `<form>`. Por eso, dado un `<form …>` de apertura, el primer `</form>` que aparece
 * después es sin ambigüedad SU cierre — no hace falta un parser de árbol para saber dónde
 * termina. Con esa garantía, "¿el form envuelve a DialogBody?" se responde con un simple
 * `indexOf('<DialogBody')` acotado a ese rango de texto, y avanzando el cursor de búsqueda
 * hasta después de ese cierre antes de buscar el próximo `<form>` — así dos `<form>` que sean
 * hermanos (no anidados) dentro del mismo DialogContent se evalúan de forma independiente.
 *
 * Generaliza el caso reducido anterior (form inmediatamente antes de DialogBody, sin nada en
 * medio) al caso real encontrado en `src/components/hato/components/`: el <form> envuelve
 * <DialogHeader> Y <DialogBody> juntos, con DialogBody en cualquier posición/profundidad
 * dentro del <form> — no solo como primer hijo textual.
 *
 * Si un `<form>` no tiene `</form>` dentro del bloque (JSX roto o cortado por el propio
 * `extractDialogContentBlocks`), se descarta en vez de adivinar — no hay una forma segura de
 * decidir su alcance con texto plano.
 */
function findFormsWrappingDialogBody(block: string): { className: string | null }[] {
  const results: { className: string | null }[] = [];
  const formOpenRe = /<form\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = formOpenRe.exec(block)) !== null) {
    const openTag = m[0];
    const contentStart = m.index + openTag.length;
    const closeIdx = block.indexOf('</form>', contentStart);
    if (closeIdx === -1) {
      continue;
    }
    const inner = block.slice(contentStart, closeIdx);
    if (inner.includes('<DialogBody')) {
      const clsMatch = /className\s*=\s*"([^"]*)"/.exec(openTag);
      results.push({ className: clsMatch ? clsMatch[1] : null });
    }
    formOpenRe.lastIndex = closeIdx + '</form>'.length;
  }
  return results;
}

/** De los `<form>` que envuelven un `<DialogBody>` en un bloque, los que NO pueden encogerse
 * (les falta `flex-1` o `min-h-0` en el className). Comparten esta función el test real y los
 * de auto-verificación de abajo, para que "qué cuenta como violación" se defina en un único
 * lugar. */
function offendingFormsInBlock(block: string): string[] {
  return findFormsWrappingDialogBody(block)
    .filter(({ className }) => {
      const cls = className ?? '';
      return !cls.includes('flex-1') || !cls.includes('min-h-0');
    })
    .map(({ className }) => className ?? '');
}

describe('contrato de scroll de DialogContent', () => {
  const files = collectTsx(SRC).filter((f) => /<DialogContent[\s>]/.test(readFileSync(f, 'utf-8')));

  it('encuentra diálogos para auditar', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('todo DialogContent con contenido usa DialogBody o una región scrolleable propia', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      if (ALLOWLIST.has(rel)) continue;

      extractDialogContentBlocks(readFileSync(file, 'utf-8')).forEach((block, i) => {
        const hasBody = block.includes('<DialogBody');
        const hasOwnScroll = /overflow-y-auto|overflow-auto/.test(block);
        if (!hasBody && !hasOwnScroll) {
          offenders.push(`${rel} (diálogo #${i + 1})`);
        }
      });
    }

    expect(
      offenders,
      `Estos DialogContent recortan su contenido sin permitir scroll. ` +
        `Envuelve los campos en <DialogBody> y ancla los botones en <DialogFooter>:\n  ` +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  it('todo <form> ancestro de un <DialogBody> puede encogerse (flex-1 min-h-0)', () => {
    // Un <form> que ENVUELVE un DialogBody — a cualquier profundidad, no solo como hijo
    // inmediato — debe poder ceder altura: sin `flex-1 min-h-0` conserva su altura de
    // contenido y vuelve a desbordar el panel exactamente igual que si DialogBody no
    // existiera. Nueve diálogos de src/components/hato/components/ envuelven el <form>
    // alrededor de <DialogHeader> Y <DialogBody> juntos (no como hermano inmediato de
    // DialogBody) — están correctos hoy, pero solo porque alguien copió las clases a mano;
    // esta guarda es lo que impide que la próxima copia las olvide en silencio.
    //
    // Un <form> que es HIJO de DialogBody (DialogBody envuelve al form, no al revés — el
    // patrón de CompradorDialog.tsx/GastoForm.tsx) NO se marca: ahí es DialogBody quien
    // scrollea, y el form no necesita encogerse.
    //
    // Cómo se decide "ancestro" con regex sin un parser JSX: un <form> HTML/JSX no puede
    // anidar otro <form> (inválido por especificación), así que el primer `</form>` que
    // aparece después de un `<form …>` es, sin ambigüedad, SU cierre — no hace falta contar
    // profundidad de ningún otro tag. Eso reduce "¿es X ancestro de Y?" a "¿aparece la
    // apertura de Y en algún punto entre la apertura y el cierre de X?", que sí es seguro de
    // responder con texto plano. Ver findFormsWrappingDialogBody().
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      const source = readFileSync(file, 'utf-8');

      extractDialogContentBlocks(source).forEach((block, i) => {
        for (const cls of offendingFormsInBlock(block)) {
          offenders.push(`${rel} (diálogo #${i + 1}): <form className="${cls}">`);
        }
      });
    }

    expect(
      offenders,
      `Estos <form> envuelven un <DialogBody> pero no pueden encogerse. Sin "flex-1 min-h-0" ` +
        `el <form> conserva su altura de contenido y recorta el panel:\n  ` +
        offenders.join('\n  ') +
        `\nQué hacer: añade "flex flex-col flex-1 min-h-0" al className del <form> — ver ` +
        `src/components/hato/components/CrearAnimalDialog.tsx como referencia correcta.`,
    ).toEqual([]);
  });

  it('SÍ marca un <form> que envuelve DialogHeader+DialogBody sin poder encogerse (el guard puede fallar de verdad)', () => {
    const injected =
      '<DialogContent size="md">\n' +
      '  <form onSubmit={handleSubmit} className="gap-4">\n' +
      '    <DialogHeader><DialogTitle>x</DialogTitle></DialogHeader>\n' +
      '    <DialogBody className="space-y-4">contenido</DialogBody>\n' +
      '  </form>\n' +
      '</DialogContent>';
    // El finder detecta la relación de ancestro sin importar si las clases son correctas o no.
    const found = findFormsWrappingDialogBody(injected);
    expect(found).toHaveLength(1);
    expect(found[0].className).toBe('gap-4');
    // Y ese mismo caso SÍ cuenta como violación al evaluar si puede encogerse.
    expect(offendingFormsInBlock(injected)).toEqual(['gap-4']);
  });

  it('NO marca un <form> que es HIJO de DialogBody, no su ancestro (patrón de CompradorDialog.tsx)', () => {
    const ok =
      '<DialogContent size="sm">\n' +
      '  <DialogBody>\n' +
      '    <form id="comprador-form" onSubmit={handleSubmit} className="space-y-4 contents">\n' +
      '      <input />\n' +
      '    </form>\n' +
      '  </DialogBody>\n' +
      '</DialogContent>';
    // DialogBody envuelve al form, no al revés: el finder no debe encontrar ningún form
    // ancestro de DialogBody aquí, sin importar que su className no tenga flex-1/min-h-0.
    expect(findFormsWrappingDialogBody(ok)).toEqual([]);
    expect(offendingFormsInBlock(ok)).toEqual([]);
  });

  it('NO marca un <form> que envuelve DialogBody y SÍ puede encogerse (patrón correcto de los 9 diálogos de hato)', () => {
    const ok =
      '<DialogContent size="md">\n' +
      '  <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">\n' +
      '    <DialogHeader><DialogTitle>x</DialogTitle></DialogHeader>\n' +
      '    <DialogBody className="space-y-4">contenido</DialogBody>\n' +
      '  </form>\n' +
      '</DialogContent>';
    // El finder SÍ lo encuentra (es ancestro de DialogBody)...
    expect(findFormsWrappingDialogBody(ok)).toHaveLength(1);
    // ...pero no es una violación, porque sus clases ya le permiten encogerse.
    expect(offendingFormsInBlock(ok)).toEqual([]);
  });
});
