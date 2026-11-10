// QA P3: cliente real → Request/handler SSE real → loop/bloques → persistencia controlada.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { manejar, type ClienteUsuario } from '../../supabase/functions/esco-consultas/manejador.ts';
import { enviarMensajeSql } from '../utils/escoSqlChatService';
import { leerMetadataSql } from '../utils/escoSqlChat';
import { getSupabase } from '../utils/supabase/client';
import type { ChatMessage } from '../types/chat';
import type { RespuestaLLM } from '../utils/esco2/llm';
vi.mock('../utils/supabase/client', () => ({ getSupabase: vi.fn() }));

const USUARIO = '11111111-1111-4111-8111-111111111111';
const CONVERSACION = '22222222-2222-4222-8222-222222222222';
const USO = { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 };
function modelo(texto: string, llamadas: RespuestaLLM['llamadas'] = []): RespuestaLLM { return { texto, llamadas, uso: USO, ms: 1, modelo: 'sintetico', finishReason: llamadas.length ? 'tool_calls' : 'stop' }; }

function escenario(opciones: { ajena?: boolean; errorGuardar?: boolean } = {}) {
  const guardados: Record<string, unknown>[] = [];
  const insertarConversacion = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: CONVERSACION }, error: null }) }) }));
  const insertMensajes = vi.fn(async (filas: Record<string, unknown>[]) => { if (!opciones.errorGuardar) guardados.push(...structuredClone(filas)); return { error: opciones.errorGuardar ? { message: 'error-sintetico' } : null }; });
  const eqs: unknown[][] = [];
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-sintetico', user: { id: USUARIO } } } }) },
    from: (tabla: string) => {
      if (tabla === 'chat_messages') {
        const historia = { eq: () => historia, in: () => historia, order: () => historia, limit: async () => ({ data: [], error: null }) };
        return { insert: insertMensajes, select: () => historia };
      }
      if (tabla !== 'chat_conversations') throw new Error(`Tabla inesperada ${tabla}`);
      const cadena = { eq: (columna: string, valor: unknown) => { eqs.push([columna, valor]); return cadena; }, maybeSingle: async () => ({ data: opciones.ajena ? null : { id: CONVERSACION }, error: null }) };
      return { insert: insertarConversacion, select: () => cadena };
    },
  };
  vi.mocked(getSupabase).mockReturnValue(cliente as unknown as ReturnType<typeof getSupabase>);
  const respuestas = [
    modelo('', [{ nombre: 'consultar_sql', argumentos: JSON.stringify({ sql: 'SELECT nombre AS serie, valor AS total FROM v_esco_gastos', proposito: 'Serie sintética' }) }]),
    modelo('', [{ nombre: 'mostrar_visual', argumentos: JSON.stringify({ tipo: 'tabla', consulta: 1, titulo: 'Detalle sintético', columnas: [{ columna: 'serie', etiqueta: 'Serie', formato: 'texto' }, { columna: 'total', etiqueta: 'Total', formato: 'numero' }] }) }]),
    modelo(JSON.stringify({ texto: 'Detalle verificado', sugerencias: ['Ver tendencia'] })),
  ];
  const rpc = vi.fn(async () => ({ data: { filas: [{ serie: 'A', total: 1.25, columna_interna: 'no-publicar' }, { serie: 'B', total: null, columna_interna: 'no-publicar' }], n_filas: 2, truncado: false }, error: null }));
  const servidor = { auth: { getUser: async () => ({ data: { user: { id: USUARIO } }, error: null }) }, from: () => ({ select: () => ({ eq: async () => ({ data: [{ id: USUARIO, rol: 'Gerencia', activo: true }], error: null }) }) }), rpc } as unknown as ClienteUsuario;
  const fetchReal = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => manejar(new Request(input, init), {
    env: (n) => ({ OPENROUTER_API_KEY: 'sintetico', SUPABASE_URL: 'http://local', SUPABASE_ANON_KEY: 'sintetico' } as Record<string, string>)[n],
    crearClienteUsuario: () => servidor,
    crearLLM: () => ({ completar: async () => { const r = respuestas.shift(); if (!r) throw new Error('Fixture agotada'); return r; } }),
    ahora: () => new Date('2026-11-08T17:00:00Z'),
  }));
  vi.stubGlobal('fetch', fetchReal);
  return { guardados, insertarConversacion, insertMensajes, eqs, fetchReal, rpc };
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('QA P3 — recorrido cliente, SSE y snapshot', () => {
  it('guarda un turno y rehidrata exactamente el bloque recibido sin filas crudas en consultas', async () => {
    const s = escenario();
    const eventos: string[] = [];
    const r = await enviarMensajeSql(null, 'Serie sintética', [], (e) => eventos.push(e.type));
    expect(r.conversationId).toBe(CONVERSACION);
    expect(eventos.at(-1)).toBe('done');
    expect(s.insertarConversacion).toHaveBeenCalledWith({ user_id: USUARIO, title: 'Serie sintética' });
    expect(s.guardados.map((f) => f.role)).toEqual(['user', 'assistant']);
    const meta = leerMetadataSql(s.guardados[1].metadata)!;
    expect(meta.snapshot_at).not.toBe('');
    expect(meta.bloques).toEqual([{ tipo: 'tabla', consulta: 1, titulo: 'Detalle sintético', truncado: false, columnas: [{ columna: 'serie', etiqueta: 'Serie', formato: 'texto' }, { columna: 'total', etiqueta: 'Total', formato: 'numero' }], filas: [{ serie: 'A', total: 1.25 }, { serie: 'B', total: null }], total_filas: 2 }]);
    expect(JSON.stringify(meta.consultas)).not.toContain('filas_muestra');
    expect(JSON.stringify(meta)).not.toContain('columna_interna');
    expect(s.rpc).toHaveBeenCalledOnce();
    expect(leerMetadataSql(structuredClone(meta))!.bloques).toEqual(meta.bloques);
    expect(s.rpc).toHaveBeenCalledOnce();
  });

  it('continúa una conversación previa sin heredar mensajes legacy de la memoria local', async () => {
    const s = escenario();
    const previo: ChatMessage = { id: 'previo', conversation_id: CONVERSACION, role: 'assistant', content: 'a'.repeat(5000), metadata: {}, created_at: '2026-11-08T17:00:00Z' };
    const r = await enviarMensajeSql(CONVERSACION, 'Seguimiento sintético', [previo], () => {});
    expect(r.conversationId).toBe(CONVERSACION);
    expect(s.insertarConversacion).not.toHaveBeenCalled();
    expect(s.eqs).toContainEqual(['user_id', USUARIO]);
    const cuerpo = JSON.parse(String(s.fetchReal.mock.calls[0][1]?.body));
    expect(cuerpo.historial).toEqual([]);
    expect(s.guardados).toHaveLength(2);
  });

  it('rechaza una conversación ajena antes de enviar preguntas al motor o escribir mensajes', async () => {
    const s = escenario({ ajena: true });
    await expect(enviarMensajeSql(CONVERSACION, 'Consulta sintética', [], () => {})).rejects.toThrow(/conversación/);
    expect(s.fetchReal).not.toHaveBeenCalled();
    expect(s.insertMensajes).not.toHaveBeenCalled();
  });

  it('no reporta turno guardado cuando la escritura falla después del done del motor', async () => {
    const s = escenario({ errorGuardar: true });
    await expect(enviarMensajeSql(CONVERSACION, 'Consulta sintética', [], () => {})).rejects.toThrow(/guardar/);
    expect(s.guardados).toHaveLength(0);
    expect(s.rpc).toHaveBeenCalledOnce();
  });
});
