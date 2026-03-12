// telegram/conversations/jornal.ts — Jornal (labor) registration conversation
//
// Implements the task-first, batch worker assignment flow described in
// SPEC_TELEGRAM_BOT.md section 3.3. Each round collects: fecha, tarea,
// lote, fraccion, workers, observaciones, then inserts one row per worker
// into `registros_trabajo`.

import { Conversation } from "npm:@grammyjs/conversations@2";
import { InlineKeyboard } from "npm:grammy@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { BotContext } from "../types.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRACCION_MAP: Record<string, { label: string; hours: string }> = {
  "0.25": { label: "1/4", hours: "2h" },
  "0.5": { label: "1/2", hours: "4h" },
  "0.75": { label: "3/4", hours: "6h" },
  "1.0": { label: "Completo", hours: "8h" },
};

const FRACCIONES = ["0.25", "0.5", "0.75", "1.0"] as const;

const TASKS_PER_PAGE = 6;
const WORKERS_PER_PAGE = 8;

// Standard 8-hour workday, ~4.33 weeks per month
const STANDARD_WORKDAY_HOURS = 8;
const WEEKS_PER_MONTH = 4.33;

// ---------------------------------------------------------------------------
// Supabase helper
// ---------------------------------------------------------------------------

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// ---------------------------------------------------------------------------
// Cost calculation (mirrors src/utils/laborCosts.ts)
// ---------------------------------------------------------------------------

function calcEmpleadoCost(
  salario: number,
  prestaciones: number,
  auxilios: number,
  horasSemanales: number,
  fraccion: number,
): number {
  const hrs = horasSemanales > 0 ? horasSemanales : 48;
  const monthlyHours = hrs * WEEKS_PER_MONTH;
  const hourlyRate = (salario + prestaciones + auxilios) / monthlyHours;
  return Math.round(hourlyRate * STANDARD_WORKDAY_HOURS * fraccion * 100) / 100;
}

