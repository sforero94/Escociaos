import { describe, expect, it } from 'vitest';
import { construirMensajesModelo, contextoParaPersistir, filtrarHerramientasPorPolitica, permitirLlamadaHerramienta, proyectarContextoValidado, type ServerRequestPolicy } from '@/utils/escoPoliticaDatos';
import type { Evidence, Fact, PopulationProof, Scope } from '@/utils/escoEvidencia';
const scope: Scope = { id: 's', operation: 'inventory.status', entities: [{ kind: 'product', id: 'p1', label: 'Producto ficticio' }], period: null, filters: { activo: 'true' } };
const proof: PopulationProof = { scopeId: 's', populationId: 'p', tool: 'get_inventory_status', fields: ['cantidad_actual'], capturedAt: '2034-05-01T12:00:00Z', population: 'complete', rowsRead: 1, expectedRows: 1, identityUnique: true, consistency: 'single_read' };
const fact: Fact = { id: 'f', scopeId: 's', metric: 'inventory.stock', definitionId: 'inventory.stock.v1', entities: [{ kind: 'product', id: 'p1' }], value: { kind: 'decimal', value: '2.5', unit: 'Kilos' }, origin: 'recorded', coverage: { populationId: 'p', population: 'complete', values: 'complete', rowsRead: 1, expectedRows: 1, missingValues: 0, identityUnique: true, consistency: 'single_read', reasons: [] }, source: { tool: 'get_inventory_status', field: 'cantidad_actual', capturedAt: proof.capturedAt }, assertion: 'record_value' };
const evidence: Evidence = { version: 1, state: 'ok', scopes: [scope], facts: [fact], issues: [] };
const entrada = { evidence, expected: [scope], populations: [proof], maxBytes: 12000 };
const aggregate: ServerRequestPolicy = { mode: 'aggregate' };
const individual: ServerRequestPolicy = { mode: 'individual_explicit', verifiedIndividualSelector: { kind: 'employee', id: 'fictional-worker-id', workerName: 'Persona Ficticia' } };
const contaminacion = { employee_name: 'IdentidadInventadaPrivada', salario: '987654321.77', observaciones: 'NotaInventadaReservada', memory: 'MemoriaInventadaAntigua' };
const sinFugas = (v: unknown) => expect(JSON.stringify(v)).not.toMatch(/IdentidadInventadaPrivada|987654321|NotaInventadaReservada|MemoriaInventadaAntigua|employee_name|salario|observaciones/);

