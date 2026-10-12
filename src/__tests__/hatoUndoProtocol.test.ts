import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { prepareHatoUndo, postHatoUndo, resolveHatoUndo, validateHatoUndoAttempt, type HatoUndoAttempt, type HatoUndoClient, type HatoUndoProof } from '@/utils/hato/hatoUndoProtocol';

const actor = '10000000-0000-4000-8000-000000000001';
const target = '20000000-0000-4000-8000-000000000001';
const key = '30000000-0000-4000-8000-000000000001';
const step = '40000000-0000-4000-8000-000000000001';
const proof: HatoUndoProof = { actor, sender: 123, operation: 'event', target_id: target, snapshot: {
  target: { id: target, fuente: 'telegram', tipo: 'celo', tipo_servicio: null, cria_destino: null,
    chequeo_vaca_id: null, cria_id: null, alerta_id: null, transaccion_ganado_id: null, datos: {} }, steps: [],
} };
const attempt: HatoUndoAttempt = { version: 1, key, payload: proof };
const receipt = { actor, sender: 123, request_key: key, operation: 'event', target_id: target,
  before: proof.snapshot, after: { target: null, steps: [] } };
function harness(handler: (name: string, body: Record<string, unknown>) => unknown | Promise<unknown>) {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const client = createClient('https://hato-undo.synthetic.invalid', 'synthetic-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const name = new URL(String(input)).pathname.split('/').at(-1)!;
      const body = JSON.parse(String(init?.body)); calls.push({ name, body });
      const result = await handler(name, body);
      return result instanceof Response ? result : new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  return { client: client as HatoUndoClient, calls };
}
describe('Hato undo local adapter through real Supabase transport', () => {
  it('prepares server canonical proof and preserves it verbatim', async () => {
    const h = harness(() => proof);
    const prepared = await prepareHatoUndo(h.client, 123, 'event', target);
    expect(prepared.payload).toEqual(proof); expect(prepared.key).toMatch(/^[a-f0-9-]{36}$/);
    expect(h.calls).toEqual([{ name: 'fn_hato_undo_prepare', body: { p_sender: 123, p_operation: 'event', p_target_id: target } }]);
  });
  it('retries lost response using exact original key/payload without preparing again', async () => {
    let lost = true;
    const h = harness(() => { if (lost) throw new Error('lost'); return receipt; });
    const original = JSON.stringify(attempt);
    await expect(postHatoUndo(h.client, 123, attempt)).rejects.toThrow(); lost = false;
    expect(await postHatoUndo(h.client, 123, attempt)).toEqual(receipt);
    expect(h.calls).toHaveLength(2); expect(h.calls[0]).toEqual(h.calls[1]); expect(JSON.stringify(attempt)).toBe(original);
    expect(h.calls[0].body).toEqual({ p_sender: 123, p_request_key: key, p_payload: proof });
  });
  it.each([null, {}, { ...receipt, actor: target }, { ...receipt, sender: 456 }, { ...receipt, request_key: actor },
    { ...receipt, target_id: actor }, { ...receipt, operation: 'treatment' }, { ...receipt, before: { ...proof.snapshot, steps: [{}] } },
    { ...receipt, after: { target: {}, steps: [] } }, { ...receipt, extra: true }])('unknown/mismatched receipt retains attempt %j', async value => {
    const h = harness(() => value); const before = JSON.stringify(attempt);
    await expect(postHatoUndo(h.client, 123, attempt)).rejects.toThrow(); expect(JSON.stringify(attempt)).toBe(before);
  });
  it('explicit cancellation validates original request and permits caller review before a fresh prepare', async () => {
    const h = harness(name => name === 'fn_hato_undo_resolve' ? { state: 'cancelled', request_key: key, operation: 'event' } : proof);
    expect(await resolveHatoUndo(h.client, 123, attempt)).toEqual({ state: 'cancelled' });
    const fresh = await prepareHatoUndo(h.client, 123, 'event', target);
    expect(fresh.key).not.toBe(key); expect(h.calls.map(c => c.name)).toEqual(['fn_hato_undo_resolve', 'fn_hato_undo_prepare']);
  });
  it('committed resolution verifies the full original receipt without a second mutation', async () => {
    const h = harness(() => ({ state: 'committed', request_key: key, operation: 'event', receipt }));
    expect(await resolveHatoUndo(h.client, 123, attempt)).toEqual({ state: 'committed', receipt });
    expect(h.calls.map(c => c.name)).toEqual(['fn_hato_undo_resolve']);
  });
  it.each([null, {}, { state: 'cancelled', request_key: actor, operation: 'event' },
    { state: 'cancelled', request_key: key, operation: 'event', extra: true },
    { state: 'cancelled', request_key: key, operation: 'treatment' },
    { state: 'committed', request_key: key, operation: 'event', receipt: { ...receipt, actor: target } },
    { state: 'missing', request_key: key, operation: 'event' }])('malformed status keeps original attempt %j', async value => {
    const h = harness(() => value); const before = JSON.stringify(attempt);
    await expect(resolveHatoUndo(h.client, 123, attempt)).rejects.toThrow(); expect(JSON.stringify(attempt)).toBe(before);
  });
  it('changed Telegram sender refuses before RPC for post and resolution', async () => {
    const h = harness(() => receipt);
    await expect(postHatoUndo(h.client, 456, attempt)).rejects.toThrow('otra cuenta');
    await expect(resolveHatoUndo(h.client, 456, attempt)).rejects.toThrow('otra cuenta'); expect(h.calls).toEqual([]);
  });
  it.each([0, -1, NaN, Infinity, 9007199254740992])('invalid sender %s refuses before transport', async sender => {
    const h = harness(() => proof);
    await expect(prepareHatoUndo(h.client, sender, 'event', target)).rejects.toThrow(); expect(h.calls).toEqual([]);
  });
  it.each([{ ...proof, actor: 'invalid' }, { ...proof, sender: 456 }, { ...proof, target_id: actor },
    { ...proof, extra: true }, { ...proof, snapshot: { ...proof.snapshot, target: { ...proof.snapshot.target, datos: { pajilla_uso_id: key } } } },
    { ...proof, snapshot: { ...proof.snapshot, target: { ...proof.snapshot.target, tipo: 'servicio', tipo_servicio: 'inseminacion' } } },
    { ...proof, snapshot: { ...proof.snapshot, target: { ...proof.snapshot.target, cria_id: actor } } }])('canonical prepare refuses foreign or coupled proof %j', async value => {
    const h = harness(() => value);
    await expect(prepareHatoUndo(h.client, 123, 'event', target)).rejects.toThrow();
  });
  it('treatment accepts exact unexecuted step set and rejects duplicate/foreign/executed/null-less steps', async () => {
    const treatment: HatoUndoProof = { ...proof, operation: 'treatment', snapshot: {
      target: { id: target, fuente: 'telegram', estado: 'activo', chequeo_id: null },
      steps: [{ id: step, tratamiento_id: target, fecha_ejecutada: null }],
    } };
    const h = harness(() => treatment);
    expect((await prepareHatoUndo(h.client, 123, 'treatment', target)).payload).toEqual(treatment);
    for (const steps of [[treatment.snapshot.steps[0], treatment.snapshot.steps[0]], [{ id: step, tratamiento_id: actor, fecha_ejecutada: null }],
      [{ id: step, tratamiento_id: target, fecha_ejecutada: '2026-01-01' }], [{ id: step, tratamiento_id: target }]]) {
      const invalid = harness(() => ({ ...treatment, snapshot: { ...treatment.snapshot, steps } }));
      await expect(prepareHatoUndo(invalid.client, 123, 'treatment', target)).rejects.toThrow();
    }
  });
  it.each([null, {}, { ...attempt, version: 2 }, { ...attempt, key: 'invalid' },
    { ...attempt, extra: true }, { ...attempt, payload: { ...proof, snapshot: { target: proof.snapshot.target } } }])('invalid durable attempt refuses before transport %j', async value => {
    const h = harness(() => receipt);
    expect(() => validateHatoUndoAttempt(value, 123)).toThrow();
    await expect(postHatoUndo(h.client, 123, value as HatoUndoAttempt)).rejects.toThrow();
    await expect(resolveHatoUndo(h.client, 123, value as HatoUndoAttempt)).rejects.toThrow();
    expect(h.calls).toEqual([]);
  });
  it.each([500, 403])('transport HTTP %s preserves the original attempt for retry or explicit resolution', async status => {
    const h = harness(() => new Response(JSON.stringify({ message: 'synthetic unavailable' }), { status, headers: { 'Content-Type': 'application/json' } }));
    const original = JSON.stringify(attempt);
    await expect(postHatoUndo(h.client, 123, attempt)).rejects.toThrow('pendiente');
    await expect(resolveHatoUndo(h.client, 123, attempt)).rejects.toThrow('pendiente');
    expect(JSON.stringify(attempt)).toBe(original);
    expect(h.calls.map(c => c.name)).toEqual(['fn_hato_undo', 'fn_hato_undo_resolve']);
  });
  it('failed message edit after persistence can replay the same receipt without fresh preparation', async () => {
    const h = harness(() => receipt);
    const committed = await postHatoUndo(h.client, 123, attempt);
    await expect(Promise.reject(new Error('synthetic Telegram edit failed'))).rejects.toThrow();
    expect(await postHatoUndo(h.client, 123, attempt)).toEqual(committed);
    expect(h.calls[0]).toEqual(h.calls[1]);
  });
  it('reordered JSON object keys accept the same canonical snapshot', async () => {
    const h = harness(() => ({ ...receipt, before: { steps: [], target: Object.fromEntries(Object.entries(proof.snapshot.target).reverse()) } }));
    expect(await postHatoUndo(h.client, 123, attempt)).toMatchObject({ actor, request_key: key });
  });
  it('server authorization refusal never starts an alternate delete or fresh attempt', async () => {
    const h = harness(() => new Response(JSON.stringify({ message: 'Current active Gerencia required', code: '42501' }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    await expect(postHatoUndo(h.client, 123, attempt)).rejects.toThrow('pendiente'); expect(h.calls.map(c => c.name)).toEqual(['fn_hato_undo']);
  });
});