function calcContratistaCost(tarifaJornal: number, fraccion: number): number {
  return Math.round(tarifaJornal * fraccion * 100) / 100;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatDateSpanish(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${months[m - 1]} ${y}`;
}

function parseDDMM(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = new Date().getFullYear();
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Fraction label helper
// ---------------------------------------------------------------------------

function fracLabel(frac: string): string {
  const entry = FRACCION_MAP[frac];
  return entry ? `${entry.label} (${entry.hours})` : frac;
}

// ---------------------------------------------------------------------------
// Worker type
// ---------------------------------------------------------------------------

interface Worker {
  id: string;
  nombre: string;
  type: "empleado" | "contratista";
  salario?: number;
  prestaciones_sociales?: number;
  auxilios_no_salariales?: number;
  horas_semanales?: number;
  tarifa_jornal?: number;
}

// ---------------------------------------------------------------------------
// Registration tracking (for day summary)
// ---------------------------------------------------------------------------

interface Registration {
  workerName: string;
  workerId: string;
  workerType: "empleado" | "contratista";
  tareaNombre: string;
  fraccion: number;
}

// ---------------------------------------------------------------------------
// Main conversation
// ---------------------------------------------------------------------------

export async function jornalConversation(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
) {
  const registrations: Registration[] = [];
  let fecha = "";
  let currentTareaId = "";
  let currentTareaNombre = "";
  let currentLoteId = "";
  let currentLoteNombre = "";

  // Back signal: returned by ask* functions when the user presses "← Atrás"
  const GO_BACK = Symbol("GO_BACK");
  type MaybeBack<T> = T | typeof GO_BACK;

  // =========================================================================
  // STEP 1 — Fecha (no back button — first step)
  // =========================================================================

  async function askFecha(): Promise<string> {
    const kb = new InlineKeyboard()
      .text("Hoy", "fecha_hoy")
      .text("Ayer", "fecha_ayer")
      .text("Otra fecha", "fecha_otra")
      .row()
      .text("❌ Cancelar", "cancel_flow");

    await ctx.reply("📅 ¿Para qué fecha es el registro?", {
      reply_markup: kb,
    });

    const cbCtx = await conversation.waitForCallbackQuery([
      "fecha_hoy",
      "fecha_ayer",
      "fecha_otra",
      "cancel_flow",
    ]);
    await cbCtx.answerCallbackQuery();

    const choice = cbCtx.callbackQuery.data;

    if (choice === "cancel_flow") {
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }

    if (choice === "fecha_hoy") return todayISO();
    if (choice === "fecha_ayer") return yesterdayISO();

    // "Otra fecha" — ask for DD/MM
    await cbCtx.editMessageText(
      "📅 Escribe la fecha en formato DD/MM (ej: 09/03)",
    );

    while (true) {
      const textCtx = await conversation.waitFor("message:text");
      const parsed = parseDDMM(textCtx.message.text);
      if (parsed) return parsed;
      await textCtx.reply(
        "Formato inválido. Escribe la fecha como DD/MM (ej: 09/03)",
      );
    }
  }

  // =========================================================================
  // STEP 2 — Tarea
  // =========================================================================

  async function askTarea(): Promise<MaybeBack<{ id: string; nombre: string; lote_ids: string[] }>> {
    const tareas = await conversation.external(async () => {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("tareas")
        .select("id, nombre, estado, lote_ids")
        .in("estado", ["En Proceso", "Programada"])
        .order("nombre", { ascending: true });
      if (error) throw new Error(`Error cargando tareas: ${error.message}`);
      return data || [];
    });

    if (tareas.length === 0) {
      await ctx.reply(
        "No hay tareas activas (En Proceso o Programadas). Crea una tarea primero en la app.",
      );
      throw new Error("NO_TAREAS");
    }

    let page = 0;
    const totalPages = Math.ceil(tareas.length / TASKS_PER_PAGE);

    function buildTareasKeyboard(p: number): InlineKeyboard {
      const kb = new InlineKeyboard();
      const start = p * TASKS_PER_PAGE;
      const slice = tareas.slice(start, start + TASKS_PER_PAGE);

      for (const t of slice) {
        kb.text(t.nombre, `tarea_${t.id}`).row();
      }

      if (totalPages > 1) {
        if (p > 0) kb.text("← Anterior", "tareas_prev");
        if (p < totalPages - 1) kb.text("Siguiente →", "tareas_next");
        kb.row();
      }

      kb.text("← Atrás", "go_back").text("❌ Cancelar", "cancel_flow");
      return kb;
    }

    const tareaIds = tareas.map((t: { id: string }) => `tarea_${t.id}`);

    await ctx.reply("📌 Selecciona la tarea:", {
      reply_markup: buildTareasKeyboard(page),
    });

    while (true) {
      const cbCtx = await conversation.waitForCallbackQuery([
        ...tareaIds,
        "tareas_prev",
        "tareas_next",
        "go_back",
        "cancel_flow",
      ]);
      await cbCtx.answerCallbackQuery();
      const data = cbCtx.callbackQuery.data;

      if (data === "cancel_flow") {
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }

      if (data === "go_back") {
        return GO_BACK;
      }

      if (data === "tareas_prev") {
        page = Math.max(0, page - 1);
        await cbCtx.editMessageReplyMarkup({
          reply_markup: buildTareasKeyboard(page),
        });
        continue;
      }
      if (data === "tareas_next") {
        page = Math.min(totalPages - 1, page + 1);
        await cbCtx.editMessageReplyMarkup({
          reply_markup: buildTareasKeyboard(page),
        });
        continue;
      }

      // Selected a task
      const tareaId = data.replace("tarea_", "");
      const tarea = tareas.find((t: { id: string }) => t.id === tareaId)!;
      await cbCtx.editMessageText(`📌 Tarea: ${tarea.nombre}`);
      return { id: tarea.id, nombre: tarea.nombre, lote_ids: tarea.lote_ids || [] };
    }
  }

  // =========================================================================
  // STEP 3 — Lote
  // =========================================================================

  async function askLote(tareaLoteIds: string[]): Promise<MaybeBack<{ id: string; nombre: string }>> {
    const lotes = await conversation.external(async () => {
      const sb = getSupabase();
      if (tareaLoteIds.length > 0) {
        const { data, error } = await sb
          .from("lotes")
          .select("id, nombre")
          .in("id", tareaLoteIds)
          .order("nombre", { ascending: true });
        if (error) throw new Error(`Error cargando lotes: ${error.message}`);
        return data || [];
      }
      // Fallback: all active lotes
      const { data, error } = await sb
        .from("lotes")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre", { ascending: true });
      if (error) throw new Error(`Error cargando lotes: ${error.message}`);
      return data || [];
    });

    if (lotes.length === 0) {
      await ctx.reply("No hay lotes disponibles. Configura lotes en la app.");
      throw new Error("NO_LOTES");
    }

    // If only one lote, auto-select (but still allow back)
    if (lotes.length === 1) {
      const kb = new InlineKeyboard()
        .text(`✓ ${lotes[0].nombre}`, `lote_${lotes[0].id}`)
        .row()
        .text("← Atrás", "go_back").text("❌ Cancelar", "cancel_flow");

      await ctx.reply("🌳 Selecciona el lote:", { reply_markup: kb });

      const cbCtx = await conversation.waitForCallbackQuery([
        `lote_${lotes[0].id}`,
        "go_back",
        "cancel_flow",
      ]);
      await cbCtx.answerCallbackQuery();

      if (cbCtx.callbackQuery.data === "cancel_flow") {
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }

      if (cbCtx.callbackQuery.data === "go_back") {
        return GO_BACK;
      }

      await cbCtx.editMessageText(`🌳 Lote: ${lotes[0].nombre}`);
      return { id: lotes[0].id, nombre: lotes[0].nombre };
    }

    const kb = new InlineKeyboard();
    for (const l of lotes) {
      kb.text(l.nombre, `lote_${l.id}`).row();
    }
    kb.text("← Atrás", "go_back").text("❌ Cancelar", "cancel_flow");

    await ctx.reply("🌳 Selecciona el lote:", { reply_markup: kb });

    const loteIds = lotes.map((l: { id: string }) => `lote_${l.id}`);
    const cbCtx = await conversation.waitForCallbackQuery([...loteIds, "go_back", "cancel_flow"]);
    await cbCtx.answerCallbackQuery();

    if (cbCtx.callbackQuery.data === "cancel_flow") {
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }

    if (cbCtx.callbackQuery.data === "go_back") {
      return GO_BACK;
    }

    const loteId = cbCtx.callbackQuery.data.replace("lote_", "");
    const lote = lotes.find((l: { id: string }) => l.id === loteId)!;
    await cbCtx.editMessageText(`🌳 Lote: ${lote.nombre}`);
    return { id: lote.id, nombre: lote.nombre };
  }

  // =========================================================================
  // STEP 4 — Fraccion jornal
  // =========================================================================

  async function askFraccion(): Promise<MaybeBack<string>> {
    const kb = new InlineKeyboard()
      .text("1/4 (2h)", "frac_0.25")
      .text("1/2 (4h)", "frac_0.5")
      .row()
      .text("3/4 (6h)", "frac_0.75")
      .text("Completo (8h)", "frac_1.0")
      .row()
      .text("← Atrás", "go_back").text("❌ Cancelar", "cancel_flow");

    await ctx.reply("⏱ ¿Qué fracción de jornal?", { reply_markup: kb });

    const cbCtx = await conversation.waitForCallbackQuery([
      "frac_0.25",
      "frac_0.5",
      "frac_0.75",
      "frac_1.0",
      "go_back",
      "cancel_flow",
    ]);
    await cbCtx.answerCallbackQuery();

    if (cbCtx.callbackQuery.data === "cancel_flow") {
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }

    if (cbCtx.callbackQuery.data === "go_back") {
      return GO_BACK;
    }

    const frac = cbCtx.callbackQuery.data.replace("frac_", "");
    await cbCtx.editMessageText(`⏱ Jornal: ${fracLabel(frac)}`);
    return frac;
  }

  // =========================================================================
  // STEP 5 — Multi-select workers
  // =========================================================================

  async function askWorkers(
    fraccion: string,
    tareaNombre: string,
  ): Promise<MaybeBack<Worker[]>> {
    const allWorkers = await conversation.external(async () => {
      const sb = getSupabase();
      const [empRes, conRes] = await Promise.all([
        sb
          .from("empleados")
          .select("id, nombre, salario, prestaciones_sociales, auxilios_no_salariales, horas_semanales")
          .eq("estado", "Activo")
          .order("nombre", { ascending: true }),
        sb
          .from("contratistas")
          .select("id, nombre, tarifa_jornal")
          .eq("estado", "Activo")
          .order("nombre", { ascending: true }),
      ]);

      const workers: Worker[] = [];
      for (const e of empRes.data || []) {
        workers.push({
          id: e.id,
          nombre: e.nombre,
          type: "empleado",
          salario: e.salario ?? 0,
          prestaciones_sociales: e.prestaciones_sociales ?? 0,
          auxilios_no_salariales: e.auxilios_no_salariales ?? 0,
          horas_semanales: e.horas_semanales ?? 48,
        });
      }
      for (const c of conRes.data || []) {
        workers.push({
          id: c.id,
          nombre: c.nombre,
          type: "contratista",
          tarifa_jornal: c.tarifa_jornal ?? 0,
        });
      }
      return workers;
    });

    if (allWorkers.length === 0) {
      await ctx.reply("No hay empleados ni contratistas activos.");
      throw new Error("NO_WORKERS");
    }

    const selected = new Set<string>();
    let workerPage = 0;
    const totalWorkerPages = Math.ceil(allWorkers.length / WORKERS_PER_PAGE);

    function buildWorkersKeyboard(p: number): InlineKeyboard {
      const kb = new InlineKeyboard();
      const start = p * WORKERS_PER_PAGE;
      const slice = allWorkers.slice(start, start + WORKERS_PER_PAGE);

      // Two workers per row
      for (let i = 0; i < slice.length; i += 2) {
        const w1 = slice[i];
        const mark1 = selected.has(w1.id) ? "✓ " : "  ";
        kb.text(`${mark1}${w1.nombre}`, `worker_${w1.id}`);

        if (i + 1 < slice.length) {
          const w2 = slice[i + 1];
          const mark2 = selected.has(w2.id) ? "✓ " : "  ";
          kb.text(`${mark2}${w2.nombre}`, `worker_${w2.id}`);
        }
        kb.row();
      }

      // Pagination
      if (totalWorkerPages > 1) {
        if (p > 0) kb.text("← Anterior", "workers_prev");
        if (p < totalWorkerPages - 1) kb.text("Siguiente →", "workers_next");
        kb.row();
      }

      kb.text("← Atrás", "go_back").text("❌ Cancelar", "cancel_flow").text("✔️ Listo", "workers_done");
      return kb;
    }

    const workerCallbackIds = allWorkers.map((w) => `worker_${w.id}`);
    const allCallbacks = [
      ...workerCallbackIds,
      "workers_prev",
      "workers_next",
      "workers_done",
      "go_back",
      "cancel_flow",
    ];

    const headerText = `👥 ¿Quién trabajó ${fracLabel(fraccion)} en ${tareaNombre}?\nToca para seleccionar:`;
    const msg = await ctx.reply(headerText, {
      reply_markup: buildWorkersKeyboard(workerPage),
    });

    while (true) {
      const cbCtx = await conversation.waitForCallbackQuery(allCallbacks);
      await cbCtx.answerCallbackQuery();
      const data = cbCtx.callbackQuery.data;

      if (data === "cancel_flow") {
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }

      if (data === "go_back") {
        return GO_BACK;
      }

      if (data === "workers_done") {
        if (selected.size === 0) {
          // Show an alert instead of editing — user must select at least one
          await cbCtx.answerCallbackQuery({
            text: "Selecciona al menos un trabajador",
            show_alert: true,
          });
          continue;
        }
        const selectedWorkers = allWorkers.filter((w) => selected.has(w.id));
        const names = selectedWorkers.map((w) => w.nombre).join(", ");
        await cbCtx.editMessageText(
          `👥 Trabajadores: ${names} (${selectedWorkers.length})`,
        );
        return selectedWorkers;
      }

      if (data === "workers_prev") {
        workerPage = Math.max(0, workerPage - 1);
        await cbCtx.editMessageReplyMarkup({
          reply_markup: buildWorkersKeyboard(workerPage),
        });
        continue;
      }

      if (data === "workers_next") {
        workerPage = Math.min(totalWorkerPages - 1, workerPage + 1);
        await cbCtx.editMessageReplyMarkup({
          reply_markup: buildWorkersKeyboard(workerPage),
        });
        continue;
      }

      // Toggle worker
      const workerId = data.replace("worker_", "");
      if (selected.has(workerId)) {
        selected.delete(workerId);
      } else {
        selected.add(workerId);
      }
      await cbCtx.editMessageReplyMarkup({
        reply_markup: buildWorkersKeyboard(workerPage),
      });
    }
  }

  // =========================================================================
  // STEP 6 — Observaciones
  // =========================================================================

  async function askObservaciones(): Promise<MaybeBack<string | null>> {
    const kb = new InlineKeyboard()
      .text("← Atrás", "go_back")
      .text("Saltar", "obs_skip")
      .row()
      .text("❌ Cancelar", "cancel_flow");
    await ctx.reply("📝 Escribe observaciones o toca Saltar:", {
      reply_markup: kb,
    });

    // Wait for either text or callback
    const response = await conversation.wait();

    if (response.callbackQuery?.data === "cancel_flow") {
      await response.answerCallbackQuery();
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }

    if (response.callbackQuery?.data === "go_back") {
      await response.answerCallbackQuery();
      return GO_BACK;
    }

    if (response.callbackQuery?.data === "obs_skip") {
      await response.answerCallbackQuery();
      return null;
    }

    if (response.message?.text) {
      return response.message.text.trim() || null;
    }

    return null;
  }

  // =========================================================================
  // STEP 7 — Confirmacion
  // =========================================================================

  async function showConfirmation(
    fechaISO: string,
    tareaNombre: string,
    loteNombre: string,
    fraccion: string,
    workers: Worker[],
    observaciones: string | null,
  ): Promise<"confirm" | "correct" | "cancel"> {
    const names = workers.map((w) => w.nombre).join(", ");
    const obsLine = observaciones ? `\n📝 ${observaciones}` : "";

    const summary = [
      "📋 Registro de Jornal",
      "━━━━━━━━━━━━━━━",
      `📅 Fecha: ${formatDateSpanish(fechaISO)}`,
      `📌 Tarea: ${tareaNombre}`,
      `🌳 Lote: ${loteNombre}`,
      `⏱ Jornal: ${fracLabel(fraccion)}`,
      `👥 ${names} (${workers.length} trabajador${workers.length > 1 ? "es" : ""})`,
      obsLine,
    ]
      .filter(Boolean)
      .join("\n");

    const kb = new InlineKeyboard()
      .text("✅ Confirmar", "jornal_confirm")
      .text("✏️ Corregir", "jornal_correct")
      .text("❌ Cancelar", "jornal_cancel");

    await ctx.reply(summary, { reply_markup: kb });

    const cbCtx = await conversation.waitForCallbackQuery([
      "jornal_confirm",
      "jornal_correct",
      "jornal_cancel",
    ]);
    await cbCtx.answerCallbackQuery();

    const choice = cbCtx.callbackQuery.data;
    if (choice === "jornal_confirm") return "confirm";
    if (choice === "jornal_correct") return "correct";
    return "cancel";
  }

  // =========================================================================
  // INSERT — registros_trabajo
  // =========================================================================

  async function insertRegistros(
    fechaISO: string,
    tareaId: string,
    loteId: string,
    fraccion: string,
    workers: Worker[],
    observaciones: string | null,
  ): Promise<{ inserted: number; duplicates: string[] }> {
    const fracNum = parseFloat(fraccion);
    const duplicates: string[] = [];

    // Check for existing records (UNIQUE constraint)
    const existingIdsList = await conversation.external(async () => {
      const sb = getSupabase();
      const empIds = workers.filter((w) => w.type === "empleado").map((w) => w.id);
      const conIds = workers.filter((w) => w.type === "contratista").map((w) => w.id);

      const orConds: string[] = [];
      if (empIds.length > 0) orConds.push(`empleado_id.in.(${empIds.join(",")})`);
      if (conIds.length > 0) orConds.push(`contratista_id.in.(${conIds.join(",")})`);

      if (orConds.length === 0) return [] as string[];

      const { data, error } = await sb
        .from("registros_trabajo")
        .select("empleado_id, contratista_id")
        .eq("tarea_id", tareaId)
        .eq("fecha_trabajo", fechaISO)
        .eq("lote_id", loteId)
        .or(orConds.join(","));

      if (error) throw new Error(`Error checking duplicates: ${error.message}`);

      const ids: string[] = [];
      for (const r of data || []) {
        if (r.empleado_id) ids.push(r.empleado_id);
        if (r.contratista_id) ids.push(r.contratista_id);
      }
      return ids;
    });

    const existingIds = new Set(existingIdsList);

    // Separate workers into new vs duplicate
    const newWorkers = workers.filter((w) => !existingIds.has(w.id));
    const dupWorkers = workers.filter((w) => existingIds.has(w.id));

    for (const w of dupWorkers) {
      duplicates.push(w.nombre);
    }

    if (newWorkers.length === 0) {
      return { inserted: 0, duplicates };
    }

    // Build insert rows
    const rows = newWorkers.map((w) => {
      const isEmp = w.type === "empleado";
      const costoJornal = isEmp
        ? calcEmpleadoCost(
            w.salario ?? 0,
            w.prestaciones_sociales ?? 0,
            w.auxilios_no_salariales ?? 0,
            w.horas_semanales ?? 48,
            fracNum,
          )
        : calcContratistaCost(w.tarifa_jornal ?? 0, fracNum);

      return {
        tarea_id: tareaId,
        empleado_id: isEmp ? w.id : null,
        contratista_id: isEmp ? null : w.id,
        lote_id: loteId,
        fecha_trabajo: fechaISO,
        fraccion_jornal: fraccion,
        observaciones: observaciones,
        valor_jornal_empleado: isEmp ? (w.salario ?? 0) : null,
        costo_jornal: costoJornal,
      };
    });

    await conversation.external(async () => {
      const sb = getSupabase();
      const { error } = await sb.from("registros_trabajo").insert(rows);
      if (error) throw new Error(`Error al guardar: ${error.message}`);
    });

    return { inserted: newWorkers.length, duplicates };
  }

  // =========================================================================
  // REPLACE duplicates — delete + re-insert
  // =========================================================================

  async function replaceRegistros(
    fechaISO: string,
    tareaId: string,
    loteId: string,
    fraccion: string,
    workers: Worker[],
    observaciones: string | null,
  ): Promise<number> {
    const fracNum = parseFloat(fraccion);

    await conversation.external(async () => {
      const sb = getSupabase();
      const empIds = workers.filter((w) => w.type === "empleado").map((w) => w.id);
      const conIds = workers.filter((w) => w.type === "contratista").map((w) => w.id);

      // Delete existing for these workers
      const orConds: string[] = [];
      if (empIds.length > 0) orConds.push(`empleado_id.in.(${empIds.join(",")})`);
      if (conIds.length > 0) orConds.push(`contratista_id.in.(${conIds.join(",")})`);

      if (orConds.length > 0) {
        const { error } = await sb
          .from("registros_trabajo")
          .delete()
          .eq("tarea_id", tareaId)
          .eq("fecha_trabajo", fechaISO)
          .eq("lote_id", loteId)
          .or(orConds.join(","));

        if (error) throw new Error(`Error al reemplazar: ${error.message}`);
      }

      // Re-insert all
      const rows = workers.map((w) => {
        const isEmp = w.type === "empleado";
        const costoJornal = isEmp
          ? calcEmpleadoCost(
              w.salario ?? 0,
              w.prestaciones_sociales ?? 0,
              w.auxilios_no_salariales ?? 0,
              w.horas_semanales ?? 48,
              fracNum,
            )
          : calcContratistaCost(w.tarifa_jornal ?? 0, fracNum);

        return {
          tarea_id: tareaId,
          empleado_id: isEmp ? w.id : null,
          contratista_id: isEmp ? null : w.id,
          lote_id: loteId,
          fecha_trabajo: fechaISO,
          fraccion_jornal: fraccion,
          observaciones: observaciones,
          valor_jornal_empleado: isEmp ? (w.salario ?? 0) : null,
          costo_jornal: costoJornal,
        };
      });

      const { error: insertErr } = await sb.from("registros_trabajo").insert(rows);
      if (insertErr) throw new Error(`Error al guardar: ${insertErr.message}`);
    });

    return workers.length;
  }

  // =========================================================================
  // DAY SUMMARY
  // =========================================================================

  function buildDaySummary(fechaISO: string, regs: Registration[]): string {
    // Group by worker
    const byWorker = new Map<string, { name: string; entries: { tarea: string; frac: number }[] }>();

    for (const r of regs) {
      if (!byWorker.has(r.workerId)) {
        byWorker.set(r.workerId, { name: r.workerName, entries: [] });
      }
      byWorker.get(r.workerId)!.entries.push({
        tarea: r.tareaNombre,
        frac: r.fraccion,
      });
    }

    const lines: string[] = [
      `📊 Resumen del día — ${formatDateSpanish(fechaISO)}`,
      "━━━━━━━━━━━━━━━━━━━",
    ];

    for (const [, { name, entries }] of byWorker) {
      const total = entries.reduce((s, e) => s + e.frac, 0);
      const detail = entries.map((e) => `${e.tarea} ${e.frac}`).join(" + ");

      if (entries.length === 1) {
        const marker = total >= 1.0 ? " ✓" : "";
        const warning = total < 1.0 ? "⚠️ " : "";
        const incomplete =
          total < 1.0 ? ` (total ${total} — ¿incompleto?)` : "";
        lines.push(`${warning}${name}: ${detail}${marker}${incomplete}`);
      } else {
        const marker = total >= 1.0 ? " ✓" : "";
        const warning = total < 1.0 ? "⚠️ " : "";
        const incomplete =
          total < 1.0 ? ` (total ${total} — ¿incompleto?)` : "";
        lines.push(
          `${warning}${name}: ${detail} = ${total}${marker}${incomplete}`,
        );
      }
    }

    return lines.join("\n");
  }

  // =========================================================================
  // MAIN LOOP
  // =========================================================================

  try {
    // Persistent state across steps
    let tarea: { id: string; nombre: string; lote_ids: string[] } | null = null;
    let lote: { id: string; nombre: string } | null = null;
    let fraccion = "";
    let workers: Worker[] = [];
    let observaciones: string | null = null;

    // Step-based state machine:
    // 1 = fecha, 2 = tarea, 3 = lote, 4 = fraccion, 5 = workers,
    // 6 = observaciones, 7 = confirmation
    let step = 1;

    while (step <= 7) {
      if (step === 1) {
        // Fecha — no back button (first step)
        fecha = await askFecha();
        await ctx.reply(`📅 Fecha: ${formatDateSpanish(fecha)}`);
        step = 2;
        continue;
      }

      if (step === 2) {
        const result = await askTarea();
        if (result === GO_BACK) { step = 1; continue; }
        tarea = result;
        currentTareaId = tarea.id;
        currentTareaNombre = tarea.nombre;
        step = 3;
        continue;
      }

      if (step === 3) {
        const result = await askLote(tarea!.lote_ids);
        if (result === GO_BACK) { step = 2; continue; }
        lote = result;
        currentLoteId = lote.id;
        currentLoteNombre = lote.nombre;
        step = 4;
        continue;
      }

      if (step === 4) {
        const result = await askFraccion();
        if (result === GO_BACK) { step = 3; continue; }
        fraccion = result;
        step = 5;
        continue;
      }

      if (step === 5) {
        const result = await askWorkers(fraccion, currentTareaNombre);
        if (result === GO_BACK) { step = 4; continue; }
        workers = result;
        step = 6;
        continue;
      }

      if (step === 6) {
        const result = await askObservaciones();
        if (result === GO_BACK) { step = 5; continue; }
        observaciones = result;
        step = 7;
        continue;
      }

      if (step === 7) {
        const decision = await showConfirmation(
          fecha,
          currentTareaNombre,
          currentLoteNombre,
          fraccion,
          workers,
          observaciones,
        );

        if (decision === "cancel") {
          await ctx.reply("❌ Registro cancelado.");
          return;
        }

        if (decision === "correct") {
          // "Corregir" sends back to tarea selection
          step = 2;
          continue;
        }

        // Confirm — insert into DB
        const result = await insertRegistros(
          fecha,
          currentTareaId,
          currentLoteId,
          fraccion,
          workers,
          observaciones,
        );

        // Handle duplicates
        if (result.duplicates.length > 0) {
          const dupNames = result.duplicates.join(", ");
          const kb = new InlineKeyboard()
            .text("🔄 Reemplazar", "dup_replace")
            .text("⏭ Omitir", "dup_skip")
            .row()
            .text("❌ Cancelar", "cancel_flow");

          await ctx.reply(
            `⚠️ Ya existe registro para: ${dupNames}\n¿Quieres reemplazar los registros existentes?`,
            { reply_markup: kb },
          );

          const cbCtx = await conversation.waitForCallbackQuery([
            "dup_replace",
            "dup_skip",
            "cancel_flow",
          ]);
          await cbCtx.answerCallbackQuery();

          if (cbCtx.callbackQuery.data === "cancel_flow") {
            await ctx.reply("Operación cancelada.");
            return conversation.halt();
          }

          if (cbCtx.callbackQuery.data === "dup_replace") {
            const dupWorkers = workers.filter((w) =>
              result.duplicates.includes(w.nombre),
            );
            const replaced = await replaceRegistros(
              fecha,
              currentTareaId,
              currentLoteId,
              fraccion,
              dupWorkers,
              observaciones,
            );
            await ctx.reply(
              `✅ ${result.inserted + replaced} registro${result.inserted + replaced > 1 ? "s" : ""} guardado${result.inserted + replaced > 1 ? "s" : ""} (${replaced} reemplazado${replaced > 1 ? "s" : ""}).`,
            );

            for (const w of workers) {
              registrations.push({
                workerName: w.nombre,
                workerId: w.id,
                workerType: w.type,
                tareaNombre: currentTareaNombre,
                fraccion: parseFloat(fraccion),
              });
            }
          } else {
            if (result.inserted > 0) {
              await ctx.reply(
                `✅ ${result.inserted} registro${result.inserted > 1 ? "s" : ""} guardado${result.inserted > 1 ? "s" : ""} (${result.duplicates.length} omitido${result.duplicates.length > 1 ? "s" : ""}).`,
              );
            } else {
              await ctx.reply("Todos los registros ya existían. Nada se guardó.");
            }

            const newWorkers = workers.filter(
              (w) => !result.duplicates.includes(w.nombre),
            );
            for (const w of newWorkers) {
              registrations.push({
                workerName: w.nombre,
                workerId: w.id,
                workerType: w.type,
                tareaNombre: currentTareaNombre,
                fraccion: parseFloat(fraccion),
              });
            }
          }
        } else {
          await ctx.reply(
            `✅ ${result.inserted} registro${result.inserted > 1 ? "s" : ""} guardado${result.inserted > 1 ? "s" : ""}.`,
          );

          for (const w of workers) {
            registrations.push({
              workerName: w.nombre,
              workerId: w.id,
              workerType: w.type,
              tareaNombre: currentTareaNombre,
              fraccion: parseFloat(fraccion),
            });
          }
        }

        // Post-registration: what next?
        const postKb = new InlineKeyboard()
          .text("👥 Misma tarea, otra fracción", "post_same_task")
          .row()
          .text("📋 Otra tarea", "post_other_task")
          .text("✅ Terminar", "post_done")
          .row()
          .text("❌ Cancelar", "cancel_flow");

        await ctx.reply("¿Qué deseas hacer?", { reply_markup: postKb });

        const postCtx = await conversation.waitForCallbackQuery([
          "post_same_task",
          "post_other_task",
          "post_done",
          "cancel_flow",
        ]);
        await postCtx.answerCallbackQuery();

        const postChoice = postCtx.callbackQuery.data;

        if (postChoice === "cancel_flow") {
          await ctx.reply("Operación cancelada.");
          return conversation.halt();
        }

        if (postChoice === "post_same_task") {
          // Keep fecha, tarea, lote — go back to fraccion
          step = 4;
        } else if (postChoice === "post_other_task") {
          // Keep fecha — go back to tarea
          step = 2;
        } else {
          // Done — exit the loop
          step = 8;
        }
        continue;
      }
    }

    // Show day summary
    if (registrations.length > 0) {
      const summary = buildDaySummary(fecha, registrations);
      await ctx.reply(summary);
    }

    await ctx.reply("Registro de jornales finalizado. Usa /start para volver al menú.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    // Graceful exit for expected "no data" errors
    if (
      msg === "NO_TAREAS" ||
      msg === "NO_LOTES" ||
      msg === "NO_WORKERS"
    ) {
      return;
    }
    console.error("[Telegram] Jornal conversation error:", msg);
    await ctx.reply(`Error en el registro: ${msg}\n\nUsa /start para volver al menú.`);
  }
}
