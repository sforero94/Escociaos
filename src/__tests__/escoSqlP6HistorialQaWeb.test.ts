// QA de integración: servicio web → SSE/handler/loop/adaptador LLM reales.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { enviarMensajeSql } from "../utils/escoSqlChatService";
import { leerMetadataSql } from "../utils/escoSqlChat";
import { getSupabase } from "../utils/supabase/client";
import type { ChatMessage } from "../types/chat";
import {
  closed as closedBot,
  fixture as botFixture,
} from "./helpers/escoSqlP6TurnoQaBot";
import {
  framesP6,
  P6ACTOR,
  type P6Obj,
  servidorP6,
} from "./helpers/escoSqlP6TurnoQaServidor";
vi.mock("../utils/supabase/client", () => ({ getSupabase: vi.fn() }));
const CONV = "33333333-3333-4333-8333-333333333333";
const PRIVATE = "SYN_P6_ROWS_AND_METADATA_NEVER_ENGINE";
const stamp = "2034-05-01T00:00:00.000Z";
export function historiaP6(): P6Obj[] {
  const sql = Array.from({ length: 14 }, (_, i) => ({
    id: `sql-${String(i).padStart(2, "0")}`,
    conversation_id: CONV,
    role: i % 2 ? "assistant" : "user",
    content: `SQL_CONTENT_${String(i).padStart(2, "0")}`,
    created_at: stamp,
    metadata: {
      motor: "sql",
      bloques: [{ filas: [{ person: PRIVATE }] }],
      arbitrary: PRIVATE,
      ...(i % 2
        ? {
          consultas: [{
            sql: `SELECT ${i} AS valor`,
            filas_muestra: [{ salary: PRIVATE }],
            proposito: PRIVATE,
          }],
        }
        : {}),
    },
  }));
  const legacy = Array.from(
    { length: 24 },
    (_, i) => ({
      id: `legacy-${i}`,
      conversation_id: CONV,
      role: i % 2 ? "assistant" : "user",
      content: `SYN_P6_LEGACY_${i}`,
      created_at: "2034-05-02T00:00:00.000Z",
      metadata: {},
    }),
  );
  return [...sql.reverse(), ...legacy, {
    id: "tool",
    conversation_id: CONV,
    role: "tool",
    content: PRIVATE,
    created_at: stamp,
    metadata: { motor: "sql" },
  }];
}
function fixture(
  opts: {
    foreign?: boolean;
    failAt?: number;
    lost?: boolean;
    rows?: P6Obj[];
    mutate?: (frames: P6Obj[]) => void;
  } = {},
) {
  const rows = structuredClone(opts.rows ?? historiaP6()),
    writes: P6Obj[] = [],
    reads: Array<Array<unknown>> = [],
    sent: P6Obj[] = [];
  const server = servidorP6({
    planes: {
      "Control historial": {
        ...(opts.failAt === undefined ? {} : { failAt: opts.failAt }),
        costes: [0.1, 0.2, 0.3],
      },
    },
  });
  function chain(table: string) {
    const operations: Array<unknown> = [];
    reads.push(operations);
    let selected = [...rows];
    const result = () => ({ data: selected, error: null });
    const q = {
      select: (cols?: string) => {
        operations.push(["select", cols]);
        return q;
      },
      eq: (key: string, value: unknown) => {
        operations.push(["eq", key, value]);
        selected = selected.filter((row) =>
          (key === "metadata->>motor"
            ? (row.metadata as P6Obj)?.motor
            : row[key]) === value
        );
        return q;
      },
      in: (key: string, values: unknown[]) => {
        operations.push(["in", key, values]);
        selected = selected.filter((row) => values.includes(row[key]));
        return q;
      },
      order: (key: string, opt: { ascending?: boolean }) => {
        operations.push(["order", key, opt]);
        return q;
      },
      limit: (n: number) => {
        operations.push(["limit", n]);
        const orders = operations.filter((o) =>
          Array.isArray(o) && o[0] === "order"
        ) as [string, string, { ascending?: boolean }][];
        selected.sort((a, b) => {
          for (const [, key, opt] of orders) {
            const delta = String(a[key]).localeCompare(String(b[key]));
            if (delta) return opt.ascending === false ? -delta : delta;
          }
          return 0;
        });
        selected = selected.slice(0, n);
        return q;
      },
      maybeSingle: async () => ({
        data: opts.foreign ? null : { id: CONV, user_id: P6ACTOR },
        error: null,
      }),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(ok, bad),
    };
    return {
      ...q,
      insert: (value: P6Obj | P6Obj[]) => {
        if (table === "chat_messages") {
          writes.push(
            ...structuredClone(Array.isArray(value) ? value : [value]),
          );
          return Promise.resolve({ error: null });
        }
        return {
          select: () => ({
            single: async () => ({ data: { id: CONV }, error: null }),
          }),
        };
      },
    };
  }
  vi.mocked(getSupabase).mockReturnValue({
    auth: {
      getSession: async () => ({
        data: {
          session: { access_token: "synthetic-web", user: { id: P6ACTOR } },
        },
      }),
    },
    from: (table: string) => {
      expect(["chat_conversations", "chat_messages"]).toContain(table);
      return chain(table);
    },
  } as unknown as ReturnType<typeof getSupabase>);
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(new URL(request.url).pathname).toBe(
        "/functions/v1/esco-consultas",
      );
      const body = await request.json() as P6Obj;
      sent.push(body);
      if (opts.lost) throw Error(PRIVATE);
      const response = await server.request(body, "sse");
      if (opts.mutate) {
        const frames = await framesP6(response);
        opts.mutate(frames);
        return new Response(
          frames.map((frame) => "data: " + JSON.stringify(frame) + "\n\n").join(
            "",
          ),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }
      return response;
    },
  );
  vi.stubGlobal("fetch", transport);
  return { server, writes, reads, sent, transport };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("QA P6 — historial web efectivo y snapshot enlazado", () => {
  it("Given SQL viejo sin recibo y legacy más reciente, When sigue conversación, Then DB filtra antes del límite y el motor recibe últimos10 SQL en orden estable", async () => {
    const f = fixture();
    const result = await enviarMensajeSql(
      CONV,
      "Control historial",
      historiaP6() as unknown as ChatMessage[],
      () => {},
    );
    expect(f.sent).toHaveLength(1);
    const history = f.sent[0].historial as Array<
      { rol: string; texto: string }
    >;
    expect(history).toHaveLength(10);
    expect(history.map((x) => x.texto.match(/SQL_CONTENT_\d+/)?.[0])).toEqual(
      Array.from(
        { length: 10 },
        (_, i) => `SQL_CONTENT_${String(i + 4).padStart(2, "0")}`,
      ),
    );
    expect(history.map((x) => x.rol)).toEqual(
      Array.from({ length: 10 }, (_, i) => (i + 4) % 2 ? "assistant" : "user"),
    );
    for (let i = 5; i < 14; i += 2) {
      expect(history[i - 4].texto).toContain(`SELECT ${i} AS valor`);
    }
    expect(JSON.stringify(history)).not.toContain(PRIVATE);
    expect(JSON.stringify(history)).not.toContain("SYN_P6_LEGACY");
    const query = f.reads.find((ops) =>
      ops.some((o) => Array.isArray(o) && o[0] === "limit")
    )!;
    expect(query).toBeDefined();
    const limit = query.findIndex((o) => Array.isArray(o) && o[0] === "limit");
    expect(query.slice(0, limit)).toContainEqual([
      "eq",
      "metadata->>motor",
      "sql",
    ]);
    expect(query.slice(0, limit)).toContainEqual(["in", "role", [
      "user",
      "assistant",
    ]]);
    expect(query).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(query).toContainEqual(["order", "id", { ascending: false }]);
    expect(query[limit]).toEqual(["limit", 10]);
    const meta = leerMetadataSql(
      result.asistente.metadata,
    )! as unknown as P6Obj;
    expect(meta.recibo).toBeDefined();
    expect((meta.recibo as P6Obj).historial_sha256).toBe(
      createHash("sha256").update(JSON.stringify(history)).digest("hex"),
    );
    expect(meta.uso).toEqual((meta.recibo as P6Obj).uso);
    expect(f.writes.find((w) => w.role === "assistant")?.metadata).toEqual(
      result.asistente.metadata,
    );
    expect(f.server.providerRequests).toHaveLength(3);
  });

  it("Given Nuevo conserva mensajes visibles anteriores, When envía con conversationId null, Then el primer turnoSQL no hereda contexto ni borra filas", async () => {
    const f = fixture();
    await enviarMensajeSql(
      null,
      "Control historial",
      historiaP6() as unknown as ChatMessage[],
      () => {},
    );
    expect(f.sent[0].historial).toEqual([]);
    expect(f.writes.map((w) => w.role)).toEqual(["user", "assistant"]);
  });

  it("Given conversación ajena, When intenta continuar, Then no llama motor ni guarda recibo", async () => {
    const f = fixture({ foreign: true });
    await expect(enviarMensajeSql(CONV, "Control historial", [], () => {}))
      .rejects.toThrow();
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
  });

  it("Given pérdida de red antes del recibo, When solicita, Then no reintenta ni inventa snapshot exitoso", async () => {
    const f = fixture({ lost: true });
    await expect(enviarMensajeSql(CONV, "Control historial", [], () => {}))
      .rejects.toThrow();
    expect(f.transport).toHaveBeenCalledTimes(1);
    expect(f.writes.filter((w) => (w.metadata as P6Obj)?.motor === "sql"))
      .toEqual([]);
  });

  it("Given SSE autorizado falla tras coste observado, When cliente lo conserva, Then snapshoterror guarda recibo sin convertirse en historialSQL", async () => {
    const f = fixture({ failAt: 1 });
    await expect(enviarMensajeSql(CONV, "Control historial", [], () => {}))
      .rejects.toThrow();
    const errors = f.writes.filter((w) =>
      w.role === "assistant" && (w.metadata as P6Obj)?.motor === "sql_error"
    );
    expect(errors).toHaveLength(1);
    const meta = errors[0].metadata as P6Obj;
    expect(meta.recibo).toMatchObject({
      estado: "error",
      coste: { estado: "parcial", observadoUsd: 0.1 },
      uso: { costoUsd: null },
    });
    expect(f.transport).toHaveBeenCalledTimes(1);
    expect(
      f.writes.filter((w) =>
        w.role === "assistant" && (w.metadata as P6Obj)?.motor === "sql"
      ),
    ).toEqual([]);
  });
  it("Given prosa larga y consulta que excede4000, When lee historial desdeDB, Then conserva consultas completas que caben y etiqueta omitidas sinfilas", async () => {
    const huge = "SELECT " + "x".repeat(5000), small = "SELECT 9 AS entero";
    const rows = [{
      id: "old-sql",
      conversation_id: CONV,
      role: "assistant",
      content: "P".repeat(5000),
      created_at: stamp,
      metadata: {
        motor: "sql",
        consultas: [{ sql: huge, filas_muestra: [{ secret: PRIVATE }] }, {
          sql: small,
        }],
        unrelated: PRIVATE,
      },
    }];
    const f = fixture({ rows });
    await enviarMensajeSql(CONV, "Control historial", [], () => {});
    const history = f.sent[0].historial as Array<
      { rol: string; texto: string }
    >;
    expect(history).toHaveLength(1);
    const text = history[0].texto;
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text.startsWith("P".repeat(200))).toBe(true);
    expect(text).toContain(small);
    expect(text).toMatch(/omitidas.*1/);
    expect(text).not.toContain(huge.slice(0, 50));
    expect(text).not.toContain(PRIVATE);
  });

  it("Given filaSQL elegible sin fecha verificable, When prepara contexto, Then no inventaorden ni envía al modelo", async () => {
    const f = fixture({
      rows: [{
        id: "invalid-date",
        conversation_id: CONV,
        role: "user",
        content: "SYN_HISTORY",
        created_at: "2034-02-30T00:00:00Z",
        metadata: { motor: "sql" },
      }],
    });
    await expect(enviarMensajeSql(CONV, "Control historial", [], () => {}))
      .rejects.toThrow();
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
  });

  it("Given mismas filasSQL ylegacy en ambosadaptadores, When webSSE yTelegramJSON responden, Then inputLLM yhuellahistorial son idénticos", async () => {
    const web = fixture();
    const result = await enviarMensajeSql(
      CONV,
      "Control historial",
      [],
      () => {},
    );
    const webHistory = web.sent[0].historial;
    const server = servidorP6();
    const bot = await botFixture({ server });
    await bot.update({
      update_id: 999,
      message: {
        message_id: 999,
        date: 1,
        chat: { id: 123, type: "private" },
        from: { id: 123, is_bot: false, first_name: "Synthetic" },
        text: "/esco_nueva",
        entities: [{ offset: 0, length: 11, type: "bot_command" }],
      },
    });
    const cid = bot.conversationsDb[0].id;
    bot.history.push(
      ...historiaP6().map((row) => ({ ...row, conversation_id: cid })),
    );
    await bot.send("Control historial");
    expect(bot.sql[0].body.historial).toEqual(webHistory);
    expect((server.providerRequests[0].body.messages as P6Obj[]).slice(1, -1))
      .toEqual(
        (web.server.providerRequests[0].body.messages as P6Obj[]).slice(1, -1),
      );
    const w = (result.asistente.metadata as P6Obj).recibo as P6Obj,
      t = (bot.inserted.find((row) => row.role === "assistant")!
        .metadata as P6Obj).recibo as P6Obj;
    expect(t.historial_sha256).toBe(w.historial_sha256);
    expect(t.turno_id).not.toBe(w.turno_id);
    expect(t.canal).toBe("telegram");
    expect(w.canal).toBe("web");
    closedBot(bot);
  });

  it.each(
    [
      "missing-terminal-receipt",
      "cross-turn",
      "cross-channel",
      "wrong-history",
      "wrong-usage",
      "progress-id",
    ] as const,
  )(
    "Given SSE real alterado %s, When adaptador lo recibe, Then no persiste una respuesta atribuida falsamente",
    async (mode) => {
      const f = fixture({
        rows: [],
        mutate: (frames) => {
          const done = frames.find((frame) => frame.type === "done")!,
            result = done.resultado as P6Obj,
            t = result.recibo as P6Obj;
          if (mode === "missing-terminal-receipt") {
            delete result.recibo;
            delete result.uso;
          }
          if (mode === "cross-turn") {
            done.turno_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
            t.turno_id = done.turno_id;
          }
          if (mode === "cross-channel") {
            done.canal = "telegram";
            t.canal = "telegram";
          }
          if (mode === "wrong-history") t.historial_sha256 = "b".repeat(64);
          if (mode === "wrong-usage") {
            result.uso = { ...(t.uso as P6Obj), costoUsd: 0.25 };
          }
          if (mode === "progress-id") {
            frames.find((frame) => frame.type === "consulta_inicio")!.turno_id =
              "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
          }
        },
      });
      await expect(enviarMensajeSql(CONV, "Control historial", [], () => {}))
        .rejects.toThrow();
      expect(f.writes).toEqual([]);
      expect(f.transport).toHaveBeenCalledTimes(1);
      expect(f.server.providerRequests).toHaveLength(3);
    },
  );
});
