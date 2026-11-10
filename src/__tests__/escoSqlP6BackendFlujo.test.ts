import { describe, expect, it, vi } from "vitest";
import { manejarPreguntaTelegramSql } from "../supabase/functions/server/telegram/escoSqlFlujo.ts";
function fixture() {
  const ctx = {
    from: { id: 123 },
    chat: { id: 123 },
    session: {},
    reply: vi.fn(async () => ({ message_id: 8 })),
    replyWithChatAction: vi.fn(async () => {}),
    api: { editMessageReplyMarkup: vi.fn(async () => {}) },
  };
  const deps = {
    env: () => "https://synthetic.invalid",
    resolverActor: vi.fn(async () => ({
      usuarioId: "11111111-1111-4111-8111-111111111111",
      filaId: "actor",
    })),
    autorizarActor: vi.fn(async () => true),
    obtenerContexto: vi.fn(async () => "cid"),
    leerHistorial: vi.fn(async () => []),
    guardarMensaje: vi.fn(async (..._args: unknown[]) => {}),
    confirmarTurno: vi.fn(async (_par: unknown) => {}),
    consultar: vi.fn(async () => ({
      texto: "Respuesta sintética",
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
describe("P6 backend: claim y confirmación de turno", () => {
  it("un claim pendiente precede al motor y un solo bulk confirma el par", async () => {
    const { ctx, deps } = fixture();
    await manejarPreguntaTelegramSql(ctx, deps, "Pregunta", "message:1");
    expect(deps.guardarMensaje).toHaveBeenCalledTimes(1);
    expect(deps.guardarMensaje.mock.calls[0][3]).toMatchObject({
      motor: "sql_pending",
    });
    expect(deps.confirmarTurno).toHaveBeenCalledTimes(1);
    expect(deps.confirmarTurno.mock.calls[0][0]).toMatchObject({
      usuario: { metadata: { motor: "sql" } },
      asistente: { metadata: { motor: "sql" } },
    });
  });
  it("claim no confirmado nunca promueve ni consulta", async () => {
    const { ctx, deps } = fixture();
    deps.guardarMensaje.mockRejectedValue(new Error("SYN_TIMEOUT"));
    await manejarPreguntaTelegramSql(ctx, deps, "Pregunta", "message:1");
    expect(deps.consultar).not.toHaveBeenCalled();
    expect(deps.confirmarTurno).not.toHaveBeenCalled();
  });
  it("error de motor confirma par excluido de historial", async () => {
    const { ctx, deps } = fixture();
    deps.consultar.mockRejectedValue(new Error("SYN_ENGINE"));
    await manejarPreguntaTelegramSql(ctx, deps, "Pregunta", "message:1");
    expect(deps.confirmarTurno.mock.calls[0][0]).toMatchObject({
      usuario: { metadata: { motor: "sql_error" } },
      asistente: { metadata: { motor: "sql_error", recibo: null, uso: null } },
    });
  });
  it.each([false, true])(
    "assistant sucede al claim incluso con reloj fijo: error=%s",
    async (fallo) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2034-05-08T00:00:00Z"));
      try {
        const { ctx, deps } = fixture();
        if (fallo) deps.consultar.mockRejectedValue(new Error("SYN_ENGINE"));
        await manejarPreguntaTelegramSql(ctx, deps, "Pregunta", "message:1");
        const par = deps.confirmarTurno.mock.calls[0][0] as {
          usuario: { created_at: string };
          asistente: { created_at: string };
        };
        expect(Date.parse(par.asistente.created_at)).toBeGreaterThan(
          Date.parse(par.usuario.created_at),
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it("confirmación incierta no habilita botones de una respuesta no confirmada", async () => {
    const { ctx, deps } = fixture();
    deps.consultar.mockResolvedValue(
      {
        texto: "Respuesta",
        bloques: [],
        consultas: [],
        sugerencias: ["Detalle"],
        ms: 0,
      } as never,
    );
    deps.confirmarTurno.mockRejectedValue(new Error("SYN_TIMEOUT"));
    await manejarPreguntaTelegramSql(ctx, deps, "Pregunta", "message:1");
    expect(ctx.api.editMessageReplyMarkup).not.toHaveBeenCalled();
  });
  it("resultado incierto del bulk nunca causa una segunda escritura", async () => {
    const { ctx, deps } = fixture();
    deps.confirmarTurno.mockRejectedValue(new Error("SYN_TIMEOUT"));
    await manejarPreguntaTelegramSql(ctx, deps, "Pregunta", "message:1");
    expect(deps.confirmarTurno).toHaveBeenCalledTimes(1);
    expect(deps.guardarMensaje).toHaveBeenCalledTimes(1);
    expect(deps.consultar).toHaveBeenCalledTimes(1);
  });
});