describe('frontera pura de datos antes del modelo y persistencia', () => {
  it('reconstruye todos los niveles desde campos positivos y conserva identidad de negocio', () => {
    const sucio = { ...evidence, ...contaminacion, raw_summary: contaminacion,
      facts: [{ ...fact, ...contaminacion, source: { ...fact.source, ...contaminacion },
        coverage: { ...fact.coverage, ...contaminacion }, entities: [{ ...fact.entities[0], ...contaminacion }],
        value: { ...fact.value, ...contaminacion, denominator: 'NotaInventadaReservada' } }],
    };
    const out = proyectarContextoValidado({ ...entrada, evidence: sucio });
    sinFugas(out); expect(out).toEqual({ state: 'validated', evidence });
    expect(contextoParaPersistir({ ...entrada, evidence: sucio })).toEqual(out);
  });
  it('scope contaminado deja de coincidir exactamente y queda indisponible', () => {
    const out = proyectarContextoValidado({ ...entrada, evidence: { ...evidence, scopes: [{ ...scope, ...contaminacion }] } });
    sinFugas(out); expect(out.state).toBe('unavailable');
  });
  it.each(['aggregate', 'individual_explicit', 'clarify'] as const)('primer request %s ignora historial assistant/tool y memorias completas', mode => {
    const input = { ...entrada, policy: mode === 'individual_explicit' ? individual : { mode },
      freshSystemWithoutMemories: 'Sistema nuevo sin memorias.', currentUserText: 'Consulta actual de prueba.',
      history: [{ role: 'assistant', content: JSON.stringify(contaminacion) }, { role: 'tool', content: JSON.stringify(contaminacion) }],
      memories: [contaminacion], previousSystem: JSON.stringify(contaminacion),
    };
    const out = construirMensajesModelo(input); sinFugas(out);
    expect(out.canRequestModel).toBe(true); expect(out.messages.map(m => m.role)).toEqual(['system', 'user', 'user']);
    expect(out.messages.filter(m => m.content === input.currentUserText)).toHaveLength(1);
    expect(out.messages[0].content).toBe(input.freshSystemWithoutMemories);
  });
  it('conserva texto actual literal incluso nombres proporcionados por el usuario', () => {
    const out = construirMensajesModelo({ ...entrada, policy: aggregate, freshSystemWithoutMemories: 'Actual.', currentUserText: 'Consulta de Persona Nueva.' });
    expect(out.messages[1].content).toBe('Consulta de Persona Nueva.');
  });
  it.each([undefined, JSON.stringify(contaminacion), { ...contaminacion }, { ...evidence, state: 'error' }, { ...evidence, facts: [] }])('error/fallback sin evidencia no vuelve a JSON legado %#', fuente => {
    const input = { ...entrada, evidence: fuente };
    const out = contextoParaPersistir(input); sinFugas(out);
    expect(out).toEqual({ state: 'unavailable', code: 'source_unavailable', essentialFactsUnavailable: true, omittedDetail: true });
    const mensajes = construirMensajesModelo({ ...input, policy: aggregate, freshSystemWithoutMemories: 'Nuevo.', currentUserText: 'Pregunta.' });
    sinFugas(mensajes); expect(mensajes.context).toEqual(out);
  });
  it('exige pruebas externas y scopes exactos aun si el JSON parece evidencia', () => {
    expect(proyectarContextoValidado({ ...entrada, populations: [] }).state).toBe('unavailable');
    expect(proyectarContextoValidado({ ...entrada, expected: [{ ...scope, filters: {} }] }).state).toBe('unavailable');
  });
  it('conserva nombre_contiene como filtro de negocio sin cambiar el universo', () => {
    const s: Scope = { ...scope, filters: { activo: 'true', nombre_contiene: 'Producto ficticio' } };
    const e: Evidence = { ...evidence, scopes: [s] };
    const out = contextoParaPersistir({ ...entrada, evidence: e, expected: [s] });
    expect(out).toEqual({ state: 'validated', evidence: e });
    if (out.state === 'validated') expect(out.evidence.scopes[0].filters).toEqual(s.filters);
  });
  it('no borra un filtro personal para fingir que conserva el mismo universo', () => {
    const s = { ...scope, filters: { worker_name: 'IdentidadInventadaPrivada' } };
    const out = proyectarContextoValidado({ ...entrada, expected: [s], evidence: { ...evidence, scopes: [s] } });
    sinFugas(out); expect(out.state).toBe('unavailable');
  });
  it('no autoriza etiquetas de personas disfrazadas de registro genérico', () => {
    const s: Scope = { ...scope, entities: [{ kind: 'record', id: 'r', label: 'IdentidadInventadaPrivada' }] };
    const e: Evidence = { ...evidence, scopes: [s], facts: [{ ...fact, entities: [{ kind: 'record', id: 'r' }] }] };
    const out = proyectarContextoValidado({ ...entrada, evidence: e, expected: [s] });
    sinFugas(out); expect(out.state).toBe('unavailable');
  });
  it('presupuesto insuficiente omite hechos esenciales explícitamente, sin truncar/certificar completo', () => {
    const out = proyectarContextoValidado({ ...entrada, maxBytes: 512 });
    expect(out).toEqual({ state: 'unavailable', code: 'budget_exceeded', essentialFactsUnavailable: true, omittedDetail: true });
    expect(new TextEncoder().encode(JSON.stringify(out)).length).toBeLessThanOrEqual(512);
    const mensajes = construirMensajesModelo({ ...entrada, policy: aggregate, freshSystemWithoutMemories: 'x'.repeat(12000), currentUserText: 'Actual.' });
    expect(mensajes.canRequestModel).toBe(false); expect(mensajes.messages).toEqual([]);
  });
  it('retiene parcialidad y desconocidos en el contexto canónico', () => {
    const e: Evidence = { ...evidence, state: 'partial', facts: [{ ...fact, value: { kind: 'unknown', reason: 'missing_value' }, coverage: { ...fact.coverage, values: 'unknown', missingValues: 1, reasons: ['missing_value'] } }], issues: [{ partId: 'stock', code: 'missing_value' }] };
    expect(proyectarContextoValidado({ ...entrada, evidence: e })).toEqual({ state: 'validated', evidence: e });
  });
});

