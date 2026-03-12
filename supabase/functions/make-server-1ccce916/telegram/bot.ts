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
import { llmToolLoop, getSystemPrompt } from "../chat.ts";

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

  const bot = new Bot<BotContext>(Deno.env.get("TELEGRAM_BOT_TOKEN")!);

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
    await ctx.reply(
      "Escríbeme tu pregunta y te responderé con datos de la finca.",
    );
  });

  // ==========================================================================
  // FREE-TEXT FALLBACK — Esco AI engine
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
      const llmMessages: Array<{
        role: string;
        content: string | null;
        tool_calls?: unknown[];
        tool_call_id?: string;
        name?: string;
      }> = [
        {
          role: "system",
          content: getSystemPrompt() +
            "\n\nEstás respondiendo por Telegram. Sé conciso. " +
            "No uses tablas markdown (no se renderizan en Telegram). " +
            "Usa listas con viñetas en su lugar. " +
            "Limita la respuesta a lo esencial.",
        },
        { role: "user", content: userMessage },
      ];

      const responseText = await llmToolLoop(llmMessages);

      if (responseText.length <= 4096) {
        await ctx.reply(responseText, { parse_mode: "Markdown" }).catch(() =>
          ctx.reply(responseText)
        );
      } else {
        const chunks = splitMessage(responseText, 4096);
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(() =>
            ctx.reply(chunk)
          );
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
    await bot.init();
    const update = await c.req.json();
    await bot.handleUpdate(update);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Webhook error";
    console.error("[Telegram] Webhook error:", msg);
  }
  return c.json({ ok: true });
}
