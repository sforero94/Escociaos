// telegram/conversations/ingreso.ts — Income registration conversation
//
// Two flows:
// A) Regular ingreso (fin_ingresos): fecha → descripción → valor → negocio →
//    región → categoría → medio de pago → comprador → observaciones → confirm
// B) Ganado venta (fin_transacciones_ganado): triggered when negocio name
//    contains "ganado" (case-insensitive). Always tipo="venta". fecha → finca →
//    cabezas → kilos → precio/kilo → valor total → cliente → obs → confirm
//
// All steps support "← Atrás" for back navigation.

import { Conversation } from "npm:@grammyjs/conversations@2";
import { InlineKeyboard } from "npm:grammy@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { BotContext } from "../types.ts";

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LookupItem { id: string; nombre: string }

const GO_BACK_SENTINEL = { id: "__go_back__", nombre: "__go_back__" };

function formatCOP(value: number): string {
  const rounded = Math.round(value);
  return "$" + rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseValor(raw: string): number | null {
  const cleaned = raw.replace(/[$\s.]/g, "").replace(",", ".");
  const num = Number(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s.]/g, "").replace(",", ".");
  const num = Number(cleaned);
  return isNaN(num) || num < 0 ? null : num;
}

function parsePositiveInt(raw: string): number | null {
  const num = parseInt(raw.trim(), 10);
  return isNaN(num) || num <= 0 ? null : num;
}

const ITEMS_PER_PAGE = 8;

function buildPaginatedKeyboard(
  items: LookupItem[], page: number, callbackPrefix: string,
  extraButtons?: { text: string; data: string }[], showBack = false,
): { kb: InlineKeyboard; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const start = page * ITEMS_PER_PAGE;
  const slice = items.slice(start, start + ITEMS_PER_PAGE);
  const kb = new InlineKeyboard();
  for (let i = 0; i < slice.length; i += 2) {
    kb.text(slice[i].nombre, `${callbackPrefix}${slice[i].id}`);
    if (i + 1 < slice.length) kb.text(slice[i + 1].nombre, `${callbackPrefix}${slice[i + 1].id}`);
    kb.row();
  }
  if (extraButtons) for (const btn of extraButtons) kb.text(btn.text, btn.data).row();
  if (totalPages > 1) {
    if (page > 0) kb.text("← Anterior", `${callbackPrefix}prev`);
    if (page < totalPages - 1) kb.text("Siguiente →", `${callbackPrefix}next`);
    kb.row();
  }
  if (showBack) {
    kb.text("← Atrás", "go_back").text("❌ Cancelar", "cancel_flow").row();
  } else {
    kb.text("❌ Cancelar", "cancel_flow").row();
  }
  return { kb, totalPages };
}

async function waitForPaginatedSelection(
  conversation: Conversation<BotContext>, ctx: BotContext,
  items: LookupItem[], prompt: string, callbackPrefix: string,
  extraButtons?: { text: string; data: string }[], showBack = false,
): Promise<LookupItem> {
  let page = 0;
  const { kb } = buildPaginatedKeyboard(items, page, callbackPrefix, extraButtons, showBack);
  await ctx.reply(prompt, { reply_markup: kb });

  const allIds = items.map((i) => `${callbackPrefix}${i.id}`);
  const extraIds = (extraButtons ?? []).map((b) => b.data);
  const navIds = [`${callbackPrefix}prev`, `${callbackPrefix}next`];
  const backIds = showBack ? ["go_back"] : [];
  const allCallbacks = [...allIds, ...extraIds, ...navIds, ...backIds, "cancel_flow"];

  while (true) {
    const cbCtx = await conversation.waitForCallbackQuery(allCallbacks);
    await cbCtx.answerCallbackQuery();
    const data = cbCtx.callbackQuery.data;
    if (data === "go_back") return GO_BACK_SENTINEL;
    if (data === "cancel_flow") {
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }
    if (data === `${callbackPrefix}prev`) {
      page = Math.max(0, page - 1);
      const { kb: nk } = buildPaginatedKeyboard(items, page, callbackPrefix, extraButtons, showBack);
      await cbCtx.editMessageReplyMarkup({ reply_markup: nk }); continue;
    }
    if (data === `${callbackPrefix}next`) {
      page = Math.min(Math.ceil(items.length / ITEMS_PER_PAGE) - 1, page + 1);
      const { kb: nk } = buildPaginatedKeyboard(items, page, callbackPrefix, extraButtons, showBack);
      await cbCtx.editMessageReplyMarkup({ reply_markup: nk }); continue;
    }
    const extra = extraButtons?.find((b) => b.data === data);
    if (extra) return { id: extra.data, nombre: extra.text };
    const selectedId = data.replace(callbackPrefix, "");
    const item = items.find((i) => i.id === selectedId);
    if (item) { await cbCtx.editMessageText(`${prompt.split("\n")[0]} ${item.nombre}`); return item; }
  }
}

