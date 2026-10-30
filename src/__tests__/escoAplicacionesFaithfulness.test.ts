// Test-only proposed application contract. All records and replies are synthetic.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ejecutarConsultaEsco, type ConsultaPagina, type FilaEsco } from '@/utils/escoConsultas';
const modulePath = '../supabase/functions/server/chat.tsx';
const { llmToolLoop } = await import(modulePath) as {
  llmToolLoop: (messages: { role: string; content: string }[]) => Promise<{
    text: string; toolInteractions: { tool: string; args: Record<string, unknown>; result_summary: string }[];
  }>;
};
const PERIOD = { date_from: '2031-05-01', date_to: '2031-05-31' };
const A = { id: 'fixture-app-a', nombre_aplicacion: 'Fumigación plága Z', tipo_aplicacion: 'Fumigación', estado: 'En ejecución', fecha_inicio_planeada: '2032-05-04', fecha_inicio_ejecucion: '2031-05-04', fecha_fin_ejecucion: null };
const B = { ...A, id: 'fixture-app-b', nombre_aplicacion: 'Fertilización sintética', tipo_aplicacion: 'Fertilización', fecha_inicio_planeada: '2031-05-06' };
const C = { ...A, id: 'fixture-app-c', nombre_aplicacion: 'Fumigación plaga Z segunda', fecha_inicio_planeada: '2031-05-07' };
const tables = new Set(['aplicaciones', 'movimientos_diarios', 'productos', 'lotes', 'movimientos_diarios_productos', 'aplicaciones_lotes', 'aplicaciones_lotes_planificado', 'aplicaciones_calculos', 'aplicaciones_mezclas', 'aplicaciones_productos', 'registros_trabajo']);
function database(db: Record<string, FilaEsco[]>): ConsultaPagina {
  return async (table, query) => {
    if (!tables.has(table)) throw Error('Unexpected synthetic table');
    const params = new URLSearchParams(query);
    let rows = db[table] ?? [];
    for (const [key, filter] of params) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      const dot = filter.indexOf('.'); const op = filter.slice(0, dot); const value = filter.slice(dot + 1);
      rows = rows.filter(row => {
        if (op === 'eq') return String(row[key]) === value;
        if (op === 'in') return value.slice(1, -1).split(',').map(v => v.replace(/"/g, '')).includes(String(row[key]));
        if (row[key] == null) return false;
        if (op === 'gte') return String(row[key]) >= value;
        if (op === 'lte') return String(row[key]) <= value;
        throw Error('Unexpected synthetic filter');
      });
    }
    const offset = Number(params.get('offset') ?? 0);
    return rows.slice(offset, offset + Number(params.get('limit') ?? 200));
  };
}
const details = (result: FilaEsco) => result.detalle as FilaEsco[];
const unexpected: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); expect(unexpected.splice(0)).toEqual([]); });
const FIXTURE = 'https://closed-fixture.invalid';
const MODEL_URL = 'https://openrouter.ai/api/v1/chat/completions';
const response = (message: unknown) => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
const call = (name: string, args: Record<string, unknown>) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'fixture-call', type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
function install(model: (body: Record<string, unknown>) => unknown, read?: (url: URL) => unknown[]) {
  vi.stubGlobal('Deno', { env: { get: (key: string) => ({ SUPABASE_URL: FIXTURE, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key', OPENROUTER_API_KEY: 'synthetic-model-key' } as Record<string, string>)[key] } });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input === MODEL_URL && init?.method === 'POST') return response(model(JSON.parse(String(init.body))));
    const url = new URL(input);
    if (url.origin === FIXTURE && (init?.method ?? 'GET') === 'GET' && read) {
      const rows = read(url);
      const full = new URL(url); full.searchParams.set('limit','20001'); full.searchParams.set('offset','0');
      const total = read(full).length, offset = Number(url.searchParams.get('offset') ?? 0);
      return new Response(JSON.stringify(rows), { headers: { 'content-range': rows.length ? `${offset}-${offset+rows.length-1}/${total}` : `*/${total}` } });
    }
    unexpected.push(`${init?.method ?? 'GET'} ${url.origin}${url.pathname}`);
    throw Error('Unexpected request; network fallback forbidden');
  }));
}

describe('synthetic application faithfulness — existing source inventory', () => {
  it('exposes the execution-history tool and all application routes to the actual loop', async () => {
    let tools: { function: { name: string; parameters: unknown } }[] = [];
    install(body => { tools = body.tools as typeof tools; return { role: 'assistant', content: 'Synthetic inventory only' }; });
    await llmToolLoop([{ role: 'user', content: 'Inventario sintético de herramientas' }]);
    const wanted = ['get_aplicaciones_ejecucion', 'get_application_summary', 'get_application_details', 'get_application_cost_by_lote', 'get_cost_by_lote', 'get_weekly_overview'];
    expect(tools.map(t => t.function.name)).toEqual(expect.arrayContaining(wanted));
    console.log('PUBLIC_SOURCE_TOOL_SCHEMAS', JSON.stringify(tools.filter(t => wanted.includes(t.function.name)).map(t => t.function)));
  });
});

describe('synthetic application discovery — proposed current scope, explicit planned scope retained', () => {
  it('finds an active application outside planned-date windows without inventing a period', async () => {
    // Current scope must not invent a planned date window.
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { alcance: 'actual', estado: 'En ejecución', application_name: 'plaga Z' }, database({ aplicaciones: [A, B] }), '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual([A.id]);
    expect(details(result)[0]).toMatchObject({ fecha_inicio_planeada: A.fecha_inicio_planeada, fecha_inicio_ejecucion: A.fecha_inicio_ejecucion });
  });
  it('matches accents, case and surrounding/repeated whitespace without selecting an unrelated application', async () => {
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { ...PERIOD, date_to: '2032-12-31', alcance: 'actual', estado: 'En ejecución', application_name: '  PLAGA   z  ' }, database({ aplicaciones: [A, B] }), '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual([A.id]);
  });
  it('retains every matching candidate on an ambiguous name rather than picking the newest', async () => {
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { ...PERIOD, date_to: '2032-12-31', alcance: 'actual', estado: 'En ejecución', application_name: 'plaga z' }, database({ aplicaciones: [A, B, C] }), '2031-05-10');
    expect(details(result).map(a => a.id).sort()).toEqual([A.id, C.id].sort());
  });
  it('preserves historical planned-date range selection only when explicitly requested', async () => {
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { ...PERIOD, date_basis: 'planned' }, database({ aplicaciones: [A, B] }), '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual([B.id]);
  });
  it('keeps conflicting original dates visible when actual movement brings an application into historical range', async () => {
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { ...PERIOD, application_id: A.id }, database({ aplicaciones: [A], movimientos_diarios: [{ id: 'fixture-move', aplicacion_id: A.id, fecha_movimiento: '2031-05-09' }] }), '2031-05-10');
    expect(details(result)).toHaveLength(1);
    expect(details(result)[0]).toMatchObject({ fecha_inicio_planeada: '2032-05-04', fecha_inicio_ejecucion: '2031-05-04' });
  });
});

