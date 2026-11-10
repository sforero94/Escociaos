import { describe, expect, it } from 'vitest';
import { construirHistorialSql, normalizarHistorialEfectivoSql, textoHistorialSql } from '../utils/escoSql/historial';
import { responderPregunta } from '../utils/escoSql/loop';
import type { ClienteLLM } from '../utils/esco2/llm';
import { crearContextoTurnoSql, hashHistorialSql, leerReciboTurnoSql, leerUsoTurnoSql } from '../utils/escoSql/turno';
const id = '11111111-1111-4111-8111-111111111111';
const fila = (i: number, role = 'user', motor = 'sql') => ({ id: String(i).padStart(2, '0'), created_at: `2026-11-09T00:00:${String(i).padStart(2, '0')}.000001Z`, role, content: `m${i}`, metadata: { motor } });
describe('P6 shared context', () => {
 it('filters SQL on both roles, orders before taking last ten and keeps only allowlisted context', () => {
  const rows = [fila(14, 'assistant', 'legacy'), ...Array.from({ length: 13 }, (_, i) => fila(i, i % 2 ? 'assistant' : 'user')).reverse(), fila(15, 'user', 'legacy')];
  expect(construirHistorialSql(rows).map(m => m.texto)).toEqual(Array.from({ length: 10 }, (_, i) => `m${i + 3}`));
  const a = fila(2, 'assistant'); a.metadata = { motor: 'sql', consultas: [{ sql: 'SELECT 1', filas: [{ secret: 3 }] }], recibo: { private: true } } as typeof a.metadata;
  const h = construirHistorialSql([a]); expect(h[0].texto).toContain('SELECT 1'); expect(JSON.stringify(h)).not.toMatch(/private|secret|filas|recibo/);
 });
 it('uses sub-millisecond timestamp precision and stable id tie breaks', () => {
  const a = { ...fila(1), id: 'z', created_at: '2026-11-09T00:00:00.000001Z' };
  const b = { ...fila(2), id: 'a', created_at: '2026-11-09T00:00:00.000002Z' };
  expect(construirHistorialSql([b, a]).map(m => m.texto)).toEqual(['m1', 'm2']);
  expect(construirHistorialSql([{ ...b, created_at: a.created_at }, a]).map(m => m.texto)).toEqual(['m2', 'm1']);
 });
 it('fails closed on eligible rows without verifiable dates or duplicate ids', () => {
  expect(() => construirHistorialSql([{ ...fila(0), created_at: 'bad' }])).toThrow();
  expect(() => construirHistorialSql([{ ...fila(0), created_at: '2026-02-30T00:00:00Z' }])).toThrow();
  expect(() => construirHistorialSql([fila(0), fila(0)])).toThrow();
 });
 it('keeps complete SQL only, reserves prose and labels omissions', () => {
  const sql = 'SELECT ' + 'x'.repeat(5000);
  const text = textoHistorialSql('p'.repeat(8000), [{ sql }, { sql: 'SELECT 2' }]);
  expect(text.length).toBeLessThanOrEqual(4000); expect(text.startsWith('p'.repeat(200))).toBe(true);
  expect(text).toContain('SELECT 2'); expect(text).not.toContain(sql.slice(0, 100)); expect(text).toMatch(/omitidas.*1/);
  const fits = textoHistorialSql('p'.repeat(9000), [{ sql: 'SELECT ' + 'x'.repeat(3000) }]);
  expect(fits).toContain('SELECT ' + 'x'.repeat(3000)); expect(fits.length).toBeLessThanOrEqual(4000);
 });
 it('normalizes the exact final array once and hashes that same ten-message input', async () => {
  const raw = Array.from({ length: 12 }, (_, i) => ({ rol: i % 2 ? 'assistant' : 'user', texto: 'x'.repeat(4001) + i, ignored: true }));
  const effective = normalizarHistorialEfectivoSql(raw);
  expect(effective).toHaveLength(10); expect(effective.every(m => m.texto.length === 4000)).toBe(true);
  expect(normalizarHistorialEfectivoSql(effective)).toEqual(effective);
  const expected = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(effective))))).map(b => b.toString(16).padStart(2, '0')).join('');
  expect(await hashHistorialSql(effective)).toBe(expected);
  expect(await crearContextoTurnoSql('web', effective, () => id)).toEqual({ turno_id: id, canal: 'web', historial_sha256: expected });
 });
});
describe('P6 shared receipt', () => {
 const receipt = { version: 1, turno_id: id, canal: 'web', historial_sha256: 'a'.repeat(64), estado: 'completado', uso: { llamadas: 1, entrada: 2, salida: 3, costoUsd: 0 }, coste: { estado: 'completo', observadoUsd: 0, llamadasConCoste: 1, llamadasSinCoste: 0 } };
 it('preserves explicit observed zero and validates complete coherent cost', () => {
  expect(leerReciboTurnoSql(receipt)).toEqual(receipt);
  expect(leerUsoTurnoSql({ ...receipt.uso, costoUsd: null })?.costoUsd).toBeNull();
  expect(leerReciboTurnoSql({ ...receipt, uso: { ...receipt.uso, costoUsd: null } })).toBeNull();
 });
 it('preserves partial/error receipts and never promotes subtotal into total', () => {
  const r = { ...receipt, estado: 'error', uso: { ...receipt.uso, costoUsd: null }, coste: { estado: 'parcial', observadoUsd: 0.01, llamadasConCoste: 1, llamadasSinCoste: 1 } };
  expect(leerReciboTurnoSql(r)).toEqual(r);
  expect(leerReciboTurnoSql({ ...r, uso: { ...r.uso, costoUsd: 0.01 } })).toBeNull();
  expect(leerReciboTurnoSql({ ...receipt, uso: null, coste: { estado: 'desconocido', observadoUsd: null, llamadasConCoste: 0, llamadasSinCoste: 0 } })?.uso).toBeNull();
 });
 it('rejects malformed identity, channel, hash, nonfinite/negative cost and coverage mismatch', () => {
  for (const change of [{ turno_id: 'client' }, { canal: 'other' }, { historial_sha256: 'x' }, { uso: { ...receipt.uso, costoUsd: -1 } }, { coste: { ...receipt.coste, observadoUsd: Infinity } }, { coste: { ...receipt.coste, llamadasConCoste: 0 } }]) expect(leerReciboTurnoSql({ ...receipt, ...change })).toBeNull();
 });
});

