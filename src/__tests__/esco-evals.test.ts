/**
 * Esco evaluation suite (regression).
 *
 * Two layers of testing — see plan TDD section in `i-want-to-make-sleepy-lecun.md`:
 *
 *  1. Source-structure assertions (Tier A): read `chat.tsx` as text and assert tool
 *     definitions, executor function presence, system-prompt directives, and SELECT
 *     clauses match the expected shape. Catches drift in tool registration.
 *
 *  2. Pure-function behavioral tests (Tier B): import the pure aggregation helpers
 *     from `cost-aggregation.ts` and feed them mock Supabase row shapes. Catches
 *     bugs in the data transformations Esco depends on.
 *
 *  Tier C (live LLM tool-selection) is intentionally not covered here — Esco's
 *  edge function uses Deno.env which doesn't run in Vitest, and live model calls
 *  are non-deterministic. Tool-selection drift is caught by Tier A asserting the
 *  routing directives are present in the system prompt.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ----------------------------------------------------------------------------
// Source loader (shared with esco-improvements.test.ts pattern)
// ----------------------------------------------------------------------------

const chatSourcePath = resolve(__dirname, '../supabase/functions/server/chat.tsx');
const chatSource = readFileSync(chatSourcePath, 'utf-8');

const deployedChatSourcePath = resolve(
  __dirname,
  '../../supabase/functions/make-server-1ccce916/chat.tsx',
);

// ----------------------------------------------------------------------------
// Tool registry parser
// ----------------------------------------------------------------------------

export interface ParsedTool {
  name: string;
  description: string;
  required: string[];
  properties: string[];
}

/**
 * Extract the contents of every `{ name: '...', description: '...', parameters: {...} }`
 * block inside `const TOOLS: ToolDefinition[] = [ ... ]`. Regex-based; the source is
 * trusted (we wrote it) so we don't need a full JS parser.
 */
