// QA P4: HTTP real → autorización → loop/parser → cliente RPC controlado.
// No reproduce cadenas de explotación: verifica contratos y fallos de acceso ordinarios.
import { describe, expect, it, vi } from 'vitest';
import { manejar, type ClienteUsuario, type Dependencias } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { RespuestaLLM } from '../utils/esco2/llm.ts';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const WEB = '22222222-2222-4222-8222-222222222222';
const USO = { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 };
const texto = (valor: string): RespuestaLLM => ({ texto: valor, llamadas: [], uso: USO, ms: 1, modelo: 'fixture', finishReason: 'stop' });
const consultar = (sql = 'SELECT 7 AS total'): RespuestaLLM => ({ ...texto(''), finishReason: 'tool_calls', llamadas: [{ nombre: 'consultar_sql', argumentos: JSON.stringify({ sql, proposito: 'Control sintético' }) }] });

type Perfil = { id: string; rol: string; activo: boolean };
function escenario(opciones: { perfil?: Partial<Perfil>; sinPerfil?: boolean; errorPerfil?: boolean; rechazarPerfil?: boolean; env?: Record<string, string | undefined>; respuestas?: RespuestaLLM[]; errorRpc?: { code: string; message: string }; webInvalida?: boolean } = {}) {
  const cola = opciones.respuestas ?? [consultar(), texto(JSON.stringify({ texto: 'Total verificado', sugerencias: ['Ver detalle'] }))];
  const completar = vi.fn(async () => { const r = cola.shift(); if (!r) throw new Error('Fixture de modelo agotada'); return r; });
  const env: Record<string, string | undefined> = { OPENROUTER_API_KEY: 'modelo-fixture', SUPABASE_URL: 'http://local', SUPABASE_ANON_KEY: 'anon-fixture', SUPABASE_SERVICE_ROLE_KEY: 'servicio-fixture', ESCO_TELEGRAM_SECRET: 'secreto-fixture', ...opciones.env };
  function cliente(id: string) {
    const perfil = opciones.sinPerfil ? null : { id, rol: 'Gerencia', activo: true, ...opciones.perfil };
    const resultado = { data: perfil ? [perfil] : [], error: opciones.errorPerfil ? { message: 'lectura no disponible' } : null };
    const eq = vi.fn();
    const cadena = { select: vi.fn(), eq, single: vi.fn(async () => { if (opciones.rechazarPerfil) throw new Error('transporte no disponible'); return { ...resultado, data: perfil }; }), maybeSingle: vi.fn(async () => { if (opciones.rechazarPerfil) throw new Error('transporte no disponible'); return { ...resultado, data: perfil }; }), then: (resolver: (r: typeof resultado) => unknown, rechazar?: (error: unknown) => unknown) => (opciones.rechazarPerfil ? Promise.reject(new Error('transporte no disponible')) : Promise.resolve(resultado)).then(resolver, rechazar) };
    cadena.select.mockReturnValue(cadena); eq.mockReturnValue(cadena);
    const rpc = vi.fn(async (_nombre: string, _args: Record<string, unknown>) => opciones.errorRpc ? { data: null, error: opciones.errorRpc } : { data: { filas: [{ total: 7 }], n_filas: 1, truncado: false }, error: null });
    const from = vi.fn(() => cadena);
    const auth = { getUser: vi.fn(async () => opciones.webInvalida ? { data: { user: null }, error: { message: 'inválida' } } : { data: { user: { id } }, error: null }) };
    return { valor: { from, rpc, auth } as unknown as ClienteUsuario, from, rpc, eq, auth };
  }
  const web = cliente(WEB); const servicio = cliente(ACTOR);
  const crearClienteUsuario = vi.fn(() => web.valor);
  const crearClienteServicio = vi.fn(() => servicio.valor);
  const crearLLM = vi.fn(() => ({ completar }));
  const registrar = vi.fn();
  const deps = { env: (n: string) => env[n], crearClienteUsuario, crearClienteServicio, crearLLM, registrar, ahora: () => new Date('2026-11-09T17:00:00Z') } as unknown as Dependencias;
  const solicitar = (cuerpo: Record<string, unknown>, cabeceras: Record<string, string> = {}) => manejar(new Request('http://local/esco-consultas', { method: 'POST', headers: { 'content-type': 'application/json', ...cabeceras }, body: JSON.stringify(cuerpo) }), deps);
  const body = { motor: 'sql', pregunta: 'Control sintético', usuario_id: ACTOR };
  const headers = { authorization: 'Bearer servicio-fixture', 'x-esco-telegram-secret': 'secreto-fixture' };
  return { web, servicio, completar, crearClienteUsuario, crearClienteServicio, crearLLM, registrar, solicitar, body, headers };
}

