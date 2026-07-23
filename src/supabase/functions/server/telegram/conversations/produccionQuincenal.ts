// telegram/conversations/produccionQuincenal.ts — Fortnightly milk-truck
// production capture (S5, Épica D2/V3 — docs/plan_hato_lechero_module.md
// §7.2/§7.5). Replaces the daily `litrosCamion` concept from the original
// design: the truck picks up daily and Fernando notes it on paper, but the
// system records the QUINCENA total — the cycle the Pomar settles on.
//
// Distinct data from `pesajeLeche`: litros al camión = producción/venta
// del hato; el pesaje por vaca = productividad individual. No cross-feed
// (decisión del dueño, segunda ronda 2026-07-22).
//
// `hato_produccion_quincenal` is written UPDATE-by-id-then-INSERT, never a
// PostgREST upsert (CLAUDE.md, same contract as the web form).

import { Conversation } from "npm:@grammyjs/conversations@2";
import { InlineKeyboard } from "npm:grammy@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { BotContext } from "../types.ts";
import { resolverQuincena, rangoQuincena, quincenaAnterior } from "../../calculos-hato.ts";

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

interface Quincena {
  anio: number;
  mes: number;
  quincena: 1 | 2;
}

function etiquetaQuincena(q: Quincena): string {
  return `${MESES[q.mes - 1]} ${q.anio} · ${q.quincena}ª quincena`;
}

/** Acepta "MM/AAAA/Q", ej. "07/2026/1". */
function parseQuincenaManual(text: string): Quincena | null {
  const match = text.trim().match(/^(\d{1,2})[/\-](\d{4})[/\-]([12])$/);
  if (!match) return null;
  const mes = parseInt(match[1], 10);
  const anio = parseInt(match[2], 10);
  const quincena = parseInt(match[3], 10) as 1 | 2;
  if (mes < 1 || mes > 12) return null;
  return { anio, mes, quincena };
}

function parseNumero(text: string): number | null {
  const n = parseFloat(text.trim().replace(",", "."));
  return isNaN(n) || n < 0 ? null : n;
}

