import { describe, expect, it, vi } from "vitest";
import {
  manejarCallbackTelegramSql,
  manejarPreguntaTelegramSql,
} from "../supabase/functions/server/telegram/escoSqlFlujo.ts";
import { crearBotonesSql } from "../supabase/functions/server/telegram/escoSqlSesion.ts";
function fixture() {
  const writes: unknown[] = [];
  let id = 50;
  const ctx = {
    from: { id: 11 },
    chat: { id: 22 },
    session: {},
    reply: vi.fn(async () => ({ message_id: id++ })),
    replyWithChatAction: vi.fn(async () => true),
    answerCallbackQuery: vi.fn(async () => true),
    api: { editMessageReplyMarkup: vi.fn(async () => true) },
  };
  const consultar = vi.fn(async () => ({
    texto: "Control sintético",
    bloques: [],
    sugerencias: ["Ver detalle"],
    consultas: [{
      sql: "SELECT 1",
      proposito: "Control",
      n_filas: 1,
      truncado: false,
      error: null,
      ms: 1,
    }],
    ms: 2,
  }));
  const deps = {
    env: (
      n: string,
    ) => ({
      SUPABASE_URL: "https://fixture.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-fixture",
      ESCO_TELEGRAM_SECRET: "secret-fixture",
      ESCO_MOTOR_TELEGRAM: "sql",
    }[n]),
    resolverActor: vi.fn(async () => ({
      usuarioId: "11111111-1111-4111-8111-111111111111",
      filaId: "linked",
    })),
    autorizarActor: vi.fn(async () => true),
    crearConversacion: vi.fn(async () => "conversation"),
    leerHistorial: vi.fn(async () => []),
    guardarMensaje: vi.fn(async (...args: unknown[]) => {
      writes.push(args);
      return "write";
    }),
    consultar,
    enviarDocumento: vi.fn(async () => ({ message_id: id++ })),
    enviarFoto: vi.fn(async () => ({ message_id: id++ })),
    renderizarPng: vi.fn(async () => new Uint8Array([1])),
    registrar: vi.fn(),
  };
  return { ctx, deps, writes };
}
describe("P5 flujo unitario", () => {
  it("autoriza antes de persistir, consulta solo porHTTP y guarda snapshotv1", async () => {
    const s = fixture();
    await manejarPreguntaTelegramSql(s.ctx, s.deps, "Pregunta", "message:33");
    expect(s.deps.resolverActor).toHaveBeenCalledWith(11);
    expect(s.deps.autorizarActor).toHaveBeenCalledOnce();
    expect(s.deps.consultar).toHaveBeenCalledOnce();
    expect(s.deps.guardarMensaje.mock.calls.map((a) => a[1])).toEqual([
      "user",
      "assistant",
    ]);
    expect(s.deps.guardarMensaje.mock.calls[1][3]).toMatchObject({
      motor: "sql",
      bloques: [],
      consultas: [{ sql: "SELECT 1" }],
      snapshot_at: expect.any(String),
    });
    expect(s.ctx.api.editMessageReplyMarkup).toHaveBeenCalledOnce();
  });
  it("falta secreto o permiso no persiste ni llama motor", async () => {
    const s = fixture();
    s.deps.autorizarActor.mockResolvedValue(false);
    await manejarPreguntaTelegramSql(s.ctx, s.deps, "Pregunta", "message:33");
    expect(s.deps.consultar).not.toHaveBeenCalled();
    expect(s.deps.guardarMensaje).not.toHaveBeenCalled();
    const t = fixture();
    t.deps.env = () => undefined;
    await manejarPreguntaTelegramSql(t.ctx, t.deps, "Pregunta", "message:33");
    expect(t.deps.resolverActor).not.toHaveBeenCalled();
    expect(t.deps.consultar).not.toHaveBeenCalled();
  });
  it("claim de turno duplicado corta antesdeHTTP y no reintenta", async () => {
    const s = fixture();
    s.deps.guardarMensaje.mockRejectedValueOnce(new Error("duplicate"));
    await manejarPreguntaTelegramSql(s.ctx, s.deps, "Pregunta", "message:33");
    expect(s.deps.consultar).not.toHaveBeenCalled();
    expect(s.deps.guardarMensaje).toHaveBeenCalledOnce();
  });
  it("falloPNG conserva respuesta y envíaCSV sinmotorlegacy niotroproveedor", async () => {
    const s = fixture();
    s.deps.consultar.mockResolvedValue({
      texto: "Control",
      bloques: [{
        tipo: "grafica",
        titulo: "Control",
        forma: "pie",
        consulta: 1,
        truncado: false,
        x: "label",
        y: ["n"],
        formato: "numero",
        datos: [{ label: "A", n: 1 }],
      }],
      sugerencias: [],
      consultas: [],
      ms: 0,
    } as never);
    s.deps.renderizarPng.mockRejectedValue(new Error("PNG_UNAVAILABLE"));
    await manejarPreguntaTelegramSql(s.ctx, s.deps, "Pregunta", "message:33");
    expect(s.deps.enviarDocumento).toHaveBeenCalledOnce();
    expect(s.deps.enviarFoto).not.toHaveBeenCalled();
    expect(s.deps.guardarMensaje).toHaveBeenCalledTimes(2);
  });
  it("callbacktrace revalida acceso y no llama al motor", async () => {
    const s = fixture();
    const b = crearBotonesSql(undefined, {
      usuarioId: "11111111-1111-4111-8111-111111111111",
      telegramId: 11,
      chatId: 22,
      messageId: 33,
      opciones: [],
      consultas: [{ sql: "SELECT 1", n_filas: 1 }],
      token: "a".repeat(32),
    });
    Object.assign(s.ctx, {
      callbackQuery: {
        data: b.botones[0].callback_data,
        message: { message_id: 33 },
      },
      session: { escoSql: b.estado },
    });
    await manejarCallbackTelegramSql(s.ctx, s.deps);
    expect(s.deps.autorizarActor).toHaveBeenCalledOnce();
    expect(s.deps.consultar).not.toHaveBeenCalled();
    expect(s.ctx.reply).toHaveBeenCalled();
  });
});
