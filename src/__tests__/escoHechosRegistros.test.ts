import { describe, expect, it } from 'vitest';
import { construirHechosRegistros } from '@/utils/escoHechosRegistros';
import { validarEvidencia, type PopulationProof, type Scope } from '@/utils/escoEvidencia';
const milk: Scope = { id: 'milk', operation: 'milk.production', entities: [], filters: {}, period: { from: '2034-05-01', to: '2034-05-31', referenceDay: '2034-06-01', clock: 'America/Bogota', basis: 'observation', fieldMeaning: 'fecha' } };
const finance: Scope = { ...milk, id: 'finance', operation: 'finance.records', filters: { ledger: 'ingreso' }, period: { ...milk.period!, basis: 'recorded_at' } };
const observation = (animal_id = 'a', fecha = '2034-05-01', litros_total: unknown = '1.25') => ({ animal_id, fecha, litros_total });
const record = (id = 'r', valor: unknown = '100.25') => ({ id, fecha: '2034-05-01', valor });
function proof(scope: Scope, n: number, extra: Partial<PopulationProof> = {}): PopulationProof {
  return { populationId: 'population', scopeId: scope.id, tool: scope.operation === 'milk.production' ? 'get_hato_produccion' : 'get_financial_summary',
    fields: scope.operation === 'milk.production' ? ['animal_id', 'fecha', 'litros_total', 'num_pesajes', 'promedio_litros'] : ['id', 'fecha', 'valor'],
    capturedAt: '2034-06-01T12:00:00Z', population: 'complete', rowsRead: n, expectedRows: n, identityUnique: true, consistency: 'stable_count_pages', ...extra };
}
const metric = (e: ReturnType<typeof construirHechosRegistros>, name: string) => e.facts.find(f => f.metric === name)!;

