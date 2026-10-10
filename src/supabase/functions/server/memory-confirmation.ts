import { makeMemoryProposal, type MemoryProposal } from './memory.ts';
import { cuentaActivaTelegram } from './telegram/cuentaActivaTelegram.ts';

interface MemoryClient {
  from(table: string): unknown;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^mem_[0-9a-z]{1,10}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export interface MemoryConfirmation { saved: true; id: string; saved_at: string; content: string; replayed: boolean; }

async function rpc(client: MemoryClient, name: string, args?: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error('No se pudo verificar la confirmación de memoria.');
  return data;
}
async function purge(client: MemoryClient) {
  // Receipt retention is 168 hours, separate from the 30-minute proposal TTL.
  // SQL deletes expired proposal/receipt rows; encoded issuance expiry prevents
  // re-registration of a historical token. Scheduled cleanup also runs in quiet periods.
  await rpc(client, 'esco_purge_memory_confirmation_payloads');
}
export async function registrarPropuestaMemoria(client: MemoryClient, userId: string | undefined, input: { content: string; reason?: string }): Promise<MemoryProposal> {
  if (!userId || !UUID.test(userId) || typeof input.content !== 'string' || !input.content.trim()) {
    throw new Error('Usuario y contenido válidos son requeridos.');
  }
  const proposal = makeMemoryProposal({ content: input.content, reason: typeof input.reason === 'string' ? input.reason.slice(0, 500) : undefined });
  // Ignore model-supplied tokens: the trusted caller creates the exact token.
  proposal.token = `mem_${Date.now().toString(36)}_${crypto.randomUUID()}`;
  await purge(client);
  const data = await rpc(client, 'esco_register_memory_proposal', {
    p_owner_id: userId, p_token: proposal.token, p_content: proposal.content, p_reason: proposal.reason ?? null,
  });
  if (!data || typeof data !== 'object') throw new Error('No se confirmó la propuesta de memoria.');
  const result = data as Record<string, unknown>;
  if (result._memory_proposal !== true || result.token !== proposal.token || result.content !== proposal.content
    || (result.reason ?? undefined) !== proposal.reason) throw new Error('No se confirmó la propuesta de memoria.');
  return proposal;
}
/** Called only by the actual Telegram human callback, never by an LLM tool. */
export async function confirmarMemoriaTelegram(client: MemoryClient, sender: number | undefined, token: string): Promise<MemoryConfirmation> {
  if (!TOKEN.test(token)) throw new Error('Propuesta inválida o expirada.');
  const account = await cuentaActivaTelegram(client, sender, 'consultas');
  if (!account || account.rol !== 'Gerencia') throw new Error('No pude verificar tu acceso actual a Esco.');
  await purge(client);
  // The DB independently rechecks the current registration/owner/role/module,
  // locks the exact proposal, and writes memory + consume + receipt atomically.
  const data = await rpc(client, 'esco_confirm_telegram_memory', {
    p_owner_id: account.usuarioId, p_telegram_id: sender, p_token: token,
  });
  if (!data || typeof data !== 'object') throw new Error('No se confirmó la memoria guardada.');
  const result = data as Record<string, unknown>;
  if (result.saved !== true || typeof result.id !== 'string' || !UUID.test(result.id)
    || typeof result.saved_at !== 'string' || !Number.isFinite(Date.parse(result.saved_at))
    || typeof result.content !== 'string' || !result.content || result.content.length > 500
    || typeof result.replayed !== 'boolean') throw new Error('No se confirmó la memoria guardada.');
  return result as unknown as MemoryConfirmation;
}
