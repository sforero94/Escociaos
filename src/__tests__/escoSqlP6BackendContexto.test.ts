import { describe, expect, it, vi } from "vitest";
import { resolverContextoTelegramSql } from "../supabase/functions/server/telegram/escoSqlContexto.ts";
const identidad = {
  usuarioId: "11111111-1111-4111-8111-111111111111",
  telegramId: 123,
  chatId: 123,
};
function fixture(pointer: string | null = "previous") {
  let current = pointer;
  const writes: unknown[] = [];
  const insert = vi.fn(async (row: Record<string, unknown>) => {
    writes.push(row);
    if (current) return { error: { code: "23505" } };
    current = (row.session as Record<string, unknown>).conversationId as string;
    return { error: null };
  });
  const upsert = vi.fn(async (row: Record<string, unknown>) => {
    writes.push(row);
    current = (row.session as Record<string, unknown>).conversationId as string;
    return { error: null };
  });
  const from = vi.fn((table: string) => {
    const q = {
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: table === "telegram_sessions"
          ? (current
            ? { session: { version: 1, ...identidad, conversationId: current } }
            : null)
          : { id: current },
        error: null,
      })),
      select: vi.fn(),
      insert,
      upsert,
    };
    q.eq.mockReturnValue(q);
    q.select.mockReturnValue(q);
    return q;
  });
  const crear = vi.fn(async () => "new");
  return {
    from,
    insert,
    upsert,
    crear,
    writes,
    setCurrent: (id: string) => {
      current = id;
    },
  };
}
describe("P6 backend: autoridad de contexto independiente de sesión cache", () => {
  it("lectura ordinaria nunca escribe la autoridad ya existente", async () => {
    const f = fixture();
    expect(await resolverContextoTelegramSql(f, identidad, f.crear)).toBe(
      "previous",
    );
    expect(f.crear).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
  });
  it("inicialización usa insert y no reemplaza un contexto concurrente", async () => {
    const f = fixture(null);
    expect(await resolverContextoTelegramSql(f, identidad, f.crear)).toBe(
      "new",
    );
    expect(f.insert).toHaveBeenCalledOnce();
    expect(f.upsert).not.toHaveBeenCalled();
  });
  it("callback sin autoridad falla sin inicializar ni escribir", async () => {
    const f = fixture(null);
    await expect(
      resolverContextoTelegramSql(f, identidad, f.crear, false, true),
    ).rejects.toThrow();
    expect(f.crear).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
  });
  it("conflicto inicial lee al ganador en vez de reemplazarlo", async () => {
    const f = fixture(null);
    f.crear.mockImplementation(async () => {
      f.setCurrent("winner");
      return "new";
    });
    expect(await resolverContextoTelegramSql(f, identidad, f.crear)).toBe(
      "winner",
    );
    expect(f.insert).toHaveBeenCalledOnce();
    expect(f.upsert).not.toHaveBeenCalled();
  });
  it("reset explícito es la única ruta que hace upsert de autoridad", async () => {
    const f = fixture();
    expect(await resolverContextoTelegramSql(f, identidad, f.crear, true)).toBe(
      "new",
    );
    expect(f.upsert).toHaveBeenCalledOnce();
    expect(f.insert).not.toHaveBeenCalled();
  });
  it("insert de resultado incierto corta sin reintentar escritura", async () => {
    const f = fixture(null);
    f.insert.mockResolvedValue({ error: { code: "SYN_UNCERTAIN" } });
    await expect(resolverContextoTelegramSql(f, identidad, f.crear)).rejects
      .toThrow();
    expect(f.insert).toHaveBeenCalledOnce();
    expect(f.upsert).not.toHaveBeenCalled();
  });
});
