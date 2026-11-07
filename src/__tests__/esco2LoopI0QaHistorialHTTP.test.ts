// Adversarial full HTTP transport with nonbreaking digit separators at both cuts.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { AVISO_EXTRACTO_HISTORIAL, MAX_CONTEXTO_MENSAJE } from '../utils/esco2Historial.ts';
import { dependencies, forbidNetwork, ID, p2Db, plan, request, tool } from './esco2P2Harness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await p2Db(); }, 30_000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
const budget = MAX_CONTEXTO_MENSAJE - AVISO_EXTRACTO_HISTORIAL.length;
const head = Math.floor(budget * 0.7), tail = budget - head;

describe('Loop I0 F4 QA: Unicode digit tokens survive HTTP history compacting as whole tokens', () => {
  it.each(['1\u00a0234\u202f567,891234', '١\u00a0٢٣٤\u202f٥٦٧,٨٩١٢٣٤', '𝟙\u00a0𝟚𝟛𝟜\u202f𝟝𝟞𝟟,𝟠𝟡𝟙𝟚𝟛𝟜'])('omits the complete formatted token %s rather than publishing numeric fragments', async number => {
    const prefix = 'a'.repeat(head - 14) + ' Total: ';
    const suffix = ' cola '.repeat(Math.ceil(tail / 6)).slice(0, tail - 8);
    const text = prefix + number + '\n🌳 centro '.repeat(1800) + number + ' ' + suffix;
    const h = dependencies(db, [tool(plan({ metricas: ['jornales'], lote_ids: [ID.l3] }))]);
    const response = await manejar(request({ pregunta: 'Jornales del lote seleccionado', historial: [{ rol: 'assistant', texto: text }] }), h.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resultados[0].total.jornales).toBe(0.75);
    const shown = h.solicitudes[0].mensajes.find(m => m.role === 'assistant')?.content;
    expect(shown).toBeDefined();
    expect(shown!.length).toBeLessThanOrEqual(MAX_CONTEXTO_MENSAJE);
    const parts = shown!.split(AVISO_EXTRACTO_HISTORIAL);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe(prefix);
    expect(parts[1]).toBe(' ' + suffix);
    expect(shown).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });
});
