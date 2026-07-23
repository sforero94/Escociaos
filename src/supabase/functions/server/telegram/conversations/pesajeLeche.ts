// telegram/conversations/pesajeLeche.ts — Weekly per-cow milk weighing (S5,
// Épica D1/V2 — docs/plan_hato_lechero_module.md §7.2/§7.5).
//
// Iterates active cows (hato_animales.etapa='vaca', estado='activa') asking
// for ONE total figure per cow (litros_total — am+pm already summed,
// migración 061; NEVER a split am/pm entry, that concept does not exist).
// Each answer is saved immediately (UPDATE-by-id if the row already exists
// for that date, INSERT otherwise) so a mid-conversation /cancelar never
// loses what was already entered — the natural way "salteable, reanudable"
// (plan §7.2) is honored without extra resume-state machinery: grammy
// conversations already persist progress across webhook calls, and
// per-answer saves mean there is nothing left to lose on exit.
//
// A cow the user skips gets NO row for that date — "no pesada", never 0
// (regla D del plan §6 Épica D, misma que rige monitoreo/ganado).

import { Conversation } from "npm:@grammyjs/conversations@2";
import { InlineKeyboard } from "npm:grammy@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { BotContext } from "../types.ts";
import { calcularFechaUltimoDiaPesaje } from "../../calculos-hato.ts";

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDDMM(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = new Date().getFullYear();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateSpanish(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${months[m - 1]} ${y}`;
}

interface VacaActiva {
  id: string;
  numero: number | null;
  nombre: string | null;
}

export async function pesajeLecheConversation(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
) {
  try {
    // ── Step 1: hato_config.dia_pesaje_semanal (nunca hardcodeado) ──────

    const config = await conversation.external(async () => {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb
        .from("hato_config")
        .select("valor")
        .eq("clave", "dia_pesaje_semanal")
        .maybeSingle();
      if (error) throw new Error(`Error leyendo configuración: ${error.message}`);
      const valor = data?.valor as { iso?: unknown; nombre?: unknown } | undefined;
      if (!valor || typeof valor.iso !== "number") {
        throw new Error("CONFIG_FALTANTE");
      }
      return { iso: valor.iso, nombre: typeof valor.nombre === "string" ? valor.nombre : `día ISO ${valor.iso}` };
    }).catch((err: unknown) => {
      if (err instanceof Error && err.message === "CONFIG_FALTANTE") return null;
      throw err;
    });

    if (!config) {
      await ctx.reply(
        "⚠️ No encontré la configuración del día de pesaje (hato_config.dia_pesaje_semanal). " +
          "Avisa a un administrador antes de continuar.",
      );
      return;
    }

    const fechaSugerida = calcularFechaUltimoDiaPesaje(todayISO(), config.iso);

    // ── Step 2: confirmar/ajustar fecha ──────────────────────────────

    const fechaKb = new InlineKeyboard()
      .text(`✅ ${formatDateSpanish(fechaSugerida)}`, "fecha_sugerida")
      .row()
      .text("📅 Otra fecha", "fecha_otra")
      .text("❌ Cancelar", "cancel_flow");

    await ctx.reply(
      `🐄 *Pesaje semanal de leche*\n\nSe pesa los ${config.nombre}. Fecha sugerida: *${formatDateSpanish(fechaSugerida)}*.`,
      { reply_markup: fechaKb, parse_mode: "Markdown" },
    );

    const fechaCbCtx = await conversation.waitForCallbackQuery(["fecha_sugerida", "fecha_otra", "cancel_flow"]);
    await fechaCbCtx.answerCallbackQuery();

    if (fechaCbCtx.callbackQuery.data === "cancel_flow") {
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }

    let fecha = fechaSugerida;
    if (fechaCbCtx.callbackQuery.data === "fecha_otra") {
      await fechaCbCtx.editMessageText("📅 Escribe la fecha en formato DD/MM (ej: 22/07)");
      while (true) {
        const textCtx = await conversation.waitFor("message:text");
        const parsed = parseDDMM(textCtx.message.text);
        if (parsed) {
          fecha = parsed;
          break;
        }
        await textCtx.reply("Formato inválido. Escribe la fecha como DD/MM (ej: 22/07)");
      }
    } else {
      await fechaCbCtx.editMessageText(`📅 Fecha: ${formatDateSpanish(fecha)}`);
    }

    // ── Step 3: cargar vacas activas + pesajes existentes de esa fecha ──

    const { vacas, existentes } = await conversation.external(async () => {
      const sb = getSupabaseAdmin();
      const { data: vacasData, error: vacasErr } = await sb
        .from("hato_animales")
        .select("id, numero, nombre")
        .eq("etapa", "vaca")
        .eq("estado", "activa")
        .order("numero", { ascending: true });
      if (vacasErr) throw new Error(`Error cargando vacas: ${vacasErr.message}`);

      const { data: pesajesData, error: pesajesErr } = await sb
        .from("hato_pesajes_leche")
        .select("id, animal_id, litros_total")
        .eq("fecha", fecha);
      if (pesajesErr) throw new Error(`Error cargando pesajes existentes: ${pesajesErr.message}`);

      const mapa = new Map<string, { id: string; litros_total: number }>();
      for (const p of pesajesData ?? []) {
        mapa.set(p.animal_id, { id: p.id, litros_total: p.litros_total });
      }
      return { vacas: (vacasData ?? []) as VacaActiva[], existentes: mapa };
    });

    if (vacas.length === 0) {
      await ctx.reply("No hay vacas activas registradas en el hato.");
      return;
    }

    // ── Step 4: iterar vacas ─────────────────────────────────────────

    let guardadas = 0;
    let saltadas = 0;
    let terminarTemprano = false;

    for (const vaca of vacas) {
      if (terminarTemprano) break;

      const etiqueta = `#${vaca.numero ?? "?"} ${vaca.nombre ?? "sin nombre"}`;
      const existente = existentes.get(vaca.id);
      const actual = existente ? ` (actual: ${existente.litros_total} L)` : "";

      const kb = new InlineKeyboard()
        .text("⏭ Saltar", "vaca_skip")
        .text("✅ Terminar aquí", "vaca_finish")
        .row()
        .text("❌ Cancelar", "cancel_flow");

      await ctx.reply(`🐄 *${etiqueta}*${actual}\n¿Cuántos litros dio?`, {
        reply_markup: kb,
        parse_mode: "Markdown",
      });

      // Loop until this cow resolves to skip/finish/cancel/valid-number —
      // an invalid text answer re-prompts the SAME cow, it never silently
      // advances to the next one.
      while (true) {
        const respuesta = await conversation.wait();

        if (respuesta.callbackQuery?.data === "cancel_flow") {
          await respuesta.answerCallbackQuery();
          await ctx.reply(
            `Operación cancelada. Los pesajes ya guardados (${guardadas}) quedan registrados — solo se descarta lo que faltaba.`,
          );
          return conversation.halt();
        }

        if (respuesta.callbackQuery?.data === "vaca_finish") {
          await respuesta.answerCallbackQuery();
          terminarTemprano = true;
          break;
        }

        if (respuesta.callbackQuery?.data === "vaca_skip") {
          await respuesta.answerCallbackQuery();
          saltadas++;
          break;
        }

        if (respuesta.message?.text) {
          const litros = parseFloat(respuesta.message.text.trim().replace(",", "."));
          if (isNaN(litros) || litros < 0) {
            await respuesta.reply("Ingresa un número válido (0 o más), o usa los botones.");
            continue;
          }

          const idGuardado = await conversation.external(async () => {
            const sb = getSupabaseAdmin();
            if (existente) {
              const { error } = await sb
                .from("hato_pesajes_leche")
                .update({ litros_total: litros })
                .eq("id", existente.id);
              if (error) throw new Error(`Error guardando: ${error.message}`);
              return existente.id;
            }
            const { data, error } = await sb
              .from("hato_pesajes_leche")
              .insert({ animal_id: vaca.id, fecha, litros_total: litros, fuente: "telegram" })
              .select("id")
              .single();
            if (error) throw new Error(`Error guardando: ${error.message}`);
            return data!.id as string;
          });

          existentes.set(vaca.id, { id: idGuardado, litros_total: litros });
          guardadas++;
          break;
        }

        await ctx.reply("No entendí la respuesta. Usa un número o los botones.");
      }
    }

    await ctx.reply(
      `✅ Pesaje del ${formatDateSpanish(fecha)} completado: ${guardadas} vaca${guardadas === 1 ? "" : "s"} pesada${guardadas === 1 ? "" : "s"}` +
        (saltadas > 0 ? `, ${saltadas} saltada${saltadas === 1 ? "" : "s"}.` : ".") +
        "\n\nUsa /start para volver al menú.",
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Conversation already halted") return;
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("[Telegram] Pesaje leche conversation error:", msg);
    await ctx.reply(`Error en el registro de pesaje: ${msg}\n\nUsa /start para volver al menú.`);
  }
}
