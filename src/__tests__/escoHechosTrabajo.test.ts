import { describe, expect, it, vi } from 'vitest';
import { evidenciaTrabajoRegistrado, recolectarHechosTrabajo, PROYECCION_HECHOS_TRABAJO, type FilaHechosTrabajo } from '../utils/escoHechosTrabajo';
import { validarEvidencia, type Scope, type PopulationProof } from '../utils/escoEvidencia';
const scope: Scope = { id: 'lot-a-week', operation: 'labor.by_lot', entities: [{ kind: 'lot', id: 'lot-a', label: 'Nombre repetido' }], period: { from: '2034-05-01', to: '2034-05-07', referenceDay: '2034-05-08', clock: 'America/Bogota', basis: 'actual', fieldMeaning: 'fecha_trabajo' }, filters: {} };
const row = (id: string, cost: unknown = '11000', fraction: unknown = '0.5'): FilaHechosTrabajo => ({ id, fecha_trabajo: '2034-05-02', lote_id: 'lot-a', lote: { nombre: 'Nombre repetido' }, fraccion_jornal: fraction, costo_jornal: cost });
const proof = (n: number, patch: Partial<PopulationProof> = {}): PopulationProof => ({ populationId: 'read-a', scopeId: scope.id, tool: 'get_labor_summary', fields: ['id', 'costo_jornal', 'fraccion_jornal'], capturedAt: '2034-05-08T12:00:00Z', population: 'complete', rowsRead: n, expectedRows: n, identityUnique: true, consistency: 'stable_count_pages', ...patch });
const run = (rows: FilaHechosTrabajo[], p = proof(rows.length), s = scope) => evidenciaTrabajoRegistrado(s, { rows, proof: p });
const fact = (e: ReturnType<typeof run>, metric: string) => e.facts.find(f => f.metric === metric)!;
describe('minimized stored labor evidence', () => {
  it('adds historical costs once, even for unequal costs and equal fractions', () => {
    const e = run([row('a', '100.1'), row('b', '200.2')]);
    expect(fact(e, 'labor.cost').value).toEqual({ kind: 'decimal', value: '300.3', unit: 'COP' });
    expect(fact(e, 'labor.journals').value).toEqual({ kind: 'decimal', value: '1', unit: 'jornal' });
    expect(validarEvidencia(e, [scope], [proof(2)])).toBe(true);
  });
  it('keeps independent fractional totals when cost is missing, and true zero', () => {
    const e = run([row('a', '0', '0.25'), row('b', null, '0.5')]);
    expect(fact(e, 'labor.cost')).toMatchObject({ value: { kind: 'decimal', value: '0' }, assertion: 'verified_subtotal', coverage: { missingValues: 1 } });
    expect(fact(e, 'labor.journals')).toMatchObject({ value: { value: '0.75' }, assertion: 'scoped_total' });
    expect(fact(e, 'labor.count').value).toMatchObject({ value: '2' });
  });
  it('does not present all missing costs as zero', () => expect(fact(run([row('a', null)]), 'labor.cost').value.kind).toBe('unknown'));
  it('reports zero registered sums only for a proven empty population', () => {
    const e = run([]);
    expect(e.facts.map(f => f.value)).toEqual([{ kind: 'decimal', value: '0', unit: 'COP' }, { kind: 'decimal', value: '0', unit: 'jornal' }, { kind: 'decimal', value: '0', unit: 'registro' }]);
    expect(fact(e, 'labor.count').assertion).toBe('bounded_empty');
    expect(run([], proof(0, { population: 'unknown', expectedRows: null, consistency: 'not_attested' })).facts.every(f => f.value.kind === 'unknown')).toBe(true);
  });
  it('never closes a partial population or turns its observed count into a total', () => {
    const e = run([row('a')], proof(1, { population: 'partial', expectedRows: 2 }));
    expect(fact(e, 'labor.cost').assertion).toBe('verified_subtotal');
    expect(fact(e, 'labor.count').value.kind).toBe('unknown');
  });
  it('rejects a contradictory identity proof, not choosing a duplicate version', () => expect(run([row('a'), row('a')])).toMatchObject({ state: 'error', facts: [], issues: [{ code: 'duplicate_identity' }] }));
  it('retains the uniquely identified subtotal when the port attests duplicate coverage', () => {
    const e = run([row('a'), row('a'), row('b', 7)], proof(3, { population: 'partial', identityUnique: false }));
    expect(fact(e, 'labor.cost')).toMatchObject({ value: { value: '7' }, assertion: 'verified_subtotal' });
  });
  it.each(['2034-04-30', '2034-05-08', '2034-02-30', null])('does not assign an invalid/outside work date %s', date => {
    const e = run([row('a', 7), { ...row('b'), fecha_trabajo: date }]);
    expect(fact(e, 'labor.cost')).toMatchObject({ value: { value: '7' }, assertion: 'verified_subtotal' });
    expect(fact(e, 'labor.count').value.kind).toBe('unknown');
  });
  it('does not merge homonyms or substitute display names for canonical lot IDs', () => {
    const e = run([row('a', 7), { ...row('b', 99), lote_id: 'lot-b' }]);
    expect(fact(e, 'labor.cost')).toMatchObject({ value: { value: '7' }, entities: [{ kind: 'lot', id: 'lot-a' }] });
  });
  it.each([NaN, Infinity, true, '', '1,25', '1e3', '-1', Number.MAX_SAFE_INTEGER + 1, '1 COP'])('keeps invalid stored amounts unknown: %s', amount => expect(fact(run([row('a', amount)]), 'labor.cost').value.kind).toBe('unknown'));
  it('supports exact decimal strings beyond safe floating point', () => expect(fact(run([row('a', '9007199254740993.25'), row('b', '0.75')]), 'labor.cost').value).toMatchObject({ value: '9007199254740994' }));
  it('rejects changed period semantics and unsupported filters before any read', async () => {
    const read = vi.fn();
    const e = await recolectarHechosTrabajo([{ ...scope, period: { ...scope.period!, basis: 'planned' } }, { ...scope, id: 'other', filters: { empleado_id: 'not-allowed' } }], { read });
    expect(read).not.toHaveBeenCalled(); expect(e.state).toBe('error');
  });
  it('requires matching external proof fields/count/scope, without inventing them', () => {
    for (const patch of [{ rowsRead: 2 }, { scopeId: 'other' }, { fields: ['id'] }, { tool: 'other' }]) expect(run([row('a')], proof(1, patch)).state).toBe('error');
  });
  it('exports an exact minimal collector request and returns aggregates without row leakage', async () => {
    const extra = { ...row('a'), empleado_id: 'PRIVATE_ID', empleado: { nombre: 'PRIVATE_NAME', salario: 9 }, observaciones: 'PRIVATE_TEXT' };
    const read = vi.fn(async () => ({ rows: [extra], proof: proof(1) }));
    const e = await recolectarHechosTrabajo([scope], { read });
    expect(read).toHaveBeenCalledExactlyOnceWith({ scope, table: 'registros_trabajo', projection: 'id,fecha_trabajo,lote_id,lote:lotes(nombre),fraccion_jornal,costo_jornal' });
    expect(PROYECCION_HECHOS_TRABAJO).not.toMatch(/emplead|trabajador|salario|prestacion|auxilio|observacion/);
    expect(JSON.stringify(e)).not.toMatch(/PRIVATE_|empleado|salario|observaciones/);
  });
  it('keeps equal journals with unequal costs separate for canonical homonymous lot scopes', async () => {
    const other: Scope = { ...scope, id: 'lot-b-week', entities: [{ kind: 'lot', id: 'lot-b', label: 'Nombre repetido' }] };
    const otherProof = proof(1, { scopeId: other.id, populationId: 'read-b' });
    const read = vi.fn().mockResolvedValueOnce({ rows: [row('a', 100, 1)], proof: proof(1) }).mockResolvedValueOnce({ rows: [{ ...row('b', 300, 1), lote_id: 'lot-b' }], proof: otherProof });
    const e = await recolectarHechosTrabajo([scope, other], { read });
    expect(e.facts.filter(f => f.metric === 'labor.cost').map(f => f.value)).toEqual([{ kind: 'decimal', value: '100', unit: 'COP' }, { kind: 'decimal', value: '300', unit: 'COP' }]);
    expect(e.facts.filter(f => f.metric === 'labor.journals').map(f => f.value)).toEqual([{ kind: 'decimal', value: '1', unit: 'jornal' }, { kind: 'decimal', value: '1', unit: 'jornal' }]);
    expect(validarEvidencia(e, [scope, other], [proof(1), otherProof])).toBe(true);
  });
  it('keeps successful scopes when another exact scoped read fails', async () => {
    const other = { ...scope, id: 'lot-b-week', entities: [{ kind: 'lot' as const, id: 'lot-b', label: 'Nombre repetido' }] };
    const read = vi.fn().mockResolvedValueOnce({ rows: [row('a')], proof: proof(1) }).mockRejectedValueOnce(Error('PRIVATE_ERROR'));
    const e = await recolectarHechosTrabajo([scope, other], { read });
    expect(e.state).toBe('partial'); expect(e.facts).toHaveLength(3); expect(JSON.stringify(e)).not.toContain('PRIVATE_ERROR');
  });
});
