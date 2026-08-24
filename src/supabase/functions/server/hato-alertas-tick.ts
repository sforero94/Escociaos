// hato-alertas-tick.ts — endpoint del motor de alertas del Hato Lechero
// (S6, plan §7.3): `POST /make-server-1ccce916/hato/alertas/tick`.
//
// Disparado a diario por el pg_cron de la migración 060 (05:45 Bogotá),
// aunque nada le impide llamarse a mano para pruebas -- el propio diseño es
// idempotente (`regla_clave UNIQUE` + `ON CONFLICT DO NOTHING`, plan §7.3
// "anti-spam... tick seguro de correr dos veces").
//
// Auth: header compartido `x-hato-tick-secret`, NO un JWT de usuario -- el
// llamador es un cron de Postgres, no una sesión humana (mismo patrón que
// 030/036 para clima, pero clima no envía nada saliente así que no necesita
// secreto; este endpoint sí dispara mensajes de Telegram, de ahí el secreto
// compartido, ver migración 060). El secreto vive en Supabase Vault y se
// inyecta como header en tiempo de disparo -- este handler solo lo compara
// contra `Deno.env.get('HATO_ALERTAS_TICK_SECRET')` (secreto de edge
// function, configurado por fuera de este código). Si esa variable de
// entorno está vacía o ausente, el endpoint responde 503 y NO HACE NADA --
// nunca corre "abierto" ni cae a ningún valor por defecto.
//
// Tres fases (plan §7.3), en este orden estricto -- cada una alimenta el
// estado que la siguiente necesita:
//   (a) Generar   -- motor puro `generarAlertasPendientes` (hatoAlertas.ts)
//                    sobre `v_hato_estado_actual` + pasos de tratamiento
//                    pendientes + `HatoConfig` (058/062, vía
//                    `construirHatoConfigDesdeFilas` -- explota si falta una
//                    clave, nunca un default inventado) + las `regla_clave`
//                    ya existentes (CUALQUIER estado, no solo activas: el
//                    UNIQUE de la tabla no distingue). INSERT vía
//                    `.upsert(..., { onConflict: 'regla_clave', ignoreDuplicates: true })`
//                    -- el `ON CONFLICT ... DO NOTHING` real, PostgREST no
//                    tiene otra forma de expresarlo.
//   (b) Despachar -- BROADCAST (migración 096, 2026-08-14): para cada alerta
//                    activa (`pendiente`/`enviada`) cuyo `tipo` está `activo`
//                    en `hato_alertas_config`, se resuelve la lista de
//                    suscritos con `recibe=true` para esa clave
//                    (`telegram_alertas_suscripciones`, join
//                    `telegram_usuarios` activos) y se manda UN mensaje POR
//                    SUSCRITO -- no una alerta por persona, una sola alerta
//                    que le llega a todos. Primer envío incondicional si
//                    `pendiente`; reenvío (a la MISMA lista de suscritos)
//                    solo si `debeReenviar(...)` (≥48h desde el último
//                    intento, <3 intentos) si ya estaba `enviada` -- el
//                    umbral de reenvío sigue siendo por ALERTA, no por
//                    persona, mismo mecanismo de antes. Sin ningún suscrito
//                    con `recibe=true` para esa clave -> se deja `pendiente`,
//                    CERO mensajes salientes (mismo "modo sombra" de antes,
//                    ahora gobernado por la tabla de suscripciones en vez de
//                    `hato_alertas_config.destinatario_telegram_id`, que esta
//                    fase YA NO LEE -- ver migración 096). Cada envío exitoso
//                    se registra en `hato_alertas_envios` (alerta_id,
//                    telegram_id, message_id) -- es lo que permite cerrar la
//                    alerta para TODOS cuando el primero responde (ver
//                    `telegram/bot.ts`).
//   (c) Escalar/expirar -- `decidirAccionEscalamiento` sobre las alertas que
//                    siguen activas tras (b). Telegram no permite
//                    `editMessageText` pasadas 48h -- el escalamiento SIEMPRE
//                    manda un mensaje NUEVO (nunca edita el original). El
//                    escalamiento (096) también es broadcast: va a TODOS los
//                    suscritos con `escalamiento=true` para esa clave, no a
//                    la variable de entorno `HATO_ALERTAS_ESCALAMIENTO_TELEGRAM_ID`
//                    (esa variable queda SIN USO por este handler desde
//                    096 -- no se borra del entorno, ver CLAUDE.md). Sin
//                    ningún suscrito con `escalamiento=true` -> se marca
//                    `escalada` sin mandar nada, mismo contrato de antes.
//
// Nota de diseño (I/O, no cambia el motor puro): `hato_alertas` (migración
// 056) no tiene una columna dedicada para "cuándo se envió por primera vez"
// -- solo `created_at`/`updated_at` (que se pisan en cada UPDATE, incluidos
// los reenvíos) y `escalada_at` (dedicada a la transición de escalamiento,
// no a la de envío). Usar `updated_at` como proxy de "primer envío" para el
// umbral de escalamiento sería incorrecto: cada reenvío correría el reloj de
// escalamiento hacia adelante, retrasándolo exactamente cuando más urge (una
// alerta que ya se reenvió varias veces sin respuesta). En vez de agregar
// una columna nueva, el instante del primer envío se guarda dentro de la
// columna `datos JSONB` ya existente (`datos.enviada_en`), que SÍ sobrevive
// intacta a los reenvíos porque este handler nunca la sobreescribe una vez
// puesta. `updated_at` sigue siendo la fuente correcta para "último intento"
// (resend policy), porque ese valor SÍ debe correrse con cada intento -- es
// exactamente lo que esa política mide.
//
// `hato_alertas.destinatario_telegram_id` (columna singular, existe desde
// 056) sobrevive con un significado DISTINTO desde 096: ya no es "el único
// destinatario" (el broadcast no tiene uno), es "a quién se le envió
// primero" -- este handler la fija UNA sola vez, en el primer envío exitoso,
// y nunca la vuelve a tocar (ni en reenvíos ni en despachos posteriores a
// nuevos suscritos). Se conserva en vez de borrarse porque hay historia
// real detrás (todas las filas hasta hoy la tienen puesta) -- decisión de
// esta sesión, documentada en el reporte que acompaña la migración 096.
// `hato_alertas_config.destinatario_telegram_id` (la columna singular de la
// tabla de CONFIGURACIÓN, no de esta) queda VESTIGIAL desde el mismo cambio
// -- este handler ya no la lee en absoluto (fase b/c de abajo), aunque la
// columna sigue en la tabla (096 no la borra).
//
// I/O puro en este archivo: parseo/auth, consultas a Supabase, llamadas a
// Telegram. Toda la lógica de negocio vive en el módulo puro `hatoAlertas.ts`
// -- copia GENERADA en este árbol por `docs/hato/regenerar-copias-hato-alertas.py`.

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  generarAlertasPendientes,
  resumirCoberturaAlertas,
  debeReenviar,
  decidirAccionEscalamiento,
  decidirExpiracionTerminal,
  claveAlertaCatalogo,
  agruparSuscriptoresPorClave,
  type AnimalHatoParaAlertas,
  type PasoTratamientoPendienteInput,
  type AlertaGenerada,
  type TipoAlertaHato,
  type EstadoAlertaHato,
  type FilaSuscripcionAlerta,
  type ResumenCoberturaAlertas,
} from './hato-alertas.ts';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from './hato-config-desde-tabla.ts';
import { enviarMensajeTelegram } from './telegram/enviar.ts';

