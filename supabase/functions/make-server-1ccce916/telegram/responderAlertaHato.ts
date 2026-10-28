// telegram/responderAlertaHato.ts — callback `hato_alerta:{id}:{si|no|otro}`.
//
// Issue #355. El handler de `bot.ts` solo arma el puerto de Telegram y
// delega acá, para que Vitest pueda correr el flujo sin grammy ni Deno.
// Este archivo no importa ni Deno ni grammy a propósito. Las dos copias
// del árbol de edge functions tienen que ser byte-idénticas.
//
// Contrato:
//   - Se reclama la alerta en pendiente, enviada O escalada. Si ya estaba
//     cerrada, no se vuelve a escribir el evento y se dice quién la cerró.
//   - `created_by` es `usuarios.id` resuelto con `resolverUsuarioTelegram`
//     a partir de `ctx.from.id`. Si no se resuelve, queda NULL y el motivo
//     va en la traza. Nunca se inventa un autor.
//   - Quien responde ve el texto "✅ Registrado: …" en SU mensaje (hora
//     Bogotá). Si Telegram rechaza la edición, se manda un mensaje nuevo.
//     Si el registro falla, se revierte el reclamo y se dice el error.
//   - Los demás destinatarios siguen viendo "Resuelto por X".
//   - Cada paso deja una fila en `hato_alertas_respuesta_trazas`. Un fallo
//     de esa escritura no puede tumbar el registro.
//   - La fecha del secado es el día del clic en Bogotá (UTC-5, sin DST),
//     nunca el día UTC del servidor.

import {
  construirMensajeAlertaYaResuelta,
  construirMensajeCierreAlertaBroadcast,
  construirMensajeConfirmacionRespuesta,
  efectoDominioRespuestaAlerta,
  estadoTrasRespuestaAlerta,
  payloadEventoSecadoDesdeAlerta,
  puedeResponderAlerta,
  type EstadoAlertaHato,
  type RespuestaAlertaHato,
  type TipoAlertaHato,
} from "../hato-alertas.ts";
import {
  resolverUsuarioTelegram,
  type ClienteConsultaTelegram,
} from "./resolverUsuarioTelegram.ts";

export const PASOS_TRAZA_RESPUESTA_ALERTA = [
  "callback_recibido",
  "usuario_resuelto",
  "alerta_encontrada",
  "alerta_cerrada",
  "evento_creado",
  "mensajes_editados",
  "confirmacion_enviada",
] as const;

export type PasoTrazaRespuestaAlerta = (typeof PASOS_TRAZA_RESPUESTA_ALERTA)[number];

const ESTADOS_ALERTA: readonly EstadoAlertaHato[] = [
  "pendiente",
  "enviada",
  "respondida",
  "confirmada",
  "descartada",
  "escalada",
  "expirada",
];

const TIPOS_ALERTA: readonly TipoAlertaHato[] = [
  "secado_due",
  "tratamiento_paso",
  "rechequeo_due",
  "servicio_sin_confirmacion",
  "parto_proximo",
];

/** Día y hora de pared en Bogotá (UTC-5, sin horario de verano).
 * El servidor Deno corre en UTC: a las 20:00 en la finca,
 * `toISOString().slice(0, 10)` ya es el día siguiente. */
export function calendarioBogota(instante: Date): { fecha: string; hora: string } {
  const bogota = new Date(instante.getTime() - 5 * 60 * 60 * 1000);
  const iso = bogota.toISOString();
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16) };
}

export interface ResultadoFila {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}

/** Cadena PostgREST mínima. El cliente de service role la cumple en
 * runtime; Vitest la mockea sin el SDK. */
