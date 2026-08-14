// telegram/enviar.ts — helper de envío SALIENTE de Telegram (S6, motor de
// alertas del Hato Lechero). Hasta esta sesión (S1-S5) el bot solo
// respondía dentro de una conversación que el usuario iniciaba (`bot.on`,
// `bot.command`, `bot.callbackQuery`) — este es el primer camino que le
// escribe a alguien SIN que haya escrito primero (el tick diario cron ->
// `hato-alertas-tick.ts`).
//
// Migración 096 (2026-08-14, suscripciones + broadcast con cierre por el
// primero) agrega `editarMensajeTelegram`/`cerrarAlertaEnEnvios`: cuando un
// suscrito responde una alerta que se mandó a VARIOS suscritos, los mensajes
// de los DEMÁS hay que editarlos para que se vea que ya se resolvió y por
// quién — pero esos mensajes viven en OTROS chats, no en el del que
// respondió, así que `ctx.editMessageText` (que solo edita el mensaje del
// `Context` actual) no alcanza. Estas dos funciones llaman directo a la Bot
// API con el `chat_id`/`message_id` guardados en `hato_alertas_envios` (la
// tabla de envíos del broadcast, una fila por (alerta, suscrito)).
//
// Deliberadamente NO reutiliza la instancia interna de `getBot()` de
// `bot.ts` (no está exportada, y exportarla acoplaría el tick al ciclo de
// vida completo del bot -- sesiones persistidas, plugin de conversations,
// middleware de auth que no aplican a un envío saliente disparado por cron).
// Llama directo a la Bot API de Telegram vía HTTP, con el MISMO token
// (`TELEGRAM_BOT_TOKEN`) que ya usa `bot.ts` -- sin dependencias nuevas.
//
// Contrato duro: un fallo de Telegram NUNCA lanza. El tick debe poder seguir
// procesando el resto de la cola aunque un envío puntual falle (chat
// bloqueado por el usuario, red, rate limit, token inválido) -- este helper
// devuelve `{ ok: false, error }` y el caller decide qué hacer (no
// incrementar `estado` a 'enviada', seguir con la siguiente alerta).
//
// Todo envío (éxito o fallo) se audita en `telegram_mensajes` (migración
// 026, la misma tabla que ya usa el bot para lo entrante) con
// `direccion: 'saliente'` -- así el historial de un chat no tiene un hueco
// para los mensajes que Escocia OS le mandó sin que él preguntara.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/** Un botón del teclado inline que acompaña la alerta (Sí / Todavía no /
 * Otra cosa, plan §6 Épica C). `callbackData` viaja tal cual en
 * `callback_query.data` -- el bot lo interpreta con
 * `bot.callbackQuery(/^hato_alerta:(.+):(si|no|otro)$/)`. */
export interface BotonAlertaTelegram {
  texto: string;
  callbackData: string;
}

export interface ResultadoEnvioTelegram {
  ok: boolean;
  telegramMessageId?: number;
  error?: string;
}

export interface OpcionesEnvioTelegram {
  /** `chat_id` de Telegram. Se recibe como string (aunque en la BD es
   * `bigint`) para no arriesgar pérdida de precisión al pasar por un
   * `number` de JS -- se convierte solo en el body de la request HTTP. */
  telegramId: string;
  texto: string;
  botones?: BotonAlertaTelegram[];
  /** FK a `telegram_usuarios.id`, si se conoce -- para el log. `null` cuando
   * se envía a un `telegram_id` que no tiene fila propia (no debería pasar
   * en la práctica, pero el log no debe fallar por eso). */
  telegramUsuarioId?: string | null;
  /** Distingue el tipo de mensaje en `telegram_mensajes.tipo_mensaje`, ej.
   * `'alerta_hato'` / `'alerta_hato_escalamiento'`. */
  tipoMensaje: string;
  flujo?: string | null;
}

function urlApiTelegram(metodo: string): string {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN no está configurado -- no se puede enviar por Telegram.');
  }
  return `https://api.telegram.org/bot${token}/${metodo}`;
}

async function registrarEnvio(
  supabase: SupabaseClient,
  opciones: OpcionesEnvioTelegram,
  resultado: ResultadoEnvioTelegram,
): Promise<void> {
  const { error } = await supabase.from('telegram_mensajes').insert({
    telegram_usuario_id: opciones.telegramUsuarioId ?? null,
    telegram_id: Number(opciones.telegramId),
    direccion: 'saliente',
    tipo_mensaje: opciones.tipoMensaje,
    contenido: { texto: opciones.texto, botones: opciones.botones ?? [], resultado },
    flujo: opciones.flujo ?? null,
  });
  if (error) {
    // El log es auditoría, no el camino crítico del envío -- un fallo de
    // INSERT no debe esconder el resultado del envío real ni abortar el tick.
    console.error('[hato-alertas][telegram_mensajes] error al registrar envío saliente:', error.message);
  }
}

/**
 * Envía un mensaje de texto (con botones inline opcionales) vía la Bot API
 * de Telegram y audita el intento -- éxito o fallo -- en `telegram_mensajes`.
 * NUNCA lanza: cualquier error de red/API/token se captura y se devuelve
 * como `{ ok: false, error }`, para que el tick pueda seguir con la
 * siguiente alerta de la cola sin que un chat bloqueado tumbe todo el ciclo.
 */
