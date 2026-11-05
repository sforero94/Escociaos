// User fragments are diagnostics, never an independent numeric source for the answer scorer.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, request } from './esco2P2Harness.ts';
import { task3QaDb, T3 } from './esco2P3Task3QaHarness.ts';
import { extraerNumeros } from '../utils/escoEvals/numeros.ts';
let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task3QaDb(); }, 30000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
describe('P3 coverage QA: question-only values cannot satisfy factual anchors', () => {
  it('Given an unsupported subpart containing a unique number absent from source, When coverage labels render, Then the number stays only in raw diagnostic JSON', async () => {
    const supported = 'productos ejecutados de Líquido sintético';
    const excluded = 'calibración para 77777 árboles';
    const h = dependencies(db, [{ nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify({ aplicacion_id: T3.liquid, parte_ids: ['s1'], cobertura: { version: 1, partes: [{ id: 's1', texto: supported, capacidad: 'cantidades_aplicacion', disposicion: 'consultar' }, { id: 's2', texto: excluded, capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato' }] } }) }]);
    const response = await manejar(request({ pregunta: supported + ' y ' + excluded }), { ...h.deps, modoCobertura: 'obligatoria' as const });
    const body = await response.json();
    expect(body.cobertura.partes[1].texto).toBe(excluded);
    expect(body.respuesta).toContain('0,01 L');
    expect(extraerNumeros(body.respuesta).some(n => Math.abs(n - 77777) < 0.1)).toBe(false);
    expect(body.respuesta).not.toContain('77777');
  });
});
