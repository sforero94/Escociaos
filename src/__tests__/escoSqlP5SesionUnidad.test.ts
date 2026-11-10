import { describe, expect, it } from "vitest";
import {
  consumirBotonSql,
  crearBotonesSql,
} from "../supabase/functions/server/telegram/escoSqlSesion.ts";
const identidad = {
  usuarioId: "actor",
  telegramId: 11,
  chatId: 22,
  messageId: 33,
};
describe("P5 sesión de botones unitaria", () => {
  it("callback pequeño, ligado a identidad y mensaje, consumible una vez", () => {
    const r = crearBotonesSql(undefined, {
      ...identidad,
      opciones: ["Ver detalle"],
      consultas: [],
      ahora: 100,
      token: "a".repeat(32),
    });
    expect(new TextEncoder().encode(r.botones[0].callback_data).length)
      .toBeLessThanOrEqual(64);
    expect(
      consumirBotonSql(r.estado, r.botones[0].callback_data, {
        ...identidad,
        telegramId: 12,
      }, 101),
    ).toBeNull();
    expect(
      consumirBotonSql(r.estado, r.botones[0].callback_data, identidad, 101),
    ).toEqual({ tipo: "pregunta", texto: "Ver detalle" });
    expect(
      consumirBotonSql(r.estado, r.botones[0].callback_data, identidad, 102),
    ).toBeNull();
  });
  it("vence a los quince minutos y versión desconocida falla cerrada", () => {
    const r = crearBotonesSql(undefined, {
      ...identidad,
      opciones: ["Otra"],
      consultas: [],
      ahora: 0,
      token: "a".repeat(32),
    });
    expect(
      consumirBotonSql(r.estado, r.botones[0].callback_data, identidad, 900000),
    ).toBeNull();
    expect(
      consumirBotonSql(
        { version: 2, mensajes: {} },
        r.botones[0].callback_data,
        identidad,
        1,
      ),
    ).toBeNull();
  });
  it("Ver consultas contiene solo trace saneada, sin filas, y no vuelve al modelo", () => {
    const r = crearBotonesSql(undefined, {
      ...identidad,
      opciones: [],
      consultas: [{
        sql: "SELECT 1",
        proposito: "Control",
        n_filas: 1,
        truncado: false,
        error: null,
        ms: 1,
        filas: ["NO"],
      }],
      ahora: 1,
      token: "a".repeat(32),
    });
    const accion = consumirBotonSql(
      r.estado,
      r.botones[0].callback_data,
      identidad,
      2,
    );
    expect(accion).toMatchObject({
      tipo: "consultas",
      consultas: [{ sql: "SELECT 1", n_filas: 1 }],
    });
    expect(JSON.stringify(accion)).not.toContain("NO");
  });
});
