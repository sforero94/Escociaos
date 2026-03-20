// telegram/conversations/monitoreo.ts — Pest monitoring registration conversation
//
// Flow: lote -> sublote -> plagas (multi-select) -> arboles monitoreados ->
// per-plaga (afectados + individuos) -> floración -> foto -> observaciones -> confirm all
// Then: next sublote / finish
//
// Each step supports a "back" button to return to the previous step.
// Restructured as a step-based state machine for navigation.

import { Conversation } from "npm:@grammyjs/conversations@2";
import { InlineKeyboard } from "npm:grammy@1";
import { createClient } from "npm:@supabase/supabase-js@2";

import type { BotContext } from "../types.ts";

const PLAGAS_PER_PAGE = 8;

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function calcularGravedad(incidencia: number): {
  texto: "Baja" | "Media" | "Alta";
  numerica: 1 | 2 | 3;
} {
  if (incidencia < 10) return { texto: "Baja", numerica: 1 };
  if (incidencia <= 30) return { texto: "Media", numerica: 2 };
  return { texto: "Alta", numerica: 3 };
}

function gravedadEmoji(texto: string): string {
  if (texto === "Alta") return "🔴";
  if (texto === "Media") return "⚠️";
  return "🟢";
}

function formatDate(date: Date): string {
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${date.getDate()} de ${months[date.getMonth()]} ${date.getFullYear()}`;
}

interface PlagaData {
  plagaId: string;
  plagaNombre: string;
  arbolesAfectados: number;
  individuos: number;
}

export async function monitoreoConversation(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
) {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply("Error: usuario no identificado.");
    return;
  }

  const user = await conversation.external(async () => {
    const sb = getSupabaseAdmin();
    const { data } = await sb
      .from("telegram_usuarios")
      .select("*")
      .eq("telegram_id", telegramId)
      .eq("activo", true)
      .single();
    return data;
  });

  if (!user) {
    await ctx.reply("Error: usuario no registrado.");
    return;
  }

  try {
  // ── Step 1: Select lote ──────────────────────────────────────────────

  const lotes = await conversation.external(async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lotes")
      .select("id, nombre")
      .eq("activo", true)
      .order("numero_orden", { ascending: true });
    if (error) throw new Error(`Error cargando lotes: ${error.message}`);
    return data ?? [];
  });

  if (lotes.length === 0) {
    await ctx.reply("No hay lotes activos configurados.");
    return;
  }

  const lotesKb = new InlineKeyboard();
  for (const lote of lotes) {
    lotesKb.text(lote.nombre, `lote_${lote.id}`).row();
  }
  lotesKb.text("❌ Cancelar", "cancel_flow").row();

  await ctx.reply("🌿 *Registro de Monitoreo*\n\nSelecciona el lote:", {
    reply_markup: lotesKb,
    parse_mode: "Markdown",
  });

  const loteCallbacks = lotes.map((l) => `lote_${l.id}`);
  const loteResponse = await conversation.waitForCallbackQuery(
    [...loteCallbacks, "cancel_flow"],
  );
  await loteResponse.answerCallbackQuery();

  if (loteResponse.callbackQuery.data === "cancel_flow") {
    await ctx.reply("Operación cancelada.");
    return conversation.halt();
  }

  const loteId = loteResponse.callbackQuery.data.replace("lote_", "");
  const selectedLote = lotes.find((l) => l.id === loteId)!;
  await loteResponse.editMessageText(`🌿 Lote: ${selectedLote.nombre}`);

  // ── Outer loop: sublote iteration ────────────────────────────────────

  let continueSublotes = true;

  while (continueSublotes) {
    // State variables for all steps — declared outside the step loop
    // so they persist across back navigation
    let subloteId = "";
    let selectedSublote: { id: string; nombre: string } | null = null;
    let selectedPlagaIds: string[] = [];
    let plagaPage = 0;
    let arbolesMonitoreados = 0;
    let plagasData: PlagaData[] = [];
    let floracionBrotes: number | null = null;
    let floracionFlor: number | null = null;
    let floracionCuaje: number | null = null;
    let floracionSubStep = 0; // 0=brotes, 1=flor, 2=cuaje
    let fotoUrl: string | null = null;
    let observaciones: string | null = null;
    // plagaIndex tracks position within the per-plaga loop (step 5)
    let plagaIndex = 0;
    // plagaSubStep: 0 = afectados, 1 = individuos
    let plagaSubStep = 0;

    // Cache fetched data so back navigation doesn't re-fetch
    let sublotes: { id: string; nombre: string }[] | null = null;
    let plagas: { id: string; nombre: string }[] | null = null;

    let step = 2; // Start at sublote selection (lote already chosen)

    while (step >= 2 && step <= 9) {
      // ── Step 2: Select sublote ───────────────────────────────────────
      if (step === 2) {
        if (!sublotes) {
          sublotes = await conversation.external(async () => {
            const supabase = getSupabaseAdmin();
            const { data, error } = await supabase
              .from("sublotes")
              .select("id, nombre")
              .eq("lote_id", loteId)
              .order("numero_sublote", { ascending: true });
            if (error) throw new Error(`Error cargando sublotes: ${error.message}`);
            return data ?? [];
          });
        }

        if (sublotes.length === 0) {
          await ctx.reply(`No hay sublotes configurados para ${selectedLote.nombre}.`);
          return;
        }

        const sublotesKb = new InlineKeyboard();
        for (const sl of sublotes) {
          sublotesKb.text(sl.nombre, `sublote_${sl.id}`).row();
        }
        sublotesKb.text("❌ Cancelar", "cancel_flow").row();

        await ctx.reply(
          `📍 Lote: *${selectedLote.nombre}*\n\nSelecciona el sublote:`,
          { reply_markup: sublotesKb, parse_mode: "Markdown" },
        );

        const subloteCallbacks = sublotes.map((s) => `sublote_${s.id}`);
        const subloteResponse = await conversation.waitForCallbackQuery(
          [...subloteCallbacks, "cancel_flow"],
        );
        await subloteResponse.answerCallbackQuery();

        if (subloteResponse.callbackQuery.data === "cancel_flow") {
          await ctx.reply("Operación cancelada.");
          return conversation.halt();
        }

        subloteId = subloteResponse.callbackQuery.data.replace("sublote_", "");
        selectedSublote = sublotes.find((s) => s.id === subloteId)!;
        await subloteResponse.editMessageText(
          `📍 ${selectedLote.nombre} > ${selectedSublote.nombre}`,
        );
        step = 3;
        continue;
      }

      // ── Step 3: Multi-select plagas ──────────────────────────────────
      if (step === 3) {
        if (!plagas) {
          plagas = await conversation.external(async () => {
            const supabase = getSupabaseAdmin();
            const { data, error } = await supabase
              .from("plagas_enfermedades_catalogo")
              .select("id, nombre")
              .eq("activo", true)
              .order("nombre", { ascending: true });
            if (error) throw new Error(`Error cargando plagas: ${error.message}`);
            return data ?? [];
          });
        }

        if (plagas.length === 0) {
          await ctx.reply("No hay plagas/enfermedades activas en el catálogo.");
          return;
        }

        // Reset selection when entering this step (fresh or via back)
        selectedPlagaIds = [];
        plagaPage = 0;
        const totalPlagaPages = Math.ceil(plagas.length / PLAGAS_PER_PAGE);

        const capturedPlagas = plagas;
        function buildPlagasKeyboard(p: number, selected: string[]): InlineKeyboard {
          const kb = new InlineKeyboard();
          const start = p * PLAGAS_PER_PAGE;
          const slice = capturedPlagas.slice(start, start + PLAGAS_PER_PAGE);

          for (const pl of slice) {
            const mark = selected.includes(pl.id) ? "✓ " : "  ";
            kb.text(`${mark}${pl.nombre}`, `plaga_${pl.id}`).row();
          }

          if (totalPlagaPages > 1) {
            if (p > 0) kb.text("← Anterior", "plagas_prev");
            if (p < totalPlagaPages - 1) kb.text("Siguiente →", "plagas_next");
            kb.row();
          }

          kb.text("← Atrás", "go_back").text("❌ Cancelar", "cancel_flow").text("✔️ Listo", "plagas_done").row();
          return kb;
        }

        const plagaCallbackIds = plagas.map((p) => `plaga_${p.id}`);
        const allPlagaCallbacks = [
          ...plagaCallbackIds,
          "plagas_prev",
          "plagas_next",
          "plagas_done",
          "go_back",
          "cancel_flow",
        ];

        await ctx.reply(
          "🐛 Selecciona las plagas/enfermedades identificadas:\n(Toca para seleccionar, luego Listo)",
          { reply_markup: buildPlagasKeyboard(plagaPage, selectedPlagaIds) },
        );

        let backFromPlagas = false;
        while (true) {
          const cbCtx = await conversation.waitForCallbackQuery(allPlagaCallbacks);
          const data = cbCtx.callbackQuery.data;

          if (data === "go_back") {
            await cbCtx.answerCallbackQuery();
            await cbCtx.editMessageText("🐛 Plagas: (volviendo...)");
            backFromPlagas = true;
            break;
          }

          if (data === "cancel_flow") {
            await cbCtx.answerCallbackQuery();
            await ctx.reply("Operación cancelada.");
            return conversation.halt();
          }

          if (data === "plagas_done") {
            if (selectedPlagaIds.length === 0) {
              await cbCtx.answerCallbackQuery({
                text: "Selecciona al menos una plaga",
                show_alert: true,
              });
              continue;
            }
            await cbCtx.answerCallbackQuery();
            const names = selectedPlagaIds
              .map((id) => capturedPlagas.find((p) => p.id === id)!.nombre)
              .join(", ");
            await cbCtx.editMessageText(`🐛 Plagas: ${names}`);
            break;
          }

          if (data === "plagas_prev") {
            await cbCtx.answerCallbackQuery();
            plagaPage = Math.max(0, plagaPage - 1);
            await cbCtx.editMessageReplyMarkup({
              reply_markup: buildPlagasKeyboard(plagaPage, selectedPlagaIds),
            });
            continue;
          }

          if (data === "plagas_next") {
            await cbCtx.answerCallbackQuery();
            plagaPage = Math.min(totalPlagaPages - 1, plagaPage + 1);
            await cbCtx.editMessageReplyMarkup({
              reply_markup: buildPlagasKeyboard(plagaPage, selectedPlagaIds),
            });
            continue;
          }

          // Toggle plaga
          await cbCtx.answerCallbackQuery();
          const plagaId = data.replace("plaga_", "");
          const idx = selectedPlagaIds.indexOf(plagaId);
          if (idx >= 0) {
            selectedPlagaIds.splice(idx, 1);
          } else {
            selectedPlagaIds.push(plagaId);
          }
          await cbCtx.editMessageReplyMarkup({
            reply_markup: buildPlagasKeyboard(plagaPage, selectedPlagaIds),
          });
        }

        if (backFromPlagas) {
          step = 2;
        } else {
          step = 4;
        }
        continue;
      }

      // ── Step 4: Arboles monitoreados ─────────────────────────────────
      if (step === 4) {
        const backKb = new InlineKeyboard()
          .text("← Atrás", "go_back")
          .text("❌ Cancelar", "cancel_flow");

        await ctx.reply(
          `🌲 *${selectedLote.nombre}* > *${selectedSublote!.nombre}*\n\n` +
            "¿Cuántos árboles monitoreaste en este sublote?",
          { parse_mode: "Markdown", reply_markup: backKb },
        );

        let wentBack = false;
        while (true) {
          const response = await conversation.wait();

          if (response.callbackQuery?.data === "cancel_flow") {
            await response.answerCallbackQuery();
            await ctx.reply("Operación cancelada.");
            return conversation.halt();
          }

          if (response.callbackQuery?.data === "go_back") {
            await response.answerCallbackQuery();
            wentBack = true;
            break;
          }

          if (response.message?.text) {
            const parsed = parseInt(response.message.text.trim(), 10);
            if (isNaN(parsed) || parsed <= 0) {
              await response.reply("Ingresa un número válido mayor a 0.");
              continue;
            }
            arbolesMonitoreados = parsed;
            break;
          }

          await ctx.reply("Ingresa un número válido mayor a 0.");
        }

        if (wentBack) {
          step = 3;
        } else {
          // Reset per-plaga data when entering step 5
          plagasData = [];
          plagaIndex = 0;
          plagaSubStep = 0;
          step = 5;
        }
        continue;
      }

      // ── Step 5: Per-plaga data (afectados + individuos) ──────────────
      if (step === 5) {
        let wentBackToStep4 = false;

        while (plagaIndex < selectedPlagaIds.length) {
          const currentPlagaId = selectedPlagaIds[plagaIndex];
          const plagaNombre = plagas!.find((p) => p.id === currentPlagaId)!.nombre;

          // ── Afectados ──
          if (plagaSubStep === 0) {
            const backKb = new InlineKeyboard()
              .text("← Atrás", "go_back")
              .text("❌ Cancelar", "cancel_flow");
            await ctx.reply(
              `🐛 *${plagaNombre}*\n¿Cuántos árboles afectados? (máx: ${arbolesMonitoreados})`,
              { parse_mode: "Markdown", reply_markup: backKb },
            );

            let wentBack = false;
            let arbolesAfectados = 0;
            while (true) {
              const response = await conversation.wait();

              if (response.callbackQuery?.data === "cancel_flow") {
                await response.answerCallbackQuery();
                await ctx.reply("Operación cancelada.");
                return conversation.halt();
              }

              if (response.callbackQuery?.data === "go_back") {
                await response.answerCallbackQuery();
                wentBack = true;
                break;
              }

              if (response.message?.text) {
                const parsed = parseInt(response.message.text.trim(), 10);
                if (isNaN(parsed) || parsed < 0) {
                  await response.reply("Ingresa un número válido (0 o más).");
                  continue;
                }
                if (parsed > arbolesMonitoreados) {
                  await response.reply(
                    `Los afectados (${parsed}) no pueden superar los monitoreados (${arbolesMonitoreados}).`,
                  );
                  continue;
                }
                arbolesAfectados = parsed;
                break;
              }

              await ctx.reply("Ingresa un número válido (0 o más).");
            }

            if (wentBack) {
              if (plagaIndex === 0) {
                // First plaga's afectados -> back to arboles monitoreados
                wentBackToStep4 = true;
                break;
              } else {
                // Go to previous plaga's individuos
                plagaIndex--;
                plagaSubStep = 1;
                // Remove the last plaga's data since we're going back to edit it
                plagasData.pop();
                continue;
              }
            }

            // Store afectados temporarily in the current plaga entry
            // Ensure plagasData has an entry for current index
            if (plagasData.length <= plagaIndex) {
              plagasData.push({
                plagaId: currentPlagaId,
                plagaNombre,
                arbolesAfectados,
                individuos: 0,
              });
            } else {
              plagasData[plagaIndex].arbolesAfectados = arbolesAfectados;
            }
            plagaSubStep = 1;
            continue;
          }

          // ── Individuos ──
          if (plagaSubStep === 1) {
            const backKb = new InlineKeyboard()
              .text("← Atrás", "go_back")
              .text("❌ Cancelar", "cancel_flow");
            await ctx.reply(`🔢 *${plagaNombre}* — ¿Cuántos individuos encontraste?`, {
              parse_mode: "Markdown",
              reply_markup: backKb,
            });

            let wentBack = false;
            let individuos = 0;
            while (true) {
              const response = await conversation.wait();

              if (response.callbackQuery?.data === "cancel_flow") {
                await response.answerCallbackQuery();
                await ctx.reply("Operación cancelada.");
                return conversation.halt();
              }

              if (response.callbackQuery?.data === "go_back") {
                await response.answerCallbackQuery();
                wentBack = true;
                break;
              }

              if (response.message?.text) {
                const parsed = parseInt(response.message.text.trim(), 10);
                if (isNaN(parsed) || parsed < 0) {
                  await response.reply("Ingresa un número válido (0 o más).");
                  continue;
                }
                individuos = parsed;
                break;
              }

              await ctx.reply("Ingresa un número válido (0 o más).");
            }

            if (wentBack) {
              // Go back to afectados for the same plaga
              plagaSubStep = 0;
              continue;
            }

            plagasData[plagaIndex].individuos = individuos;
            plagaIndex++;
            plagaSubStep = 0;
            continue;
          }
        }

        if (wentBackToStep4) {
          step = 4;
        } else {
          step = 6;
        }
        continue;
      }

      // ── Step 6: Floración (optional) ──────────────────────────────────
      if (step === 6) {
        const florLabels = [
          { emoji: "🌱", label: "BROTES", field: "brotes" },
          { emoji: "🌼", label: "FLOR MADURA", field: "flor" },
          { emoji: "🍊", label: "CUAJE", field: "cuaje" },
        ] as const;

        while (floracionSubStep <= 2) {
          const current = florLabels[floracionSubStep];
          const florKb = new InlineKeyboard()
            .text("← Atrás", "go_back")
            .text(floracionSubStep === 0 ? "Saltar floración ⏩" : "Saltar ⏩", "skip_flor")
            .row()
            .text("❌ Cancelar", "cancel_flow");

          await ctx.reply(
            `${current.emoji} Floración — ¿cuántos árboles con *${current.label}*?`,
            { reply_markup: florKb, parse_mode: "Markdown" },
          );

          const florCtx = await conversation.wait();

          if (florCtx.callbackQuery?.data === "cancel_flow") {
            await florCtx.answerCallbackQuery();
            await ctx.reply("Operación cancelada.");
            return conversation.halt();
          }

          if (florCtx.callbackQuery?.data === "go_back") {
            await florCtx.answerCallbackQuery();
            if (floracionSubStep === 0) {
              step = 5;
              // Reset plagaIndex to re-enter step 5 from the end
              plagaIndex = plagasData.length - 1;
              plagaSubStep = 1;
              break;
            }
            floracionSubStep--;
            continue;
          }

          if (florCtx.callbackQuery?.data === "skip_flor") {
            await florCtx.answerCallbackQuery();
            if (floracionSubStep === 0) {
              // Skip all floración
              floracionBrotes = null;
              floracionFlor = null;
              floracionCuaje = null;
            }
            // else: leave current field null, advance
            break; // Exit floración loop
          }

          // Parse numeric input
          const val = parseInt(florCtx.message?.text?.trim() || "", 10);
          if (isNaN(val) || val < 0) {
            await ctx.reply("Ingresa un número entero ≥ 0.");
            continue;
          }

          if (floracionSubStep === 0) floracionBrotes = val;
          else if (floracionSubStep === 1) floracionFlor = val;
          else floracionCuaje = val;

          floracionSubStep++;
        }

        if (step === 5) {
          // User pressed "back" from floración → go back to step 5
          continue;
        }

        floracionSubStep = 0; // Reset for potential correction
        step = 7;
        continue;
      }

      // ── Step 7: Photo (optional) ─────────────────────────────────────
      if (step === 7) {
        const photoKb = new InlineKeyboard()
          .text("← Atrás", "go_back")
          .text("Saltar ⏩", "skip_photo")
          .row()
          .text("❌ Cancelar", "cancel_flow");

        await ctx.reply("📷 Envía una foto o toca Saltar:", {
          reply_markup: photoKb,
        });

        fotoUrl = null;
        const photoCtx = await conversation.wait();

        if (photoCtx.callbackQuery?.data === "cancel_flow") {
          await photoCtx.answerCallbackQuery();
          await ctx.reply("Operación cancelada.");
          return conversation.halt();
        }

        if (photoCtx.callbackQuery?.data === "go_back") {
          await photoCtx.answerCallbackQuery();
          step = 6;
          continue;
        }

        if (photoCtx.callbackQuery?.data === "skip_photo") {
          await photoCtx.answerCallbackQuery();
        } else if (photoCtx.message?.photo) {
          const photos = photoCtx.message.photo;
          const largestPhoto = photos[photos.length - 1];

          try {
            fotoUrl = await conversation.external(async () => {
              const supabase = getSupabaseAdmin();
              const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

              const fileRes = await fetch(
                `https://api.telegram.org/bot${botToken}/getFile?file_id=${largestPhoto.file_id}`,
              );
              const fileData = await fileRes.json();

              if (!fileData.ok || !fileData.result?.file_path) {
                throw new Error("No se pudo obtener el archivo de Telegram");
              }

              const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
              const imageRes = await fetch(downloadUrl);
              const imageBlob = await imageRes.blob();

              const today = new Date().toISOString().split("T")[0];
              const fileName = `${loteId}/${today}/${crypto.randomUUID()}.jpg`;

              const { error: uploadError } = await supabase.storage
                .from("monitoreo-fotos")
                .upload(fileName, imageBlob, {
                  contentType: "image/jpeg",
                  upsert: false,
                });

              if (uploadError) {
                throw new Error(`Error subiendo foto: ${uploadError.message}`);
              }

              const { data: publicUrl } = supabase.storage
                .from("monitoreo-fotos")
                .getPublicUrl(fileName);

              return publicUrl.publicUrl;
            });

            await ctx.reply("✅ Foto recibida.");
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Error desconocido";
            console.error("[Monitoreo] Photo upload error:", msg);
            await ctx.reply(`No se pudo guardar la foto: ${msg}. Continuando sin foto.`);
            fotoUrl = null;
          }
        } else {
          await ctx.reply("No se recibió foto. Continuando sin foto.");
        }

        step = 8;
        continue;
      }

      // ── Step 8: Observaciones (optional) ─────────────────────────────
      if (step === 8) {
        const obsKb = new InlineKeyboard()
          .text("← Atrás", "go_back")
          .text("Saltar ⏩", "skip_obs")
          .row()
          .text("❌ Cancelar", "cancel_flow");

        await ctx.reply("📝 Observaciones (o toca Saltar):", {
          reply_markup: obsKb,
        });

        observaciones = null;
        const obsCtx = await conversation.wait();

        if (obsCtx.callbackQuery?.data === "cancel_flow") {
          await obsCtx.answerCallbackQuery();
          await ctx.reply("Operación cancelada.");
          return conversation.halt();
        }

        if (obsCtx.callbackQuery?.data === "go_back") {
          await obsCtx.answerCallbackQuery();
          step = 7;
          continue;
        }

        if (obsCtx.callbackQuery?.data === "skip_obs") {
          await obsCtx.answerCallbackQuery();
        } else if (obsCtx.message?.text) {
          observaciones = obsCtx.message.text.trim() || null;
        }

        step = 9;
        continue;
      }

      // ── Step 9: Confirmation ─────────────────────────────────────────
      if (step === 9) {
        const today = new Date();
        const fechaStr = formatDate(today);

        const summaryLines = [
          "🔍 *Registro de Monitoreo*",
          "━━━━━━━━━━━━━━━",
          `📅 ${fechaStr}`,
          `🌳 ${selectedLote.nombre} > ${selectedSublote!.nombre}`,
          `🌲 Árboles monitoreados: ${arbolesMonitoreados}`,
          "",
        ];

        for (const pd of plagasData) {
          const incidencia = arbolesMonitoreados > 0
            ? (pd.arbolesAfectados / arbolesMonitoreados) * 100
            : 0;
          const severidad = arbolesMonitoreados > 0
            ? pd.individuos / arbolesMonitoreados
            : 0;
          const gravedad = calcularGravedad(incidencia);

          summaryLines.push(
            `🐛 *${pd.plagaNombre}*`,
            `   Afectados: ${pd.arbolesAfectados} | Individuos: ${pd.individuos}`,
            `   Incidencia: ${incidencia.toFixed(1)}% | Severidad: ${severidad.toFixed(2)}`,
            `   ${gravedadEmoji(gravedad.texto)} Gravedad: ${gravedad.texto}`,
          );
        }

        if (floracionBrotes != null || floracionFlor != null || floracionCuaje != null) {
          summaryLines.push(
            "",
            "🌸 *Floración*",
            `   Brotes: ${floracionBrotes ?? "—"} | Flor: ${floracionFlor ?? "—"} | Cuaje: ${floracionCuaje ?? "—"}`,
          );
        }

        if (fotoUrl) summaryLines.push("", "📎 Foto adjunta ✓");
        if (observaciones) summaryLines.push(`📝 ${observaciones}`);

        const confirmKb = new InlineKeyboard()
          .text("✅ Confirmar", "confirm_monitoreo")
          .text("✏️ Corregir", "correct_monitoreo")
          .text("❌ Cancelar", "cancel_flow");

        await ctx.reply(summaryLines.join("\n"), {
          reply_markup: confirmKb,
          parse_mode: "Markdown",
        });

        const confirmResponse = await conversation.waitForCallbackQuery([
          "confirm_monitoreo",
          "correct_monitoreo",
          "cancel_flow",
        ]);
        await confirmResponse.answerCallbackQuery();

        const action = confirmResponse.callbackQuery.data;

        if (action === "cancel_flow") {
          await ctx.reply("Operación cancelada.");
          return conversation.halt();
        }

        if (action === "correct_monitoreo") {
          await ctx.reply("Volvamos a empezar con este sublote.");
          // Reset and restart the sublote iteration
          step = 2;
          continue;
        }

        // ── Insert all plague records into DB ─────────────────────────
        const fechaMonitoreo = today.toISOString().split("T")[0];

        const insertError = await conversation.external(async () => {
          const supabase = getSupabaseAdmin();

          // Assign ronda (same logic as calculosMonitoreoV2.ts asignarRonda)
          const GAP_DIAS = 5;
          let rondaId: string;

          const { data: ultimaRonda } = await supabase
            .from("rondas_monitoreo")
            .select("id, fecha_inicio, fecha_fin")
            .order("fecha_inicio", { ascending: false })
            .limit(1)
            .single();

          if (ultimaRonda && !ultimaRonda.fecha_fin) {
            const { data: ultimoReg } = await supabase
              .from("monitoreos")
              .select("fecha_monitoreo")
              .eq("ronda_id", ultimaRonda.id)
              .order("fecha_monitoreo", { ascending: false })
              .limit(1)
              .single();

            const refDate = ultimoReg?.fecha_monitoreo || ultimaRonda.fecha_inicio;
            const diffDays = Math.abs(
              (new Date(fechaMonitoreo).getTime() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24),
            );

            if (diffDays <= GAP_DIAS) {
              rondaId = ultimaRonda.id;
            } else {
              const { count } = await supabase.from("rondas_monitoreo").select("id", { count: "exact", head: true });
              const { data: nueva } = await supabase
                .from("rondas_monitoreo")
                .insert({ fecha_inicio: fechaMonitoreo, nombre: `Ronda ${(count || 0) + 1}` })
                .select("id")
                .single();
              rondaId = nueva!.id;
            }
          } else {
            const { count } = await supabase.from("rondas_monitoreo").select("id", { count: "exact", head: true });
            const { data: nueva } = await supabase
              .from("rondas_monitoreo")
              .insert({ fecha_inicio: fechaMonitoreo, nombre: `Ronda ${(count || 0) + 1}` })
              .select("id")
              .single();
            rondaId = nueva!.id;
          }

          const records = plagasData.map((pd) => {
            const incidencia = arbolesMonitoreados > 0
              ? (pd.arbolesAfectados / arbolesMonitoreados) * 100
              : 0;
            const gravedad = calcularGravedad(incidencia);

            const record: Record<string, unknown> = {
              fecha_monitoreo: fechaMonitoreo,
              lote_id: loteId,
              sublote_id: subloteId,
              plaga_enfermedad_id: pd.plagaId,
              arboles_monitoreados: arbolesMonitoreados,
              arboles_afectados: pd.arbolesAfectados,
              individuos_encontrados: pd.individuos,
              gravedad_texto: gravedad.texto,
              gravedad_numerica: gravedad.numerica,
              observaciones: observaciones,
              monitor: user.nombre_display,
              ronda_id: rondaId,
              floracion_brotes: floracionBrotes,
              floracion_flor_madura: floracionFlor,
              floracion_cuaje: floracionCuaje,
            };

            if (fotoUrl) {
              record.foto_url = fotoUrl;
            }

            return record;
          });

          const { error } = await supabase.from("monitoreos").insert(records);
          return error?.message ?? null;
        });

        if (insertError) {
          await ctx.reply(`Error al guardar: ${insertError}`);
          return;
        }

        await ctx.reply(
          `✅ ${plagasData.length} registro${plagasData.length > 1 ? "s" : ""} de monitoreo guardado${plagasData.length > 1 ? "s" : ""}.`,
        );

        // Exit the step loop — move to post-registration
        break;
      }
    }

    // If step went below 2 somehow, just end
    if (step < 2) break;

    // ── Post-registration: next action ───────────────────────────────

    const nextKb = new InlineKeyboard()
      .text("📍 Siguiente sublote", "next_sublote")
      .row()
      .text("✅ Terminar", "finish_monitoreo")
      .row()
      .text("❌ Cancelar", "cancel_flow");

    await ctx.reply("¿Qué quieres hacer ahora?", {
      reply_markup: nextKb,
    });

    const nextResponse = await conversation.waitForCallbackQuery([
      "next_sublote",
      "finish_monitoreo",
      "cancel_flow",
    ]);
    await nextResponse.answerCallbackQuery();

    if (nextResponse.callbackQuery.data === "cancel_flow") {
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }

    if (nextResponse.callbackQuery.data === "next_sublote") {
      continue;
    }

    continueSublotes = false;
  }

  await ctx.reply("🌿 Sesión de monitoreo finalizada. Usa /start para volver al menú.");
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Conversation already halted") return;
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("[Telegram] Monitoreo conversation error:", msg);
    await ctx.reply(`Error en el monitoreo: ${msg}\n\nUsa /start para volver al menú.`);
  }
}
