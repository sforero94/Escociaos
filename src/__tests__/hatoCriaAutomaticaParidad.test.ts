/**
 * Paridad frontend ⇄ edge function de `src/utils/hato/criaAutomatica.ts`
 * (ESCO-135). El módulo es PURO con CERO imports, así que las dos copias
 * Deno-side (generadas por `docs/hato/regenerar-copias-cria-automatica.py`)
 * deben ser BYTE-IDÉNTICAS debajo del encabezado y comportarse igual.
 *
 * Además fija que el bot (`/evento` → Parto y su Deshacer) y el navegador
 * (`useMarcarCicloHato`) usen de verdad el módulo: sin esa guarda, una copia
 * del bot podría volver a insertar el parto sin crear la ternera y la suite
 * seguiría en verde.
 *
 * Si falla la paridad: edita `src/utils/hato/criaAutomatica.ts` y corre
 * `python3 docs/hato/regenerar-copias-cria-automatica.py`. NUNCA edites las
 * copias a mano.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as frontend from '@/utils/hato/criaAutomatica';
import * as servidorFuente from '../supabase/functions/server/hato-cria-automatica';
import * as servidorDespliegue from '../../supabase/functions/make-server-1ccce916/hato-cria-automatica';

const RAIZ = resolve(__dirname, '../..');
const MARCADOR = '// -------';

function leer(rel: string): string {
  return readFileSync(resolve(RAIZ, rel), 'utf-8');
}

function cuerpo(rel: string): string {
  const texto = leer(rel);
  const i = texto.indexOf(MARCADOR);
  if (i === -1) throw new Error(`Sin marcador en ${rel}`);
  return texto.slice(i);
}

const FRONTEND = 'src/utils/hato/criaAutomatica.ts';
const COPIAS = [
  'src/supabase/functions/server/hato-cria-automatica.ts',
  'supabase/functions/make-server-1ccce916/hato-cria-automatica.ts',
];

describe('criaAutomatica — paridad estructural', () => {
  it.each(COPIAS)('%s es byte-idéntica al original bajo el encabezado', (rel) => {
    expect(cuerpo(rel)).toBe(cuerpo(FRONTEND));
  });

  it('el generador en modo --check no encuentra deriva', () => {
    expect(() =>
      execFileSync('python3', ['docs/hato/regenerar-copias-cria-automatica.py', '--check'], {
        cwd: RAIZ,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});

describe('criaAutomatica — paridad de comportamiento', () => {
  const padron = [
    { numero: 215, estado: 'activa' },
    { numero: 442, estado: 'vendida' },
    { numero: 900, estado: 'activa' },
    { numero: 5182, estado: 'activa' },
  ];

  it('las tres implementaciones dan la misma chapeta, toro y ficha', () => {
    for (const m of [servidorFuente, servidorDespliegue]) {
      expect(m.calcularSiguienteChapetaCria(padron)).toBe(frontend.calcularSiguienteChapetaCria(padron));
      expect(m.elegirToroDelServicio([{ fecha: '2025-12-15', toro_id: 't' }], '2026-09-20')).toBe(
        frontend.elegirToroDelServicio([{ fecha: '2025-12-15', toro_id: 't' }], '2026-09-20'),
      );
      const input = {
        numero: 216,
        madreId: 'm',
        fincaId: 'f',
        fechaParto: '2026-09-20',
        fechaPartoConfianza: 'exacta' as const,
        padreToroId: null,
        createdBy: 'u',
        fuente: 'telegram' as const,
      };
      expect(m.construirFichaCria(input)).toEqual(frontend.construirFichaCria(input));
    }
  });
});

describe('criaAutomatica — los escritores la usan de verdad', () => {
  const CONVERSACIONES = [
    'src/supabase/functions/server/telegram/conversations/eventoHato.ts',
    'supabase/functions/make-server-1ccce916/telegram/conversations/eventoHato.ts',
  ];
  const BOTS = [
    'src/supabase/functions/server/telegram/bot.ts',
    'supabase/functions/make-server-1ccce916/telegram/bot.ts',
  ];

  it.each(CONVERSACIONES)('%s crea la ficha y enlaza cria_id', (rel) => {
    const src = leer(rel);
    expect(src).toContain('../../hato-cria-automatica.ts');
    expect(src).toMatch(/crearFichaCriaConReintento\(/);
    expect(src).toMatch(/debeCrearFichaCria\(/);
    expect(src).toMatch(/cria_id:\s*cria\?\.id/);
  });

  it.each(BOTS)('%s decide el Deshacer con decidirDeshacerCria', (rel) => {
    const src = leer(rel);
    expect(src).toContain('../hato-cria-automatica.ts');
    expect(src).toMatch(/decidirDeshacerCria\(/);
  });

  it('el navegador crea la ficha al marcar "parida"', () => {
    const src = leer('src/components/hato/hooks/useMarcarCicloHato.ts');
    expect(src).toContain("@/utils/hato/criaAutomatica");
    expect(src).toMatch(/crearFichaCriaConReintento\(/);
    expect(src).toMatch(/debeCrearFichaCria\(/);
  });
});
