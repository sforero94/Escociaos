import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Guard del filtro `es_hato` en `fin_transacciones_ganado` — SOW 0,
 * `docs/plan_hato_produccion_rework.md`.
 *
 * `es_hato` (migración 059) se escribe en exactamente un lugar
 * (`TransaccionGanadoForm.tsx`) y hasta esta sesión no se filtraba en
 * ningún lado: una venta del Hato Lechero se contabilizaba como venta de
 * Ganado en el P&G, y peor, entraba a `costearVentasGanado` (promedio
 * ponderado de COMPRA) -- una vaca del hato nunca se compró.
 *
 * Test estático puro (sin conexión a DB): lee el texto fuente y verifica
 * que toda lectura (`.select(...)`) de `fin_transacciones_ganado` trae
 * `es_hato` en la misma consulta. Sigue el estilo de
 * `dialogScrollContract.test.ts` / `hatoSchemaContract.test.ts`.
 *
 * Cubre DOS formas de acceso a la tabla:
 *  1. Cliente supabase-js: `.from('fin_transacciones_ganado')` /
 *     `.from("fin_transacciones_ganado")` (frontend Y los flujos de
 *     conversación de Telegram, que usan el mismo cliente).
 *  2. El helper de fetch crudo de `chat.tsx` (Esco):
 *     `supabaseQuery('fin_transacciones_ganado', <query string>)` /
 *     `supabaseQueryAll(...)`.
 *
 * NO cubre escrituras (`.insert`/`.update`/`.delete`) — esas no agregan
 * varias transacciones y no necesitan el filtro. Un `.select(...)` que
 * sigue a un `.insert(...)` (patrón "insert-returning", ver
 * `TransaccionGanadoForm.tsx`) se detecta y se excluye igual.
 */

const REPO_ROOT = join(__dirname, '../..');
const SRC = join(REPO_ROOT, 'src');
const SUPABASE_FUNCTIONS = join(REPO_ROOT, 'supabase/functions');

/**
 * Lecturas de `fin_transacciones_ganado` que a propósito NO llevan el
 * filtro: son listas de nombres de finca para un selector (crear una
 * transacción NUEVA), no agregaciones financieras. No afectan ningún total
 * ni costeo — no son el bug que este guard existe para atrapar. Etiquetas
 * relativas a la raíz del repo.
 */
const ALLOWLIST_FROM = new Set([
  // Selector de fincas (solo lee la columna `finca`, sin agregación financiera).
  // Corrido de 87 a 88 al importar `obtenerFechaHoy` en el arreglo de fecha local.
  'src/components/finanzas/components/TransaccionGanadoForm.tsx:88',
  'src/supabase/functions/server/telegram/conversations/ingreso.ts:275',
  'src/supabase/functions/server/telegram/conversations/gasto.ts:290',
  // Árbol espejo (supabase/functions/make-server-1ccce916) — mismo motivo.
  'supabase/functions/make-server-1ccce916/telegram/conversations/ingreso.ts:275',
  'supabase/functions/make-server-1ccce916/telegram/conversations/gasto.ts:290',
]);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__' || entry === 'migrations') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function relLabel(file: string): string {
  return relative(REPO_ROOT, file).replace(/\\/g, '/');
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/** Ventana de texto desde un match hasta la próxima línea en blanco (o un
 * tope de 600 caracteres) — suficiente para cubrir una cadena `.from()...`
 * encadenada más las amendas `if (x) q = q.eq(...)` que le siguen sin
 * separación en blanco, sin arrastrar el bloque de código siguiente. */
function windowFrom(source: string, index: number, maxLen = 600): string {
  const blank = source.slice(index).search(/\n[ \t]*\r?\n/);
  const end = blank === -1 ? Math.min(source.length, index + maxLen) : Math.min(index + blank, index + maxLen);
  return source.slice(index, end);
}

describe('guard: fin_transacciones_ganado siempre filtra es_hato en lecturas', () => {
  const files = collectSourceFiles(SRC).concat(collectSourceFiles(SUPABASE_FUNCTIONS));

  it('encuentra archivos que referencian fin_transacciones_ganado', () => {
    const withRef = files.filter((f) => readFileSync(f, 'utf-8').includes('fin_transacciones_ganado'));
    expect(withRef.length).toBeGreaterThan(3);
  });

  it('todo .from(fin_transacciones_ganado) de LECTURA trae es_hato en la misma consulta', () => {
    const offenders: string[] = [];
    const fromRe = /\.from\(\s*['"]fin_transacciones_ganado['"]/g;

    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      let m: RegExpExecArray | null;
      fromRe.lastIndex = 0;
      while ((m = fromRe.exec(source)) !== null) {
        const line = lineNumberAt(source, m.index);
        const label = `${relLabel(file)}:${line}`;
        const window = windowFrom(source, m.index);

        // Escrituras (incl. "insert-returning": .insert(...).select(...))
        // no necesitan el filtro.
        if (/\.insert\(|\.update\(|\.delete\(/.test(window)) continue;

        if (ALLOWLIST_FROM.has(label)) continue;

        if (!/es_hato/.test(window)) {
          offenders.push(label);
        }
      }
    }

    expect(
      offenders,
      `Estas lecturas de fin_transacciones_ganado no excluyen es_hato=true. ` +
        `Una venta del Hato Lechero se contabilizaría como venta de Ganado y ` +
        `se costearía al promedio de compra de la ceba (que nunca compró esa ` +
        `vaca). Agrega .eq('es_hato', false) a la consulta, o si es una ` +
        `lectura legítima sin agregación financiera (p.ej. un selector de ` +
        `fincas), agrégala a ALLOWLIST_FROM con el motivo:\n  ` +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  it('todo supabaseQuery(All)(fin_transacciones_ganado, ...) trae es_hato=eq.false', () => {
    const offenders: string[] = [];
    const rawRe = /supabaseQueryAll?\(\s*['"]fin_transacciones_ganado['"]/g;

    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      let m: RegExpExecArray | null;
      rawRe.lastIndex = 0;
      while ((m = rawRe.exec(source)) !== null) {
        const line = lineNumberAt(source, m.index);
        const label = `${relLabel(file)}:${line}`;
        const window = windowFrom(source, m.index);

        if (!/es_hato=eq\.false/.test(window)) {
          offenders.push(label);
        }
      }
    }

    expect(
      offenders,
      `Estas llamadas supabaseQuery(All) a fin_transacciones_ganado no ` +
        `traen "es_hato=eq.false" en el query string. Mismo bug que el ` +
        `caso .from() -- ver el mensaje de arriba:\n  ` +
        offenders.join('\n  '),
    ).toEqual([]);
  });
});
