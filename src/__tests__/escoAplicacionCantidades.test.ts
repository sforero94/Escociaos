// Synthetic boundary probes. A mocked model cannot establish answer quality.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ejecutarConsultaEsco, resumirContexto, type FilaEsco } from '../utils/escoConsultas';
const modulePath = '../supabase/functions/server/chat.tsx';
const { llmToolLoop, getSystemPrompt } = await import(modulePath) as {
  llmToolLoop: (messages: { role: string; content: string }[]) => Promise<{
    text: string; toolInteractions: { tool: string; result_summary: string }[];
  }>;
  getSystemPrompt: () => string;
};
const args = { application_id: 'synthetic-app', date_from: '2032-04-01', date_to: '2032-04-02' };
function fixture(missing = false): Record<string, FilaEsco[]> {
  return {
    aplicaciones: [{ id: 'synthetic-app', nombre_aplicacion: 'Control sintético plaga Z', estado: 'En ejecución',
      fecha_inicio_planeada: '2032-03-20', fecha_fin_planeada: '2032-03-21',
      fecha_inicio_ejecucion: '2032-04-01', fecha_fin_ejecucion: null }],
    movimientos_diarios: [
      { id: 'm1', aplicacion_id: 'synthetic-app', lote_id: 'l1', fecha_movimiento: '2032-04-01', numero_canecas: 3 },
      { id: 'm2', aplicacion_id: 'synthetic-app', lote_id: 'l2', fecha_movimiento: '2032-04-02', numero_canecas: 4 },
      { id: 'outside', aplicacion_id: 'synthetic-app', lote_id: 'l1', fecha_movimiento: '2032-03-31', numero_canecas: 2 },
    ],
    movimientos_diarios_productos: [
      { id: 'c1', movimiento_diario_id: 'm1', producto_id: 'p1', producto_nombre: 'Insumo sintético', cantidad_utilizada: missing ? null : '1.25', unidad: 'L' },
      { id: 'c2', movimiento_diario_id: 'm2', producto_id: 'p1', producto_nombre: 'Insumo sintético', cantidad_utilizada: 2.5, unidad: 'L' },
      { id: 'c3', movimiento_diario_id: 'm2', producto_id: 'p2', producto_nombre: 'Otro insumo', cantidad_utilizada: 75, unidad: 'g' },
      { id: 'c4', movimiento_diario_id: 'outside', producto_id: 'p1', cantidad_utilizada: 99, unidad: 'L' },
    ],
    productos: [{ id: 'p1', nombre: 'Insumo sintético', unidad_medida: 'L' }, { id: 'p2', nombre: 'Otro insumo', unidad_medida: 'g' }],
    lotes: [{ id: 'l1', nombre: 'Lote Uno' }, { id: 'l2', nombre: 'Lote Dos' }],
    aplicaciones_mezclas: [{ id: 'mix', aplicacion_id: 'synthetic-app' }],
    aplicaciones_productos: [{ id: 'recipe', mezcla_id: 'mix', producto_id: 'p1', producto_nombre: 'Insumo sintético',
      dosis_por_caneca: 40, unidad_dosis: 'cc', cantidad_total_necesaria: 9 }],
    aplicaciones_lotes: [], aplicaciones_calculos: [], registros_trabajo: [],
  };
}
function read(db: Record<string, FilaEsco[]>, table: string, query: string) {
  if (!Object.prototype.hasOwnProperty.call(db, table)) throw Error('Unlisted synthetic table');
  const p = new URLSearchParams(query);
  let rows = db[table];
  for (const [key, value] of p) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    const dot = value.indexOf('.'), op = value.slice(0, dot), arg = value.slice(dot + 1);
    rows = rows.filter(r => {
      if (op === 'eq') return String(r[key]) === arg;
      if (op === 'in') return arg.slice(1, -1).split(',').map(v => v.replace(/"/g, '')).includes(String(r[key]));
      if (op === 'gte') return r[key] != null && String(r[key]) >= arg;
      if (op === 'lte') return r[key] != null && String(r[key]) <= arg;
      throw Error('Unlisted synthetic filter');
    });
  }
  const offset = Number(p.get('offset') ?? 0), limit = Number(p.get('limit') ?? 200);
  const columns = p.get('select')?.split(',');
  if (!columns || columns.some(c => !/^[a-z_]+$/.test(c))) throw Error('Unlisted synthetic projection');
  return rows.slice(offset, offset + limit).map(row => Object.fromEntries(columns.map(c => [c, row[c]])));
}
async function run(options: { missing?: boolean; unavailable?: boolean; answer?: string } = {}) {
  const db = fixture(options.missing), bodies: { messages: { role: string; content: string }[] }[] = [];
  const rejected: string[] = [];
  vi.stubGlobal('Deno', { env: { get(key: string) {
    if (key === 'SUPABASE_URL') return 'https://applications-fixture.invalid';
    if (['SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY'].includes(key)) return 'synthetic-placeholder';
    throw Error('Unlisted synthetic environment');
  } } });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init), u = new URL(request.url);
    if (request.method === 'POST' && request.url === 'https://openrouter.ai/api/v1/chat/completions') {
      bodies.push(JSON.parse(await request.text()));
      if (bodies.length > 2) throw Error('Unexpected extra model request');
      return Response.json({ choices: [{ message: bodies.length === 1 ? {
        role: 'assistant', content: null, tool_calls: [{ id: 'synthetic-call', type: 'function', function: {
          name: 'get_aplicaciones_ejecucion', arguments: JSON.stringify(args),
        } }],
      } : { role: 'assistant', content: options.answer ?? 'Control sintético: cantidades registradas disponibles.' } }] });
    }
    if (request.method === 'GET' && u.origin === 'https://applications-fixture.invalid' && u.pathname.startsWith('/rest/v1/')) {
      const table = u.pathname.slice('/rest/v1/'.length);
      if (options.unavailable && table === 'movimientos_diarios_productos') return Response.json({ error: 'synthetic unavailable' }, { status: 503 });
      return Response.json(read(db, table, u.search.slice(1)));
    }
    rejected.push(request.method + ' ' + request.url); throw Error('Unmatched synthetic request');
  });
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2032-04-02T17:00:00Z'));
  const result = await llmToolLoop([{ role: 'system', content: getSystemPrompt() },
    { role: 'user', content: '¿Cómo va la aplicación de plaga Z? Indica el consumo real en el rango solicitado.' }]);
  expect(rejected).toEqual([]); expect(bodies).toHaveLength(2);
  return { result, bodies, evidence: JSON.parse(bodies[1].messages.find(m => m.role === 'tool')!.content) };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('application quantities: evidence versus generation boundary', () => {
  it('delivers exact actual quantities, planned dose and independent units to the model', async () => {
    const { evidence, result } = await run();
    expect(evidence._evidencia).toMatchObject({ consulta_completa: true, detalle_completo: true,
      rango: { desde: args.date_from, hasta: args.date_to } });
    expect(evidence.detalle[0].movimientos.map((m: FilaEsco) => m.id)).toEqual(['m1', 'm2']);
    expect(evidence.detalle[0].movimientos.flatMap((m: { consumos: FilaEsco[] }) => m.consumos)
      .map((c: FilaEsco) => [c.producto_id, c.cantidad_utilizada, c.unidad])).toEqual([
      ['p1', '1.25', 'L'], ['p1', 2.5, 'L'], ['p2', 75, 'g'],
    ]);
    expect(evidence.detalle[0].productos_planeados[0]).toMatchObject({ dosis_por_caneca: 40, unidad_dosis: 'cc', cantidad_total_necesaria: 9 });
    expect(JSON.parse(result.toolInteractions[0].result_summary)).toEqual(evidence);
  });
  it('preserves missing consumption as null instead of inferring a planned or zero quantity', async () => {
    const { evidence } = await run({ missing: true });
    expect(evidence.detalle[0].movimientos[0].consumos[0].cantidad_utilizada).toBeNull();
    expect(evidence.detalle[0].productos_planeados[0].cantidad_total_necesaria).toBe(9);
  });
  it('does not make unavailable consumption into complete evidence', async () => {
    const { evidence, result } = await run({ unavailable: true });
    expect(evidence.error).toBeTruthy();
    expect(evidence._evidencia?.consulta_completa).not.toBe(true);
    expect(result.text).toContain('No pude verificar');
  });
  it('documents the limit: an invented nonempty mocked answer still passes the current final path', async () => {
    const wrong = 'Control deliberadamente erróneo: se consumieron 40 L.';
    const { result, evidence } = await run({ answer: wrong });
    expect(evidence.detalle[0].movimientos[0].consumos[0].cantidad_utilizada).toBe('1.25');
    expect(result.text).toBe(wrong); // This is not a model-quality pass.
  });
  it('confirms long saved context loses raw consumption but requires a fresh query', async () => {
    const db = fixture();
    const evidence = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', args, async (t, q) => read(db, t, q));
    const compact = JSON.parse(resumirContexto(JSON.stringify(evidence), 100));
    expect(compact.contexto_recortado).toBe(true);
    expect(compact._evidencia.consulta_completa).toBe(false);
    expect(compact.detalle).toBeUndefined();
    expect(compact.resumen).not.toHaveProperty('consumos');
    expect(compact.instruccion).toContain('Vuelve a consultar');
  });
  it('carries explicit consumption-versus-plan policy in both generation requests', async () => {
    const { bodies } = await run();
    for (const body of bodies) {
      const system = body.messages.find(m => m.role === 'system')!.content;
      expect(system).toContain('CANTIDADES DE APLICACIONES');
      expect(system).toContain('movimientos[].consumos[].cantidad_utilizada');
      expect(system).toContain('dosis_por_caneca');
      expect(system).toContain('no sustituyen el consumo registrado');
      expect(system).toContain('No sumes unidades distintas');
      expect(system).toContain('no implica cero');
      expect(system).toContain('Si el usuario pide un cálculo teórico');
    }
  });
});