async function waitForTextWithBack(
  conversation: Conversation<BotContext>, ctx: BotContext, prompt: string,
): Promise<string | null> {
  const backKb = new InlineKeyboard()
    .text("← Atrás", "go_back")
    .text("❌ Cancelar", "cancel_flow");
  await ctx.reply(prompt, { reply_markup: backKb });
  while (true) {
    const response = await conversation.wait();
    if (response.callbackQuery?.data === "go_back") { await response.answerCallbackQuery(); return null; }
    if (response.callbackQuery?.data === "cancel_flow") {
      await response.answerCallbackQuery();
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }
    if (response.message?.text) { const t = response.message.text.trim(); if (t) return t; }
    await ctx.reply("Por favor escribe una respuesta válida.");
  }
}

async function waitForNumberWithBack(
  conversation: Conversation<BotContext>, ctx: BotContext, prompt: string,
  parser: (s: string) => number | null, errorMsg: string,
): Promise<number | null> {
  const backKb = new InlineKeyboard()
    .text("← Atrás", "go_back")
    .text("❌ Cancelar", "cancel_flow");
  await ctx.reply(prompt, { reply_markup: backKb });
  while (true) {
    const response = await conversation.wait();
    if (response.callbackQuery?.data === "go_back") { await response.answerCallbackQuery(); return null; }
    if (response.callbackQuery?.data === "cancel_flow") {
      await response.answerCallbackQuery();
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }
    if (response.message?.text) {
      const parsed = parser(response.message.text);
      if (parsed !== null) return parsed;
      await response.reply(errorMsg);
      continue;
    }
    await ctx.reply(errorMsg);
  }
}

