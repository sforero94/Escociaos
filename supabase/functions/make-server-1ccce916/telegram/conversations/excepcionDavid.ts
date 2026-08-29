// telegram/conversations/excepcionDavid.ts — Fase 4 (Telegram, David) de
// docs/brief_tecnico_verificacion_inventario.md §7.2/§13: B-1/B-2 ("explicar
// antes de que escale" + "capturar el movimiento que faltaba") vía la
// conversación `excepcionDavid`.
//
// Escrita, como `cierreRonda.ts`, para UNA excepción puntual — Grammy
// permite pasar argumentos extra a `conversation.enter(id, ...args)`, que se
// reenvían al builder y sobreviven al replay entre webhooks (persistidos
// junto al resto del estado de la conversación). `/explicar` (bot.ts) llama
// `ctx.conversation.enter("excepcionDavid", excepcionId)` por CADA excepción
// que David elige de la lista.
//
// Asistente genuino (§7.2 lo pide explícito): confirmar/corregir la cita (o
// explicar de cero) → ¿hay respaldo? → si lo hay, tipo/cantidad/fecha/destino
// → confirmar. Cubre SOLO el camino (a) con respaldo (B-1/B-2); si NO hay
// respaldo, la conversación TERMINA ahí — la excepción queda `explicada` y
// **NO propone el ajuste acá**: `/proponer` es un comando aparte que pueden
// llamar tanto David como Uriel (B-5), no exclusivamente parte de este flujo.
//
// CA-38, literal: la `explicacion_citada` de Uriel NUNCA se convierte en la
// palabra de David sin que David toque un botón — aunque "confirmar" parezca
// trivial, sigue siendo la acción explícita que dispara
// `fn_ronda_explicacion_david` con `explicacion_david_accion='confirmo_cita'`.
//
// Rechaza explícitamente una nota de voz mientras está activa (mismo
// contrato que `cierreRonda.ts`) — cada paso que espera texto/botón lo dice
// si llega `message.voice`/`message.audio`.

import { Conversation } from 'npm:@grammyjs/conversations@2';
import { InlineKeyboard } from 'npm:grammy@1';
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { BotContext } from '../types.ts';
import {
  excepcionComoCaso,
  hoyBogota,
  mensajeErrorRpc,
  obtenerExcepcionDetalle,
  payloadActorTelegram,
} from '../ronda-helpers.ts';
import { formatearCantidad } from '../../rondaInventario/preview.ts';
import { renderCasoDavid, renderCitaDavid } from '../../rondaInventario/resolucion.ts';

function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function esCancelacionTexto(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return t === 'cancelar' || t === '/cancelar';
}

const ESTADOS_PENDIENTES_DAVID = ['reportada', 'explicacion_precargada'];

const ETIQUETAS_ESTADO: Record<string, string> = {
  reportada: 'reportada',
  explicacion_precargada: 'con la cita de Uriel sin confirmar',
  explicada: 'ya explicada',
  cerrada_sin_ajuste: 'cerrada sin ajuste',
  resuelta_con_captura: 'ya resuelta con captura',
  ajuste_propuesto: 'con un ajuste propuesto',
  ajuste_aprobado: 'con un ajuste ya aprobado',
  ajuste_desestimado: 'con un ajuste desestimado',
  ajuste_aplicado: 'con un ajuste ya aplicado',
};

// ---------------------------------------------------------------------------
// Fecha del movimiento — MISMO patrón hoy/otra que `eventoHato.ts`
// (`parseDDMM`/`fechaLegible`/`esCancelar`): "hoy" es SIEMPRE Bogotá
// (`hoyBogota()` de `ronda-helpers.ts`), nunca UTC. CA-8 exige la fecha REAL
// del movimiento, así que "otra fecha" tiene que aceptar texto libre, no sólo
// el botón de hoy.
// ---------------------------------------------------------------------------

function parseDDMM(texto: string, hoy: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (!m) return null;
  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const anio = Number(hoy.slice(0, 4));
  const iso = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  // Una fecha futura casi siempre es el año pasado mal escrito -- se corrige
  // al año anterior en vez de guardar un hecho que todavía no ocurrió (mismo
  // criterio que eventoHato.ts).
  return iso > hoy ? `${anio - 1}-${iso.slice(5)}` : iso;
}