export function parseTools(source: string): ParsedTool[] {
  const arrayMatch = source.match(/const TOOLS:\s*ToolDefinition\[\]\s*=\s*\[([\s\S]*?)\n\];/);
  if (!arrayMatch) throw new Error('Could not locate TOOLS array in chat.tsx');
  const arrayBody = arrayMatch[1];

  const tools: ParsedTool[] = [];
  const toolRegex = /\{\s*name:\s*'([^']+)',\s*description:\s*'([^']*)',[\s\S]*?parameters:\s*\{([\s\S]*?)\n\s{2,4}\},?\s*\n\s{0,2}\},/g;

  let match: RegExpExecArray | null;
  while ((match = toolRegex.exec(arrayBody)) !== null) {
    const name = match[1];
    const description = match[2];
    const paramsBody = match[3];

    const requiredMatch = paramsBody.match(/required:\s*\[([^\]]*)\]/);
    const required = requiredMatch
      ? requiredMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/['"`]/g, ''))
          .filter(Boolean)
      : [];

    const propertyNames = [...paramsBody.matchAll(/(\w+):\s*\{\s*type:/g)].map((m) => m[1]);

    tools.push({ name, description, required, properties: propertyNames });
  }

  return tools;
}

export function getTool(name: string, source = chatSource): ParsedTool | undefined {
  return parseTools(source).find((t) => t.name === name);
}

/**
 * Return the body of the named exec function (used to assert SELECT clauses,
 * table joins, etc.). Returns the slice from the function declaration up to the
 * next `async function exec` or end-of-file.
 */
export function getExecFunctionBody(name: string, source = chatSource): string | null {
  const startRe = new RegExp(`async function ${name}\\b`);
  const startMatch = source.match(startRe);
  if (!startMatch || startMatch.index === undefined) return null;
  const start = startMatch.index;
  const tail = source.slice(start + startMatch[0].length);
  const nextMatch = tail.match(/\n(async function exec|\/\/ ===|export function)/);
  const end = nextMatch && nextMatch.index !== undefined ? start + startMatch[0].length + nextMatch.index : source.length;
  return source.slice(start, end);
}

/**
 * Some executors delegate to private helper functions in the same section
 * (e.g., the per-lote cost executors share `fetchPerLoteCostsForApplication`).
 * This helper returns the entire region between two marker lines so assertions
 * about table joins / Supabase queries can find the keywords regardless of
 * where they live within the section.
 */
export function getRegionBetween(startMarker: string, endMarker: string, source = chatSource): string | null {
  const start = source.indexOf(startMarker);
  if (start < 0) return null;
  const tail = source.slice(start + startMarker.length);
  const endRel = tail.indexOf(endMarker);
  if (endRel < 0) return null;
  return source.slice(start, start + startMarker.length + endRel);
}

// ----------------------------------------------------------------------------
// Smoke case: harness sanity (must pass without any v2 implementation work)
// ----------------------------------------------------------------------------

describe('Esco evals — harness sanity', () => {
  it('parses the TOOLS array from chat.tsx', () => {
    const tools = parseTools(chatSource);
    expect(tools.length).toBeGreaterThanOrEqual(17);
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_labor_summary');
    expect(names).toContain('get_application_summary');
    expect(names).toContain('get_budget_data');
  });

  it('finds executor function bodies via getExecFunctionBody', () => {
    const body = getExecFunctionBody('execLaborSummary');
    expect(body).not.toBeNull();
    expect(body).toContain('registros_trabajo');
  });

  it('chat.tsx source and deployed copy stay byte-identical', () => {
    const deployed = readFileSync(deployedChatSourcePath, 'utf-8');
    expect(deployed).toBe(chatSource);
  });
});

// ----------------------------------------------------------------------------
// Phase 1B — per-lote cost analysis
//
// New tools: get_application_cost_by_lote, get_cost_by_lote.
// New shared module: src/supabase/functions/server/cost-aggregation.ts
// holding pure aggregation helpers (importable by both chat.tsx and tests).
// ----------------------------------------------------------------------------

describe('Phase 1B — get_application_cost_by_lote (tool registration)', () => {
  it('TOOLS array includes get_application_cost_by_lote', () => {
    const tool = getTool('get_application_cost_by_lote');
    expect(tool, 'tool must be registered').toBeDefined();
  });

  it('accepts application_id or application_name', () => {
    const tool = getTool('get_application_cost_by_lote');
    expect(tool?.properties).toContain('application_id');
    expect(tool?.properties).toContain('application_name');
  });

  it('description mentions per-lote cost breakdown', () => {
    const tool = getTool('get_application_cost_by_lote');
    expect(tool?.description.toLowerCase()).toMatch(/lote/);
    expect(tool?.description.toLowerCase()).toMatch(/costo|cost/);
  });

  it('dispatch switch routes get_application_cost_by_lote to execApplicationCostByLote', () => {
    expect(chatSource).toContain(
      "case 'get_application_cost_by_lote': result = await execApplicationCostByLote(args); break;",
    );
  });
});

describe('Phase 1B — execApplicationCostByLote (executor)', () => {
  const region = () =>
    getRegionBetween('// PER-LOTE COST ANALYSIS', 'async function execWeeklyOverview') ?? '';

  it('executor function exists', () => {
    expect(getExecFunctionBody('execApplicationCostByLote')).not.toBeNull();
  });

  it('queries movimientos_diarios filtered by aplicacion_id', () => {
    const r = region();
    expect(r).toMatch(/movimientos_diarios[^_]/);
    expect(r).toMatch(/aplicacion_id=eq\./);
  });

  it('queries movimientos_diarios_productos for product detail', () => {
    expect(region()).toContain('movimientos_diarios_productos');
  });

  it('queries productos.precio_unitario for cost calculation', () => {
    const r = region();
    expect(r).toMatch(/productos[^a-z_]/);
    expect(r).toMatch(/precio_unitario/);
  });

  it('queries registros_trabajo filtered by tarea_id (labor cost by lote)', () => {
    const r = region();
    expect(r).toContain('registros_trabajo');
    expect(r).toMatch(/tarea_id=eq\./);
  });

  it('queries aplicaciones_lotes_planificado for tree counts per lote', () => {
    expect(region()).toContain('aplicaciones_lotes_planificado');
  });

  it('uses pure aggregation helpers from cost-aggregation module', () => {
    expect(region()).toMatch(/aggregateInsumosPorLote|aggregateJornalesPorLote|combineCostosPorLote/);
  });
});

describe('Phase 1B — get_cost_by_lote (cross-application rollup)', () => {
  it('TOOLS array includes get_cost_by_lote', () => {
    expect(getTool('get_cost_by_lote'), 'tool must be registered').toBeDefined();
  });

  it('accepts a date range', () => {
    const tool = getTool('get_cost_by_lote');
    expect(tool?.properties).toContain('date_from');
    expect(tool?.properties).toContain('date_to');
    expect(tool?.required).toContain('date_from');
    expect(tool?.required).toContain('date_to');
  });

  it('dispatch switch routes get_cost_by_lote to execCostByLote', () => {
    expect(chatSource).toContain(
      "case 'get_cost_by_lote': result = await execCostByLote(args); break;",
    );
  });

  it('execCostByLote queries aplicaciones in date range', () => {
    const region = getRegionBetween('// PER-LOTE COST ANALYSIS', 'async function execWeeklyOverview') ?? '';
    expect(region).toMatch(/aplicaciones/);
    expect(region).toMatch(/fecha_inicio_planeada|fecha_cierre/);
  });
});

describe('Phase 1B — pure aggregation helpers (cost-aggregation.ts)', () => {
  it('aggregateInsumosPorLote sums product cost by lote', async () => {
    const mod = await import('../supabase/functions/server/cost-aggregation');
    const movimientos = [
      { id: 'm1', lote_id: 'l1' },
      { id: 'm2', lote_id: 'l1' },
      { id: 'm3', lote_id: 'l2' },
    ];
    const movProductos = [
      { movimiento_diario_id: 'm1', producto_id: 'p1', producto_nombre: 'A', cantidad_utilizada: 1000, unidad: 'cc' },
      { movimiento_diario_id: 'm2', producto_id: 'p1', producto_nombre: 'A', cantidad_utilizada: 500, unidad: 'cc' },
      { movimiento_diario_id: 'm3', producto_id: 'p2', producto_nombre: 'B', cantidad_utilizada: 2, unidad: 'kg' },
    ];
    const precios = new Map([
      ['p1', 10000],
      ['p2', 20000],
    ]);

    const result = mod.aggregateInsumosPorLote(movimientos, movProductos, precios);
    // 1500 cc of p1 → 1.5 L × 10000 = 15000
    expect(result.get('l1')?.costoTotal).toBeCloseTo(15000);
    // 2 kg of p2 × 20000 = 40000
    expect(result.get('l2')?.costoTotal).toBeCloseTo(40000);
  });

  it('aggregateJornalesPorLote sums labor cost by lote', async () => {
    const mod = await import('../supabase/functions/server/cost-aggregation');
    const registros = [
      { lote_id: 'l1', fraccion_jornal: 1.0, costo_jornal: 50000 },
      { lote_id: 'l1', fraccion_jornal: 0.5, costo_jornal: 25000 },
      { lote_id: 'l2', fraccion_jornal: 1.0, costo_jornal: 60000 },
    ];
    const result = mod.aggregateJornalesPorLote(registros);
    expect(result.get('l1')).toEqual({ jornales: 1.5, costo: 75000 });
    expect(result.get('l2')).toEqual({ jornales: 1, costo: 60000 });
  });

  it('combineCostosPorLote produces per-lote rows with tree-count denominator', async () => {
    const mod = await import('../supabase/functions/server/cost-aggregation');
    const insumos = new Map([
      ['l1', { cantidadTotal: 1.5, costoTotal: 15000, productos: [] }],
      ['l2', { cantidadTotal: 2, costoTotal: 40000, productos: [] }],
    ]);
    const jornales = new Map([
      ['l1', { jornales: 1.5, costo: 75000 }],
      ['l2', { jornales: 1.0, costo: 60000 }],
    ]);
    const lotesInfo = [
      { id: 'l1', nombre: 'Lote A', total_arboles: 100 },
      { id: 'l2', nombre: 'Lote B', total_arboles: 200 },
    ];

    const rows = mod.combineCostosPorLote(insumos, jornales, lotesInfo);

    const a = rows.find((r: { lote_id: string }) => r.lote_id === 'l1')!;
    expect(a.lote_nombre).toBe('Lote A');
    expect(a.costo_insumos).toBe(15000);
    expect(a.costo_mano_obra).toBe(75000);
    expect(a.costo_total).toBe(90000);
    expect(a.costo_por_arbol).toBe(900);

    const b = rows.find((r: { lote_id: string }) => r.lote_id === 'l2')!;
    expect(b.costo_total).toBe(100000);
    expect(b.costo_por_arbol).toBe(500);
  });

  it('combineCostosPorLote handles zero trees without dividing by zero', async () => {
    const mod = await import('../supabase/functions/server/cost-aggregation');
    const rows = mod.combineCostosPorLote(
      new Map([['l1', { cantidadTotal: 0, costoTotal: 1000, productos: [] }]]),
      new Map(),
      [{ id: 'l1', nombre: 'X', total_arboles: 0 }],
    );
    const r = rows.find((x: { lote_id: string }) => x.lote_id === 'l1')!;
    expect(r.costo_por_arbol).toBe(0);
  });

  it('convertirUnidadBase normalises cc/g to L/kg', async () => {
    const mod = await import('../supabase/functions/server/cost-aggregation');
    expect(mod.convertirUnidadBase(1500, 'cc')).toEqual({ cantidadBase: 1.5, unidadBase: 'Litros' });
    expect(mod.convertirUnidadBase(2500, 'g')).toEqual({ cantidadBase: 2.5, unidadBase: 'Kilos' });
    expect(mod.convertirUnidadBase(4, 'L')).toEqual({ cantidadBase: 4, unidadBase: 'Litros' });
    expect(mod.convertirUnidadBase(3, 'kg')).toEqual({ cantidadBase: 3, unidadBase: 'Kilos' });
  });
});

// ----------------------------------------------------------------------------
// Phase 1C — High-severity audit fixes (test-first per gap)
//
// Source: docs/esco-tool-audit.md
// Scope (per plan): only the cost-related summary gaps and the monitoring
// sublote aggregation. Other High items (labor task-type matrix) are tracked
// in BUG_REPORT.md for a follow-up sprint.
// ----------------------------------------------------------------------------

describe('Phase 1C — get_application_summary exposes cost columns', () => {
  it('SELECT clause includes costo_total_insumos and costo_total_mano_obra', () => {
    const body = getExecFunctionBody('execApplicationSummary') ?? '';
    expect(body).toContain('costo_total_insumos');
    expect(body).toContain('costo_total_mano_obra');
  });

  it('SELECT clause keeps the existing aggregate costo_total', () => {
    const body = getExecFunctionBody('execApplicationSummary') ?? '';
    expect(body).toMatch(/select=.*costo_total\b/);
  });
});

describe('Phase 1C — get_application_details exposes per-lote breakdown', () => {
  it('execApplicationDetails returns costo_por_lote computed via the shared helper', () => {
    const body = getExecFunctionBody('execApplicationDetails') ?? '';
    expect(body).toContain('costo_por_lote');
    expect(body).toMatch(/fetchPerLoteCostsForApplication|combineCostosPorLote/);
  });
});

describe('Phase 1C — get_monitoring_data aggregates by sublote', () => {
  it('execMonitoringData returns resumen_por_sublote in the response payload', () => {
    const body = getExecFunctionBody('execMonitoringData') ?? '';
    expect(body).toContain('resumen_por_sublote');
  });

  it('sublote aggregation tracks afectados / monitoreados / max_gravedad', () => {
    const body = getExecFunctionBody('execMonitoringData') ?? '';
    expect(body).toMatch(/sublote/);
    expect(body).toMatch(/max_gravedad|maxGravedad/);
  });
});

// ----------------------------------------------------------------------------
// Phase 1E — system-prompt routing rule for cost-by-lote questions
// ----------------------------------------------------------------------------

describe('Phase 1E — system prompt routes cost-by-lote questions', () => {
  function getSystemPromptText() {
    const m = chatSource.match(/export function getSystemPrompt[\s\S]*?return `([\s\S]*?)`;/);
    return m ? m[1] : '';
  }

  it('mentions get_application_cost_by_lote with explicit routing guidance', () => {
    const prompt = getSystemPromptText();
    expect(prompt).toContain('get_application_cost_by_lote');
    expect(prompt.toLowerCase()).toMatch(/costo.*por.*lote|costo.*por.*arbol/);
  });

  it('mentions get_cost_by_lote for cross-application comparisons', () => {
    const prompt = getSystemPromptText();
    expect(prompt).toContain('get_cost_by_lote');
  });
});

// ----------------------------------------------------------------------------
// Phase 2 — External knowledge tools (Tavily + OpenWeatherMap)
// ----------------------------------------------------------------------------

describe('Phase 2A — web_search_agronomic (Tavily)', () => {
  it('TOOLS array includes web_search_agronomic with required query parameter', () => {
    const tool = getTool('web_search_agronomic');
    expect(tool, 'tool must be registered').toBeDefined();
    expect(tool?.required).toContain('query');
  });

  it('description scopes the tool to agronomy / external knowledge', () => {
    const tool = getTool('web_search_agronomic');
    expect(tool?.description.toLowerCase()).toMatch(/agronomic|fitosanitar|plaga|enfermedad|dosis/);
  });

  it('dispatch switch routes web_search_agronomic to execWebSearchAgronomic', () => {
    expect(chatSource).toContain(
      "case 'web_search_agronomic': result = await execWebSearchAgronomic(args); break;",
    );
  });

  it('execWebSearchAgronomic calls api.tavily.com and reads TAVILY_API_KEY', () => {
    const body = getExecFunctionBody('execWebSearchAgronomic') ?? '';
    expect(body).toContain('api.tavily.com');
    expect(body).toContain("Deno.env.get('TAVILY_API_KEY')");
  });

  it('parseTavilyResponse normalises Tavily JSON into { answer, sources }', async () => {
    const fixture = JSON.parse(
      readFileSync(resolve(__dirname, 'fixtures/tavily-response.json'), 'utf-8'),
    );
    const mod = await import('../supabase/functions/server/external-tools');
    const result = mod.parseTavilyResponse(fixture);
    expect(result.answer).toContain('Lambda-cyhalothrin');
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].url).toBe('https://example.com/foliar-compat');
    expect(result.sources[0].title).toContain('Compatibility');
  });
});

