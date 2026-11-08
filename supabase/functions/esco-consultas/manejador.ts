import { fuenteLecheSupabase } from '../../../src/utils/esco2/lecheFuente.ts';
import { fuenteClimaSupabase } from '../../../src/utils/esco2/climaFuente.ts';
import { fuenteHatoSupabase } from '../../../src/utils/esco2/hatoFuente.ts';
import { fuenteConductividadSupabase } from '../../../src/utils/esco2/conductividadFuente.ts';
// esco-consultas: manejador HTTP de Esco 2.0 (M3, familia de labores).
//
// Sin Deno ni npm aquí: las dependencias llegan inyectadas, así que Vitest prueba este
// archivo tal cual y `index.ts` solo conecta Deno.serve y supabase-js.
//
// Contrato de seguridad (D27, docs/esco2/m3-rls.md):
//  1. Sin OPENROUTER_API_KEY → 503 antes de leer nada (falla cerrado).
//  2. Sin `Authorization: Bearer <jwt>` → 401.
//  3. El JWT se valida con Auth (`getUser`) → 401 si no es válido.
//  4. Con un cliente creado con ese JWT se lee la fila propia de `usuarios`.
//     Solo `rol = 'Gerencia'` y `activo = true` pasan; cualquier otra cosa → 403.
//     Este chequeo ES el control de acceso: la RLS de `registros_trabajo` y `lotes`
//     tiene políticas `USING (true)` y no excluye sesiones desactivadas.
//  5. Todas las lecturas de datos usan ese mismo cliente: la RLS aplica a cada una.
//
// Conversación P2: token opaco ligado al usuario autenticado. El estado efímero
// vive en un almacén acotado de esta instancia; expirar o cambiar de instancia
// exige reiniciar el contexto. El historial del cliente no autoriza alcance ni elecciones.
import { crearClienteOpenRouter, type ClienteLLM } from '../../../src/utils/esco2/llm.ts';
import { fuenteSupabase, type ClienteDatos, type RespuestaPostgrest } from '../../../src/utils/esco2/fuente.ts';
import { fuenteAplicacionesSupabase } from '../../../src/utils/esco2/aplicacionesFuente.ts';
import { fuenteMonitoreoSupabase } from '../../../src/utils/esco2/monitoreoFuente.ts';
import { responderTurnoDesdeFuente, type ConfigModelos, type ResultadoTurno } from '../../../src/utils/esco2/nucleo.ts';
import { renderMensaje, validarMensajeFinal, mensajeDisposicion, type AvisoMensaje } from '../../../src/utils/esco2/mensajes.ts';
import { guardarEstado, leerEstado } from '../../../src/utils/esco2/estado.ts';
import type { MensajeHistorial } from '../../../src/utils/esco2/tipos.ts';
import { manejarSql } from './manejadorSql.ts';
import { coberturaNoCertificada, validarCoberturaFinal, type ModoCobertura } from '../../../src/utils/esco2/cobertura.ts';
export const NOMBRE_FUNCION = 'esco-consultas';
/** D25: Luna sin razonamiento es la ruta habitual; Sol solo compone planes de varias partes. */
export const CONFIG_M3: ConfigModelos = {
    nombre: 'm3',
    planificador: { modelo: 'openai/gpt-6-luna', esfuerzo: 'none' },
    compositor: { modelo: 'openai/gpt-6-luna', esfuerzo: 'none' },
    compositorReforzado: { modelo: 'openai/gpt-6-sol', esfuerzo: 'low' },
};
export const MAX_PREGUNTA = 1000;
export const MAX_HISTORIAL = 12;
export const MAX_TEXTO_HISTORIAL = 4000;
export interface ClienteUsuario extends ClienteDatos {
    auth: {
        getUser(jwt: string): Promise<{
            data: {
                user: {
                    id: string;
                } | null;
            };
            error: unknown;
        }>;
    };
}
export interface Dependencias {
    /** Compatibilidad de pruebas de motores. El índice productivo no fija este campo. */
    modoCobertura?: ModoCobertura;
    env(nombre: string): string | undefined;
    /** Cliente de Supabase que actúa como el usuario dueño del JWT. */
    crearClienteUsuario(jwt: string): ClienteUsuario;
    crearLLM?(apiKey: string): ClienteLLM;
    ahora?(): Date;
    registrar?(evento: Record<string, unknown>): void;
}
export const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};
function json(estado: number, cuerpo: unknown): Response {
    return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
}
/** Fecha calendario de Bogotá (UTC-5, sin horario de verano). Nunca el día UTC. */
export function fechaBogota(ahora: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}
export interface Solicitud {
    pregunta: string;
    historial: MensajeHistorial[];
    estadoToken?: string;
    respuestaAclaracion?: string;
    /** 'sql' = loop de SQL de lectura (migración 192). Ausente o 'actual' = motor de planificación. */
    motor?: 'actual' | 'sql';
}
export class ErrorSolicitud extends Error {
}
export function validarSolicitud(cuerpo: unknown): Solicitud {
    if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo))
        throw new ErrorSolicitud('el cuerpo debe ser un objeto JSON');
    const c = cuerpo as Record<string, unknown>;
    for (const k of Object.keys(c))
        if (!['pregunta', 'historial', 'estadoToken', 'respuestaAclaracion', 'motor'].includes(k))
            throw new ErrorSolicitud(`campo no admitido: ${k}`);
    if (typeof c.pregunta !== 'string' || !c.pregunta.trim())
        throw new ErrorSolicitud('falta la pregunta');
    if (c.pregunta.length > MAX_PREGUNTA)
        throw new ErrorSolicitud(`la pregunta supera ${MAX_PREGUNTA} caracteres`);
    const historial: MensajeHistorial[] = [];
    if (c.historial !== undefined) {
        if (!Array.isArray(c.historial) || c.historial.length > MAX_HISTORIAL)
            throw new ErrorSolicitud(`historial: lista de máximo ${MAX_HISTORIAL} mensajes`);
        for (const m of c.historial) {
            const r = m as Record<string, unknown>;
            if (typeof m !== 'object' || m === null || (r.rol !== 'user' && r.rol !== 'assistant') || typeof r.texto !== 'string' || r.texto.length > MAX_TEXTO_HISTORIAL) {
                throw new ErrorSolicitud('historial: cada mensaje es { rol: "user" | "assistant", texto }');
            }
            historial.push({ rol: r.rol, texto: r.texto });
        }
    }
    if (c.estadoToken !== undefined && (typeof c.estadoToken !== 'string' || !/^[0-9a-f-]{36}$/.test(c.estadoToken)))
        throw new ErrorSolicitud('estadoToken inválido');
    if (c.respuestaAclaracion !== undefined && (typeof c.respuestaAclaracion !== 'string' || c.respuestaAclaracion.length > 80))
        throw new ErrorSolicitud('respuestaAclaracion inválida');
    if (c.respuestaAclaracion !== undefined && !c.estadoToken)
        throw new ErrorSolicitud('la aclaración requiere estadoToken');
    if (c.motor !== undefined && c.motor !== 'actual' && c.motor !== 'sql')
        throw new ErrorSolicitud('motor inválido');
    return { pregunta: c.pregunta.trim(), historial, estadoToken: c.estadoToken as string | undefined, respuestaAclaracion: c.respuestaAclaracion as string | undefined, motor: c.motor as 'actual' | 'sql' | undefined };
}
function claveAnonima(env: Dependencias['env']): string | undefined {
    const anon = env('SUPABASE_ANON_KEY');
    if (anon)
        return anon;
    try {
        const llaves = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>;
        return llaves.default;
    }
    catch {
        return undefined;
    }
}
/** Exige rol Gerencia y cuenta activa sobre la fila propia, leída con el JWT del usuario. */
export async function autorizarGerencia(cliente: ClienteUsuario, jwt: string): Promise<{
    ok: true;
    usuarioId: string;
} | {
    ok: false;
    estado: 401 | 403;
    motivo: string;
}> {
    const { data, error } = await cliente.auth.getUser(jwt);
    const id = data?.user?.id;
    if (error || !id)
        return { ok: false, estado: 401, motivo: 'sesión inválida' };
    const r: RespuestaPostgrest = await cliente.from('usuarios').select('id,rol,activo').eq('id', id);
    if (r.error)
        return { ok: false, estado: 403, motivo: 'no se pudo leer el perfil' };
    const filas = (r.data ?? []) as Array<{
        id?: unknown;
        rol?: unknown;
        activo?: unknown;
    }>;
    if (filas.length !== 1 || filas[0].id !== id)
        return { ok: false, estado: 403, motivo: 'sin perfil' };
    if (filas[0].activo !== true)
        return { ok: false, estado: 403, motivo: 'cuenta desactivada' };
    if (filas[0].rol !== 'Gerencia')
        return { ok: false, estado: 403, motivo: 'solo gerencia' };
    return { ok: true, usuarioId: id };
}
/** Lo que vuelve al cliente: la respuesta, los resultados estructurados y una traza sin texto del modelo. */
export function cuerpoRespuesta(t: ResultadoTurno, hoy: string) {
    return {
        respuesta: t.respuesta,
        cobertura: t.cobertura,
        origen: t.origen,
        hoy,
        ruta: t.ruta,
        ajustes: t.ajustes,
        plan: t.plan,
        resultados: t.resultados,
        llamadas: t.llamadas.map((l) => ({ etapa: l.etapa, modelo: l.modelo, ms: l.ms, entrada: l.entrada, salida: l.salida, costoUsd: l.costoUsd })),
        ms: t.ms,
    };
}
export async function manejar(req: Request, deps: Dependencias): Promise<Response> {
    if (req.method === 'OPTIONS')
        return new Response('ok', { headers: CORS });
    const ruta = new URL(req.url).pathname.replace(/\/+$/, '');
    if (req.method === 'GET' && ruta.endsWith('/health'))
        return json(200, { ok: true, funcion: NOMBRE_FUNCION });
    if (req.method !== 'POST')
        return json(405, { error: 'método no admitido' });
    const apiKey = deps.env('OPENROUTER_API_KEY');
    const url = deps.env('SUPABASE_URL');
    if (!apiKey || !url || !claveAnonima(deps.env))
        return json(503, { error: 'Esco 2.0 no está configurado en este entorno' });
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
    if (!m)
        return json(401, { error: 'falta el token de sesión' });
    const jwt = m[1];
    let solicitud: Solicitud;
    try {
        solicitud = validarSolicitud(await req.json());
    }
    catch (e) {
        return json(400, { error: e instanceof ErrorSolicitud ? e.message : 'el cuerpo no es JSON válido' });
    }
    const cliente = deps.crearClienteUsuario(jwt);
    const acceso = await autorizarGerencia(cliente, jwt);
    if (!acceso.ok) {
        deps.registrar?.({ funcion: NOMBRE_FUNCION, evento: 'acceso_denegado', estado: acceso.estado, motivo: acceso.motivo });
        return json(acceso.estado, { error: acceso.estado === 401 ? 'sesión inválida' : 'Esco 2.0 está disponible solo para gerencia' });
    }
    const ahora = deps.ahora?.() ?? new Date();
    const hoy = fechaBogota(ahora);
    if (solicitud.motor === 'sql') {
        const llmSql = (deps.crearLLM ?? ((k: string) => crearClienteOpenRouter(k, fetch, 'Esco SQL esco-consultas')))(apiKey);
        const salida = await manejarSql({ cliente, llm: llmSql, pregunta: solicitud.pregunta, historial: solicitud.historial, hoy, registrar: deps.registrar });
        return json(salida.estado, salida.cuerpo);
    }
    const estado = solicitud.estadoToken ? leerEstado(solicitud.estadoToken, acceso.usuarioId, ahora.getTime()) : undefined;
    const avisoEstado: AvisoMensaje | undefined = solicitud.estadoToken && !estado ? 'contexto_no_disponible' : undefined;
    if (avisoEstado && solicitud.respuestaAclaracion) {
        const respuestaReset = renderMensaje([], avisoEstado);
        if (!validarMensajeFinal(respuestaReset, [], avisoEstado))
            return json(500, { error: mensajeDisposicion('error_datos') });
        return json(200, { respuesta: respuestaReset, cobertura: coberturaNoCertificada(), origen: 'aclaracion', hoy, opcionesAclaracion: [], avisoEstado, resultados: [], llamadas: [], ruta: null, ajustes: [], ms: 0, plan: null });
    }
    const llm = (deps.crearLLM ?? ((k: string) => crearClienteOpenRouter(k, fetch, 'Esco 2.0 esco-consultas')))(apiKey);
    const turno = await responderTurnoDesdeFuente({
        pregunta: solicitud.pregunta,
        estado,
        respuestaAclaracion: estado ? solicitud.respuestaAclaracion : undefined,
        historial: solicitud.historial,
        hoy,
        fuente: fuenteSupabase(cliente),
        fuenteAplicaciones: fuenteAplicacionesSupabase(cliente),
        fuenteMonitoreo: fuenteMonitoreoSupabase(cliente),
        fuenteClima: fuenteClimaSupabase(cliente),
        fuenteConductividad: fuenteConductividadSupabase(cliente),
        fuenteHato: fuenteHatoSupabase(cliente),
        fuenteLeche: fuenteLecheSupabase(cliente),
        llm,
        config: CONFIG_M3,
        modoCobertura: deps.modoCobertura,
    });
    // Traza mínima: sin la pregunta ni la respuesta (datos de la finca), sin ids de filas.
    deps.registrar?.({
        funcion: NOMBRE_FUNCION,
        evento: 'turno',
        origen: turno.origen,
        ruta: turno.ruta,
        partes: turno.plan?.tipo === 'consultas' ? turno.plan.consultas.length : turno.plan?.tipo === 'operaciones' ? turno.plan.operaciones.length : 0,
        ajustes: turno.ajustes.length,
        error: turno.errorPlan ? 'turno_no_completo' : null,
        // Closed reason codes only (no user text): makes a rejected plan diagnosable in logs.
        errorPlan: turno.errorPlan,
        motivoPlan: turno.motivoPlan ?? null,
        ms: turno.ms,
        costoUsd: turno.llamadas.some(l => l.costoUsd === null) ? null : turno.llamadas.reduce((s, l) => s + (l.costoUsd ?? 0), 0),
    });
    const estadoToken = turno.estado ? guardarEstado(acceso.usuarioId, turno.estado, ahora.getTime()) : undefined;
    const avisoTamano: AvisoMensaje | undefined = turno.estado && !estadoToken ? 'contexto_demasiado_amplio' : undefined;
    const avisoFinal = avisoTamano ?? avisoEstado;
    const disposicionesCerradas = ['fuera_de_alcance', 'aclaracion', 'error_plan', 'error_llm', 'error_datos'] as const;
    const disposicion = disposicionesCerradas.find(d => d === turno.origen);
    const parcial = turno.plan?.tipo === 'consultas' || turno.plan?.tipo === 'operaciones' ? turno.plan.parcialFueraDeAlcance : undefined;
    if (!validarCoberturaFinal(turno.cobertura, turno.plan, turno.resultados, hoy))
        return json(500, { error: mensajeDisposicion('error_datos') });
    const declarada = turno.cobertura.estado === 'declarada_validada';
    // Factual blocks are canonical for the results. Operational notices and
    // no-result dispositions are composed only from the two closed registries.
    const operativa = !turno.resultados.length && avisoFinal && disposicion ? `${mensajeDisposicion(disposicion)}\n\n${renderMensaje([], avisoFinal)}` : undefined;
    const respuestaFinal = turno.resultados.length || declarada ? renderMensaje(turno.resultados, avisoFinal, parcial, turno.cobertura) : operativa ?? turno.respuesta;
    const valida = turno.resultados.length || declarada ? validarMensajeFinal(respuestaFinal, turno.resultados, avisoFinal, parcial, turno.cobertura) : operativa !== undefined ? respuestaFinal === `${mensajeDisposicion(disposicion!)}\n\n${renderMensaje([], avisoFinal)}` : true;
    if (!valida)
        return json(500, { error: mensajeDisposicion('error_datos') });
    return json(200, { ...cuerpoRespuesta(turno, hoy), respuesta: respuestaFinal, estadoToken, opcionesAclaracion: estadoToken ? turno.opcionesAclaracion : undefined, avisoEstado: avisoTamano ?? avisoEstado });
}