it('the real loop consumes exactly the common normalized history', async () => {
 const inputs: unknown[] = [];
 const llm: ClienteLLM = { completar: async s => { inputs.push(structuredClone(s.mensajes)); return { texto: 'Respuesta sintética', llamadas: [], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 1, modelo: 'synthetic', finishReason: 'stop' }; } };
 const historial = [{ rol: 'user' as const, texto: 'h'.repeat(5000) }];
 await responderPregunta({ pregunta: 'Pregunta sintética', historial, llm, ejecutarSql: async () => ({ filas: [], n_filas: 0, truncado: false }), hoy: '2026-11-09' });
 expect((inputs[0] as {role:string;content:string}[]).filter(m => m.role !== 'system').slice(0, -1)).toEqual(normalizarHistorialEfectivoSql(historial).map(m => ({ role: m.rol, content: m.texto })));
});

it('does not coerce arrays or boxed values into protocol enums', () => {
 expect(() => normalizarHistorialEfectivoSql([{ rol: ['user'], texto: 'x' }])).toThrow();
 const r = { version: 1, turno_id: id, canal: 'web', historial_sha256: 'a'.repeat(64), estado: 'completado', uso: { llamadas: 1, entrada: 0, salida: 0, costoUsd: 0 }, coste: { estado: 'completo', observadoUsd: 0, llamadasConCoste: 1, llamadasSinCoste: 0 } };
 for (const changes of [{ canal: ['web'] }, { estado: ['completado'] }, { coste: { ...r.coste, estado: ['completo'] } }]) expect(leerReciboTurnoSql({ ...r, ...changes })).toBeNull();
});
it('preserves known complete charges on cancellation but rejects partial without missing charges', () => {
 const r = { version: 1, turno_id: id, canal: 'web', historial_sha256: 'a'.repeat(64), estado: 'cancelado', uso: { llamadas: 1, entrada: 2, salida: 3, costoUsd: 0.01 }, coste: { estado: 'completo', observadoUsd: 0.01, llamadasConCoste: 1, llamadasSinCoste: 0 } };
 expect(leerReciboTurnoSql(r)).toEqual(r);
 expect(leerReciboTurnoSql({ ...r, uso: { ...r.uso, costoUsd: null }, coste: { ...r.coste, estado: 'parcial' } })).toBeNull();
});
it('does not generate an id before rejecting invalid effective history', async () => {
 let created = 0;
 await expect(crearContextoTurnoSql('web', [{ rol: 'user', texto: 3 }] as never, () => { created++; return id; })).rejects.toThrow();
 expect(created).toBe(0);
});
