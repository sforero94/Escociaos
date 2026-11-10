// QA independiente: handler, loop y adaptador proveedor reales; ningún servicio vivo.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { leerReciboTurnoSql } from "../utils/escoSql/turno";
import {
  framesP6,
  P6ACTOR,
  type P6Obj,
  P6PRIVATE,
  servidorP6,
} from "./helpers/escoSqlP6TurnoQaServidor";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function receipt(body: P6Obj) {
  expect(body.recibo).toBeTypeOf("object");
  return body.recibo as P6Obj;
}
function assertClosed(s: ReturnType<typeof servidorP6>) {
  expect(s.rejected).toEqual([]);
}

describe("QA P6 — recibo HTTP enlazado a ejecución real", () => {
  it.each(["json", "telegram"] as const)(
    "Given coste cero observado, When %s ejecuta tres llamadas reales, Then recibo y log comparten UUID sin datos privados",
    async (mode) => {
      const s = servidorP6();
      const r = await s.json({}, mode);
      expect(r.status).toBe(200);
      const t = receipt(r.body);
      expect(t).toMatchObject({
        version: 1,
        canal: mode === "telegram" ? "telegram" : "web",
        estado: "completado",
        historial_sha256: sha([]),
        uso: { llamadas: 3, entrada: 6, salida: 9, costoUsd: 0 },
        coste: {
          estado: "completo",
          observadoUsd: 0,
          llamadasConCoste: 3,
          llamadasSinCoste: 0,
        },
      });
      expect(t.turno_id).toMatch(uuid);
      expect(r.body.uso).toEqual(t.uso);
      expect(s.providerRequests).toHaveLength(3);
      expect(s.rpcCalls).toHaveLength(1);
      expect(s.rpcCalls[0].name).toBe(
        mode === "telegram"
          ? "esco_sql_consultar_actor_v1"
          : "esco_sql_consultar_v1",
      );
      const terminal = s.logs.filter((l) => l.evento === "turno_sql");
      expect(terminal).toHaveLength(1);
      expect(terminal[0]).toMatchObject({
        turno_id: t.turno_id,
        canal: t.canal,
        estado: t.estado,
        uso: t.uso,
        coste: t.coste,
      });
      const raw = JSON.stringify(s.logs);
      for (
        const secret of [
          String(t.historial_sha256),
          P6ACTOR,
          "Control P6",
          "SELECT 7",
          "Respuesta sintética",
          "synthetic-provider-key",
        ]
      ) expect(raw).not.toContain(secret);
      assertClosed(s);
    },
  );

  it.each([undefined, null, "0.01", -0.05, { value: 0.01 }])(
    "Given coste inválido %j en llamada intermedia, When termina el turno, Then conserva subtotal sin inventar total",
    async (cost) => {
      const s = servidorP6({
        planes: { "Coste parcial": { costes: [0.1, cost, 0.2] } },
      });
      const r = await s.json({ pregunta: "Coste parcial" });
      expect(r.status).toBe(200);
      const t = receipt(r.body);
      expect(t.coste).toMatchObject({
        estado: "parcial",
        llamadasConCoste: 2,
        llamadasSinCoste: 1,
      });
      expect((t.coste as P6Obj).observadoUsd).toBeCloseTo(0.3);
      expect(t.uso).toMatchObject({ llamadas: 3, costoUsd: null });
      expect(r.body.uso).toEqual(t.uso);
      assertClosed(s);
    },
  );

  it("Given todos los costes ausentes, When hay respuesta útil, Then uso existe pero gasto sigue desconocido", async () => {
    const s = servidorP6({ planes: { Desconocido: { costes: [] } } });
    const r = await s.json({ pregunta: "Desconocido" });
    expect(r.status).toBe(200);
    expect(receipt(r.body)).toMatchObject({
      uso: { llamadas: 3, costoUsd: null },
      coste: {
        estado: "desconocido",
        observadoUsd: null,
        llamadasConCoste: 0,
        llamadasSinCoste: 3,
      },
    });
    assertClosed(s);
  });

  it.each([0, 1] as const)(
    "Given proveedor falla en llamada %i, When el resultado queda incierto, Then devuelve error con contabilidad y no reintenta",
    async (failAt) => {
      const s = servidorP6({
        planes: { Fallo: { failAt, costes: [0.125, 0, 0] } },
      });
      const r = await s.json({ pregunta: "Fallo" });
      expect(r.status).toBeGreaterThanOrEqual(400);
      const t = receipt(r.body);
      expect(t.estado).toBe("error");
      expect(t.coste).toEqual(
        failAt === 0
          ? {
            estado: "desconocido",
            observadoUsd: null,
            llamadasConCoste: 0,
            llamadasSinCoste: 1,
          }
          : {
            estado: "parcial",
            observadoUsd: 0.125,
            llamadasConCoste: 1,
            llamadasSinCoste: 1,
          },
      );
      expect(failAt === 0 ? t.uso : (t.uso as P6Obj).costoUsd).toBeNull();
      expect(s.providerRequests).toHaveLength(failAt + 1);
      expect(JSON.stringify({ response: r.body, logs: s.logs })).not.toContain(
        P6PRIVATE,
      );
      assertClosed(s);
    },
  );

  it("Given permiso RPC revocado después del modelo, When consulta real falla42501, Then conserva gasto observado con recibo de error", async () => {
    const s = servidorP6({
      rpcDenied: true,
      planes: { Revocado: { costes: [0.125] } },
    });
    const r = await s.json({ pregunta: "Revocado" });
    expect(r.status).toBe(403);
    expect(receipt(r.body)).toMatchObject({
      estado: "error",
      uso: { llamadas: 1, costoUsd: 0.125 },
      coste: {
        estado: "completo",
        observadoUsd: 0.125,
        llamadasConCoste: 1,
        llamadasSinCoste: 0,
      },
    });
    expect(s.providerRequests).toHaveLength(1);
    expect(s.rpcCalls).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toContain(P6PRIVATE);
    expect(r.body).not.toHaveProperty("bloques");
    assertClosed(s);
  });

  it.each([{ denied: true }, { invalidJwt: true }])(
    "Given autorización inicial denegada %j, When solicita turno, Then no generaUUID ni modelo ni recibo",
    async (option) => {
      const ids = vi.spyOn(crypto, "randomUUID");
      const s = servidorP6(option);
      const r = await s.json({});
      expect([401, 403]).toContain(r.status);
      expect(r.body).not.toHaveProperty("recibo");
      expect(s.providerRequests).toEqual([]);
      expect(s.rpcCalls).toEqual([]);
      expect(ids).not.toHaveBeenCalled();
      assertClosed(s);
    },
  );

  it.each([{ turno_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, {
    canal: "telegram",
  }])(
    "Given identidad declarada por cliente %j, When llega al handler web, Then rechaza antes del modelo",
    async (extra) => {
      const s = servidorP6();
      const r = await s.json(extra);
      expect(r.status).toBe(400);
      expect(r.body).not.toHaveProperty("recibo");
      expect(s.providerRequests).toHaveLength(0);
      assertClosed(s);
    },
  );

  it("Given SSE real, When inicia/progresa/termina, Then todos los eventos pertenecen al recibo terminal", async () => {
    const s = servidorP6();
    const response = await s.request({}, "sse");
    const events = await framesP6(response);
    expect(response.status).toBe(200);
    expect(events[0].type).toBe("turno");
    const done = events.find((e) => e.type === "done")!;
    const body = done.resultado as P6Obj;
    const t = receipt(body);
    expect(events.length).toBeGreaterThan(3);
    for (const e of events) {
      expect(e.turno_id).toBe(t.turno_id);
      expect(e.canal).toBe("web");
    }
    expect(events[0]).toMatchObject({ historial_sha256: sha([]) });
    expect(events[0]).not.toHaveProperty("uso");
    expect(body.uso).toEqual(t.uso);
    assertClosed(s);
  });

  it("Given SSE con fallo del proveedor tras una llamada, When cierra, Then termina error con el mismo ID y coste parcial", async () => {
    const s = servidorP6({
      planes: { ErrorSSE: { failAt: 1, costes: [0.125] } },
    });
    const events = await framesP6(
      await s.request({ pregunta: "ErrorSSE" }, "sse"),
    );
    expect(events.some((e) => e.type === "done")).toBe(false);
    const error = events.find((e) => e.type === "error")!;
    expect(error).toBeDefined();
    expect(receipt(error)).toMatchObject({
      turno_id: events[0].turno_id,
      estado: "error",
      coste: { estado: "parcial", observadoUsd: 0.125 },
      uso: { costoUsd: null },
    });
    expect(JSON.stringify(events)).not.toContain(P6PRIVATE);
    assertClosed(s);
  });

  it("Given dos turnos intercalados con reloj idéntico, When B termina antes de A, Then cada coste/log queda ligado por UUID independiente", async () => {
    const s = servidorP6({
      planes: {
        A: { holdAt: 0, costes: [0.1, 0.1, 0.1] },
        B: { costes: [0.2, 0.2, 0.2] },
      },
    });
    const aPromise = s.json({ pregunta: "A" });
    await vi.waitFor(() => expect(s.pending.has("A")).toBe(true));
    const b = await s.json({ pregunta: "B" });
    s.release("A");
    const a = await aPromise;
    const ta = receipt(a.body), tb = receipt(b.body);
    expect(ta.turno_id).not.toBe(tb.turno_id);
    expect((ta.uso as P6Obj).costoUsd).toBeCloseTo(0.3);
    expect((tb.uso as P6Obj).costoUsd).toBeCloseTo(0.6);
    const logs = s.logs.filter((l) => l.evento === "turno_sql");
    expect(logs.map((l) => l.turno_id)).toEqual([tb.turno_id, ta.turno_id]);
    expect(logs.map((l) => l.uso)).toEqual([tb.uso, ta.uso]);
    expect(s.providerRequests).toHaveLength(6);
    assertClosed(s);
  });
  it("Given costes individuales finitos cuya suma desborda, When termina, Then recibo válido nunca declara total completo nofinito", async () => {
    const s = servidorP6({
      planes: { Desborde: { costes: [Number.MAX_VALUE, Number.MAX_VALUE, 0] } },
    });
    const r = await s.json({ pregunta: "Desborde" });
    const t = receipt(r.body);
    expect(leerReciboTurnoSql(t)).not.toBeNull();
    expect((t.uso as P6Obj)?.costoUsd).toBeNull();
    expect((t.coste as P6Obj).estado).not.toBe("completo");
    assertClosed(s);
  });

  it.each([false, true])(
    "Given stream cancelado con request pendiente fail=%s, When el proveedor se resuelve, Then distingue cargo conocido de intento incierto en el log",
    async (fail) => {
      const s = servidorP6({
        planes: {
          Cancelar: {
            holdAt: fail ? 1 : 0,
            ...(fail ? { failAt: 1 } : {}),
            costes: [0.125, 0, 0],
          },
        },
      });
      const response = await s.request({ pregunta: "Cancelar" }, "sse");
      await vi.waitFor(() => expect(s.pending.has("Cancelar")).toBe(true));
      await response.body!.cancel();
      s.release("Cancelar");
      await vi.waitFor(() =>
        expect(s.logs.some((l) => l.evento === "turno_sql")).toBe(true)
      );
      const terminal = s.logs.find((l) => l.evento === "turno_sql")!;
      expect(terminal.estado).toBe("cancelado");
      expect(terminal.coste).toEqual(
        fail
          ? {
            estado: "parcial",
            observadoUsd: 0.125,
            llamadasConCoste: 1,
            llamadasSinCoste: 1,
          }
          : {
            estado: "completo",
            observadoUsd: 0.125,
            llamadasConCoste: 1,
            llamadasSinCoste: 0,
          },
      );
      expect(terminal.uso).toMatchObject({ costoUsd: fail ? null : 0.125 });
      expect(s.providerRequests).toHaveLength(fail ? 2 : 1);
      assertClosed(s);
    },
  );

  it("Given12mensajes válidos del cliente, When engine recorta10, Then hash y providerinput pertenecen al mismo array efectivo", async () => {
    const history = Array.from(
      { length: 12 },
      (_, i) => ({
        rol: i % 2 ? "assistant" : "user",
        texto: "x".repeat(3990) + String(i).padStart(2, "0"),
      }),
    );
    const s = servidorP6();
    const r = await s.json({ historial: history });
    expect(r.status).toBe(200);
    expect(receipt(r.body).historial_sha256).toBe(sha(history.slice(-10)));
    const messages = s.providerRequests[0].body.messages as P6Obj[];
    expect(messages.slice(1, -1)).toEqual(
      history.slice(-10).map((m) => ({ role: m.rol, content: m.texto })),
    );
    assertClosed(s);
  });
});