describe('Phase 2B — get_weather_forecast (OpenWeatherMap)', () => {
  it('TOOLS array includes get_weather_forecast with optional days parameter', () => {
    const tool = getTool('get_weather_forecast');
    expect(tool, 'tool must be registered').toBeDefined();
    expect(tool?.properties).toContain('days');
  });

  it('dispatch switch routes get_weather_forecast to execWeatherForecast', () => {
    expect(chatSource).toContain(
      "case 'get_weather_forecast': result = await execWeatherForecast(args); break;",
    );
  });

  it('execWeatherForecast calls openweathermap.org and reads OPENWEATHER_API_KEY', () => {
    const body = getExecFunctionBody('execWeatherForecast') ?? '';
    expect(body).toContain('openweathermap.org');
    expect(body).toContain("Deno.env.get('OPENWEATHER_API_KEY')");
  });

  it('parseOpenWeatherForecast aggregates 3-hour blocks into per-day summaries', async () => {
    const fixture = JSON.parse(
      readFileSync(resolve(__dirname, 'fixtures/openweather-forecast.json'), 'utf-8'),
    );
    const mod = await import('../supabase/functions/server/external-tools');
    const days = mod.parseOpenWeatherForecast(fixture, 7);

    expect(days).toHaveLength(2); // 2026-05-08 and 2026-05-09 in fixture
    const day1 = days.find((d: { date: string }) => d.date === '2026-05-08')!;
    expect(day1.temp_min).toBe(14);
    expect(day1.temp_max).toBe(23);
    expect(day1.rainfall_mm).toBeCloseTo(3.5, 5); // 0 + 1.4 + 2.1
    expect(day1.rain_probability_pct).toBe(70); // max pop in the day, as percent
    expect(day1.wind_max_kmh).toBeGreaterThan(0);
  });

  it('parseOpenWeatherForecast clamps to the requested days argument', async () => {
    const fixture = JSON.parse(
      readFileSync(resolve(__dirname, 'fixtures/openweather-forecast.json'), 'utf-8'),
    );
    const mod = await import('../supabase/functions/server/external-tools');
    const days = mod.parseOpenWeatherForecast(fixture, 1);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-05-08');
  });
});

