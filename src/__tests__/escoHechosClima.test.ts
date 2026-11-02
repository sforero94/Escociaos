import { describe, expect, it } from 'vitest';
import { hechosLluvia, lluviaMedidaVerificable, type ObservacionLluvia } from '@/utils/escoHechosClima';
import { validarEvidencia, type PopulationProof, type Scope } from '@/utils/escoEvidencia';

const scope: Scope = { id: 'rain', operation: 'climate.rainfall', entities: [{ kind: 'station', id: 's1', label: 'Station' }],
  period: { from: '2026-01-01', to: '2026-01-03', referenceDay: '2026-01-04', clock: 'America/Bogota', basis: 'observation', fieldMeaning: 'fecha' }, filters: {} };
const row = (fecha: string, mm: number | null, confianza = 'ok'): ObservacionLluvia => ({ id: fecha, stationId: 's1', fecha, lluvia_total_mm: mm, lluvia_confianza: confianza });
const proof = (rowsRead: number, partial = false): PopulationProof => ({ populationId: 'p1', scopeId: scope.id, tool: 'get_climate_data', fields: ['fecha', 'lluvia_total_mm', 'lluvia_confianza'],
  capturedAt: '2026-01-04T12:00:00Z', population: partial ? 'partial' : 'complete', rowsRead, expectedRows: partial ? null : rowsRead, identityUnique: true, consistency: partial ? 'not_attested' : 'single_read' });
const value = (e: ReturnType<typeof hechosLluvia>, metric: string) => e.facts.find(f => f.metric === metric)?.value;

