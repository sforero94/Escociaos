import { describe, expect, it } from 'vitest';
import { ejecutarNucleoCultivos } from '@/utils/escoNucleoCultivos';
import type { ContextoNucleo, PuertoNucleo, ResultadoNucleo } from '@/utils/escoNucleoComun';
import type { Metric } from '@/utils/escoEvidencia';
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = '2034-05-08T12:00:00Z';
type Row = Record<string, unknown>;
function context(question: string): ContextoNucleo { return { currentUserText: question, referenceDay: '2034-05-08', startedAt: now, period: null, dateState: 'absent', identities: { client: false, supplier: false } }; }
function db(): Record<string, Row[]> {
 return {
  lotes: [{ id: id(1), nombre: 'Norte' }, { id: id(2), nombre: 'Sur' }],
  sublotes: [{ id: id(11), nombre: 'Sub Norte', lote_id: id(1) }, { id: id(12), nombre: 'Sub Sur', lote_id: id(2) }],
  produccion: [
   { id: id(101), lote_id: id(1), sublote_id: null, ano: 2034, cosecha_tipo: 'Principal', kg_totales: '100', arboles_registrados: 10, kg_por_arbol: '10', kg_exportacion: '70', kg_nacional: '30' },
   { id: id(102), lote_id: id(1), sublote_id: id(11), ano: 2034, cosecha_tipo: 'Principal', kg_totales: '40', arboles_registrados: 4, kg_por_arbol: '10', kg_exportacion: '28', kg_nacional: '12' },
   { id: id(103), lote_id: id(2), sublote_id: id(12), ano: 2034, cosecha_tipo: 'Principal', kg_totales: '50', arboles_registrados: 10, kg_por_arbol: '5', kg_exportacion: '30', kg_nacional: '20' },
  ],
  plagas_enfermedades_catalogo: [{ id: id(71), nombre: 'Plaga Uno' }],
  monitoreos: [1, 2].map((lot, i) => ({ id: id(201 + i), lote_id: id(lot), sublote_id: id(11 + i), ronda_id: id(91), plaga_enfermedad_id: id(71), fecha_monitoreo: '2034-05-02', arboles_monitoreados: 10, arboles_afectados: lot, incidencia: lot * 10, individuos_encontrados: lot, severidad: 1, gravedad_texto: 'Baja', floracion_sin_flor: 4, floracion_brotes: 3, floracion_flor_madura: 2, floracion_cuaje: 1 })),
  cosechas: [{ id: id(301), lote_id: id(1), sublote_id: null, fecha_cosecha: '2034-05-02', kilos_cosechados: '5', numero_canastillas: 0 }],
  despachos: [{ id: id(401), cliente_id: id(81), fecha_despacho: '2034-05-02', kilos_despachados: '2', precio_por_kilo: '10', valor_total: '20' }, { id: id(402), cliente_id: id(82), fecha_despacho: '2034-05-02', kilos_despachados: '7', precio_por_kilo: '10', valor_total: '70' }],
  clientes: [{ id: id(81), nombre: 'Comprador Uno' }, { id: id(82), nombre: 'Comprador Dos' }],
 };
}
function source(data = db()) {
 const calls: Array<{ table: string; query: string }> = [];
 const port: PuertoNucleo = { now: () => now, read: async (table, query, identityKeys = ['id']) => {
  calls.push({ table, query }); expect(Object.prototype.hasOwnProperty.call(data, table)).toBe(true);
  const p = new URLSearchParams(query), cols = p.get('select')!.split(',');
  const rows = data[table].filter(r => [...p].every(([k, v]) => k === 'select' || v.startsWith('eq.') && String(r[k]) === v.slice(3) || v.startsWith('gte.') && String(r[k]) >= v.slice(4) || v.startsWith('lte.') && String(r[k]) <= v.slice(4) || v.startsWith('in.(') && v.slice(4, -1).split(',').includes(String(r[k])))).map(r => Object.fromEntries(cols.map(k => [k, r[k] ?? null])));
  return { rows, total: rows.length, capturedAt: now, identityKeys, complete: true, identityUnique: true, consistency: 'stable_count_pages' };
 } };
 return { port, calls };
}
function aggregate(r: ResultadoNucleo, metric: Metric) { return r.evidence.flatMap(e => e.facts).find(f => f.metric === metric && f.entities.length === 0 && (metric !== 'production.kg' || r.scopes.find(s => s.id === f.scopeId)?.filters.grain === 'lote_preferente')); }
function number(r: ResultadoNucleo, metric: Metric) { const v = aggregate(r, metric)?.value; return v?.kind === 'decimal' ? v.value : undefined; }
describe('independent crop intent and grain review', () => {
 it('whole-lot wins over sublot while numerator/denominator remain on the same grain', async () => {
  const r = await ejecutarNucleoCultivos('get_production_data', { year: 2034 }, context('Producción de 2034'), source().port);
  expect(number(r, 'production.kg')).toBe('150'); expect(number(r, 'production.trees')).toBe('20');
  expect(number(r, 'production.kg_per_tree')).toBe('7.5');
 });
 it('an explicit named lot stays bound when the model omits its filter', async () => {
  const r = await ejecutarNucleoCultivos('get_production_data', { year: 2034 }, context('Producción de 2034 del lote Norte'), source().port);
  expect(number(r, 'production.kg')).toBe('100');
 });
 it('an excluded lot cannot be selected merely because its name occurs in the question', async () => {
  const f = source(); const r = await ejecutarNucleoCultivos('get_production_data', { year: 2034, lote_name: 'Norte' }, context('Producción de 2034, excepto el lote Norte'), f.port);
  expect(number(r, 'production.kg')).not.toBe('100');
 });
 it('January dates cannot be silently widened into an annual production total', async () => {
  const c = { ...context('Producción de enero de 2034'), period: { from: '2034-01-01', to: '2034-01-31' }, dateState: 'resolved' as const };
  const r = await ejecutarNucleoCultivos('get_production_data', { year: 2034 }, c, source().port);
  expect(aggregate(r, 'production.kg')?.value.kind).not.toBe('decimal');
 });
 it('monitoring excludes a negatively named lot instead of accepting a model filter selecting it', async () => {
  const c = { ...context('Monitoreo excepto el lote Norte del 2034-05-01 al 2034-05-07'), period: { from: '2034-05-01', to: '2034-05-07' }, dateState: 'resolved' as const };
  const r = await ejecutarNucleoCultivos('get_monitoring_data', { lote_name: 'Norte' }, c, source().port);
  expect(number(r, 'monitoring.observed')).not.toBe('10');
 });
 it('a named client remains bound when the model omits client_name, without exposing another client', async () => {
  const c = { ...context('Despachos a Comprador Uno del 2034-05-01 al 2034-05-07'), period: { from: '2034-05-01', to: '2034-05-07' }, dateState: 'resolved' as const, identities: { client: true, supplier: false } };
  const r = await ejecutarNucleoCultivos('get_harvest_shipments', {}, c, source().port);
  expect(number(r, 'shipment.kg')).toBe('2'); expect(JSON.stringify(r)).not.toContain('Comprador Dos');
 });
 it('without client purpose no client identities enter either query or evidence', async () => {
  const f = source(), c = { ...context('Despachos del 2034-05-01 al 2034-05-07'), period: { from: '2034-05-01', to: '2034-05-07' }, dateState: 'resolved' as const };
  const r = await ejecutarNucleoCultivos('get_harvest_shipments', {}, c, f.port);
  expect(f.calls.some(q => q.table === 'clientes' || q.query.includes('cliente_id'))).toBe(false);
  expect(JSON.stringify(r)).not.toContain('Comprador');
 });
});
