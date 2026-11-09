import { describe, expect, it, vi } from "vitest";
import {
  adaptarIdentidadEscoSql,
  autorizarPerfilEscoSql,
} from "../supabase/functions/server/telegram/escoSqlAcceso.ts";
function fixture(
  telegram: unknown = {
    id: "linked",
    usuario_id: "actor",
    modulos_permitidos: ["consultas"],
    activo: true,
  },
  perfil: unknown = { id: "actor", rol: "Gerencia", activo: true },
) {
  const from = vi.fn((tabla: string) => {
    const q = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: tabla === "telegram_usuarios" ? telegram : perfil,
        error: null,
      })),
    };
    q.select.mockReturnValue(q);
    q.eq.mockReturnValue(q);
    return q;
  });
  return { from };
}
describe("P5 acceso fresco unitario", () => {
  it("exige el vínculo resuelto y perfil Gerencia activo", async () => {
    const c = fixture();
    expect(await autorizarPerfilEscoSql(c, 11, "actor", "linked")).toBe(true);
    expect(c.from.mock.calls.map((x) => x[0])).toEqual([
      "telegram_usuarios",
      "usuarios",
    ]);
  });
  it.each([{
    id: "linked",
    usuario_id: "otro",
    modulos_permitidos: ["consultas"],
    activo: true,
  }, {
    id: "linked",
    usuario_id: "actor",
    modulos_permitidos: [],
    activo: true,
  }, {
    id: "linked",
    usuario_id: "actor",
    modulos_permitidos: ["consultas"],
    activo: false,
  }, null])(
    "revocación o desvínculo impide acceso antes del perfil",
    async (telegram) => {
      const c = fixture(telegram);
      expect(await autorizarPerfilEscoSql(c, 11, "actor", "linked")).toBe(
        false,
      );
      expect(c.from).toHaveBeenCalledOnce();
    },
  );
  it.each([{ id: "actor", rol: "Administrador", activo: true }, {
    id: "actor",
    rol: "Gerencia",
    activo: false,
  }, null])("perfil no autorizado falla cerrado", async (p) => {
    expect(
      await autorizarPerfilEscoSql(
        fixture(undefined, p),
        11,
        "actor",
        "linked",
      ),
    ).toBe(false);
  });
  it("adapta el thenable del SDK a Promise y valida los campos del vínculo", async () => {
    const client = adaptarIdentidadEscoSql(
      fixture({
        id: "linked",
        usuario_id: "actor",
        nombre_display: "Cuenta sintética",
      }),
    );
    const promise = client.from("telegram_usuarios").select(
      "id,usuario_id,nombre_display",
    ).eq("telegram_id", 11).eq("activo", true).maybeSingle();
    expect(promise).toBeInstanceOf(Promise);
    expect(await promise).toEqual({
      data: {
        id: "linked",
        usuario_id: "actor",
        nombre_display: "Cuenta sintética",
      },
      error: null,
    });
    const bad = adaptarIdentidadEscoSql(
      fixture({ id: 123, usuario_id: "actor" }),
    );
    expect(
      await bad.from("telegram_usuarios").select("id,usuario_id,nombre_display")
        .eq("telegram_id", 11).eq("activo", true).maybeSingle(),
    ).toMatchObject({
      data: null,
      error: { message: "TELEGRAM_IDENTITY_LOOKUP_FAILED" },
    });
  });
});
