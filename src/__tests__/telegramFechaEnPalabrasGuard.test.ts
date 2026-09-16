/**
 * ESCO-87: before this issue, Telegram already restated dates in Spanish
 * words and asked for confirmation before save. Data cleanup of the
 * transposed services is #263 — this guard only pins the product code.
 *
 * `fechaLegible` / `formatDateSpanish` write the month in letters
 * ("5 de septiembre 2026"), never "5/9". The parser already refuses to
 * pick an ambiguous DD/MM by itself (`telegramFechaDDMM.test.ts`).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '../..');

const FLUJOS: { archivo: string; helper: string; confirma: string }[] = [
  {
    archivo: 'src/supabase/functions/server/telegram/conversations/eventoHato.ts',
    helper: 'fechaLegible',
    confirma: '¿Guardo?',
  },
  {
    archivo: 'src/supabase/functions/server/telegram/conversations/ingreso.ts',
    helper: 'formatDateSpanish',
    confirma: 'Confirmar',
  },
  {
    archivo: 'src/supabase/functions/server/telegram/conversations/jornal.ts',
    helper: 'formatDateSpanish',
    confirma: 'Confirmar',
  },
];

describe('ESCO-87: Telegram dice la fecha en palabras antes de guardar', () => {
  it.each(FLUJOS)('$archivo confirma con el mes en letras', ({ archivo, helper, confirma }) => {
    const fuente = readFileSync(resolve(RAIZ, archivo), 'utf-8');
    expect(fuente).toContain(helper);
    expect(fuente).toContain(confirma);
  });

  it('fechaLegible escribe el mes en letras, no un número', () => {
    const fuente = readFileSync(
      resolve(RAIZ, 'src/supabase/functions/server/telegram/fechaDDMM.ts'),
      'utf-8',
    );
    expect(fuente).toMatch(/septiembre/);
    expect(fuente).toContain('export function fechaLegible');
  });
});
