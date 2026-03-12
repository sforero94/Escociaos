import { Conversation } from "npm:@grammyjs/conversations@2";
import { InlineKeyboard } from "npm:grammy@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { BotContext } from "../types.ts";

function isGanadoNegocio(nombre: string): boolean {
  const lower = nombre.toLowerCase();
  return lower.includes("ganado") || lower.includes("carne");
}

// ---------------------------------------------------------------------------
// Supabase admin client (service role, same pattern as bot.ts)
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LookupItem {
  id: string;
  nombre: string;
}

// Sentinel returned by paginated selection when user presses "Atrás"
const GO_BACK_SENTINEL = { id: "__go_back__", nombre: "__go_back__" };

/** Format a number in Colombian style: dots as thousands separator, no decimals. */
function formatCOP(value: number): string {
  const rounded = Math.round(value);
  return "$" + rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Parse a numeric string, stripping dots/commas/spaces/dollar signs. */
function parseValor(raw: string): number | null {
  const cleaned = raw.replace(/[$\s.]/g, "").replace(",", ".");
  const num = Number(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

/**
 * Build a paginated inline keyboard from a list of items.
 * 2 buttons per row, max 4 rows of items (8 items) per page,
 * plus optional extra buttons and prev/next navigation.
 */
function buildPaginatedKeyboard(
  items: LookupItem[],
  page: number,
  callbackPrefix: string,
  extraButtons?: { text: string; data: string }[],
  showBack?: boolean,
): { keyboard: InlineKeyboard; totalPages: number } {
  const perPage = 8;
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * perPage;
  const pageItems = items.slice(start, start + perPage);

  const kb = new InlineKeyboard();

  for (let i = 0; i < pageItems.length; i += 2) {
    kb.text(pageItems[i].nombre, `${callbackPrefix}:${pageItems[i].id}`);
    if (pageItems[i + 1]) {
      kb.text(
        pageItems[i + 1].nombre,
        `${callbackPrefix}:${pageItems[i + 1].id}`,
      );
    }
    kb.row();
  }

  if (extraButtons) {
    for (const btn of extraButtons) {
      kb.text(btn.text, btn.data);
    }
    kb.row();
  }

  if (totalPages > 1) {
    if (safePage > 0) {
      kb.text("⬅️ Anterior", `${callbackPrefix}_page:${safePage - 1}`);
    }
    if (safePage < totalPages - 1) {
      kb.text("Siguiente ➡️", `${callbackPrefix}_page:${safePage + 1}`);
    }
    kb.row();
  }

  if (showBack) {
    kb.text("← Atrás", "go_back").text("❌ Cancelar", "cancel_flow").row();
  } else {
    kb.text("❌ Cancelar", "cancel_flow").row();
  }

  return { keyboard: kb, totalPages };
}

/**
 * Wait for the user to pick an item from a paginated inline keyboard.
 * Handles page navigation transparently — returns the selected item.
 * Returns GO_BACK_SENTINEL if user pressed "Atrás".
 */
async function waitForPaginatedSelection(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  items: LookupItem[],
  promptText: string,
  callbackPrefix: string,
  extraButtons?: { text: string; data: string }[],
  showBack?: boolean,
): Promise<{ id: string; nombre: string }> {
  let page = 0;
  const { keyboard } = buildPaginatedKeyboard(
    items,
    page,
    callbackPrefix,
    extraButtons,
    showBack,
  );
  await ctx.reply(promptText, { reply_markup: keyboard });

  while (true) {
    const cbCtx = await conversation.waitForCallbackQuery(/^.*$/);
    const data = cbCtx.callbackQuery.data;

    // Back button
    if (data === "go_back") {
      await cbCtx.answerCallbackQuery();
      return GO_BACK_SENTINEL;
    }

    // Cancel flow
    if (data === "cancel_flow") {
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }

    // Extra button hit (e.g. "Otro...")
    if (extraButtons?.some((b) => b.data === data)) {
      await cbCtx.answerCallbackQuery();
      return { id: data, nombre: data };
    }

    // Pagination
    const pageMatch = data.match(
      new RegExp(`^${callbackPrefix}_page:(\\d+)$`),
    );
    if (pageMatch) {
      page = parseInt(pageMatch[1], 10);
      const { keyboard: newKb } = buildPaginatedKeyboard(
        items,
        page,
        callbackPrefix,
        extraButtons,
        showBack,
      );
      await cbCtx.answerCallbackQuery();
      await cbCtx.editMessageReplyMarkup({ reply_markup: newKb });
      continue;
    }

    // Item selection
    const selMatch = data.match(new RegExp(`^${callbackPrefix}:(.+)$`));
    if (selMatch) {
      const selectedId = selMatch[1];
      const found = items.find((i) => i.id === selectedId);
      await cbCtx.answerCallbackQuery();
      if (found) return found;
    }

    // Unrelated callback — acknowledge and keep waiting
    await cbCtx.answerCallbackQuery();
  }
}

/**
 * Wait for a text message, but also allow "← Atrás" callback.
 * Sends the prompt with an inline back button, then waits for either.
 * Returns null if user pressed back.
 */
async function waitForTextWithBack(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  promptText: string,
): Promise<string | null> {
  const kb = new InlineKeyboard()
    .text("← Atrás", "go_back")
    .text("❌ Cancelar", "cancel_flow");
  await ctx.reply(promptText, { reply_markup: kb });

  while (true) {
    const response = await conversation.wait();

    if (response.callbackQuery?.data === "go_back") {
      await response.answerCallbackQuery();
      return null;
    }

    if (response.callbackQuery?.data === "cancel_flow") {
      await response.answerCallbackQuery();
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }

    if (response.message?.text) {
      return response.message.text.trim();
    }

    // Ignore other input, keep waiting
  }
}

// ---------------------------------------------------------------------------
// Helpers for ganado compra sub-flow
// ---------------------------------------------------------------------------

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s.]/g, "").replace(",", ".");
  const num = Number(cleaned);
  return isNaN(num) || num < 0 ? null : num;
}