function formatDateSpanish(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${d} de ${months[m - 1]} ${y}`;
}

function todayISO(): string { return new Date().toISOString().slice(0, 10); }

function yesterdayISO(): string {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
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

function isGanadoNegocio(nombre: string): boolean {
  const lower = nombre.toLowerCase();
  return lower.includes("ganado") || lower.includes("carne");
}

// ---------------------------------------------------------------------------
// Shared: fecha step
// ---------------------------------------------------------------------------

async function askFecha(
  conversation: Conversation<BotContext>, ctx: BotContext, title: string,
): Promise<string> {
  const kb = new InlineKeyboard()
    .text("Hoy", "fecha_hoy").text("Ayer", "fecha_ayer").text("Otra fecha", "fecha_otra")
    .row()
    .text("❌ Cancelar", "cancel_flow");
  await ctx.reply(`${title}\n\n📅 ¿Cuál es la fecha?`, { reply_markup: kb, parse_mode: "Markdown" });

  const cbCtx = await conversation.waitForCallbackQuery(["fecha_hoy", "fecha_ayer", "fecha_otra", "cancel_flow"]);
  await cbCtx.answerCallbackQuery();
  const choice = cbCtx.callbackQuery.data;

  if (choice === "cancel_flow") {
    await ctx.reply("Operación cancelada.");
    return conversation.halt();
  }

  if (choice === "fecha_hoy") return todayISO();
  if (choice === "fecha_ayer") return yesterdayISO();

  await cbCtx.editMessageText("📅 Escribe la fecha en formato DD/MM (ej: 09/03)");
  while (true) {
    const textCtx = await conversation.waitFor("message:text");
    const parsed = parseDDMM(textCtx.message.text);
    if (parsed) return parsed;
    await textCtx.reply("Formato inválido. Escribe la fecha como DD/MM (ej: 09/03)");
  }
}

// ---------------------------------------------------------------------------
// Shared: negocio step
// ---------------------------------------------------------------------------

async function askNegocio(
  conversation: Conversation<BotContext>, ctx: BotContext, showBack: boolean,
): Promise<LookupItem | null> {
  const negocios = await conversation.external(async () => {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("fin_negocios").select("id, nombre").eq("activo", true).order("nombre");
    if (error) throw new Error(`Error cargando negocios: ${error.message}`);
    return data ?? [];
  });
  if (negocios.length === 0) { await ctx.reply("No hay negocios configurados."); return null; }
  const selected = await waitForPaginatedSelection(conversation, ctx, negocios, "🏢 ¿De qué negocio?", "neg_", undefined, showBack);
  if (selected === GO_BACK_SENTINEL) return null;
  return selected;
}

// ===========================================================================
// GANADO SUB-FLOW
// ===========================================================================

async function ganadoFlow(
  conversation: Conversation<BotContext>, ctx: BotContext, fecha: string,
): Promise<boolean> {
  // Ganado ingreso is ALWAYS a sale (venta). No tipo selection needed.
  const tipo = "venta";
  let finca = "";
  let cantidadCabezas = 0;
  let kilosPagados = 0;
  let precioKilo = 0;
  let valorTotal = 0;
  let clienteProveedor = "";
  let observaciones: string | null = null;

  let step = 1;

  while (step > 0 && step <= 7) {
    // ── Step 1: Finca ──────────────────────────────────────────────
    if (step === 1) {
      const fincas = await conversation.external(async () => {
        const sb = getSupabaseAdmin();
        const { data, error } = await sb
          .from("fin_transacciones_ganado")
          .select("finca")
          .not("finca", "is", null);
        if (error) return [];
        const unique = [...new Set((data ?? []).map((r: { finca: string }) => r.finca).filter(Boolean))];
        unique.sort();
        return unique as string[];
      });

      const fincaItems: LookupItem[] = fincas.map((f, i) => ({ id: `f_${i}`, nombre: f }));
      const extraBtns = [{ text: "+ Nueva finca", data: "finca_nueva" }];

      if (fincaItems.length > 0) {
        const selected = await waitForPaginatedSelection(
          conversation, ctx, fincaItems, "🏡 ¿En qué finca?", "finca_", extraBtns, true,
        );
        if (selected === GO_BACK_SENTINEL) return false; // back to negocio selection
        if (selected.id === "finca_nueva") {
          const name = await waitForTextWithBack(conversation, ctx, "🏡 Escribe el nombre de la finca:");
          if (name === null) return false;
          finca = name;
        } else {
          finca = selected.nombre;
        }
      } else {
        const name = await waitForTextWithBack(conversation, ctx, "🏡 Escribe el nombre de la finca:");
        if (name === null) return false;
        finca = name;
      }
      step = 2;
      continue;
    }

    // ── Step 2: Cantidad de cabezas ────────────────────────────────
    if (step === 2) {
      const result = await waitForNumberWithBack(
        conversation, ctx,
        "🐄 ¿Cuántas cabezas?",
        parsePositiveInt,
        "Ingresa un número entero mayor a 0.",
      );
      if (result === null) { step = 1; continue; }
      cantidadCabezas = result;
      step = 3;
      continue;
    }

    // ── Step 3: Kilos ──────────────────────────────────────────────
    if (step === 3) {
      const result = await waitForNumberWithBack(
        conversation, ctx,
        "⚖️ ¿Cuántos kilos?",
        (s) => parseNumber(s),
        "Ingresa un número válido.",
      );
      if (result === null) { step = 2; continue; }
      kilosPagados = result;
      step = 4;
      continue;
    }

    // ── Step 4: Precio por kilo ────────────────────────────────────
    if (step === 4) {
      const result = await waitForNumberWithBack(
        conversation, ctx,
        "💲 ¿Precio por kilo?",
        parseValor,
        "Ingresa un valor numérico válido mayor a 0.",
      );
      if (result === null) { step = 3; continue; }
      precioKilo = result;
      valorTotal = Math.round(kilosPagados * precioKilo);
      step = 5;
      continue;
    }

    // ── Step 5: Valor total (pre-calculado, editable) ──────────────
    if (step === 5) {
      const backKb = new InlineKeyboard()
        .text("✅ Aceptar", "accept_total")
        .text("← Atrás", "go_back")
        .row()
        .text("❌ Cancelar", "cancel_flow");

      await ctx.reply(
        `💵 Valor total calculado: ${formatCOP(valorTotal)}\n\nToca Aceptar o escribe otro valor:`,
        { reply_markup: backKb },
      );

      while (true) {
        const response = await conversation.wait();
        if (response.callbackQuery?.data === "cancel_flow") {
          await response.answerCallbackQuery();
          await ctx.reply("Operación cancelada.");
          return conversation.halt();
        }
        if (response.callbackQuery?.data === "go_back") {
          await response.answerCallbackQuery();
          step = 4;
          break;
        }
        if (response.callbackQuery?.data === "accept_total") {
          await response.answerCallbackQuery();
          step = 6;
          break;
        }
        if (response.message?.text) {
          const parsed = parseValor(response.message.text);
          if (parsed) { valorTotal = parsed; step = 6; break; }
          await response.reply("Ingresa un valor numérico válido.");
        }
      }
      continue;
    }

    // ── Step 6: Cliente ─────────────────────────────────────────────
    if (step === 6) {
      const tableName = "fin_compradores";
      const label = "Cliente";

      const items = await conversation.external(async () => {
        const sb = getSupabaseAdmin();
        const { data, error } = await sb.from(tableName).select("id, nombre").eq("activo", true).order("nombre");
        if (error) return [];
        return (data ?? []) as LookupItem[];
      });

      const skipBtn = [{ text: "Saltar ⏩", data: "skip_cp" }];

      if (items.length > 0) {
        const selected = await waitForPaginatedSelection(
          conversation, ctx, items, `🧑‍💼 ¿${label}? (opcional)`, "cp_", skipBtn, true,
        );
        if (selected === GO_BACK_SENTINEL) { step = 5; continue; }
        clienteProveedor = selected.id === "skip_cp" ? "" : selected.nombre;
      } else {
        const name = await waitForTextWithBack(conversation, ctx, `🧑‍💼 Nombre del ${label.toLowerCase()} (o escribe para saltar):`);
        if (name === null) { step = 5; continue; }
        clienteProveedor = name;
      }
      step = 7;
      continue;
    }

    // ── Step 7: Observaciones + Confirmación ───────────────────────
    if (step === 7) {
      const obsKb = new InlineKeyboard()
        .text("← Atrás", "go_back")
        .text("Saltar ⏩", "skip_obs")
        .row()
        .text("❌ Cancelar", "cancel_flow");
      await ctx.reply("📝 ¿Observaciones? (opcional)", { reply_markup: obsKb });

      const obsResponse = await conversation.wait();
      if (obsResponse.callbackQuery?.data === "go_back") { await obsResponse.answerCallbackQuery(); step = 6; continue; }
      if (obsResponse.callbackQuery?.data === "cancel_flow") {
        await obsResponse.answerCallbackQuery();
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }
      if (obsResponse.callbackQuery?.data === "skip_obs") { await obsResponse.answerCallbackQuery(); observaciones = null; }
      else if (obsResponse.message?.text) { observaciones = obsResponse.message.text.trim() || null; }
      else { observaciones = null; }

      // Confirmation
      const cpLine = clienteProveedor ? `\n🧑‍💼 Cliente: ${clienteProveedor}` : "";
      const obsLine = observaciones ? `\n📝 ${observaciones}` : "";

      const summary = [
        "🐄 *Transacción de Ganado*",
        "━━━━━━━━━━━━━━━",
        `📅 Fecha: ${formatDateSpanish(fecha)}`,
        `📊 Tipo: Venta`,
        `🏡 Finca: ${finca}`,
        `🐄 Cabezas: ${cantidadCabezas}`,
        `⚖️ Kilos: ${kilosPagados}`,
        `💲 Precio/kg: ${formatCOP(precioKilo)}`,
        `💵 Valor total: ${formatCOP(valorTotal)}`,
        cpLine,
        obsLine,
      ].filter(Boolean).join("\n");

      const confirmKb = new InlineKeyboard()
        .text("✅ Confirmar", "ganado_confirm")
        .text("← Atrás", "ganado_back")
        .row()
        .text("✏️ Corregir", "ganado_correct")
        .text("❌ Cancelar", "ganado_cancel");

      await ctx.reply(summary, { reply_markup: confirmKb, parse_mode: "Markdown" });

      const confirmCtx = await conversation.waitForCallbackQuery([
        "ganado_confirm", "ganado_back", "ganado_correct", "ganado_cancel", "cancel_flow",
      ]);
      await confirmCtx.answerCallbackQuery();
      const action = confirmCtx.callbackQuery.data;

      if (action === "cancel_flow") {
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }
      if (action === "ganado_cancel") { await ctx.reply("❌ Transacción cancelada."); return false; }
      if (action === "ganado_back") { step = 6; continue; }
      if (action === "ganado_correct") { step = 1; continue; }

      // Insert
      const insertError = await conversation.external(async () => {
        const sb = getSupabaseAdmin();
        const { error } = await sb.from("fin_transacciones_ganado").insert({
          fecha,
          tipo,
          finca: finca || null,
          cliente_proveedor: clienteProveedor || null,
          cantidad_cabezas: cantidadCabezas,
          kilos_pagados: kilosPagados || null,
          precio_kilo: precioKilo || null,
          valor_total: valorTotal,
          observaciones: observaciones ?? null,
        });
        return error?.message ?? null;
      });

      if (insertError) { await ctx.reply(`Error al guardar: ${insertError}`); return false; }
      await ctx.reply("✅ Transacción de ganado registrada.");
      return true;
    }
  }

  return false;
}

// ===========================================================================
// REGULAR INGRESO FLOW
// ===========================================================================

async function regularIngresoFlow(
  conversation: Conversation<BotContext>, ctx: BotContext,
  fecha: string, negocio: LookupItem,
): Promise<boolean> {
  let nombre = "";
  let valor = 0;
  let region: LookupItem | null = null;
  let categoria: LookupItem | null = null;
  let medioPago: LookupItem | null = null;
  let comprador: LookupItem | null = null;
  let observaciones: string | null = null;

  // Steps: 1=descripción, 2=valor, 3=región, 4=categoría, 5=medio pago,
  //         6=comprador, 7=observaciones+confirm
  let step = 1;

  while (step > 0 && step <= 7) {
    if (step === 1) {
      const result = await waitForTextWithBack(conversation, ctx, "📝 ¿Descripción del ingreso?");
      if (result === null) return false; // back to negocio
      nombre = result;
      step = 2; continue;
    }

    if (step === 2) {
      const result = await waitForNumberWithBack(
        conversation, ctx, "💵 ¿Cuál es el valor?",
        parseValor, "Ingresa un valor numérico válido mayor a 0.",
      );
      if (result === null) { step = 1; continue; }
      valor = result;
      await ctx.reply(`💵 Valor: ${formatCOP(valor)}`);
      step = 3; continue;
    }

    if (step === 3) {
      const regiones = await conversation.external(async () => {
        const sb = getSupabaseAdmin();
        const { data, error } = await sb.from("fin_regiones").select("id, nombre").eq("activo", true).order("nombre");
        if (error) throw new Error(error.message);
        return data ?? [];
      });
      if (regiones.length === 0) { await ctx.reply("No hay regiones configuradas."); return false; }
      const selected = await waitForPaginatedSelection(conversation, ctx, regiones, "📍 ¿En qué región?", "reg_", undefined, true);
      if (selected === GO_BACK_SENTINEL) { step = 2; continue; }
      region = selected;
      step = 4; continue;
    }

    if (step === 4) {
      const categorias = await conversation.external(async () => {
        const sb = getSupabaseAdmin();
        const { data, error } = await sb.from("fin_categorias_ingresos").select("id, nombre")
          .eq("negocio_id", negocio.id).eq("activo", true).order("nombre");
        if (error) throw new Error(error.message);
        return data ?? [];
      });
      if (categorias.length === 0) {
        await ctx.reply(`No hay categorías de ingreso para ${negocio.nombre}.`);
        return false;
      }
      const selected = await waitForPaginatedSelection(conversation, ctx, categorias, "📂 ¿Categoría?", "cati_", undefined, true);
      if (selected === GO_BACK_SENTINEL) { step = 3; continue; }
      categoria = selected;
      step = 5; continue;
    }

    if (step === 5) {
      const medios = await conversation.external(async () => {
        const sb = getSupabaseAdmin();
        const { data, error } = await sb.from("fin_medios_pago").select("id, nombre").eq("activo", true).order("nombre");
        if (error) throw new Error(error.message);
        return data ?? [];
      });
      if (medios.length === 0) { await ctx.reply("No hay medios de pago configurados."); return false; }
      const selected = await waitForPaginatedSelection(conversation, ctx, medios, "💳 ¿Medio de pago?", "mp_", undefined, true);
      if (selected === GO_BACK_SENTINEL) { step = 4; continue; }
      medioPago = selected;
      step = 6; continue;
    }

    if (step === 6) {
      const compradores = await conversation.external(async () => {
        const sb = getSupabaseAdmin();
        const { data, error } = await sb.from("fin_compradores").select("id, nombre").eq("activo", true).order("nombre");
        if (error) return [];
        return data ?? [];
      });
      const skipBtn = [{ text: "Saltar ⏩", data: "skip_comprador" }];
      if (compradores.length === 0) {
        comprador = null;
      } else {
        const selected = await waitForPaginatedSelection(conversation, ctx, compradores, "🧑‍💼 ¿Comprador? (opcional)", "comp_", skipBtn, true);
        if (selected === GO_BACK_SENTINEL) { step = 5; continue; }
        comprador = selected.id === "skip_comprador" ? null : selected;
      }
      step = 7; continue;
    }

    if (step === 7) {
      const obsKb = new InlineKeyboard()
        .text("← Atrás", "go_back")
        .text("Saltar ⏩", "skip_obs")
        .row()
        .text("❌ Cancelar", "cancel_flow");
      await ctx.reply("📝 ¿Observaciones? (opcional)", { reply_markup: obsKb });

      const obsResponse = await conversation.wait();
      if (obsResponse.callbackQuery?.data === "go_back") { await obsResponse.answerCallbackQuery(); step = 6; continue; }
      if (obsResponse.callbackQuery?.data === "cancel_flow") {
        await obsResponse.answerCallbackQuery();
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }
      if (obsResponse.callbackQuery?.data === "skip_obs") { await obsResponse.answerCallbackQuery(); observaciones = null; }
      else if (obsResponse.message?.text) { observaciones = obsResponse.message.text.trim() || null; }
      else { observaciones = null; }

      // Confirmation
      const compradorLine = comprador ? `\n🧑‍💼 Comprador: ${comprador.nombre}` : "";
      const obsLine = observaciones ? `\n📝 ${observaciones}` : "";

      const summary = [
        "💰 *Registro de Ingreso*",
        "━━━━━━━━━━━━━━━",
        `📅 Fecha: ${formatDateSpanish(fecha)}`,
        `📝 ${nombre}`,
        `💵 Valor: ${formatCOP(valor)}`,
        `🏢 Negocio: ${negocio.nombre}`,
        `📍 Región: ${region!.nombre}`,
        `📂 Categoría: ${categoria!.nombre}`,
        `💳 Medio de pago: ${medioPago!.nombre}`,
        compradorLine, obsLine,
      ].filter(Boolean).join("\n");

      const confirmKb = new InlineKeyboard()
        .text("✅ Confirmar", "ingreso_confirm")
        .text("← Atrás", "ingreso_back")
        .row()
        .text("✏️ Corregir", "ingreso_correct")
        .text("❌ Cancelar", "ingreso_cancel");

      await ctx.reply(summary, { reply_markup: confirmKb, parse_mode: "Markdown" });

      const confirmCtx = await conversation.waitForCallbackQuery([
        "ingreso_confirm", "ingreso_back", "ingreso_correct", "ingreso_cancel", "cancel_flow",
      ]);
      await confirmCtx.answerCallbackQuery();
      const action = confirmCtx.callbackQuery.data;

      if (action === "cancel_flow") {
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }
      if (action === "ingreso_cancel") { await ctx.reply("❌ Ingreso cancelado."); return false; }
      if (action === "ingreso_back") { step = 6; continue; }
      if (action === "ingreso_correct") { step = 1; continue; }

      const insertError = await conversation.external(async () => {
        const sb = getSupabaseAdmin();
        const { error } = await sb.from("fin_ingresos").insert({
          fecha, nombre, valor,
          negocio_id: negocio.id,
          region_id: region!.id,
          categoria_id: categoria!.id,
          medio_pago_id: medioPago!.id,
          comprador_id: comprador?.id ?? null,
          observaciones: observaciones ?? null,
        });
        return error?.message ?? null;
      });

      if (insertError) { await ctx.reply(`Error al guardar: ${insertError}`); return false; }
      await ctx.reply("✅ Ingreso registrado correctamente.");
      return true;
    }
  }

  return false;
}

// ===========================================================================
// MAIN CONVERSATION
// ===========================================================================

export async function ingresoConversation(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
) {
  try {
  let continueRegistering = true;

  while (continueRegistering) {
    // Step A: Fecha
    const fecha = await askFecha(conversation, ctx, "💰 *Registro de Ingreso*");
    await ctx.reply(`📅 Fecha: ${formatDateSpanish(fecha)}`);

    // Step B: Negocio (determines which sub-flow)
    let negocioSelected = false;
    while (!negocioSelected) {
      const negocio = await askNegocio(conversation, ctx, true);
      if (negocio === null) {
        // Backed out — just restart fecha
        break;
      }

      let success: boolean;

      if (isGanadoNegocio(negocio.nombre)) {
        // Ganado sub-flow
        success = await ganadoFlow(conversation, ctx, fecha);
        if (!success) {
          // User backed out of ganado step 1 → re-show negocio
          continue;
        }
      } else {
        // Regular ingreso sub-flow
        success = await regularIngresoFlow(conversation, ctx, fecha, negocio);
        if (!success) {
          // User backed out of first step → re-show negocio
          continue;
        }
      }

      negocioSelected = true;
    }

    if (!negocioSelected) {
      // User backed from negocio to fecha — restart
      continue;
    }

    // Post-registration
    const postKb = new InlineKeyboard()
      .text("💰 Otro ingreso", "post_another")
      .text("🏠 Menú principal", "post_menu")
      .row()
      .text("❌ Cancelar", "cancel_flow");

    await ctx.reply("¿Qué deseas hacer?", { reply_markup: postKb });

    const postCtx = await conversation.waitForCallbackQuery(["post_another", "post_menu", "cancel_flow"]);
    await postCtx.answerCallbackQuery();

    if (postCtx.callbackQuery.data === "cancel_flow") {
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }

    if (postCtx.callbackQuery.data !== "post_another") {
      continueRegistering = false;
    }
  }

  await ctx.reply("Usa /start para volver al menú.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("[Telegram] Ingreso conversation error:", msg);
    await ctx.reply(`Error en el registro: ${msg}\n\nUsa /start para volver al menú.`);
  }
}
