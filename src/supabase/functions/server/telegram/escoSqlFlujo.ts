import {
  exigirConfiguracionEscoSql,
  historialEscoSql,
  idTurnoTelegramSql,
  seleccionarMotorTelegram,
  solicitarEscoSql,
} from "./escoSqlCliente.ts";
import {
  type BotonSql,
  consumirBotonSql,
  crearBotonesSql,
  type EstadoBotonesSql,
} from "./escoSqlSesion.ts";
import {
  csvTablaSql,
  enviarHtmlSql,
  planRespuestaSql,
  textoConsultasSql,
  textoHtmlSql,
} from "./escoSqlRender.ts";
import type { Bloque, RespuestaTelegramSql } from "./escoSqlContrato.ts";
interface MensajeEnviado {
  message_id: number;
}
export interface ContextoFlujoSql {
  from?: {
    id: number;
  };
  chat?: {
    id: number;
  };
  session: {
    escoSql?: EstadoBotonesSql;
  };
  callbackQuery?: {
    data?: string;
    message?: {
      message_id: number;
    };
  };
  reply: (texto: string, extra?: {
    parse_mode: "HTML";
  }) => Promise<MensajeEnviado>;
  replyWithChatAction: (accion: "typing") => Promise<unknown>;
  answerCallbackQuery?: () => Promise<unknown>;
  api: {
    editMessageReplyMarkup: (chatId: number, messageId: number, extra: {
      reply_markup: {
        inline_keyboard: BotonSql[][];
      };
    }) => Promise<unknown>;
  };
}
interface ActorSql {
  usuarioId: string;
  filaId: string;
}
export interface DependenciasFlujoSql {
  env: (nombre: string) => string | undefined;
  resolverActor: (telegramId: number) => Promise<ActorSql | null>;
  autorizarActor: (telegramId: number, actor: ActorSql) => Promise<boolean>;
  crearConversacion: (usuarioId: string) => Promise<string>;
  leerHistorial: (conversationId: string) => Promise<unknown[]>;
  guardarMensaje: (
    conversationId: string,
    role: string,
    content: string,
    metadata: Record<string, unknown>,
    id: string,
  ) => Promise<unknown>;
  consultar?: typeof solicitarEscoSql;
  enviarDocumento: (
    ctx: ContextoFlujoSql,
    bytes: Uint8Array,
    nombre: string,
  ) => Promise<MensajeEnviado>;
  enviarFoto: (
    ctx: ContextoFlujoSql,
    bytes: Uint8Array,
    nombre: string,
    titulo: string,
  ) => Promise<MensajeEnviado>;
  renderizarPng: (
    bloque: Extract<Bloque, {
      tipo: "grafica";
    }>,
  ) => Promise<Uint8Array>;
  registrar?: (codigo: string) => void;
}
function configuracion(deps: DependenciasFlujoSql) {
  return {
    url: deps.env("SUPABASE_URL"),
    credencialServicio: deps.env("SUPABASE_SERVICE_ROLE_KEY"),
    secreto: deps.env("ESCO_TELEGRAM_SECRET"),
  };
}
async function autorizar(
  ctx: ContextoFlujoSql,
  deps: DependenciasFlujoSql,
): Promise<ActorSql | null> {
  if (!ctx.from || !ctx.chat) {
    return null;
  }
  const actor = await deps.resolverActor(ctx.from.id);
  if (!actor || !await deps.autorizarActor(ctx.from.id, actor)) {
    return null;
  }
  return actor;
}
async function enviarResultado(
  ctx: ContextoFlujoSql,
  deps: DependenciasFlujoSql,
  r: RespuestaTelegramSql,
): Promise<number> {
  let last = 0;
  for (const op of planRespuestaSql(r)) {
    if (op.tipo === "mensaje") {
      last = (await enviarHtmlSql(ctx, op)).message_id;
      continue;
    }
    if (op.tipo === "documento") {
      last = (await deps.enviarDocumento(ctx, op.bytes, op.nombre)).message_id;
      continue;
    }
    let png: Uint8Array | null = null;
    try {
      png = await deps.renderizarPng(op.bloque);
    } catch {
      deps.registrar?.("ESCO_SQL_PNG_FAILED");
    }
    if (png) {
      last = (await deps.enviarFoto(
        ctx,
        png,
        `esco-grafica-${op.bloque.consulta}.png`,
        op.bloque.titulo,
      )).message_id;
    } else {
      for (
        const mensaje of textoHtmlSql(
          "No pude dibujar la gráfica. Adjunto sus datos disponibles en un archivo CSV.",
        )
      ) {
        last = (await enviarHtmlSql(ctx, mensaje)).message_id;
      }
      const b = op.bloque;
      const bytes = csvTablaSql({
        tipo: "tabla",
        titulo: b.titulo,
        consulta: b.consulta,
        truncado: b.truncado,
        columnas: [
          { columna: b.x, etiqueta: b.x, formato: "texto" },
          ...b.y.map((columna) => ({
            columna,
            etiqueta: columna,
            formato: b.formato,
          })),
        ],
        filas: b.datos,
        total_filas: b.datos.length,
      });
      last = (await deps.enviarDocumento(
        ctx,
        bytes,
        `esco-grafica-${b.consulta}.csv`,
      )).message_id;
    }
    if (op.bloque.aviso) {
      for (const mensaje of textoHtmlSql(op.bloque.aviso)) {
        last = (await enviarHtmlSql(ctx, mensaje)).message_id;
      }
    }
  }
  if (!last) {
    last =
      (await ctx.reply("El motor no devolvió texto ni visuales.")).message_id;
  }
  return last;
}
export async function manejarPreguntaTelegramSql(
  ctx: ContextoFlujoSql,
  deps: DependenciasFlujoSql,
  pregunta: string,
  origen: string,
): Promise<void> {
  try {
    const config = configuracion(deps);
    try {
      exigirConfiguracionEscoSql(config);
    } catch {
      await ctx.reply(
        "La puerta SQL de Telegram no está configurada. Avisa a un administrador.",
      );
      return;
    }
    const actor = await autorizar(ctx, deps);
    if (!actor) {
      await ctx.reply(
        "No tienes acceso a consultas SQL. Se requiere una cuenta vinculada de Gerencia activa y el módulo consultas.",
      );
      return;
    }
    if (!pregunta.trim() || pregunta.length > 1000) {
      await ctx.reply("Escribe una pregunta de hasta 1000 caracteres.");
      return;
    }
    await ctx.replyWithChatAction("typing");
    const conversationId = await deps.crearConversacion(actor.usuarioId);
    const historial = historialEscoSql(
      await deps.leerHistorial(conversationId),
    );
    const id = await idTurnoTelegramSql(
      actor.usuarioId,
      String(ctx.chat!.id),
      origen,
    );
    // La PK compartida corta reentregas/concurrencia antes de cualquier llamada pagada.
    await deps.guardarMensaje(conversationId, "user", pregunta, {
      motor: "sql",
    }, id);
    const r = await (deps.consultar ?? solicitarEscoSql)({
      ...config,
      usuarioId: actor.usuarioId,
      pregunta,
      historial,
    });
    await deps.guardarMensaje(
      conversationId,
      "assistant",
      r.texto,
      { ...r, motor: "sql", snapshot_at: new Date().toISOString() },
      await idTurnoTelegramSql(
        actor.usuarioId,
        String(ctx.chat!.id),
        origen + ":assistant",
      ),
    );
    const messageId = await enviarResultado(ctx, deps, r);
    const opciones = r.aclaracion?.opciones.length
      ? r.aclaracion.opciones
      : r.sugerencias;
    const creado = crearBotonesSql(ctx.session.escoSql, {
      usuarioId: actor.usuarioId,
      telegramId: ctx.from!.id,
      chatId: ctx.chat!.id,
      messageId,
      opciones,
      consultas: r.consultas,
    });
    ctx.session.escoSql = creado.estado;
    if (creado.botones.length) {
      await ctx.api.editMessageReplyMarkup(ctx.chat!.id, messageId, {
        reply_markup: { inline_keyboard: creado.botones.map((b) => [b]) },
      });
    }
  } catch {
    deps.registrar?.("ESCO_SQL_TURN_FAILED");
    await ctx.reply(
      "No pude completar o entregar la consulta SQL. Intenta de nuevo más tarde.",
    );
  }
}
export async function manejarCallbackTelegramSql(
  ctx: ContextoFlujoSql,
  deps: DependenciasFlujoSql,
): Promise<void> {
  await ctx.answerCallbackQuery?.();
  try {
    if (!seleccionarMotorTelegram(deps.env("ESCO_MOTOR_TELEGRAM"))) {
      await ctx.reply(
        "Esa sugerencia ya no está disponible, escribe la pregunta.",
      );
      return;
    }
    const config = configuracion(deps);
    try {
      exigirConfiguracionEscoSql(config);
    } catch {
      await ctx.reply(
        "La puerta SQL de Telegram no está configurada. Avisa a un administrador.",
      );
      return;
    }
    const actor = await autorizar(ctx, deps);
    if (!actor) {
      await ctx.reply("No tienes acceso a consultas SQL.");
      return;
    }
    const messageId = ctx.callbackQuery?.message?.message_id;
    const data = ctx.callbackQuery?.data;
    const accion = ctx.chat && ctx.from && messageId && data
      ? consumirBotonSql(ctx.session.escoSql, data, {
        usuarioId: actor.usuarioId,
        telegramId: ctx.from.id,
        chatId: ctx.chat.id,
        messageId,
      })
      : null;
    if (!accion) {
      await ctx.reply(
        "Esa sugerencia ya no está disponible, escribe la pregunta.",
      );
      return;
    }
    if (accion.tipo === "consultas") {
      for (const mensaje of textoConsultasSql(accion.consultas)) {
        await enviarHtmlSql(ctx, mensaje);
      }
      return;
    }
    await manejarPreguntaTelegramSql(
      ctx,
      deps,
      accion.texto,
      `callback:${data}`,
    );
  } catch {
    deps.registrar?.("ESCO_SQL_CALLBACK_FAILED");
    await ctx.reply("No pude atender ese botón. Escribe la pregunta de nuevo.");
  }
}
