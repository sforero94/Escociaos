// QA: real grammY router + SDK + SQL HTTP handler/provider adapter, closed transports.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buttons, closed, fixture } from "./helpers/escoSqlP6TurnoQaBot";
import { type P6Obj, servidorP6 } from "./helpers/escoSqlP6TurnoQaServidor";
async function reset(
  f: Awaited<ReturnType<typeof fixture>>,
  from = 123,
  chat = 123,
) {
  return f.update({
    update_id: 9000 + f.conversationsDb.length,
    message: {
      message_id: 9000,
      date: 1,
      chat: { id: chat, type: "private" },
      from: { id: from, is_bot: false, first_name: "Synthetic" },
      text: "/esco_nueva",
      entities: [{ offset: 0, length: 11, type: "bot_command" }],
    },
  });
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("QA P6 — conversación SQL de Telegram y recibo persistido", () => {
  it("Given usuario autorizado, When /esco_nueva y primer turno real, Then crea contexto vacío propio y guarda recibo igual al log sinLLM en reset", async () => {
    const server = servidorP6();
    const f = await fixture({ server });
    expect((await reset(f)).status).toBe(200);
    expect(server.providerRequests).toHaveLength(0);
    expect(f.sql).toHaveLength(0);
    expect(f.conversationsDb).toHaveLength(1);
    expect(f.conversationsDb[0]).toMatchObject({
      user_id: "11111111-1111-4111-8111-111111111111",
      title: "Telegram SQL",
    });
    await f.send("Primer turno P6");
    expect(f.sql).toHaveLength(1);
    expect(f.sql[0].body.historial).toEqual([]);
    expect(server.providerRequests).toHaveLength(3);
    const assistants = f.inserted.filter((w) => w.role === "assistant");
    expect(assistants).toHaveLength(1);
    const meta = assistants[0].metadata as P6Obj;
    expect(meta.recibo).toBeDefined();
    expect(meta.uso).toEqual((meta.recibo as P6Obj).uso);
    expect(meta.recibo).toMatchObject({
      canal: "telegram",
      estado: "completado",
      coste: { estado: "completo", observadoUsd: 0 },
    });
    expect(server.logs.find((l) => l.evento === "turno_sql")?.turno_id).toBe(
      (meta.recibo as P6Obj).turno_id,
    );
    expect(JSON.stringify(f.logs())).not.toContain(
      String((meta.recibo as P6Obj).historial_sha256),
    );
    closed(f);
  });

  it("Given historial mixto y SQL anterior sin recibo, When continúa contexto explícito, Then filtraanteslimit y conserva solo10SQL completos", async () => {
    const server = servidorP6();
    const f = await fixture({ server });
    await reset(f);
    const cid = f.conversationsDb[0].id;
    for (let i = 0; i < 14; i++) {
      f.history.push({
        id: `sql-${String(i).padStart(2, "0")}`,
        conversation_id: cid,
        role: i % 2 ? "assistant" : "user",
        content: `SQL_CONTENT_${i}`,
        created_at: "2034-05-01T00:00:00Z",
        metadata: {
          motor: "sql",
          arbitrary: "SYN_METADATA_PRIVATE",
          ...(i % 2
            ? {
              consultas: [{
                sql: `SELECT ${i} AS valor`,
                filas_muestra: [{ secret: "SYN_ROW_PRIVATE" }],
              }],
            }
            : {}),
        },
      });
    }
    for (let i = 0; i < 24; i++) {
      f.history.push({
        id: `legacy-${i}`,
        conversation_id: cid,
        role: i % 2 ? "assistant" : "user",
        content: "SYN_LEGACY_PRIVATE",
        created_at: "2034-05-02T00:00:00Z",
        metadata: {},
      });
    }
    await f.send("Historia P6");
    const body = f.sql[0].body, history = body.historial as P6Obj[];
    expect(history).toHaveLength(10);
    expect(history.map((h) => String(h.texto).match(/SQL_CONTENT_\d+/)?.[0]))
      .toEqual(Array.from({ length: 10 }, (_, i) => `SQL_CONTENT_${i + 4}`));
    for (let i = 5; i < 14; i += 2) {
      expect(history[i - 4].texto).toContain(`SELECT ${i} AS valor`);
    }
    expect(JSON.stringify(history)).not.toMatch(
      /SYN_(?:ROW|METADATA|LEGACY)_PRIVATE/,
    );
    const query = f.requests.find((r) =>
      r.method === "GET" && r.url.pathname.endsWith("/chat_messages")
    )!;
    expect(query.url.searchParams.get("metadata->>motor")).toBe("eq.sql");
    expect(query.url.searchParams.get("role")).toBe("in.(user,assistant)");
    expect(query.url.searchParams.get("limit")).toBe("10");
    expect(query.url.searchParams.get("order")).toBe("created_at.desc,id.desc");
    closed(f);
  });

  it("Given respuesta con botones, When verconsultas y después sugerencia, Then consulta reutiliza recibo sinLLM y sugerencia creaUUIDnuevo", async () => {
    const server = servidorP6();
    const f = await fixture({ server });
    await f.send("Botones P6");
    const first =
      (f.inserted.find((w) => w.role === "assistant")!.metadata as P6Obj)
        .recibo as P6Obj;
    const original = buttons(f);
    const trace = original.find((b) => b.callback_data.endsWith(":q"))!;
    expect(trace).toBeDefined();
    await f.tap(trace.callback_data, trace.messageId);
    expect(server.providerRequests).toHaveLength(3);
    expect(f.sql).toHaveLength(1);
    const option = original.find((b) => b.callback_data.endsWith(":0"))!;
    expect(option).toBeDefined();
    await f.tap(option.callback_data, option.messageId);
    expect(f.sql).toHaveLength(2);
    expect(server.providerRequests).toHaveLength(6);
    const answers = f.inserted.filter((w) => w.role === "assistant");
    const second = (answers[1].metadata as P6Obj).recibo as P6Obj;
    expect(second.turno_id).not.toBe(first.turno_id);
    expect(second.canal).toBe("telegram");
    closed(f);
  });

  it("Given contexto anterior y botones vigentes, When /esco_nueva, Then no borra mensajes y bloquea callbacksanteriores sinLLM", async () => {
    const server = servidorP6();
    const f = await fixture({ server });
    await f.send("Antes reset P6");
    const old = buttons(f).find((b) => b.callback_data.endsWith(":0"))!;
    const ids = f.history.map((h) => h.id);
    const before = f.conversationsDb[0].id;
    await reset(f);
    expect(f.conversationsDb).toHaveLength(2);
    expect(f.conversationsDb[1].id).not.toBe(before);
    expect(f.history.map((h) => h.id)).toEqual(ids);
    expect(server.providerRequests).toHaveLength(3);
    await f.tap(old.callback_data, old.messageId);
    expect(server.providerRequests).toHaveLength(3);
    expect(f.sql).toHaveLength(1);
    await f.send("Después reset P6");
    expect(f.sql[1].body.historial).toEqual([]);
    closed(f);
  });

  it.each([{ role: "Administrador" }, { profileActive: false }, {
    modules: ["capturas"],
  }])(
    "Given permiso denegado %j, When /esco_nueva, Then no crea conversación ni recibo/modelo",
    async (options) => {
      const server = servidorP6();
      const f = await fixture({ ...options, server });
      await reset(f);
      expect(f.conversationsDb).toEqual([]);
      expect(f.sql).toEqual([]);
      expect(server.providerRequests).toEqual([]);
      closed(f);
    },
  );

  it("Given motorlegacy, When /esco_nueva, Then no crea contextoSQL ni usa servicioSQL", async () => {
    const server = servidorP6();
    const f = await fixture({ motor: null, server });
    await reset(f);
    expect(f.conversationsDb.filter((c) => c.title === "Telegram SQL")).toEqual(
      [],
    );
    expect(f.sql).toEqual([]);
    expect(server.providerRequests).toEqual([]);
    closed(f);
  });

  it("Given error autorizado tras coste, When Telegram procesa reciboJSONerror, Then guarda sql_error y no ejecuta legacy ni reintenta", async () => {
    const server = servidorP6({
      planes: { "Error bot P6": { failAt: 1, costes: [0.125] } },
    });
    const f = await fixture({ server });
    await f.send("Error bot P6");
    expect(f.sql).toHaveLength(1);
    expect(server.providerRequests).toHaveLength(2);
    expect(f.legacy).not.toHaveBeenCalled();
    const row = f.inserted.find((w) =>
      (w.metadata as P6Obj)?.motor === "sql_error"
    );
    expect(row).toBeDefined();
    expect((row!.metadata as P6Obj).recibo).toMatchObject({
      estado: "error",
      canal: "telegram",
      coste: { estado: "parcial", observadoUsd: 0.125 },
      uso: { costoUsd: null },
    });
    expect(
      f.inserted.filter((w) =>
        w.role === "assistant" && (w.metadata as P6Obj)?.motor === "sql"
      ),
    ).toEqual([]);
    closed(f);
  });
  it("Given misma cuentaTelegram vinculada a otroactor, When usaSQLotra vez, Then crea contexto del nuevoactor sinheredar historial anterior", async () => {
    const server = servidorP6();
    const f = await fixture({ server });
    await f.send("Actor A P6");
    const first = f.conversationsDb[0].id;
    f.state.usuarioId = "22222222-2222-4222-8222-222222222222";
    await f.send("Actor B P6");
    expect(f.conversationsDb).toHaveLength(2);
    expect(f.conversationsDb[1]).toMatchObject({ user_id: f.state.usuarioId });
    expect(f.conversationsDb[1].id).not.toBe(first);
    expect(f.sql).toHaveLength(2);
    expect(f.sql[1].body).toMatchObject({
      usuario_id: f.state.usuarioId,
      historial: [],
    });
    closed(f);
  });

  it.each(["commit-then-error", "fail-before"] as const)(
    "Given confirmación final incierta %s, When finalizaLLM, Then no pisa éxito posible con sql_error ni repiteLLM",
    async (finalWrite) => {
      const server = servidorP6();
      const f = await fixture({ server, finalWrite });
      await f.send("Persistencia incierta P6");
      expect(f.sql).toHaveLength(1);
      expect(server.providerRequests).toHaveLength(3);
      const writes = f.requests.filter((r) =>
        r.method === "POST" && r.url.pathname.endsWith("/chat_messages")
      );
      expect(writes).toHaveLength(2);
      expect(Array.isArray(writes[0].body)).toBe(false);
      expect(Array.isArray(writes[1].body)).toBe(true);
      const claim = writes[0].body as P6Obj, pair = writes[1].body as P6Obj[];
      expect((claim.metadata as P6Obj).motor).toBe("sql_pending");
      expect(pair).toHaveLength(2);
      expect(pair[0]).toMatchObject({
        id: claim.id,
        created_at: claim.created_at,
      });
      expect(pair.every((row) => (row.metadata as P6Obj).motor === "sql")).toBe(
        true,
      );
      expect(
        f.history.some((row) => (row.metadata as P6Obj)?.motor === "sql_error"),
      ).toBe(false);
      expect(
        f.history.filter((row) => (row.metadata as P6Obj)?.motor === "sql"),
      ).toHaveLength(finalWrite === "commit-then-error" ? 2 : 0);
      const emitted = buttons(f),
        suggestion = emitted.find((button) =>
          button.callback_data.endsWith(":0")
        );
      if (suggestion) {
        await f.tap(suggestion.callback_data, suggestion.messageId);
      }
      expect.soft(emitted).toEqual([]);
      expect(f.sql).toHaveLength(1);
      expect(server.providerRequests).toHaveLength(3);
      closed(f);
    },
  );

  it("Given claim incierto que sí se guardó, When llega reentrega del mismo update, Then nuncaLLM ni promoción de pendiente a SQL", async () => {
    const server = servidorP6();
    const f = await fixture({ server, claimWrite: "commit-then-error" });
    const body = {
      update_id: 441,
      message: {
        message_id: 441,
        date: 1,
        chat: { id: 123, type: "private" },
        from: { id: 123, is_bot: false, first_name: "Synthetic" },
        text: "Claim incierto P6",
      },
    };
    await f.update(body);
    expect(f.sql).toHaveLength(0);
    expect(
      f.requests.filter((r) =>
        r.method === "POST" && r.url.pathname.endsWith("/chat_messages")
      ),
    ).toHaveLength(1);
    await f.update(body);
    expect(f.sql).toHaveLength(0);
    expect(server.providerRequests).toHaveLength(0);
    expect(f.history).toHaveLength(1);
    expect((f.history[0].metadata as P6Obj).motor).toBe("sql_pending");
    closed(f);
  });
  it.each([{ from: 124, chat: 123 }, { from: 123, chat: 999 }])(
    "Given botón de otra identidad %j, When intenta usarlo, Then no inicia otro turno ni consulta su historial",
    async (identity) => {
      const server = servidorP6();
      const f = await fixture({ server });
      await f.send("Contexto privado P6");
      const old = buttons(f).find((button) =>
        button.callback_data.endsWith(":0")
      )!;
      await f.tap(
        old.callback_data,
        old.messageId,
        identity.from,
        identity.chat,
      );
      expect(f.sql).toHaveLength(1);
      expect(server.providerRequests).toHaveLength(3);
      closed(f);
    },
  );

  it("Given conversación seleccionada ya no pertenece al actor, When continúa, Then falla sin otra conversación ni fallbacklegacy ni modelo", async () => {
    const server = servidorP6();
    const f = await fixture({ server });
    await f.send("Antes cambio dueño P6");
    f.conversationsDb[0].user_id = "22222222-2222-4222-8222-222222222222";
    const before = structuredClone(f.history);
    await f.send("Después cambio dueño P6");
    expect(f.conversationsDb).toHaveLength(1);
    expect(f.history).toEqual(before);
    expect(f.sql).toHaveLength(1);
    expect(server.providerRequests).toHaveLength(3);
    expect(f.legacy).not.toHaveBeenCalled();
    closed(f);
  });
  it("Given turnoA pendiente y nueva conversaciónB, When A termina tarde, Then no resucita contexto ni botones anteriores al enviarC", async () => {
    const server = servidorP6({ planes: { "A pendiente P6": { holdAt: 0 } } });
    const f = await fixture({ server });
    const a = f.send("A pendiente P6");
    await vi.waitFor(() =>
      expect(server.pending.has("A pendiente P6")).toBe(true)
    );
    await reset(f);
    const nuevo = f.conversationsDb.at(-1)!.id;
    server.release("A pendiente P6");
    await a;
    const old = buttons(f).find((button) =>
      button.callback_data.endsWith(":0")
    );
    if (old) await f.tap(old.callback_data, old.messageId);
    const callsAfterOld = f.sql.length;
    await f.send("C tras reset P6");
    const c = f.sql.at(-1)!;
    expect.soft(callsAfterOld).toBe(1);
    expect.soft(c.body.historial).toEqual([]);
    expect.soft(f.conversationsDb).toHaveLength(2);
    expect.soft(
      f.inserted.filter((row) => row.content === "C tras reset P6").every(
        (row) => row.conversation_id === nuevo,
      ),
    ).toBe(true);
    closed(f);
  });
  it.each(["error", "cancelado", "wrong-history"] as const)(
    "Given HTTP200 del transporte con recibo %s, When Telegram lo valida, Then no entrega éxito ni habilita seguimiento atribuido falsamente",
    async (mode) => {
      const server = servidorP6();
      const f = await fixture({
        server,
        mutateSql: (body) => {
          const receipt = body.recibo as P6Obj;
          if (mode === "wrong-history") {
            receipt.historial_sha256 = "b".repeat(64);
          } else receipt.estado = mode;
        },
      });
      await f.send("Integridad terminal P6");
      expect(f.sql).toHaveLength(1);
      expect(server.providerRequests).toHaveLength(3);
      expect(buttons(f)).toEqual([]);
      expect(
        f.history.filter((row) => (row.metadata as P6Obj)?.motor === "sql"),
      ).toEqual([]);
      expect(f.replies()).not.toContain("Respuesta sintética verificada");
      expect(f.legacy).not.toHaveBeenCalled();
      if (mode === "wrong-history") {
        expect(
          f.history.some((row) =>
            ((row.metadata as P6Obj)?.recibo as P6Obj)?.historial_sha256 ===
              "b".repeat(64)
          ),
        ).toBe(false);
      }
      closed(f);
    },
  );
});
