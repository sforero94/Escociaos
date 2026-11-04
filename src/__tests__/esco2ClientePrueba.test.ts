import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENDPOINT_PRUEBA_ESCO2, ejecutarPruebaEsco2, cerrarSesionPruebaEsco2 } from '../utils/esco2ClientePrueba';

// Auth and HTTP boundary integration. Every identity, token and response is synthetic.
const auth = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn() }));
vi.mock('../utils/supabase/client', () => ({
  getSupabase: () => ({ auth }),
}));

const TOKEN = 'synthetic-current-user-token';
const USER = 'synthetic-user-a';
const endpoint = 'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/esco-consultas';
const validBody = { respuesta: 'Resultado sintético.', origen: 'determinista', hoy: '2026-11-04', ruta: null, ajustes: [], plan: null, resultados: [], llamadas: [], ms: 1 };
let http: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  http = vi.fn().mockResolvedValue(new Response(JSON.stringify(validBody), { status: 200 }));
  vi.stubGlobal('fetch', http);
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: USER }, access_token: TOKEN } }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

describe('local Esco 2.0 account switch', () => {
  it('signs out only this client session without revoking the user\'s other sessions', async () => {
    await expect(cerrarSesionPruebaEsco2()).resolves.toBeUndefined();
    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
    expect(http).not.toHaveBeenCalled();
  });

  it.each(['returned', 'thrown'])('reports a sanitized failure for an auth error (%s)', async (kind) => {
    const diagnostic = new Error(`synthetic auth diagnostic ${TOKEN}`);
    if (kind === 'returned') auth.signOut.mockResolvedValue({ error: diagnostic });
    else auth.signOut.mockRejectedValue(diagnostic);
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    await expect(cerrarSesionPruebaEsco2()).rejects.not.toThrow(TOKEN);
    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
    expect(http).not.toHaveBeenCalled();
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('local Esco 2.0 access check: authenticated HTTP boundary', () => {
  it('sends one explicit POST to the new function with current JWT and only the question contract', async () => {
    expect(ENDPOINT_PRUEBA_ESCO2).toBe(endpoint);
    const result = await ejecutarPruebaEsco2('  Pregunta sintética  ', USER);
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(http).toHaveBeenCalledTimes(1);
    const [url, init] = http.mock.calls[0];
    expect(url).toBe(endpoint);
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('content-type')).toContain('application/json');
    expect(headers.get('apikey')).toBeTruthy();
    expect(headers.get('apikey')).not.toBe(TOKEN);
    expect(JSON.parse(init.body)).toEqual({ pregunta: 'Pregunta sintética', historial: [] });
    expect(init.body).not.toContain(TOKEN);
    expect(result).toMatchObject({ http: 200, valida: true, respuesta: validBody.respuesta });
  });

  it('reads the refreshed session for each manual attempt instead of retaining the old JWT', async () => {
    await ejecutarPruebaEsco2('Primera', USER);
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: USER }, access_token: 'synthetic-refreshed-token' } }, error: null });
    await ejecutarPruebaEsco2('Segunda', USER);
    expect(new Headers(http.mock.calls[1][1].headers).get('authorization')).toBe('Bearer synthetic-refreshed-token');
  });

  it.each([
    ['no session', null],
    ['missing token', { user: { id: USER }, access_token: '' }],
    ['different current user', { user: { id: 'synthetic-user-b' }, access_token: TOKEN }],
  ])('does not send a request with %s', async (_reason, session) => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    await expect(ejecutarPruebaEsco2('Pregunta', USER)).rejects.toThrow();
    expect(http).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('does not send an empty question', async (question) => {
    await expect(ejecutarPruebaEsco2(question, USER)).rejects.toThrow();
    expect(http).not.toHaveBeenCalled();
  });

  it('preserves an actual HTTP 403 and does not retry or fall back to legacy chat', async () => {
    http.mockResolvedValue(new Response(JSON.stringify({ error: 'Esco 2.0 está disponible solo para gerencia' }), { status: 403 }));
    const result = await ejecutarPruebaEsco2('Pregunta', USER);
    expect(result).toMatchObject({ http: 403, valida: false, error: 'Esco 2.0 está disponible solo para gerencia' });
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0][0]).toBe(endpoint);
  });

  it.each([{}, { respuesta: '' }, { respuesta: '   ' }, { error: 'error en un 200' }])('does not call an invalid HTTP 200 body a successful response (%j)', async (body) => {
    http.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    expect(await ejecutarPruebaEsco2('Pregunta', USER)).toMatchObject({ http: 200, valida: false });
  });

  it('requires the structured response contract, not merely text accompanied by HTTP 200', async () => {
    http.mockResolvedValue(new Response(JSON.stringify({ respuesta: 'Texto sin contrato' }), { status: 200 }));
    expect(await ejecutarPruebaEsco2('Pregunta', USER)).toMatchObject({ http: 200, valida: false });
  });

  it('keeps HTTP 200 distinct from a successful domain result', async () => {
    http.mockResolvedValue(new Response(JSON.stringify({ ...validBody, origen: 'error_datos', respuesta: 'No se pudo leer el catálogo.' }), { status: 200 }));
    expect(await ejecutarPruebaEsco2('Pregunta', USER)).toMatchObject({ http: 200, valida: false, respuesta: 'No se pudo leer el catálogo.' });
  });

  it('fails closed when getSession resolves an auth error alongside a token', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: USER }, access_token: TOKEN } }, error: new Error('synthetic-auth-error') });
    await expect(ejecutarPruebaEsco2('Pregunta', USER)).rejects.toThrow();
    expect(http).not.toHaveBeenCalled();
  });

  it('forwards cancellation so leaving the screen can stop an in-flight request', async () => {
    const controller = new AbortController();
    await ejecutarPruebaEsco2('Pregunta', USER, controller.signal);
    expect(http.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('does not dispatch after the screen cancels while session lookup is pending', async () => {
    let release!: (value: unknown) => void;
    auth.getSession.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const controller = new AbortController();
    const request = ejecutarPruebaEsco2('Pregunta', USER, controller.signal);
    controller.abort();
    release({ data: { session: { user: { id: USER }, access_token: TOKEN } }, error: null });
    await expect(request).rejects.toThrow();
    expect(http).not.toHaveBeenCalled();
  });

  it('redacts the session token if an upstream error accidentally echoes it', async () => {
    http.mockResolvedValue(new Response(JSON.stringify({ error: `diagnostic ${TOKEN}` }), { status: 401 }));
    const result = await ejecutarPruebaEsco2('Pregunta', USER);
    expect(result.http).toBe(401);
    expect(result.valida).toBe(false);
    expect(result.error).not.toContain(TOKEN);
  });

  it('retains the real HTTP status when the server returns non-JSON', async () => {
    http.mockResolvedValue(new Response('<html>Unavailable</html>', { status: 502 }));
    expect(await ejecutarPruebaEsco2('Pregunta', USER)).toMatchObject({ http: 502, valida: false });
    expect(http).toHaveBeenCalledTimes(1);
  });

  it('does not expose or log auth and network exception text that may contain credentials', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    auth.getSession.mockRejectedValueOnce(new Error(`auth diagnostic ${TOKEN}`));
    await expect(ejecutarPruebaEsco2('Pregunta', USER)).rejects.not.toThrow(TOKEN);
    expect(http).not.toHaveBeenCalled();
    http.mockRejectedValueOnce(new Error(`request diagnostic ${TOKEN}`));
    await expect(ejecutarPruebaEsco2('Pregunta', USER)).rejects.not.toThrow(TOKEN);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});
