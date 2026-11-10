// esco-consultas con `motor: 'sql'`: misma puerta de acceso, mismo cliente con el JWT del usuario.
import { describe, expect, it, vi } from 'vitest';
import { manejar, validarSolicitud, type ClienteUsuario, type Dependencias } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { ClienteLLM, RespuestaLLM } from '../utils/esco2/llm.ts';

const USO = { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 };
const USUARIO = '11111111-1111-4111-8111-111111111111';

function modelo(...rs: RespuestaLLM[]): ClienteLLM {
  const cola = [...rs];
  return { completar: async () => { const r = cola.shift(); if (!r) throw new Error('sin respuestas'); return r; } };
}
const consulta = (sql: string): RespuestaLLM => ({ texto: '', llamadas: [{ nombre: 'consultar_sql', argumentos: JSON.stringify({ sql, proposito: 'p' }) }], uso: USO, ms: 1, modelo: 'm', finishReason: 'tool_calls' });
const texto = (t: string): RespuestaLLM => ({ texto: t, llamadas: [], uso: USO, ms: 1, modelo: 'm', finishReason: 'stop' });

type Rpc = (nombre: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

function cliente(rol: string, rpc?: Rpc): ClienteUsuario {
  const perfil = { data: [{ id: USUARIO, rol, activo: true }], error: null };
  const c = {
    auth: { getUser: async () => ({ data: { user: { id: USUARIO } }, error: null }) },
    from: () => ({ select: () => ({ eq: async () => perfil }) }),
    ...(rpc ? { rpc } : {}),
  };
  return c as unknown as ClienteUsuario;
}

function peticion(cuerpo: unknown): Request {
  return new Request('http://local/esco-consultas', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer x.y.z' }, body: JSON.stringify(cuerpo) });
}
function deps(c: ClienteUsuario, llm: ClienteLLM): Dependencias {
  const env: Record<string, string> = { OPENROUTER_API_KEY: 'k', SUPABASE_URL: 'http://local', SUPABASE_ANON_KEY: 'a' };
  return { env: (n) => env[n], crearClienteUsuario: () => c, crearLLM: () => llm, ahora: () => new Date('2026-11-09T03:00:00Z') };
}

describe('esco-consultas — motor sql', () => {
  it('el cuerpo acepta motor "sql" y rechaza otros valores', () => {
    expect(validarSolicitud({ pregunta: 'x', motor: 'sql' }).motor).toBe('sql');
    expect(() => validarSolicitud({ pregunta: 'x', motor: 'otro' })).toThrow(/motor/);
  });

  it('Gerencia: consulta por la RPC con el cliente del usuario y devuelve respuesta y consultas', async () => {
    const rpc = vi.fn<Rpc>(async () => ({ data: { filas: [{ j: 12.5 }], n_filas: 1, truncado: false }, error: null }));
    const res = await manejar(peticion({ pregunta: '¿Jornales?', motor: 'sql' }), deps(cliente('Gerencia', rpc), modelo(consulta('select sum(jornales) j from v_esco_jornales'), texto('12,5 jornales.'))));
    expect(res.status).toBe(200);
    const c = await res.json();
    expect(c).toMatchObject({ motor: 'sql', respuesta: '12,5 jornales.', hoy: '2026-11-08' });
    expect(c.consultas).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith('esco_sql_consultar_v1', { p_consulta: expect.objectContaining({ version: 1, query: expect.objectContaining({ body: expect.objectContaining({ columns: [expect.objectContaining({ alias: 'j', expr: expect.objectContaining({ kind: 'aggregate', fn: 'sum' }) })] }) }) }) });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_sql');
  });

  it('un rol que no es Gerencia recibe 403 y no se llama ni al modelo ni a la RPC', async () => {
    const rpc = vi.fn<Rpc>();
    const llm: ClienteLLM = { completar: vi.fn() };
    const res = await manejar(peticion({ pregunta: 'x', motor: 'sql' }), deps(cliente('Administrador', rpc), llm));
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    expect(llm.completar).not.toHaveBeenCalled();
  });

  it('si la base rechaza con 42501, responde 403', async () => {
    const rpc: Rpc = async () => ({ data: null, error: { code: '42501', message: 'solo Gerencia' } });
    const res = await manejar(peticion({ pregunta: 'x', motor: 'sql' }), deps(cliente('Gerencia', rpc), modelo(consulta('select 1'))));
    expect(res.status).toBe(403);
  });

  it('sin la migración 194 (PGRST202) responde 503 con un mensaje claro', async () => {
    const rpc: Rpc = async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    const res = await manejar(peticion({ pregunta: 'x', motor: 'sql' }), deps(cliente('Gerencia', rpc), modelo(consulta('select 1'))));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('194');
  });

  it('un error de Postgres de la consulta vuelve al modelo y se registra en consultas', async () => {
    const rpc = vi
      .fn<Rpc>()
      .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column "x" does not exist' } })
      .mockResolvedValueOnce({ data: { filas: [{ n: 3 }], n_filas: 1, truncado: false }, error: null });
    const res = await manejar(peticion({ pregunta: 'x', motor: 'sql' }), deps(cliente('Gerencia', rpc), modelo(consulta('select 1 AS x'), consulta('select 3 n'), texto('Son 3.'))));
    const c = await res.json();
    expect(c.consultas.map((q: { error: string | null }) => q.error)).toEqual(['column "x" does not exist', null]);
  });

  it('sin motor, el comportamiento actual no cambia (no usa la RPC)', async () => {
    const rpc = vi.fn<Rpc>();
    const llm: ClienteLLM = { completar: vi.fn(async () => { throw new Error('el motor actual llamó al modelo'); }) };
    const res = await manejar(peticion({ pregunta: 'jornales de ayer' }), deps(cliente('Gerencia', rpc), llm));
    expect(rpc).not.toHaveBeenCalled();
    expect(res.status).not.toBe(503);
  });
});
