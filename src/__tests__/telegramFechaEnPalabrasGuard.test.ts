/**
 * ESCO-87: only an AMBIGUOUS date needs a spoken-date check.
 *
 * `5/9` is 5 de septiembre or 9 de mayo — the flow must ask, in words,
 * never with the same `5/9` string. `14/12/26` and `27/11/26` have one
 * reading (day > 12); the owner said those need no extra check.
 *
 * Data cleanup of the transposed services is #263.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { leerFecha } from '../supabase/functions/server/telegram/fechaDDMM';

const RAIZ = resolve(__dirname, '../..');
const HOY = '2026-09-16';

const FLUJOS = [
  'src/supabase/functions/server/telegram/conversations/eventoHato.ts',
  'src/supabase/functions/server/telegram/conversations/ingreso.ts',
  'src/supabase/functions/server/telegram/conversations/jornal.ts',
];

describe('ESCO-87: solo lo ambiguo se confirma en palabras', () => {
  it('14/12/26 y 27/11/26 son únicos: se usan sin preguntar', () => {
    expect(leerFecha('14/12/26', HOY)).toEqual({
      tipo: 'unico',
      fecha: { iso: '2026-12-14', etiqueta: '14 de diciembre 2026' },
    });
    expect(leerFecha('27/11/26', HOY)).toEqual({
      tipo: 'unico',
      fecha: { iso: '2026-11-27', etiqueta: '27 de noviembre 2026' },
    });
  });

  it('5/9 sí es ambiguo: el flujo tiene que preguntar', () => {
    const r = leerFecha('5/9', HOY);
    expect(r.tipo).toBe('ambiguo');
  });

  it.each(FLUJOS)('%s pregunta solo en la rama ambigua', (archivo) => {
    const fuente = readFileSync(resolve(RAIZ, archivo), 'utf-8');
    expect(fuente).toMatch(/tipo === ["']unico["']/);
    expect(fuente).toContain('fecha_amb_0');
    expect(fuente).toMatch(/se puede leer de dos formas/);
  });
});