describe('synthetic actual-loop application interpretation', () => {
  it('normalizes a legacy application type without dropping accent/whitespace variants', async () => {
    let round = 0;
    install(() => round++ === 0 ? call('get_application_summary', { type: '  fumigacion  ' }) : { role: 'assistant', content: 'Synthetic answer' }, url => {
      if (url.pathname === '/rest/v1/aplicaciones') return [A];
      if (['aplicaciones_lotes', 'aplicaciones_lotes_planificado', 'aplicaciones_calculos', 'aplicaciones_mezclas', 'movimientos_diarios'].some(t => url.pathname === `/rest/v1/${t}`)) return [];
      unexpected.push(url.pathname); throw Error('Unexpected table');
    });
    const result = await llmToolLoop([{ role: 'user', content: 'Consulta sintética de fumigación' }]);
    expect(JSON.parse(result.toolInteractions[0].result_summary).total_aplicaciones).toBe(1);
  });
  for (const tool of ['get_application_summary', 'get_tareas']) {
    it(`does not accept global application absence from incomplete ${tool} results`, async () => {
      let round = 0;
      const unsupported = 'No existe ninguna aplicación oficial de control de plaga Z.';
      install(() => round++ === 0 ? call(tool, PERIOD) : { role: 'assistant', content: unsupported }, url => {
        if (url.pathname === (tool === 'get_tareas' ? '/rest/v1/tareas' : '/rest/v1/aplicaciones')) return [];
        unexpected.push(url.pathname); throw Error('Unexpected table');
      });
      const result = await llmToolLoop([{ role: 'user', content: '¿Cómo va la aplicación de control de plaga Z?' }]);
      expect(JSON.parse(result.toolInteractions[0].result_summary)._evidencia.consulta_completa).toBe(false);
      expect(result.text).not.toBe(unsupported);
    });
  }
});

