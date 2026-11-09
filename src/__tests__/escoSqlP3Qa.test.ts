// QA independiente P3: HTTP real → SQL loop → SSE, dependencias externas controladas.
import { describe, expect, it, vi } from 'vitest';
import { manejar, type ClienteUsuario, type Dependencias } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { ClienteLLM, RespuestaLLM } from '../utils/esco2/llm.ts';

const ID = '11111111-1111-4111-8111-111111111111';
const USO = { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 };
const texto = (t: string): RespuestaLLM => ({ texto: t, llamadas: [], uso: USO, ms: 1, modelo: 'sintetico', finishReason: 'stop' });
const consulta = (): RespuestaLLM => ({ ...texto(''), finishReason: 'tool_calls', llamadas: [{ nombre: 'consultar_sql', argumentos: JSON.stringify({ sql: 'select 7 total', proposito: 'Comprobar total sintético' }) }] });

function escenario(opciones: { rol?: string; activo?: boolean; invalido?: boolean; llm?: ClienteLLM } = {}) {
  const respuestas = [consulta(), texto(JSON.stringify({ texto: 'Total verificado', sugerencias: ['Ver detalle'] }))];
  const completar = vi.fn(async () => { const r = respuestas.shift(); if (!r) throw new Error('Fixture LLM agotada'); return r; });
  const rpc = vi.fn(async () => ({ data: { filas: [{ total: 7, sin_seleccionar: 'omitir' }], n_filas: 1, truncado: false }, error: null }));
  const cliente = {
    rpc,
    auth: { getUser: vi.fn(async () => opciones.invalido ? ({ data: { user: null }, error: 'invalido' }) : ({ data: { user: { id: ID } }, error: null })) },
    from: vi.fn(() => ({ select: () => ({ eq: async () => ({ data: [{ id: ID, rol: opciones.rol ?? 'Gerencia', activo: opciones.activo ?? true }], error: null }) }) })),
  } as unknown as ClienteUsuario;
  const deps: Dependencias = {
    env: (n) => ({ OPENROUTER_API_KEY: 'sintetico', SUPABASE_URL: 'http://local', SUPABASE_ANON_KEY: 'sintetico' } as Record<string, string>)[n],
    crearClienteUsuario: () => cliente,
    crearLLM: () => opciones.llm ?? { completar }, ahora: () => new Date('2026-11-08T17:00:00Z'),
  };
  return { rpc, completar, cliente, ejecutar: (accept = 'text/event-stream', authorization: string | null = 'Bearer sintetico', signal?: AbortSignal) => {
    const headers = new Headers({ 'content-type': 'application/json', accept });
    if (authorization) headers.set('authorization', authorization);
    return manejar(new Request('http://local/esco-consultas', { method: 'POST', headers, signal, body: JSON.stringify({ pregunta: 'Consulta sintética', motor: 'sql' }) }), deps);
  } };
}