describe('Phase 2C — agronomy citation discipline (system prompt)', () => {
  function getSystemPromptText() {
    const m = chatSource.match(/export function getSystemPrompt[\s\S]*?return `([\s\S]*?)`;/);
    return m ? m[1] : '';
  }

  it('prompt forbids answering agronomic questions from internal memory', () => {
    const prompt = getSystemPromptText();
    expect(prompt).toContain('web_search_agronomic');
    // require an explicit "never answer from memory" type rule near the citation directive
    expect(prompt.toLowerCase()).toMatch(/nunca.*memor|siempre.*cita|cita.*fuente|incluye.*enlace/);
  });

  it('prompt describes the weather forecast tool', () => {
    const prompt = getSystemPromptText();
    expect(prompt).toContain('get_weather_forecast');
  });

  it('prompt routes mixed inventory + agronomy questions to both tools', () => {
    const prompt = getSystemPromptText();
    // Routing block should mention "if user asks about a product they have AND its agronomic spec"
    expect(prompt.toLowerCase()).toMatch(/inventari|stock/);
    expect(prompt.toLowerCase()).toMatch(/agronom|fitosanitar|dosis|compatibil/);
  });
});

// ----------------------------------------------------------------------------
// Phase 3 — Long-term memory ("save this for later" + recall + forget)
// ----------------------------------------------------------------------------