export async function enviarMensajeTelegram(
  supabase: SupabaseClient,
  opciones: OpcionesEnvioTelegram,
): Promise<ResultadoEnvioTelegram> {
  let resultado: ResultadoEnvioTelegram;
  try {
    const body: Record<string, unknown> = {
      chat_id: opciones.telegramId,
      text: opciones.texto,
    };
    if (opciones.botones && opciones.botones.length > 0) {
      body.reply_markup = {
        inline_keyboard: [opciones.botones.map((b) => ({ text: b.texto, callback_data: b.callbackData }))],
      };
    }

    const respuesta = await fetch(urlApiTelegram('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await respuesta.json().catch(() => null);

    if (!respuesta.ok || !json?.ok) {
      resultado = {
        ok: false,
        error: json?.description ?? `Telegram respondió HTTP ${respuesta.status}`,
      };
    } else {
      resultado = { ok: true, telegramMessageId: json.result?.message_id };
    }
  } catch (err) {
    resultado = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  await registrarEnvio(supabase, opciones, resultado);
  return resultado;
}

// ----------------------------------------------------------------------------
// Edición de un mensaje YA enviado, en un chat que puede no ser el que
// disparó el callback (migración 096, broadcast con cierre por el primero).
// ----------------------------------------------------------------------------

export interface OpcionesEdicionTelegram {
  /** `chat_id` de Telegram del mensaje a editar -- NO necesariamente el chat
   * de quien respondió la alerta (ese es el punto: se editan los mensajes de
   * los DEMÁS suscritos). */
  telegramId: string;
  /** `message_id` devuelto por `sendMessage` en su momento (guardado en
   * `hato_alertas_envios.message_id`). */
  messageId: number;
  texto: string;
}

/**
 * Edita el texto de un mensaje ya enviado, vía la Bot API (`editMessageText`)
 * -- nunca `ctx.editMessageText`, que solo sabe editar el mensaje del
 * `Context` en curso. Mismo contrato duro que `enviarMensajeTelegram`: NUNCA
 * lanza. Telegram rechaza editar un mensaje de más de 48h -- ese fallo (como
 * cualquier otro: chat bloqueado, mensaje borrado por el usuario) se
 * devuelve como `{ ok: false, error }` y el caller decide si sigue con el
 * siguiente destinatario del broadcast.
 *
 * No se audita en `telegram_mensajes` (a diferencia de `enviarMensajeTelegram`):
 * esa tabla registra mensajes NUEVOS, y una edición no es un mensaje nuevo --
 * el mensaje original ya quedó auditado cuando se mandó.
 */
export async function editarMensajeTelegram(opciones: OpcionesEdicionTelegram): Promise<ResultadoEnvioTelegram> {
  try {
    const respuesta = await fetch(urlApiTelegram('editMessageText'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: opciones.telegramId,
        message_id: opciones.messageId,
        text: opciones.texto,
      }),
    });
    const json = await respuesta.json().catch(() => null);
    if (!respuesta.ok || !json?.ok) {
      return { ok: false, error: json?.description ?? `Telegram respondió HTTP ${respuesta.status}` };
    }
    return { ok: true, telegramMessageId: opciones.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface ResultadoCierreAlertaEnvios {
  editados: number;
  fallidos: number;
}

/**
 * Edita el mensaje de CADA suscrito al que se le mandó una alerta
 * (`hato_alertas_envios`, una fila por (alerta_id, telegram_id)) para
 * mostrar que ya se resolvió -- el corazón del broadcast "cierre por el
 * primero" (migración 096). `excluirTelegramId` deja afuera el chat de quien
 * ACABA de responder: ese mensaje ya lo edita el propio callback vía
 * `ctx.editMessageReplyMarkup()` (más rápido, no necesita ir por la Bot API
 * con un `chat_id` explícito) -- editarlo dos veces por dos caminos distintos
 * es una carrera innecesaria contra el mismo mensaje.
 *
 * Un fallo puntual (mensaje ya editado más de 48h, chat bloqueado) no aborta
 * el resto -- se cuenta en `fallidos` y el caller decide si lo loguea.
 */
export async function cerrarAlertaEnEnvios(
  supabase: SupabaseClient,
  alertaId: string,
  excluirTelegramId: string | null,
  texto: string,
): Promise<ResultadoCierreAlertaEnvios> {
  const { data: envios, error } = await supabase
    .from('hato_alertas_envios')
    .select('telegram_id, message_id')
    .eq('alerta_id', alertaId);
  if (error) {
    console.error('[hato-alertas][hato_alertas_envios] no se pudieron leer los envíos para cerrar la alerta:', error.message);
    return { editados: 0, fallidos: 0 };
  }

  let editados = 0;
  let fallidos = 0;
  for (const envio of (envios ?? []) as Array<{ telegram_id: string; message_id: number | null }>) {
    if (excluirTelegramId && envio.telegram_id === excluirTelegramId) continue;
    if (envio.message_id == null) {
      fallidos += 1;
      continue;
    }
    const resultado = await editarMensajeTelegram({ telegramId: envio.telegram_id, messageId: envio.message_id, texto });
    if (resultado.ok) editados += 1;
    else fallidos += 1;
  }
  return { editados, fallidos };
}
