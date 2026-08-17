// acciones-tick.ts — endpoint del motor de acciones recomendadas (Fase 2,
// docs/brief_tecnico_motor_acciones.md §2.2, §5, §10 Fase 2):
// `POST /make-server-1ccce916/acciones/tick`.
//
// Disparado a diario por el pg_cron de la migración 098 (05:50 Bogotá --
// cinco minutos después del tick del hato, migración 060, para que las dos
// llamadas a la misma edge function no compitan por la misma instancia en
// el mismo minuto, §2.2 del brief). El mismo handler admite un disparo
// MANUAL para pruebas, con una segunda puerta de auth (JWT + rol Gerencia,
// patrón de `hato-chequeo-commit.ts`) -- no se expone en la interfaz en v1
// (§2.2 del brief).
//
// TODAVÍA SIN MODELO (Fase 2, §10 del brief): este handler ensambla el
// paquete, consulta `acciones_silencios` (§5.2 -- una acción cuya CLAVE
// esté silenciada y vigente nunca se publica), y persiste la corrida con
// `salida_cruda = null` y CERO acciones. `usage`/`costo_usd` se guardan en
// cero desde el primer día (§10: "aunque en esta fase no haya modelo y
// vayan en cero") -- así la Fase 3 sólo tiene que EMPEZAR a poblarlos, no
// crear la columna. No hay ninguna llamada a un LLM en este archivo, y no
// debe haberla hasta la Fase 3 -- es justamente la propiedad que hace del
// Hito 2 el más importante del plan (§10): "el pipeline completo corre a
// diario con CERO participación de un modelo".
//
// I/O puro en este archivo: auth, poda de corridas viejas, persistencia.
// La lógica de ensamblado vive en `acciones-paquete.ts` (100% puro,
// testeado con filas mock -- `accionesPaquete.test.ts`); las consultas
// reales a Supabase que alimentan esa lógica viven en `acciones-paquete-io.ts`
// (`crearDependenciasSupabase`, `fetchDatos*`) -- ver el header de ese
// archivo para por qué está separado del ensamblador puro.

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ensamblarPaquete } from './acciones-paquete.ts';
import { crearDependenciasSupabase } from './acciones-paquete-io.ts';
import type { PaqueteAcciones } from './acciones-tipos.ts';

/** Corridas de más de este número de días se borran en cada tick (§5.3,
 *  sección 6 "Retención" -- "corridas > 90 días se borran, y el ON DELETE
 *  CASCADE se lleva sus acciones"). Constante nombrada, no un número mágico
 *  en la consulta. */
const DIAS_RETENCION_CORRIDAS = 90;

function respuestaError(c: Context, status: 400 | 401 | 403 | 500 | 503, error: string) {
  return c.json({ success: false, error }, status);
}

// ---------------------------------------------------------------------------
// Auth -- DOBLE PUERTA (§2.2 del brief):
//   (a) secreto compartido `x-acciones-tick-secret` -- el llamador es el
//       pg_cron de la migración 098, no una sesión humana. Mismo patrón que
//       `HATO_ALERTAS_TICK_SECRET` (hato-alertas-tick.ts): si el secreto no
//       está configurado en este entorno, el endpoint responde 503 y NO
//       HACE NADA, nunca corre "abierto".
//   (b) JWT + rol Gerencia -- disparo manual para pruebas en producción sin
//       esperar al día siguiente (§2.2: "no se expone en la interfaz en
//       v1"). Mismo patrón que `hato-chequeo-commit.ts:71-101`
//       (`verificarAcceso`), repetido en vez de importado -- cada endpoint
//       de este árbol es autocontenido en su propio I/O.
// ---------------------------------------------------------------------------

const ROLES_DISPARO_MANUAL = new Set(['Gerencia']);

type ClienteSupabase = ReturnType<typeof createClient>;

async function verificarAuth(
  c: Context,
  supabase: ClienteSupabase,
): Promise<{ disparo: 'cron' | 'manual' } | Response> {
  const secretoConfigurado = Deno.env.get('ACCIONES_TICK_SECRET');
  const secretoRecibido = c.req.header('x-acciones-tick-secret');
  if (secretoConfigurado && secretoRecibido && secretoRecibido === secretoConfigurado) {
    return { disparo: 'cron' };
  }

  // No coincidió el secreto (o no vino) -- se intenta la segunda puerta,
  // JWT + Gerencia, antes de rechazar. Si NINGUNA de las dos credenciales
  // vino, se responde 401 en vez de 503 -- 503 es sólo para "el secreto de
  // ESTE entorno no está configurado y tampoco hay JWT", ver abajo.
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return respuestaError(c, 401, 'Token inválido o expirado.');
    }
    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (usuarioError) {
      return respuestaError(c, 500, `No se pudo verificar el rol del usuario: ${usuarioError.message}`);
    }
    if (!usuario || !ROLES_DISPARO_MANUAL.has(usuario.rol as string)) {
      return respuestaError(c, 403, 'El disparo manual está restringido a Gerencia.');
    }
    return { disparo: 'manual' };
  }

  if (!secretoConfigurado) {
    return respuestaError(
      c,
      503,
      'ACCIONES_TICK_SECRET no está configurado en este entorno -- el tick de acciones recomendadas está deshabilitado hasta que se configure el secreto (ver migración 098), y no llegó ningún JWT de Gerencia como alternativa.',
    );
  }
  return respuestaError(c, 401, 'Secreto de tick inválido/ausente y no hay JWT de Gerencia -- ninguna de las dos puertas de auth se cumplió.');
}