describe('Phase 3C — memory tools registered', () => {
  it('TOOLS array includes propose_memory_save with content and reason params', () => {
    const tool = getTool('propose_memory_save');
    expect(tool, 'tool must be registered').toBeDefined();
    expect(tool?.required).toContain('content');
    expect(tool?.properties).toContain('reason');
  });

  it('TOOLS array includes commit_memory_save with token + final_content', () => {
    const tool = getTool('commit_memory_save');
    expect(tool, 'tool must be registered').toBeDefined();
    expect(tool?.required).toContain('token');
    expect(tool?.properties).toContain('final_content');
  });

  it('TOOLS array includes forget_memory accepting memory_id or match_text', () => {
    const tool = getTool('forget_memory');
    expect(tool, 'tool must be registered').toBeDefined();
    expect(tool?.properties).toContain('memory_id');
    expect(tool?.properties).toContain('match_text');
  });

  it('dispatch switch routes the three memory tools to their executors', () => {
    expect(chatSource).toContain("case 'propose_memory_save': result = await execProposeMemorySave(args); break;");
    expect(chatSource).toContain("case 'commit_memory_save': result = await execCommitMemorySave(args, userId); break;");
    expect(chatSource).toContain("case 'forget_memory': result = await execForgetMemory(args, userId); break;");
  });
});

