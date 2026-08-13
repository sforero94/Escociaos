// telegram/conversations/eventoHato.ts — Registro en campo de eventos del
// ciclo reproductivo (N5-N9 del plan
// docs/plan_hato_telegram_estados_agosto_2026.md).
//
// ORIGEN: visita del dueño a la finca, 2026-08-13. Fernando vio una vaca en
// celo, llevó el toro y la montó — y no tenía ninguna forma de dejarlo
// asentado hasta el chequeo bimensual de la veterinaria. Este flujo es esa
// forma.
//
// DECISIÓN D-B (dueño, en chips): **Telegram escribe DIRECTO**, sin cola de
// aprobación. El evento existe apenas Fernando lo registra y Martha lo
// corrige después desde la Hoja de Vida. Lo que hace tolerable esa decisión
// es el "Deshacer" del final: el error más probable no es inventarse un
// evento, es elegir la vaca equivocada del listado, y eso se ve en el
// resumen inmediatamente.
//
// CONTRATOS QUE ESTE ARCHIVO RESPETA
// ----------------------------------
// 1. **`created_by` explícito** desde `telegram_usuarios.usuario_id`. El bot
//    escribe con `service_role`, donde `auth.uid()` es NULL: ni los triggers
//    de atribución (040/050/063/074) ni la traza de `hato_correcciones`
//    (084) se disparan solos. Sin esto, todo lo que registre Fernando queda
//    sin autor, que es la brecha conocida del módulo.
// 2. **`chequeo_vaca_id` queda en NULL** (no se toca). Es lo que hace estos
//    eventos INTOCABLES por `fn_hato_commit_chequeo` (065): re-aprobar un
//    chequeo borra y reinserta solo SUS propios eventos.
// 3. **Nunca se inventa una fecha.** Por defecto hoy en hora de Bogotá
//    (`hoyBogota()`), nunca `new Date().toISOString()` a secas: el servidor
//    Deno corre en UTC y de 19:00 en adelante eso ya es mañana — la misma
//    trampa que documenta el CLAUDE.md raíz para el navegador.
// 4. **Advertir, nunca bloquear** (regla general del módulo): un secado
//    antes de lo proyectado se avisa con los días de diferencia y se
//    registra igual. Es justamente el caso que motivó este flujo (dos vacas
//    con producción muy baja que hubo que secar antes de lo presupuestado).

import { Conversation } from "npm:@grammyjs/conversations@2";
import { InlineKeyboard } from "npm:grammy@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { BotContext } from "../types.ts";
import {
  derivarEstadoReproductivo,
  type EstadoActualHatoRow,
  type HatoConfig,
} from "../../calculos-hato.ts";
import { construirHatoConfigDesdeFilas } from "../../hato-config-desde-tabla.ts";

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** "Hoy" en Bogotá (UTC-5), no en UTC. Ver contrato 3 de la cabecera. */
function hoyBogota(): string {
  const ahora = new Date();
  const bogota = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  return bogota.toISOString().slice(0, 10);
}

function parseDDMM(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (!m) return null;
  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const anio = Number(hoyBogota().slice(0, 4));
  const iso = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  // Una fecha futura casi siempre es el año pasado mal escrito (p. ej. "28/12"
  // registrado en enero). Se corrige al año anterior en vez de guardar un
  // hecho que todavía no ocurrió.
  return iso > hoyBogota() ? `${anio - 1}-${iso.slice(5)}` : iso;
}

