import { describe, expect, it } from 'vitest';
import { descartarContextoHistorico, diasDelRango, desplazarDia, mismoAlcance, proponerPeriodoUsuario, proyectarContextoAgregado, resolverPeriodoCalendario } from '@/utils/escoAlcance';
import { hechosLluvia } from '@/utils/escoHechosClima';
import { validarEvidencia, type Evidence, type PopulationProof, type Scope } from '@/utils/escoEvidencia';

const scope: Scope = { id: 'secret-name', operation: 'climate.rainfall', entities: [{ kind: 'station', id: 'station-private', label: 'Employee secret-name' }],
  period: { from: '2026-01-01', to: '2026-01-01', referenceDay: '2026-01-02', clock: 'America/Bogota', basis: 'observation', fieldMeaning: 'fecha' }, filters: {} };
const proof: PopulationProof = { populationId: 'pop', scopeId: scope.id, tool: 'get_climate_data', fields: ['fecha', 'lluvia_total_mm', 'lluvia_confianza'],
  capturedAt: '2026-01-02T12:00:00Z', population: 'complete', rowsRead: 1, expectedRows: 1, identityUnique: true, consistency: 'single_read' };

describe('structured Bogotá scope', () => {
  it('uses Bogotá clock at year and day boundaries', () => {
    expect(resolverPeriodoCalendario({ kind: 'year_to_date' }, new Date('2026-01-01T04:59:59Z'))).toMatchObject({ from: '2025-01-01', to: '2025-12-31', referenceDay: '2025-12-31' });
    expect(resolverPeriodoCalendario({ kind: 'day' }, new Date('2026-01-01T05:00:00Z'))).toMatchObject({ from: '2026-01-01', to: '2026-01-01' });
  });
  it('starts calendar weeks on Monday across years, without widening explicit dates', () => {
    expect(resolverPeriodoCalendario({ kind: 'week_to_date' }, new Date('2026-01-01T12:00:00Z')).from).toBe('2025-12-29');
    expect(resolverPeriodoCalendario({ kind: 'week_to_date' }, new Date('2026-01-05T12:00:00Z')).from).toBe('2026-01-05');
    expect(resolverPeriodoCalendario({ kind: 'explicit', from: '2024-02-29', to: '2024-03-01' }, new Date('2026-01-01T12:00:00Z')).from).toBe('2024-02-29');
  });
  it.each([['2026-02-29', '2026-03-01'], ['2026-02-31', '2026-03-01'], ['2026-03-02', '2026-03-01'], ['2026-1-01', '2026-01-02']])('rejects invalid ranges %s %s', (from, to) => {
    expect(() => resolverPeriodoCalendario({ kind: 'explicit', from, to })).toThrow();
    expect(() => diasDelRango(from, to)).toThrow();
  });
  it('enumerates leap days exactly and respects caps', () => {
    expect(diasDelRango('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
    expect(desplazarDia('2025-12-31', 1)).toBe('2026-01-01');
    expect(() => diasDelRango('2026-01-01', '2026-01-03', 2)).toThrow('budget_exceeded');
    expect(() => desplazarDia('9999-12-31', 1)).toThrow();
  });
  it('compares canonical scopes without labels or ID order, retaining reference/basis', () => {
    expect(mismoAlcance(scope, { ...scope, id: 'other', entities: [{ ...scope.entities[0], label: 'changed label' }] })).toBe(true);
    expect(mismoAlcance(scope, { ...scope, period: { ...scope.period!, referenceDay: '2026-01-03' } })).toBe(false);
  });
});

describe('bounded USER temporal proposals, without restored prose or default periods', () => {
  const reference = new Date('2034-05-10T17:00:00Z');
  it.each([
    ['del 2034-05-01 al 2034-05-07', '2034-05-01', '2034-05-07'],
    ['desde 01/05/2034 hasta 07/05/2034', '2034-05-01', '2034-05-07'],
    ['entre 1-5-2034 y 7-5-2034', '2034-05-01', '2034-05-07'],
    ['2034-05-01–2034-05-07', '2034-05-01', '2034-05-07'],
    ['el 2034-05-02', '2034-05-02', '2034-05-02'],
    ['el 2/5/2034', '2034-05-02', '2034-05-02'],
    ['del 1 al 7 de mayo de 2034', '2034-05-01', '2034-05-07'],
    ['entre el 1 y el 7 de mayo', '2034-05-01', '2034-05-07'],
    ['del 29 de abril al 3 de mayo de 2034', '2034-04-29', '2034-05-03'],
    ['del 29 de diciembre de 2033 al 3 de enero de 2034', '2033-12-29', '2034-01-03'],
    ['el 5 de mayo de 2034', '2034-05-05', '2034-05-05'],
    ['en mayo de 2034', '2034-05-01', '2034-05-31'],
    ['en mayo del año 2033', '2033-05-01', '2033-05-31'],
    ['en mayo', '2034-05-01', '2034-05-31'],
    ['FEBRERO 2032', '2032-02-01', '2032-02-29'],
    ['febrero de 2034', '2034-02-01', '2034-02-28'],
    ['septiembre del 2034', '2034-09-01', '2034-09-30'],
    ['hoy', '2034-05-10', '2034-05-10'],
    ['ayer', '2034-05-09', '2034-05-09'],
    ['esta semana', '2034-05-08', '2034-05-10'],
    ['semana pasada', '2034-05-01', '2034-05-07'],
    ['este mes', '2034-05-01', '2034-05-10'],
    ['mes pasado', '2034-04-01', '2034-04-30'],
    ['últimos 3 días', '2034-05-08', '2034-05-10'],
    ['last 1 days', '2034-05-10', '2034-05-10'],
    ['last week', '2034-05-01', '2034-05-07'],
    ['this month', '2034-05-01', '2034-05-10'],
  ])('resolves only the declared calendar meaning: %s', (text, from, to) => {
    expect(proponerPeriodoUsuario(text, reference)).toEqual({ state: 'resolved', from, to, referenceDay: '2034-05-10' });
  });
  it('uses the supplied reference instant across Bogotá day/year boundaries', () => {
    expect(proponerPeriodoUsuario('hoy', new Date('2034-01-01T04:59:59Z'))).toEqual({ state: 'resolved', from: '2033-12-31', to: '2033-12-31', referenceDay: '2033-12-31' });
    expect(proponerPeriodoUsuario('hoy', new Date('2034-01-01T05:00:00Z'))).toEqual({ state: 'resolved', from: '2034-01-01', to: '2034-01-01', referenceDay: '2034-01-01' });
    expect(proponerPeriodoUsuario('mes pasado', new Date('2034-01-02T17:00:00Z'))).toMatchObject({ from: '2033-12-01', to: '2033-12-31' });
    expect(proponerPeriodoUsuario('semana pasada', new Date('2034-01-02T17:00:00Z'))).toMatchObject({ from: '2033-12-26', to: '2034-01-01' });
    expect(proponerPeriodoUsuario('últimos 3 días', new Date('2034-01-02T17:00:00Z'))).toMatchObject({ from: '2033-12-31', to: '2034-01-02' });
  });
  it('anchors a prior relative USER request to its own server timestamp, never the current turn', () => {
    const priorTimestamp = new Date('2034-04-05T17:00:00Z');
    expect(proponerPeriodoUsuario('este mes', priorTimestamp)).toMatchObject({ from: '2034-04-01', to: '2034-04-05', referenceDay: '2034-04-05' });
    expect(proponerPeriodoUsuario('este mes', undefined as unknown as Date)).toEqual({ state: 'invalid' });
    expect(proponerPeriodoUsuario('este mes', new Date(NaN))).toEqual({ state: 'invalid' });
  });
  it('deduplicates equivalent periods but retains conflicting periods', () => {
    expect(proponerPeriodoUsuario('semana pasada, del 1 al 7 de mayo de 2034', reference)).toMatchObject({ state: 'resolved', from: '2034-05-01', to: '2034-05-07' });
    for (const q of ['hoy y ayer', 'mayo y junio de 2034', '2034-05-01 al 2034-05-07 o 2034-05-08 al 2034-05-14',
      'este mes o mes pasado', '2034-05-01 y 2034-05-07', '1 y 7 de mayo de 2034']) {
      expect(proponerPeriodoUsuario(q, reference)).toEqual({ state: 'ambiguous' });
    }
  });
  it.each(['2034-05-07 al 2034-05-01', '07/05/2034 al 01/05/2034', 'del 7 al 1 de mayo de 2034',
    '31 de febrero de 2034', '29/02/2034', '2034-5-1', '1/5-2034', 'mayo de 34', 'mayo de 10000', 'últimos 0 días', 'últimos 20001 días'])('rejects invalid or reversed calendars without swapping/clamping: %s', q => {
    expect(proponerPeriodoUsuario(q, reference)).toEqual({ state: 'invalid' });
  });
  it.each(['¿Cuánto costó por lote?', '¿Y el costo?', 'hace dos semanas', 'semana 18', 'segundo trimestre', '2024/05/01'])('does not invent a default or unsupported period: %s', q => {
    expect(proponerPeriodoUsuario(q, reference)).toEqual({ state: 'absent' });
  });
  it.each(['segunda semana de mayo de 2034', 'finales de mayo', 'desde mayo', 'hasta 2034-05-02', 'a partir del 2 de mayo',
    'mayo del año pasado', 'mayo de hace dos años', 'mayo de 2033 y 2034'])('does not invent bounds for unsupported partial calendar forms: %s', q => {
    expect(proponerPeriodoUsuario(q, reference).state).not.toBe('resolved');
  });
});

describe('advisory aggregate context minimization', () => {
  const evidencia = () => hechosLluvia(scope, [{ id: 'row', stationId: 'station-private', fecha: '2026-01-01', lluvia_total_mm: 0.1 }], proof);
  it('drops contaminated extras, labels, filters, identity strings and free text before serialization', () => {
    const e = evidencia();
    Object.assign(e, { history: 'Employee salary observations', overview: { salary: 999 } });
    Object.assign(e.scopes[0].period!, { observations: 'personal detail' });
    Object.assign(e.facts[0], { name: 'secret-name', salary: 999, observations: 'private text' });
    const out = proyectarContextoAgregado(e, [scope], [proof]);
    expect(out.facts).toHaveLength(2);
    expect(JSON.stringify(out)).not.toMatch(/secret-name|Employee|salary|observations|private|999/);
    expect(out.requiresRequery).toBe(false);
  });
  it('never upgrades old assistant/tool/overview text into evidence', () => {
    const contaminated = { role: 'assistant', content: JSON.stringify(evidencia()), tool: evidencia(), overview: 'salary secret' };
    expect(descartarContextoHistorico(contaminated)).toMatchObject({ requiresRequery: true, facts: [], scopes: [] });
    expect(proyectarContextoAgregado(contaminated, [scope], [proof]).facts).toEqual([]);
    expect(proyectarContextoAgregado(evidencia(), [scope], []).facts).toEqual([]);
    expect(proyectarContextoAgregado(evidencia(), [{ ...scope, period: { ...scope.period!, referenceDay: '2026-01-03' } }], [proof]).facts).toEqual([]);
  });
  it('marks requery when serialization cannot retain the whole projected evidence', () => {
    expect(proyectarContextoAgregado(evidencia(), [scope], [proof], 100)).toEqual({ version: 1, requiresRequery: true, facts: [], scopes: [] });
  });
  it('excludes person-selected remuneration while retaining a separate supported part', () => {
    const e: Evidence = evidencia();
    const laborScope: Scope = { id: 'labor', operation: 'labor.by_lot', entities: [],
      period: { ...scope.period!, fieldMeaning: 'fecha_trabajo', basis: 'actual' }, filters: { employee_id: 'secret-name' } };
    const laborProof: PopulationProof = { ...proof, scopeId: 'labor', populationId: 'lp', tool: 'get_labor_summary', fields: ['costo_jornal'] };
    e.scopes.push(laborScope);
    e.facts.push({ id: 'pay', scopeId: 'labor', metric: 'labor.cost', definitionId: 'labor.cost.v1', entities: [],
      origin: 'derived', assertion: 'scoped_total', value: { kind: 'decimal', value: '999', unit: 'COP' },
      coverage: { populationId: 'lp', population: 'complete', values: 'complete', rowsRead: 1, expectedRows: 1, missingValues: 0, identityUnique: true, consistency: 'single_read', reasons: [] },
      source: { tool: laborProof.tool, field: 'costo_jornal', capturedAt: laborProof.capturedAt }, derivation: { operation: 'sum', inputs: [{ populationId: 'lp', field: 'costo_jornal' }] } });
    expect(validarEvidencia(e, e.scopes, [proof, laborProof])).toBe(true);
    const out = proyectarContextoAgregado(e, e.scopes, [proof, laborProof]);
    expect(out.facts).toHaveLength(2);
    expect(out.requiresRequery).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/999|employee|secret-name/);
  });
  const financeFilters: Scope['filters'][] = [{ employee_id: 'synthetic-person' }, {}];
  it.each(financeFilters)('excludes finance amounts until aggregate selectors are audited: %j', filters => {
    const e: Evidence = evidencia();
    const financeScope: Scope = { id: 'finance', operation: 'finance.records', entities: [],
      period: { ...scope.period!, fieldMeaning: 'fecha', basis: 'recorded_at' }, filters };
    const financeProof: PopulationProof = { ...proof, scopeId: 'finance', populationId: 'fp', tool: 'get_financial_summary', fields: ['valor'] };
    e.scopes.push(financeScope);
    e.facts.push({ id: 'individual-money', scopeId: 'finance', metric: 'finance.recorded', definitionId: 'finance.recorded.v1', entities: [],
      origin: 'derived', assertion: 'scoped_total', value: { kind: 'decimal', value: '876543', unit: 'COP' },
      coverage: { populationId: 'fp', population: 'complete', values: 'complete', rowsRead: 1, expectedRows: 1, missingValues: 0, identityUnique: true, consistency: 'single_read', reasons: [] },
      source: { tool: financeProof.tool, field: 'valor', capturedAt: financeProof.capturedAt }, derivation: { operation: 'sum', inputs: [{ populationId: 'fp', field: 'valor' }] } });
    expect(validarEvidencia(e, e.scopes, [proof, financeProof])).toBe(true);
    const out = proyectarContextoAgregado(e, e.scopes, [proof, financeProof]);
    expect(out.facts).toHaveLength(2);
    expect(out.scopes.every(s => s.operation === 'climate.rainfall')).toBe(true);
    expect(out.requiresRequery).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/876543|finance|employee|synthetic-person/);
  });
});