/** Módulo de este handler dentro de `alertas_catalogo` -- única fuente de
 * la constante `'hato'` en todo el archivo (migración 096, `clave = modulo.tipo`). */
const MODULO_ALERTAS = 'hato';

function respuestaError(c: Context, status: 400 | 500 | 503, error: string) {
  return c.json({ success: false, error }, status);
}

// ---------------------------------------------------------------------------
// Auth: secreto compartido, no JWT de usuario -- ver cabecera del archivo.
// ---------------------------------------------------------------------------
function verificarSecretoTick(c: Context): Response | null {
  const secretoConfigurado = Deno.env.get('HATO_ALERTAS_TICK_SECRET');
  if (!secretoConfigurado) {
    // Nunca correr "abierto": si el secreto no está configurado en este
    // entorno, el endpoint no hace nada, ni siquiera leer la BD.
    return respuestaError(
      c,
      503,
      'HATO_ALERTAS_TICK_SECRET no está configurado en este entorno -- el tick de alertas está deshabilitado hasta que se configure el secreto (ver migración 060).',
    );
  }
  const recibido = c.req.header('x-hato-tick-secret');
  if (!recibido || recibido !== secretoConfigurado) {
    return respuestaError(c, 401, 'Secreto de tick inválido o ausente.');
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filas crudas de Supabase -- formas mínimas, solo lo que este handler usa.
// ---------------------------------------------------------------------------

interface FilaAlertaConfig {
  tipo: TipoAlertaHato;
  horas_escalamiento: number;
  activo: boolean;
}

/** Fila cruda de `telegram_alertas_suscripciones` JOIN `telegram_usuarios`
 * (migración 096) -- el embed de PostgREST puede venir como objeto o como
 * array de un elemento según la versión del cliente, de ahí el `Array.isArray`
 * en `resolverFilasSuscripcion`. Solo se listan suscritos ACTIVOS: la
 * consulta filtra `telegram_usuarios.activo = true`. */
interface FilaSuscripcionCruda {
  alerta_clave: string;
  recibe: boolean;
  escalamiento: boolean;
  telegram_usuarios: { telegram_id: number } | { telegram_id: number }[] | null;
}

function resolverFilasSuscripcion(filas: FilaSuscripcionCruda[]): FilaSuscripcionAlerta[] {
  return filas
    .map((f) => {
      const usuario = Array.isArray(f.telegram_usuarios) ? f.telegram_usuarios[0] : f.telegram_usuarios;
      if (usuario == null) return null;
      return {
        alerta_clave: f.alerta_clave,
        recibe: f.recibe,
        escalamiento: f.escalamiento,
        telegram_id: String(usuario.telegram_id),
      };
    })
    .filter((f): f is FilaSuscripcionAlerta => f !== null);
}

interface FilaAlertaActiva {
  id: string;
  tipo: TipoAlertaHato;
  animal_id: string | null;
  regla_clave: string;
  fecha_programada: string;
  estado: EstadoAlertaHato;
  intentos: number;
  destinatario_telegram_id: string | null;
  datos: Record<string, unknown> | null;
  updated_at: string;
}

/** Fila mínima para la fase (d) -- D-24, docs/plan_hato_ronda_agosto_2026.md
 * §0. Distinta de `FilaAlertaActiva`: esta consulta trae `escalada`/
 * `respondida`, nunca `pendiente`/`enviada` (esas las cubre la fase (c)). */
interface FilaAlertaTerminal {
  id: string;
  estado: EstadoAlertaHato;
  escalada_at: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
export async function handleHatoAlertasTick(c: Context): Promise<Response> {
  const authError = verificarSecretoTick(c);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const ahora = new Date();
  const fechaHoraReferencia = ahora.toISOString();
  const fechaReferencia = fechaHoraReferencia.slice(0, 10);

  // --- hato_config -- explota si falta una clave (058/062), nunca un
  //     default inventado en este handler. -----------------------------
  const { data: filasConfig, error: errorConfig } = await supabase.from('hato_config').select('clave, valor');
  if (errorConfig) {
    return respuestaError(c, 500, `No se pudo leer hato_config: ${errorConfig.message}`);
  }
  let hatoConfig;
  try {
    hatoConfig = construirHatoConfigDesdeFilas((filasConfig ?? []) as FilaHatoConfig[]);
  } catch (err) {
    return respuestaError(c, 500, err instanceof Error ? err.message : String(err));
  }

  // --- hato_alertas_config -- activo/horas por tipo. Ya NO se lee
  //     `destinatario_telegram_id` de aquí (096) -- los destinatarios salen
  //     de `telegram_alertas_suscripciones`, abajo. La columna sigue en la
  //     tabla (vestigial, ver cabecera del archivo). --------------------
  const { data: filasAlertasConfig, error: errorAlertasConfig } = await supabase
    .from('hato_alertas_config')
    .select('tipo, horas_escalamiento, activo');
  if (errorAlertasConfig) {
    return respuestaError(c, 500, `No se pudo leer hato_alertas_config: ${errorAlertasConfig.message}`);
  }
  const configPorTipo = new Map<TipoAlertaHato, FilaAlertaConfig>(
    ((filasAlertasConfig ?? []) as FilaAlertaConfig[]).map((f) => [f.tipo, f]),
  );

  // --- telegram_alertas_suscripciones -- quién recibe / quién escala, por
  //     clave (`modulo.tipo`, migración 096). Solo suscritos ACTIVOS en
  //     telegram_usuarios -- uno desactivado no debe recibir ni escalar
  //     aunque su fila de suscripción siga con recibe/escalamiento=true. ---
  const { data: filasSuscripcionesCrudas, error: errorSuscripciones } = await supabase
    .from('telegram_alertas_suscripciones')
    .select('alerta_clave, recibe, escalamiento, telegram_usuarios!inner(telegram_id, activo)')
    .eq('telegram_usuarios.activo', true);
  if (errorSuscripciones) {
    return respuestaError(c, 500, `No se pudieron leer las suscripciones de alertas: ${errorSuscripciones.message}`);
  }
  const suscriptoresPorClave = agruparSuscriptoresPorClave(
    resolverFilasSuscripcion((filasSuscripcionesCrudas ?? []) as FilaSuscripcionCruda[]),
  );

  // =========================================================================
  // (a) GENERAR
  // =========================================================================

  const { data: filasEstado, error: errorEstado } = await supabase
    .from('v_hato_estado_actual')
    .select(
      'animal_id, numero, nombre, etapa, raza, estado, num_partos, ultimo_chequeo_fecha, ultimo_servicio_fecha, ultimo_parto_fecha, ultimo_secado_real_fecha, ultima_confirmacion_prenez_fecha, ultimo_evento_fecha, ultimo_estado_chequeo, ultima_confirmacion_prenez_metodo, ultimo_aborto_fecha',
    );
  if (errorEstado) {
    return respuestaError(c, 500, `No se pudo leer v_hato_estado_actual: ${errorEstado.message}`);
  }
  const animales = (filasEstado ?? []) as AnimalHatoParaAlertas[];

  const { data: filasPasos, error: errorPasos } = await supabase
    .from('hato_tratamiento_pasos')
    .select('id, fecha_programada, descripcion, hato_tratamientos(animal_id, hato_animales(numero, nombre))')
    .is('fecha_ejecutada', null);
  if (errorPasos) {
    return respuestaError(c, 500, `No se pudo leer hato_tratamiento_pasos: ${errorPasos.message}`);
  }
  const pasosPendientes: PasoTratamientoPendienteInput[] = ((filasPasos ?? []) as Array<Record<string, unknown>>)
    .map((fila) => {
      const tratamiento = fila.hato_tratamientos as
        | { animal_id: string; hato_animales: { numero: number | null; nombre: string | null } | { numero: number | null; nombre: string | null }[] | null }
        | { animal_id: string; hato_animales: { numero: number | null; nombre: string | null } | { numero: number | null; nombre: string | null }[] | null }[]
        | null;
      const t = Array.isArray(tratamiento) ? tratamiento[0] : tratamiento;
      const animalEmbebido = t?.hato_animales;
      const animal = Array.isArray(animalEmbebido) ? animalEmbebido[0] : animalEmbebido;
      if (!t) return null;
      return {
        paso_id: fila.id as string,
        animal_id: t.animal_id,
        numero: animal?.numero ?? null,
        nombre: animal?.nombre ?? null,
        fecha_programada: fila.fecha_programada as string,
        descripcion: (fila.descripcion as string | null) ?? null,
      };
    })
    .filter((p): p is PasoTratamientoPendienteInput => p !== null);

  // Se trae también `estado` (no solo `regla_clave`) porque la instrumentación
  // de cobertura de abajo (`resumirCoberturaAlertas`) necesita distinguir
  // "ya generada, nadie la resolvió todavía" de "un humano ya la descartó en
  // AlertasView" -- una distinción que un `Set` de puras claves no puede
  // expresar. `generarAlertasPendientes` sigue recibiendo el `Set` de
  // siempre (derivado de las claves del mismo `Map`, nunca de una segunda
  // consulta) -- su firma y su comportamiento no cambian una coma.
  const { data: filasReglas, error: errorReglas } = await supabase
    .from('hato_alertas')
    .select('regla_clave, estado');
  if (errorReglas) {
    return respuestaError(c, 500, `No se pudo leer hato_alertas: ${errorReglas.message}`);
  }
  const reglasExistentesConEstado = new Map<string, EstadoAlertaHato>(
    (filasReglas ?? []).map((f: { regla_clave: string; estado: EstadoAlertaHato }) => [f.regla_clave, f.estado]),
  );
  const reglasExistentes = new Set<string>(reglasExistentesConEstado.keys());

  const alertasNuevas: AlertaGenerada[] = generarAlertasPendientes(
    animales,
    pasosPendientes,
    hatoConfig,
    reglasExistentes,
    fechaReferencia,
  );

  // Instrumentación (hallazgo #4, PO 2026-08-24) -- puramente observacional,
  // no escribe nada en `hato_alertas` y no participa en absoluto de la
  // decisión de qué se genera (eso ya lo decidió la llamada de arriba). Ver
  // la cabecera de `resumirCoberturaAlertas` en `hato-alertas.ts`.
  const cobertura: ResumenCoberturaAlertas = resumirCoberturaAlertas(
    animales,
    pasosPendientes,
    hatoConfig,
    reglasExistentesConEstado,
    fechaReferencia,
  );

  if (alertasNuevas.length > 0) {
    const filasInsertar = alertasNuevas.map((a) => ({
      tipo: a.tipo,
      animal_id: a.animal_id,
      regla_clave: a.regla_clave,
      fecha_programada: a.fecha_programada,
      // paso_id es una columna real (FK) además de vivir en datos.paso_id --
      // el motor de tratamiento_paso lo necesita como columna propia para que
      // el resto del sistema (ej. marcar el paso ejecutado desde el callback
      // 'si') pueda hacer JOIN sin parsear el jsonb.
      paso_id: a.tipo === 'tratamiento_paso' ? (a.datos.paso_id as string) : null,
      // El mensaje no tiene columna dedicada en hato_alertas (056) -- vive en
      // datos, igual que enviada_en (ver cabecera del archivo).
      datos: { ...a.datos, mensaje: a.mensaje },
    }));
    const { error: errorInsert } = await supabase
      .from('hato_alertas')
      .upsert(filasInsertar, { onConflict: 'regla_clave', ignoreDuplicates: true });
    if (errorInsert) {
      return respuestaError(c, 500, `No se pudieron insertar las alertas generadas: ${errorInsert.message}`);
    }
  }

  // =========================================================================
  // (b) DESPACHAR
  // =========================================================================

  const { data: filasActivas, error: errorActivas } = await supabase
    .from('hato_alertas')
    .select('id, tipo, animal_id, regla_clave, fecha_programada, estado, intentos, destinatario_telegram_id, datos, updated_at')
    .in('estado', ['pendiente', 'enviada']);
  if (errorActivas) {
    return respuestaError(c, 500, `No se pudieron leer las alertas activas: ${errorActivas.message}`);
  }
  const activas = (filasActivas ?? []) as FilaAlertaActiva[];

  let enviadas = 0; // # de ALERTAS con al menos un envío exitoso en este tick
  let mensajesEnviados = 0; // # de mensajes de Telegram individuales enviados (broadcast)
  let saltadasSinDestinatario = 0;

  for (const alerta of activas) {
    const config = configPorTipo.get(alerta.tipo);
    if (!config || !config.activo) {
      saltadasSinDestinatario += 1;
      continue;
    }

    // Broadcast (096): TODOS los suscritos con recibe=true para esta clave,
    // no un único destinatario. `hato_alertas_config.destinatario_telegram_id`
    // ya no se lee -- ver cabecera del archivo.
    const clave = claveAlertaCatalogo(MODULO_ALERTAS, alerta.tipo);
    const destinatarios = suscriptoresPorClave.get(clave)?.recibe ?? [];
    if (destinatarios.length === 0) {
      saltadasSinDestinatario += 1;
      continue;
    }

    const debeEnviar =
      alerta.estado === 'pendiente' ||
      debeReenviar(
        { estado: alerta.estado, intentos: alerta.intentos, ultimo_intento_en: alerta.updated_at },
        fechaHoraReferencia,
      );
    if (!debeEnviar) continue;

    const mensaje = (alerta.datos?.mensaje as string | undefined) ?? 'Alerta del hato lechero (sin mensaje generado).';
    const botones = [
      { texto: 'Sí', callbackData: `hato_alerta:${alerta.id}:si` },
      { texto: 'Todavía no', callbackData: `hato_alerta:${alerta.id}:no` },
      { texto: 'Otra cosa', callbackData: `hato_alerta:${alerta.id}:otro` },
    ];

    // Un envío por suscrito -- un fallo puntual (chat bloqueado, etc.) NO
    // debe tumbar el envío a los demás suscritos de la misma alerta.
    let algunEnvioOk = false;
    let primerDestinatarioOk: string | null = null;
    const filasEnvios: Array<{ alerta_id: string; telegram_id: string; message_id: number | null; enviado_at: string }> = [];

    for (const telegramId of destinatarios) {
      const resultado = await enviarMensajeTelegram(supabase, {
        telegramId,
        texto: mensaje,
        tipoMensaje: 'alerta_hato',
        flujo: alerta.tipo,
        botones,
      });
      if (resultado.ok) {
        algunEnvioOk = true;
        mensajesEnviados += 1;
        if (!primerDestinatarioOk) primerDestinatarioOk = telegramId;
        // `message_id` es lo que permite editar este mensaje puntual cuando
        // otro suscrito cierre la alerta (telegram/bot.ts). Un reenvío
        // pisa la fila anterior de este mismo (alerta, telegram_id) a
        // propósito -- el mensaje viejo ya pasó los límites de edición de
        // Telegram (48h), el nuevo es el único editable de aquí en más.
        filasEnvios.push({
          alerta_id: alerta.id,
          telegram_id: telegramId,
          message_id: resultado.telegramMessageId ?? null,
          enviado_at: fechaHoraReferencia,
        });
      }
    }

    if (filasEnvios.length > 0) {
      const { error: errorEnvios } = await supabase
        .from('hato_alertas_envios')
        .upsert(filasEnvios, { onConflict: 'alerta_id,telegram_id' });
      if (errorEnvios) {
        console.error(`[hato-alertas-tick] no se pudieron registrar los envíos de la alerta ${alerta.id}:`, errorEnvios.message);
      }
    }

    const datosActualizados = algunEnvioOk && !alerta.datos?.enviada_en
      ? { ...alerta.datos, enviada_en: fechaHoraReferencia }
      : alerta.datos;

    const { error: errorUpdate } = await supabase
      .from('hato_alertas')
      .update({
        estado: algunEnvioOk ? 'enviada' : alerta.estado,
        intentos: alerta.intentos + 1,
        // "A quién se le envió primero" (096) -- se fija UNA sola vez, nunca
        // se pisa en reenvíos ni en despachos a suscritos nuevos.
        destinatario_telegram_id: alerta.destinatario_telegram_id ?? primerDestinatarioOk,
        datos: datosActualizados,
      })
      .eq('id', alerta.id);
    if (errorUpdate) {
      console.error(`[hato-alertas-tick] no se pudo actualizar la alerta ${alerta.id} tras el envío:`, errorUpdate.message);
      continue;
    }

    // Reflejar el cambio en memoria para que la fase (c) vea el estado
    // post-despacho sin una segunda consulta a la base.
    alerta.estado = algunEnvioOk ? 'enviada' : alerta.estado;
    alerta.intentos += 1;
    alerta.datos = datosActualizados;
    alerta.updated_at = fechaHoraReferencia;
    alerta.destinatario_telegram_id = alerta.destinatario_telegram_id ?? primerDestinatarioOk;

    if (algunEnvioOk) enviadas += 1;
  }

  // =========================================================================
  // (c) ESCALAR / EXPIRAR
  // =========================================================================

  // `HATO_ALERTAS_ESCALAMIENTO_TELEGRAM_ID` YA NO SE LEE -- desde 096 el
  // escalamiento es broadcast a los suscritos con escalamiento=true de cada
  // clave (ver cabecera del archivo). La variable de entorno queda sin uso
  // en este handler; no se borra del entorno por si algo más la necesitara.

  let escaladas = 0;
  let expiradas = 0;
  let mensajesEscalamiento = 0;

  for (const alerta of activas) {
    const config = configPorTipo.get(alerta.tipo);
    const horasEscalamiento = config?.horas_escalamiento ?? 48;
    // Instante del primer envío exitoso, guardado en `datos.enviada_en` en la
    // fase (b) (nunca sobreescrito por un reenvío -- ver cabecera del
    // archivo). El fallback a `fecha_programada` es solo para filas
    // `enviada` que hayan quedado de ANTES de que este handler empezara a
    // escribir `enviada_en` (no debería ocurrir en filas nuevas, ya que se
    // fija en el mismo tick del primer envío exitoso) -- nunca se usa para
    // una `pendiente` (decidirAccionEscalamiento ignora este valor salvo
    // cuando `estado === 'enviada'`).
    const anchorEnvio = (alerta.datos?.enviada_en as string | undefined) ?? alerta.fecha_programada;
    const accion = decidirAccionEscalamiento(
      { estado: alerta.estado, fecha_programada: alerta.fecha_programada },
      anchorEnvio,
      horasEscalamiento,
      fechaHoraReferencia,
    );
    if (accion === 'ninguna') continue;

    if (accion === 'expirar') {
      const { error } = await supabase.from('hato_alertas').update({ estado: 'expirada' }).eq('id', alerta.id);
      if (!error) expiradas += 1;
      else console.error(`[hato-alertas-tick] no se pudo expirar la alerta ${alerta.id}:`, error.message);
      continue;
    }

    // accion === 'escalar' -- Telegram no permite editar un mensaje pasadas
    // 48h: se manda uno NUEVO, nunca se edita el original. Broadcast (096):
    // a TODOS los suscritos con escalamiento=true para esta clave, no a un
    // único destinatario de la variable de entorno.
    const claveEscalamiento = claveAlertaCatalogo(MODULO_ALERTAS, alerta.tipo);
    const destinatariosEscalamiento = suscriptoresPorClave.get(claveEscalamiento)?.escalamiento ?? [];
    if (destinatariosEscalamiento.length > 0) {
      const mensajeBase = (alerta.datos?.mensaje as string | undefined) ?? 'Alerta del hato lechero (sin mensaje generado).';
      for (const telegramId of destinatariosEscalamiento) {
        const resultado = await enviarMensajeTelegram(supabase, {
          telegramId,
          texto: `⏰ Sin respuesta hace más de ${horasEscalamiento}h -- ${mensajeBase}`,
          tipoMensaje: 'alerta_hato_escalamiento',
          flujo: alerta.tipo,
        });
        if (resultado.ok) mensajesEscalamiento += 1;
      }
    }
    // Sin ningún suscrito con escalamiento=true -- se marca `escalada` sin
    // mandar nada, mismo contrato de antes (antes: sin la variable de
    // entorno configurada).
    const { error } = await supabase
      .from('hato_alertas')
      .update({ estado: 'escalada', escalada_at: fechaHoraReferencia })
      .eq('id', alerta.id);
    if (!error) escaladas += 1;
    else console.error(`[hato-alertas-tick] no se pudo escalar la alerta ${alerta.id}:`, error.message);
  }

  // =========================================================================
  // (d) EXPIRAR ALERTAS ATASCADAS EN UN ESTADO TERMINAL (D-24,
  //     docs/plan_hato_ronda_agosto_2026.md §0, hallazgo al cerrar S2)
  //
  // `decidirAccionEscalamiento` (fase c) solo puede actuar sobre alertas que
  // llegaron a esta fase en `pendiente`/`enviada` -- una vez que una alerta
  // pasa a `escalada` (48h sin respuesta) o `respondida` (Fernando contestó
  // "no"/"otro"), NINGÚN paso anterior de este tick vuelve a tocarla. Sin
  // esta fase, eso es exactamente lo que dejó 39 alertas `escalada`
  // atascadas para siempre desde julio (`destinatario_telegram_id` en NULL
  // -> nadie las respondía -> nada las cerraba). Migración 090 (T3b) ya
  // descartó el backlog viejo antes de que este fix llegara a producción --
  // esta fase mantiene la cola limpia de ahí en adelante, para alertas
  // nuevas. Consulta e INDEPENDIENTE de `activas` (fase b/c): esas dos filtran
  // por `pendiente`/`enviada`, esta por `escalada`/`respondida`, así que no
  // hay solapamiento posible entre las dos.
  // =========================================================================

  const { data: filasTerminales, error: errorTerminales } = await supabase
    .from('hato_alertas')
    .select('id, estado, escalada_at, updated_at')
    .in('estado', ['escalada', 'respondida']);

  let expiradasAtascadas = 0;

  if (errorTerminales) {
    console.error(`[hato-alertas-tick] no se pudieron leer las alertas escalada/respondida (fase d, D-24): ${errorTerminales.message}`);
  } else {
    for (const alerta of (filasTerminales ?? []) as FilaAlertaTerminal[]) {
      if (!decidirExpiracionTerminal(alerta, fechaHoraReferencia)) continue;
      const { error } = await supabase.from('hato_alertas').update({ estado: 'expirada' }).eq('id', alerta.id);
      if (!error) expiradasAtascadas += 1;
      else console.error(`[hato-alertas-tick] no se pudo expirar la alerta atascada ${alerta.id} (fase d, D-24):`, error.message);
    }
  }

  const resultado = {
    success: true,
    fechaReferencia,
    generadas: alertasNuevas.length,
    enviadas, // # de alertas con al menos un envío exitoso
    mensajes_enviados: mensajesEnviados, // # de mensajes de Telegram individuales (broadcast, 096)
    saltadas_sin_destinatario: saltadasSinDestinatario,
    escaladas,
    mensajes_escalamiento: mensajesEscalamiento,
    expiradas: expiradas + expiradasAtascadas,
    expiradas_atascadas: expiradasAtascadas,
    cobertura,
  };

  await registrarCorridaTick(supabase, {
    fechaReferencia,
    duracionMs: Date.now() - ahora.getTime(),
    cobertura,
    resultado,
  });

  return c.json(resultado);
}

// ---------------------------------------------------------------------------
// Instrumentación (hallazgo #4, PO 2026-08-24) -- persiste UNA fila por
// corrida en `hato_alertas_tick_runs` (migración 113) y emite además una
// línea de `console.log` estructurada. Dos canales a propósito, no
// redundancia: `query_logs` (edge functions) tiene una ventana de 24h --
// alcanza para revisar la corrida de esta madrugada, no para confirmar un
// patrón de varios días ("una alerta cada quince días"). La tabla es la que
// sobrevive más de 24h; el log es lo único que existe ANTES de que la
// migración 113 se aplique (esta migración se entrega sin aplicar, ver su
// cabecera).
//
// Contrato de esta función: NUNCA lanza, y su fallo NUNCA cambia la
// respuesta del tick ni qué alerta se generó -- todo lo que decide "qué
// generar/enviar/escalar" ya corrió antes de que esta función exista. Si la
// tabla todavía no existe (migración 113 sin aplicar) o el INSERT falla por
// cualquier otro motivo, se registra con `console.error` y se sigue --
// mismo contrato de "no abortar por un fallo de instrumentación" que ya usa
// el resto de este archivo para `hato_alertas_envios` (fase b, arriba).
// ---------------------------------------------------------------------------
async function registrarCorridaTick(
  supabase: ReturnType<typeof createClient>,
  args: {
    fechaReferencia: string;
    duracionMs: number;
    cobertura: ResumenCoberturaAlertas;
    resultado: Record<string, unknown>;
  },
): Promise<void> {
  const resumenLog = {
    tick: 'hato-alertas',
    fecha_referencia: args.fechaReferencia,
    duracion_ms: args.duracionMs,
    animales_evaluados: args.cobertura.animales_evaluados,
    animales_sin_raza: args.cobertura.animales_sin_raza,
    cobertura: args.cobertura.por_tipo,
    generadas: args.resultado.generadas,
    enviadas: args.resultado.enviadas,
    escaladas: args.resultado.escaladas,
    expiradas: args.resultado.expiradas,
  };
  // Línea única, estructurada -- pensada para leerse con `JSON.parse` desde
  // `query_logs`, no para leerse a simple vista.
  console.log(`[hato-alertas-tick] resumen: ${JSON.stringify(resumenLog)}`);

  const { error } = await supabase.from('hato_alertas_tick_runs').insert({
    fecha_referencia: args.fechaReferencia,
    estado: 'ok',
    duracion_ms: args.duracionMs,
    animales_evaluados: args.cobertura.animales_evaluados,
    animales_sin_raza: args.cobertura.animales_sin_raza,
    pasos_tratamiento_evaluados: args.cobertura.pasos_tratamiento_evaluados,
    cobertura: args.cobertura.por_tipo,
    generadas: args.resultado.generadas,
    enviadas: args.resultado.enviadas,
    mensajes_enviados: args.resultado.mensajes_enviados,
    saltadas_sin_destinatario: args.resultado.saltadas_sin_destinatario,
    escaladas: args.resultado.escaladas,
    mensajes_escalamiento: args.resultado.mensajes_escalamiento,
    expiradas: args.resultado.expiradas,
    expiradas_atascadas: args.resultado.expiradas_atascadas,
  });
  if (error) {
    // No aborta ni cambia la respuesta del tick -- ver el contrato en la
    // cabecera de esta función. Motivo esperable hasta que la migración 113
    // se aplique: la tabla todavía no existe (`42P01`).
    console.error(`[hato-alertas-tick] no se pudo registrar la corrida en hato_alertas_tick_runs: ${error.message}`);
  }
}
