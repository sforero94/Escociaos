// telegram/bot.ts — Grammy bot setup with webhook handler for Escocia OS
//
// Uses grammy conversations for multi-step flows and the Esco AI engine
// (from chat.ts) for free-text queries. Sessions are persisted in Supabase
// via the SupabaseAdapter so state survives across webhook invocations.
//
// All initialization is lazy (inside getBot()) to avoid BOOT_ERROR on
// Supabase Edge Functions, where top-level side effects can fail.

import { Bot, session, InlineKeyboard } from "npm:grammy@1";
import { conversations, createConversation } from "npm:@grammyjs/conversations@2";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Context as HonoContext } from "npm:hono";

import type { BotContext, TelegramUsuario } from "./types.ts";
import { jornalConversation } from "./conversations/jornal.ts";
import { monitoreoConversation } from "./conversations/monitoreo.ts";
import { gastoConversation } from "./conversations/gasto.ts";
import { ingresoConversation } from "./conversations/ingreso.ts";
import { pesajeLecheConversation } from "./conversations/pesajeLeche.ts";
import { eventoHatoConversation } from "./conversations/eventoHato.ts";
// `produccionQuincenal` (litros al camión) se retiró del bot -- SOW 3 de
// docs/plan_hato_produccion_rework.md §2.3: la quincena pasó a ser un
// registro financiero (`fin_ingreso_id NOT NULL`, migración 070) y el bot
// escribe con `service_role` (`auth.uid()` NULL), que no puede satisfacer
// ese NOT NULL ni restringirse a Gerencia (decisión 5 del dueño). `/pesaje`
// no toca dinero y se mantiene intacto.
import { llmToolLoop, getSystemPrompt } from "../chat.tsx";
import { construirMensajeAlertaYaResuelta, construirMensajeCierreAlertaBroadcast } from "../hato-alertas.ts";
import { cerrarAlertaEnEnvios } from "./enviar.ts";

// ============================================================================
// SUPABASE CLIENT (service role — same pattern as chat.ts)
// ============================================================================

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function supabaseStorage<T>(
  supabase: SupabaseClient,
  table: string,
): { read: (key: string) => Promise<T | undefined>; write: (key: string, value: T) => Promise<void>; delete: (key: string) => Promise<void> } {
  return {
    async read(key: string) {
      const { data, error } = await supabase
        .from(table)
        .select("session")
        .eq("key", key)
        .single();
      if (error && error.code !== "PGRST116") {
        console.error("[Session] read error:", error.message);
      }
      console.log("[Session] read", key, data ? "found" : "not found");
      return data?.session as T | undefined;
    },
    async write(key: string, value: T) {
      const { error } = await supabase
        .from(table)
        .upsert({ key, session: value }, { onConflict: "key" });
      if (error) console.error("[Session] write error:", error.message);
      else console.log("[Session] write", key, "ok");
    },
    async delete(key: string) {
      await supabase.from(table).delete().eq("key", key);
    },
  };
}

// ============================================================================
// LAZY BOT INITIALIZATION
// ============================================================================

let _bot: Bot<BotContext> | null = null;