async function eventos(res: Response): Promise<Record<string, unknown>[]> {
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const bruto = await res.text();
  return bruto.split(/\r?\n\r?\n/).filter(Boolean).map((b) => JSON.parse(b.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n')));
}

describe('QA P3 — contrato HTTP SSE', () => {
  it('emite consulta pareada y contrato final en orden sin filas en consultas', async () => {
    const s = escenario();
    const es = await eventos(await s.ejecutar());
    expect(es.map((e) => e.type)).toEqual(['consulta_inicio', 'consulta_fin', 'texto', 'bloques', 'sugerencias', 'done']);
    expect(es[0]).toMatchObject({ proposito: 'Comprobar total sintético' });
    expect(es[1]).toMatchObject({ ok: true, n_filas: 1, ms: expect.any(Number) });
    expect(es[2]).toMatchObject({ texto: 'Total verificado' });
    expect(es[4]).toMatchObject({ sugerencias: ['Ver detalle'] });
    const final = es[5].resultado as Record<string, unknown>;
    expect(final).toMatchObject({ motor: 'sql', texto: 'Total verificado', respuesta: 'Total verificado' });
    expect(final.consultas).toHaveLength(1);
    expect(JSON.stringify(es)).not.toContain('sin_seleccionar');
    expect(JSON.stringify(es)).not.toContain('filas_muestra');
    expect(s.rpc).toHaveBeenCalledOnce();
  });

  it('entrega consulta_inicio antes de que termine la RPC', async () => {
    const s = escenario();
    let resolver!: (valor: Awaited<ReturnType<typeof s.rpc>>) => void;
    const pendiente = new Promise<Awaited<ReturnType<typeof s.rpc>>>((r) => { resolver = r; });
    s.rpc.mockReturnValueOnce(pendiente);
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      const r = await Promise.race([s.ejecutar(), new Promise<null>((resolve) => { temporizador = setTimeout(() => resolve(null), 1000); })]);
      expect(r, 'El manejador no debe esperar a la consulta para abrir SSE').not.toBeNull();
      const reader = r!.body!.getReader();
      const primero = await reader.read();
      expect(new TextDecoder().decode(primero.value)).toContain('consulta_inicio');
      resolver({ data: { filas: [], n_filas: 0, truncado: false }, error: null });
      while (!(await reader.read()).done) { /* vaciar stream */ }
    } finally {
      if (temporizador) clearTimeout(temporizador);
      resolver({ data: { filas: [], n_filas: 0, truncado: false }, error: null });
    }
  });

  it('detener durante la RPC cierra el stream sin done y no inicia otra llamada al modelo', async () => {
    const s = escenario();
    let resolver!: (valor: Awaited<ReturnType<typeof s.rpc>>) => void;
    const pendiente = new Promise<Awaited<ReturnType<typeof s.rpc>>>((r) => { resolver = r; });
    s.rpc.mockReturnValueOnce(pendiente);
    const controller = new AbortController();
    const r = await s.ejecutar('text/event-stream', 'Bearer sintetico', controller.signal);
    const reader = r.body!.getReader();
    const primero = await reader.read();
    expect(new TextDecoder().decode(primero.value)).toContain('consulta_inicio');
    controller.abort();
    resolver({ data: { filas: [], n_filas: 0, truncado: false }, error: null });
    let restante = '';
    while (true) {
      const parte = await reader.read();
      if (parte.done) break;
      restante += new TextDecoder().decode(parte.value);
    }
    expect(restante).not.toContain('done');
    expect(s.completar).toHaveBeenCalledOnce();
    expect(s.rpc).toHaveBeenCalledOnce();
  });

  it('mantiene JSON para los clientes que no solicitan SSE', async () => {
    const r = await escenario().ejecutar('application/json');
    expect(r.headers.get('content-type')).toContain('application/json');
    expect(await r.json()).toMatchObject({ motor: 'sql', respuesta: 'Total verificado', texto: 'Total verificado' });
  });

  it.each([
    ['sin token', {}, null, 401],
    ['token inválido', { invalido: true }, 'Bearer sintetico', 401],
    ['Administrador', { rol: 'Administrador' }, 'Bearer sintetico', 403],
    ['Gerencia inactiva', { activo: false }, 'Bearer sintetico', 403],
  ])('rechaza %s antes de abrir el stream o llamar SQL/LLM', async (_n, opciones, token, estado) => {
    const s = escenario(opciones);
    const r = await s.ejecutar('text/event-stream', token);
    expect(r.status).toBe(estado);
    expect(r.headers.get('content-type')).not.toContain('text/event-stream');
    expect(s.rpc).not.toHaveBeenCalled();
    expect(s.completar).not.toHaveBeenCalled();
  });

  it('cierra un fallo del proveedor con error sin done exitoso ni mensaje privado', async () => {
    const llm: ClienteLLM = { completar: vi.fn(async () => { throw new Error('proveedor-traza-privada'); }) };
    const s = escenario({ llm });
    const es = await eventos(await s.ejecutar());
    expect(es.map((e) => e.type)).toEqual(['error']);
    expect(JSON.stringify(es)).not.toContain('proveedor-traza-privada');
    expect(s.rpc).not.toHaveBeenCalled();
  });
});