describe('puente puro de observaciones de leche', () => {
  it('calcula suma y media exactas de litros originales, nunca del DTO redondeado', () => {
    const rows = [observation('a', '2034-05-01', '0.1'), observation('b', '2034-05-01', '0.2')], p = proof(milk, 2);
    const e = construirHechosRegistros(milk, rows, p); expect(e.state).toBe('ok');
    expect(metric(e, 'milk.volume').value).toEqual({ kind: 'decimal', value: '0.3', unit: 'L' });
    expect(metric(e, 'milk.mean').value).toEqual({ kind: 'decimal', value: '0.15', unit: 'L/pesaje', denominator: 'pesaje_observado' });
    expect(metric(e, 'milk.count').value).toEqual({ kind: 'decimal', value: '2', unit: 'registro' });
    expect(metric(e, 'milk.mean').derivation?.inputs).toEqual([{ factId: 'records:milk.volume' }, { factId: 'records:milk.count' }]);
    expect(validarEvidencia(e, [milk], [p])).toBe(true);
  });
  it('conserva precisión más allá del número JS seguro cuando la fuente es cadena decimal', () => {
    const e = construirHechosRegistros(milk, [observation('a', '2034-05-01', '9007199254740993.125')], proof(milk, 1));
    expect(metric(e, 'milk.volume').value).toEqual({ kind: 'decimal', value: '9007199254740993.125', unit: 'L' });
  });
  it('media periódica no se inventa por redondeo; conteo y volumen siguen conocidos', () => {
    const rows = [observation('a', '2034-05-01', '1'), observation('b', '2034-05-01', '0'), observation('c', '2034-05-01', '0')];
    const e = construirHechosRegistros(milk, rows, proof(milk, 3)); expect(e.state).toBe('partial');
    expect(metric(e, 'milk.mean').value).toEqual({ kind: 'unknown', reason: 'invalid_value' });
    expect(metric(e, 'milk.volume').value).toEqual({ kind: 'decimal', value: '1', unit: 'L' });
    expect(metric(e, 'milk.count').value.kind).toBe('decimal');
  });
  it.each([null, undefined, ''])('no convierte valor faltante o inválido %# en cero', valor => {
    const rows = [observation('a', '2034-05-01', '2.75'), { ...observation('b'), litros_total: valor }], p = proof(milk, 2);
    const e = construirHechosRegistros(milk, rows, p);
    expect(metric(e, 'milk.volume').value).toEqual({ kind: 'decimal', value: '2.75', unit: 'L' });
    expect(metric(e, 'milk.volume').assertion).toBe('verified_subtotal'); expect(metric(e, 'milk.volume').coverage.missingValues).toBe(1);
    expect(metric(e, 'milk.mean').value.kind).toBe('unknown'); expect(metric(e, 'milk.count').assertion).toBe('record_count');
    expect(validarEvidencia(e, [milk], [p])).toBe(true);
  });
  it('cero observado es conocido y distinto de ventana sin observaciones', () => {
    const cero = construirHechosRegistros(milk, [observation('a', '2034-05-01', '0')], proof(milk, 1));
    expect(metric(cero, 'milk.mean').value).toEqual({ kind: 'decimal', value: '0', unit: 'L/pesaje', denominator: 'pesaje_observado' });
    const vacio = construirHechosRegistros(milk, [], proof(milk, 0));
    expect(metric(vacio, 'milk.count').assertion).toBe('bounded_empty'); expect(metric(vacio, 'milk.count').value).toEqual({ kind: 'decimal', value: '0', unit: 'registro' });
    expect(metric(vacio, 'milk.mean').value.kind).toBe('unknown'); expect(metric(vacio, 'milk.volume').value.kind).toBe('unknown');
  });
  it('población parcial no convierte suma o media de página en total completo', () => {
    const e = construirHechosRegistros(milk, [observation()], proof(milk, 1, { population: 'partial', expectedRows: 5 }));
    expect(metric(e, 'milk.count').assertion).toBe('verified_subtotal'); expect(metric(e, 'milk.volume').assertion).toBe('verified_subtotal');
    expect(metric(e, 'milk.mean').value.kind).toBe('unknown'); expect(e.state).toBe('partial');
  });
  it('sin conteo conocido conserva datos observados y explicita incompletitud', () => {
    const e = construirHechosRegistros(milk, [observation()], proof(milk, 1, { population: 'unknown', expectedRows: null, consistency: 'not_attested' }));
    expect(e.state).toBe('partial'); expect(e.issues.map(i => i.code)).toContain('missing_count'); expect(metric(e, 'milk.volume').value.kind).toBe('decimal');
    const vacio = construirHechosRegistros(milk, [], proof(milk, 0, { population: 'unknown', expectedRows: null, consistency: 'not_attested' }));
    expect(metric(vacio, 'milk.count').value.kind).toBe('unknown');
  });
  it('UUID distingue homónimos y número de chapeta repetido; duplicación compuesta se rechaza', () => {
    const rows = [{ ...observation('a'), nombre: 'Homónima', numero: 123 }, { ...observation('b'), nombre: 'Homónima', numero: 123 }];
    expect(construirHechosRegistros(milk, rows, proof(milk, 2)).state).toBe('ok');
    expect(construirHechosRegistros(milk, [observation(), observation()], proof(milk, 2)).issues[0].code).toBe('duplicate_identity');
    expect(construirHechosRegistros(milk, [{ ...observation(), id: 'r' }, { ...observation('a', '2034-05-02'), id: 'r' }], proof(milk, 2)).issues[0].code).toBe('duplicate_identity');
  });
  it('alcance individual solo produce hechos del UUID solicitado; otra vaca no lo sustituye', () => {
    const s: Scope = { ...milk, entities: [{ kind: 'animal', id: 'a', label: 'Vaca sintética' }] };
    const e = construirHechosRegistros(s, [observation('a')], proof(s, 1)); expect(e.state).toBe('ok');
    expect(e.facts.every(f => f.entities[0]?.id === 'a')).toBe(true);
    expect(construirHechosRegistros(s, [observation('b')], proof(s, 1)).issues[0].code).toBe('outside_scope');
  });
  it('valida filtro UUID explícito y fecha de observación', () => {
    const s: Scope = { ...milk, filters: { animal_id: 'a' } }, p = proof(s, 1);
    expect(construirHechosRegistros(s, [observation()], p).state).toBe('ok');
    expect(construirHechosRegistros(s, [observation('b')], p).state).toBe('error');
    expect(construirHechosRegistros(milk, [observation('a', '2034-06-01')], proof(milk, 1)).issues[0].code).toBe('outside_scope');
    expect(construirHechosRegistros(milk, [observation('a', '2034-02-30')], proof(milk, 1)).issues[0].code).toBe('invalid_value');
  });
  it('respeta la restricción existente de litros no negativos sin borrar el conteo', () => {
    const e = construirHechosRegistros(milk, [observation('a', '2034-05-01', '-1')], proof(milk, 1));
    expect(metric(e, 'milk.volume').value).toEqual({ kind: 'unknown', reason: 'invalid_value' });
    expect(metric(e, 'milk.count').value.kind).toBe('decimal');
  });
  it('no acepta una unidad contradictoria ni permite alterar L/pesaje', () => {
    expect(construirHechosRegistros(milk, [{ ...observation(), unit: 'COP' }], proof(milk, 1)).issues[0].code).toBe('unknown_unit');
    const e = construirHechosRegistros(milk, [{ ...observation(), unit: 'L' }], proof(milk, 1)); expect(e.state).toBe('ok');
    expect(metric(e, 'milk.mean').value).toEqual({ kind: 'decimal', value: '1.25', unit: 'L/pesaje', denominator: 'pesaje_observado' });
  });
});