// ---------------------------------------------------------------------------
// Silencios (§5.2) -- el tick los consulta ANTES de publicar. En esta fase
// no hay acciones que publicar (cero acciones, `salida_cruda=null`), así
// que esta consulta no tiene ningún efecto observable todavía -- se deja
// lista desde ya para que la Fase 3 sólo tenga que FILTRAR con el `Set` que
// esta función ya arma, en vez de escribir la consulta ese día.
// ---------------------------------------------------------------------------
async function clavesSilenciadasVigentes(supabase: ClienteSupabase, ahoraIso: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('acciones_silencios').select('clave').gt('vigente_hasta', ahoraIso);
  if (error) {
    // No es razón para abortar la corrida entera -- un silencio que no se
    // pudo leer degrada a "no se filtra nada esta corrida" (falla abierta
    // hacia MÁS visibilidad, nunca hacia menos), y queda en el log.
    console.error('[acciones-tick] no se pudieron leer acciones_silencios -- ningún silencio se aplicará esta corrida:', error.message);
    return new Set();
  }
  return new Set((data ?? []).map((f: { clave: string }) => f.clave));
}

async function podarCorridasViejas(supabase: ClienteSupabase, hoy: string): Promise<void> {
  const limite = new Date(`${hoy}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - DIAS_RETENCION_CORRIDAS);
  const { error } = await supabase.from('acciones_corridas').delete().lt('generado_at', limite.toISOString());
  if (error) {
    // Tampoco es razón para abortar -- es limpieza, no el propósito del
    // tick. Se registra y se sigue (mismo criterio que el resto del
    // handler: nunca tumbar la corrida completa por una tarea secundaria).
    console.error('[acciones-tick] no se pudo podar acciones_corridas > 90 días:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
export async function handleAccionesTick(c: Context): Promise<Response> {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const auth = await verificarAuth(c, supabase);
  if (auth instanceof Response) return auth;

  const inicio = Date.now();
  const ahora = new Date();

  let paquete: PaqueteAcciones;
  try {
    paquete = await ensamblarPaquete(crearDependenciasSupabase(supabase), ahora);
  } catch (err) {
    // Sólo puede llegar aquí un fallo AJENO a los tres negocios (que ya
    // tienen su propio try/catch dentro de `ensamblarPaquete` y terminan en
    // `incidencias[]`, nunca lanzando) -- p. ej. `revisiones_periodicas`
    // fuera de línea de forma catastrófica, o un error de programación.
    // §7.5 del brief: se persiste como corrida `fallo`, nunca se deja sin
    // rastro.
    const mensaje = err instanceof Error ? err.message : String(err);
    await supabase.from('acciones_corridas').insert({
      fecha_referencia: new Date().toISOString().slice(0, 10),
      disparo: auth.disparo,
      estado: 'fallo',
      modelo: null,
      tokens_prompt: 0,
      tokens_completion: 0,
      costo_usd: 0,
      duracion_ms: Date.now() - inicio,
      paquete: {},
      salida_cruda: null,
      rechazos: [],
      contexto_comite: null,
      error: mensaje,
    });
    return respuestaError(c, 500, `No se pudo ensamblar el paquete: ${mensaje}`);
  }

  // §5.2 -- se consultan los silencios vigentes desde ya (ver el comentario
  // de `clavesSilenciadasVigentes`); en esta fase no hay acciones que
  // filtrar (0 acciones, ver abajo), así que el resultado no se usa todavía
  // más que para dejar la consulta viva y probada.
  await clavesSilenciadasVigentes(supabase, ahora.toISOString());

  const estado: 'ok' | 'parcial' = paquete.incidencias.length > 0 ? 'parcial' : 'ok';
  const duracionMs = Date.now() - inicio;

  const { data: corridaInsertada, error: errorInsertCorrida } = await supabase
    .from('acciones_corridas')
    .insert({
      fecha_referencia: paquete.fecha_referencia,
      disparo: auth.disparo,
      estado,
      modelo: null, // Fase 3 -- todavía sin LLM
      tokens_prompt: 0,
      tokens_completion: 0,
      costo_usd: 0,
      duracion_ms: duracionMs,
      paquete,
      salida_cruda: null, // Fase 3 -- todavía sin LLM
      rechazos: [],
      contexto_comite: paquete.contexto_comite.estado,
      error: null,
    })
    .select('id')
    .single();

  if (errorInsertCorrida) {
    return respuestaError(c, 500, `El paquete se ensambló pero no se pudo persistir la corrida: ${errorInsertCorrida.message}`);
  }

  // Fase 2: CERO acciones publicadas -- no hay modelo todavía que las
  // proponga (§10: "escribe la corrida con salida_cruda=null y CERO
  // acciones"). No se inserta nada en `acciones_recomendadas` en esta fase.

  await podarCorridasViejas(supabase, paquete.fecha_referencia);

  return c.json({
    success: true,
    corrida_id: corridaInsertada.id,
    disparo: auth.disparo,
    estado,
    negocios: paquete.negocios,
    total_hechos: paquete.hechos.length,
    incidencias: paquete.incidencias,
    acciones_publicadas: 0, // Fase 2 -- sin modelo todavía (§10 del brief)
    duracion_ms: duracionMs,
  });
}
