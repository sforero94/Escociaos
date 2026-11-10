import { describe, expect, it, vi } from "vitest";
import { manejarSql } from "../../supabase/functions/esco-consultas/manejadorSql.ts";
import type { RespuestaLLM } from "../utils/esco2/llm.ts";
const CTX = {
  turno_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  canal: "telegram" as const,
  historial_sha256: "b".repeat(64),
};
const llmResp = (query = false): RespuestaLLM => ({
  texto: query ? "" : JSON.stringify({ texto: "Control", sugerencias: [] }),
  llamadas: query
    ? [{
      nombre: "consultar_sql",
      argumentos: JSON.stringify({
        sql: "SELECT 1 AS n",
        proposito: "Control sintético",
      }),
    }]
    : [],
  uso: { entrada: 2, salida: 3, razonamiento: 0, costoUsd: 0.125 },
  ms: 1,
  modelo: "fixture",
  finishReason: query ? "tool_calls" : "stop",
});
function entrada() {
  const registrar = vi.fn();
  return {
    cliente: {
      rpc: vi.fn(async () => ({
        data: { filas: [{ n: 1 }], n_filas: 1, truncado: false },
        error: null,
      })),
    },
    llm: { completar: vi.fn(async () => llmResp()) },
    pregunta: "SYN_QUESTION",
    historial: [],
    hoy: "2034-05-08",
    contextoTurno: CTX,
    registrar,
  };
}
describe("P6 backend recibo de turno", () => {
  it("respuesta y registro comparten ID/canal/uso y el log excluye hash/contenido", async () => {
    const s = entrada();
    const r = await manejarSql(s);
    expect(r.estado).toBe(200);
    expect(r.cuerpo.recibo).toMatchObject({
      ...CTX,
      version: 1,
      estado: "completado",
      uso: { llamadas: 1, entrada: 2, salida: 3, costoUsd: 0.125 },
      coste: {
        estado: "completo",
        observadoUsd: 0.125,
        llamadasConCoste: 1,
        llamadasSinCoste: 0,
      },
    });
    expect(r.cuerpo.uso).toEqual((r.cuerpo.recibo as { uso: unknown }).uso);
    const terminal = s.registrar.mock.calls.map((x) => x[0]).find((x) =>
      x.evento === "turno_sql"
    );
    expect(terminal).toMatchObject({
      turno_id: CTX.turno_id,
      canal: "telegram",
      estado: "completado",
      uso: r.cuerpo.uso,
    });
    expect(JSON.stringify(terminal)).not.toMatch(
      /historial_sha256|SYN_QUESTION|SELECT|Control/,
    );
  });
  it("RPC sin acceso tras recibo LLM conserva coste completo y estado error", async () => {
    const s = entrada();
    s.llm.completar.mockResolvedValue(llmResp(true));
    s.cliente.rpc.mockResolvedValue(
      { data: null, error: { code: "42501", message: "SYN_PRIVATE" } } as never,
    );
    const r = await manejarSql(s);
    expect(r.estado).toBe(403);
    expect(r.cuerpo.recibo).toMatchObject({
      ...CTX,
      estado: "error",
      coste: { estado: "completo", observadoUsd: 0.125 },
    });
    expect(r.cuerpo).not.toHaveProperty("bloques");
    expect(JSON.stringify(r.cuerpo)).not.toContain("SYN_PRIVATE");
  });
  it("error de proveedor antes de recibo deja uso desconocido y recibo de error", async () => {
    const s = entrada();
    s.llm.completar.mockRejectedValue(new Error("SYN_PROVIDER"));
    const r = await manejarSql(s);
    expect(r.estado).toBe(502);
    expect(r.cuerpo).toMatchObject({
      uso: null,
      recibo: {
        ...CTX,
        estado: "error",
        uso: null,
        coste: {
          estado: "desconocido",
          observadoUsd: null,
          llamadasConCoste: 0,
          llamadasSinCoste: 1,
        },
      },
    });
  });
  it("sin RPC o cancelado antes de LLM no inventa uso cero", async () => {
    const s = entrada();
    const r = await manejarSql({ ...s, cliente: {} });
    expect(r.estado).toBe(503);
    expect(r.cuerpo).toMatchObject({
      uso: null,
      recibo: { ...CTX, estado: "error", uso: null },
    });
    expect(s.llm.completar).not.toHaveBeenCalled();
    const c = new AbortController();
    c.abort();
    const z = await manejarSql({ ...s, signal: c.signal });
    expect(z.cuerpo.recibo).toMatchObject({ estado: "cancelado", uso: null });
  });
  it("cancelar después de un recibo completo conserva certeza monetaria", async () => {
    const s = entrada();
    const c = new AbortController();
    s.llm.completar.mockImplementation(async () => {
      c.abort();
      return llmResp();
    });
    const r = await manejarSql({ ...s, signal: c.signal });
    expect(r.cuerpo.recibo).toMatchObject({
      estado: "cancelado",
      uso: { costoUsd: 0.125 },
      coste: { estado: "completo", observadoUsd: 0.125, llamadasSinCoste: 0 },
    });
  });
  it("cancelación mientras la llamada queda sin recibo conserva coste desconocido", async () => {
    const s = entrada();
    const c = new AbortController();
    s.llm.completar.mockImplementation(async () => {
      c.abort();
      throw new DOMException("Sintético", "AbortError");
    });
    const r = await manejarSql({ ...s, signal: c.signal });
    expect(r.cuerpo.recibo).toMatchObject({
      estado: "cancelado",
      uso: null,
      coste: { estado: "desconocido", observadoUsd: null, llamadasSinCoste: 1 },
    });
  });
});