describe('Phase 3C — propose_memory_save returns a confirmation envelope, not a DB insert', () => {
  it('execProposeMemorySave does NOT insert into esco_memorias', () => {
    const body = getExecFunctionBody('execProposeMemorySave') ?? '';
    expect(body).not.toMatch(/supabaseInsert\(.*esco_memorias/);
  });

  it('execProposeMemorySave returns a payload flagged as a proposal', () => {
    // The executor delegates to makeMemoryProposal (which sets _memory_proposal: true).
    // We verify the delegation rather than re-asserting the literal in the body.
    const body = getExecFunctionBody('execProposeMemorySave') ?? '';
    expect(body).toMatch(/makeMemoryProposal/);
    expect(body).toMatch(/token/);
  });
});

describe('Phase 3C — commit_memory_save persists to esco_memorias', () => {
  it('execCommitMemorySave inserts into esco_memorias with user_id', () => {
    const body = getExecFunctionBody('execCommitMemorySave') ?? '';
    expect(body).toMatch(/supabaseInsert\(\s*['"]esco_memorias['"]/);
    expect(body).toContain('user_id');
  });

  it('execCommitMemorySave validates the token from the proposal payload', () => {
    const body = getExecFunctionBody('execCommitMemorySave') ?? '';
    expect(body).toMatch(/token/);
  });
});

describe('Phase 3C — forget_memory soft-deletes via archived_at', () => {
  it('execForgetMemory updates archived_at on esco_memorias rows', () => {
    const body = getExecFunctionBody('execForgetMemory') ?? '';
    expect(body).toContain('esco_memorias');
    expect(body).toContain('archived_at');
  });
});

describe('Phase 3 — pure memory-proposal helper', () => {
  it('makeMemoryProposal produces { _memory_proposal, token, content, reason }', async () => {
    const mod = await import('../supabase/functions/server/memory');
    const proposal = mod.makeMemoryProposal({
      content: 'Lote Pinares se cosecha la 3ra semana de cada mes',
      reason: 'Regla operativa recurrente',
    });
    expect(proposal._memory_proposal).toBe(true);
    expect(proposal.token).toMatch(/^mem_/);
    expect(proposal.content).toContain('Pinares');
    expect(proposal.reason).toContain('recurrente');
  });

  it('makeMemoryProposal generates distinct tokens on repeated calls', async () => {
    const mod = await import('../supabase/functions/server/memory');
    const a = mod.makeMemoryProposal({ content: 'x' });
    const b = mod.makeMemoryProposal({ content: 'x' });
    expect(a.token).not.toBe(b.token);
  });

  it('makeMemoryProposal trims content to <= 500 chars', async () => {
    const mod = await import('../supabase/functions/server/memory');
    const proposal = mod.makeMemoryProposal({ content: 'a'.repeat(800) });
    expect(proposal.content.length).toBeLessThanOrEqual(500);
  });
});

describe('Phase 3E — system prompt prefix for memory', () => {
  function getSystemPromptText() {
    const m = chatSource.match(/export function getSystemPrompt[\s\S]*?return `([\s\S]*?)`;/);
    return m ? m[1] : '';
  }

  it('prompt contains a MEMORIAS GUARDADAS block (placeholder or live)', () => {
    expect(getSystemPromptText()).toContain('MEMORIAS GUARDADAS');
  });

  it('prompt instructs Esco to call propose_memory_save on save requests', () => {
    const p = getSystemPromptText().toLowerCase();
    expect(p).toContain('propose_memory_save');
    expect(p).toMatch(/guarda|recuerda|para luego|save this/);
  });

  it('prompt instructs Esco to call forget_memory on forget requests', () => {
    expect(getSystemPromptText()).toContain('forget_memory');
  });
});

describe('Phase 3 — getSystemPrompt accepts a memorias array and renders it', () => {
  it('exported signature accepts an optional memorias parameter', () => {
    // The function should be either getSystemPrompt(memorias?: ...) or accept a config object
    expect(chatSource).toMatch(/export function getSystemPrompt\(\s*(memorias|opts|config)/);
  });
});

describe('Phase 3 — handleChatMessage loads memorias before building the prompt', () => {
  it('handleChatMessage queries esco_memorias for the user', () => {
    expect(chatSource).toMatch(/esco_memorias/);
    expect(chatSource).toMatch(/archived_at=is\.null|archived_at\s*IS\s*NULL/i);
  });
});
