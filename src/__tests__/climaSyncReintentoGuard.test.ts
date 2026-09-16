import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ESCO-97: the 5-min `/clima/sync` insert used to drop the reading on a
 * PostgREST 504 with no retry. UNIQUE(station_id, timestamp) +
 * ignore-duplicates makes a retry of a 504-that-wrote safe — we never
 * invent rainfall.
 *
 * Scope is the 5-min insert ONLY. Ecowitt and backfill stay one-shot
 * (a History retry is a different contract; the issue does not ask for it).
 */

const RAIZ = resolve(__dirname, '../..');
const COPIAS = [
  'src/supabase/functions/server/clima.tsx',
  'supabase/functions/make-server-1ccce916/clima.tsx',
];

function leer(rel: string): string {
  return readFileSync(resolve(RAIZ, rel), 'utf8');
}

function cuerpoHandleClimaSync(fuente: string): string {
  const inicio = fuente.indexOf('export async function handleClimaSync');
  const fin = fuente.indexOf('async function backfillUnDia', inicio);
  expect(inicio).toBeGreaterThanOrEqual(0);
  expect(fin).toBeGreaterThan(inicio);
  return fuente.slice(inicio, fin);
}

function cuerpoBackfillUnDia(fuente: string): string {
  const inicio = fuente.indexOf('async function backfillUnDia');
  const fin = fuente.indexOf('export async function handleClimaBackfill', inicio);
  expect(inicio).toBeGreaterThanOrEqual(0);
  expect(fin).toBeGreaterThan(inicio);
  return fuente.slice(inicio, fin);
}

describe('clima 5-min sync: reintento acotado de 5xx/red (ESCO-97)', () => {
  it('ambas copias envuelven SOLO el insert de 5 min con conReintento', () => {
    for (const rel of COPIAS) {
      const fuente = leer(rel);
      expect(fuente, rel).toContain("from './reintento.ts'");
      expect(fuente, rel).toContain('conReintento');
      expect(fuente, rel).toContain('esStatusReintentable');

      const sync = cuerpoHandleClimaSync(fuente);
      expect(sync, rel).toContain('conReintento(');
      expect(sync, rel).toContain('esValorReintentable: (res) => esStatusReintentable(res.status)');
      expect(sync, rel).toContain("Prefer: 'return=minimal,resolution=ignore-duplicates'");

      // Una sola llamada: el insert de 5 min. El fetch a Ecowitt queda fuera.
      const usos = sync.split('conReintento(').length - 1;
      expect(usos, `${rel} handleClimaSync debe tener exactamente 1 conReintento`).toBe(1);
      expect(sync, rel).not.toMatch(/conReintento\([\s\S]*api\.ecowitt\.net/);
    }
  });

  it('el backfill NO usa conReintento — el issue acota el retry al sync de 5 min', () => {
    for (const rel of COPIAS) {
      const backfill = cuerpoBackfillUnDia(leer(rel));
      expect(backfill, rel).not.toContain('conReintento(');
    }
  });

  it('las dos copias de clima.tsx siguen siendo idénticas en el wrap', () => {
    const [a, b] = COPIAS.map(leer);
    expect(a).toBe(b);
  });
});