export interface FiltroRespuestaAlerta {
  eq(columna: string, valor: string | number | boolean | null): FiltroRespuestaAlerta;
  in(columna: string, valores: readonly string[]): FiltroRespuestaAlerta;
  select(columnas: string): FiltroRespuestaAlerta;
  maybeSingle(): Promise<ResultadoFila>;
  then<TResult1 = ResultadoFila, TResult2 = never>(
    onfulfilled?: ((value: ResultadoFila) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}

export interface ClienteRespuestaAlerta {
  from(tabla: string): {
    select(columnas: string): FiltroRespuestaAlerta;
    update(cambios: Record<string, unknown>): FiltroRespuestaAlerta;
    insert(fila: Record<string, unknown>): FiltroRespuestaAlerta;
  };
}

export interface PuertoTelegramRespuesta {
  answer(texto: string): Promise<void>;
  editarTexto(texto: string): Promise<void>;
  enviarNuevo(texto: string): Promise<void>;
}

export interface EntradaRespuestaAlertaTelegram {
  cliente: ClienteRespuestaAlerta;
  puerto: PuertoTelegramRespuesta;
  alertaId: string;
  respuesta: RespuestaAlertaHato;
  telegramId: number | string | null;
  callbackData: string;
  updateId: number | null;
  ahora?: Date;
  cerrarOtros: (
    alertaId: string,
    excluirTelegramId: string | null,
    texto: string,
  ) => Promise<{ editados: number; fallidos: number }>;
}

function esEstado(valor: unknown): valor is EstadoAlertaHato {
  return typeof valor === "string" && (ESTADOS_ALERTA as readonly string[]).includes(valor);
}

function esTipo(valor: unknown): valor is TipoAlertaHato {
  return typeof valor === "string" && (TIPOS_ALERTA as readonly string[]).includes(valor);
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

function identidadAnimal(datos: unknown): { numero: number | null; nombre: string | null; mensaje: string } {
  const vacio = {
    numero: null as number | null,
    nombre: null as string | null,
    mensaje: "Alerta del hato lechero (sin mensaje generado).",
  };
  if (!datos || typeof datos !== "object") return vacio;
  const fila = datos as Record<string, unknown>;
  const numero = typeof fila.numero === "number" && Number.isFinite(fila.numero)
    ? fila.numero
    : typeof fila.numero === "string" && /^-?\d+$/.test(fila.numero.trim())
      ? Number(fila.numero.trim())
      : null;
  const nombre = typeof fila.nombre === "string" && fila.nombre.trim() !== "" ? fila.nombre.trim() : null;
  const mensaje = typeof fila.mensaje === "string" && fila.mensaje.trim() !== "" ? fila.mensaje : vacio.mensaje;
  return { numero, nombre, mensaje };
}

function mensajeErrorRegistro(que: "el secado" | "el paso" | "la respuesta", revertida: boolean): string {
  if (revertida) {
    return `No pude registrar ${que}. La alerta sigue abierta: vuelve a intentar.`;
  }
  return `No pude registrar ${que}. Avísale a gerencia antes de volver a tocar el botón.`;
}

function mensajeDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function procesarRespuestaAlertaTelegram(
  entrada: EntradaRespuestaAlertaTelegram,
): Promise<void> {
  const corridaId = crypto.randomUUID();
  const telegramIdTexto = entrada.telegramId == null || entrada.telegramId === ""
    ? null
    : String(entrada.telegramId);
  const escritos = new Set<PasoTrazaRespuestaAlerta>();

  async function trazar(
    paso: PasoTrazaRespuestaAlerta,
    estado: "ok" | "error",
    detalle: Record<string, unknown>,
  ): Promise<void> {
    if (escritos.has(paso)) return;
    escritos.add(paso);
    try {
      const resultado = await entrada.cliente.from("hato_alertas_respuesta_trazas").insert({
        corrida_id: corridaId,
        alerta_id: entrada.alertaId,
        paso,
        estado,
        detalle,
        telegram_id: telegramIdTexto,
        callback_data: entrada.callbackData,
        update_id: entrada.updateId,
      });
      if (resultado?.error) {
        console.error("[hato-alerta] traza:", resultado.error.message);
      }
    } catch (err) {
      console.error("[hato-alerta] traza:", mensajeDe(err));
    }
  }

  async function publicar(textoConfirmacion: string): Promise<void> {
    let via: "edit" | "mensaje_nuevo" = "edit";
    let errorEdicion: string | null = null;
    try {
      await entrada.puerto.editarTexto(textoConfirmacion);
    } catch (err) {
      errorEdicion = mensajeDe(err);
      try {
        await entrada.puerto.enviarNuevo(textoConfirmacion);
        via = "mensaje_nuevo";
      } catch (err2) {
        await trazar("confirmacion_enviada", "error", {
          via: "mensaje_nuevo",
          mensaje: mensajeDe(err2),
          error_edicion: errorEdicion,
        });
        try {
          await entrada.puerto.answer(textoConfirmacion.slice(0, 190));
        } catch (err3) {
          console.error("[hato-alerta] answerCallbackQuery:", mensajeDe(err3));
        }
        return;
      }
    }
    await trazar("confirmacion_enviada", "ok", {
      via,
      ...(errorEdicion ? { error_edicion: errorEdicion } : {}),
    });
    try {
      await entrada.puerto.answer(textoConfirmacion.slice(0, 190));
    } catch (err) {
      console.error("[hato-alerta] answerCallbackQuery:", mensajeDe(err));
    }
  }

  async function leerAlerta(): Promise<ResultadoFila> {
    return entrada.cliente
      .from("hato_alertas")
      .select("id, estado, tipo, animal_id, paso_id, datos, respuesta, respondida_por")
      .eq("id", entrada.alertaId)
      .maybeSingle();
  }

  try {
    await trazar("callback_recibido", "ok", {
      telegram_id: telegramIdTexto,
      callback_data: entrada.callbackData,
      update_id: entrada.updateId,
    });

    const resuelto = await resolverUsuarioTelegram(
      entrada.cliente as unknown as ClienteConsultaTelegram,
      entrada.telegramId,
    );
    let createdBy: string | null = null;
    let nombreDisplay: string | null = null;
    if (!resuelto.ok) {
      await trazar("usuario_resuelto", "error", { motivo: resuelto.motivo });
    } else if (!resuelto.usuarioId) {
      nombreDisplay = resuelto.nombreDisplay;
      await trazar("usuario_resuelto", "error", {
        motivo: "sin_usuario_id",
        usuario_id: null,
        nombre_display: nombreDisplay,
      });
    } else {
      createdBy = resuelto.usuarioId;
      nombreDisplay = resuelto.nombreDisplay;
      await trazar("usuario_resuelto", "ok", {
        usuario_id: createdBy,
        nombre_display: nombreDisplay,
      });
    }
    const respondidaPor = nombreDisplay?.trim() || telegramIdTexto || "desconocido";

    const calendario = calendarioBogota(entrada.ahora ?? new Date());
    const nuevoEstado = estadoTrasRespuestaAlerta(entrada.respuesta);

    let observada: Record<string, unknown> | null = null;
    let reclamada: Record<string, unknown> | null = null;
    let estadoAnterior: EstadoAlertaHato | null = null;

    for (let intento = 0; intento < 2 && !reclamada; intento++) {
      const leida = await leerAlerta();
      if (leida.error) {
        await trazar("alerta_encontrada", "error", { mensaje: leida.error.message });
        await trazar("alerta_cerrada", "error", { motivo: "lectura" });
        await trazar("evento_creado", "ok", { omitido: true, motivo: "lectura" });
        await trazar("mensajes_editados", "ok", { omitido: true, motivo: "lectura" });
        await publicar("No pude leer la alerta. Intenta de nuevo.");
        return;
      }
      if (!leida.data) {
        await trazar("alerta_encontrada", "error", { motivo: "no_existe" });
        await trazar("alerta_cerrada", "error", { motivo: "no_existe" });
        await trazar("evento_creado", "ok", { omitido: true, motivo: "no_existe" });
        await trazar("mensajes_editados", "ok", { omitido: true, motivo: "no_existe" });
        await publicar("No encontré esa alerta -- puede que ya no exista.");
        return;
      }
      observada = leida.data;
      const estado = esEstado(leida.data.estado) ? leida.data.estado : null;
      if (intento === 0) {
        await trazar("alerta_encontrada", "ok", { estado: leida.data.estado ?? null });
      }
      if (!estado || !puedeResponderAlerta(estado)) {
        const respuestaPrevia = texto(leida.data.respuesta);
        const respuestaConocida = respuestaPrevia === "si" || respuestaPrevia === "no" || respuestaPrevia === "otro"
          ? respuestaPrevia
          : null;
        await trazar("alerta_cerrada", "ok", {
          resultado: "ya_resuelta",
          estado: leida.data.estado ?? null,
          respondida_por: texto(leida.data.respondida_por),
          respuesta: respuestaConocida,
        });
        await trazar("evento_creado", "ok", { omitido: true, motivo: "ya_resuelta" });
        await trazar("mensajes_editados", "ok", { omitido: true, motivo: "ya_resuelta" });
        await publicar(construirMensajeAlertaYaResuelta(
          estado ?? "respondida",
          texto(leida.data.respondida_por),
          respuestaConocida,
        ));
        return;
      }

      estadoAnterior = estado;
      const claim = await entrada.cliente
        .from("hato_alertas")
        .update({
          estado: nuevoEstado,
          respuesta: entrada.respuesta,
          respondida_por: respondidaPor,
        })
        .eq("id", entrada.alertaId)
        .eq("estado", estado)
        .select("id, tipo, animal_id, paso_id, datos")
        .maybeSingle();
      if (claim.error) {
        await trazar("alerta_cerrada", "error", { mensaje: claim.error.message });
        await trazar("evento_creado", "ok", { omitido: true, motivo: "reclamo" });
        await trazar("mensajes_editados", "ok", { omitido: true, motivo: "reclamo" });
        await publicar("No pude guardar tu respuesta. Intenta de nuevo.");
        return;
      }
      if (claim.data) reclamada = claim.data;
    }

    if (!reclamada || !estadoAnterior) {
      await trazar("alerta_cerrada", "error", { motivo: "no_se_pudo_reclamar" });
      await trazar("evento_creado", "ok", { omitido: true, motivo: "no_se_pudo_reclamar" });
      await trazar("mensajes_editados", "ok", { omitido: true, motivo: "no_se_pudo_reclamar" });
      await publicar("No pude guardar tu respuesta. Intenta de nuevo.");
      return;
    }

    await trazar("alerta_cerrada", "ok", {
      estado_anterior: estadoAnterior,
      estado_nuevo: nuevoEstado,
      respuesta: entrada.respuesta,
    });

    const fila = reclamada.datos != null ? reclamada : (observada ?? reclamada);
    const tipo = esTipo(reclamada.tipo) ? reclamada.tipo : esTipo(observada?.tipo) ? observada.tipo : null;
    const animalId = texto(reclamada.animal_id) ?? texto(observada?.animal_id);
    const pasoId = texto(reclamada.paso_id) ?? texto(observada?.paso_id);
    const efecto = tipo
      ? efectoDominioRespuestaAlerta(
        { tipo, animal_id: animalId, paso_id: pasoId },
        entrada.respuesta,
      )
      : { kind: "ninguno" as const };
    const identidad = identidadAnimal(fila.datos ?? observada?.datos);

    async function revertirReclamo(): Promise<boolean> {
      try {
        const revertido = await entrada.cliente
          .from("hato_alertas")
          .update({
            estado: estadoAnterior,
            respuesta: null,
            respondida_por: null,
          })
          .eq("id", entrada.alertaId)
          .eq("estado", nuevoEstado)
          .select("id")
          .maybeSingle();
        return !revertido?.error && revertido?.data != null;
      } catch (err) {
        console.error("[hato-alerta] revertir reclamo:", mensajeDe(err));
        return false;
      }
    }

    if (efecto.kind === "secado_real") {
      const insertado = await entrada.cliente
        .from("hato_eventos")
        .insert(payloadEventoSecadoDesdeAlerta(
          efecto.animal_id,
          entrada.alertaId,
          calendario.fecha,
          createdBy,
        ))
        .select("id")
        .maybeSingle();
      if (insertado.error || !insertado.data?.id) {
        const revertida = await revertirReclamo();
        await trazar("evento_creado", "error", {
          mensaje: insertado.error?.message ?? "el insert no devolvió id",
          revertida,
        });
        await trazar("mensajes_editados", "ok", { omitido: true, motivo: "registro_fallido" });
        await publicar(mensajeErrorRegistro("el secado", revertida));
        return;
      }
      await trazar("evento_creado", "ok", { evento_id: insertado.data.id });
    } else if (efecto.kind === "tratamiento_paso") {
      let errorPaso: { message: string } | null = null;
      try {
        const actualizado = await entrada.cliente
          .from("hato_tratamiento_pasos")
          .update({ fecha_ejecutada: calendario.fecha })
          .eq("id", efecto.paso_id);
        errorPaso = actualizado?.error ?? null;
      } catch (err) {
        errorPaso = { message: mensajeDe(err) };
      }
      if (errorPaso) {
        const revertida = await revertirReclamo();
        await trazar("evento_creado", "error", { mensaje: errorPaso.message, revertida });
        await trazar("mensajes_editados", "ok", { omitido: true, motivo: "registro_fallido" });
        await publicar(mensajeErrorRegistro("el paso", revertida));
        return;
      }
      await trazar("evento_creado", "ok", { paso_id: efecto.paso_id, fecha: calendario.fecha });
    } else {
      await trazar("evento_creado", "ok", { omitido: true, motivo: "respuesta_sin_evento" });
    }

    const etiquetaEfecto = efecto.kind === "secado_real"
      ? "secado"
      : efecto.kind === "tratamiento_paso"
        ? "tratamiento"
        : "ninguno";
    try {
      const cierre = await entrada.cerrarOtros(
        entrada.alertaId,
        telegramIdTexto,
        construirMensajeCierreAlertaBroadcast(
          identidad.mensaje,
          respondidaPor,
          entrada.respuesta,
        ),
      );
      await trazar("mensajes_editados", "ok", {
        editados: cierre.editados,
        fallidos: cierre.fallidos,
      });
    } catch (err) {
      await trazar("mensajes_editados", "error", { mensaje: mensajeDe(err) });
    }

    await publicar(construirMensajeConfirmacionRespuesta({
      respuesta: entrada.respuesta,
      numero: identidad.numero,
      nombre: identidad.nombre,
      fechaIso: calendario.fecha,
      hora: calendario.hora,
      efecto: etiquetaEfecto,
    }));
  } catch (err) {
    console.error("[hato-alerta] callback:", mensajeDe(err));
    try {
      await entrada.puerto.answer("No pude guardar tu respuesta. Intenta de nuevo.");
    } catch (err2) {
      console.error("[hato-alerta] answerCallbackQuery:", mensajeDe(err2));
    }
  }
}
