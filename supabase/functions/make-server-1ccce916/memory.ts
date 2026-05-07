/**
 * Pure helpers for Esco's long-term memory feature.
 *
 * No Deno, no fetch, no Supabase imports — Vitest can import directly.
 *
 * Companion file (chat.tsx) handles persistence and Telegram inline-button
 * routing. This module owns proposal-payload shaping and text rendering of
 * the MEMORIAS GUARDADAS block injected into the system prompt.
 */

export interface MemoryProposal {
  _memory_proposal: true;
  token: string;
  content: string;
  reason?: string;
}

export interface PersistedMemory {
  id: string;
  content: string;
  created_at: string;
  source_channel?: string;
}

export const MAX_MEMORY_CONTENT_LEN = 500;

function randomToken(): string {
  // Crypto-safe enough for a one-shot client confirmation token; not a secret.
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `mem_${ts}_${rand}`;
}

export function makeMemoryProposal(input: { content: string; reason?: string }): MemoryProposal {
  const trimmed = (input.content ?? '').trim().slice(0, MAX_MEMORY_CONTENT_LEN);
  return {
    _memory_proposal: true,
    token: randomToken(),
    content: trimmed,
    reason: input.reason?.trim() || undefined,
  };
}

export function renderMemoriasBlock(memorias: PersistedMemory[]): string {
  if (!memorias.length) return 'MEMORIAS GUARDADAS DEL USUARIO:\n- Ninguna por ahora.';
  const lines = memorias
    .slice(0, 50)
    .map((m, i) => `${i + 1}. [${m.id.slice(0, 8)}] ${m.content}`)
    .join('\n');
  return `MEMORIAS GUARDADAS DEL USUARIO:\n${lines}`;
}
