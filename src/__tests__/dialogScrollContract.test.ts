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

  it('DialogBody nunca es hermano de un contenedor que no puede encogerse', () => {
    // Un <form> que envuelve DialogBody debe poder ceder altura: sin `flex-1
    // min-h-0` conserva su altura de contenido y vuelve a desbordar el panel.
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      const source = readFileSync(file, 'utf-8');

      const formWithBody = /<form[^>]*className="([^"]*)"[^>]*>\s*\n\s*<DialogBody/g;
      let m: RegExpExecArray | null;
      while ((m = formWithBody.exec(source)) !== null) {
        const cls = m[1];
        if (!cls.includes('flex-1') || !cls.includes('min-h-0')) {
          offenders.push(`${rel}: <form className="${cls}">`);
        }
      }
    }

    expect(
      offenders,
      `Un <form> que envuelve <DialogBody> necesita "flex flex-col flex-1 min-h-0":\n  ` +
        offenders.join('\n  '),
    ).toEqual([]);
  });
});