describe('puente de montos registrados por ledger', () => {
  it.each(['gasto', 'ingreso'])('suma %s separado en COP, sin colección/pago implícitos', ledger => {
    const s: Scope = { ...finance, filters: { ledger } }, p = proof(s, 2);
    const e = construirHechosRegistros(s, [record('a', '100.25'), record('b', '0.75')], p);
    expect(e.state).toBe('ok'); expect(e.facts).toHaveLength(1);
    expect(e.facts[0].metric).toBe('finance.recorded'); expect(e.facts[0].value).toEqual({ kind: 'decimal', value: '101', unit: 'COP' });
    expect(e.facts[0].assertion).toBe('scoped_total'); expect(validarEvidencia(e, [s], [p])).toBe(true);
  });
  it('sin ledger explícito o con ledger mixto no inventa una suma contable', () => {
    const casos: Scope['filters'][] = [{}, { ledger: 'ambos' }, { ledger: ['gasto', 'ingreso'] }];
    for (const filters of casos) {
      const s: Scope = { ...finance, filters }; expect(construirHechosRegistros(s, [], proof(s, 0)).state).toBe('error');
    }
  });
  it('vacío completo equivale a monto registrado cero; desconocido nunca es cero', () => {
    const e = construirHechosRegistros(finance, [], proof(finance, 0)); expect(e.state).toBe('ok');
    expect(e.facts[0].value).toEqual({ kind: 'decimal', value: '0', unit: 'COP' });
    const unknown = construirHechosRegistros(finance, [], proof(finance, 0, { population: 'unknown', expectedRows: null })); expect(unknown.facts[0].value.kind).toBe('unknown');
  });
  it('subtotal explícito conserva valores conocidos y no convierte null en cero', () => {
    const e = construirHechosRegistros(finance, [record('a'), record('b', null)], proof(finance, 2));
    expect(e.state).toBe('partial'); expect(e.facts[0].assertion).toBe('verified_subtotal'); expect(e.facts[0].coverage.missingValues).toBe(1);
    expect(e.facts[0].value).toEqual({ kind: 'decimal', value: '100.25', unit: 'COP' });
    const allMissing = construirHechosRegistros(finance, [record('a', null)], proof(finance, 1)); expect(allMissing.facts[0].value.kind).toBe('unknown');
  });
  it('valores negativos registrados se conservan sin inventar política financiera', () => {
    expect(construirHechosRegistros(finance, [record('r', '-2.5')], proof(finance, 1)).facts[0].value).toEqual({ kind: 'decimal', value: '-2.5', unit: 'COP' });
  });
  it('filtros de negocio/estado deben figurar en la prueba y cada fila', () => {
    const s: Scope = { ...finance, filters: { ledger: 'gasto', estado: 'Confirmado', negocio_id: 'business' } };
    const p = proof(s, 1, { fields: ['id', 'fecha', 'valor', 'estado', 'negocio_id'] });
    expect(construirHechosRegistros(s, [{ ...record(), estado: 'Confirmado', negocio_id: 'business' }], p).state).toBe('ok');
    expect(construirHechosRegistros(s, [{ ...record(), estado: 'Pendiente', negocio_id: 'business' }], p).state).toBe('error');
    expect(construirHechosRegistros(s, [record()], proof(s, 1)).state).toBe('error');
  });
  it('duplicados no se suman y unidad distinta no se convierte a COP', () => {
    expect(construirHechosRegistros(finance, [record(), record()], proof(finance, 2)).issues[0].code).toBe('duplicate_identity');
    expect(construirHechosRegistros(finance, [{ ...record(), unidad: 'USD' }], proof(finance, 1)).issues[0].code).toBe('unknown_unit');
  });
  it('no proyecta identidades, remuneración individual, notas, URLs o extensiones de DTO', () => {
    const rows = [{ ...record(), nombre: 'PersonaInventadaPrivada', observaciones: 'NotaReservada', proveedor: 'ProveedorInventado', salario: '1234567', url_factura: 'https://example.invalid/secret' }];
    const json = JSON.stringify(construirHechosRegistros(finance, rows, proof(finance, 1)));
    expect(json).not.toMatch(/PersonaInventada|NotaReservada|ProveedorInventado|1234567|url_factura|example.invalid/);
  });
});