function getBot(): Bot<BotContext> {
  if (_bot) return _bot;

  const bot = new Bot<BotContext>(Deno.env.get("TELEGRAM_BOT_TOKEN")!, {
    botInfo: {
      id: 8759479581,
      is_bot: true,
      first_name: "Escocia Bot",
      username: "escociaos_bot",
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    },
  });

  // --- Session middleware (persisted in `telegram_sessions` table) -----------

  const supabaseForStorage = getSupabaseAdmin();

  bot.use(
    session({
      initial: () => ({}),
      storage: supabaseStorage(supabaseForStorage, "telegram_sessions"),
    }),
  );

  // ==========================================================================
  // AUTH MIDDLEWARE
  // ==========================================================================

  bot.use(async (ctx, next) => {
    if (!ctx.from) return;

    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from("telegram_usuarios")
      .select("*")
      .eq("telegram_id", ctx.from.id)
      .eq("activo", true)
      .single();

    const isStart = (ctx.message?.text ?? "") === "/start" ||
      (ctx.message?.text ?? "").startsWith("/start ");

    if (!user && !isStart) {
      await ctx.reply(
        "No estás registrado. Pide un código de acceso a tu administrador.",
      );
      return;
    }

    ctx.telegramUser = (user as TelegramUsuario) ?? null;
    await next();
  });

  // --- Conversations plugin (needs its own persistent storage for webhook) ---

  const conversationStorage = supabaseStorage(
    supabaseForStorage,
    "telegram_conversations",
  );

  bot.use(conversations({ storage: conversationStorage }));
  bot.use(createConversation(jornalConversation, "jornal"));
  bot.use(createConversation(monitoreoConversation, "monitoreo"));
  bot.use(createConversation(gastoConversation, "gasto"));
  bot.use(createConversation(ingresoConversation, "ingreso"));
  bot.use(createConversation(pesajeLecheConversation, "pesajeLeche"));
  bot.use(createConversation(eventoHatoConversation, "eventoHato"));

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  function buildMenuKeyboard(user: TelegramUsuario): InlineKeyboard {
    const kb = new InlineKeyboard();
    const mods = user.modulos_permitidos ?? [];

    if (mods.includes("labores")) {
      kb.text("📋 Registrar jornal", "start_jornal").row();
    }
    if (mods.includes("monitoreo")) {
      kb.text("🔍 Registrar monitoreo", "start_monitoreo").row();
    }
    if (mods.includes("gastos")) {
      kb.text("💰 Registrar gasto", "start_gasto").row();
    }
    if (mods.includes("ingresos")) {
      kb.text("💵 Registrar ingreso", "start_ingreso").row();
    }
    if (mods.includes("hato_produccion")) {
      kb.text("🐄 Pesaje semanal (leche)", "start_pesajeLeche").row();
      kb.text("📋 Registrar evento del hato", "start_eventoHato").row();
    }
    if (mods.includes("consultas")) {
      kb.text("💬 Preguntarle a Esco", "start_consulta").row();
    }

    return kb;
  }

  async function sendMainMenu(ctx: BotContext) {
    const user = ctx.telegramUser;
    if (!user) return;

    const kb = buildMenuKeyboard(user);

    await ctx.reply(
      `¡Hola ${user.nombre_display}! Soy Esco 🌿\n¿Qué quieres hacer?`,
      { reply_markup: kb },
    );
  }

  // ==========================================================================
  // COMMAND HANDLERS
  // ==========================================================================

  bot.command("start", async (ctx) => {
    const payload = ctx.match?.trim();

    // Deep-link vinculacion: /start <code>
    if (payload) {
      const supabase = getSupabaseAdmin();
      const { data: pendingUser, error } = await supabase
        .from("telegram_usuarios")
        .select("*")
        .eq("codigo_vinculacion", payload)
        .is("telegram_id", null)
        .single();

      if (error || !pendingUser) {
        await ctx.reply(
          "Código inválido o ya utilizado. Pide un nuevo código a tu administrador.",
        );
        return;
      }

      // Check expiration
      const expiry = new Date(pendingUser.codigo_expira_at);
      if (expiry < new Date()) {
        await ctx.reply(
          "Este código ha expirado. Pide un nuevo código a tu administrador.",
        );
        return;
      }

      // Link the telegram account
      const { error: updateError } = await supabase
        .from("telegram_usuarios")
        .update({
          telegram_id: ctx.from!.id,
          telegram_username: ctx.from!.username ?? null,
          codigo_vinculacion: null,
          codigo_expira_at: null,
          activo: true,
        })
        .eq("id", pendingUser.id);

      if (updateError) {
        console.error("[Telegram] Vinculacion error:", updateError);
        await ctx.reply("Error al vincular tu cuenta. Intenta de nuevo.");
        return;
      }

      // Reload user into context
      const { data: linkedUser } = await supabase
        .from("telegram_usuarios")
        .select("*")
        .eq("id", pendingUser.id)
        .single();

      ctx.telegramUser = linkedUser as TelegramUsuario;

      await ctx.reply(
        `¡Cuenta vinculada exitosamente! Bienvenido/a, ${linkedUser.nombre_display}.`,
      );
      await sendMainMenu(ctx);
      return;
    }

    // Normal /start for already-registered users
    if (!ctx.telegramUser) {
      await ctx.reply(
        "No estás registrado. Pide un código de acceso a tu administrador.",
      );
      return;
    }

    await sendMainMenu(ctx);
  });

  bot.command("jornal", async (ctx) => {
    if (!ctx.telegramUser?.modulos_permitidos?.includes("labores")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("jornal");
  });

  bot.command("monitoreo", async (ctx) => {
    if (!ctx.telegramUser?.modulos_permitidos?.includes("monitoreo")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("monitoreo");
  });

  bot.command("gasto", async (ctx) => {
    if (!ctx.telegramUser?.modulos_permitidos?.includes("gastos")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("gasto");
  });

  bot.command("ingreso", async (ctx) => {
    if (!ctx.telegramUser?.modulos_permitidos?.includes("ingresos")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("ingreso");
  });

  bot.command("pesaje", async (ctx) => {
    if (!ctx.telegramUser?.modulos_permitidos?.includes("hato_produccion")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("pesajeLeche");
  });

  // /evento — registro en campo del ciclo reproductivo (monta, inseminación,
  // secado, parto, aborto). Se gatea con el MISMO módulo que el pesaje
  // (`hato_produccion`) a propósito: es el módulo que Fernando ya tiene, así
  // que el flujo sirve desde el primer despliegue sin tocar configuración.
  // Separarlo en un módulo propio es un cambio de `modulos_permitidos`, no
  // de código.
  bot.command("evento", async (ctx) => {
    if (!ctx.telegramUser?.modulos_permitidos?.includes("hato_produccion")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("eventoHato");
  });

  bot.command("cancelar", async (ctx) => {
    await ctx.conversation.exit();
    await ctx.reply("Operación cancelada.");
    await sendMainMenu(ctx);
  });

  bot.command("ayuda", async (ctx) => {
    await ctx.reply(
      [
        "Comandos disponibles:",
        "/start — Menú principal",
        "/jornal — Registrar un jornal",
        "/monitoreo — Registrar monitoreo",
        "/gasto — Registrar un gasto",
        "/ingreso — Registrar un ingreso",
        "/pesaje — Cargar la planilla de pesaje de leche por foto",
        "/evento — Registrar monta, inseminación, secado, parto o aborto",
        "/cancelar — Cancelar operación actual",
        "/ayuda — Ver esta ayuda",
        "",
        "También puedes escribirme cualquier pregunta sobre la finca y te responderé con datos reales.",
      ].join("\n"),
    );
  });

  // ==========================================================================
  // CALLBACK QUERY HANDLERS (inline keyboard buttons)
  // ==========================================================================

  bot.callbackQuery("start_jornal", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.telegramUser?.modulos_permitidos?.includes("labores")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("jornal");
  });

  bot.callbackQuery("start_monitoreo", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.telegramUser?.modulos_permitidos?.includes("monitoreo")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("monitoreo");
  });

  bot.callbackQuery("start_gasto", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.telegramUser?.modulos_permitidos?.includes("gastos")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("gasto");
  });

  bot.callbackQuery("start_ingreso", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.telegramUser?.modulos_permitidos?.includes("ingresos")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("ingreso");
  });

  bot.callbackQuery("start_pesajeLeche", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.telegramUser?.modulos_permitidos?.includes("hato_produccion")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("pesajeLeche");
  });

  bot.callbackQuery("start_eventoHato", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.telegramUser?.modulos_permitidos?.includes("hato_produccion")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("eventoHato");
  });

  bot.callbackQuery("start_consulta", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.telegramUser?.modulos_permitidos?.includes("consultas")) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.reply(
      "Escríbeme tu pregunta y te responderé con datos de la finca.",
    );
  });

  // --------------------------------------------------------------------------
  // MEMORY SAVE FLOW — inline buttons confirm/cancel a propose_memory_save
  // --------------------------------------------------------------------------

  bot.callbackQuery(/^mem_save:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const token = ctx.match?.[1];
    if (!token) return;
    if (!ctx.telegramUser?.usuario_id) {
      await ctx.reply("Tu cuenta no está vinculada.");
      return;
    }
    const sb = getSupabaseAdmin();
    // Reach into Esco directly via the in-process executor by calling the
    // edge function endpoint? No — the proposal cache is in-memory inside
    // chat.tsx. Sending another LLM message with the right tool call is the
    // cleanest way; but for the contract we just need commit_memory_save to
    // run. Since the cache is in-process and bot + chat live in the same
    // edge function, we import the executor's behaviour by issuing a synthetic
    // tool call through llmToolLoop with a forced tool_choice. Simpler: just
    // call the dispatch directly via a fetch-less internal route.
    //
    // For Phase 3D, we keep it pragmatic: persist directly using the service
    // role. The proposal token expires in 30 min and the service role bypass
    // is acceptable here because the user just tapped ✅ on Telegram.
    const conversationId = await getOrCreateTelegramConversation(ctx.telegramUser.usuario_id);
    // Rehydrate: find the most recent assistant message whose metadata.tool_interactions
    // contains a propose_memory_save with this token
    const { data: assistantMsgs } = await sb
      .from("chat_messages")
      .select("metadata")
      .eq("conversation_id", conversationId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(5);
    type Interaction = { tool: string; args?: Record<string, unknown>; result_summary?: string };
    let content: string | null = null;
    for (const m of assistantMsgs ?? []) {
      const meta = m.metadata as { tool_interactions?: Interaction[] } | null;
      const hit = meta?.tool_interactions?.find((t) =>
        t.tool === "propose_memory_save" && typeof t.result_summary === "string" && t.result_summary.includes(token)
      );
      if (hit?.result_summary) {
        try {
          const parsed = JSON.parse(hit.result_summary);
          content = typeof parsed.content === "string" ? parsed.content : null;
        } catch {
          // result_summary is truncated to 500 chars in chat.tsx; if it cuts off
          // mid-JSON, fall back to the original args.content
          content = (hit.args?.content as string) ?? null;
        }
        break;
      }
    }
    if (!content) {
      await ctx.editMessageText("No pude recuperar la memoria propuesta. Intenta de nuevo.");
      return;
    }
    const { error } = await sb.from("esco_memorias").insert({
      user_id: ctx.telegramUser.usuario_id,
      content: content.slice(0, 1000),
      source_channel: "telegram",
    });
    if (error) {
      console.error("[Telegram] Memory save error:", error.message);
      await ctx.editMessageText(`No pude guardar la memoria: ${error.message}`);
      return;
    }
    await ctx.editMessageText(`✅ Guardado: _${content.slice(0, 200)}_`, { parse_mode: "Markdown" }).catch(
      () => ctx.editMessageText(`✅ Guardado: ${content.slice(0, 200)}`),
    );
  });

  bot.callbackQuery(/^mem_cancel:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Cancelado" });
    await ctx.editMessageText("❌ No se guardó la memoria.");
  });

  // --------------------------------------------------------------------------
  // HATO LECHERO — respuesta a una alerta del motor de S6 (plan §6 Épica C).
  // Botones [Sí / Todavía no / Otra cosa] generados por `hato-alertas-tick.ts`
  // (`hato_alerta:{alertaId}:{si|no|otro}`), mismo patrón que `mem_save:`.
  // Toda respuesta escribe un evento auditado (quién, cuándo, qué) — plan
  // §6 Épica C "toda respuesta escribe evento auditado".
  //
  // BROADCAST CON CIERRE POR EL PRIMERO (migración 096, 2026-08-14): desde
  // que una alerta se manda a TODOS los suscritos de su tipo
  // (`hato_alertas_envios`, una fila por suscrito), este handler puede
  // recibir el mismo `hato_alerta:{id}:...` de MÁS DE UNA persona. La
  // primera respuesta cierra la alerta para todos; cualquier respuesta
  // posterior a la misma alerta se trata "amablemente" (no es un error, es
  // el diseño) y NUNCA repite el efecto de dominio ni el evento auditado.
  // La atomicidad de "quién llegó primero" la da el propio UPDATE de abajo:
  // solo tiene efecto si la alerta TODAVÍA está `pendiente`/`enviada`
  // (`.in('estado', ...)` + `.select()` para saber si de verdad afectó una
  // fila) — dos respuestas casi simultáneas no pueden colarse las dos.
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // DESHACER un evento recién registrado por /evento (N9).
  //
  // Es la contraparte de la decisión D-B (Telegram escribe DIRECTO, sin cola
  // de aprobación): el error probable en el corral no es inventarse un
  // evento, es elegir la vaca equivocada de una lista de homónimas — y eso se
  // ve en el resumen al instante. Sin este botón, corregirlo exigiría entrar
  // a la app desde una finca sin internet.
  //
  // Solo borra eventos de `fuente='telegram'`: el id viaja en el callback, y
  // un callback puede reenviarse. Nunca puede convertirse en una vía para
  // borrar un evento derivado de un chequeo aprobado.
  // --------------------------------------------------------------------------

  bot.callbackQuery(/^hato_ev_undo:([0-9a-f-]+):([0-9a-f-]+|-)$/, async (ctx) => {
    const eventoId = ctx.match?.[1];
    const usoId = ctx.match?.[2];
    if (!eventoId) {
      await ctx.answerCallbackQuery({ text: "No se pudo procesar." });
      return;
    }

    const sb = getSupabaseAdmin();
    const { data: evento } = await sb
      .from("hato_eventos")
      .select("id, fuente")
      .eq("id", eventoId)
      .maybeSingle();

    if (!evento) {
      await ctx.answerCallbackQuery({ text: "Ese registro ya no existe." });
      return;
    }
    if (evento.fuente !== "telegram") {
      await ctx.answerCallbackQuery({ text: "Ese registro no se puede deshacer desde aquí." });
      return;
    }

    // El uso de pajilla se borra PRIMERO: si fallara después del evento, el
    // inventario quedaría descontado por un servicio que ya no existe.
    if (usoId && usoId !== "-") {
      const { error: errorUso } = await sb.from("hato_pajillas_uso").delete().eq("id", usoId);
      if (errorUso) {
        await ctx.answerCallbackQuery({ text: "No se pudo devolver la pajilla. No borré nada." });
        return;
      }
    }

    const { error } = await sb.from("hato_eventos").delete().eq("id", eventoId);
    if (error) {
      await ctx.answerCallbackQuery({ text: "No se pudo deshacer. Intenta de nuevo." });
      return;
    }

    await ctx.answerCallbackQuery({ text: "Deshecho." });
    // Se edita el mensaje para quitar el botón: un segundo toque sobre un id
    // ya borrado solo diría "ya no existe", pero deja al usuario dudando de
    // si borró dos cosas.
    await ctx.editMessageText("↩️ Registro deshecho. No quedó nada guardado.\n\nUsa /evento para registrarlo de nuevo.");
  });

  bot.callbackQuery(/^hato_alerta:(.+):(si|no|otro)$/, async (ctx) => {
    const alertaId = ctx.match?.[1];
    const respuesta = ctx.match?.[2] as "si" | "no" | "otro" | undefined;
    if (!alertaId || !respuesta) {
      await ctx.answerCallbackQuery({ text: "No se pudo procesar la respuesta." });
      return;
    }

    const sb = getSupabaseAdmin();
    const respondidaPor = ctx.telegramUser?.nombre_display ?? String(ctx.from?.id ?? "desconocido");
    const nuevoEstado = respuesta === "si" ? "confirmada" : "respondida";

    // Reclamo atómico de "quién llegó primero" (096): el UPDATE solo afecta
    // una fila si la alerta TODAVÍA está pendiente/enviada -- si otro
    // suscrito ya la cerró (o la cerró este mismo dos veces, doble-tap),
    // `.in('estado', ...)` no matchea nada y `actualizada` viene null. Un
    // read-then-write habría dejado una ventana de carrera entre dos
    // suscritos respondiendo casi a la vez; este single UPDATE no la tiene.
    const { data: actualizada, error: errorUpdate } = await sb
      .from("hato_alertas")
      .update({ estado: nuevoEstado, respuesta, respondida_por: respondidaPor })
      .eq("id", alertaId)
      .in("estado", ["pendiente", "enviada"])
      .select("id, tipo, animal_id, paso_id, datos")
      .maybeSingle();

    if (errorUpdate) {
      console.error("[Telegram] hato_alerta update error:", errorUpdate.message);
      await ctx.answerCallbackQuery({ text: "No pude guardar tu respuesta. Intenta de nuevo." });
      return;
    }

    if (!actualizada) {
      // O la alerta no existe, o ya la cerró otro suscrito (o este mismo,
      // doble-tap) -- se distingue leyendo el estado actual, "amablemente",
      // SIN repetir el efecto de dominio ni el evento auditado.
      const { data: alertaExistente } = await sb
        .from("hato_alertas")
        .select("id, estado, respuesta, respondida_por")
        .eq("id", alertaId)
        .maybeSingle();
      if (!alertaExistente) {
        await ctx.answerCallbackQuery({ text: "No encontré esa alerta -- puede que ya no exista." });
        return;
      }
      await ctx.answerCallbackQuery({
        text: construirMensajeAlertaYaResuelta(
          alertaExistente.estado,
          alertaExistente.respondida_por,
          alertaExistente.respuesta as "si" | "no" | "otro" | null,
        ),
      });
      await ctx.editMessageReplyMarkup().catch(() => {});
      return;
    }

    const hoyIso = new Date().toISOString().slice(0, 10);

    if (respuesta === "si") {
      // Efectos de dominio, append-only -- nunca se borra ni se sobreescribe
      // evidencia. Solo dos tipos tienen un efecto de dominio definido más
      // allá de marcar la alerta -- el resto (rechequeo_due,
      // servicio_sin_confirmacion, parto_proximo) se resuelve con la sola
      // confirmación (Martha/Fernando ya lo dejan constar por otra vía --
      // chequeo, ficha -- este "sí" solo cierra el lazo de la alerta).
      if (actualizada.tipo === "secado_due" && actualizada.animal_id) {
        const { error: errorEvento } = await sb.from("hato_eventos").insert({
          animal_id: actualizada.animal_id,
          tipo: "secado_real",
          fecha: hoyIso,
          fecha_confianza: "aproximada",
          alerta_id: alertaId,
          fuente: "alerta",
        });
        if (errorEvento) console.error("[Telegram] hato_eventos (secado_real) insert error:", errorEvento.message);
      } else if (actualizada.tipo === "tratamiento_paso" && actualizada.paso_id) {
        // hato_eventos.tipo (CHECK de la migración 053) no tiene ninguna
        // variante de "tratamiento" -- no hay un evento que insertar aquí,
        // solo se marca ejecutado el paso mismo (055).
        const { error: errorPaso } = await sb
          .from("hato_tratamiento_pasos")
          .update({ fecha_ejecutada: hoyIso })
          .eq("id", actualizada.paso_id);
        if (errorPaso) console.error("[Telegram] hato_tratamiento_pasos update error:", errorPaso.message);
      }
    }
    // "no"/"otro" -- NUNCA se auto-resuelve: Martha lo revisa desde
    // AlertasView (plan §6 Épica C, C4 "supervisión por excepción").

    await ctx.answerCallbackQuery({
      text: respuesta === "si"
        ? "Gracias, quedó registrado."
        : respuesta === "no"
        ? "Anotado, seguimos pendientes."
        : "Anotado -- Martha lo revisa.",
    });
    await ctx.editMessageReplyMarkup().catch(() => {});

    // Broadcast (096): editar el mensaje de CADA OTRO suscrito al que se le
    // mandó esta alerta, para que vea que ya se resolvió y por quién --
    // `hato_alertas_envios` guarda el `message_id` de cada uno. El propio
    // chat de quien respondió queda excluido (ya se editó arriba, vía ctx).
    const mensajeOriginal = (actualizada.datos as { mensaje?: string } | null)?.mensaje ??
      "Alerta del hato lechero (sin mensaje generado).";
    const telegramIdRespondio = ctx.from?.id != null ? String(ctx.from.id) : null;
    const { fallidos } = await cerrarAlertaEnEnvios(
      sb,
      alertaId,
      telegramIdRespondio,
      construirMensajeCierreAlertaBroadcast(mensajeOriginal, respondidaPor, respuesta),
    );
    if (fallidos > 0) {
      console.error(`[Telegram] hato_alerta ${alertaId}: ${fallidos} mensaje(s) de otros suscritos no se pudieron editar al cerrar.`);
    }
  });

  // ==========================================================================
  // MEMORY PROPOSAL DETECTOR — inspects llmToolLoop's toolInteractions
  // ==========================================================================

  function findMemoryProposal(
    toolInteractions: Array<{ tool: string; args?: Record<string, unknown>; result_summary?: string }> | undefined,
  ): { token: string; content: string } | null {
    if (!toolInteractions) return null;
    for (const t of toolInteractions) {
      if (t.tool !== "propose_memory_save") continue;
      try {
        const parsed = t.result_summary ? JSON.parse(t.result_summary) : null;
        if (parsed?._memory_proposal && typeof parsed.token === "string") {
          return {
            token: parsed.token,
            content: typeof parsed.content === "string"
              ? parsed.content
              : (t.args?.content as string) ?? "",
          };
        }
      } catch {
        // result_summary truncated mid-JSON; fall back to args
        if (typeof t.args?.content === "string") {
          return { token: "unknown", content: t.args.content };
        }
      }
    }
    return null;
  }

  // ==========================================================================
  // CHAT PERSISTENCE HELPERS — same quality as web chat
  // ==========================================================================

  async function getOrCreateTelegramConversation(userId: string): Promise<string> {
    const sb = getSupabaseAdmin();
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    // Look for a recent conversation (updated within last 4 hours)
    const { data: recent } = await sb
      .from("chat_conversations")
      .select("id")
      .eq("user_id", userId)
      .gte("updated_at", fourHoursAgo)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (recent && recent.length > 0) return recent[0].id;

    // Create new conversation
    const { data: conv, error } = await sb
      .from("chat_conversations")
      .insert({ user_id: userId, title: "Telegram" })
      .select("id")
      .single();

    if (error) throw new Error(`Error creating conversation: ${error.message}`);
    return conv.id;
  }

  async function saveTelegramMessage(
    conversationId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("chat_messages").insert({
      conversation_id: conversationId,
      role,
      content,
      metadata: metadata || {},
    });
    if (error) console.error("[Telegram] Save message error:", error.message);
  }

  async function buildTelegramLlmMessages(
    conversationId: string,
    userId: string,
  ): Promise<
    Array<{
      role: string;
      content: string | null;
      tool_calls?: unknown[];
      tool_call_id?: string;
      name?: string;
    }>
  > {
    const sb = getSupabaseAdmin();
    const [{ data: history }, { data: memoriasRows }] = await Promise.all([
      sb
        .from("chat_messages")
        .select("role,content,metadata")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(20),
      sb
        .from("esco_memorias")
        .select("id,content,created_at,source_channel")
        .eq("user_id", userId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const memorias = (memoriasRows ?? []) as Array<{
      id: string;
      content: string;
      created_at: string;
      source_channel?: string;
    }>;

    const telegramTweaks =
      "\n\nEstás respondiendo por Telegram. Sé conciso. " +
      "No uses tablas markdown (no se renderizan en Telegram). " +
      "Usa listas con viñetas en su lugar. " +
      "Limita la respuesta a lo esencial.";

    const messages: Array<{
      role: string;
      content: string | null;
      tool_calls?: unknown[];
      tool_call_id?: string;
      name?: string;
    }> = [{ role: "system", content: getSystemPrompt(memorias) + telegramTweaks }];

    if (history) {
      for (const m of history) {
        const meta = m.metadata as
          | {
              tool_interactions?: Array<{
                tool: string;
                args: Record<string, unknown>;
                result_summary: string;
              }>;
            }
          | undefined;
        if (m.role === "assistant" && meta?.tool_interactions?.length) {
          const ctx = meta.tool_interactions
            .map(
              (t) =>
                `[${t.tool}(${JSON.stringify(t.args)}): ${t.result_summary}]`,
            )
            .join("\n");
          messages.push({
            role: "system",
            content: `Datos consultados en la respuesta anterior:\n${ctx}`,
          });
        }
        messages.push({ role: m.role, content: m.content });
      }
    }

    return messages;
  }

  // ==========================================================================
  // FREE-TEXT FALLBACK — Esco AI engine with conversation persistence
  // ==========================================================================

  bot.on("message:text", async (ctx) => {
    if (!ctx.telegramUser) return;

    if (!ctx.telegramUser.modulos_permitidos?.includes("consultas")) {
      await ctx.reply(
        "No tienes acceso a consultas. Usa los comandos del menú.",
      );
      return;
    }

    const userMessage = ctx.message.text;
    if (!userMessage?.trim()) return;

    await ctx.replyWithChatAction("typing");

    try {
      const userId = ctx.telegramUser.usuario_id;
      if (!userId) {
        await ctx.reply("Tu cuenta no está vinculada a un usuario del sistema.");
        return;
      }

      // Persist conversation
      const conversationId = await getOrCreateTelegramConversation(userId);
      await saveTelegramMessage(conversationId, "user", userMessage);

      // Build messages with full history + tool context + memorias
      const llmMessages = await buildTelegramLlmMessages(conversationId, userId);

      const { text: responseText, toolInteractions } =
        await llmToolLoop(llmMessages, userId);

      // Save assistant response with tool interaction metadata
      await saveTelegramMessage(conversationId, "assistant", responseText, {
        tool_interactions: toolInteractions,
      });

      // If Esco proposed saving a memory, render inline confirmation buttons
      // before the regular response. The token roundtrips through callback_data
      // back to commit_memory_save when the user taps ✅.
      const memoryProposal = findMemoryProposal(toolInteractions);
      if (memoryProposal) {
        const kb = new InlineKeyboard()
          .text("✅ Guardar", `mem_save:${memoryProposal.token}`)
          .text("❌ Cancelar", `mem_cancel:${memoryProposal.token}`);
        const preview = memoryProposal.content.length > 200
          ? memoryProposal.content.slice(0, 200) + "…"
          : memoryProposal.content;
        await ctx.reply(`📌 ¿Guardo esto para futuras conversaciones?\n\n_${preview}_`, {
          parse_mode: "Markdown",
          reply_markup: kb,
        }).catch(() => ctx.reply(`📌 ¿Guardo esto para futuras conversaciones?\n\n${preview}`, { reply_markup: kb }));
      }

      // Extract charts and send as images, text as messages
      const { textParts, charts } = extractChartsAndText(responseText);

      // Send text parts with Telegram-compatible markdown
      for (const part of textParts) {
        const formatted = formatForTelegram(part);
        if (formatted.length <= 4096) {
          await ctx
            .reply(formatted, { parse_mode: "Markdown" })
            .catch(() => ctx.reply(formatted));
        } else {
          const chunks = splitMessage(formatted, 4096);
          for (const chunk of chunks) {
            await ctx
              .reply(chunk, { parse_mode: "Markdown" })
              .catch(() => ctx.reply(chunk));
          }
        }
      }

      // Send charts as images via QuickChart.io
      for (const chart of charts) {
        try {
          const url = buildQuickChartUrl(chart);
          await ctx.replyWithPhoto(url, {
            caption: chart.title,
          });
        } catch (chartErr) {
          console.error("[Telegram] Chart render error:", chartErr);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      console.error("[Telegram] Esco AI error:", msg);
      await ctx.reply(
        "Hubo un error al procesar tu consulta. Intenta de nuevo.",
      );
    }
  });

  // Set the "/" command menu (fire-and-forget, errors are non-fatal)
  bot.api.setMyCommands([
    { command: "start", description: "Menú principal" },
    { command: "jornal", description: "Registrar jornal" },
    { command: "monitoreo", description: "Registrar monitoreo" },
    { command: "gasto", description: "Registrar un gasto" },
    { command: "ingreso", description: "Registrar un ingreso" },
    { command: "pesaje", description: "Cargar pesaje de leche por foto" },
    { command: "evento", description: "Registrar evento del hato" },
    { command: "cancelar", description: "Cancelar operación actual" },
    { command: "ayuda", description: "Ver ayuda" },
  ]).catch((err) => console.error("[Telegram] setMyCommands error:", err));

  _bot = bot;
  return bot;
}

// ============================================================================
// CHART UTILS — extract chart blocks and generate QuickChart.io images
// ============================================================================

interface ChartSpec {
  type: string;
  title: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string | string[];
  yFormat?: string;
  colors?: string[];
}

function extractChartsAndText(responseText: string): {
  textParts: string[];
  charts: ChartSpec[];
} {
  const chartPattern = /```(?:chart|json)?\s*\n?([\s\S]*?)```/g;
  const textParts: string[] = [];
  const charts: ChartSpec[] = [];

  let lastIndex = 0;
  let match;
  while ((match = chartPattern.exec(responseText)) !== null) {
    const before = responseText.slice(lastIndex, match.index).trim();
    if (before) textParts.push(before);
    lastIndex = match.index + match[0].length;

    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.type && parsed.data && parsed.xKey && parsed.yKey) {
        charts.push(parsed as ChartSpec);
      }
    } catch { /* skip invalid JSON */ }
  }

  const after = responseText.slice(lastIndex).trim();
  if (after) textParts.push(after);

  if (charts.length === 0 && textParts.length === 0) {
    textParts.push(responseText);
  }

  return { textParts, charts };
}

function buildQuickChartUrl(chart: ChartSpec): string {
  const labels = chart.data.map((d) => String(d[chart.xKey]));
  const keys = Array.isArray(chart.yKey) ? chart.yKey : [chart.yKey];
  const palette = chart.colors || [
    "#73991C", "#E74C3C", "#3498DB", "#F39C12", "#9B59B6", "#1ABC9C",
    "#E67E22", "#34495E", "#2ECC71", "#C0392B",
  ];

  const isPie = chart.type === "pie";

  const datasets = keys.map((key, i) => ({
    label: key,
    data: chart.data.map((d) => d[key]),
    // Pie charts need one color per slice; bar/line need one color per series
    backgroundColor: isPie
      ? chart.data.map((_, j) => palette[j % palette.length])
      : palette[i % palette.length],
    borderColor: isPie ? "#ffffff" : palette[i % palette.length],
    borderWidth: isPie ? 2 : undefined,
    fill: chart.type === "area",
  }));

  const chartType = chart.type === "area" ? "line" : chart.type;

  const config = {
    type: chartType,
    data: { labels, datasets },
    options: {
      title: { display: true, text: chart.title },
      plugins: {
        datalabels: isPie
          ? { display: true, color: "#fff", font: { weight: "bold" } }
          : { display: false },
      },
    },
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&w=600&h=400&bkg=white`;
}

function formatForTelegram(text: string): string {
  return text
    // Markdown headings → bold (### Title → *Title*)
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    // **bold** → *bold* (Telegram Markdown v1 uses single asterisk)
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    // Unordered lists: "* item" or "- item" → "• item"
    .replace(/^[\*\-]\s+/gm, "• ");
}

// ============================================================================
// UTILS
// ============================================================================

function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

/**
 * Compara dos secretos en tiempo constante.
 *
 * Se comparan los digests SHA-256, no las cadenas: así el bucle siempre
 * recorre 32 bytes y el tiempo de respuesta no filtra ni cuántos caracteres
 * acertó el atacante ni la longitud del secreto. Un `===` sobre strings
 * corta en el primer byte distinto, que es exactamente la pista que
 * permitiría adivinar el secreto byte a byte.
 */
async function secretosCoinciden(recibido: string, esperado: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(recibido)),
    crypto.subtle.digest("SHA-256", enc.encode(esperado)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/**
 * Webhook de Telegram.
 *
 * AUTH: secreto compartido `X-Telegram-Bot-Api-Secret-Token`, el encabezado
 * que el propio Telegram envía en cada update cuando el webhook se registró
 * con `setWebhook(url, { secret_token })`. NO es un JWT: el llamante es
 * Telegram, no una sesión humana, y la edge function corre con
 * `verify_jwt=false` (lo necesitan el webhook y los pg_cron de 060/102/105),
 * así que la puerta tiene que estar acá adentro.
 *
 * Sin este gate el endpoint aceptaba cualquier POST anónimo de internet: el
 * middleware de auth del bot resuelve la identidad con `ctx.from.id`, que
 * viene dentro del JSON que manda el llamante, o sea que bastaba con conocer
 * (o adivinar) el `telegram_id` de un usuario activo para actuar en su
 * nombre — incluido el de un usuario Gerencia, y con él todas las
 * herramientas de escritura del bot.
 *
 * Falla CERRADO, mismo contrato que `HATO_ALERTAS_TICK_SECRET`,
 * `ACCIONES_TICK_SECRET` y `CLIMA_SYNC_SECRET`: si la variable de entorno no
 * está configurada responde 503 y no toca nada, nunca corre "abierto".
 */
export async function handleWebhook(c: HonoContext): Promise<Response> {
  const secretoConfigurado = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!secretoConfigurado) {
    console.error(
      "[Telegram] TELEGRAM_WEBHOOK_SECRET no está configurado -- webhook deshabilitado.",
    );
    return c.json({
      error:
        "TELEGRAM_WEBHOOK_SECRET no está configurado en este entorno -- el webhook de Telegram está deshabilitado hasta que se configure el secreto y se registre el webhook con setWebhook(url, { secret_token }).",
    }, 503);
  }

  const recibido = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (!recibido || !(await secretosCoinciden(recibido, secretoConfigurado))) {
    console.warn("[Telegram] Webhook rechazado: secreto ausente o inválido.");
    return c.json({ error: "No autorizado." }, 401);
  }

  try {
    const bot = getBot();
    const update = await c.req.json();
    await bot.handleUpdate(update);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Webhook error";
    console.error("[Telegram] Webhook error:", msg);
    return c.json({ error: msg }, 500);
  }
  return c.json({ ok: true });
}
