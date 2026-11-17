import { describe, expect, it, vi } from "vitest";
import { obtenerConversacionTelegramSql } from "../supabase/functions/server/telegram/escoSqlConversacion.ts";
const UID = "11111111-1111-4111-8111-111111111111";
const CID = "22222222-2222-4222-8222-222222222222";
function client(row: unknown = { id: CID }) {
  const eq = vi.fn();
  const q = {
    eq,
    select: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    single: vi.fn(async () => ({ data: row, error: null })),
  };
  eq.mockReturnValue(q);
  q.select.mockReturnValue(q);
  const insert = vi.fn(() => q);
  const from = vi.fn(() => ({ select: q.select, insert }));
  return { from, eq, insert, q };
}
describe("P6 backend: contexto SQL aislado", () => {
  it("sin selección crea conversación nueva y nunca busca la reciente de4horas", async () => {
    const c = client();
    expect(await obtenerConversacionTelegramSql(c, UID)).toBe(CID);
    expect(c.insert).toHaveBeenCalledWith({
      user_id: UID,
      title: "Telegram SQL",
    });
    expect(c.eq).not.toHaveBeenCalled();
  });
  it("cada uso seleccionado vuelve a filtrar por ID y dueño", async () => {
    const c = client();
    expect(await obtenerConversacionTelegramSql(c, UID, CID)).toBe(CID);
    expect(c.eq.mock.calls).toEqual([["id", CID], ["user_id", UID]]);
    expect(c.insert).not.toHaveBeenCalled();
  });
  it("una selección eliminada/ajena no se reemplaza silenciosamente ni creaotra", async () => {
    const c = client(null);
    await expect(obtenerConversacionTelegramSql(c, UID, CID)).rejects.toThrow(
      "ESCO_SQL_CONVERSATION_UNAVAILABLE",
    );
    expect(c.insert).not.toHaveBeenCalled();
  });
});
