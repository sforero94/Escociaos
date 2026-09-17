// acciones-tick.ts — endpoint del motor de acciones recomendadas (Fase 3,
// docs/brief_tecnico_motor_acciones.md §2.2, §5, §7, §10 Fase 3):
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
// CON MODELO (Fase 3): "conectar motor + validador dentro de
// acciones-tick.ts" (§10 Fase 3) es literal -- este handler es el único
// lugar del repo que llama a `invocarModeloAcciones` (`acciones-motor.ts`)
// Y a `validarSalidaMotor` (`acciones-validador.ts`) en la misma corrida.
// Orden: ensamblar paquete → invocar el modelo → validar → (si corresponde,
// §7.4) reintentar UNA vez a temperatura 0 → (si la acción de índice 0 se
// rechazó SÓLO por LONGITUD, hallazgo #41 PO Usage Analytics) reintentar
// SÓLO esa acción una vez más, aparte → ordenar (`ordenarAcciones`) →
// descartar lo silenciado (§5.2) → persistir corrida + acciones aceptadas.
//
// El pipeline SIGUE corriendo aunque el modelo falle o no esté disponible
// (§7.5 -- ver `estadoModelo`/`peorEstado` más abajo): degrada a CERO
// acciones publicadas y una corrida con `estado`/`error` registrados, nunca
// a una excepción que tumbe el tick. Esa propiedad es la que hace del
// Hito 2 (Fase 2) y del Hito 3 (Fase 3) los dos hitos importantes del plan
// -- el segundo no le quita al primero su garantía, la extiende.
//
// I/O puro en este archivo: auth, la llamada al modelo (delegada a
// `acciones-motor.ts`, que NO importa el cliente de Supabase -- R-5), poda
// de corridas viejas, persistencia. La lógica de ensamblado vive en
// `acciones-paquete.ts` (100% puro, testeado con filas mock --
// `accionesPaquete.test.ts`); las consultas reales a Supabase que
// alimentan esa lógica viven en `acciones-paquete-io.ts`
// (`crearDependenciasSupabase`, `fetchDatos*`) -- ver el header de ese
// archivo para por qué está separado del ensamblador puro. Este archivo
// tampoco tiene test de Vitest dedicado -- mismo criterio ya establecido
// para `hato-alertas-tick.ts`/`hato-chequeo-commit.ts`: importa `npm:hono`
// y `jsr:@supabase/supabase-js` a nivel de módulo, que Vitest/Node no
// puede resolver. Lo que SÍ se prueba con Vitest es cada pieza que este
// handler conecta -- `acciones-motor.ts` (`accionesMotor.test.ts`,
// incluidas aserciones estructurales de que este archivo hace la conexión
// que dice hacer, molde `esco-evals.test.ts`), `acciones-validador.ts` y
// `acciones-orden.ts` (ya probados en fases previas).

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ensamblarPaquete } from './acciones-paquete.ts';
import { crearDependenciasSupabase } from './acciones-paquete-io.ts';
import {
  debeReintentar,
  invocarModeloAcciones,
  invocarModeloReintentoLongitud,
  MODELO_ACCIONES_DEFAULT,
  rechazoLongitudIndice0,
  sumarCostosUsd,
  TEMPERATURA_INICIAL,
  TEMPERATURA_REINTENTO,
  type LlamadaMotorResultado,
} from './acciones-motor.ts';
import { validarSalidaMotor, type AccionValidada, type Rechazo } from './acciones-validador.ts';
import { ordenarAcciones } from './acciones-orden.ts';
import type { Hecho, NegocioAccion, PaqueteAcciones } from './acciones-tipos.ts';

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
// Silencios (§5.2) -- el tick los consulta ANTES de publicar. `handleAccionesTick`
// filtra con el `Set` que esta función arma: cualquier `AccionValidada.clave`
// silenciada y vigente nunca llega a `acciones_recomendadas`, sea cual sea
// su origen (O1/O2/O8) -- la clave sobrevive a la regeneración diaria por
// diseño (§5.2 del brief: "el descarte no cuelga de la fila de la corrida").
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