function parsePositiveInt(raw: string): number | null {
  const num = parseInt(raw.trim(), 10);
  return isNaN(num) || num <= 0 ? null : num;
}

function formatDateSpanish(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${d} de ${months[m - 1]} ${y}`;
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

// ---------------------------------------------------------------------------
// Ganado compra sub-flow (inserts into fin_transacciones_ganado with tipo='compra')
// ---------------------------------------------------------------------------

async function ganadoCompraFlow(
  conversation: Conversation<BotContext>, ctx: BotContext,
): Promise<boolean> {
  const tipo = "compra";
  const fecha = new Date().toISOString().split("T")[0];
  let finca = "";
  let cantidadCabezas = 0;
  let kilosPagados = 0;
  let precioKilo = 0;
  let valorTotal = 0;
  let proveedor = "";
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
          conversation, ctx, fincaItems, "🏡 ¿En qué finca?", "finca", extraBtns, true,
        );
        if (selected.id === GO_BACK_SENTINEL.id) return false;
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
        conversation, ctx, "🐄 ¿Cuántas cabezas?", parsePositiveInt,
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
        conversation, ctx, "⚖️ ¿Cuántos kilos?", parseNumber,
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
        conversation, ctx, "💲 ¿Precio por kilo?", parseValor,
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
        if (response.callbackQuery?.data === "go_back") {
          await response.answerCallbackQuery(); step = 4; break;
        }
        if (response.callbackQuery?.data === "cancel_flow") {
          await response.answerCallbackQuery();
          await ctx.reply("Operación cancelada.");
          return conversation.halt();
        }
        if (response.callbackQuery?.data === "accept_total") {
          await response.answerCallbackQuery(); step = 6; break;
        }
        if (response.message?.text) {
          const parsed = parseValor(response.message.text);
          if (parsed) { valorTotal = parsed; step = 6; break; }
          await response.reply("Ingresa un valor numérico válido.");
        }
      }
      continue;
    }

    // ── Step 6: Proveedor ──────────────────────────────────────────
    if (step === 6) {
      const proveedores = await conversation.external(async () => {
        const sb = getSupabaseAdmin();
        const { data, error } = await sb.from("fin_proveedores").select("id, nombre").eq("activo", true).order("nombre");
        if (error) return [];
        return (data ?? []) as LookupItem[];
      });

      const skipBtn = [{ text: "Saltar ⏩", data: "skip_prov" }];

      if (proveedores.length > 0) {
        const selected = await waitForPaginatedSelection(
          conversation, ctx, proveedores, "🧑‍💼 ¿Proveedor? (opcional)", "prov", skipBtn, true,
        );
        if (selected.id === GO_BACK_SENTINEL.id) { step = 5; continue; }
        proveedor = selected.id === "skip_prov" ? "" : selected.nombre;
      } else {
        const name = await waitForTextWithBack(conversation, ctx, "🧑‍💼 Nombre del proveedor (opcional):");
        if (name === null) { step = 5; continue; }
        proveedor = name;
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

      const provLine = proveedor ? `\n🧑‍💼 Proveedor: ${proveedor}` : "";
      const obsLine = observaciones ? `\n📝 ${observaciones}` : "";

      const summary = [
        "🐄 *Compra de Ganado*",
        "━━━━━━━━━━━━━━━",
        `📅 Fecha: ${formatDateSpanish(fecha)}`,
        `🏡 Finca: ${finca}`,
        `🐄 Cabezas: ${cantidadCabezas}`,
        `⚖️ Kilos: ${kilosPagados}`,
        `💲 Precio/kg: ${formatCOP(precioKilo)}`,
        `💵 Valor total: ${formatCOP(valorTotal)}`,
        provLine, obsLine,
      ].filter(Boolean).join("\n");

      const confirmKb = new InlineKeyboard()
        .text("✅ Confirmar", "gc_confirm")
        .text("← Atrás", "gc_back")
        .row()
        .text("✏️ Corregir", "gc_correct")
        .text("❌ Cancelar", "gc_cancel");

      await ctx.reply(summary, { reply_markup: confirmKb, parse_mode: "Markdown" });

      const confirmCtx = await conversation.waitForCallbackQuery([
        "gc_confirm", "gc_back", "gc_correct", "gc_cancel", "cancel_flow",
      ]);
      await confirmCtx.answerCallbackQuery();
      const action = confirmCtx.callbackQuery.data;

      if (action === "cancel_flow") { await ctx.reply("Operación cancelada."); return conversation.halt(); }
      if (action === "gc_cancel") { await ctx.reply("❌ Compra cancelada."); return false; }
      if (action === "gc_back") { step = 6; continue; }
      if (action === "gc_correct") { step = 1; continue; }

      const insertError = await conversation.external(async () => {
        const sb = getSupabaseAdmin();
        const { error } = await sb.from("fin_transacciones_ganado").insert({
          fecha, tipo,
          finca: finca || null,
          cliente_proveedor: proveedor || null,
          cantidad_cabezas: cantidadCabezas,
          kilos_pagados: kilosPagados || null,
          precio_kilo: precioKilo || null,
          valor_total: valorTotal,
          observaciones: observaciones ?? null,
        });
        return error?.message ?? null;
      });

      if (insertError) { await ctx.reply(`Error al guardar: ${insertError}`); return false; }
      await ctx.reply("✅ Compra de ganado registrada.");
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main conversation
// ---------------------------------------------------------------------------

export async function gastoConversation(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
) {
  try {
  // Outer loop allows "Otro gasto" to restart the full flow
  let continueLoop = true;

  while (continueLoop) {
    // State variables for the form
    let nombre = "";
    let valor = 0;
    let negocioSel: LookupItem = { id: "", nombre: "" };
    let regionSel: LookupItem = { id: "", nombre: "" };
    let categoriaSel: LookupItem = { id: "", nombre: "" };
    let conceptoId = "";
    let conceptoNombre = "";
    let medioPagoSel: LookupItem = { id: "", nombre: "" };
    let photoFileId: string | null = null;

    // Step-based state machine: steps 1-9, step 0 = cancelled
    let step = 1;
    const LAST_STEP = 9;

    while (step > 0 && step <= LAST_STEP) {
      // ── Step 1: Descripcion ──────────────────────────────────────────
      if (step === 1) {
        const cancelKb = new InlineKeyboard().text("❌ Cancelar", "cancel_flow");
        await ctx.reply(
          "💰 *Registro de Gasto*\n\nEscribe una descripción del gasto:",
          { parse_mode: "Markdown", reply_markup: cancelKb },
        );
        const response = await conversation.wait();
        if (response.callbackQuery?.data === "cancel_flow") {
          await response.answerCallbackQuery();
          await ctx.reply("Operación cancelada.");
          return conversation.halt();
        }
        const text = response.message?.text?.trim();
        if (!text) {
          await ctx.reply(
            "La descripción no puede estar vacía. Intenta de nuevo.",
          );
          continue;
        }
        nombre = text;
        step++;
        continue;
      }

      // ── Step 2: Valor ────────────────────────────────────────────────
      if (step === 2) {
        const result = await waitForTextWithBack(
          conversation,
          ctx,
          "💵 ¿Cuál es el valor del gasto? (en pesos)",
        );
        if (result === null) {
          step--;
          continue;
        }
        const parsed = parseValor(result);
        if (parsed === null) {
          await ctx.reply(
            "Valor inválido. Escribe un número positivo (ej: 85000 o 85.000):",
          );
          continue;
        }
        valor = parsed;
        step++;
        continue;
      }

      // ── Step 3: Negocio ──────────────────────────────────────────────
      if (step === 3) {
        const negocios = await conversation.external(async () => {
          const sb = getSupabaseAdmin();
          const { data } = await sb
            .from("fin_negocios")
            .select("id, nombre")
            .eq("activo", true)
            .order("nombre");
          return (data ?? []) as LookupItem[];
        });

        if (negocios.length === 0) {
          await ctx.reply(
            "No hay negocios configurados. Contacta al administrador.",
          );
          return;
        }

        const sel = await waitForPaginatedSelection(
          conversation,
          ctx,
          negocios,
          "🏢 Selecciona el negocio:",
          "neg",
          undefined,
          true,
        );
        if (sel.id === GO_BACK_SENTINEL.id) {
          step--;
          continue;
        }
        negocioSel = sel;

        // Ganado detection: if negocio is "Ganado", ask compra vs gasto operativo
        if (isGanadoNegocio(negocioSel.nombre)) {
          const ganadoKb = new InlineKeyboard()
            .text("🐄 Compra de ganado", "ganado_compra")
            .row()
            .text("💰 Gasto operativo", "ganado_gasto_op")
            .row()
            .text("← Atrás", "go_back")
            .text("❌ Cancelar", "cancel_flow");

          await ctx.reply(
            "🐄 *Negocio: Ganado*\n\n¿Qué tipo de registro?",
            { reply_markup: ganadoKb, parse_mode: "Markdown" },
          );

          const gcCtx = await conversation.waitForCallbackQuery([
            "ganado_compra", "ganado_gasto_op", "go_back", "cancel_flow",
          ]);
          await gcCtx.answerCallbackQuery();
          const choice = gcCtx.callbackQuery.data;

          if (choice === "cancel_flow") {
            await ctx.reply("Operación cancelada.");
            return conversation.halt();
          }

          if (choice === "go_back") {
            // Re-show negocio selection
            continue;
          }

          if (choice === "ganado_compra") {
            // Enter ganado compra sub-flow, then break out of step loop
            const success = await ganadoCompraFlow(conversation, ctx);
            if (!success) {
              // User backed out or cancelled — re-show negocio
              continue;
            }
            // Success — break out of step loop to post-registration
            step = LAST_STEP + 1;
            break;
          }

          // "ganado_gasto_op" — continue normal gasto flow
        }

        step++;
        continue;
      }

      // ── Step 4: Region ───────────────────────────────────────────────
      if (step === 4) {
        const regiones = await conversation.external(async () => {
          const sb = getSupabaseAdmin();
          const { data } = await sb
            .from("fin_regiones")
            .select("id, nombre")
            .eq("activo", true)
            .order("nombre");
          return (data ?? []) as LookupItem[];
        });

        if (regiones.length === 0) {
          await ctx.reply(
            "No hay regiones configuradas. Contacta al administrador.",
          );
          return;
        }

        const sel = await waitForPaginatedSelection(
          conversation,
          ctx,
          regiones,
          "📍 Selecciona la región:",
          "reg",
          undefined,
          true,
        );
        if (sel.id === GO_BACK_SENTINEL.id) {
          step--;
          continue;
        }
        regionSel = sel;
        step++;
        continue;
      }

      // ── Step 5: Categoria ────────────────────────────────────────────
      if (step === 5) {
        const categorias = await conversation.external(async () => {
          const sb = getSupabaseAdmin();
          const { data } = await sb
            .from("fin_categorias_gastos")
            .select("id, nombre")
            .eq("activo", true)
            .order("nombre");
          return (data ?? []) as LookupItem[];
        });

        if (categorias.length === 0) {
          await ctx.reply(
            "No hay categorías configuradas. Contacta al administrador.",
          );
          return;
        }

        const sel = await waitForPaginatedSelection(
          conversation,
          ctx,
          categorias,
          "📂 Selecciona la categoría:",
          "cat",
          undefined,
          true,
        );
        if (sel.id === GO_BACK_SENTINEL.id) {
          step--;
          continue;
        }
        categoriaSel = sel;
        step++;
        continue;
      }

      // ── Step 6: Concepto (filtered by categoria) ─────────────────────
      if (step === 6) {
        const conceptos = await conversation.external(async () => {
          const sb = getSupabaseAdmin();
          const { data } = await sb
            .from("fin_conceptos_gastos")
            .select("id, nombre")
            .eq("categoria_id", categoriaSel.id)
            .eq("activo", true)
            .order("nombre");
          return (data ?? []) as LookupItem[];
        });

        if (conceptos.length === 0) {
          // No concepts for this category — ask free text with back button
          const otroText = await waitForTextWithBack(
            conversation,
            ctx,
            "No hay conceptos para esta categoría. Escribe el nombre del concepto:",
          );
          if (otroText === null) {
            step--;
            continue;
          }
          conceptoNombre = otroText;

          const newConcepto = await conversation.external(async () => {
            const sb = getSupabaseAdmin();
            const { data, error } = await sb
              .from("fin_conceptos_gastos")
              .insert({
                nombre: conceptoNombre,
                categoria_id: categoriaSel.id,
                activo: true,
              })
              .select("id")
              .single();
            if (error) {
              console.error("[Gasto] Error creating concepto:", error);
              return null;
            }
            return data as { id: string };
          });

          if (!newConcepto) {
            await ctx.reply("Error al crear el concepto. Intenta de nuevo.");
            continue;
          }
          conceptoId = newConcepto.id;
        } else {
          const conceptoSel = await waitForPaginatedSelection(
            conversation,
            ctx,
            conceptos,
            "📋 Selecciona el concepto:",
            "con",
            [{ text: "📝 Otro...", data: "con_otro" }],
            true,
          );
          if (conceptoSel.id === GO_BACK_SENTINEL.id) {
            step--;
            continue;
          }

          if (conceptoSel.id === "con_otro") {
            const otroText = await waitForTextWithBack(
              conversation,
              ctx,
              "Escribe el nombre del concepto:",
            );
            if (otroText === null) {
              // Go back to the concepto selection, not to categoria
              continue;
            }
            conceptoNombre = otroText;

            const newConcepto = await conversation.external(async () => {
              const sb = getSupabaseAdmin();
              const { data, error } = await sb
                .from("fin_conceptos_gastos")
                .insert({
                  nombre: conceptoNombre,
                  categoria_id: categoriaSel.id,
                  activo: true,
                })
                .select("id")
                .single();
              if (error) {
                console.error("[Gasto] Error creating concepto:", error);
                return null;
              }
              return data as { id: string };
            });

            if (!newConcepto) {
              await ctx.reply("Error al crear el concepto. Intenta de nuevo.");
              continue;
            }
            conceptoId = newConcepto.id;
          } else {
            conceptoId = conceptoSel.id;
            conceptoNombre = conceptoSel.nombre;
          }
        }

        step++;
        continue;
      }

      // ── Step 7: Medio de pago ────────────────────────────────────────
      if (step === 7) {
        const mediosPago = await conversation.external(async () => {
          const sb = getSupabaseAdmin();
          const { data } = await sb
            .from("fin_medios_pago")
            .select("id, nombre")
            .eq("activo", true)
            .order("nombre");
          return (data ?? []) as LookupItem[];
        });

        if (mediosPago.length === 0) {
          await ctx.reply(
            "No hay medios de pago configurados. Contacta al administrador.",
          );
          return;
        }

        const sel = await waitForPaginatedSelection(
          conversation,
          ctx,
          mediosPago,
          "💳 Selecciona el medio de pago:",
          "mp",
          undefined,
          true,
        );
        if (sel.id === GO_BACK_SENTINEL.id) {
          step--;
          continue;
        }
        medioPagoSel = sel;
        step++;
        continue;
      }

      // ── Step 8: Foto factura (optional) ──────────────────────────────
      if (step === 8) {
        const skipKb = new InlineKeyboard()
          .text("⏭️ Saltar", "skip_factura")
          .row()
          .text("← Atrás", "go_back")
          .text("❌ Cancelar", "cancel_flow");
        await ctx.reply("📎 Envía una foto de la factura o toca Saltar:", {
          reply_markup: skipKb,
        });

        photoFileId = null;
        let stepResolved = false;

        while (!stepResolved) {
          const photoCtx = await conversation.wait();

          if (photoCtx.callbackQuery?.data === "go_back") {
            await photoCtx.answerCallbackQuery();
            step--;
            stepResolved = true;
            continue;
          }

          if (photoCtx.callbackQuery?.data === "cancel_flow") {
            await photoCtx.answerCallbackQuery();
            await ctx.reply("Operación cancelada.");
            return conversation.halt();
          }

          if (photoCtx.callbackQuery?.data === "skip_factura") {
            await photoCtx.answerCallbackQuery();
            step++;
            stepResolved = true;
            continue;
          }

          if (photoCtx.message?.photo) {
            const photos = photoCtx.message.photo;
            photoFileId = photos[photos.length - 1].file_id;
            step++;
            stepResolved = true;
            continue;
          }

          // Ignore anything else and prompt again
          await ctx.reply("Envía una foto o toca Saltar.");
        }
        continue;
      }

      // ── Step 9: Confirmation ─────────────────────────────────────────
      if (step === 9) {
        const facturaLabel = photoFileId
          ? "Factura adjunta ✓"
          : "Sin factura";

        const summary = [
          "💰 *Registro de Gasto*",
          "━━━━━━━━━━━━━━━",
          `📝 ${nombre}`,
          `💵 ${formatCOP(valor)}`,
          `🏢 ${negocioSel.nombre}`,
          `📍 ${regionSel.nombre}`,
          `📂 ${categoriaSel.nombre} > ${conceptoNombre}`,
          `💳 ${medioPagoSel.nombre}`,
          `📎 ${facturaLabel}`,
          `⏳ Estado: Pendiente`,
        ].join("\n");

        const confirmKb = new InlineKeyboard()
          .text("✅ Confirmar", "gasto_confirm")
          .text("✏️ Corregir", "gasto_corregir")
          .row()
          .text("← Atrás", "go_back")
          .text("❌ Cancelar", "gasto_cancel");

        await ctx.reply(summary, {
          parse_mode: "Markdown",
          reply_markup: confirmKb,
        });

        const confirmCtx = await conversation.waitForCallbackQuery([
          "gasto_confirm",
          "gasto_corregir",
          "go_back",
          "gasto_cancel",
          "cancel_flow",
        ]);
        await confirmCtx.answerCallbackQuery();

        if (confirmCtx.callbackQuery.data === "cancel_flow") {
          await ctx.reply("Operación cancelada.");
          return conversation.halt();
        }

        if (confirmCtx.callbackQuery.data === "gasto_cancel") {
          await ctx.reply("Registro cancelado.");
          return;
        }

        if (confirmCtx.callbackQuery.data === "go_back") {
          step--;
          continue;
        }

        if (confirmCtx.callbackQuery.data === "gasto_corregir") {
          // Restart the form from step 1
          step = 1;
          continue;
        }

        // ── Insert into fin_gastos ───────────────────────────────────
        const today = new Date().toISOString().split("T")[0];

        const insertResult = await conversation.external(async () => {
          const sb = getSupabaseAdmin();
          const { data, error } = await sb
            .from("fin_gastos")
            .insert({
              fecha: today,
              nombre,
              valor,
              negocio_id: negocioSel.id,
              region_id: regionSel.id,
              categoria_id: categoriaSel.id,
              concepto_id: conceptoId,
              medio_pago_id: medioPagoSel.id,
              estado: "Pendiente",
              observaciones: null,
            })
            .select("id")
            .single();

          if (error) {
            console.error("[Gasto] Insert error:", error);
            return { id: null, error: error.message };
          }
          return { id: (data as { id: string }).id, error: null };
        });

        if (!insertResult.id) {
          await ctx.reply(
            `Error al registrar el gasto: ${insertResult.error}`,
          );
          return;
        }

        const gastoId = insertResult.id;

        // ── Upload photo to Storage if provided ──────────────────────
        let urlFactura: string | null = null;

        if (photoFileId) {
          urlFactura = await conversation.external(async () => {
            try {
              const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

              // Get file path from Telegram API
              const fileRes = await fetch(
                `https://api.telegram.org/bot${botToken}/getFile?file_id=${photoFileId}`,
              );
              const fileData = await fileRes.json();
              const filePath = fileData.result?.file_path;
              if (!filePath) return null;

              // Download the file bytes
              const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
              const imgRes = await fetch(downloadUrl);
              const imgBuffer = await imgRes.arrayBuffer();

              // Upload to Supabase Storage
              const sb = getSupabaseAdmin();
              const storagePath = `facturas_compra/telegram/${gastoId}.jpg`;
              const { error: uploadError } = await sb.storage
                .from("facturas")
                .upload(storagePath, imgBuffer, {
                  contentType: "image/jpeg",
                  upsert: true,
                });

              if (uploadError) {
                console.error("[Gasto] Storage upload error:", uploadError);
                return null;
              }

              const { data: publicUrl } = sb.storage
                .from("facturas")
                .getPublicUrl(storagePath);

              return publicUrl.publicUrl ?? null;
            } catch (err) {
              console.error("[Gasto] Photo upload failed:", err);
              return null;
            }
          });

          // Attach the URL to the gasto record
          if (urlFactura) {
            await conversation.external(async () => {
              const sb = getSupabaseAdmin();
              await sb
                .from("fin_gastos")
                .update({ url_factura: urlFactura })
                .eq("id", gastoId);
            });
          }
        }

        // ── Success ──────────────────────────────────────────────────
        const photoStatus = urlFactura ? " (con factura)" : "";
        await ctx.reply(
          `✅ Gasto registrado exitosamente${photoStatus}.\n\n` +
            `*${nombre}* por ${formatCOP(valor)}`,
          { parse_mode: "Markdown" },
        );

        // Break out of the step loop (confirmed and saved)
        break;
      }
    }

    // If step went to 0, the user backed out of step 1 — treat as cancel
    if (step <= 0) {
      await ctx.reply("Registro cancelado.");
      return;
    }

    // ── Post-registration ────────────────────────────────────────────
    const postKb = new InlineKeyboard()
      .text("💰 Otro gasto", "gasto_otro")
      .text("🏠 Menú principal", "gasto_menu")
      .row()
      .text("❌ Cancelar", "cancel_flow");

    await ctx.reply("¿Qué deseas hacer?", { reply_markup: postKb });

    const postCtx = await conversation.waitForCallbackQuery([
      "gasto_otro",
      "gasto_menu",
      "cancel_flow",
    ]);
    await postCtx.answerCallbackQuery();

    if (postCtx.callbackQuery.data === "cancel_flow") {
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }

    if (postCtx.callbackQuery.data === "gasto_menu") {
      continueLoop = false;
    }
    // "gasto_otro" keeps continueLoop = true, outer while restarts
  }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("[Telegram] Gasto conversation error:", msg);
    await ctx.reply(`Error en el registro: ${msg}\n\nUsa /start para volver al menú.`);
  }
}