export async function produccionQuincenalConversation(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
) {
  try {
    const actual = resolverQuincena(todayISO());
    const anterior = quincenaAnterior(actual);

    // ── Step 1: elegir quincena ───────────────────────────────────────

    const quincenaKb = new InlineKeyboard()
      .text(`✅ ${etiquetaQuincena(actual)}`, "q_actual")
      .row()
      .text(`⬅️ ${etiquetaQuincena(anterior)}`, "q_anterior")
      .row()
      .text("📝 Otra (MM/AAAA/Q)", "q_otra")
      .text("❌ Cancelar", "cancel_flow");

    await ctx.reply("🥛 *Producción quincenal (litros al camión)*\n\n¿Para qué quincena es este registro?", {
      reply_markup: quincenaKb,
      parse_mode: "Markdown",
    });

    const qCbCtx = await conversation.waitForCallbackQuery(["q_actual", "q_anterior", "q_otra", "cancel_flow"]);
    await qCbCtx.answerCallbackQuery();

    if (qCbCtx.callbackQuery.data === "cancel_flow") {
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }

    let quincena: Quincena;
    if (qCbCtx.callbackQuery.data === "q_actual") {
      quincena = actual;
    } else if (qCbCtx.callbackQuery.data === "q_anterior") {
      quincena = anterior;
    } else {
      await qCbCtx.editMessageText("📝 Escribe la quincena como MM/AAAA/Q (ej: 07/2026/1)");
      while (true) {
        const textCtx = await conversation.waitFor("message:text");
        const parsed = parseQuincenaManual(textCtx.message.text);
        if (parsed) {
          quincena = parsed;
          break;
        }
        await textCtx.reply("Formato inválido. Escribe como MM/AAAA/Q (ej: 07/2026/1)");
      }
    }
    await ctx.reply(`📅 Quincena: ${etiquetaQuincena(quincena)}`);

    // ── Step 2: cargar registro existente (si lo hay) ────────────────

    const existente = await conversation.external(async () => {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb
        .from("hato_produccion_quincenal")
        .select("id, litros_total, litros_pomar_confirmado, num_vacas_ordeno, notas")
        .eq("anio", quincena.anio)
        .eq("mes", quincena.mes)
        .eq("quincena", quincena.quincena)
        .maybeSingle();
      if (error) throw new Error(`Error consultando registro existente: ${error.message}`);
      return data;
    });

    if (existente) {
      await ctx.reply(
        `⚠️ Ya existe un registro para esta quincena: ${existente.litros_total} L totales` +
          (existente.num_vacas_ordeno != null ? `, ${existente.num_vacas_ordeno} vacas en ordeño` : "") +
          ".\nLo que digites a continuación lo actualiza.",
      );
    }

    // ── Step 3: litros totales (obligatorio) ─────────────────────────

    let litrosTotal: number;
    await ctx.reply("🚛 ¿Cuántos litros totales recogió el camión en esta quincena?");
    while (true) {
      const textCtx = await conversation.waitFor("message:text");
      const parsed = parseNumero(textCtx.message.text);
      if (parsed !== null) {
        litrosTotal = parsed;
        break;
      }
      await textCtx.reply("Ingresa un número válido (0 o más).");
    }

    // ── Step 4: litros confirmados por el Pomar (opcional) ───────────

    const skipKb = new InlineKeyboard().text("⏭ Saltar", "skip").text("❌ Cancelar", "cancel_flow");
    await ctx.reply(
      "📋 ¿Cuántos litros confirmó el Pomar? (puede diferir del total registrado — envía el número o Saltar)",
      { reply_markup: skipKb },
    );
    let litrosPomar: number | null = null;
    {
      const resp = await conversation.wait();
      if (resp.callbackQuery?.data === "cancel_flow") {
        await resp.answerCallbackQuery();
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }
      if (resp.callbackQuery?.data === "skip") {
        await resp.answerCallbackQuery();
      } else if (resp.message?.text) {
        litrosPomar = parseNumero(resp.message.text);
      }
    }

    // ── Step 5: vacas en ordeño (opcional, alimenta productividad D4/V4) ──

    await ctx.reply(
      "🐄 ¿Cuántas vacas estuvieron en ordeño esta quincena? (alimenta la productividad litros/vaca — envía el número o Saltar)",
      { reply_markup: skipKb },
    );
    let numVacasOrdeno: number | null = null;
    {
      const resp = await conversation.wait();
      if (resp.callbackQuery?.data === "cancel_flow") {
        await resp.answerCallbackQuery();
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }
      if (resp.callbackQuery?.data === "skip") {
        await resp.answerCallbackQuery();
      } else if (resp.message?.text) {
        const n = parseInt(resp.message.text.trim(), 10);
        numVacasOrdeno = isNaN(n) || n < 0 ? null : n;
      }
    }

    // ── Step 6: notas (opcional) ──────────────────────────────────────

    await ctx.reply("📝 ¿Alguna nota? (envía el texto o Saltar)", { reply_markup: skipKb });
    let notas: string | null = null;
    {
      const resp = await conversation.wait();
      if (resp.callbackQuery?.data === "cancel_flow") {
        await resp.answerCallbackQuery();
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }
      if (resp.message?.text) {
        notas = resp.message.text.trim() || null;
      }
    }

    // ── Step 7: confirmar y guardar ───────────────────────────────────

    const summary = [
      "🥛 *Producción quincenal*",
      "━━━━━━━━━━━━━━━",
      `📅 ${etiquetaQuincena(quincena)}`,
      `🚛 Litros totales: ${litrosTotal}`,
      litrosPomar != null ? `📋 Confirmado Pomar: ${litrosPomar}` : null,
      numVacasOrdeno != null ? `🐄 Vacas en ordeño: ${numVacasOrdeno}` : null,
      notas ? `📝 ${notas}` : null,
    ].filter(Boolean).join("\n");

    const confirmKb = new InlineKeyboard()
      .text("✅ Confirmar", "confirm")
      .text("❌ Cancelar", "cancel_flow");
    await ctx.reply(summary, { reply_markup: confirmKb, parse_mode: "Markdown" });

    const confirmCtx = await conversation.waitForCallbackQuery(["confirm", "cancel_flow"]);
    await confirmCtx.answerCallbackQuery();
    if (confirmCtx.callbackQuery.data === "cancel_flow") {
      await ctx.reply("Operación cancelada. No se guardó nada.");
      return conversation.halt();
    }

    const rango = rangoQuincena(quincena.anio, quincena.mes, quincena.quincena);

    await conversation.external(async () => {
      const sb = getSupabaseAdmin();
      const payload = {
        anio: quincena.anio,
        mes: quincena.mes,
        quincena: quincena.quincena,
        fecha_inicio: rango.fechaInicio,
        fecha_fin: rango.fechaFin,
        litros_total: litrosTotal,
        litros_pomar_confirmado: litrosPomar,
        num_vacas_ordeno: numVacasOrdeno,
        notas,
        fuente: "telegram",
      };
      if (existente) {
        const { error } = await sb
          .from("hato_produccion_quincenal")
          .update(payload)
          .eq("id", existente.id);
        if (error) throw new Error(`Error guardando: ${error.message}`);
      } else {
        const { error } = await sb.from("hato_produccion_quincenal").insert(payload);
        if (error) throw new Error(`Error guardando: ${error.message}`);
      }
    });

    await ctx.reply(
      `✅ Quincena ${existente ? "actualizada" : "registrada"}: ${etiquetaQuincena(quincena)}, ${litrosTotal} L.\n\nUsa /start para volver al menú.`,
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Conversation already halted") return;
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("[Telegram] Producción quincenal conversation error:", msg);
    await ctx.reply(`Error en el registro: ${msg}\n\nUsa /start para volver al menú.`);
  }
}
