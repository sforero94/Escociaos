// An omitted extraction can be structurally valid. Only the independent question oracle detects it.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, request } from './esco2P2Harness.ts';
import { task3QaDb, T3 } from './esco2P3Task3QaHarness.ts';
let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task3QaDb(); }, 30000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
describe('P3 independent extraction falsification', () => {
  it('Given an original two-part question and an inventory silently omitting calibration, When the valid single query runs, Then structural validation cannot masquerade as exhaustive coverage', async () => {
    const question = 'productos ejecutados de Líquido sintético y calibración por árbol';
    const h = dependencies(db, [{ nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify({ aplicacion_id: T3.liquid, parte_ids: ['s1'], cobertura: { version: 1, partes: [{ id: 's1', texto: 'productos ejecutados de Líquido sintético', capacidad: 'cantidades_aplicacion', disposicion: 'consultar' }] } }) }]);
    const deps = { ...h.deps, modoCobertura: 'obligatoria' as const };
    const response = await manejar(request({ pregunta: question }), deps);
    const body = await response.json();
    expect(body.origen).toBe('determinista');
    expect(body.cobertura.estado).toBe('declarada_validada');
    expect(body.cobertura.exhaustividad).toBe('no_certificada');
    const externalExpectedCapabilities = ['cantidades_aplicacion', 'fuera_de_contrato'];
    const declared = new Set(body.cobertura.partes.map((p: { capacidad: string }) => p.capacidad));
    expect(externalExpectedCapabilities.every(cap => declared.has(cap))).toBe(false);
    expect(body.resultados).toHaveLength(1);
  });
});
