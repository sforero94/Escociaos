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

  it.each(CONVERSACIONES)('%s prepara parto/cría antes de cualquier escritor directo', (rel) => {
    const src=leer(rel);expect(src).toContain("if(clave==='parto')return await confirmBirth");
    expect(src.indexOf("if(clave==='parto')return await confirmBirth")).toBeLessThan(src.indexOf('const guardado = await conversation.external'));
    expect(src).not.toMatch(/crearFichaCriaConReintento\(|debeCrearFichaCria\(|errBorrarCria/);
    const protocol=leer(rel.replace('/conversations/eventoHato.ts','/birthCreationProtocol.ts'));
    for(const helper of ['construirFichaCria','calcularSiguienteChapetaCria','elegirToroDelServicio'])expect(protocol).toContain(helper+'(');
    expect(protocol).toContain("'fn_hato_birth_telegram'");
  });

  it.each(BOTS)('%s preserves coupled calf history through the reviewed atomic undo protocol', (rel) => {
    const src = leer(rel);
    const undo = src.slice(src.indexOf('bot.callbackQuery(/^hato_ev_undo:/'), src.indexOf('bot.callbackQuery(/^hato_tr_undo:/'));
    expect(undo).toContain("handleHatoUndoReview(ctx, getSupabaseAdmin(), 'event')");
    expect(undo).not.toMatch(/\.delete\(|decidirDeshacerCria|elegirUsoIdParaDeshacer/);
    const sql = leer('src/sql/security-candidates/hato-undo.sql');
    expect(sql).toContain("row_json->>'cria_id' IS NOT NULL");
    expect(sql).toContain("row_json->>'cria_destino' IS NOT DISTINCT FROM 'retenida'");
    expect(sql).toContain("(row_json->'datos') ? 'pajilla_uso_id'");
    expect(sql).not.toMatch(/DELETE FROM public\.(?:hato_animales|hato_pajillas_uso)/);
    expect(sql).toContain('Only provably standalone Telegram events');
  });

  it('el navegador revisa la ficha y guarda parto/cría por un solo protocolo atómico', () => {
    const reader=leer('src/components/hato/hooks/useMarcarCicloHato.ts');
    expect(reader).not.toMatch(/\.insert\(|\.delete\(|crearFichaCriaConReintento\(/);
    const dialog=leer('src/components/hato/components/MarcarCicloDialog.tsx');
    expect(dialog).toContain('useCycle()');expect(dialog).toContain("cycle.run('prepare'");expect(dialog).toContain('Confirmar marca revisada');
    const protocol=leer('src/utils/hato/hatoCycleProtocol.ts');
    for(const helper of ['calcularSiguienteChapetaCria','elegirToroDelServicio','construirFichaCria'])expect(protocol).toContain(helper+'(');
    expect(protocol).toContain("'fn_hato_cycle_web'");
    const sql=leer('src/sql/security-candidates/hato-cycle.sql');
    expect(sql).toContain('INSERT INTO public.hato_animales');expect(sql).toContain('INSERT INTO public.hato_eventos');expect(sql).toContain('Cycle final audit/target/calf mismatch');
    expect(sql).not.toMatch(/DELETE FROM public\.(?:hato_animales|hato_eventos)/);
  });
});
