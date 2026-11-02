import { describe, expect, it, vi } from 'vitest';
import { evidenciaFechasAplicacion, recolectarFechasAplicacion, PROYECCION_FECHAS_APLICACION } from '../utils/escoAplicacionHechos';
import { validarEvidencia, type Scope, type PopulationProof } from '../utils/escoEvidencia';
const scope: Scope = { id: 'app-record', operation: 'application.execution', entities: [{ kind: 'application', id: 'app-a', label: 'Aplicación sintética' }], period: null, filters: {} };
const row = { id: 'app-a', estado: 'En ejecución', fecha_inicio_ejecucion: '2034-05-02', fecha_fin_ejecucion: '2034-05-05', fecha_inicio_planeada: '2034-05-01', fecha_fin_planeada: '2034-05-05' };
const proof: PopulationProof = { populationId: 'application-read', scopeId: scope.id, tool: 'get_aplicaciones_ejecucion', fields: ['estado', 'fecha_inicio_ejecucion', 'fecha_fin_ejecucion', 'fecha_inicio_planeada', 'fecha_fin_planeada'], capturedAt: '2034-05-08T12:00:00Z', population: 'complete', rowsRead: 1, expectedRows: 1, identityUnique: true, consistency: 'single_read' };
const run = (r: Record<string, unknown> = row, p = proof, s = scope) => evidenciaFechasAplicacion(s, { rows: [r], proof: p });
const fact = (e: ReturnType<typeof run>, metric: string) => e.facts.find(f => f.metric === 'application.' + metric)!;
describe('application registered status and explicit date comparisons', () => {
  it('compares independently registered dates and preserves planned origin', () => {
    const e = run();
    expect(validarEvidencia(e, [scope], [proof])).toBe(true);
    expect(fact(e, 'start_comparison').value).toEqual({ kind: 'status', value: 'Diferentes' });
    expect(fact(e, 'end_comparison').value).toEqual({ kind: 'status', value: 'Iguales' });
    expect(fact(e, 'planned_start').origin).toBe('planned');
    expect(fact(e, 'actual_start').origin).toBe('recorded');
    expect(fact(e, 'start_comparison').derivation?.inputs).toEqual([{ factId: scope.id + ':application.actual_start' }, { factId: scope.id + ':application.planned_start' }]);
  });
  it('preserves recorded status without inferring physical completion or date filling', () => {
    const e = run({ ...row, estado: 'Cerrada', fecha_fin_ejecucion: null });
    expect(fact(e, 'status').value).toEqual({ kind: 'status', value: 'Cerrada' });
    expect(fact(e, 'actual_end').value.kind).toBe('unknown');
    expect(fact(e, 'end_comparison').value.kind).toBe('unknown');
    expect(fact(e, 'start_comparison').value.kind).toBe('status');
    expect(e.facts.map(f => f.metric)).toHaveLength(7);
    expect(JSON.stringify(e)).not.toMatch(/duration|duracion|cause|causa|success|exito|completion|completada/);
  });
  it.each(['2034-02-30', '', null, '2034-05-01T12:00:00Z'])('does not fill missing/invalid actual dates %s from planned dates', value => {
    const e = run({ ...row, fecha_inicio_ejecucion: value });
    expect(fact(e, 'actual_start').value.kind).toBe('unknown');
    expect(fact(e, 'planned_start').value.kind).toBe('date');
    expect(fact(e, 'start_comparison').value.kind).toBe('unknown');
    expect(fact(e, 'end_comparison').value.kind).toBe('status');
  });
  it('does not compare an internally inconsistent actual date pair', () => {
    const e = run({ ...row, fecha_fin_ejecucion: '2034-04-01' });
    expect(fact(e, 'actual_start').value).toEqual({ kind: 'date', value: '2034-05-02' });
    expect(fact(e, 'actual_end').value).toEqual({ kind: 'date', value: '2034-04-01' });
    expect(fact(e, 'start_comparison').value.kind).toBe('unknown');
    expect(fact(e, 'planned_start').value.kind).toBe('date');
    expect(fact(e, 'status').value.kind).toBe('status');
  });
  it('keeps actual dates when the planned interval is inconsistent', () => {
    const e = run({ ...row, fecha_fin_planeada: '2034-04-01' });
    expect(fact(e, 'actual_start').value.kind).toBe('date');
    expect(fact(e, 'planned_start').value.kind).toBe('date');
    expect(fact(e, 'start_comparison').value.kind).toBe('unknown');
  });
  it('permits comparison in an actual membership cohort with planned dates outside its period', () => {
    const s: Scope = { ...scope, period: { from: '2034-05-02', to: '2034-05-07', referenceDay: '2034-05-08', clock: 'America/Bogota', basis: 'actual', fieldMeaning: 'fecha_inicio_ejecucion' } };
    const e = run(row, proof, s);
    expect(fact(e, 'planned_start').value).toEqual({ kind: 'date', value: '2034-05-01' });
    expect(fact(e, 'start_comparison').value).toMatchObject({ value: 'Diferentes' });
    expect(run({ ...row, fecha_inicio_ejecucion: '2034-05-01' }, proof, s).state).toBe('error');
  });
  it('does not pretend a missing application record contains zero values', () => {
    const e = evidenciaFechasAplicacion(scope, { rows: [], proof: { ...proof, rowsRead: 0, expectedRows: 0 } });
    expect(e.state).toBe('partial'); expect(e.facts).toHaveLength(7); expect(e.facts.every(f => f.value.kind === 'unknown')).toBe(true);
  });
  it('preserves an exact record read under partial population metadata without closing the cohort', () => {
    const e = run(row, { ...proof, population: 'partial', expectedRows: null });
    expect(e.state).toBe('partial'); expect(fact(e, 'actual_start').assertion).toBe('record_value');
  });
  it('requires one canonical application, not homonyms, duplicate rows or different IDs', () => {
    expect(run({ ...row, id: 'app-b' }).state).toBe('error');
    expect(evidenciaFechasAplicacion(scope, { rows: [row, row], proof: { ...proof, rowsRead: 2, expectedRows: 2 } }).state).toBe('error');
    expect(run(row, { ...proof, identityUnique: false, population: 'partial' }).state).toBe('error');
  });
  it('preserves the exact DB Calculada status without inventing Planeada or claiming execution', () => {
    const e = run({ ...row, estado: 'Calculada' });
    expect(fact(e, 'status').value).toEqual({ kind: 'status', value: 'Calculada' });
    expect(fact(run({ ...row, estado: 'Planeada' }), 'status').value.kind).toBe('unknown');
  });
  it('keeps unsupported status unknown while retaining supported dates', () => {
    const e = run({ ...row, estado: 'Completada físicamente' });
    expect(fact(e, 'status').value.kind).toBe('unknown'); expect(fact(e, 'actual_start').value.kind).toBe('date');
  });
  it('rejects count/source mismatches rather than manufacturing a proof', () => {
    for (const patch of [{ rowsRead: 2 }, { fields: ['estado'] }, { scopeId: 'elsewhere' }, { tool: 'other' }]) expect(run(row, { ...proof, ...patch }).state).toBe('error');
  });
  it('validates scope before requesting only exact date/status metadata', async () => {
    const read = vi.fn(async () => ({ rows: [{ ...row, responsable: 'PRIVATE_NAME', observaciones: 'PRIVATE_TEXT' }], proof }));
    const e = await recolectarFechasAplicacion([scope], { read });
    expect(read).toHaveBeenCalledExactlyOnceWith({ scope, table: 'aplicaciones', projection: PROYECCION_FECHAS_APLICACION });
    expect(PROYECCION_FECHAS_APLICACION).not.toMatch(/responsable|emplead|salario|observacion/);
    expect(JSON.stringify(e)).not.toContain('PRIVATE_');
    read.mockClear();
    expect((await recolectarFechasAplicacion([{ ...scope, entities: [] }], { read })).state).toBe('error');
    expect(read).not.toHaveBeenCalled();
  });
  it('retains successful exact scopes when a separate read fails', async () => {
    const read = vi.fn().mockResolvedValueOnce({ rows: [row], proof }).mockRejectedValueOnce(Error('PRIVATE_ERROR'));
    const e = await recolectarFechasAplicacion([scope, { ...scope, id: 'other', entities: [{ kind: 'application', id: 'app-b', label: 'Homónimo' }] }], { read });
    expect(e.state).toBe('partial'); expect(e.facts).toHaveLength(7); expect(JSON.stringify(e)).not.toContain('PRIVATE_ERROR');
  });
});
