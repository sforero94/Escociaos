// telegram/conversations/cierreRonda.ts — Fase 3 (Telegram, Uriel) de
// docs/brief_tecnico_verificacion_inventario.md §7.2/§13: A-5 ("cerrar
// declarando qué recorrí") vía la conversación `cierreRonda`.
//
// Asistente genuino (§7.2 lo pide explícito, a diferencia del bucle de
// preview de la nota de voz, que NO es una conversación de Grammy — D-T9):
// ¿completo o parcial? (A-5/R-2) -> si parcial, ¿qué faltó? (texto libre a
// `alcance_nota`) -> confirmar -> `fn_ronda_cerrar` (migración 126).
//
// CA-5, literal: cerrar NO exige que las excepciones estén resueltas — la
// ronda y sus excepciones tienen ciclos de vida separados (§5.2 del brief
// de producto). Este archivo no bloquea el cierre por excepciones
// pendientes; sólo se lo informa a Uriel antes de que confirme, para que no
// sea una sorpresa.
//
// Rechaza explícitamente una nota de voz mientras está activa (§7.2: "Las
// dos conversaciones son cortas y explícitamente rechazan una nota de voz
// mientras están activas... el plugin se la tragaría en silencio") — cada
// paso que espera texto lo dice si llega un `message.voice`/`message.audio`.
//
// NO emite el reporte de cierre (C-1/CA-19): `fn_ronda_emitir_reporte` sólo
// lo llama el tick de la Fase 5, todavía sin construir. Cerrar una ronda hoy
// deja la fila en `rondas_inventario.estado = 'cerrada'`, lista para que el
// tick (cuando exista) arme y envíe el reporte a Santiago — este archivo lo
// dice explícito al usuario en vez de prometer un envío que hoy no ocurre.

import { Conversation } from 'npm:@grammyjs/conversations@2';
import { InlineKeyboard } from 'npm:grammy@1';
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { BotContext } from '../types.ts';
import {
  mensajeErrorRpc,
  obtenerResumenExcepcionesRonda,
  obtenerRondaEnCurso,
  payloadActorTelegram,
} from '../ronda-helpers.ts';