function fechaLegible(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${meses[m - 1]} ${a}`;
}

// ============================================================================
// Tipos de evento que este flujo sabe registrar
// ============================================================================

type ClaveEvento = "monta" | "inseminacion" | "secado" | "parto" | "aborto";

interface DefinicionEvento {
  etiqueta: string;
  /** `hato_eventos.tipo` real. `monta`/`inseminacion` son el MISMO tipo
   * (`servicio`) distinguidos por `tipo_servicio` — el CHECK de la tabla ya
   * lo modela así desde 053, no se agrega ningún tipo nuevo. */
  tipo: "servicio" | "secado_real" | "parto" | "aborto";
  tipoServicio?: "monta" | "inseminacion";
  /** ¿Pide toro del catálogo? */
  pideToro: boolean;
}

const EVENTOS: Record<ClaveEvento, DefinicionEvento> = {
  monta: { etiqueta: "🐂 Monta", tipo: "servicio", tipoServicio: "monta", pideToro: true },
  inseminacion: { etiqueta: "💉 Inseminación", tipo: "servicio", tipoServicio: "inseminacion", pideToro: true },
  secado: { etiqueta: "🌾 Secado", tipo: "secado_real", pideToro: false },
  parto: { etiqueta: "🐄 Parto", tipo: "parto", pideToro: false },
  aborto: { etiqueta: "⚠️ Aborto", tipo: "aborto", pideToro: false },
};

/** Destinos de cría del CHECK de `hato_eventos.cria_destino` (053). */
const DESTINOS_CRIA: Array<{ clave: string; etiqueta: string }> = [
  { clave: "retenida", etiqueta: "Hembra, se queda" },
  { clave: "hembra_vendida", etiqueta: "Hembra, se vende" },
  { clave: "macho_vendido", etiqueta: "Macho, se vende" },
  { clave: "muerta", etiqueta: "Nació muerta" },
];

// ============================================================================
// Datos que el flujo lee de la base
// ============================================================================

interface VacaCandidata {
  animal_id: string;
  numero: number | null;
  nombre: string | null;
  fila: EstadoActualHatoRow;
}

interface ToroCatalogo {
  id: string;
  nombre: string;
  raza: string | null;
  /** Solo para inseminación: lote de pajillas y stock restante. */
  pajillaId: string | null;
  stock: number | null;
}

function etiquetaVaca(v: { numero: number | null; nombre: string | null }): string {
  // Lidera con el NOMBRE, no con la chapeta: Fernando lee el nombre en el
  // corral y una parte del hato carga números provisionales (800-999) que no
  // corresponden a ninguna caravana física (migración 066).
  const nombre = v.nombre ?? "sin nombre";
  return v.numero != null ? `${nombre} (#${v.numero})` : `${nombre} (sin caravana)`;
}

/** Normaliza para buscar: sin acentos, sin mayúsculas, sin espacios extra. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * N4 — búsqueda de la vaca por nombre o chapeta. Devuelve TODAS las
 * coincidencias: dos vacas activas pueden llamarse igual (el caso real MOCA
 * #177/#183 del módulo), y adjudicar una sola sería elegir por el usuario.
 */
export function buscarVacas(vacas: VacaCandidata[], consulta: string): VacaCandidata[] {
  const q = normalizar(consulta);
  if (!q) return [];
  const comoNumero = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;
  if (comoNumero !== null) {
    const porNumero = vacas.filter((v) => v.numero === comoNumero);
    if (porNumero.length > 0) return porNumero;
  }
  const exactas = vacas.filter((v) => normalizar(v.nombre ?? "") === q);
  if (exactas.length > 0) return exactas;
  return vacas.filter((v) => normalizar(v.nombre ?? "").includes(q));
}

// ============================================================================
// Conversación
// ============================================================================

export async function eventoHatoConversation(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
) {
  const usuarioId = ctx.telegramUser?.usuario_id ?? null;

  try {
    // ── Paso 1: ¿qué pasó? ────────────────────────────────────────────
    const kbTipo = new InlineKeyboard()
      .text(EVENTOS.monta.etiqueta, "ev_monta")
      .text(EVENTOS.inseminacion.etiqueta, "ev_inseminacion")
      .row()
      .text(EVENTOS.secado.etiqueta, "ev_secado")
      .text(EVENTOS.parto.etiqueta, "ev_parto")
      .row()
      .text(EVENTOS.aborto.etiqueta, "ev_aborto")
      .text("❌ Cancelar", "cancel_flow");

    await ctx.reply("📋 *Registrar evento del hato*\n\n¿Qué pasó?", {
      reply_markup: kbTipo,
      parse_mode: "Markdown",
    });

    const cbTipo = await conversation.waitForCallbackQuery([
      "ev_monta", "ev_inseminacion", "ev_secado", "ev_parto", "ev_aborto", "cancel_flow",
    ]);
    await cbTipo.answerCallbackQuery();
    if (cbTipo.callbackQuery.data === "cancel_flow") {
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }
    const clave = cbTipo.callbackQuery.data.replace("ev_", "") as ClaveEvento;
    const def = EVENTOS[clave];
    await cbTipo.editMessageText(`📋 Evento: *${def.etiqueta}*`, { parse_mode: "Markdown" });

    // ── Paso 2: cargar hato + config ──────────────────────────────────
    const { vacas, config } = await conversation.external(async () => {
      const sb = getSupabaseAdmin();
      const [estadoRes, configRes] = await Promise.all([
        sb
          .from("v_hato_estado_actual")
          .select(
            "animal_id, numero, nombre, etapa, raza, estado, num_partos, ultimo_chequeo_fecha, " +
              "ultimo_servicio_fecha, ultimo_parto_fecha, ultimo_secado_real_fecha, " +
              "ultima_confirmacion_prenez_fecha, ultimo_evento_fecha, ultimo_estado_chequeo, " +
              "ultima_confirmacion_prenez_metodo, ultimo_aborto_fecha",
          )
          .eq("estado", "activa")
          .neq("etapa", "ternera"),
        sb.from("hato_config").select("clave, valor"),
      ]);
      if (estadoRes.error) throw new Error(`Error cargando el hato: ${estadoRes.error.message}`);
      if (configRes.error) throw new Error(`Error cargando configuración: ${configRes.error.message}`);

      const filas = (estadoRes.data ?? []) as Array<Record<string, unknown>>;
      const candidatas: VacaCandidata[] = filas.map((f) => ({
        animal_id: f.animal_id as string,
        numero: (f.numero as number | null) ?? null,
        nombre: (f.nombre as string | null) ?? null,
        fila: f as unknown as EstadoActualHatoRow,
      }));
      return {
        vacas: candidatas,
        config: construirHatoConfigDesdeFilas(
          (configRes.data ?? []) as Array<{ clave: string; valor: unknown }>,
        ) as HatoConfig,
      };
    });

    if (vacas.length === 0) {
      await ctx.reply("No hay vacas ni novillas activas en el hato.");
      return;
    }

    // ── Paso 3: ¿cuál vaca? ───────────────────────────────────────────
    await ctx.reply("🔎 Escribe el *nombre* o la *chapeta* de la vaca.", { parse_mode: "Markdown" });

    let vaca: VacaCandidata | null = null;
    while (!vaca) {
      const txt = await conversation.waitFor("message:text");
      const consulta = txt.message.text.trim();
      if (consulta.startsWith("/")) {
        await txt.reply("Escribe el nombre o la chapeta, sin comandos. Usa /cancelar para salir.");
        continue;
      }

      const encontradas = buscarVacas(vacas, consulta);
      if (encontradas.length === 0) {
        await txt.reply(`No encontré ninguna vaca activa que coincida con "${consulta}". Intenta de nuevo.`);
        continue;
      }
      if (encontradas.length === 1) {
        vaca = encontradas[0];
        break;
      }

      // Homónimas o coincidencias parciales: SIEMPRE elige el humano.
      const kb = new InlineKeyboard();
      encontradas.slice(0, 10).forEach((v, i) => {
        kb.text(etiquetaVaca(v), `vaca_${i}`).row();
      });
      kb.text("❌ Cancelar", "cancel_flow");
      await txt.reply(`Hay ${encontradas.length} coincidencias. ¿Cuál es?`, { reply_markup: kb });

      const cbVaca = await conversation.waitForCallbackQuery(/^(vaca_\d+|cancel_flow)$/);
      await cbVaca.answerCallbackQuery();
      if (cbVaca.callbackQuery.data === "cancel_flow") {
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }
      vaca = encontradas[Number(cbVaca.callbackQuery.data.replace("vaca_", ""))];
    }

    const estadoActual = derivarEstadoReproductivo(vaca.fila, config, hoyBogota());

    // ── Paso 4: fecha ─────────────────────────────────────────────────
    const hoy = hoyBogota();
    const kbFecha = new InlineKeyboard()
      .text(`✅ Hoy (${fechaLegible(hoy)})`, "fecha_hoy")
      .row()
      .text("📅 Otra fecha", "fecha_otra")
      .text("❌ Cancelar", "cancel_flow");
    await ctx.reply(`🐄 *${etiquetaVaca(vaca)}*\n¿Cuándo fue?`, {
      reply_markup: kbFecha,
      parse_mode: "Markdown",
    });

    const cbFecha = await conversation.waitForCallbackQuery(["fecha_hoy", "fecha_otra", "cancel_flow"]);
    await cbFecha.answerCallbackQuery();
    if (cbFecha.callbackQuery.data === "cancel_flow") {
      await ctx.reply("Operación cancelada.");
      return conversation.halt();
    }

    let fecha = hoy;
    if (cbFecha.callbackQuery.data === "fecha_otra") {
      await cbFecha.editMessageText("📅 Escribe la fecha como DD/MM (ej: 12/08)");
      while (true) {
        const t = await conversation.waitFor("message:text");
        const parsed = parseDDMM(t.message.text);
        if (parsed) {
          fecha = parsed;
          break;
        }
        await t.reply("Formato inválido. Escribe DD/MM (ej: 12/08).");
      }
    } else {
      await cbFecha.editMessageText(`📅 Fecha: ${fechaLegible(fecha)}`);
    }

    // ── Paso 5: datos propios del tipo de evento ──────────────────────
    let toro: ToroCatalogo | null = null;
    let criaDestino: string | null = null;

    if (def.pideToro) {
      const toros = await conversation.external(async () => {
        const sb = getSupabaseAdmin();
        const { data: torosData, error } = await sb
          .from("hato_toros")
          .select("id, nombre, raza")
          .eq("activo", true)
          .eq("tipo", def.tipoServicio === "monta" ? "monta" : "inseminacion")
          .order("nombre");
        if (error) throw new Error(`Error cargando toros: ${error.message}`);

        // Para inseminación se anexa el stock de pajillas del lote, que es lo
        // que hay que descontar. La vista puede dar negativo: se avisa, NUNCA
        // se bloquea (Épica G3).
        let stockPorToro = new Map<string, { pajillaId: string; stock: number }>();
        if (def.tipoServicio === "inseminacion") {
          const { data: stockData, error: stockErr } = await sb
            .from("v_hato_pajillas_stock")
            .select("pajilla_id, toro_id, cantidad_actual");
          if (stockErr) throw new Error(`Error cargando pajillas: ${stockErr.message}`);
          for (const s of (stockData ?? []) as Array<Record<string, unknown>>) {
            stockPorToro.set(s.toro_id as string, {
              pajillaId: s.pajilla_id as string,
              stock: Number(s.cantidad_actual ?? 0),
            });
          }
        }

        return ((torosData ?? []) as Array<Record<string, unknown>>).map((t): ToroCatalogo => {
          const s = stockPorToro.get(t.id as string);
          return {
            id: t.id as string,
            nombre: t.nombre as string,
            raza: (t.raza as string | null) ?? null,
            pajillaId: s?.pajillaId ?? null,
            stock: s?.stock ?? null,
          };
        });
      });

      if (toros.length === 0) {
        await ctx.reply(
          `No hay toros de ${def.tipoServicio} activos en el catálogo. Avisa a un administrador.`,
        );
        return;
      }

      const kbToro = new InlineKeyboard();
      toros.forEach((t, i) => {
        const stock = t.stock !== null ? ` — ${t.stock} pajilla${t.stock === 1 ? "" : "s"}` : "";
        const raza = t.raza ? ` (${t.raza})` : "";
        kbToro.text(`${t.nombre}${raza}${stock}`, `toro_${i}`).row();
      });
      kbToro.text("❌ Cancelar", "cancel_flow");
      await ctx.reply(def.tipoServicio === "monta" ? "🐂 ¿Con cuál toro?" : "💉 ¿Con cuál pajilla?", {
        reply_markup: kbToro,
      });

      const cbToro = await conversation.waitForCallbackQuery(/^(toro_\d+|cancel_flow)$/);
      await cbToro.answerCallbackQuery();
      if (cbToro.callbackQuery.data === "cancel_flow") {
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }
      toro = toros[Number(cbToro.callbackQuery.data.replace("toro_", ""))];
      await cbToro.editMessageText(`🐂 ${toro.nombre}`);
    }

    if (clave === "parto") {
      const kbCria = new InlineKeyboard();
      DESTINOS_CRIA.forEach((d, i) => kbCria.text(d.etiqueta, `cria_${i}`).row());
      kbCria.text("No sé todavía", "cria_none").text("❌ Cancelar", "cancel_flow");
      await ctx.reply("🍼 ¿Cómo fue la cría?", { reply_markup: kbCria });

      const cbCria = await conversation.waitForCallbackQuery(/^(cria_\d+|cria_none|cancel_flow)$/);
      await cbCria.answerCallbackQuery();
      if (cbCria.callbackQuery.data === "cancel_flow") {
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }
      if (cbCria.callbackQuery.data !== "cria_none") {
        criaDestino = DESTINOS_CRIA[Number(cbCria.callbackQuery.data.replace("cria_", ""))].clave;
      }
    }

    // ── Paso 6: advertencias (nunca bloquean) ─────────────────────────
    const advertencias: string[] = [];

    if (clave === "secado" && estadoActual.fecha_secar) {
      const dias = Math.round(
        (Date.parse(`${estadoActual.fecha_secar}T00:00:00Z`) - Date.parse(`${fecha}T00:00:00Z`)) / 86400000,
      );
      if (dias > 7) {
        // El caso que motivó este flujo: dos vacas de producción muy baja que
        // hubo que secar antes de lo presupuestado.
        advertencias.push(
          `Se está secando ${dias} días antes de lo proyectado (${fechaLegible(estadoActual.fecha_secar)}).`,
        );
      }
    }

    if (clave === "parto" && vaca.fila.ultimo_parto_fecha) {
      const diasEntrePartos = Math.round(
        (Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${vaca.fila.ultimo_parto_fecha}T00:00:00Z`)) / 86400000,
      );
      if (Math.abs(diasEntrePartos) < 270) {
        // 270 días es el mínimo biológico real, el mismo umbral de la
        // migración 080 (partos biológicamente imposibles).
        advertencias.push(
          `Ya hay un parto registrado el ${fechaLegible(vaca.fila.ultimo_parto_fecha)}, hace ${Math.abs(diasEntrePartos)} días. Dos partos tan seguidos no son posibles.`,
        );
      }
    }

    if ((clave === "monta" || clave === "inseminacion") && estadoActual.estado === "preñada") {
      advertencias.push("Esta vaca figura como preñez CONFIRMADA por palpación.");
    }

    if (toro && toro.stock !== null && toro.stock <= 0) {
      advertencias.push(`El lote de ${toro.nombre} ya está en ${toro.stock} pajillas.`);
    }

    // ── Paso 7: confirmar ─────────────────────────────────────────────
    const resumen = [
      `📋 *${def.etiqueta.replace(/^\S+\s/, "")}*`,
      `🐄 ${etiquetaVaca(vaca)}`,
      `📅 ${fechaLegible(fecha)}`,
      toro ? `🐂 ${toro.nombre}` : null,
      criaDestino ? `🍼 ${DESTINOS_CRIA.find((d) => d.clave === criaDestino)?.etiqueta}` : null,
      advertencias.length > 0 ? `\n⚠️ ${advertencias.join("\n⚠️ ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const kbConfirmar = new InlineKeyboard()
      .text("✅ Guardar", "ok")
      .text("❌ Cancelar", "cancel_flow");
    await ctx.reply(`${resumen}\n\n¿Guardo?`, { reply_markup: kbConfirmar, parse_mode: "Markdown" });

    const cbOk = await conversation.waitForCallbackQuery(["ok", "cancel_flow"]);
    await cbOk.answerCallbackQuery();
    if (cbOk.callbackQuery.data === "cancel_flow") {
      await ctx.reply("Nada se guardó.");
      return conversation.halt();
    }

    // ── Paso 8: escribir ──────────────────────────────────────────────
    const guardado = await conversation.external(async () => {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb
        .from("hato_eventos")
        .insert({
          animal_id: vaca!.animal_id,
          tipo: def.tipo,
          fecha,
          // El humano estuvo ahí: la fecha es exacta, no una reconstrucción
          // a partir de una planilla.
          fecha_confianza: "exacta",
          tipo_servicio: def.tipoServicio ?? null,
          toro_id: toro?.id ?? null,
          cria_destino: criaDestino,
          fuente: "telegram",
          // chequeo_vaca_id se deja NULL: es lo que vuelve este evento
          // intocable por fn_hato_commit_chequeo (065).
          datos: { origen: "telegram", registrado_por: ctx.telegramUser?.nombre_display ?? null },
          created_by: usuarioId,
        })
        .select("id")
        .single();
      if (error) throw new Error(`No se pudo guardar: ${error.message}`);

      // Uso de pajilla: se registra DESPUÉS del evento y su fallo no tumba el
      // evento — la preñez es el hecho importante, el descuento de inventario
      // es contabilidad que Martha puede corregir.
      let usoId: string | null = null;
      if (toro?.pajillaId) {
        const { data: uso, error: usoErr } = await sb
          .from("hato_pajillas_uso")
          .insert({
            pajilla_id: toro.pajillaId,
            fecha_uso: fecha,
            animal_id: vaca!.animal_id,
            created_by: usuarioId,
          })
          .select("id")
          .single();
        if (usoErr) {
          console.error("[Telegram] No se pudo descontar la pajilla:", usoErr.message);
        } else {
          usoId = uso!.id as string;
        }
      }
      return { eventoId: data!.id as string, usoId };
    });

    const kbDeshacer = new InlineKeyboard().text(
      "↩️ Deshacer",
      `hato_ev_undo:${guardado.eventoId}:${guardado.usoId ?? "-"}`,
    );
    await ctx.reply(
      `✅ Registrado.\n\n${resumen}\n\nSi te equivocaste de vaca, usa Deshacer.\nUsa /start para volver al menú.`,
      { reply_markup: kbDeshacer, parse_mode: "Markdown" },
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Conversation already halted") return;
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("[Telegram] Evento hato conversation error:", msg);
    await ctx.reply(`Error registrando el evento: ${msg}\n\nUsa /start para volver al menú.`);
  }
}
