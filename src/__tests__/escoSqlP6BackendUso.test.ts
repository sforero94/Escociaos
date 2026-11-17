import { describe, expect, it, vi } from "vitest";
import { observarClienteSql } from "../../supabase/functions/esco-consultas/manejadorSql.ts";
import type { RespuestaLLM, SolicitudLLM } from "../utils/esco2/llm.ts";
const solicitud: SolicitudLLM = {
  modelo: "fixture",
  esfuerzo: "none",
  mensajes: [],
  maxTokens: 10,
};
const respuesta = (costoUsd: number | null): RespuestaLLM => ({
  texto: "Control sintético",
  llamadas: [],
  uso: { entrada: 2, salida: 3, razonamiento: 0, costoUsd },
  ms: 1,
  modelo: "fixture",
  finishReason: "stop",
});
describe("P6 backend: observación de uso por llamada", () => {
  it("sin recibos no inventa uso ni coste cero", () => {
    const o = observarClienteSql({ completar: vi.fn() });
    expect(o.uso()).toBeNull();
    expect(o.coste()).toEqual({
      estado: "desconocido",
      observadoUsd: null,
      llamadasConCoste: 0,
      llamadasSinCoste: 0,
    });
  });
  it("el cero explícito es coste observado completo", async () => {
    const o = observarClienteSql({
      completar: vi.fn(async () => respuesta(0)),
    });
    await o.cliente.completar(solicitud);
    expect(o.uso()).toEqual({
      llamadas: 1,
      entrada: 2,
      salida: 3,
      costoUsd: 0,
    });
    expect(o.coste()).toEqual({
      estado: "completo",
      observadoUsd: 0,
      llamadasConCoste: 1,
      llamadasSinCoste: 0,
    });
  });
  it.each([null, -0.05, Number.NaN, Number.POSITIVE_INFINITY])(
    "un coste %s nunca se resta o transforma en total conocido",
    async (cost) => {
      const completar = vi.fn().mockResolvedValueOnce(respuesta(0.1))
        .mockResolvedValueOnce(respuesta(cost));
      const o = observarClienteSql({ completar });
      await o.cliente.completar(solicitud);
      await o.cliente.completar(solicitud);
      expect(o.uso()).toEqual({
        llamadas: 2,
        entrada: 4,
        salida: 6,
        costoUsd: null,
      });
      expect(o.coste()).toEqual({
        estado: "parcial",
        observadoUsd: 0.1,
        llamadasConCoste: 1,
        llamadasSinCoste: 1,
      });
    },
  );
  it("un error de transporte conserva subtotal y marca total desconocido sin contar un recibo inexistente", async () => {
    const completar = vi.fn().mockResolvedValueOnce(respuesta(0.2))
      .mockRejectedValueOnce(new Error("SYN_NETWORK"));
    const o = observarClienteSql({ completar });
    await o.cliente.completar(solicitud);
    await expect(o.cliente.completar(solicitud)).rejects.toThrow("SYN_NETWORK");
    expect(o.uso()).toEqual({
      llamadas: 1,
      entrada: 2,
      salida: 3,
      costoUsd: null,
    });
    expect(o.coste()).toEqual({
      estado: "parcial",
      observadoUsd: 0.2,
      llamadasConCoste: 1,
      llamadasSinCoste: 1,
    });
  });
  it("observaciones concurrentes no comparten acumuladores", async () => {
    const a = observarClienteSql({
      completar: vi.fn(async () => respuesta(0.1)),
    });
    const b = observarClienteSql({
      completar: vi.fn(async () => respuesta(null)),
    });
    await Promise.all([
      a.cliente.completar(solicitud),
      b.cliente.completar(solicitud),
    ]);
    expect(a.uso()?.costoUsd).toBe(0.1);
    expect(b.uso()?.costoUsd).toBeNull();
    expect(a.coste().llamadasSinCoste).toBe(0);
  });
  it("la suma no representable no se convierte en coste completo ni Infinity", async () => {
    const o = observarClienteSql({
      completar: vi.fn(async () => respuesta(Number.MAX_VALUE)),
    });
    await o.cliente.completar(solicitud);
    await o.cliente.completar(solicitud);
    expect(o.uso()?.costoUsd).toBeNull();
    expect(o.coste()).toEqual({
      estado: "parcial",
      observadoUsd: Number.MAX_VALUE,
      llamadasConCoste: 1,
      llamadasSinCoste: 1,
    });
  });
});