function fechaLegible(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${d} de ${meses[m - 1]} ${a}`;
}

function parseCantidadPositiva(raw: string): number | null {
  const limpio = raw.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const num = Number(limpio);
  return Number.isFinite(num) && num > 0 ? num : null;
}

type TipoMovimientoCaptura = 'Entrada' | 'Salida por Aplicación' | 'Salida Otros';

export async function excepcionDavidConversation(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  excepcionId: string,
) {
  try {
    // NUNCA `ctx.telegramUser?.id` acá -- es una propiedad custom que la
    // auth middleware de bot.ts pone en `ctx` ANTES del plugin de
    // conversaciones (línea 182 vs 214), pero el plugin REPLAYA el builder
    // completo en cada update mientras la conversación está activa
    // (por eso TODA lectura de base de este archivo está envuelta en
    // `conversation.external()` -- ver el resto de este archivo), y esa
    // propiedad custom no sobrevivía el replay: es la ÚNICA conversación de
    // bot.ts que se entra con un argumento extra (`excepcionId`) y la ÚNICA
    // que reventaba con "no vinculada" pese a tener la cuenta activa
    // (hallazgo real de Santiago probando en vivo, 2026-08-28). Se
    // reconsulta acá, por `ctx.from.id` -- SIEMPRE nativo de grammY, nunca
    // inyectado por middleware propio -- envuelto en `external()` como toda
    // lectura de este archivo.
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.reply('Tu cuenta de Telegram no está vinculada -- avisa a un administrador.');
      return;
    }
    const telegramUsuario = await conversation.external(async () => {
      const { data } = await getSupabaseAdmin()
        .from('telegram_usuarios')
        .select('id')
        .eq('telegram_id', telegramId)
        .eq('activo', true)
        .maybeSingle();
      return data as { id: string } | null;
    });
    const telegramUsuarioId = telegramUsuario?.id;
    if (!telegramUsuarioId) {
      await ctx.reply('Tu cuenta de Telegram no está vinculada -- avisa a un administrador.');
      return;
    }

    // ── Paso 0: la excepción tiene que seguir pendiente de David ──────────
    const excepcion = await conversation.external(async () =>
      obtenerExcepcionDetalle(getSupabaseAdmin(), excepcionId),
    );
    if (!excepcion) {
      await ctx.reply('Esa discrepancia ya no existe.');
      return;
    }
    if (!ESTADOS_PENDIENTES_DAVID.includes(excepcion.estado)) {
      await ctx.reply(
        `Esa discrepancia ya no está pendiente de tu explicación -- está ${ETIQUETAS_ESTADO[excepcion.estado] ?? excepcion.estado}. Usa /explicar para ver lo que sigue pendiente.`,
      );
      return;
    }

    // ── Paso 1: mostrar el caso ────────────────────────────────────────────
    await ctx.reply(renderCasoDavid(excepcionComoCaso(excepcion)));

    // ── Paso 2: confirmar/corregir la cita, o explicar de cero (CA-38) ─────
    let explicacionDavid: string | null = null;
    let accion: 'confirmo_cita' | 'corrigio_cita' | 'explico_directo' | null = null;

    if (excepcion.explicacion_citada) {
      const kbCita = new InlineKeyboard()
        .text('✅ Confirmar', 'expl_confirmar_cita')
        .text('✏️ Corregir', 'expl_corregir_cita')
        .row()
        .text('❌ Cancelar', 'expl_cancelar');
      await ctx.reply(renderCitaDavid(excepcion.explicacion_citada), { reply_markup: kbCita });

      let corregir = false;
      while (accion === null) {
        const r = await conversation.wait();
        if (r.message?.voice || r.message?.audio) {
          await ctx.reply('Estás explicando una discrepancia -- toca un botón, o escribe *cancelar*.', { parse_mode: 'Markdown' });
          continue;
        }
        if (r.callbackQuery?.data === 'expl_cancelar') {
          await r.answerCallbackQuery();
          await ctx.reply('Cancelado. La discrepancia sigue pendiente -- usa /explicar cuando quieras retomarla.');
          return conversation.halt();
        }
        if (r.callbackQuery?.data === 'expl_confirmar_cita') {
          await r.answerCallbackQuery();
          await r.editMessageText(`Confirmaste: "${excepcion.explicacion_citada}"`);
          explicacionDavid = excepcion.explicacion_citada;
          accion = 'confirmo_cita';
          break;
        }
        if (r.callbackQuery?.data === 'expl_corregir_cita') {
          await r.answerCallbackQuery();
          await r.editMessageText('Vas a corregir la cita.');
          corregir = true;
          break;
        }
        const texto = r.message?.text;
        if (texto && esCancelacionTexto(texto)) {
          await ctx.reply('Cancelado. La discrepancia sigue pendiente -- usa /explicar cuando quieras retomarla.');
          return conversation.halt();
        }
        // callback/mensaje no reconocido -- se ignora, se sigue esperando.
      }

      if (corregir) {
        await ctx.reply('Escribe la explicación correcta:');
        while (explicacionDavid === null) {
          const r = await conversation.wait();
          if (r.message?.voice || r.message?.audio) {
            await ctx.reply('Necesito esto por texto -- escribe tu explicación, o *cancelar*.', { parse_mode: 'Markdown' });
            continue;
          }
          const texto = r.message?.text?.trim();
          if (texto && esCancelacionTexto(texto)) {
            await ctx.reply('Cancelado. La discrepancia sigue pendiente -- usa /explicar cuando quieras retomarla.');
            return conversation.halt();
          }
          if (!texto) {
            await ctx.reply('Necesito un texto -- escribe tu explicación, o *cancelar*.', { parse_mode: 'Markdown' });
            continue;
          }
          explicacionDavid = texto;
        }
        accion = 'corrigio_cita';
      }
    } else {
      await ctx.reply('No tengo ninguna cita de Uriel para esto -- ¿cuál es tu explicación?\n\n(o escribe *cancelar*)', { parse_mode: 'Markdown' });
      while (explicacionDavid === null) {
        const r = await conversation.wait();
        if (r.message?.voice || r.message?.audio) {
          await ctx.reply('Necesito esto por texto -- escribe tu explicación, o *cancelar*.', { parse_mode: 'Markdown' });
          continue;
        }
        const texto = r.message?.text?.trim();
        if (texto && esCancelacionTexto(texto)) {
          await ctx.reply('Cancelado. La discrepancia sigue pendiente -- usa /explicar cuando quieras retomarla.');
          return conversation.halt();
        }
        if (!texto) {
          await ctx.reply('Necesito un texto -- escribe tu explicación, o *cancelar*.', { parse_mode: 'Markdown' });
          continue;
        }
        explicacionDavid = texto;
      }
      accion = 'explico_directo';
    }

    // ── fn_ronda_explicacion_david ──────────────────────────────────────────
    const resultadoExpl = await conversation.external(async () => {
      const sb = getSupabaseAdmin();
      return await sb.rpc('fn_ronda_explicacion_david', {
        payload: {
          ...payloadActorTelegram(telegramUsuarioId),
          excepcion_id: excepcionId,
          explicacion_david: explicacionDavid,
          explicacion_david_accion: accion,
        },
      });
    });
    if (resultadoExpl.error) {
      await ctx.reply(`❌ No se pudo guardar tu explicación: ${mensajeErrorRpc(resultadoExpl.error)}`);
      return;
    }

    // ── Paso 3: ¿hay respaldo? (E6 del brief de producto) ───────────────────
    const kbRespaldo = new InlineKeyboard()
      .text('✅ Sí, hay un movimiento real', 'expl_resp_si')
      .row()
      .text('❌ No, no hace falta mover nada', 'expl_resp_no')
      .row()
      .text('⏹️ Terminar acá', 'expl_cancelar');
    await ctx.reply(
      '¿Hay un movimiento real que explique esto -- una aplicación, una entrega, un documento?',
      { reply_markup: kbRespaldo },
    );

    let hayRespaldo: boolean | null = null;
    while (hayRespaldo === null) {
      const r = await conversation.wait();
      if (r.message?.voice || r.message?.audio) {
        await ctx.reply('Toca un botón, o escribe *cancelar*.', { parse_mode: 'Markdown' });
        continue;
      }
      if (r.callbackQuery?.data === 'expl_cancelar') {
        await r.answerCallbackQuery();
        await r.editMessageText('Quedó registrada tu explicación. Nada más por ahora.');
        await ctx.reply(
          'La discrepancia quedó "explicada". Si más adelante hace falta un ajuste sin respaldo (pérdida, sustracción...), cualquiera de los dos -- tú o Uriel -- puede proponerlo con /proponer.',
        );
        return conversation.halt();
      }
      if (r.callbackQuery?.data === 'expl_resp_si') {
        await r.answerCallbackQuery();
        await r.editMessageText('Hay un movimiento real. Vamos a registrarlo.');
        hayRespaldo = true;
        break;
      }
      if (r.callbackQuery?.data === 'expl_resp_no') {
        await r.answerCallbackQuery();
        await r.editMessageText('No hace falta mover inventario.');
        hayRespaldo = false;
        break;
      }
      const texto = r.message?.text;
      if (texto && esCancelacionTexto(texto)) {
        await ctx.reply(
          'La discrepancia quedó "explicada". Si más adelante hace falta un ajuste sin respaldo (pérdida, sustracción...), cualquiera de los dos -- tú o Uriel -- puede proponerlo con /proponer.',
        );
        return conversation.halt();
      }
    }

    if (!hayRespaldo) {
      await ctx.reply(
        [
          'Listo -- tu explicación quedó guardada.',
          '',
          'Si más adelante hace falta un ajuste sin respaldo (pérdida, sustracción, o cualquier otra causa), tú o Uriel pueden proponerlo con /proponer. Si no hace falta nada más, Santiago lo va a ver igual en el historial de la ronda.',
        ].join('\n'),
      );
      return;
    }

    // ── Paso 4: tipo, cantidad, fecha, destino (B-2/CA-8) ───────────────────
    const kbTipo = new InlineKeyboard()
      .text('📥 Entrada', 'expl_tipo_entrada')
      .row()
      .text('📤 Salida por Aplicación', 'expl_tipo_salida_aplicacion')
      .row()
      .text('📤 Salida Otros', 'expl_tipo_salida_otros')
      .row()
      .text('❌ Cancelar', 'expl_cancelar');
    await ctx.reply('¿Qué tipo de movimiento fue?', { reply_markup: kbTipo });

    let tipoMovimiento: TipoMovimientoCaptura | null = null;
    while (tipoMovimiento === null) {
      const r = await conversation.wait();
      if (r.message?.voice || r.message?.audio) {
        await ctx.reply('Toca un botón, o escribe *cancelar*.', { parse_mode: 'Markdown' });
        continue;
      }
      if (r.callbackQuery?.data === 'expl_cancelar') {
        await r.answerCallbackQuery();
        await ctx.reply('Cancelado. La explicación ya quedó guardada -- puedes retomar la captura con /explicar cuando quieras.');
        return conversation.halt();
      }
      if (r.callbackQuery?.data === 'expl_tipo_entrada') {
        await r.answerCallbackQuery();
        await r.editMessageText('Tipo: Entrada.');
        tipoMovimiento = 'Entrada';
        break;
      }
      if (r.callbackQuery?.data === 'expl_tipo_salida_aplicacion') {
        await r.answerCallbackQuery();
        await r.editMessageText('Tipo: Salida por Aplicación.');
        tipoMovimiento = 'Salida por Aplicación';
        break;
      }
      if (r.callbackQuery?.data === 'expl_tipo_salida_otros') {
        await r.answerCallbackQuery();
        await r.editMessageText('Tipo: Salida Otros.');
        tipoMovimiento = 'Salida Otros';
        break;
      }
      const texto = r.message?.text;
      if (texto && esCancelacionTexto(texto)) {
        await ctx.reply('Cancelado. La explicación ya quedó guardada -- puedes retomar la captura con /explicar cuando quieras.');
        return conversation.halt();
      }
    }

    await ctx.reply(`¿Cuánto${excepcion.producto?.unidad_medida ? ` (${excepcion.producto.unidad_medida})` : ''}? Un número positivo.`);
    let cantidad: number | null = null;
    while (cantidad === null) {
      const r = await conversation.wait();
      if (r.message?.voice || r.message?.audio) {
        await ctx.reply('Necesito un número por texto, o *cancelar*.', { parse_mode: 'Markdown' });
        continue;
      }
      const texto = r.message?.text?.trim();
      if (texto && esCancelacionTexto(texto)) {
        await ctx.reply('Cancelado. La explicación ya quedó guardada -- puedes retomar la captura con /explicar cuando quieras.');
        return conversation.halt();
      }
      const parsed = texto ? parseCantidadPositiva(texto) : null;
      if (parsed === null) {
        await ctx.reply('No entendí ese número -- prueba de nuevo (ej: 12 o 12,5), o escribe *cancelar*.', { parse_mode: 'Markdown' });
        continue;
      }
      cantidad = parsed;
    }

    // Fecha REAL del movimiento -- CA-8 exige la fecha real, nunca "hoy" por
    // defecto (R-19/CA-8 tratan el número inventado igual de mal que el
    // teórico inventado). El botón de "hoy" existe porque MUCHAS veces sí es
    // hoy -- pero nunca es el default silencioso.
    const hoy = hoyBogota();
    const kbFecha = new InlineKeyboard()
      .text(`✅ Hoy (${fechaLegible(hoy)})`, 'expl_fecha_hoy')
      .row()
      .text('📅 Otra fecha', 'expl_fecha_otra')
      .row()
      .text('❌ Cancelar', 'expl_cancelar');
    await ctx.reply('¿Cuándo ocurrió el movimiento?', { reply_markup: kbFecha });

    let fechaMovimiento: string | null = null;
    let pidiendoFechaTexto = false;
    while (fechaMovimiento === null) {
      const r = await conversation.wait();
      if (r.message?.voice || r.message?.audio) {
        await ctx.reply('Toca un botón, o escribe la fecha por texto (DD/MM), o *cancelar*.', { parse_mode: 'Markdown' });
        continue;
      }
      if (!pidiendoFechaTexto) {
        if (r.callbackQuery?.data === 'expl_cancelar') {
          await r.answerCallbackQuery();
          await ctx.reply('Cancelado. La explicación ya quedó guardada -- puedes retomar la captura con /explicar cuando quieras.');
          return conversation.halt();
        }
        if (r.callbackQuery?.data === 'expl_fecha_hoy') {
          await r.answerCallbackQuery();
          await r.editMessageText(`Fecha: ${fechaLegible(hoy)}.`);
          fechaMovimiento = hoy;
          break;
        }
        if (r.callbackQuery?.data === 'expl_fecha_otra') {
          await r.answerCallbackQuery();
          await r.editMessageText('Escribe la fecha como DD/MM (ej: 12/08).');
          pidiendoFechaTexto = true;
          continue;
        }
      }
      const texto = r.message?.text?.trim();
      if (texto && esCancelacionTexto(texto)) {
        await ctx.reply('Cancelado. La explicación ya quedó guardada -- puedes retomar la captura con /explicar cuando quieras.');
        return conversation.halt();
      }
      if (!pidiendoFechaTexto) continue; // callback no reconocido -- se ignora
      const parsed = texto ? parseDDMM(texto, hoy) : null;
      if (parsed === null) {
        await ctx.reply('Formato inválido -- prueba DD/MM (ej: 12/08), o escribe *cancelar*.', { parse_mode: 'Markdown' });
        continue;
      }
      await ctx.reply(`Fecha: ${fechaLegible(parsed)}.`);
      fechaMovimiento = parsed;
    }

    // Campo opcional -- depende del tipo (CA-8: "con su tipo, fecha y destino").
    const etiquetaCampoOpcional = tipoMovimiento === 'Entrada'
      ? 'número de factura'
      : tipoMovimiento === 'Salida por Aplicación'
      ? 'lote de la aplicación'
      : 'observación';
    await ctx.reply(`¿Quieres agregar un ${etiquetaCampoOpcional}? Escríbelo, o escribe "no" para omitir.`);
    let campoOpcional: string | null = null;
    let pidiendoCampoOpcional = true;
    while (pidiendoCampoOpcional) {
      const r = await conversation.wait();
      if (r.message?.voice || r.message?.audio) {
        await ctx.reply('Necesito esto por texto -- escríbelo, "no" para omitir, o *cancelar*.', { parse_mode: 'Markdown' });
        continue;
      }
      const texto = r.message?.text?.trim();
      if (texto && esCancelacionTexto(texto)) {
        await ctx.reply('Cancelado. La explicación ya quedó guardada -- puedes retomar la captura con /explicar cuando quieras.');
        return conversation.halt();
      }
      if (!texto) {
        await ctx.reply('Escribe el texto, "no" para omitir, o *cancelar*.', { parse_mode: 'Markdown' });
        continue;
      }
      campoOpcional = texto.toLowerCase() === 'no' ? null : texto;
      pidiendoCampoOpcional = false;
    }

    // ── Paso 5: confirmar y registrar ───────────────────────────────────────
    const unidad = excepcion.producto?.unidad_medida ?? '';
    const kbConfirmar = new InlineKeyboard()
      .text('✅ Confirmar', 'expl_confirmar_captura')
      .row()
      .text('❌ Cancelar', 'expl_cancelar');
    await ctx.reply(
      [
        'Voy a registrar:',
        `- Tipo: ${tipoMovimiento}`,
        `- Cantidad: ${formatearCantidad(cantidad)}${unidad ? ` ${unidad}` : ''}`,
        `- Fecha: ${fechaLegible(fechaMovimiento)}`,
        campoOpcional ? `- ${etiquetaCampoOpcional}: ${campoOpcional}` : null,
        '',
        '¿Confirmas?',
      ]
        .filter((l): l is string => l !== null)
        .join('\n'),
      { reply_markup: kbConfirmar },
    );

    while (true) {
      const r = await conversation.wait();
      if (r.message?.voice || r.message?.audio) {
        await ctx.reply('Toca un botón para confirmar o cancelar.');
        continue;
      }
      if (r.callbackQuery?.data === 'expl_cancelar') {
        await r.answerCallbackQuery();
        await ctx.reply('Cancelado. La explicación ya quedó guardada -- puedes retomar la captura con /explicar cuando quieras.');
        return conversation.halt();
      }
      if (r.callbackQuery?.data === 'expl_confirmar_captura') {
        await r.answerCallbackQuery();
        break;
      }
      const texto = r.message?.text;
      if (texto && esCancelacionTexto(texto)) {
        await ctx.reply('Cancelado. La explicación ya quedó guardada -- puedes retomar la captura con /explicar cuando quieras.');
        return conversation.halt();
      }
    }

    const resultadoCaptura = await conversation.external(async () => {
      const sb = getSupabaseAdmin();
      return await sb.rpc('fn_ronda_resolver_con_captura', {
        payload: {
          ...payloadActorTelegram(telegramUsuarioId),
          excepcion_id: excepcionId,
          tipo_movimiento: tipoMovimiento,
          cantidad,
          fecha_movimiento: fechaMovimiento,
          observaciones: tipoMovimiento === 'Salida Otros' ? campoOpcional : null,
          factura: tipoMovimiento === 'Entrada' ? campoOpcional : null,
          lote_aplicacion: tipoMovimiento === 'Salida por Aplicación' ? campoOpcional : null,
          aplicacion_id: null,
        },
      });
    });

    if (resultadoCaptura.error) {
      await ctx.reply(`❌ No se pudo registrar el movimiento: ${mensajeErrorRpc(resultadoCaptura.error)}`);
      return;
    }

    await ctx.reply(
      [
        '✅ Movimiento registrado -- la discrepancia queda resuelta, sin pasar por Santiago.',
        'Va a aparecer en el reporte de cierre de la ronda.',
        '',
        'Usa /start para volver al menú.',
      ].join('\n'),
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Conversation already halted') return;
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[Telegram] excepcionDavid conversation error:', msg);
    await ctx.reply(`Error al explicar la discrepancia: ${msg}\n\nUsa /start para volver al menú.`);
  }
}
