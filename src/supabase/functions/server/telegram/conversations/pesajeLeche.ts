import {beginNativePhoto,nativePhoto,renderNativePhoto} from '../milkPhoto.ts';
import {downloadNativePhoto,nativePhotoOCR} from '../../hato-pesaje-telegram.ts';
// Shared photo OCR/natural-language corrections produce a proposal only.
// The final handoff prepares a source-bound native milk review in an outside
// context. A separate original-private-message confirmation posts the accepted
// selection atomically; session-independent recovery never repeats OCR or writes.
// Photo bytes stay inside conversation.external; only JSON proposals are replayed.
import {beginMilk,nativeMilkSource,milkAction} from '../milkWeighing.ts';
import { Conversation } from "npm:@grammyjs/conversations@2";
import { InlineKeyboard } from "npm:grammy@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { BotContext } from "../types.ts";
import {
  llamarModeloCorreccionPesaje,
  MAXIMO_FOTOS_PESAJE,
  TIPOS_ACEPTADOS_FOTO_PESAJE,
  type CeldaCommitPesajeEntrada,
  type PipelinePesajeFotoResultado,
} from "../../hato-pesaje-pipeline.ts";
import {
  construirFilasPesajeInsertables,
  construirRosterPesaje,
  SEMANAS_PESAJE,
  type CeldaDiffPesaje,
  type SemanaPesaje,
} from "../../importHato/ocrPesaje.ts";
import { aplicarCorreccionesADiff, interpretarCorreccionPesaje } from "../../importHato/ocrPesajeCorreccion.ts";
import {
  exigirUsuarioIdVinculado,
  mensajeResolverUsuarioTelegram,
  resolverUsuarioTelegram,
} from "../resolverUsuarioTelegram.ts";

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** "Hoy" en Bogotá (UTC-5), no en UTC -- mismo criterio que `eventoHato.ts`. */
function hoyBogota(): string {
  const ahora = new Date();
  const bogota = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  return bogota.toISOString().slice(0, 10);
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function nombreMes(mes: number): string {
  return MESES[mes - 1] ?? String(mes);
}

/** Reconoce la cancelación escrita a mano -- el `/cancelar` global NUNCA se
 * dispara mientras esta conversación está activa (ver cabecera del
 * archivo). Se comprueba en TODOS los pasos que esperan texto o foto. */
function esCancelacionTexto(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return t === "cancelar" || t === "/cancelar";
}

function esConfirmacionGuardar(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return t === "ok" || t === "listo" || t === "guardar" || t === "si" || t === "sí";
}

/** "MM/AAAA" o "MM-AAAA" -- formato numérico simple, sin adivinar nada que
 * el usuario no haya escrito (mismo criterio que `parseDDMM` de
 * `eventoHato.ts`). */
function parseMesAnio(texto: string): { anio: number; mes: number } | null {
  const m = texto.trim().match(/^(\d{1,2})[/\-](\d{4})$/);
  if (!m) return null;
  const mes = parseInt(m[1], 10);
  const anio = parseInt(m[2], 10);
  if (mes < 1 || mes > 12 || anio < 2020 || anio > 2100) return null;
  return { anio, mes };
}

function partirTexto(texto: string, maximo = 3500): string[] {
  if (texto.length <= maximo) return [texto];
  const lineas = texto.split("\n");
  const partes: string[] = [];
  let actual = "";
  for (const linea of lineas) {
    if (actual && (actual + "\n" + linea).length > maximo) {
      partes.push(actual);
      actual = linea;
    } else {
      actual = actual ? `${actual}\n${linea}` : linea;
    }
  }
  if (actual) partes.push(actual);
  return partes;
}

/** Resumen en texto plano de la lectura -- lo que Fernando ve para corregir
 * o confirmar (D-C). Agrupado por vaca, en orden alfabético; solo aparecen
 * las vacas que SÍ se leyeron en alguna foto (`diff` viene de
 * `ocr.filasConfirmadas`) -- las que faltaron van aparte, en
 * `vacasSinLeer`. `—` para "sin dato", nunca 0 (regla del módulo). */
function construirResumenPesajeTexto(diff: readonly CeldaDiffPesaje[]): string {
  if (diff.length === 0) return "(ninguna vaca se pudo leer)";
  const porAnimal = new Map<string, { nombre: string; celdas: Map<SemanaPesaje, CeldaDiffPesaje> }>();
  for (const c of diff) {
    if (!porAnimal.has(c.animalId)) porAnimal.set(c.animalId, { nombre: c.nombre, celdas: new Map() });
    porAnimal.get(c.animalId)!.celdas.set(c.semana, c);
  }
  const filas = [...porAnimal.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  return filas
    .map(({ nombre, celdas }) => {
      const partes = SEMANAS_PESAJE.filter((s) => celdas.has(s)).map((s) => {
        const c = celdas.get(s)!;
        const am = c.litrosAm ?? "—";
        const pm = c.litrosPm ?? "—";
        return `S${s}:${am}/${pm}`;
      });
      return `• ${nombre} — ${partes.join("  ")}`;
    })
    .join("\n");
}

function construirAdvertenciasLectura(resultado: PipelinePesajeFotoResultado): string[] {
  const advertencias: string[] = [];
  if (resultado.ocr.filasNoLeidas.length > 0) {
    const lista = resultado.ocr.filasNoLeidas
      .slice(0, 10)
      .map((f) => `"${f.nombreImpreso || "(sin nombre)"}"`)
      .join(", ");
    advertencias.push(
      `⚠️ ${resultado.ocr.filasNoLeidas.length} fila(s) no se pudieron identificar: ${lista}${
        resultado.ocr.filasNoLeidas.length > 10 ? "…" : ""
      }`,
    );
  }
  if (resultado.ocr.vacasSinLeer.length > 0) {
    const lista = resultado.ocr.vacasSinLeer.slice(0, 15).map((v) => v.nombre).join(", ");
    advertencias.push(
      `⚠️ ${resultado.ocr.vacasSinLeer.length} vaca(s) no aparecen en ninguna foto: ${lista}${
        resultado.ocr.vacasSinLeer.length > 15 ? "…" : ""
      }`,
    );
  }
  if (resultado.ocr.paginasNoLeidas.length > 0) {
    advertencias.push(`⚠️ ${resultado.ocr.paginasNoLeidas.length} foto(s) no se pudieron leer.`);
  }
  return advertencias;
}

interface OpcionesEnvio {
  reply_markup?: InlineKeyboard;
  parse_mode?: "Markdown";
}

async function enviarPorPartes(ctx: BotContext, texto: string, opciones?: OpcionesEnvio) {
  const partes = partirTexto(texto);
  for (let i = 0; i < partes.length; i++) {
    await ctx.reply(partes[i], i === partes.length - 1 ? opciones : undefined);
  }
}

// ============================================================================
// Descarga de fotos de Telegram (SIEMPRE dentro de un solo `external()` junto
// al pipeline -- ver regla 1 de la cabecera: los bytes nunca salen solos de
// un `external()`).
// ============================================================================

interface FotoTelegramReferencia {
  fileId: string;
  tipo: string;
  nombre: string;
}

// ============================================================================
// Conversación
// ============================================================================

export async function pesajeLecheConversation(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
) {
  // NUNCA `ctx.telegramUser?.usuario_id` -- flavor propio que conversations@2
  // no lleva al replay (issue #273: Fernando, vinculado, veía "no vinculada"
  // el 2026-09-19). Se reconsulta `telegram_usuarios` por `ctx.from.id`
  // (nativo de grammY) dentro de `external()`, cuyo resultado sí sobrevive.
  const resuelto = await conversation.external(async () =>
    resolverUsuarioTelegram(getSupabaseAdmin(), ctx.from?.id),
  );
  const atribucion = exigirUsuarioIdVinculado(resuelto);

  try {
    if (!atribucion.ok) {
      await ctx.reply(
        mensajeResolverUsuarioTelegram(atribucion.motivo, "registrar un pesaje"),
      );
      return;
    }
    const usuarioId = atribucion.usuarioId;

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      await ctx.reply("La lectura por foto no está disponible ahora mismo (falta configuración del servidor). Avisa a un administrador.");
      return;
    }
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

    // ── Paso 1: ¿qué mes es la planilla? ──────────────────────────────
    const hoy = hoyBogota();
    const anioActual = Number(hoy.slice(0, 4));
    const mesActual = Number(hoy.slice(5, 7));

    const kbMes = new InlineKeyboard()
      .text(`✅ ${nombreMes(mesActual)} ${anioActual}`, "mes_actual")
      .row()
      .text("📅 Otro mes", "mes_otro")
      .text("❌ Cancelar", "cancel_flow");
    await ctx.reply(
      "🐄 *Pesaje de leche -- carga por foto*\n\n¿La planilla que vas a fotografiar es de qué mes?",
      { reply_markup: kbMes, parse_mode: "Markdown" },
    );

    let anio = anioActual;
    let mes = mesActual;
    while (true) {
      const respuesta = await conversation.wait();

      if (respuesta.callbackQuery?.data === "cancel_flow") {
        await respuesta.answerCallbackQuery();
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }
      if (respuesta.callbackQuery?.data === "mes_actual") {
        await respuesta.answerCallbackQuery();
        await respuesta.editMessageText(`📅 Mes: ${nombreMes(mesActual)} ${anioActual}`);
        break;
      }
      if (respuesta.callbackQuery?.data === "mes_otro") {
        await respuesta.answerCallbackQuery();
        await respuesta.editMessageText("📅 Escribe el mes como MM/AAAA (ej: 08/2026), o *cancelar*.", {
          parse_mode: "Markdown",
        });
        continue;
      }
      const texto = respuesta.message?.text;
      if (texto) {
        if (esCancelacionTexto(texto)) {
          await ctx.reply("Operación cancelada.");
          return conversation.halt();
        }
        const parsed = parseMesAnio(texto);
        if (parsed) {
          anio = parsed.anio;
          mes = parsed.mes;
          await ctx.reply(`📅 Mes: ${nombreMes(mes)} ${anio}`);
          break;
        }
        await ctx.reply("Formato inválido. Escribe MM/AAAA (ej: 08/2026), o *cancelar*.", { parse_mode: "Markdown" });
        continue;
      }
      // callback/mensaje no reconocido -- se ignora, se sigue esperando.
    }

    // ── Paso 2: recolectar 1..6 fotos ─────────────────────────────────
    const fotos: FotoTelegramReferencia[] = [];
    const kbFotos = new InlineKeyboard()
      .text("✅ Listo", "fotos_listo")
      .text("❌ Cancelar", "cancel_flow");
    await ctx.reply(
      `📸 Envía las fotos de la planilla de *${nombreMes(mes)} ${anio}* (1 a ${MAXIMO_FOTOS_PESAJE}, puede ser por franjas si no cabe en una toma). Cuando termines, toca *Listo*.`,
      { reply_markup: kbFotos, parse_mode: "Markdown" },
    );

    while (true) {
      const respuesta = await conversation.wait();

      if (respuesta.callbackQuery?.data === "cancel_flow") {
        await respuesta.answerCallbackQuery();
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }
      if (respuesta.callbackQuery?.data === "fotos_listo") {
        await respuesta.answerCallbackQuery();
        if (fotos.length === 0) {
          await ctx.reply("Todavía no recibí ninguna foto. Envía al menos una, o toca Cancelar.");
          continue;
        }
        break;
      }

      const texto = respuesta.message?.text;
      if (texto && esCancelacionTexto(texto)) {
        await ctx.reply("Operación cancelada.");
        return conversation.halt();
      }

      const photoSizes = respuesta.message?.photo;
      if (photoSizes && photoSizes.length > 0) {
        if (fotos.length >= MAXIMO_FOTOS_PESAJE) {
          await ctx.reply(`Ya tengo ${MAXIMO_FOTOS_PESAJE} fotos, el máximo. Toca Listo para continuar.`);
          continue;
        }
        const masGrande = photoSizes[photoSizes.length - 1];
        fotos.push({ fileId: masGrande.file_id, tipo: "image/jpeg", nombre: `foto-${fotos.length + 1}.jpg` });
        await ctx.reply(`📸 Foto ${fotos.length} recibida. Envía otra o toca Listo.`);
        continue;
      }

      const documento = respuesta.message?.document;
      if (documento) {
        const tipo = (documento.mime_type ?? "").toLowerCase();
        if (!TIPOS_ACEPTADOS_FOTO_PESAJE.has(tipo)) {
          await ctx.reply(
            `Ese archivo es de tipo '${documento.mime_type ?? "desconocido"}'. Envía JPEG, PNG, WEBP o HEIC, o toca Listo/Cancelar.`,
          );
          continue;
        }
        if (fotos.length >= MAXIMO_FOTOS_PESAJE) {
          await ctx.reply(`Ya tengo ${MAXIMO_FOTOS_PESAJE} fotos, el máximo. Toca Listo para continuar.`);
          continue;
        }
        fotos.push({ fileId: documento.file_id, tipo, nombre: documento.file_name ?? `foto-${fotos.length + 1}` });
        await ctx.reply(`📸 Foto ${fotos.length} recibida. Envía otra o toca Listo.`);
        continue;
      }

      await ctx.reply("No entendí. Envía una foto de la planilla, toca Listo, o escribe cancelar.");
    }

    // ── Paso 3: descargar + correr el pipeline (N11) ──────────────────
    await ctx.replyWithChatAction("upload_photo");
    let anioFinal = anio;
    let mesFinal = mes;
    const retained = await conversation.external(async outside => {
      const sb=getSupabaseAdmin(),existing=await nativePhoto(sb,milkAction(outside),'recover');
      if(existing.result){await renderNativePhoto(outside,existing);return existing;}
      const photos=[];
      for(const foto of fotos)photos.push({bytes:await downloadNativePhoto(foto.fileId,botToken),mime:foto.tipo});
      return beginNativePhoto(outside,sb,{year:anioFinal,month:mesFinal,photos},v=>nativePhotoOCR(sb,v));
    });
    const lectura=retained?.result?.preview?.outcome as {ok:false;error:string}|{ok:true;resultado:PipelinePesajeFotoResultado}|undefined;
    if(!lectura){await ctx.reply('Consulte el mensaje original de las fotos. No vuelva a enviarlas.');return;}

    if (!lectura.ok) {
      await ctx.reply(`❌ No se pudo leer la planilla: ${lectura.error}\n\nConsulte y cierre explícitamente la lectura original antes de otra carga.`);
      return;
    }

    anioFinal=lectura.resultado.anio;mesFinal=lectura.resultado.mes;
    const roster = construirRosterPesaje(lectura.resultado.rosterAnimales);
    const fechasPorSemana = lectura.resultado.fechasPorSemana;
    let diffActual = lectura.resultado.diff;

    // ── Paso 4/5: mostrar resumen + loop de corrección en texto libre (N12,
    //    decisión D-C) hasta un "ok" explícito. Nada se escribe antes. ─────
    const kbGuardar = new InlineKeyboard()
      .text("Revisar antes de guardar", "guardar_pesaje")
      .text("❌ Cancelar", "cancel_flow");

    const advertenciasIniciales = construirAdvertenciasLectura(lectura.resultado);
    await enviarPorPartes(
      ctx,
      [
        `📋 *Lectura de la planilla -- ${nombreMes(mesFinal)} ${anioFinal}*`,
        "",
        construirResumenPesajeTexto(diffActual),
        ...(advertenciasIniciales.length > 0 ? ["", ...advertenciasIniciales] : []),
        "",
        'Escribe correcciones en lenguaje natural (ej: "MONZA sem 2 AM son 6.5" o "BONITA no se pesó"), o toca *Guardar* cuando esté bien.',
      ].join("\n"),
      { reply_markup: kbGuardar, parse_mode: "Markdown" },
    );

    while (true) {
      const respuesta = await conversation.wait();

      if (respuesta.callbackQuery?.data === "cancel_flow") {
        await respuesta.answerCallbackQuery();
        await ctx.reply("Operación cancelada -- nada se guardó.");
        return conversation.halt();
      }
      if (respuesta.callbackQuery?.data === "guardar_pesaje") {
        await respuesta.answerCallbackQuery();
        break;
      }

      const texto = respuesta.message?.text;
      if (!texto) {
        await ctx.reply('No entendí. Escribe una corrección, "ok" para guardar, o toca los botones de arriba.');
        continue;
      }
      if (esCancelacionTexto(texto)) {
        await ctx.reply("Operación cancelada -- nada se guardó.");
        return conversation.halt();
      }
      if (esConfirmacionGuardar(texto)) break;

      // ── Interpretar la corrección: llamada al modelo (N12) + validación
      //    PURA contra el roster y la grilla de semanas del mes. ──────────
      await ctx.replyWithChatAction("typing");
      const interpretacion = await conversation.external(() => llamarModeloCorreccionPesaje(texto, apiKey));

      if (!interpretacion.ok) {
        await ctx.reply(`No pude interpretar eso: ${interpretacion.error}\n\nIntenta de nuevo, o toca Guardar/Cancelar.`);
        continue;
      }

      const { aplicables, noEntendidas } = interpretarCorreccionPesaje(interpretacion.items, roster, fechasPorSemana);

      if (aplicables.length === 0 && noEntendidas.length === 0) {
        await ctx.reply('No encontré ninguna corrección en ese mensaje. Intenta de nuevo, o escribe "ok" para guardar.');
        continue;
      }

      diffActual = aplicarCorreccionesADiff(diffActual, aplicables);

      const bloques = [
        aplicables.length > 0 ? `✏️ Apliqué ${aplicables.length} corrección(es).` : null,
        noEntendidas.length > 0
          ? `⚠️ No entendí ${noEntendidas.length}:\n${noEntendidas.map((n) => `  - "${n.nombreMencionado}": ${n.detalle}`).join("\n")}`
          : null,
        "",
        "📋 *Resumen actualizado*",
        construirResumenPesajeTexto(diffActual),
      ].filter((b): b is string => b !== null);

      await enviarPorPartes(ctx, bloques.join("\n"), { reply_markup: kbGuardar, parse_mode: "Markdown" });
    }

    // ── Paso 6: commit por celda (N13) ────────────────────────────────
    const celdasParaGuardar: CeldaCommitPesajeEntrada[] = construirFilasPesajeInsertables(diffActual).map((f) => ({
      animalId: f.animal_id,
      fecha: f.fecha,
      litrosAm: f.litros_am,
      litrosPm: f.litros_pm,
    }));

    if (celdasParaGuardar.length === 0) {
      await ctx.reply("No hay ninguna celda con datos para guardar (todo quedó en 'sin dato'). No se escribió nada.");
      return;
    }

    await conversation.external(async outside=>{
      const sb=getSupabaseAdmin(),source=await nativeMilkSource(sb,milkAction(outside));
      return beginMilk(outside,sb,{version:1,year:anioFinal,month:mesFinal,captureId:lectura.resultado.capturaId??null,cells:celdasParaGuardar.map(c=>({animalId:c.animalId,date:c.fecha,am:c.litrosAm,pm:c.litrosPm,observed:source.rows.find(r=>r.animal_id===c.animalId&&r.fecha===c.fecha)??null}))});
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Conversation already halted") return;
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("[Telegram] Pesaje leche conversation error:", msg);
    await ctx.reply(`Error en el registro de pesaje: ${msg}\n\nUsa /start para volver al menú.`);
  }
}
