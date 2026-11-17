import { describe, expect, it } from "vitest";
import { leerRespuestaEscoSql } from "../supabase/functions/server/telegram/escoSqlContrato.ts";
import { solicitarEscoSql } from "../supabase/functions/server/telegram/escoSqlCliente.ts";
import { hashHistorialSql } from "../utils/escoSql/turno";
const uso = { llamadas: 1, entrada: 1, salida: 1, costoUsd: 0 };
const receipt = (hash: string, estado = "completado") => ({
  version: 1,
  turno_id: "11111111-1111-4111-8111-111111111111",
  canal: "telegram",
  historial_sha256: hash,
  estado,
  uso,
  coste: {
    estado: "completo",
    observadoUsd: 0,
    llamadasConCoste: 1,
    llamadasSinCoste: 0,
  },
});
const respuesta = (recibo: unknown) => ({
  motor: "sql",
  texto: "Respuesta sintética",
  bloques: [],
  consultas: [],
  sugerencias: [],
  ms: 1,
  uso,
  recibo,
});
describe("P6 backend: recibo de transporte Telegram", () => {
  it("HTTP200 con recibo de error no es una respuesta satisfactoria", async () => {
    const recibo = receipt(await hashHistorialSql([]), "error");
    expect(() => leerRespuestaEscoSql(respuesta(recibo))).toThrow();
  });
  it.each([200, 502])(
    "un recibo de otrohistorial no se acepta: HTTP%s",
    async (status) => {
      const input = {
        url: "https://fixture.invalid",
        credencialServicio: "synthetic",
        secreto: "synthetic",
        usuarioId: "11111111-1111-4111-8111-111111111111",
        pregunta: "Pregunta",
        historial: [],
        fetcher: async () =>
          Response.json(
            respuesta(
              receipt("f".repeat(64), status === 200 ? "completado" : "error"),
            ),
            { status },
          ),
      };
      await expect(solicitarEscoSql(input)).rejects.toMatchObject({
        recibo: null,
      });
    },
  );
  it("conserva recibo exacto de respuesta completada para el historial saliente", async () => {
    const recibo = receipt(await hashHistorialSql([]));
    const r = await solicitarEscoSql({
      url: "https://fixture.invalid",
      credencialServicio: "synthetic",
      secreto: "synthetic",
      usuarioId: "11111111-1111-4111-8111-111111111111",
      pregunta: "Pregunta",
      historial: [],
      fetcher: async () => Response.json(respuesta(recibo)),
    });
    expect(r.recibo).toEqual(recibo);
  });
});