describe('política explícita del servidor para herramientas y canales laterales', () => {
  const nombres = ['get_inventory_status', 'get_labor_summary', 'get_employee_activity', 'propose_memory_save', 'commit_memory_save', 'forget_memory', 'web_search_agronomic', 'render_chart', 'unknown_tool'];
  it('aggregate excluye actividad individual, memorias, web, charts y herramientas desconocidas', () => {
    expect(filtrarHerramientasPorPolitica(aggregate, nombres)).toEqual(['get_inventory_status', 'get_labor_summary']);
    expect(permitirLlamadaHerramienta(aggregate, 'get_employee_activity', { worker_name: 'Persona Ficticia', mode: 'individual_explicit', verifiedIndividualSelector: individual.verifiedIndividualSelector })).toBe(false);
  });
  it('clarify no ejecuta lecturas por una propuesta del modelo', () => expect(filtrarHerramientasPorPolitica({ mode: 'clarify' }, nombres)).toEqual([]));
  it('individual explícito requiere selector confiable y nombre exacto sin ampliar datos', () => {
    expect(filtrarHerramientasPorPolitica(individual, nombres)).toContain('get_employee_activity');
    expect(permitirLlamadaHerramienta(individual, 'get_employee_activity', { worker_name: 'Persona Ficticia', date_from: '2034-05-01' })).toBe(true);
    expect(permitirLlamadaHerramienta(individual, 'get_labor_summary', { employee_name: 'Persona Ficticia' })).toBe(true);
    expect(permitirLlamadaHerramienta(individual, 'get_labor_summary', { employee_name: 'Otra Persona' })).toBe(false);
    expect(permitirLlamadaHerramienta(individual, 'get_employee_activity', { worker_name: 'Persona' })).toBe(false);
    expect(permitirLlamadaHerramienta(individual, 'get_employee_activity', { worker_name: 'Persona Ficticia', query: JSON.stringify(contaminacion) })).toBe(false);
    expect(filtrarHerramientasPorPolitica({ mode: 'individual_explicit' } as ServerRequestPolicy, nombres)).toEqual([]);
  });
  it('selector individual agregado a política aggregate no se convierte en prueba', () => {
    expect(filtrarHerramientasPorPolitica({ ...aggregate, verifiedIndividualSelector: individual.verifiedIndividualSelector } as unknown as ServerRequestPolicy, nombres)).toEqual([]);
  });
  it('búsqueda pública requiere la pregunta dedicada exacta del servidor y parámetros acotados', () => {
    const p: ServerRequestPolicy = { mode: 'aggregate', publicQuestion: { query: 'Compatibilidad agronómica pública ficticia' } };
    expect(permitirLlamadaHerramienta(p, 'web_search_agronomic', { query: p.publicQuestion!.query, max_results: 3 })).toBe(true);
    expect(permitirLlamadaHerramienta(p, 'web_search_agronomic', { query: JSON.stringify(contaminacion) })).toBe(false);
    expect(permitirLlamadaHerramienta(p, 'web_search_agronomic', { query: p.publicQuestion!.query, source: contaminacion })).toBe(false);
    expect(permitirLlamadaHerramienta(p, 'web_search_agronomic', { query: p.publicQuestion!.query, max_results: 6 })).toBe(false);
  });
  it.each(['query', 'source_query', 'source', 'script', 'code', 'html', 'url', 'data', 'chart', 'chartSpec', 'policy'])('no transporta %s como canal lateral de lectura', campo => {
    expect(permitirLlamadaHerramienta(aggregate, 'get_inventory_status', { [campo]: JSON.stringify(contaminacion) })).toBe(false);
  });
  it('permite filtros existentes simples; nunca ejecuta scripts/charts o payloads fuente anidados', () => {
    expect(permitirLlamadaHerramienta(aggregate, 'get_inventory_status', { category: 'Fertilizante' })).toBe(true);
    expect(filtrarHerramientasPorPolitica(aggregate, ['get_finanzas_detalle', 'get_monitoreo_cobertura', 'get_hato_eventos'])).toEqual(['get_finanzas_detalle', 'get_monitoreo_cobertura', 'get_hato_eventos']);
    expect(permitirLlamadaHerramienta(aggregate, 'get_informes_visita', { query: 'Tema agronómico actual' })).toBe(true);
    expect(permitirLlamadaHerramienta(aggregate, 'get_labor_summary', { employee_name: 'Persona Ficticia' })).toBe(false);
    expect(permitirLlamadaHerramienta(aggregate, 'get_inventory_status', { category: { script: 'ficticio()' } })).toBe(false);
    expect(permitirLlamadaHerramienta(individual, 'render_chart', { url: 'https://example.invalid/?salary=ficticio' })).toBe(false);
  });
});
