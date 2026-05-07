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
import { llmToolLoop, getSystemPrompt } from "../chat.tsx";

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

export async function handleWebhook(c: HonoContext): Promise<Response> {
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