// ---------------------------------------------------------------------------
// Estado de la corrida (§7.5) -- combina el estado del PAQUETE (¿algún
// negocio cayó al ensamblar?) con el estado del MOTOR (¿el modelo produjo
// algo utilizable?). El peor de los dos manda: un paquete 'ok' con un
// modelo que 'fallo' es una corrida 'fallo' (nada publicable ese día), y un
// paquete 'parcial' con un modelo 'ok' sigue siendo 'parcial' (un negocio
// caído no se puede maquillar con acciones válidas de los otros dos).
// ---------------------------------------------------------------------------
type EstadoCorrida = 'ok' | 'parcial' | 'fallo';
const SEVERIDAD_ESTADO: Record<EstadoCorrida, number> = { ok: 0, parcial: 1, fallo: 2 };

function peorEstado(a: EstadoCorrida, b: EstadoCorrida): EstadoCorrida {
  return SEVERIDAD_ESTADO[a] >= SEVERIDAD_ESTADO[b] ? a : b;
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

  const clavesSilenciadas = await clavesSilenciadasVigentes(supabase, ahora.toISOString());

  const estadoPaquete: EstadoCorrida = paquete.incidencias.length > 0 ? 'parcial' : 'ok';

  // -------------------------------------------------------------------------
  // El modelo (Fase 3, §7 del brief) -- ver el header del archivo para el
  // orden completo. TODO este bloque está en un try/catch: la propiedad que
  // no se puede romper (encargo de esta sesión) es que el pipeline corre
  // ENTERO aunque el modelo falle de cualquier forma, incluida una que
  // `acciones-motor.ts`/`acciones-validador.ts`/`acciones-orden.ts` no
  // previeron (los tres documentan "nunca lanza", pero esta guarda es
  // defensa en profundidad, no confianza ciega) -- nunca una excepción que
  // tumbe el tick antes de persistir. Si algo revienta aquí, la corrida se
  // persiste igual, con CERO acciones y `estado='fallo'`.
  // -------------------------------------------------------------------------
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  const modelo = Deno.env.get('ACCIONES_MODELO') || MODELO_ACCIONES_DEFAULT;

  let ultimoResultado: LlamadaMotorResultado | null = null;
  let aceptadas: AccionValidada[] = [];
  let rechazos: Rechazo[] = [];
  let intentosModelo = 0;
  let tokensPrompt = 0;
  let tokensCompletion = 0;
  let costoUsd: number | null = null;
  let errorMotor: string | null = null;

  if (!apiKey) {
    // §7.5: "OPENROUTER_API_KEY sin configurar | estado='fallo',
    // error='sin_api_key'" -- ni se intenta la llamada, mismo patrón "503
    // antes de tocar nada" que `hato-chequeo-foto.ts`/`hato-alertas-tick.ts`,
    // adaptado aquí a "no llames al modelo" en vez de "no respondas nada",
    // porque el resto del tick (paquete, silencios, persistencia) sigue
    // teniendo trabajo útil que hacer.
    errorMotor = 'sin_api_key';
  } else {
    try {
      const intento1 = await invocarModeloAcciones(paquete, { apiKey, modelo, temperatura: TEMPERATURA_INICIAL });
      intentosModelo = 1;
      ultimoResultado = intento1;
      let validacion = intento1.salida ? validarSalidaMotor(intento1.salida, paquete) : { aceptadas: [], rechazos: [] };
      aceptadas = validacion.aceptadas;
      rechazos = validacion.rechazos;
      tokensPrompt = intento1.tokensPrompt;
      tokensCompletion = intento1.tokensCompletion;
      costoUsd = intento1.costoUsd;

      // §7.4 -- "nunca más de 2 llamadas por corrida". `debeReintentar` sólo
      // dispara sobre (a) fallo de la llamada o (b) el validador rechazó
      // TODAS las acciones propuestas -- nunca sobre "el modelo propuso
      // legítimamente cero acciones" (§7.5: ese es el caso bueno).
      if (debeReintentar(intento1, aceptadas.length)) {
        const intento2 = await invocarModeloAcciones(paquete, { apiKey, modelo, temperatura: TEMPERATURA_REINTENTO });
        intentosModelo = 2;
        ultimoResultado = intento2;
        validacion = intento2.salida ? validarSalidaMotor(intento2.salida, paquete) : { aceptadas: [], rechazos: [] };
        aceptadas = validacion.aceptadas;
        rechazos = validacion.rechazos;
        tokensPrompt += intento2.tokensPrompt;
        tokensCompletion += intento2.tokensCompletion;
        costoUsd = sumarCostosUsd([costoUsd, intento2.costoUsd]);
      }

      if (!ultimoResultado.ok) errorMotor = ultimoResultado.error;
    } catch (err) {
      // Defensa en profundidad (ver el comentario del bloque): nada de esto
      // debería lanzar, pero si lo hace, la corrida degrada a 'fallo' en vez
      // de tumbar el tick.
      errorMotor = err instanceof Error ? err.message : String(err);
      aceptadas = [];
      rechazos = [];
    }
  }

  // ---------------------------------------------------------------------
  // Reintento quirúrgico de la acción rango 0 rechazada por LONGITUD --
  // hallazgo #41 (PO, Usage Analytics). Ver el header de
  // `rechazoLongitudIndice0`/`invocarModeloReintentoLongitud` en
  // acciones-motor.ts para la evidencia y el porqué. Distinto de
  // `debeReintentar` de arriba (que sólo dispara si el validador rechazó
  // TODAS las acciones): aquí puede haber acciones ya aceptadas y de todas
  // formas se reintenta SÓLO la de índice 0, UNA vez, sin encadenar un
  // segundo intento sobre este resultado -- nunca puede entrar en bucle.
  // Corre sobre lo que haya quedado del bloque de arriba (con o sin el
  // reintento de §7.4 ya consumido), así que `ultimoResultado`/`aceptadas`/
  // `rechazos` son siempre los del intento MÁS RECIENTE.
  // ---------------------------------------------------------------------
  if (apiKey && ultimoResultado?.ok && ultimoResultado.salida) {
    const salidaVigente = ultimoResultado.salida;
    const rechazoLongitud = rechazoLongitudIndice0(rechazos);
    if (rechazoLongitud) {
      try {
        const accionOriginal = salidaVigente.acciones[0];
        const reintento = await invocarModeloReintentoLongitud(paquete, accionOriginal, rechazoLongitud.detalle, { apiKey, modelo });
        tokensPrompt += reintento.tokensPrompt;
        tokensCompletion += reintento.tokensCompletion;
        costoUsd = sumarCostosUsd([costoUsd, reintento.costoUsd]);
        intentosModelo += 1;

        if (reintento.ok && reintento.accion) {
          const accionesConReemplazo = [...salidaVigente.acciones];
          accionesConReemplazo[0] = reintento.accion;
          const revalidacion = validarSalidaMotor({ acciones: accionesConReemplazo }, paquete);
          aceptadas = revalidacion.aceptadas;
          rechazos = revalidacion.rechazos;
        }
        // Si `reintento.ok` es falso (fallo de red, JSON que no parseó,
        // forma inválida), no se toca `aceptadas`/`rechazos`: la acción
        // queda descartada con el rechazo ORIGINAL, ya registrado arriba --
        // exactamente el "se cae igual que hoy" que pide el encargo.
      } catch (err) {
        // Defensa en profundidad: un fallo aquí nunca tumba el tick ni
        // pierde lo que YA se validó -- se deja tal cual estaba.
        console.error('[acciones-tick] el reintento de la acción rango 0 por LONGITUD falló:', err instanceof Error ? err.message : String(err));
      }
    }
  }

  // §4.6 -- el orden lo calcula el data layer, nunca el modelo.
  const ordenadas = ordenarAcciones(aceptadas, paquete);
  // §5.2 -- lo silenciado no se publica, aunque haya sobrevivido la validación.
  const publicables = ordenadas.filter((a) => !clavesSilenciadas.has(a.clave));

  // §7.5 -- estado del motor: 'fallo' si no hubo llamada utilizable en
  // absoluto (sin api key, o ambos intentos fallaron); 'parcial' si hubo
  // salida pero el validador rechazó algo (incluido "rechazó todo", que
  // también es 'parcial' -- el diagnóstico vive en `rechazos[]`, no en
  // `error`); 'ok' en cualquier otro caso, INCLUIDO "el modelo propuso 0
  // acciones legítimamente" (§7.5: "es el caso bueno y tiene que verse de
  // verdad").
  const estadoModelo: EstadoCorrida = !apiKey || !ultimoResultado?.ok ? 'fallo' : rechazos.length > 0 ? 'parcial' : 'ok';
  const estado = peorEstado(estadoPaquete, estadoModelo);
  const duracionMs = Date.now() - inicio;

  const { data: corridaInsertada, error: errorInsertCorrida } = await supabase
    .from('acciones_corridas')
    .insert({
      fecha_referencia: paquete.fecha_referencia,
      disparo: auth.disparo,
      estado,
      modelo: apiKey ? modelo : null,
      tokens_prompt: tokensPrompt,
      tokens_completion: tokensCompletion,
      costo_usd: costoUsd,
      duracion_ms: duracionMs,
      paquete,
      salida_cruda: ultimoResultado?.salidaCruda ?? null,
      rechazos,
      contexto_comite: paquete.contexto_comite.estado,
      error: errorMotor,
    })
    .select('id')
    .single();

  if (errorInsertCorrida) {
    return respuestaError(c, 500, `El paquete se ensambló pero no se pudo persistir la corrida: ${errorInsertCorrida.message}`);
  }

  // -------------------------------------------------------------------------
  // Persistir las acciones aceptadas (§5.2/§5.3 del brief). `orden` es la
  // POSICIÓN dentro del negocio en `publicables` -- ya viene agrupado y
  // ordenado por `ordenarAcciones`, así que un contador que se reinicia por
  // negocio basta; no hace falta releer el criterio de orden aquí.
  // -------------------------------------------------------------------------
  const ordenPorNegocio = new Map<NegocioAccion, number>();
  const filasAcciones: Array<Record<string, unknown>> = [];
  for (const accion of publicables) {
    const destino = paquete.destinos.find((d) => d.id === accion.destino_id && d.negocio === accion.negocio);
    if (!destino) {
      // No debería pasar: el validador ya exigió que el destino exista para
      // ese negocio. Si pasa igual (una corrida real puede desviarse de lo
      // que el corpus de tests cubrió), se omite ESA acción y se registra --
      // nunca se aborta la corrida completa por una fila.
      console.error(`[acciones-tick] la acción de clave '${accion.clave}' no resolvió un destino tras validar -- se omite.`);
      continue;
    }
    const orden = (ordenPorNegocio.get(accion.negocio) ?? 0) + 1;
    ordenPorNegocio.set(accion.negocio, orden);
    const hechosSnapshot = accion.hecho_ids
      .map((id) => paquete.hechos.find((h) => h.id === id))
      .filter((h): h is Hecho => h !== undefined);

    filasAcciones.push({
      corrida_id: corridaInsertada.id,
      negocio: accion.negocio,
      clave: accion.clave,
      origen: accion.origen,
      visibilidad: accion.visibilidad,
      orden,
      plantilla: accion.plantilla,
      ranuras: accion.ranuras,
      hecho_ids: accion.hecho_ids,
      hechos_snapshot: hechosSnapshot,
      destino_id: accion.destino_id,
      destino_ruta: destino.ruta,
      destino_etiqueta: destino.etiqueta_boton,
    });
  }

  let accionesPublicadas = 0;
  if (filasAcciones.length > 0) {
    const { error: errorInsertAcciones } = await supabase.from('acciones_recomendadas').insert(filasAcciones);
    if (errorInsertAcciones) {
      // La corrida YA quedó persistida con su estado/rechazos/salida_cruda
      // (auditoría intacta); un fallo aquí sólo significa que el navegador
      // no verá acciones hoy -- se registra y NO se aborta.
      console.error('[acciones-tick] no se pudieron insertar acciones_recomendadas -- la corrida queda persistida sin acciones publicadas:', errorInsertAcciones.message);
    } else {
      accionesPublicadas = filasAcciones.length;
    }
  }

  await podarCorridasViejas(supabase, paquete.fecha_referencia);

  return c.json({
    success: true,
    corrida_id: corridaInsertada.id,
    disparo: auth.disparo,
    estado,
    negocios: paquete.negocios,
    total_hechos: paquete.hechos.length,
    incidencias: paquete.incidencias,
    modelo: apiKey ? modelo : null,
    intentos_modelo: intentosModelo,
    acciones_aceptadas: aceptadas.length,
    acciones_silenciadas: ordenadas.length - publicables.length,
    acciones_publicadas: accionesPublicadas,
    rechazos: rechazos.length,
    tokens_prompt: tokensPrompt,
    tokens_completion: tokensCompletion,
    costo_usd: costoUsd,
    duracion_ms: duracionMs,
  });
}