describe('rain observations with calendar coverage', () => {
  it('sums exact measured mm and keeps verified zero distinct from missing', () => {
    const e = hechosLluvia(scope, [row('2026-01-01', 0.1), row('2026-01-02', 0.2), row('2026-01-03', 0)], proof(3));
    expect(e.state).toBe('ok'); expect(value(e, 'climate.rain')).toEqual({ kind: 'decimal', value: '0.3', unit: 'mm' });
    expect(value(e, 'climate.missing_days')).toEqual({ kind: 'decimal', value: '0', unit: 'dia' });
    expect(validarEvidencia(e, [scope], [proof(3)])).toBe(true);
  });
  it('counts entirely absent dates without inventing the SQL population count', () => {
    const e = hechosLluvia(scope, [row('2026-01-01', 2)], proof(1));
    expect(value(e, 'climate.missing_days')).toEqual({ kind: 'decimal', value: '2', unit: 'dia' });
    expect(e.facts[0]).toMatchObject({ assertion: 'verified_subtotal', coverage: { population: 'complete', expectedRows: 1, values: 'partial', reasons: ['calendar_missing'] } });
    expect(validarEvidencia(e, [scope], [proof(1)])).toBe(true);
  });
  it('knows the calendar gaps in a verified empty DB query, but rain remains unknown', () => {
    const e = hechosLluvia(scope, [], proof(0));
    expect(value(e, 'climate.rain')).toEqual({ kind: 'unknown', reason: 'not_observed' });
    expect(value(e, 'climate.missing_days')).toEqual({ kind: 'decimal', value: '3', unit: 'dia' });
    expect(validarEvidencia(e, [scope], [proof(0)])).toBe(true);
  });
  it('counts flagged/null/partial-zero rows as unknown, with missing dates too', () => {
    const e = hechosLluvia(scope, [row('2026-01-01', 8, 'contador_congelado'), row('2026-01-03', 0, 'cobertura_parcial')], proof(2));
    expect(value(e, 'climate.rain')?.kind).toBe('unknown');
    expect(value(e, 'climate.missing_days')).toEqual({ kind: 'decimal', value: '3', unit: 'dia' });
    expect(lluviaMedidaVerificable(row('2026-01-01', null))).toBe(null);
  });
  it('preserves positive lower bounds as measured subtotals without calling them daily totals', () => {
    const e = hechosLluvia(scope, [row('2026-01-01', 4, 'cobertura_parcial'), row('2026-01-02', 1, 'reconstruido'), row('2026-01-03', 0)], proof(3));
    expect(e.state).toBe('partial'); expect(e.facts[0].assertion).toBe('verified_subtotal');
    expect(value(e, 'climate.rain')).toEqual({ kind: 'decimal', value: '5', unit: 'mm' });
    expect(value(e, 'climate.missing_days')).toEqual({ kind: 'decimal', value: '0', unit: 'dia' });
  });
  it('cannot count calendar gaps from a capped/unknown population, but preserves measured partial facts', () => {
    const e = hechosLluvia(scope, [row('2026-01-01', 3)], proof(1, true));
    expect(value(e, 'climate.rain')).toEqual({ kind: 'decimal', value: '3', unit: 'mm' });
    expect(value(e, 'climate.missing_days')).toEqual({ kind: 'unknown', reason: 'incomplete_population' });
  });
  it('requires one canonical station and refuses station mixing or absent station', () => {
    for (const entities of [[], [...scope.entities, { kind: 'station' as const, id: 's2', label: 'Other' }]]) {
      expect(hechosLluvia({ ...scope, entities }, [], proof(0)).issues[0].code).toBe('scope_ambiguous');
    }
    expect(hechosLluvia(scope, [{ ...row('2026-01-01', 1), stationId: 's2' }], proof(1)).issues[0].code).toBe('outside_scope');
    expect(hechosLluvia({ ...scope, filters: { station_id: 's2' } }, [], proof(0)).issues[0].code).toBe('outside_scope');
    expect(hechosLluvia({ ...scope, filters: { date_from: '2025-01-01' } }, [], proof(0)).issues[0].code).toBe('outside_scope');
  });
  it('keeps independent station scopes useful when another station is entirely absent', () => {
    const a = hechosLluvia(scope, [row('2026-01-01', 2)], proof(1));
    const s2: Scope = { ...scope, id: 'rain2', entities: [{ kind: 'station', id: 's2', label: 'Other' }] };
    const p2 = { ...proof(0), scopeId: s2.id, populationId: 'p2' };
    const b = hechosLluvia(s2, [], p2);
    expect(value(a, 'climate.rain')).toEqual({ kind: 'decimal', value: '2', unit: 'mm' });
    expect(value(b, 'climate.rain')?.kind).toBe('unknown');
    expect(value(b, 'climate.missing_days')).toEqual({ kind: 'decimal', value: '3', unit: 'dia' });
    expect(validarEvidencia(b, [s2], [p2])).toBe(true);
  });
  it('preserves historical measured parts without certifying a current-day summary counter', () => {
    const current: Scope = { ...scope, period: { ...scope.period!, referenceDay: '2026-01-03' } };
    const e = hechosLluvia(current, [row('2026-01-01', 2), row('2026-01-02', 3), row('2026-01-03', 500)], proof(3));
    expect(e.state).toBe('partial');
    expect(value(e, 'climate.rain')).toEqual({ kind: 'decimal', value: '5', unit: 'mm' });
    expect(value(e, 'climate.missing_days')).toEqual({ kind: 'decimal', value: '1', unit: 'dia' });
    expect(e.issues.map(i => i.code)).toContain('not_observed');
    expect(validarEvidencia(e, [current], [proof(3)])).toBe(true);
  });
  it('detects repeated source IDs and repeated station dates', () => {
    expect(hechosLluvia(scope, [row('2026-01-01', 1), row('2026-01-01', 1)], proof(2)).issues[0].code).toBe('duplicate_identity');
    expect(hechosLluvia(scope, [row('2026-01-01', 1), { ...row('2026-01-02', 1), id: '2026-01-01' }], proof(2)).facts).toEqual([]);
  });
  it.each(['', ' ', ' row', 'row ', 'row\ninside', 'row\u0000inside', 'row\u007finside', 'r'.repeat(129)])('rejects noncanonical source identity %j despite an externally complete proof', id => {
    const e = hechosLluvia(scope, [{ ...row('2026-01-01', 2), id }], proof(1));
    expect(e.state).toBe('error');
    expect(e.issues[0].code).toBe('invalid_value');
    expect(e.facts).toEqual([]);
  });
  it('rejects mismatched proof fields/scope/count/time and nonfinite observations', () => {
    for (const p of [{ ...proof(1), scopeId: 'other' }, { ...proof(1), fields: ['fecha'] }, proof(2), { ...proof(1), capturedAt: 'bad' }]) {
      expect(hechosLluvia(scope, [row('2026-01-01', 1)], p).facts).toEqual([]);
    }
    expect(lluviaMedidaVerificable(row('2026-01-01', Infinity))).toBe(null);
    expect(lluviaMedidaVerificable(row('2026-01-01', -1))).toBe(null);
  });
});
