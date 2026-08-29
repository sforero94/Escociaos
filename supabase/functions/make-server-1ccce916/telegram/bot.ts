// telegram/bot.ts — Grammy bot setup with webhook handler for Escocia OS
//
// Uses grammy conversations for multi-step flows and the Esco AI engine
// (from chat.ts) for free-text queries. Sessions are persisted in Supabase
// via the SupabaseAdapter so state survives across webhook invocations.
//
// All initialization is lazy (inside getBot()) to avoid BOOT_ERROR on
// Supabase Edge Functions, where top-level side effects can fail.

import { Bot, session, InlineKeyboard, InputFile } from "npm:grammy@1";
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
import { cierreRondaConversation } from "./conversations/cierreRonda.ts";
import { excepcionDavidConversation } from "./conversations/excepcionDavid.ts";
// `produccionQuincenal` (litros al camión) se retiró del bot -- SOW 3 de
// docs/plan_hato_produccion_rework.md §2.3: la quincena pasó a ser un
// registro financiero (`fin_ingreso_id NOT NULL`, migración 070) y el bot
// escribe con `service_role` (`auth.uid()` NULL), que no puede satisfacer
// ese NOT NULL ni restringirse a Gerencia (decisión 5 del dueño). `/pesaje`
// no toca dinero y se mantiene intacto.
import { llmToolLoop, getSystemPrompt } from "../chat.tsx";
import { construirMensajeAlertaYaResuelta, construirMensajeCierreAlertaBroadcast } from "../hato-alertas.ts";
import { cerrarAlertaEnEnvios, enviarMensajeTelegram } from "./enviar.ts";