describe('prueba externa y límites', () => {
  it('prueba ausente o corrupta falla cerrada sin promover valores', () => {
    expect(construirHechosRegistros(milk, [observation()], undefined as unknown as PopulationProof).state).toBe('error');
    expect(construirHechosRegistros(milk, [observation()], { ...proof(milk, 1), fields: null } as unknown as PopulationProof).state).toBe('error');
  });
  it.each([
    { scopeId: 'otro' }, { tool: 'otro' }, { rowsRead: 2, expectedRows: 2 }, { expectedRows: null },
    { fields: ['animal_id', 'fecha', 'litros_total'] }, { capturedAt: 'ayer' }, { identityUnique: false },
  ])('rechaza atestación no aplicable %#', cambio => {
    expect(construirHechosRegistros(milk, [observation()], proof(milk, 1, cambio)).state).toBe('error');
  });
  it.each([NaN, Infinity, '1e3', '1,25', Number.MAX_SAFE_INTEGER + 1])('cantidad inválida %# no fabrica suma', n => {
    const e = construirHechosRegistros(finance, [record('r', n)], proof(finance, 1)); expect(e.state).toBe('partial'); expect(e.facts[0].value.kind).toBe('unknown');
  });
  it('desbordamiento representable preserva conteo y declara monto desconocido', () => {
    const rows = [observation('a', '2034-05-01', '999999999999999999999999'), observation('b', '2034-05-01', '1')];
    const e = construirHechosRegistros(milk, rows, proof(milk, 2)); expect(e.state).toBe('partial');
    expect(metric(e, 'milk.volume').value.kind).toBe('unknown'); expect(metric(e, 'milk.count').value.kind).toBe('decimal');
  });
  it('no procesa filas fuera del presupuesto ni otro tipo de operación', () => {
    expect(construirHechosRegistros(milk, Array.from({ length: 20001 }, () => observation()), proof(milk, 20001)).issues[0].code).toBe('budget_exceeded');
    const s: Scope = { ...milk, operation: 'labor.by_lot', period: { ...milk.period!, basis: 'actual', fieldMeaning: 'fecha_trabajo' } };
    expect(construirHechosRegistros(s, [], proof(s, 0)).state).toBe('error');
  });
});
