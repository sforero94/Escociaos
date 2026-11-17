import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSupabase } from '../utils/supabase/client';
import { enviarMensajeSql, ErrorTurnoSqlWeb, leerStreamSql } from '../utils/escoSqlChatService';
import { construirHistorialSql, normalizarHistorialEfectivoSql } from '../utils/escoSql/historial';
import { hashHistorialSql, type ReciboTurnoSql } from '../utils/escoSql/turno';
import { leerMetadataSql } from '../utils/escoSqlChat';
vi.mock('../utils/supabase/client', () => ({ getSupabase: vi.fn() }));
const USER = '11111111-1111-4111-8111-111111111111', CONV = '22222222-2222-4222-8222-222222222222', TURN = '33333333-3333-4333-8333-333333333333';
const usage = { llamadas: 1, entrada: 2, salida: 3, costoUsd: 0 };
const receipt = async (history: unknown[], state: ReciboTurnoSql['estado'] = 'completado'): Promise<ReciboTurnoSql> => ({ version: 1, turno_id: TURN, canal: 'web', historial_sha256: await hashHistorialSql(normalizarHistorialEfectivoSql(history)), estado: state, uso: usage, coste: { estado: 'completo', observadoUsd: 0, llamadasConCoste: 1, llamadasSinCoste: 0 } });
function db(rows: Record<string, unknown>[] = [], saveFails = false) {
 const stored: Record<string, unknown>[][] = [], query: unknown[][] = [];
 const owner = { eq: (key: string, value: unknown) => { query.push(['owner', key, value]); return owner; }, maybeSingle: async () => ({ data: { id: CONV }, error: null }) };
 const history = { eq: (key: string, value: unknown) => { query.push(['eq', key, value]); return history; }, in: (key: string, values: unknown[]) => { query.push(['in', key, values]); return history; }, order: (key: string, value: unknown) => { query.push(['order', key, value]); return history; }, limit: async (n: number) => { query.push(['limit', n]); return { data: rows, error: null }; } };
 const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic', user: { id: USER } } } }) }, from: (table: string) => table === 'chat_conversations' ? { select: () => owner, insert: () => ({ select: () => ({ single: async () => ({ data: { id: CONV }, error: null }) }) }) } : { select: () => history, insert: async (r: Record<string, unknown>[]) => { stored.push(r); return { error: saveFails ? { message: 'synthetic write outcome unknown' } : null }; } } };
 vi.mocked(getSupabase).mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);
 return { stored, query };
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('P6 web context and receipts', () => {
 it('reloads SQL history from its owned conversation before limit and ignores partial local state', async () => {
  const rows = [{ id: 'a', created_at: '2026-11-09T00:00:00.000001Z', role: 'user', content: 'SQL anterior', metadata: { motor: 'sql' } }, { id: 'b', created_at: '2026-11-09T00:00:01.000001Z', role: 'assistant', content: 'Resultado', metadata: { motor: 'sql', consultas: [{ sql: 'SELECT 1', filas: [{ hidden: 44 }] }] } }];
  const s = db(rows); let sent: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_input, init) => { sent = JSON.parse(init.body).historial; const r = await receipt(sent); return Response.json({ texto: 'Respuesta', bloques: [], sugerencias: [], consultas: [], ms: 1, recibo: r, uso: r.uso }); }));
  const r = await enviarMensajeSql(CONV, 'Seguimiento', [{ id: 'partial', conversation_id: CONV, role: 'assistant', content: 'NO USAR LOCAL', metadata: { motor: 'sql' }, created_at: '2026-11-09' }], () => {});
  expect(sent).toEqual(construirHistorialSql(rows)); expect(JSON.stringify(sent)).not.toContain('hidden');
  expect(s.query).toContainEqual(['owner', 'user_id', USER]); expect(s.query).toContainEqual(['eq', 'metadata->>motor', 'sql']); expect(s.query).toContainEqual(['in', 'role', ['user', 'assistant']]);
  expect(s.query.findIndex(q => q[0] === 'eq' && q[1] === 'metadata->>motor')).toBeLessThan(s.query.findIndex(q => q[0] === 'limit'));
  expect(s.query).toContainEqual(['order', 'created_at', { ascending: false }]); expect(s.query).toContainEqual(['order', 'id', { ascending: false }]); expect(s.query.at(-1)).toEqual(['limit', 10]);
  expect(r.asistente.metadata.recibo).toMatchObject({ turno_id: TURN, historial_sha256: await hashHistorialSql(construirHistorialSql(rows)) }); expect(r.asistente.metadata.uso).toEqual(usage);
  expect(leerMetadataSql(r.asistente.metadata)?.recibo?.turno_id).toBe(TURN);
 });
 it('a new conversation sends empty effective history even with supplied local messages', async () => {
  db(); let sent: unknown[] = [{ untrusted: true }];
  vi.stubGlobal('fetch', vi.fn(async (_input, init) => { sent = JSON.parse(init.body).historial; const r = await receipt(sent); return Response.json({ texto: 'Respuesta', bloques: [], sugerencias: [], consultas: [], ms: 1, recibo: r, uso: r.uso }); }));
  await enviarMensajeSql(null, 'Nueva', [{ id: 'old', conversation_id: CONV, role: 'user', content: 'NO HEREDAR', metadata: { motor: 'sql' }, created_at: '2026-11-09' }], () => {});
  expect(sent).toEqual([]);
 });
 it('persists an authorized engine error only as sql_error with its receipt and never as successful history', async () => {
  const s = db(); const r = await receipt([], 'error');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Fallo seguro', recibo: r, uso: r.uso }, { status: 502 })));
  const error = await enviarMensajeSql(null, 'Pregunta', [], () => {}).catch(e => e);
  expect(error).toBeInstanceOf(ErrorTurnoSqlWeb); expect(error.recibo).toEqual(r); expect(error.uso).toEqual(usage);
  expect(s.stored).toHaveLength(1); expect(s.stored[0].every(row => (row.metadata as {motor:string}).motor === 'sql_error')).toBe(true);
  expect((s.stored[0][1].metadata as {recibo:unknown}).recibo).toEqual(r); expect(construirHistorialSql(s.stored[0])).toEqual([]);
 });
 it('keeps the completed engine receipt on uncertain persistence failure without an automatic second write', async () => {
  const s = db([], true); const r = await receipt([]);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ texto: 'Respuesta', bloques: [], sugerencias: [], consultas: [], ms: 1, recibo: r, uso: r.uso })));
  const error = await enviarMensajeSql(null, 'Pregunta', [], () => {}).catch(e => e);
  expect(error).toBeInstanceOf(ErrorTurnoSqlWeb); expect(error.recibo.estado).toBe('completado'); expect(error.uso.costoUsd).toBe(0); expect(error.fase).toBe('persistencia'); expect(s.stored).toHaveLength(1);
 });
 it('retains an old SQL snapshot without inventing a receipt or usage', () => {
  const old = leerMetadataSql({ motor: 'sql', texto: 'Antiguo', bloques: [], sugerencias: [], consultas: [], ms: 1, snapshot_at: '2026-11-09T00:00:00Z' });
  expect(old?.texto).toBe('Antiguo'); expect(old).not.toHaveProperty('recibo'); expect(old).not.toHaveProperty('uso');
 });
 it('rejects incoherent or cross-turn SSE receipts instead of accepting a done', async () => {
  const r = await receipt([]); const start = { type: 'turno', turno_id: TURN, canal: 'web', historial_sha256: r.historial_sha256 };
  const wire = [start, { type: 'done', turno_id: '44444444-4444-4444-8444-444444444444', canal: 'web', resultado: { texto: 'Respuesta', bloques: [], sugerencias: [], consultas: [], ms: 1, recibo: { ...r, turno_id: '44444444-4444-4444-8444-444444444444' }, uso: r.uso } }].map(x => `data: ${JSON.stringify(x)}\n\n`).join('');
  await expect(leerStreamSql(new Response(wire, { headers: { 'content-type': 'text/event-stream' } }), () => {})).rejects.toThrow();
 });
 it('SSE starts and finishes with the same server receipt and preserves observed zero', async () => {
  const r = await receipt([]); const start = { type: 'turno', turno_id: TURN, canal: 'web', historial_sha256: r.historial_sha256 };
  const wire = [start, { type: 'texto', turno_id: TURN, canal: 'web', texto: 'Respuesta' }, { type: 'done', turno_id: TURN, canal: 'web', resultado: { texto: 'Respuesta', bloques: [], sugerencias: [], consultas: [], ms: 1, recibo: r, uso: r.uso } }].map(x => `data: ${JSON.stringify(x)}\n\n`).join('');
  const result = await leerStreamSql(new Response(wire, { headers: { 'content-type': 'text/event-stream' } }), () => {});
  expect(result.recibo).toEqual(r); expect(result.uso?.costoUsd).toBe(0);
 });
});
it('keeps a complete JSON engine receipt when a delivery callback fails', async () => {
 const r = await receipt([]);
 await expect(leerStreamSql(Response.json({ texto: 'Respuesta', bloques: [], sugerencias: [], consultas: [], ms: 1, recibo: r, uso: r.uso }), () => { throw new Error('Synthetic UI delivery failed'); })).rejects.toMatchObject({ recibo: r, uso: r.uso, fase: 'transporte' });
});
it('preserves the completed receipt when cancellation happens after done but before persistence', async () => {
 const s = db(); const r = await receipt([]); const controller = new AbortController();
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({ texto: 'Respuesta', bloques: [], sugerencias: [], consultas: [], ms: 1, recibo: r, uso: r.uso })));
 const error = await enviarMensajeSql(null, 'Pregunta', [], e => { if (e.type === 'done') controller.abort(); }, controller.signal).catch(e => e);
 expect(error).toBeInstanceOf(ErrorTurnoSqlWeb); expect(error.name).toBe('AbortError'); expect(error.recibo).toEqual(r); expect(error.uso?.costoUsd).toBe(0);
 expect(s.stored.flat().every(row => (row.metadata as {motor:string}).motor !== 'sql')).toBe(true);
});