function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function esCancelacionTexto(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return t === 'cancelar' || t === '/cancelar';
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function nombrePeriodo(periodoIso: string): string {
  const [anio, mes] = periodoIso.split('-');
  return `${MESES[Number(mes) - 1] ?? mes} ${anio}`;
}

export async function cierreRondaConversation(conversation: Conversation<BotContext>, ctx: BotContext) {
  try {
    // NUNCA `ctx.telegramUser?.id` acá -- ver el comentario idéntico en
    // excepcionDavid.ts (hallazgo real de Santiago probando en vivo,
    // 2026-08-28): esa propiedad custom no sobrevive confiablemente el
    // replay del plugin de conversaciones. Se reconsulta por `ctx.from.id`
    // (nativo de grammY), envuelto en `external()` como el resto de este
    // archivo.
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

    // ── Paso 0: tiene que haber una ronda en_curso para cerrar. ───────────
    const ronda = await conversation.external(async () => obtenerRondaEnCurso(getSupabaseAdmin()));
    if (!ronda) {
      await ctx.reply('No hay ninguna ronda en curso para cerrar. Usa /ronda para ver el estado.');
      return;
    }

    const resumen = await conversation.external(async () =>
      obtenerResumenExcepcionesRonda(getSupabaseAdmin(), ronda.id),
    );

    // ── Paso 1: ¿completo o parcial? (A-5/R-2) ────────────────────────────
    const kbAlcance = new InlineKeyboard()
      .text('✅ Completo', 'cierre_completo')
      .text('⚠️ Parcial', 'cierre_parcial')
      .row()
      .text('❌ Cancelar', 'cierre_cancelar');
    await ctx.reply(
      [
        `🧮 *Cerrar la ronda de ${nombrePeriodo(ronda.periodo)}*`,
        '',
        `Hallazgos reportados: ${resumen.total} (${resumen.pendientes} todavía en curso, sin desenlace final).`,
        resumen.transcritosSinConfirmar > 0
          ? `⚠️ ${resumen.transcritosSinConfirmar} nota(s) de voz narrada(s) sin confirmar todavía -- al cerrar quedan como "sin confirmar", no se pierden, pero tampoco generan hallazgo.`
          : null,
        '',
        '¿Recorriste todo el catálogo que te mandé, o quedó parcial?',
      ]
        .filter((l): l is string => l !== null)
        .join('\n'),
      { reply_markup: kbAlcance, parse_mode: 'Markdown' },
    );

    let alcanceDeclarado: 'completo' | 'parcial' | null = null;
    let alcanceNota: string | null = null;

    while (alcanceDeclarado === null) {
      const respuesta = await conversation.wait();

      if (respuesta.message?.voice || respuesta.message?.audio) {
        await ctx.reply('Estás cerrando la ronda -- termina este paso o escribe *cancelar* antes de mandar una nota de voz.', {
          parse_mode: 'Markdown',
        });
        continue;
      }
      if (respuesta.callbackQuery?.data === 'cierre_cancelar') {
        await respuesta.answerCallbackQuery();
        await ctx.reply('Cierre cancelado. La ronda sigue en curso.');
        return conversation.halt();
      }
      if (respuesta.callbackQuery?.data === 'cierre_completo') {
        await respuesta.answerCallbackQuery();
        await respuesta.editMessageText('Alcance: completo.');
        alcanceDeclarado = 'completo';
        break;
      }
      if (respuesta.callbackQuery?.data === 'cierre_parcial') {
        await respuesta.answerCallbackQuery();
        await respuesta.editMessageText('Alcance: parcial.');
        alcanceDeclarado = 'parcial';
        break;
      }
      const texto = respuesta.message?.text;
      if (texto && esCancelacionTexto(texto)) {
        await ctx.reply('Cierre cancelado. La ronda sigue en curso.');
        return conversation.halt();
      }
      // callback/mensaje no reconocido -- se ignora, se sigue esperando.
    }

    // ── Paso 2: si fue parcial, ¿qué faltó? (texto libre) ─────────────────
    if (alcanceDeclarado === 'parcial') {
      await ctx.reply('¿Qué NO alcanzaste a recorrer? Descríbelo en pocas palabras.');
      while (alcanceNota === null) {
        const respuesta = await conversation.wait();
        if (respuesta.message?.voice || respuesta.message?.audio) {
          await ctx.reply('Necesito esto por texto -- describe qué faltó, o escribe *cancelar*.', { parse_mode: 'Markdown' });
          continue;
        }
        const texto = respuesta.message?.text?.trim();
        if (texto && esCancelacionTexto(texto)) {
          await ctx.reply('Cierre cancelado. La ronda sigue en curso.');
          return conversation.halt();
        }
        if (!texto) {
          await ctx.reply('Necesito una descripción en texto, o escribe *cancelar*.', { parse_mode: 'Markdown' });
          continue;
        }
        alcanceNota = texto;
      }
    }

    // ── Paso 3: confirmar ──────────────────────────────────────────────────
    const kbConfirmar = new InlineKeyboard()
      .text('✅ Confirmar cierre', 'cierre_confirmar')
      .text('❌ Cancelar', 'cierre_cancelar');
    await ctx.reply(
      [
        'Voy a cerrar la ronda con:',
        `- Alcance: ${alcanceDeclarado}${alcanceNota ? ` -- ${alcanceNota}` : ''}`,
        '',
        '¿Confirmas?',
      ].join('\n'),
      { reply_markup: kbConfirmar },
    );

    while (true) {
      const respuesta = await conversation.wait();
      if (respuesta.message?.voice || respuesta.message?.audio) {
        await ctx.reply('Toca un botón para confirmar o cancelar el cierre.');
        continue;
      }
      if (respuesta.callbackQuery?.data === 'cierre_cancelar') {
        await respuesta.answerCallbackQuery();
        await ctx.reply('Cierre cancelado. La ronda sigue en curso.');
        return conversation.halt();
      }
      if (respuesta.callbackQuery?.data === 'cierre_confirmar') {
        await respuesta.answerCallbackQuery();
        break;
      }
      const texto = respuesta.message?.text;
      if (texto && esCancelacionTexto(texto)) {
        await ctx.reply('Cierre cancelado. La ronda sigue en curso.');
        return conversation.halt();
      }
    }

    // ── Paso 4: fn_ronda_cerrar ────────────────────────────────────────────
    const resultado = await conversation.external(async () => {
      const sb = getSupabaseAdmin();
      return await sb.rpc('fn_ronda_cerrar', {
        payload: {
          ...payloadActorTelegram(telegramUsuarioId),
          ronda_id: ronda.id,
          alcance_declarado: alcanceDeclarado,
          alcance_nota: alcanceNota,
        },
      });
    });

    if (resultado.error) {
      await ctx.reply(`❌ No se pudo cerrar la ronda: ${mensajeErrorRpc(resultado.error)}`);
      return;
    }

    const datos = resultado.data as { transcritos_normalizados_sin_confirmar?: number } | null;
    const normalizados = datos?.transcritos_normalizados_sin_confirmar ?? 0;

    await ctx.reply(
      [
        `✅ Ronda de ${nombrePeriodo(ronda.periodo)} cerrada. Gracias por tu trabajo.`,
        normalizados > 0
          ? `${normalizados} nota(s) de voz quedaron sin confirmar -- David y Santiago las van a poder ver igual.`
          : null,
        '',
        'Usa /start para volver al menú.',
      ]
        .filter((l): l is string => l !== null)
        .join('\n'),
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Conversation already halted') return;
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[Telegram] cierreRonda conversation error:', msg);
    await ctx.reply(`Error al cerrar la ronda: ${msg}\n\nUsa /start para volver al menú.`);
  }
}
