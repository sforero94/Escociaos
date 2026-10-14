import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@/types/database';
import { actualizarGastoSeguro, BASE_GASTO_AUSENTE, CONFLICTO_GASTO } from '@/utils/actualizarGastoSeguro';

const original = { id: 'expense-a', updated_at: '2026-10-01T10:00:00.000Z', valor: 20 };
const next = '2026-10-10T10:00:00.000Z';
function fixture(response: unknown, status = 200) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(response), { status,
    headers: { 'Content-Type': 'application/json' } }));
  const client = createClient<Database>('https://expenses.invalid', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
  });
  return { client, fetch };
}
describe('gasto optimistic update through actual Supabase HTTP serialization', () => {
  it('PATCHes with both original id/version filters and requires one changed matching row', async () => {
    const { client, fetch } = fixture([{ id: original.id, updated_at: next }]);
    const result = await actualizarGastoSeguro(client, original.id, original, { nombre: 'edited', valor: 25 }, 25);
    expect(result.id).toBe(original.id); expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const query = new URL(url).searchParams;
    expect(request.method).toBe('PATCH'); expect(query.get('id')).toBe(`eq.${original.id}`);
    expect(query.get('updated_at')).toBe(`eq.${original.updated_at}`); expect(query.get('select')).toBe('id,updated_at');
    expect(new Headers(request.headers).get('prefer')).toContain('return=representation');
    const body = JSON.parse(request.body as string); expect(body.nombre).toBe('edited');
    expect(body.updated_at).not.toBe(original.updated_at);
  });
  it.each([[], null, [null], [1], [{ id: original.id, updated_at: next }, { id: original.id, updated_at: next }],
    [{ id: 'foreign', updated_at: next }], [{ id: original.id, updated_at: original.updated_at }],
    [{ id: original.id, updated_at: '2026-10-01T10:00:00+00:00' }], [{ id: original.id }],
    [{ id: original.id, updated_at: 'not-a-time' }]])('refuses unconfirmed or unchanged responses (%j)', async rows => {
    const { client } = fixture(rows);
    await expect(actualizarGastoSeguro(client, original.id, original, {}, 20)).rejects.toThrow(CONFLICTO_GASTO);
  });
  it.each([NaN, Infinity, -Infinity, 0, -1])('blocks invalid expense amounts before HTTP (%s)', async amount => {
    const { client, fetch } = fixture([]);
    await expect(actualizarGastoSeguro(client, original.id, original, {}, amount)).rejects.toThrow('número finito');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([null, { ...original, id: 'foreign' }, { ...original, updated_at: '' }])('does not synthesize a revision for incomplete/foreign baselines', async base => {
    const { client, fetch } = fixture([]);
    await expect(actualizarGastoSeguro(client, original.id, base, {}, 20)).rejects.toThrow(BASE_GASTO_AUSENTE);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps PostgreSQL microsecond precision and canonicalizes equivalent offsets', async () => {
    const base = { ...original, updated_at: '2026-10-01T10:00:00.000001+00:00' };
    const changed = fixture([{ id: original.id, updated_at: '2026-10-01T10:00:00.000002Z' }]);
    await expect(actualizarGastoSeguro(changed.client, original.id, base, {}, 20)).resolves.toMatchObject({ id: original.id });
    const equivalent = fixture([{ id: original.id, updated_at: '2026-10-01T05:00:00.000001-05:00' }]);
    await expect(actualizarGastoSeguro(equivalent.client, original.id, base, {}, 20)).rejects.toThrow(CONFLICTO_GASTO);
  });
  it('preserves SDK authorization errors as failures', async () => {
    const { client } = fixture({ message: 'permission denied', code: '42501' }, 403);
    await expect(actualizarGastoSeguro(client, original.id, original, {}, 20)).rejects.toMatchObject({ code: '42501' });
  });
});