describe('actual-date default and explicit planned date basis', () => {
  it('uses actual dates for a historical range and never falls back to planned dates', async () => {
    const unknown = { ...B, fecha_inicio_ejecucion: null };
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', PERIOD, database({ aplicaciones: [A, unknown] }), '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual([A.id]);
    expect(result.resumen).toMatchObject({ date_basis: 'actual', fechas_reales_ausentes: 1 });
    const planned = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { ...PERIOD, date_basis: 'planned' }, database({ aplicaciones: [A, unknown] }), '2031-05-10');
    expect(details(planned).map(a => a.id)).toEqual([B.id]);
  });
  it.each([{ application_name: 4 }, { application_name: ' ' }, { estado: 'other' }, { date_basis: 'other' }, { alcance: 'other' }, { date_from: '2031-05-03', date_to: '2031-05-01' }])('fails closed for malformed application controls %j', async args => {
    await expect(ejecutarConsultaEsco('get_aplicaciones_ejecucion', args, database({ aplicaciones: [A] }), '2031-05-10')).rejects.toThrow();
  });
  it('forces the application execution tool and rejects unsolicited planned basis before any database read', async () => {
    let round = 0; let first: Record<string, unknown> = {};
    install(body => {
      if (round++ === 0) { first = body; return call('get_aplicaciones_ejecucion', { date_basis: 'planned' }); }
      return { role: 'assistant', content: 'Synthetic unsupported result' };
    });
    const result = await llmToolLoop([{ role: 'user', content: '¿Cómo va la aplicación sintética?' }]);
    expect(first.tool_choice).toEqual({ type: 'function', function: { name: 'get_aplicaciones_ejecucion' } });
    expect(JSON.parse(result.toolInteractions[0].result_summary).error).toContain('no pidió');
    expect(result.text).toContain('No pude verificar');
  });
});

describe('review regressions: explicit plans and authoritative plan source', () => {
  it('does not silently exclude calculated plans from explicit planned lookup without a range', async () => {
    const planned = { ...A, estado: 'Calculada', fecha_inicio_ejecucion: null };
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { date_basis: 'planned', application_name: 'plaga z' }, database({ aplicaciones: [planned] }), '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual([A.id]);
    expect(details(result)[0].fecha_real_ausente).toBe(true);
  });
  it('reads the persisted plan calculations rather than the legacy empty planning table', async () => {
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { application_name: 'plaga z' }, database({ aplicaciones: [A], aplicaciones_calculos: [{ id: 'fixture-plan', aplicacion_id: A.id, lote_id: 'fixture-lot', numero_canecas: 12 }] }), '2031-05-10');
    expect(details(result)[0].plan_por_lote).toEqual([expect.objectContaining({ id: 'fixture-plan', numero_canecas: 12 })]);
  });
  it('retains a real-plan lot match without legacy rows or movements', async () => {
    const db = database({ aplicaciones: [A], lotes: [{ id: 'fixture-lot', nombre: 'Lote Sintético' }], aplicaciones_calculos: [{ id: 'fixture-plan', aplicacion_id: A.id, lote_id: 'fixture-lot', numero_canecas: 12 }] });
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { application_name: 'plaga z', lote_name: 'Sintético' }, db, '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual([A.id]);
    expect(details(result)[0].plan_por_lote).toHaveLength(1);
    const other = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { application_name: 'plaga z', lote_name: 'Otro' }, db, '2031-05-10');
    expect(details(other)).toHaveLength(0);
  });

});


describe('review regressions: identity and collections retain their scope', () => {
  it.each([{ application_id: 'fixture-closed' }, { application_name: 'plaga z' }])('does not inject an active filter for identity lookup %j', async args => {
    const closed = { ...A, id: 'fixture-closed', estado: 'Cerrada', fecha_fin_ejecucion: '2031-05-08' };
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', args, database({ aplicaciones: [closed] }), '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual(['fixture-closed']);
  });
  it('filters an explicitly requested in-progress list while unfiltered lookup retains closed rows', async () => {
    const db = database({ aplicaciones: [A, { ...B, estado: 'Cerrada' }] });
    const active = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { estado: 'En ejecución' }, db, '2031-05-10');
    expect(details(active).map(a => a.id)).toEqual([A.id]);
    const all = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', {}, db, '2031-05-10');
    expect(details(all)).toHaveLength(2);
  });
  it('preserves a legitimate plural historical answer instead of singular disambiguation', async () => {
    let round = 0;
    install(() => round++ === 0 ? call('get_aplicaciones_ejecucion', PERIOD) : { role: 'assistant', content: 'Synthetic two-application state summary' }, url => {
      const table = url.pathname.split('/').pop()!;
      if (!tables.has(table)) { unexpected.push(table); throw Error('Unexpected fixture table'); }
      return table === 'aplicaciones' ? [A, B] : [];
    });
    const result = await llmToolLoop([{ role: 'user', content: 'Dame el estado de las aplicaciones de mayo de 2031' }]);
    expect(result.text).toContain('Fumigación plága Z');
    expect(result.text).toContain('Fertilización sintética');
    expect(result.text).toContain('Estado registrado: En ejecución');
    expect(result.text).not.toContain('Synthetic two-application state summary');
    expect(result.text).not.toContain('Precisa cuál');
    expect(round).toBe(1);
    expect(JSON.parse(result.toolInteractions[0].result_summary).detalle).toHaveLength(2);
  });
});