async function json(respuesta: Response) { return { estado: respuesta.status, cuerpo: await respuesta.json() as Record<string, unknown> }; }

describe('QA P4 — puerta HTTP de servicio y compatibilidad web', () => {
  it('Given servicio válido y Gerencia activa, When pregunta SQL, Then usa solo la RPC segura de actor y conserva P2', async () => {
    const s = escenario(); const r = await json(await s.solicitar(s.body, s.headers));
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ motor: 'sql', texto: 'Total verificado', respuesta: 'Total verificado', bloques: [], sugerencias: ['Ver detalle'] });
    expect(s.servicio.rpc).toHaveBeenCalledOnce();
    expect(s.servicio.rpc.mock.calls[0][0]).toBe('esco_sql_consultar_actor_v1');
    const args = s.servicio.rpc.mock.calls[0][1];
    expect(args.p_usuario).toBe(ACTOR);
    expect(args.p_consulta).toMatchObject({ version: 1 });
    expect(args).not.toHaveProperty('p_sql');
    expect(JSON.stringify(args)).not.toContain('SELECT 7 AS total');
    expect(s.servicio.eq).toHaveBeenCalledWith('id', ACTOR);
    expect(s.crearClienteUsuario).not.toHaveBeenCalled();
    expect(JSON.stringify(r.cuerpo.consultas)).not.toContain('filas_muestra');
    expect(JSON.stringify(s.registrar.mock.calls)).not.toContain('secreto-fixture');
  });

  it.each(['ESCO_TELEGRAM_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'])('Given configuración %s ausente, When servicio llama, Then 503 antes de perfil o modelo', async (nombre) => {
    const s = escenario({ env: { [nombre]: undefined } });
    const r = await json(await s.solicitar(s.body, s.headers));
    expect(r.estado).toBe(503);
    expect(s.servicio.from).not.toHaveBeenCalled(); expect(s.crearLLM).not.toHaveBeenCalled(); expect(s.servicio.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { authorization: 'Bearer equivocado', 'x-esco-telegram-secret': 'secreto-fixture' },
    { authorization: 'Bearer servicio-fixture', 'x-esco-telegram-secret': 'equivocado' },
    { authorization: 'Bearer servicio-fixture' },
    { 'x-esco-telegram-secret': 'secreto-fixture' },
  ])('Given credencial o secreto incorrecto, When servicio llama, Then 401 y cero consultas', async (cabeceras) => {
    const s = escenario(); const r = await json(await s.solicitar(s.body, cabeceras as Record<string, string>));
    expect(r.estado).toBe(401); expect(s.crearLLM).not.toHaveBeenCalled(); expect(s.servicio.rpc).not.toHaveBeenCalled();
  });

  it.each([{ rol: 'Administrador' }, { activo: false }])('Given actor sin autorización, When servicio llama, Then 403 antes del modelo', async (perfil) => {
    const s = escenario({ perfil }); const r = await json(await s.solicitar(s.body, s.headers));
    expect(r.estado).toBe(403); expect(s.crearLLM).not.toHaveBeenCalled(); expect(s.servicio.rpc).not.toHaveBeenCalled();
  });

  it.each([{ sinPerfil: true }, { errorPerfil: true }])('Given perfil no verificable, When servicio llama, Then falla cerrado', async (opciones) => {
    const s = escenario(opciones); const r = await json(await s.solicitar(s.body, s.headers));
    expect(r.estado).toBe(403); expect(s.crearLLM).not.toHaveBeenCalled(); expect(s.servicio.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { motor: 'sql', pregunta: 'Control sintético' },
    { motor: 'sql', pregunta: 'Control sintético', usuario_id: 'id-no-válido' },
    { motor: 'actual', pregunta: 'Control sintético', usuario_id: ACTOR },
  ])('Given cuerpo de servicio inválido, When llama, Then 400 y no usa motor legacy', async (body) => {
    const s = escenario(); const r = await json(await s.solicitar(body, s.headers));
    expect(r.estado).toBe(400); expect(s.crearLLM).not.toHaveBeenCalled(); expect(s.servicio.rpc).not.toHaveBeenCalled();
  });

  it('Given web autenticada, When pregunta SQL, Then conserva JWT de usuario y usa la RPC segura web', async () => {
    const s = escenario(); const r = await json(await s.solicitar({ pregunta: 'Control sintético', motor: 'sql' }, { authorization: 'Bearer usuario-fixture' }));
    expect(r.estado).toBe(200); expect(s.web.rpc).toHaveBeenCalledOnce();
    expect(s.web.rpc.mock.calls[0][0]).toBe('esco_sql_consultar_v1');
    expect(s.web.rpc.mock.calls[0][1]).toHaveProperty('p_consulta');
    expect(s.web.rpc.mock.calls[0][1]).not.toHaveProperty('p_sql');
    expect(s.crearClienteServicio).not.toHaveBeenCalled();
  });

  it('Given web con usuario_id elegido en cuerpo, When llama, Then lo rechaza antes de RPC', async () => {
    const s = escenario(); const r = await json(await s.solicitar(s.body, { authorization: 'Bearer usuario-fixture' }));
    expect(r.estado).toBe(400); expect(s.web.rpc).not.toHaveBeenCalled(); expect(s.servicio.rpc).not.toHaveBeenCalled();
  });

  it.each(['web', 'servicio'])('Given pérdida de permiso en base para %s, When RPC rechaza42501, Then403 sin otro turno de modelo', async (canal) => {
    const s = escenario({ errorRpc: { code: '42501', message: 'acceso no permitido' } });
    const r = await json(await s.solicitar(canal === 'servicio' ? s.body : { pregunta: 'Control sintético', motor: 'sql' }, canal === 'servicio' ? s.headers : { authorization: 'Bearer usuario-fixture' }));
    expect(r.estado).toBe(403); expect(s.completar).toHaveBeenCalledTimes(1);
    expect((canal === 'servicio' ? s.servicio : s.web).rpc).toHaveBeenCalledTimes(1);
  });

  it('Given transporte de perfil no disponible, When servicio llama, Then responde falloHTTP sin consultar ni mostrar excepción', async () => {
    const s = escenario({ rechazarPerfil: true });
    const respuesta = await s.solicitar(s.body, s.headers);
    expect(respuesta.status).toBeGreaterThanOrEqual(400); expect(respuesta.status).toBeLessThan(600);
    expect(s.crearLLM).not.toHaveBeenCalled(); expect(s.servicio.rpc).not.toHaveBeenCalled();
    expect(await respuesta.text()).not.toContain('transporte no disponible');
  });

  it('Given SQL fuera de catálogo seguido de reformulación válida, When loop real, Then conserva índices y no envía el primer intento a RPC', async () => {
    const visual: RespuestaLLM = { ...texto(''), finishReason: 'tool_calls', llamadas: [{ nombre: 'mostrar_visual', argumentos: JSON.stringify({ tipo: 'tarjeta', consulta: 2, items: [{ columna: 'total', etiqueta: 'Total', formato: 'numero' }] }) }] };
    const s = escenario({ respuestas: [consultar('SELECT total FROM vista_no_registrada'), consultar(), visual, texto('Dato disponible')] });
    const r = await json(await s.solicitar({ pregunta: 'Control sintético', motor: 'sql' }, { authorization: 'Bearer usuario-fixture' }));
    expect(r.estado).toBe(200); expect(s.web.rpc).toHaveBeenCalledTimes(1);
    const consultas = r.cuerpo.consultas as { n_filas: number | null; error: string | null }[];
    expect(consultas).toHaveLength(2); expect(consultas[0]).toMatchObject({ n_filas: null, error: 'relacion_no_admitida' });
    expect(consultas[1]).toMatchObject({ n_filas: 1, error: null });
    expect(r.cuerpo.bloques).toMatchObject([{ tipo: 'tarjeta', consulta: 2, items: [{ valor: 7 }] }]);
    expect(JSON.stringify(s.registrar.mock.calls)).not.toContain('vista_no_registrada');
  });

  it('Given cuatro consultas no admitidas juntas, When loop real, Then consume cuatro intentos y ninguna RPC', async () => {
    const cuatro: RespuestaLLM = { ...texto(''), finishReason: 'tool_calls', llamadas: Array.from({ length: 4 }, () => consultar('SELECT total FROM vista_no_registrada').llamadas[0]) };
    const s = escenario({ respuestas: [cuatro, texto('No pude consultar ese alcance')] });
    const r = await json(await s.solicitar({ pregunta: 'Control sintético', motor: 'sql' }, { authorization: 'Bearer usuario-fixture' }));
    expect(r.estado).toBe(200); expect(s.web.rpc).not.toHaveBeenCalled(); expect(s.completar).toHaveBeenCalledTimes(2);
    const consultas = r.cuerpo.consultas as { error: string | null }[];
    expect(consultas).toHaveLength(4); expect(consultas.every((c) => c.error === 'relacion_no_admitida')).toBe(true);
  });

  it('Given RPC segura ausente, When pregunta SQL web, Then 503 sin fallback a la RPC anterior', async () => {
    const s = escenario({ errorRpc: { code: 'PGRST202', message: 'rpc no disponible' } });
    const r = await json(await s.solicitar({ pregunta: 'Control sintético', motor: 'sql' }, { authorization: 'Bearer usuario-fixture' }));
    expect(r.estado).toBe(503); expect(s.web.rpc).toHaveBeenCalledTimes(1);
    expect(s.web.rpc.mock.calls[0][0]).toBe('esco_sql_consultar_v1');
  });
});