// --- Ronda de inventario (Fase 3, Telegram/Uriel) ---------------------------
// docs/brief_tecnico_verificacion_inventario.md §5/§7/§13. Pipeline de voz
// (I/O puro contra OpenRouter) + helpers de consulta/mapeo sobre las tablas
// `rondas_*` (migración 125) + la lógica PURA espejada de
// `src/utils/rondaInventario/*` (docs/inventario/regenerar-copias-ronda-inventario.py).
import { ejecutarPipelineVozRonda, interpretarTranscrito } from "../ronda-voz-pipeline.ts";
import {
  alcanceComoItems,
  buscarExistenciasRonda,
  mensajeErrorRpc,
  obtenerAlcanceRonda,
  obtenerAlcanceRondaConCategoria,
  obtenerProductosFueraDeAlcance,
  obtenerResumenExcepcionesRonda,
  obtenerRondaEnCurso,
  obtenerTranscritoPendienteMasReciente,
  obtenerTranscritoPorId,
  payloadActorTelegram,
  primerDiaMesBogota,
  renderExistenciaLinea,
  type PreviewGuardado,
  type RondaInventarioRow,
  type TranscritoRondaRow,
  // Fase 4 (David y Santiago) -- §7.2/§13 del brief técnico.
  excepcionComoCaso,
  excepcionComoCasoProponer,
  excepcionComoCasoSantiago,
  esUsuarioTelegramGerencia,
  hoyBogota,
  obtenerExcepcionDetalle,
  obtenerExcepcionesParaProponer,
  obtenerDestinatariosModuloRonda,
  obtenerExcepcionesPendientesDavid,
  obtenerExcepcionesPropuestasParaSantiago,
  resolverNombreActor,
  // Fase 5 (recordatorio/alerta del día 15/reporte de cierre) -- §8/§13.
  // `nombrePeriodoRonda` vivía como función local acá mismo hasta que el
  // tick (`ronda-inventario-tick.ts`) también la necesitó -- un solo dueño
  // del formato "septiembre 2026", ver su comentario en ronda-helpers.ts.
  nombrePeriodoRonda,
} from "./ronda-helpers.ts";
import { resolverHallazgos, type ProductoFueraDeAlcance } from "../rondaInventario/resolverHallazgos.ts";
import type { RespuestaModeloInterprete } from "../rondaInventario/interpretarNota.ts";
import {
  aplicarCorreccion,
  construirPreview,
  construirTextoConCorrecciones,
  formatearCantidad,
  intentosPreviewAgotados,
  MAX_INTENTOS_PREVIEW,
  previewConfirmable,
  renderPreviewTelegram,
  type PreviewRonda,
} from "../rondaInventario/preview.ts";
import { construirAlcanceMd } from "../rondaInventario/alcanceTxt.ts";
import { CAUSAS_RAIZ, causaPorIndice } from "../rondaInventario/causasRaiz.ts";
import {
  etiquetaDecision,
  renderCasoProponer,
  renderCasoSantiago,
  renderConfirmacionDecision,
  renderConfirmacionPropuesta,
  renderLineaPendienteDavid,
} from "../rondaInventario/resolucion.ts";
// Fase 5 (§8/§13 del brief técnico) -- `claveRecordatorioBase`/`sumarDiasFecha`
// son las MISMAS funciones puras que usa `ronda-inventario-tick.ts` para
// decidir cuándo reenviar el recordatorio tras una postergación (A-4): el
// botón "Posponer" sólo escribe el `detalle.posponer_hasta` que el tick va a
// leer, con la MISMA clave y la MISMA aritmética de fechas -- un solo dueño
// de las dos, nunca un cálculo de fechas duplicado entre quien pospone y
// quien decide si ya toca reenviar.
import { claveRecordatorioBase, sumarDiasFecha } from "../rondaInventario/tick.ts";

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
  bot.use(createConversation(cierreRondaConversation, "cierreRonda"));
  bot.use(createConversation(excepcionDavidConversation, "excepcionDavid"));

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
    if (mods.includes("inventario_ronda")) {
      kb.text("🧮 Ronda de inventario", "start_ronda").row();
    }
    if (mods.includes("inventario_explicacion")) {
      kb.text("🗣️ Explicar discrepancias", "start_explicar").row();
    }
    if (mods.includes("inventario_aprobacion")) {
      kb.text("✅ Aprobar ajustes", "start_aprobar").row();
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

  // ==========================================================================
  // RONDA DE INVENTARIO — Uriel (Fase 3, docs/brief_tecnico_verificacion_inventario.md §7.2/§13)
  // ==========================================================================

  function tieneAccesoRonda(ctx: BotContext): boolean {
    return !!ctx.telegramUser?.modulos_permitidos?.includes("inventario_ronda");
  }

  /** `.md` del alcance completo (§7.2: reemplazo literal de la hoja impresa
   * del Sheet de David) -- se manda al abrir la ronda y cada vez que Uriel
   * toca "Ver alcance completo". R-15/CA-13: nunca precio. Tabla agrupada
   * por categoría (Fertilizante/Enmienda, agroquímicos, Herramienta/Equipo,
   * Otros -- `ORDEN_CATEGORIA` en `alcanceTxt.ts`), pedido de Santiago
   * probando en vivo (2026-08-28) para que refleje cómo está organizada la
   * bodega físicamente. */
  async function enviarAlcanceMd(ctx: BotContext, sb: SupabaseClient, ronda: RondaInventarioRow) {
    const alcance = await obtenerAlcanceRondaConCategoria(sb, ronda.id);
    const texto = construirAlcanceMd(
      ronda.periodo,
      alcance.map((a) => ({ categoria: a.categoria, nombre: a.nombre_producto, cantidad: a.cantidad_teorica, unidad: a.unidad })),
    );
    await ctx.replyWithDocument(
      new InputFile(new TextEncoder().encode(texto), `alcance-ronda-${ronda.periodo}.md`),
    );
  }

  async function manejarComandoRonda(ctx: BotContext) {
    const sb = getSupabaseAdmin();
    const ronda = await obtenerRondaEnCurso(sb);

    if (ronda) {
      const resumen = await obtenerResumenExcepcionesRonda(sb, ronda.id);
      const kb = new InlineKeyboard()
        .text("📄 Ver alcance completo", `ronda_alcance:${ronda.id}`)
        .row()
        .text("🔒 Cerrar ronda", "start_cierreRonda");
      await ctx.reply(
        [
          `🧮 Ronda de ${nombrePeriodoRonda(ronda.periodo)} — en curso.`,
          ronda.es_linea_base
            ? "Esta es la ronda de LÍNEA BASE: compara por primera vez contra el sistema, no contra ningún Sheet aparte."
            : null,
          `Hallazgos reportados: ${resumen.total} (${resumen.pendientes} todavía en curso).`,
          resumen.transcritosSinConfirmar > 0
            ? `⚠️ ${resumen.transcritosSinConfirmar} nota(s) de voz narrada(s) sin confirmar todavía.`
            : null,
          "",
          "Mándame una nota de voz con lo que encontraste al recorrer, o usa /existencias <producto> para consultar el teórico del sistema.",
          "Cuando termines de recorrer, usa /cerrarronda.",
        ]
          .filter((l): l is string => l !== null)
          .join("\n"),
        { reply_markup: kb },
      );
      return;
    }

    const kb = new InlineKeyboard().text("🚀 Abrir ronda de este mes", "ronda_abrir_manual");
    await ctx.reply(
      [
        "No hay ninguna ronda en curso.",
        "Normalmente te la recuerdo por acá la primera semana del mes. Si ya te toca recorrer y no llegó el recordatorio, puedes abrirla tú mismo.",
      ].join("\n"),
      { reply_markup: kb },
    );
  }

  bot.command("ronda", async (ctx) => {
    if (!tieneAccesoRonda(ctx)) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await manejarComandoRonda(ctx);
  });

  // A-2/R-15: cantidad y unidad, NUNCA precio -- reemplaza la hoja impresa
  // del Sheet de David. Contra el alcance CONGELADO de la ronda en curso,
  // nunca contra todo el catálogo.
  bot.command("existencias", async (ctx) => {
    if (!tieneAccesoRonda(ctx)) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    const texto = ctx.match?.trim();
    if (!texto) {
      await ctx.reply("Escribe /existencias seguido del nombre del producto. Ej: /existencias silicalmag");
      return;
    }
    const sb = getSupabaseAdmin();
    const ronda = await obtenerRondaEnCurso(sb);
    if (!ronda) {
      await ctx.reply("No hay ninguna ronda en curso -- no hay nada que consultar todavía.");
      return;
    }
    const resultados = await buscarExistenciasRonda(sb, ronda.id, texto);
    if (resultados.length === 0) {
      await ctx.reply(`No encontré ningún producto del alcance de esta ronda que coincida con "${texto}".`);
      return;
    }
    await ctx.reply(resultados.map(renderExistenciaLinea).join("\n"));
  });

  // A-5/R-2: cerrar declarando qué se recorrió -- asistente genuino
  // (conversación `cierreRonda`, §7.2 del brief técnico).
  bot.command("cerrarronda", async (ctx) => {
    if (!tieneAccesoRonda(ctx)) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("cierreRonda");
  });

  bot.callbackQuery("start_ronda", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoRonda(ctx)) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await manejarComandoRonda(ctx);
  });

  bot.callbackQuery("start_cierreRonda", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoRonda(ctx)) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await ctx.conversation.enter("cierreRonda");
  });

  /** Abre la ronda del mes actual -- la MISMA acción para el botón manual
   * ("🚀 Abrir ronda de este mes" de `/ronda`, cuando no hay ninguna en
   * curso) y para el botón "Empezar" del recordatorio automático (Fase 5,
   * §8.1/§8.4 del brief técnico). Un solo cuerpo: el `callback_data`
   * distinto de cada botón (`ronda_abrir_manual` / `ronda_recordatorio_empezar`)
   * sólo sirve para distinguir el origen en logs si hiciera falta -- nunca
   * cambia el comportamiento. */
  async function abrirRondaDelMes(ctx: BotContext): Promise<void> {
    if (!ctx.telegramUser) return;
    const sb = getSupabaseAdmin();
    const periodo = primerDiaMesBogota();
    const { data, error } = await sb.rpc("fn_ronda_abrir", {
      payload: { ...payloadActorTelegram(ctx.telegramUser.id), periodo },
    });
    if (error) {
      await ctx.reply(`No se pudo abrir la ronda: ${mensajeErrorRpc(error)}`);
      return;
    }
    const info = data as { ronda_id?: string; productos_en_alcance?: number; es_linea_base?: boolean } | null;
    if (!info?.ronda_id) {
      await ctx.reply("La ronda se abrió, pero no pude leer la respuesta completa. Usa /ronda para ver el estado.");
      return;
    }
    await ctx.reply(
      [
        `✅ Ronda de ${nombrePeriodoRonda(periodo)} abierta.`,
        info.es_linea_base
          ? "Es la ronda de LÍNEA BASE: compara por primera vez el inventario físico contra el sistema, no contra ningún Sheet aparte."
          : null,
        `Alcance: ${info.productos_en_alcance ?? 0} producto(s) con existencia.`,
        "Te mando la lista completa en un archivo aparte.",
      ]
        .filter((l): l is string => l !== null)
        .join("\n"),
    );

    const ronda = await obtenerRondaEnCurso(sb);
    if (ronda) await enviarAlcanceMd(ctx, sb, ronda);
  }

  // Apertura manual (§7.2/§13 de la tarea de esta sesión): hasta que exista
  // el tick de la Fase 5, el recordatorio automático no dispara -- sin este
  // botón Uriel no podría empezar la primera ronda de punta a punta. Sigue
  // vivo igual ahora que el tick existe: Uriel puede adelantarse al
  // recordatorio del día 1 sin esperarlo.
  bot.callbackQuery("ronda_abrir_manual", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoRonda(ctx) || !ctx.telegramUser) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await abrirRondaDelMes(ctx);
  });

  bot.callbackQuery(/^ronda_alcance:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoRonda(ctx)) return;
    const rondaId = ctx.match?.[1];
    if (!rondaId) return;
    const sb = getSupabaseAdmin();
    const { data } = await sb.from("rondas_inventario").select("id, periodo, estado, es_linea_base, abierta_en, alcance_declarado, alcance_nota").eq("id", rondaId).maybeSingle();
    const ronda = data as RondaInventarioRow | null;
    if (!ronda) {
      await ctx.reply("Esa ronda ya no existe.");
      return;
    }
    await enviarAlcanceMd(ctx, sb, ronda);
  });

  // ==========================================================================
  // RONDA DE INVENTARIO — recordatorio automático (Fase 5,
  // docs/brief_tecnico_verificacion_inventario.md §8.1/§8.4/§13). El tick
  // (`ronda-inventario-tick.ts`, disparado por el pg_cron de la migración
  // 127) ENVÍA el mensaje con los botones `[Empezar]`/`[Posponer]`; lo que
  // sigue acá es lo que los RESUELVE -- mismo reparto que el resto del
  // módulo (el tick decide y dispara, `bot.ts` atiende la respuesta humana).
  //
  // A-4 no especifica la mecánica de posponer ("que el sistema me vuelva a
  // buscar", sin más detalle) -- se resolvió acá con tres botones rápidos
  // (Mañana/+3 días/+1 semana), sin conversación, mismo estilo que el resto
  // de este módulo (nunca un asistente de Grammy para una sola decisión).
  // ==========================================================================

  bot.callbackQuery("ronda_recordatorio_empezar", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoRonda(ctx) || !ctx.telegramUser) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await abrirRondaDelMes(ctx);
  });

  bot.callbackQuery("ronda_recordatorio_posponer", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoRonda(ctx)) return;
    const kb = new InlineKeyboard()
      .text("Mañana", "ronda_posponer:1")
      .row()
      .text("En 3 días", "ronda_posponer:3")
      .row()
      .text("La próxima semana", "ronda_posponer:7");
    await ctx.editMessageText("¿En cuántos días te recuerdo de nuevo?", { reply_markup: kb }).catch(() => {});
  });

  /** Escribe `detalle.posponer_hasta` en la MISMA fila (clave base,
   * `recordatorio:AAAA-MM`) que el tick usó para el envío original --
   * `upsert` porque, en teoría, esa fila ya existe siempre (el tick la crea
   * ANTES de enviar el mensaje que trae este botón), pero un `upsert` no
   * revienta si por algún motivo no estuviera. No toca `enviado_en` (el
   * `INSERT`/`UPDATE` de Supabase sólo escribe las columnas que se le
   * pasan) -- el tick vuelve a leer esta fila el día de la postergación para
   * decidir si hoy toca reenviar (`decidirRecordatorio`, `tick.ts`). */
  bot.callbackQuery(/^ronda_posponer:(1|3|7)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoRonda(ctx)) return;
    const dias = Number(ctx.match?.[1]) as 1 | 3 | 7;
    const sb = getSupabaseAdmin();
    const periodo = primerDiaMesBogota();
    const posponerHasta = sumarDiasFecha(hoyBogota(), dias);
    const { error } = await sb
      .from("rondas_avisos")
      .upsert({ clave: claveRecordatorioBase(periodo), ronda_id: null, detalle: { posponer_hasta: posponerHasta } }, { onConflict: "clave" });
    if (error) {
      console.error("[Telegram] ronda: error al posponer recordatorio:", error.message);
      await ctx.reply("No se pudo posponer -- intenta de nuevo.");
      return;
    }
    await ctx.editMessageText(`Listo -- te vuelvo a escribir el ${posponerHasta}.`).catch(() => {});
  });

  // ==========================================================================
  // RONDA DE INVENTARIO — David y Santiago (Fase 4,
  // docs/brief_tecnico_verificacion_inventario.md §7.2/§13). Cierra el ciclo
  // de una excepción: David confirma/explica y captura con respaldo
  // (B-1/B-2, `/explicar` -> conversación `excepcionDavid`), David o Uriel
  // proponen el ajuste (B-5, `/proponer`), Santiago aprueba/desestima y lo
  // aplica (B-6/B-7, `/aprobar`).
  //
  // `/proponer` y `/aprobar` NO son conversaciones (§7.2, literal): son
  // callbacks en dos pasos (elegir causa -> confirmar). Santiago es el
  // usuario más pesado de Esco -- una conversación activa lo bloquearía. El
  // `callback_data` codifica la causa por su ÍNDICE (1-7, `causaPorIndice`/
  // `indiceDeCausa` de `causasRaiz.ts`), nunca por la clave: la clave más
  // larga (`movimiento_no_capturado`, 23 bytes) no cabe junto a un
  // `excepcion_id` (UUID, 36 bytes) dentro del límite de 64 bytes que
  // Telegram impone a `callback_data`.
  // ==========================================================================

  /** Push a quien tenga `inventario_explicacion` apenas se confirma un
   * hallazgo -- pedido de Santiago probando en vivo (2026-08-28): antes de
   * esto, confirmar sólo creaba la excepción calladamente (diseño pull,
   * `/explicar`); David nunca se enteraba sin acordarse de chequear. NO es
   * una alerta del catálogo 096 (§3.4 del brief técnico enumera sólo tres:
   * recordatorio/día 15/reporte de cierre) -- es un aviso por-evento, a
   * cualquier suscrito ACTIVO del módulo, sin nada que configurar en la
   * pantalla de Telegram. Mismo texto y mismo botón `Explicar` que ya usa la
   * lista de `/explicar` -- un solo dueño del renderizado. Best-effort: un
   * fallo de envío (chat bloqueado, nadie vinculado todavía) no revierte ni
   * bloquea la confirmación, que ya quedó escrita.
   */
  async function enviarAvisoNuevasExcepciones(sb: SupabaseClient, excepcionIds: readonly string[]) {
    if (excepcionIds.length === 0) return;
    const destinatarios = await obtenerDestinatariosModuloRonda(sb, "inventario_explicacion");
    if (destinatarios.length === 0) return;

    for (const excepcionId of excepcionIds) {
      const excepcion = await obtenerExcepcionDetalle(sb, excepcionId);
      if (!excepcion) continue;
      const texto = `🔔 Nueva discrepancia para explicar:\n${renderLineaPendienteDavid(excepcionComoCaso(excepcion))}`;
      const botones = [{ texto: "Explicar", callbackData: `ronda_expl:${excepcionId}` }];
      for (const destinatario of destinatarios) {
        const resultado = await enviarMensajeTelegram(sb, {
          telegramId: destinatario.telegramId,
          telegramUsuarioId: destinatario.telegramUsuarioId,
          texto,
          botones,
          tipoMensaje: "ronda_aviso_excepcion",
          flujo: "ronda_inventario",
        });
        if (!resultado.ok) {
          console.error(`[Telegram] ronda: aviso de excepción ${excepcionId} a ${destinatario.telegramId} falló:`, resultado.error);
        }
      }
    }
  }

  function tieneAccesoExplicacion(ctx: BotContext): boolean {
    return !!ctx.telegramUser?.modulos_permitidos?.includes("inventario_explicacion");
  }

  function tieneAccesoAprobacion(ctx: BotContext): boolean {
    return !!ctx.telegramUser?.modulos_permitidos?.includes("inventario_aprobacion");
  }

  // B-5: "el ajuste lo puede proponer David o Uriel" -- MISMA autorización
  // que `fn_ronda_proponer_ajuste` (migración 126, corregida 2026-08-28 tras
  // la revisión del dueño): cualquiera de los dos módulos habilita.
  function tieneAccesoProponer(ctx: BotContext): boolean {
    const mods = ctx.telegramUser?.modulos_permitidos ?? [];
    return mods.includes("inventario_ronda") || mods.includes("inventario_explicacion");
  }

  const ETIQUETAS_ESTADO_EXCEPCION: Record<string, string> = {
    reportada: "reportada",
    explicacion_precargada: "con la cita de Uriel sin confirmar",
    explicada: "ya explicada",
    cerrada_sin_ajuste: "cerrada sin ajuste",
    resuelta_con_captura: "ya resuelta con captura",
    ajuste_propuesto: "con un ajuste propuesto",
    ajuste_aprobado: "con un ajuste ya aprobado",
    ajuste_desestimado: "con un ajuste desestimado",
    ajuste_aplicado: "con un ajuste ya aplicado",
  };

  /** Teclado con una fila por causa ACTIVA del catálogo (D-T2: sólo
   * `activo`), en el orden de `CAUSAS_RAIZ` (== `orden`, el mismo que la
   * semilla SQL). `construirCallback` arma el `callback_data` de cada fila --
   * distinto entre `/proponer` (`rpa:`) y `/aprobar` (`rda:...:<decision>:`). */
  function tecladoCausas(construirCallback: (indice: number) => string): InlineKeyboard {
    const kb = new InlineKeyboard();
    for (const causa of CAUSAS_RAIZ.filter((c) => c.activo)) {
      kb.text(causa.etiqueta, construirCallback(causa.orden)).row();
    }
    return kb;
  }

  // ---- /explicar (David, B-1/B-2) --------------------------------------------

  bot.command("explicar", async (ctx) => {
    if (!tieneAccesoExplicacion(ctx)) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    const sb = getSupabaseAdmin();
    const pendientes = await obtenerExcepcionesPendientesDavid(sb);
    if (pendientes.length === 0) {
      await ctx.reply("No tienes discrepancias pendientes de explicar. 🎉");
      return;
    }
    await ctx.reply(`Tienes ${pendientes.length} discrepancia(s) pendiente(s):`);
    for (const excepcion of pendientes) {
      const kb = new InlineKeyboard().text("Explicar", `ronda_expl:${excepcion.id}`);
      await ctx.reply(renderLineaPendienteDavid(excepcionComoCaso(excepcion)), { reply_markup: kb });
    }
  });

  bot.callbackQuery("start_explicar", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoExplicacion(ctx)) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    const sb = getSupabaseAdmin();
    const pendientes = await obtenerExcepcionesPendientesDavid(sb);
    if (pendientes.length === 0) {
      await ctx.reply("No tienes discrepancias pendientes de explicar. 🎉");
      return;
    }
    await ctx.reply(`Tienes ${pendientes.length} discrepancia(s) pendiente(s):`);
    for (const excepcion of pendientes) {
      const kb = new InlineKeyboard().text("Explicar", `ronda_expl:${excepcion.id}`);
      await ctx.reply(renderLineaPendienteDavid(excepcionComoCaso(excepcion)), { reply_markup: kb });
    }
  });

  bot.callbackQuery(/^ronda_expl:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoExplicacion(ctx)) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    const excepcionId = ctx.match?.[1];
    if (!excepcionId) return;
    await ctx.conversation.enter("excepcionDavid", excepcionId);
  });

  // ---- /proponer (David o Uriel, B-5) ----------------------------------------

  bot.command("proponer", async (ctx) => {
    if (!tieneAccesoProponer(ctx)) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    const sb = getSupabaseAdmin();
    const pendientes = await obtenerExcepcionesParaProponer(sb);
    if (pendientes.length === 0) {
      await ctx.reply("No hay discrepancias esperando una propuesta de ajuste.");
      return;
    }
    await ctx.reply(`Hay ${pendientes.length} discrepancia(s) explicada(s) sin ajuste propuesto todavía:`);
    for (const excepcion of pendientes) {
      const caso = excepcionComoCasoProponer(excepcion);
      const kb = tecladoCausas((indice) => `rpa:${excepcion.id}:c${indice}`);
      await ctx.reply(renderCasoProponer(caso), { reply_markup: kb });
    }
  });

  bot.callbackQuery(/^rpa:([0-9a-f-]+):c([1-7])$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoProponer(ctx)) return;
    const excepcionId = ctx.match?.[1];
    const indice = Number(ctx.match?.[2]);
    if (!excepcionId || !indice) return;
    const causa = causaPorIndice(indice);
    if (!causa) return; // callback_data corrupto/reenviado -- R-18, nunca se inventa una causa

    const sb = getSupabaseAdmin();
    const excepcion = await obtenerExcepcionDetalle(sb, excepcionId);
    if (!excepcion) {
      await ctx.reply("Esa discrepancia ya no existe.");
      return;
    }
    if (excepcion.estado !== "explicada") {
      await ctx.reply(`Esa discrepancia ya no está esperando una propuesta -- está ${ETIQUETAS_ESTADO_EXCEPCION[excepcion.estado] ?? excepcion.estado}.`);
      return;
    }
    const productoNombre = excepcion.producto?.nombre ?? "(producto sin nombre)";

    if (causa.exigeNota) {
      if (!ctx.telegramUser) return;
      ctx.session.pendienteNotaRonda = { tipo: "proponer", excepcionId, causaClave: causa.clave };
      await ctx.editMessageText(`Causa: ${causa.etiqueta}. Esa causa exige una nota -- escribila (o *cancelar*).`, { parse_mode: "Markdown" }).catch(() => {});
      return;
    }

    await ctx.editMessageText(renderConfirmacionPropuesta(productoNombre, causa.etiqueta), {
      reply_markup: new InlineKeyboard().text("✅ Confirmar", `rpa:${excepcionId}:c${indice}:ok`).text("❌ Cambiar causa", `rpa:${excepcionId}:volver`),
    }).catch(() => {});
  });

  bot.callbackQuery(/^rpa:([0-9a-f-]+):volver$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoProponer(ctx)) return;
    const excepcionId = ctx.match?.[1];
    if (!excepcionId) return;
    const sb = getSupabaseAdmin();
    const excepcion = await obtenerExcepcionDetalle(sb, excepcionId);
    if (!excepcion || excepcion.estado !== "explicada") {
      await ctx.reply("Esa discrepancia ya no está esperando una propuesta.");
      return;
    }
    const caso = excepcionComoCasoProponer(excepcion);
    const kb = tecladoCausas((indice) => `rpa:${excepcion.id}:c${indice}`);
    await ctx.editMessageText(renderCasoProponer(caso), { reply_markup: kb }).catch(() => {});
  });

  bot.callbackQuery(/^rpa:([0-9a-f-]+):c([1-7]):ok$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoProponer(ctx) || !ctx.telegramUser) return;
    const excepcionId = ctx.match?.[1];
    const indice = Number(ctx.match?.[2]);
    const causa = indice ? causaPorIndice(indice) : undefined;
    if (!excepcionId || !causa) return;

    const sb = getSupabaseAdmin();
    const { error } = await sb.rpc("fn_ronda_proponer_ajuste", {
      payload: {
        ...payloadActorTelegram(ctx.telegramUser.id),
        excepcion_id: excepcionId,
        propuesta_causa: causa.clave,
        propuesta_nota: null,
      },
    });
    if (error) {
      await ctx.reply(`❌ No se pudo proponer el ajuste: ${mensajeErrorRpc(error)}`);
      return;
    }
    await ctx.editMessageText(`✅ Ajuste propuesto (${causa.etiqueta}). Queda pendiente de la aprobación de Santiago.`).catch(() => {});
  });

  // ---- /aprobar (Santiago, B-6/B-7) ------------------------------------------

  async function enviarListaAprobar(ctx: BotContext) {
    const sb = getSupabaseAdmin();
    const pendientes = await obtenerExcepcionesPropuestasParaSantiago(sb);
    if (pendientes.length === 0) {
      await ctx.reply("No hay ajustes propuestos esperando tu aprobación.");
      return;
    }
    await ctx.reply(`Hay ${pendientes.length} ajuste(s) propuesto(s) esperando tu decisión:`);
    for (const excepcion of pendientes) {
      const propuestoPor = await resolverNombreActor(sb, excepcion.propuesta_por_usuario, excepcion.propuesta_por_telegram);
      const caso = excepcionComoCasoSantiago(excepcion, propuestoPor);
      const kb = new InlineKeyboard()
        .text(`✅ ${etiquetaDecision("aprobado")}`, `rda:${excepcion.id}:A`)
        .text(`❌ ${etiquetaDecision("desestimado")}`, `rda:${excepcion.id}:D`);
      await ctx.reply(renderCasoSantiago(caso), { reply_markup: kb });
    }
  }

  // Doble guarda en los DOS puntos de entrada (comando y botón del menú): el
  // módulo (`inventario_aprobacion`) más el MISMO vínculo de Gerencia que
  // exige `fn_ronda_decidir_ajuste` (§6.1 del brief técnico). El RPC ya
  // protege la decisión -- esto evita mostrarle la lista a alguien con el
  // módulo pero sin el vínculo, que de otro modo vería los casos y recién al
  // tocar Aprobar/Desestimar se encontraría con un error de permisos.
  async function tieneAccesoAprobacionGerencia(ctx: BotContext): Promise<boolean> {
    if (!tieneAccesoAprobacion(ctx) || !ctx.telegramUser) return false;
    return await esUsuarioTelegramGerencia(getSupabaseAdmin(), ctx.telegramUser.id);
  }

  bot.command("aprobar", async (ctx) => {
    if (!(await tieneAccesoAprobacionGerencia(ctx))) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await enviarListaAprobar(ctx);
  });

  bot.callbackQuery("start_aprobar", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await tieneAccesoAprobacionGerencia(ctx))) {
      await ctx.reply("No tienes acceso a este módulo.");
      return;
    }
    await enviarListaAprobar(ctx);
  });

  bot.callbackQuery(/^rda:([0-9a-f-]+):(A|D)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoAprobacion(ctx)) return;
    const excepcionId = ctx.match?.[1];
    const letraDecision = ctx.match?.[2] as "A" | "D" | undefined;
    if (!excepcionId || !letraDecision) return;
    const decision = letraDecision === "A" ? "aprobado" as const : "desestimado" as const;

    const sb = getSupabaseAdmin();
    const excepcion = await obtenerExcepcionDetalle(sb, excepcionId);
    if (!excepcion) {
      await ctx.reply("Esa discrepancia ya no existe.");
      return;
    }
    if (excepcion.estado !== "ajuste_propuesto") {
      await ctx.reply(`Ese ajuste ya no está esperando tu decisión -- está ${ETIQUETAS_ESTADO_EXCEPCION[excepcion.estado] ?? excepcion.estado}.`);
      return;
    }
    const productoNombre = excepcion.producto?.nombre ?? "(producto sin nombre)";
    const kb = tecladoCausas((indice) => `rda:${excepcionId}:${letraDecision}:c${indice}`);
    await ctx.editMessageText(`${productoNombre} -- ${etiquetaDecision(decision)}. ¿Cuál es la causa raíz?`, { reply_markup: kb }).catch(() => {});
  });

  bot.callbackQuery(/^rda:([0-9a-f-]+):(A|D):c([1-7])$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoAprobacion(ctx)) return;
    const excepcionId = ctx.match?.[1];
    const letraDecision = ctx.match?.[2] as "A" | "D" | undefined;
    const indice = Number(ctx.match?.[3]);
    if (!excepcionId || !letraDecision || !indice) return;
    const decision = letraDecision === "A" ? "aprobado" as const : "desestimado" as const;
    const causa = causaPorIndice(indice);
    if (!causa) return; // callback_data corrupto/reenviado

    const sb = getSupabaseAdmin();
    const excepcion = await obtenerExcepcionDetalle(sb, excepcionId);
    if (!excepcion) {
      await ctx.reply("Esa discrepancia ya no existe.");
      return;
    }
    if (excepcion.estado !== "ajuste_propuesto") {
      await ctx.reply(`Ese ajuste ya no está esperando tu decisión -- está ${ETIQUETAS_ESTADO_EXCEPCION[excepcion.estado] ?? excepcion.estado}.`);
      return;
    }
    const productoNombre = excepcion.producto?.nombre ?? "(producto sin nombre)";

    if (causa.exigeNota) {
      if (!ctx.telegramUser) return;
      ctx.session.pendienteNotaRonda = { tipo: "decidir", excepcionId, causaClave: causa.clave, decision };
      await ctx.editMessageText(`Causa: ${causa.etiqueta}. Esa causa exige una nota -- escribila (o *cancelar*).`, { parse_mode: "Markdown" }).catch(() => {});
      return;
    }

    await ctx.editMessageText(renderConfirmacionDecision(productoNombre, decision, causa.etiqueta), {
      reply_markup: new InlineKeyboard()
        .text("✅ Confirmar", `rda:${excepcionId}:${letraDecision}:c${indice}:ok`)
        .text("❌ Cambiar causa", `rda:${excepcionId}:${letraDecision}`),
    }).catch(() => {});
  });

  bot.callbackQuery(/^rda:([0-9a-f-]+):(A|D):c([1-7]):ok$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoAprobacion(ctx) || !ctx.telegramUser) return;
    const excepcionId = ctx.match?.[1];
    const letraDecision = ctx.match?.[2] as "A" | "D" | undefined;
    const indice = Number(ctx.match?.[3]);
    const causa = indice ? causaPorIndice(indice) : undefined;
    if (!excepcionId || !letraDecision || !causa) return;
    const decision = letraDecision === "A" ? "aprobado" as const : "desestimado" as const;

    const sb = getSupabaseAdmin();
    const { error } = await sb.rpc("fn_ronda_decidir_ajuste", {
      payload: {
        ...payloadActorTelegram(ctx.telegramUser.id),
        excepcion_id: excepcionId,
        decision,
        decision_causa: causa.clave,
        decision_nota: null,
      },
    });
    if (error) {
      await ctx.reply(`❌ No se pudo registrar la decisión: ${mensajeErrorRpc(error)}`);
      return;
    }
    const etiquetaResultado = decision === "aprobado" ? "Aprobado" : "Desestimado";
    await ctx.editMessageText(`${decision === "aprobado" ? "✅" : "❌"} ${etiquetaResultado} (${causa.etiqueta}).`).catch(() => {});

    if (decision === "desestimado") {
      await ctx.reply("Ajuste desestimado -- no se toca el inventario.");
      return;
    }
    await aplicarAjusteRondaYResponder(ctx, sb, excepcionId, false);
  });

  // B-7: Santiago aprueba y el bot aplica de una vez (§13 de la tarea de esta
  // sesión: "aplicar de una vez es lo más simple y lo que menos deja
  // colgado" -- B-7 dice que quién ejecuta es detalle de implementación).
  // Si el teórico vivo cambió desde el conteo, `fn_ronda_aplicar_ajuste`
  // (CA-2) NO aplica en silencio: devuelve `{aplicado:false,...}` y este
  // helper se lo muestra a Santiago con un botón para forzarlo.
  async function aplicarAjusteRondaYResponder(
    ctx: BotContext,
    sb: SupabaseClient,
    excepcionId: string,
    confirmarCambioTeorico: boolean,
  ) {
    if (!ctx.telegramUser) return;
    const { data, error } = await sb.rpc("fn_ronda_aplicar_ajuste", {
      payload: {
        ...payloadActorTelegram(ctx.telegramUser.id),
        excepcion_id: excepcionId,
        fecha_movimiento: hoyBogota(),
        confirmar_cambio_teorico: confirmarCambioTeorico,
      },
    });
    if (error) {
      await ctx.reply(`El ajuste quedó aprobado, pero no se pudo aplicar automáticamente: ${mensajeErrorRpc(error)}\n\nAvisa a un administrador -- queda pendiente de aplicar.`);
      return;
    }
    const resultado = data as {
      aplicado?: boolean;
      motivo?: string;
      teorico_al_conteo?: number;
      teorico_hoy?: number;
      delta?: number;
    } | null;

    if (resultado?.aplicado === false && resultado.motivo === "teorico_cambio") {
      const kb = new InlineKeyboard().text("⚠️ Aplicar de todas formas", `rda:${excepcionId}:forzar`);
      const fmt = (n: number | undefined) => (n === undefined ? "—" : formatearCantidad(n));
      await ctx.reply(
        [
          "El teórico del sistema cambió desde el conteo -- el ajuste NO se aplicó todavía:",
          `Teórico al contar: ${fmt(resultado.teorico_al_conteo)}`,
          `Teórico hoy: ${fmt(resultado.teorico_hoy)}`,
          `El ajuste seguiría aplicando la misma diferencia (delta ${fmt(resultado.delta)}) sobre el saldo de HOY.`,
          "",
          "¿Lo aplico igual?",
        ].join("\n"),
        { reply_markup: kb },
      );
      return;
    }

    await ctx.reply("✅ Ajuste aplicado al inventario.");
  }

  bot.callbackQuery(/^rda:([0-9a-f-]+):forzar$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoAprobacion(ctx) || !ctx.telegramUser) return;
    const excepcionId = ctx.match?.[1];
    if (!excepcionId) return;
    const sb = getSupabaseAdmin();
    await aplicarAjusteRondaYResponder(ctx, sb, excepcionId, true);
  });

  bot.command("cancelar", async (ctx) => {
    ctx.session.pendienteNotaRonda = null;
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
        "/ronda — Ver o abrir la ronda de inventario en curso",
        "/existencias <producto> — Consultar cantidad y unidad de un producto",
        "/cerrarronda — Cerrar la ronda de inventario en curso",
        "/explicar — Explicar discrepancias de la ronda de inventario",
        "/proponer — Proponer un ajuste de inventario",
        "/aprobar — Aprobar o desestimar ajustes de inventario",
        "/cancelar — Cancelar operación actual",
        "/ayuda — Ver esta ayuda",
        "",
        "Si tienes la ronda de inventario en curso, también puedes mandarme una nota de voz con lo que encontraste.",
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
  // RONDA DE INVENTARIO — pipeline de voz + bucle de preview (A-8/A-9/A-10,
  // docs/brief_tecnico_verificacion_inventario.md §5.2/§7.3). Fuera de toda
  // conversación de Grammy (D-T9): el estado del bucle vive en
  // `rondas_transcritos`, no en una sesión.
  // ==========================================================================

  /** Idéntico a `descargarBytesTelegram` de `pesajeLeche.ts:216-224` (no
   * exportado ahí, mismo criterio de duplicación ya establecido entre los
   * pipelines de este árbol -- ver `extraerJson` en
   * `hato-chequeo-foto.ts`/`hato-pesaje-pipeline.ts`/`ronda-voz-pipeline.ts`). */
  async function descargarBytesTelegramRonda(fileId: string, botToken: string): Promise<Uint8Array> {
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    const filePath = fileData?.result?.file_path;
    if (!filePath) throw new Error(`Telegram no devolvió la ruta del archivo ${fileId}`);
    const descarga = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    if (!descarga.ok) throw new Error(`No se pudo descargar el archivo de Telegram (${descarga.status})`);
    return new Uint8Array(await descarga.arrayBuffer());
  }

  /** Manda el preview (o, si no es confirmable, el mensaje que pide
   * completarlo/identificarlo por texto -- `renderPreviewTelegram` ya trae
   * ese texto, CA-30) con los botones [Confirmar]/[Descartar] cuando
   * corresponde. `[Corregir]` no es un botón aparte: el texto libre que
   * Uriel mande a continuación ES la corrección (§7.3). */
  async function enviarMensajePreview(ctx: BotContext, transcritoId: string, preview: PreviewRonda, intentosPreview: number) {
    const texto = renderPreviewTelegram(preview);
    if (!previewConfirmable(preview)) {
      const restantes = MAX_INTENTOS_PREVIEW - intentosPreview;
      await ctx.reply(`${texto}\n\n(te quedan ${Math.max(restantes, 0)} corrección(es) antes de que ceda)`);
      return;
    }
    const kb = new InlineKeyboard()
      .text("✅ Confirmar", `ronda_prev:confirmar:${transcritoId}`)
      .text("❌ Descartar", `ronda_prev:descartar:${transcritoId}`);
    await ctx.reply(texto, { reply_markup: kb });
  }

  /** Resuelve los hallazgos crudos del intérprete contra el alcance, guarda
   * el resultado en `rondas_transcritos.preview` (para no tener que volver a
   * llamar al modelo si Uriel pide corregir) y manda el mensaje. */
  async function guardarYEnviarPreview(
    ctx: BotContext,
    sb: SupabaseClient,
    transcritoId: string,
    respuesta: RespuestaModeloInterprete,
    crudo: unknown,
    alcanceItems: ReturnType<typeof alcanceComoItems>,
    intentosPreview: number,
    productosFueraDeAlcance: readonly ProductoFueraDeAlcance[] = [],
  ) {
    const resueltos = resolverHallazgos(respuesta.hallazgos, alcanceItems, productosFueraDeAlcance);
    const preview = construirPreview(resueltos.map((r) => r.fila), respuesta.observacionesLibres, respuesta.avisos);
    const previewGuardado: PreviewGuardado = {
      filas: preview.filas,
      paraConfirmar: resueltos.map((r) => r.paraConfirmar),
      observacionesLibres: preview.observacionesLibres,
      avisos: preview.avisos,
    };

    const { error } = await sb
      .from("rondas_transcritos")
      .update({ interpretacion: crudo, preview: previewGuardado, intentos_preview: intentosPreview })
      .eq("id", transcritoId)
      .eq("estado", "preview_pendiente");
    if (error) {
      console.error("[Telegram] ronda: no se pudo guardar el preview:", error.message);
      await ctx.reply("Hubo un error guardando lo que entendí. Intenta de nuevo.");
      return;
    }

    await enviarMensajePreview(ctx, transcritoId, preview, intentosPreview);
  }

  async function manejarNotaDeVoz(ctx: BotContext, fileId: string, tipo: string, duracionSeg: number | undefined) {
    if (!tieneAccesoRonda(ctx) || !ctx.telegramUser) return; // silencioso: no es un usuario de la ronda
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      // Falla CERRADA -- copia literal del patrón de pesajeLeche.ts:244-248.
      // Nunca degrada a registrar sin preview.
      await ctx.reply("La lectura por voz no está disponible ahora mismo (falta configuración del servidor). Avisa a un administrador.");
      return;
    }
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const telegramUsuarioId = ctx.telegramUser.id;

    const sb = getSupabaseAdmin();
    const ronda = await obtenerRondaEnCurso(sb);
    if (!ronda) {
      await ctx.reply("No hay ninguna ronda en curso -- no hay nada que registrar todavía. Usa /ronda para ver el estado.");
      return;
    }

    await ctx.replyWithChatAction("typing");

    let bytes: Uint8Array;
    try {
      bytes = await descargarBytesTelegramRonda(fileId, botToken);
    } catch (err) {
      console.error("[Telegram] ronda: descarga de audio falló:", err instanceof Error ? err.message : err);
      await ctx.reply("No pude descargar la nota de voz. Intenta enviarla de nuevo.");
      return;
    }

    const alcance = await obtenerAlcanceRonda(sb, ronda.id);
    const alcanceItems = alcanceComoItems(alcance);
    // CA-4: candidatos fuera del alcance congelado (producto en cero al
    // abrir la ronda) -- ver obtenerProductosFueraDeAlcance.
    const productosFueraDeAlcance = await obtenerProductosFueraDeAlcance(sb);

    const resultado = await ejecutarPipelineVozRonda({ bytes, tipo, nombreArchivo: `nota-${Date.now()}.ogg`, apiKey });

    if (!resultado.ok) {
      if (resultado.etapa === "transcripcion") {
        // Ver la cabecera de ronda-voz-pipeline.ts: el par OGG/Opus de
        // Telegram contra el endpoint de OpenRouter no se pudo probar en
        // esta sesión (sin OPENROUTER_API_KEY). Si esto dispara en
        // producción por un error de FORMATO, la degradación de §5.7
        // (comando /hallazgo estructurado) queda pendiente -- no
        // implementada acá, ver el reporte de la sesión.
        await ctx.reply(
          `No pude entender la nota de voz: ${resultado.error}\n\nIntenta grabarla de nuevo. Si el problema sigue, avisa a un administrador.`,
        );
        return;
      }
      // La transcripción SÍ tuvo éxito -- se guarda igual como borrador sin
      // confirmar (A-10/CA-37: lo narrado no se pierde ni si el intérprete
      // falla del todo).
      const { error: errorInsert } = await sb.from("rondas_transcritos").insert({
        ronda_id: ronda.id,
        transcrito: resultado.transcrito,
        actor_telegram_id: telegramUsuarioId,
        duracion_audio_seg: duracionSeg ?? null,
        estado: "sin_confirmar",
      });
      if (errorInsert) {
        console.error("[Telegram] ronda: no se pudo guardar el transcrito tras fallo de interpretación:", errorInsert.message);
      }
      await ctx.reply(
        `Te entendí, pero no pude interpretar los hallazgos (${resultado.error}). Lo que dijiste quedó guardado -- avisa a un administrador, o intenta con otra nota de voz.`,
      );
      return;
    }

    const previewInicial = construirPreview(
      resolverHallazgos(resultado.respuesta.hallazgos, alcanceItems, productosFueraDeAlcance).map((r) => r.fila),
    );
    if (previewInicial.filas.length === 0 && resultado.respuesta.observacionesLibres.length === 0) {
      // No es un error -- Uriel pudo haber mandado una nota de contexto sin
      // ningún hallazgo puntual. Se guarda igual (capa cruda, CA-36), pero NO
      // se abre un ciclo de preview vacío (nada que confirmar) ni se marca
      // 'confirmado' (eso implicaría que pasó por el botón/RPC, y no pasó) ni
      // 'sin_confirmar' (CA-37 cuenta ese estado como "hallazgos narrados sin
      // confirmar" en el reporte de cierre -- contar acá inflaría ese número
      // con una nota que no tenía ningún hallazgo). 'descartado' es el
      // desenlace terminal que menos tergiversa: no queda nada pendiente ni
      // se cuenta como deuda.
      await sb.from("rondas_transcritos").insert({
        ronda_id: ronda.id,
        transcrito: resultado.transcrito,
        actor_telegram_id: telegramUsuarioId,
        duracion_audio_seg: duracionSeg ?? null,
        estado: "descartado",
        preview: { filas: [], paraConfirmar: [], observacionesLibres: [], avisos: resultado.respuesta.avisos },
      });
      await ctx.reply("No encontré ningún hallazgo concreto en esa nota (ni una observación libre). Si querías reportar algo, intenta ser más específico.");
      return;
    }

    const { data: transcritoCreado, error: errorInsert } = await sb
      .from("rondas_transcritos")
      .insert({
        ronda_id: ronda.id,
        transcrito: resultado.transcrito,
        correcciones: [],
        interpretacion: resultado.crudoInterpretacion,
        intentos_preview: 1,
        estado: "preview_pendiente",
        actor_telegram_id: telegramUsuarioId,
        duracion_audio_seg: duracionSeg ?? null,
      })
      .select("id")
      .single();

    if (errorInsert || !transcritoCreado) {
      console.error("[Telegram] ronda: no se pudo guardar el transcrito:", errorInsert?.message);
      await ctx.reply("Entendí tu nota, pero hubo un error guardándola. Intenta de nuevo.");
      return;
    }

    await guardarYEnviarPreview(ctx, sb, transcritoCreado.id, resultado.respuesta, resultado.crudoInterpretacion, alcanceItems, 1, productosFueraDeAlcance);
  }

  bot.on("message:voice", async (ctx) => {
    const voice = ctx.message.voice;
    if (!voice) return;
    await manejarNotaDeVoz(ctx, voice.file_id, voice.mime_type || "audio/ogg", voice.duration);
  });

  bot.on("message:audio", async (ctx) => {
    const audio = ctx.message.audio;
    if (!audio) return;
    await manejarNotaDeVoz(ctx, audio.file_id, (audio.mime_type || "audio/ogg").toLowerCase(), audio.duration);
  });

  /** A-9/CA-35: Confirmar registra (vía `fn_ronda_confirmar_hallazgos`);
   * Descartar cierra el ciclo sin registrar nada. El `callback_data` trae el
   * `transcrito_id` explícito -- la autorización real de a quién pertenece
   * el transcrito no se valida por el botón, la valida `fn_ronda_validar_actor`
   * dentro del RPC (para Confirmar) o el `.eq('actor_telegram_id', ...)` de
   * abajo (para Descartar, que no tiene RPC propio). */
  bot.callbackQuery(/^ronda_prev:(confirmar|descartar):([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoRonda(ctx) || !ctx.telegramUser) return;
    const accion = ctx.match?.[1] as "confirmar" | "descartar" | undefined;
    const transcritoId = ctx.match?.[2];
    if (!accion || !transcritoId) return;

    const sb = getSupabaseAdmin();

    if (accion === "descartar") {
      const { data, error } = await sb
        .from("rondas_transcritos")
        .update({ estado: "descartado" })
        .eq("id", transcritoId)
        .eq("actor_telegram_id", ctx.telegramUser.id)
        .eq("estado", "preview_pendiente")
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[Telegram] ronda: error al descartar:", error.message);
        await ctx.reply("No se pudo descartar. Intenta de nuevo.");
        return;
      }
      if (!data) {
        await ctx.reply("Esa nota ya no está pendiente de confirmación (puede que ya la hayas confirmado o descartado).");
        return;
      }
      await ctx.editMessageText("❌ Descartado. Lo que narraste en esa nota no quedó registrado.").catch(() => {});
      return;
    }

    // accion === 'confirmar'
    const transcrito = await obtenerTranscritoPorId(sb, transcritoId);
    if (!transcrito || transcrito.actor_telegram_id !== ctx.telegramUser.id) {
      await ctx.reply("No encontré esa nota, o no es tuya.");
      return;
    }
    if (transcrito.estado !== "preview_pendiente") {
      await ctx.reply("Esa nota ya no está pendiente de confirmación.");
      return;
    }
    const preview = transcrito.preview;
    if (!preview || preview.filas.length === 0 || preview.paraConfirmar.some((h) => h === null)) {
      await ctx.reply("Todavía falta identificar o completar algún hallazgo antes de poder confirmar. Corrígelo por texto.");
      return;
    }

    const hallazgosPayload = preview.paraConfirmar.map((h) => ({
      producto_id: h!.productoId,
      cantidad_fisica: h!.cantidadFisica,
      fisico_origen: h!.fisicoOrigen,
      observacion_uriel: h!.observacionUriel,
      explicacion_citada: h!.explicacionCitada,
      causa_clave: h!.causaClave,
      causa_confianza: h!.causaConfianza,
      // CA-4: el RPC (migración 131) re-verifica esto server-side contra
      // productos.cantidad_actual antes de agregarlo al alcance -- nunca
      // confía ciegamente en esta bandera.
      fuera_de_alcance: h!.fueraDeAlcance,
    }));

    const { data: resultadoRpc, error: errorRpc } = await sb.rpc("fn_ronda_confirmar_hallazgos", {
      payload: {
        ...payloadActorTelegram(ctx.telegramUser.id),
        transcrito_id: transcritoId,
        hallazgos: hallazgosPayload,
      },
    });

    if (errorRpc) {
      await ctx.reply(`❌ No se pudo confirmar: ${mensajeErrorRpc(errorRpc)}`);
      return;
    }

    const datos = resultadoRpc as { excepciones_creadas?: number; excepcion_ids?: string[] } | null;
    const kbDeshacer = new InlineKeyboard().text("↩️ Deshacer", `ronda_undo:${transcritoId}`);
    await ctx.editMessageText(`✅ Registrado: ${datos?.excepciones_creadas ?? preview.filas.length} hallazgo(s).`).catch(() => {});
    await ctx.reply(
      "Si te equivocaste (por ejemplo, dictaste mal una cantidad), tienes esta ventana para deshacerlo mientras David todavía no lo haya revisado.",
      { reply_markup: kbDeshacer },
    );

    // Pedido de Santiago probando en vivo (2026-08-28): que a David le
    // llegue algo apenas se confirma, en vez de tener que acordarse de
    // correr /explicar. Best-effort -- un fallo de envío no tumba la
    // confirmación, que ya quedó registrada.
    await enviarAvisoNuevasExcepciones(sb, datos?.excepcion_ids ?? []);
  });

  /** P-1 (§6.5/§7.4 del brief técnico) -- mismo patrón que `hato_ev_undo`
   * (bot.ts, evento del hato): el botón se quita del mensaje al usarse, la
   * autorización real la valida el RPC (la ventana de tres condiciones de
   * §6.5), y fuera de la ventana se explica en vez de fallar genérico -- las
   * excepciones de `fn_ronda_deshacer_confirmacion` ya están escritas en
   * español para leerse tal cual. */
  bot.callbackQuery(/^ronda_undo:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!tieneAccesoRonda(ctx) || !ctx.telegramUser) return;
    const transcritoId = ctx.match?.[1];
    if (!transcritoId) return;

    const sb = getSupabaseAdmin();
    const { data, error } = await sb.rpc("fn_ronda_deshacer_confirmacion", {
      payload: { ...payloadActorTelegram(ctx.telegramUser.id), transcrito_id: transcritoId },
    });

    if (error) {
      await ctx.reply(`No se pudo deshacer: ${mensajeErrorRpc(error)}`);
      return;
    }

    const datos = data as { excepciones_borradas?: number } | null;
    await ctx.editMessageText("↩️ Deshecho.").catch(() => {});
    await ctx.reply(
      `Los ${datos?.excepciones_borradas ?? "N"} hallazgo(s) no quedaron registrados. Lo que narraste sigue guardado -- puedes corregirlo y confirmarlo de nuevo.`,
    );
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
  // RONDA DE INVENTARIO — corrección por texto libre del preview pendiente
  // (§7.3 del brief técnico). Registrada JUSTO ANTES del fallback de Esco de
  // abajo, a propósito: es la que decide si un mensaje de texto es una
  // corrección de la ronda o si le pasa el turno a Esco -- `next()` cuando
  // no hay nada pendiente que corregir. Para Uriel eso cae en "No tienes
  // acceso a consultas" (§3.3: nunca tiene el módulo `consultas`), igual que
  // hoy.
  // ==========================================================================

  /** Máximo `MAX_INTENTOS_PREVIEW` (4, §7.3) intentos de preview por nota. */
  bot.on("message:text", async (ctx, next) => {
    if (!tieneAccesoRonda(ctx) || !ctx.telegramUser) return next();
    const texto = ctx.message.text?.trim();
    if (!texto) return next();

    const sb = getSupabaseAdmin();
    const pendiente = await obtenerTranscritoPendienteMasReciente(sb, ctx.telegramUser.id);
    if (!pendiente) return next();

    if (intentosPreviewAgotados(pendiente.intentos_preview)) {
      await sb
        .from("rondas_transcritos")
        .update({ estado: "sin_confirmar" })
        .eq("id", pendiente.id)
        .eq("estado", "preview_pendiente");
      await ctx.reply(
        "Ya probamos varias veces y no logramos afinar esta nota. Lo que narraste queda guardado sin confirmar -- un administrador puede revisarlo, o prueba contándolo de nuevo en una nota de voz nueva.",
      );
      return;
    }

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      await ctx.reply("La lectura por voz no está disponible ahora mismo. Avisa a un administrador.");
      return;
    }

    await ctx.replyWithChatAction("typing");

    const correcciones = aplicarCorreccion(pendiente.correcciones, texto, new Date().toISOString());
    const textoCombinado = construirTextoConCorrecciones(pendiente.transcrito, correcciones);

    const resultado = await interpretarTranscrito(textoCombinado, apiKey);
    if (!resultado.ok) {
      // No consume un intento: no se llegó a mostrar un preview nuevo.
      await ctx.reply(`No pude reinterpretar tu corrección: ${resultado.error}. Intenta de nuevo.`);
      return;
    }

    const alcance = await obtenerAlcanceRonda(sb, pendiente.ronda_id);
    const alcanceItems = alcanceComoItems(alcance);
    const productosFueraDeAlcance = await obtenerProductosFueraDeAlcance(sb);
    const nuevosIntentos = pendiente.intentos_preview + 1;

    const { error: errorCorrecciones } = await sb
      .from("rondas_transcritos")
      .update({ correcciones })
      .eq("id", pendiente.id)
      .eq("estado", "preview_pendiente");
    if (errorCorrecciones) {
      console.error("[Telegram] ronda: no se pudo guardar la corrección:", errorCorrecciones.message);
    }

    await guardarYEnviarPreview(ctx, sb, pendiente.id, resultado.respuesta, resultado.crudo, alcanceItems, nuevosIntentos, productosFueraDeAlcance);
  });

  // ==========================================================================
  // RONDA DE INVENTARIO — nota de causa "otro" (David/Santiago, exige nota,
  // R-7). Puente entre el callback que la pide (`/proponer`, `/aprobar`) y el
  // próximo mensaje de texto. NO es una conversación (§7.2): sólo intercepta
  // cuando `ctx.session.pendienteNotaRonda` está fijado, y se limpia apenas
  // se usa -- mismo criterio de "estado en la sesión persistida, no en
  // memoria" que el bucle de preview de la nota de voz de Uriel de arriba
  // (`obtenerTranscritoPendienteMasReciente`), acá con la sesión de Grammy en
  // vez de una tabla porque no hay ninguna fila de dominio a la que colgarle
  // este estado transitorio (ver types.ts).
  //
  // Registrada DESPUÉS del bucle de preview de Uriel y ANTES del fallback de
  // Esco -- a propósito, y no sólo por orden temático: `bot.on("message:text")`
  // se resuelve por orden de REGISTRO, y el guard estático de
  // `telegramChat.test.ts` ubica el handler de Esco por el PRIMER
  // `bot.on("message:text"` del archivo (el de arriba, de Uriel). Un tercer
  // handler registrado ANTES de ese correría el riesgo real de interceptar
  // un texto que le tocaba a Uriel -- Santiago/David y Uriel son personas
  // distintas en la práctica (módulos distintos), pero nada en el código lo
  // garantiza, así que se ordena por el mismo criterio que ya usa el resto
  // del archivo: el flujo más específico y menos frecuente va último.
  // ==========================================================================

  bot.on("message:text", async (ctx, next) => {
    const pendiente = ctx.session.pendienteNotaRonda;
    if (!pendiente || !ctx.telegramUser) return next();
    const texto = ctx.message.text?.trim();
    if (!texto) return next();

    if (texto.toLowerCase() === "cancelar" || texto.toLowerCase() === "/cancelar") {
      ctx.session.pendienteNotaRonda = null;
      await ctx.reply("Cancelado. La causa no quedó guardada.");
      return;
    }

    const sb = getSupabaseAdmin();
    ctx.session.pendienteNotaRonda = null;

    if (pendiente.tipo === "proponer") {
      const { error } = await sb.rpc("fn_ronda_proponer_ajuste", {
        payload: {
          ...payloadActorTelegram(ctx.telegramUser.id),
          excepcion_id: pendiente.excepcionId,
          propuesta_causa: pendiente.causaClave,
          propuesta_nota: texto,
        },
      });
      if (error) {
        await ctx.reply(`❌ No se pudo proponer el ajuste: ${mensajeErrorRpc(error)}`);
        return;
      }
      await ctx.reply("✅ Ajuste propuesto. Queda pendiente de la aprobación de Santiago.");
      return;
    }

    // pendiente.tipo === 'decidir'
    const { error } = await sb.rpc("fn_ronda_decidir_ajuste", {
      payload: {
        ...payloadActorTelegram(ctx.telegramUser.id),
        excepcion_id: pendiente.excepcionId,
        decision: pendiente.decision,
        decision_causa: pendiente.causaClave,
        decision_nota: texto,
      },
    });
    if (error) {
      await ctx.reply(`❌ No se pudo registrar la decisión: ${mensajeErrorRpc(error)}`);
      return;
    }
    if (pendiente.decision === "desestimado") {
      await ctx.reply("❌ Ajuste desestimado -- no se toca el inventario.");
      return;
    }
    await ctx.reply("✅ Aprobado.");
    await aplicarAjusteRondaYResponder(ctx, sb, pendiente.excepcionId, false);
  });

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
    { command: "ronda", description: "Ver o abrir la ronda de inventario" },
    { command: "existencias", description: "Consultar existencias de un producto" },
    { command: "cerrarronda", description: "Cerrar la ronda de inventario en curso" },
    { command: "explicar", description: "Explicar discrepancias de la ronda de inventario" },
    { command: "proponer", description: "Proponer un ajuste de inventario" },
    { command: "aprobar", description: "Aprobar o desestimar ajustes de inventario" },
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
