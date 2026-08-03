import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Guard del contrato "scroll no cambia un número capturado".
 *
 * Un `<input>` numérico enfocado incrementa o decrementa su valor cuando el
 * usuario hace scroll con la rueda del mouse. En esta app eso no es una
 * molestia estética: los formularios de captura viven dentro de `DialogBody`
 * (que scrollea) y de páginas largas, así que el gesto natural de "bajar hasta
 * el botón Guardar" con el campo todavía enfocado reescribe la cifra en
 * silencio — canecas aplicadas, bultos usados, cantidad de un movimiento de
 * inventario, árboles afectados en un monitoreo.
 *
 * El CLAUDE.md raíz lo declara desde hace tiempo bajo "Responsive & Layout
 * Rules": «Number inputs: must prevent scroll-to-change with
 * `onWheel={(e) => e.currentTarget.blur()}`. This is a critical bug source».
 * Este test convierte esa regla escrita en una regla verificada.
 *
 * Dos formas válidas de cumplirla:
 *  - `<Input type="number">` — el primitivo `components/ui/input.tsx` aplica el
 *    guard por dentro, así que el sitio de uso no escribe nada.
 *  - `<input type="number">` nativo — debe llevar `onWheel` en el propio tag.
 */

const SRC = join(__dirname, '..');
const PRIMITIVO = join(SRC, 'components', 'ui', 'input.tsx');

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

/**
 * Devuelve el texto completo de cada tag `<input …>` / `<Input …>` del archivo,
 * balanceando llaves para no cortar en el `>` de una arrow function dentro de
 * una prop (`onChange={(e) => …}`).
 */
function extraerTagsInput(source: string): { tag: string; nativo: boolean; linea: number }[] {
  const tags: { tag: string; nativo: boolean; linea: number }[] = [];
  const apertura = /<(input|Input)\b/g;
  let m: RegExpExecArray | null;
  while ((m = apertura.exec(source)) !== null) {
    let llaves = 0;
    let fin = -1;
    for (let i = m.index; i < source.length; i++) {
      const c = source[i];
      if (c === '{') llaves++;
      else if (c === '}') llaves--;
      else if (c === '>' && llaves === 0) {
        fin = i;
        break;
      }
    }
    if (fin === -1) continue;
    tags.push({
      tag: source.slice(m.index, fin + 1),
      nativo: m[1] === 'input',
      linea: source.slice(0, m.index).split('\n').length,
    });
  }
  return tags;
}

/**
 * Los comentarios dentro del tag no son atributos. `ChequeoDiffReview.tsx`
 * explica en un `//` interno por qué su input NO es `type="number"` — leerlo
 * como si lo fuera sería un falso positivo.
 */
function sinComentarios(tag: string): string {
  return tag.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const esNumerico = (tag: string) => /type=["']number["']/.test(sinComentarios(tag));

describe('contrato onWheel de los inputs numéricos', () => {
  const archivos = collectTsx(SRC);

  it('encuentra inputs numéricos para auditar', () => {
    const total = archivos
      .flatMap((f) => extraerTagsInput(readFileSync(f, 'utf-8')))
      .filter((t) => esNumerico(t.tag));
    expect(total.length).toBeGreaterThan(50);
  });

  it('el primitivo Input neutraliza la rueda en los campos numéricos', () => {
    const fuente = readFileSync(PRIMITIVO, 'utf-8');
    expect(fuente).toContain('currentTarget.blur()');
    // El guard debe estar condicionado al tipo numérico y no pisar un onWheel
    // que venga del sitio de uso.
    expect(fuente).toMatch(/type === ["']number["']/);
    expect(fuente).toContain('onWheel?.(');
  });

  it('todo <input type="number"> nativo lleva el guard en el tag', () => {
    const infractores: string[] = [];
    for (const archivo of archivos) {
      for (const { tag, nativo, linea } of extraerTagsInput(readFileSync(archivo, 'utf-8'))) {
        if (!nativo || !esNumerico(tag)) continue;
        if (/onWheel/.test(tag)) continue;
        infractores.push(`${relative(SRC, archivo)}:${linea}`);
      }
    }
    expect(infractores, `Falta onWheel={(e) => e.currentTarget.blur()} en:\n${infractores.join('\n')}`).toEqual([]);
  });
});
