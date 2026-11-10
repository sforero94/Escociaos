import { describe, expect, it, vi } from "vitest";
import {
  historialEscoSql,
  idTurnoTelegramSql,
  seleccionarMotorTelegram,
  solicitarEscoSql,
} from "../supabase/functions/server/telegram/escoSqlCliente.ts";
const RESPUESTA = {
  motor: "sql",
  texto: "Resultado sintético",
  bloques: [],
  sugerencias: [],
  consultas: [],
  ms: 2,
};
describe("P5 cliente HTTP unitario", () => {
  it("solo el valor sql habilita la puerta nueva", () => {
    expect(
      ["legacy", undefined, "", "SQL", "otro"].map(seleccionarMotorTelegram),
    ).toEqual([false, false, false, false, false]);
    expect(seleccionarMotorTelegram("sql")).toBe(true);
  });
  it("envía identidad confiable y configuración únicamente a la puerta del motor", async () => {
    const fetcher = vi.fn(async () => Response.json(RESPUESTA));
    await solicitarEscoSql({
      url: "https://fixture.supabase.co",
      credencialServicio: "servicio-fixture",
      secreto: "secreto-fixture",
      usuarioId: "11111111-1111-4111-8111-111111111111",
      pregunta: "Pregunta sintética",
      historial: [],
      fetcher,
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://fixture.supabase.co/functions/v1/esco-consultas");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer servicio-fixture",
      "x-esco-telegram-secret": "secreto-fixture",
      Accept: "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      motor: "sql",
      usuario_id: "11111111-1111-4111-8111-111111111111",
      pregunta: "Pregunta sintética",
      historial: [],
    });
  });
  it("falta configuración falla antes del fetch y error remoto no filtra detalles", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: "DETALLE_PRIVADO" }, { status: 503 })
    );
    const input = {
      url: "https://fixture.supabase.co",
      credencialServicio: "servicio-fixture",
      secreto: "",
      usuarioId: "11111111-1111-4111-8111-111111111111",
      pregunta: "Pregunta",
      historial: [],
      fetcher,
    };
    await expect(solicitarEscoSql(input)).rejects.toThrow("configurada");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(solicitarEscoSql({ ...input, secreto: "fixture" })).rejects
      .toThrow("disponible");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("historial solo usa pares SQL; lleva el SQL usado, nunca filas ni herramientas", () => {
    expect(
      historialEscoSql([
        { role: "system", content: "oculto" },
        { role: "tool", content: "oculto" },
        { role: "user", content: "Pregunta", metadata: { motor: "sql" } },
        {
          role: "assistant",
          content: "Texto",
          metadata: {
            motor: "sql",
            consultas: [{ sql: "privado" }],
            bloques: [{ filas: ["privado"] }],
          },
        },
        {
          role: "assistant",
          content: "Legacy",
          metadata: { tool_interactions: ["privado"] },
        },
      ]),
    ).toEqual([{ rol: "user", texto: "Pregunta" }, {
      rol: "assistant",
      texto: "Texto\n\n[Consultas SQL que usé en este turno]\nprivado",
    }]);
  });
  it("rechaza una respuesta declarada demasiado grande antes de consumirla", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(RESPUESTA, { headers: { "Content-Length": "5000000" } })
    );
    await expect(solicitarEscoSql({
      url: "https://fixture.supabase.co",
      credencialServicio: "servicio-fixture",
      secreto: "secreto-fixture",
      usuarioId: "11111111-1111-4111-8111-111111111111",
      pregunta: "Control",
      historial: [],
      fetcher,
    })).rejects.toThrow("tamaño");
  });
  it("la clave durable del turno es estable y cambia con actor o mensaje", async () => {
    const a = await idTurnoTelegramSql("actor", "chat", "message");
    expect(a).toMatch(/^[a-f0-9-]{36}$/);
    expect(await idTurnoTelegramSql("actor", "chat", "message")).toBe(a);
    expect(await idTurnoTelegramSql("otro", "chat", "message")).not.toBe(a);
  });
});
