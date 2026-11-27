import { describe, expect, it, vi } from "vitest";
import {
  manejarCallbackTelegramSql,
  manejarPreguntaTelegramSql,
} from "../supabase/functions/server/telegram/escoSqlFlujo.ts";

// ESCO-185: la conversación de contexto se borró desde el historial web.
// Sigue fallando cerrado (no se crea otra en silencio), pero la respuesta
// tiene que decir cómo salir: /esco_nueva.
function fixture(codigo: string) {
  const ctx = {
    from: { id: 123 },
    chat: { id: 123 },
    session: {},
    callbackQuery: { data: "esco_sql:x", message: { message_id: 8 } },
    answerCallbackQuery: vi.fn(async () => {}),
    reply: vi.fn(async (..._args: unknown[]) => ({ message_id: 8 })),
    replyWithChatAction: vi.fn(async () => {}),
    api: { editMessageReplyMarkup: vi.fn(async () => {}) },
  };
  const deps = {
    env: (k: string) =>
      k === "ESCO_MOTOR_TELEGRAM" ? "sql" : "https://synthetic.invalid",
    resolverActor: vi.fn(async () => ({
      usuarioId: "11111111-1111-4111-8111-111111111111",
      filaId: "actor",
    })),
    autorizarActor: vi.fn(async () => true),
    obtenerContexto: vi.fn(async (): Promise<string> => {
      throw new Error(codigo);
    }),
    leerHistorial: vi.fn(async () => []),
    guardarMensaje: vi.fn(async (..._args: unknown[]) => {}),
    confirmarTurno: vi.fn(async (_par: unknown) => {}),
    consultar: vi.fn(async () => ({
      texto: "x",
      bloques: [],
      consultas: [],
      sugerencias: [],
      ms: 0,
    })),
    enviarDocumento: vi.fn(async () => ({ message_id: 9 })),
    enviarFoto: vi.fn(async () => ({ message_id: 9 })),
    renderizarPng: vi.fn(async () => new Uint8Array()),
    registrar: vi.fn(),
  };
  return { ctx, deps };
}
const ultimaRespuesta = (ctx: { reply: { mock: { calls: unknown[][] } } }) =>
  String(ctx.reply.mock.calls.at(-1)?.[0] ?? "");

describe("ESCO-185: contexto SQL de Telegram perdido", () => {
  it.each(["ESCO_SQL_CONVERSATION_UNAVAILABLE", "ESCO_SQL_CONTEXT_INVALID"])(
    "pregunta con %s indica /esco_nueva y no escribe nada",
    async (codigo) => {
      const { ctx, deps } = fixture(codigo);
      await manejarPreguntaTelegramSql(ctx, deps, "Pregunta", "message:1");
      expect(ultimaRespuesta(ctx)).toContain("/esco_nueva");
      expect(deps.guardarMensaje).not.toHaveBeenCalled();
      expect(deps.consultar).not.toHaveBeenCalled();
      expect(deps.confirmarTurno).not.toHaveBeenCalled();
      expect(deps.obtenerContexto).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["ESCO_SQL_CONVERSATION_UNAVAILABLE", "ESCO_SQL_CONTEXT_INVALID"])(
    "botón con %s indica /esco_nueva",
    async (codigo) => {
      const { ctx, deps } = fixture(codigo);
      await manejarCallbackTelegramSql(ctx, deps);
      expect(ultimaRespuesta(ctx)).toContain("/esco_nueva");
      expect(deps.consultar).not.toHaveBeenCalled();
    },
  );
  it("otro fallo conserva el mensaje genérico", async () => {
    const { ctx, deps } = fixture("ESCO_SQL_CONTEXT_UNAVAILABLE");
    await manejarPreguntaTelegramSql(ctx, deps, "Pregunta", "message:1");
    expect(ultimaRespuesta(ctx)).toContain("Intenta de nuevo más tarde");
    expect(ultimaRespuesta(ctx)).not.toContain("/esco_nueva");
  });
});
