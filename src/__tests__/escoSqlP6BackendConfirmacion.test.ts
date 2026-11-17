import { describe, expect, it, vi } from "vitest";
import { confirmarParTelegramSql } from "../supabase/functions/server/telegram/escoSqlConfirmacion.ts";
const UID = "11111111-1111-4111-8111-111111111111",
  CID = "22222222-2222-4222-8222-222222222222",
  MID = "33333333-3333-4333-8333-333333333333",
  AID = "44444444-4444-4444-8444-444444444444";
const fecha = "2034-05-08T17:00:00.000Z";
const dato = () => ({
  usuarioId: UID,
  conversationId: CID,
  usuario: {
    id: MID,
    content: "Pregunta sintética",
    created_at: fecha,
    metadata: { motor: "sql" },
  },
  asistente: {
    id: AID,
    content: "Respuesta sintética",
    created_at: "2034-05-08T17:00:01.000Z",
    metadata: { motor: "sql" },
  },
});
function fixture(owner = true, claim = true) {
  const upsert = vi.fn(async () => ({ data: null, error: null }));
  const from = vi.fn((table: string) => {
    const filters = new Map();
    const q = {
      select: vi.fn(),
      eq: vi.fn((k: string, v: string) => {
        filters.set(k, v);
        return q;
      }),
      maybeSingle: vi.fn(async () => ({
        data: table === "chat_conversations"
          ? (owner ? { id: CID } : null)
          : filters.get("id") === MID && claim
          ? {
            id: MID,
            conversation_id: CID,
            role: "user",
            content: "Pregunta sintética",
            created_at: fecha,
            metadata: { motor: "sql_pending" },
          }
          : null,
        error: null,
      })),
      upsert,
    };
    q.select.mockReturnValue(q);
    return q;
  });
  return { from, upsert };
}
describe("P6 backend: confirmación atómica de par", () => {
  it("valida dueño y claim, preserva fecha/contenido y confirma ambos enunbulk", async () => {
    const c = fixture();
    await confirmarParTelegramSql(c, dato());
    expect(c.upsert).toHaveBeenCalledOnce();
    const [rows, options] = c.upsert.mock.calls[0] as unknown as [
      Record<string, unknown>[],
      unknown,
    ];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: MID,
      conversation_id: CID,
      role: "user",
      content: "Pregunta sintética",
      created_at: fecha,
      metadata: { motor: "sql" },
    });
    expect(rows[1]).toMatchObject({
      id: AID,
      role: "assistant",
      conversation_id: CID,
    });
    expect(options).toEqual({ onConflict: "id" });
  });
  it.each([[false, true], [true, false]])(
    "sin dueño/claim confirmado nunca reescribe una PK: %s %s",
    async (o, c) => {
      const s = fixture(o, c);
      await expect(confirmarParTelegramSql(s, dato())).rejects.toThrow();
      expect(s.upsert).not.toHaveBeenCalled();
    },
  );
  it("una confirmación incierta no se reintenta", async () => {
    const s = fixture();
    s.upsert.mockRejectedValue(new Error("SYN_NETWORK"));
    await expect(confirmarParTelegramSql(s, dato())).rejects.toThrow(
      "CONFIRMATION_UNCERTAIN",
    );
    expect(s.upsert).toHaveBeenCalledOnce();
  });
});
