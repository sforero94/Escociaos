// The schema advertised to the provider must survive validation and HTTP execution.
// Independent synthetic source fixture; not a planner-accuracy measurement.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { herramientasPlanificador } from '../utils/esco2/registro.ts';
import { dependencies, forbidNetwork, p2Db, plan, request, tool } from './esco2P2Harness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await p2Db(); }, 30_000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });

type ToolSchema = { function: { name: string; parameters: { properties: { ranking?: { properties: { metrica: { enum: string[] } } } } } } };
const labor = (herramientasPlanificador() as ToolSchema[]).find(t => t.function.name === 'consultar_labores');
const metrics = labor?.function.parameters.properties.ranking?.properties.metrica.enum ?? [];

describe('M6 QA: published ranking variants through HTTP + source', () => {
  it('advertises a substantive set of ranking metrics', () => {
    expect(metrics).toContain('jornales');
    expect(metrics).toContain('costo');
    expect(metrics.length).toBeGreaterThanOrEqual(2);
  });

  it.each(metrics)('accepts advertised ranking metric %s with valid source and compatible grouping', async metric => {
    // The fixture includes complete positive denominators and costs for this scope.
    // Selecting Otro by name avoids ambiguous labels while exercising real ID resolution.
    const h = dependencies(db, [tool(plan({
      lotes: ['Otro'], agrupar_por: ['lote'], metricas: [metric],
      ranking: { metrica: metric, direccion: 'desc', n: 1, empates: 'incluir' },
    }))]);
    const response = await manejar(request({ pregunta: `Clasifica la población seleccionada por ${metric}` }), h.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.origen).toBe('determinista');
    expect(body.resultados).toHaveLength(1);
    expect(body.resultados[0].estado).toBe('ok');
    expect(body.resultados[0].filas).toHaveLength(1);
    expect(body.resultados[0].filas[0][metric]).not.toBeNull();
    expect(body.resultados[0].filas[0][metric]).not.toBeUndefined();
  });
});
