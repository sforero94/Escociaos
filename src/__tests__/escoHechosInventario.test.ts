import { describe, expect, it } from 'vitest';
import { coincidenciaNombreProducto, construirHechosInventario, INVENTARIO_PROYECCION, type EntradaHechosInventario } from '@/utils/escoHechosInventario';
import { validarEvidencia, type PopulationProof, type Scope } from '@/utils/escoEvidencia';

const scope: Scope = { id: 'inventory', operation: 'inventory.status', entities: [], period: null, filters: { activo: 'true' } };
const fila = (id = 'p1', cambios: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, nombre: 'Homónimo', activo: true, unidad_medida: 'Kilos', cantidad_actual: '0', stock_minimo: '2.5', ...cambios,
});
function entrada(rows: Record<string, unknown>[], cambios: Partial<PopulationProof> = {}, alcance = scope): EntradaHechosInventario {
  return { scope: alcance, rows, populationId: 'products', populations: [{
    populationId: 'products', scopeId: alcance.id, tool: 'get_inventory_status', fields: INVENTARIO_PROYECCION,
    capturedAt: '2034-05-08T12:00:00.000Z', population: 'complete', rowsRead: rows.length,
    expectedRows: rows.length, identityUnique: true, consistency: 'stable_count_pages', ...cambios,
  }] };
}
const saldo = (e: ReturnType<typeof construirHechosInventario>, id = 'p1') => e.facts.find(f => f.metric === 'inventory.stock' && f.entities[0]?.id === id)!;

describe('inventario registrado con población externa', () => {
  it('conserva la tercera página y un total real superior al viejo límite de 50', () => {
    const rows = Array.from({ length: 125 }, (_, i) => fila(`p${i}`, { cantidad_actual: String(i) }));
    const input = entrada(rows), e = construirHechosInventario(input);
    expect(e.state).toBe('ok'); expect(e.facts[0].value).toEqual({ kind: 'decimal', value: '125', unit: 'registro' });
    expect(saldo(e, 'p124').value).toEqual({ kind: 'decimal', value: '124', unit: 'Kilos' });
    expect(validarEvidencia(e, [scope], input.populations)).toBe(true);
  });
  it('50 filas de 125 solo son un subtotal verificado', () => {
    const e = construirHechosInventario(entrada(Array.from({ length: 50 }, (_, i) => fila(`p${i}`)), { population: 'partial', expectedRows: 125 }));
    expect(e.state).toBe('partial'); expect(e.facts[0].assertion).toBe('verified_subtotal');
    expect(e.facts[0].coverage.expectedRows).toBe(125); expect(saldo(e, 'p49').value.kind).toBe('decimal');
  });
  it('un tamaño menor a 50 y sin conteo no atesta fin de población', () => {
    const e = construirHechosInventario(entrada([fila()], { population: 'unknown', expectedRows: null, consistency: 'not_attested' }));
    expect(e.state).toBe('partial'); expect(e.facts[0].assertion).toBe('verified_subtotal');
    expect(e.issues.map(i => i.code)).toContain('missing_count'); expect(saldo(e).value.kind).toBe('decimal');
  });
  it('población vacía sin prueba de conteo no es cero', () => {
    const e = construirHechosInventario(entrada([], { population: 'unknown', expectedRows: null, consistency: 'not_attested' }));
    expect(e.facts[0].value).toEqual({ kind: 'unknown', reason: 'missing_count' });
  });
  it('cero vacío exacto requiere prueba de población completa', () => {
    const e = construirHechosInventario(entrada([])); expect(e.state).toBe('ok');
    expect(e.facts[0].assertion).toBe('bounded_empty'); expect(e.facts[0].value).toEqual({ kind: 'decimal', value: '0', unit: 'registro' });
  });
  it.each([null, undefined])('no transforma saldo %s en cero ni contamina el mínimo conocido', valor => {
    const input = entrada([fila('p1', { cantidad_actual: valor })]); const e = construirHechosInventario(input);
    expect(saldo(e).value).toEqual({ kind: 'unknown', reason: 'missing_value' });
    expect(e.facts.find(f => f.metric === 'inventory.minimum')?.value).toEqual({ kind: 'decimal', value: '2.5', unit: 'Kilos' });
    expect(e.facts[0].assertion).toBe('record_count'); expect(validarEvidencia(e, [scope], input.populations)).toBe(true);
  });
  it('mínimo desconocido no fabrica alerta ni sustituye el saldo conocido', () => {
    const e = construirHechosInventario(entrada([fila('p1', { cantidad_actual: '-1.25', stock_minimo: null })]));
    expect(saldo(e).value).toEqual({ kind: 'decimal', value: '-1.25', unit: 'Kilos' });
    expect(e.facts.find(f => f.metric === 'inventory.minimum')?.value).toEqual({ kind: 'unknown', reason: 'missing_value' });
  });
  it('cero explícito sí es un saldo registrado conocido', () => expect(saldo(construirHechosInventario(entrada([fila()]))).value).toEqual({ kind: 'decimal', value: '0', unit: 'Kilos' }));
  it('conserva precisión decimal sin sumar ni convertir unidades', () => {
    const e = construirHechosInventario(entrada([fila('a', { cantidad_actual: '9007199254740993.123456789' }), fila('b', { unidad_medida: 'Litros' })]));
    expect(saldo(e, 'a').value).toEqual({ kind: 'decimal', value: '9007199254740993.123456789', unit: 'Kilos' });
    expect(saldo(e, 'b').value).toEqual({ kind: 'decimal', value: '0', unit: 'Litros' });
    expect(e.facts.filter(f => f.metric === 'inventory.stock')).toHaveLength(2);
    expect(e.facts.filter(f => f.assertion === 'scoped_total')).toHaveLength(0);
  });
  it.each([NaN, Infinity, '', '1e3', '1,2', Number.MAX_SAFE_INTEGER + 1])('rechaza cantidad inválida %s', valor => {
    expect(saldo(construirHechosInventario(entrada([fila('p1', { cantidad_actual: valor })]))).value).toEqual({ kind: 'unknown', reason: 'invalid_value' });
  });
  it.each([null, undefined, 'kg', 'Bultos'])('no deduce unidad %s del estado físico o presentación', unidad => {
    const e = construirHechosInventario(entrada([fila('p1', { unidad_medida: unidad, estado_fisico: 'Sólido', presentacion_kg_l: 50 })]));
    expect(saldo(e).value).toEqual({ kind: 'unknown', reason: 'unknown_unit' });
  });
  it('mantiene nombres homónimos separados por id y elimina atributos ajenos de la proyección', () => {
    const e = construirHechosInventario(entrada([fila('a', { proveedor: 'secreto', observaciones: 'nota privada', created_by: 'persona' }), fila('b')]));
    expect(saldo(e, 'a').entities).toEqual([{ kind: 'product', id: 'a' }]); expect(saldo(e, 'b').entities).toEqual([{ kind: 'product', id: 'b' }]);
    expect(e.productos).toEqual([{ id: 'a', nombre: 'Homónimo' }, { id: 'b', nombre: 'Homónimo' }]);
    expect(JSON.stringify(e)).not.toMatch(/secreto|nota privada|persona|proveedor|created_by/);
  });
  it('rechaza identidades duplicadas también al final de la tercera página', () => {
    const rows = Array.from({ length: 125 }, (_, i) => fila(`p${i}`)); rows.push(fila('p0'));
    expect(construirHechosInventario(entrada(rows)).issues[0].code).toBe('duplicate_identity');
  });
  it('valida filtro estructurado exacto y el universo activo', () => {
    const s: Scope = { ...scope, filters: { activo: 'true', categoria: 'Fertilizante', grupo: ['Agroinsumos'] } };
    const row = fila('p1', { categoria: 'Fertilizante', grupo: 'Agroinsumos' });
    const p = { fields: [...INVENTARIO_PROYECCION, 'categoria', 'grupo'] };
    expect(construirHechosInventario(entrada([row], p, s)).state).toBe('ok');
    expect(construirHechosInventario(entrada([fila()], p, s)).issues[0].code).toBe('outside_scope');
    expect(construirHechosInventario(entrada([fila('p1', { activo: false })])).state).toBe('error');
    expect(construirHechosInventario(entrada([], {}, { ...scope, filters: {} })).state).toBe('error');
    expect(construirHechosInventario(entrada([], {}, { ...scope, filters: { activo: 'true', product_name: '.*' } })).state).toBe('error');
  });
  it('conserva etiquetas de negocio como literales y no deja perder un saldo por una etiqueta desconocida', () => {
    const e = construirHechosInventario(entrada([fila('a', { nombre: '<producto>' }), fila('b', { nombre: null })]));
    expect(e.productos).toEqual([{ id: 'a', nombre: '<producto>' }, { id: 'b', nombre: null }]);
    expect(saldo(e, 'b').value.kind).toBe('decimal'); expect(e.state).toBe('partial');
  });
  it('declara y valida el substring normalizado sin confundir conteo filtrado con universo activo', () => {
    const s: Scope = { ...scope, filters: { activo: 'true', nombre_contiene: 'sulfato DE cobre' } };
    expect(coincidenciaNombreProducto('Súlfato  de   Cóbre agrícola', s.filters.nombre_contiene)).toBe(true);
    const e = construirHechosInventario(entrada([fila('cobre', { nombre: 'Súlfato  de   Cóbre agrícola' })], {}, s));
    expect(e.state).toBe('ok'); expect(e.scopes[0].filters.nombre_contiene).toBe('sulfato DE cobre');
    expect(e.facts[0].value).toEqual({ kind: 'decimal', value: '1', unit: 'registro' });
    expect(construirHechosInventario(entrada([fila('otro', { nombre: 'Calcio' })], {}, s)).issues[0].code).toBe('outside_scope');
    expect(coincidenciaNombreProducto('Calcio', '%Calcio%')).toBe(false);
  });
  it('cero filtrado verificado conserva criterio sin inventar entidad producto', () => {
    const s: Scope = { ...scope, filters: { activo: 'true', nombre_contiene: 'Producto no encontrado' } };
    const e = construirHechosInventario(entrada([], {}, s));
    expect(e.state).toBe('ok'); expect(e.scopes[0]).toEqual(s); expect(e.facts[0].entities).toEqual([]);
    expect(e.facts[0].assertion).toBe('bounded_empty'); expect(e.facts[0].value).toEqual({ kind: 'decimal', value: '0', unit: 'registro' });
    expect(construirHechosInventario(entrada([], { population: 'unknown', expectedRows: null, consistency: 'not_attested' }, s)).facts[0].value.kind).toBe('unknown');
  });
  it.each(['', '   ', 'x'.repeat(129), ['Calcio'], 42, '\u0301', 'Calcio\n'])('rechaza criterio nombre_contiene vacío o mal formado %#', criterio => {
    expect(coincidenciaNombreProducto('Calcio', criterio)).toBe(false);
    const s = { ...scope, filters: { activo: 'true', nombre_contiene: criterio } } as Scope;
    expect(construirHechosInventario(entrada([], {}, s)).state).toBe('error');
  });
  it('un selector canónico nunca acepta un homónimo distinto', () => {
    const s: Scope = { ...scope, entities: [{ kind: 'product', id: 'a', label: 'Homónimo' }] };
    expect(construirHechosInventario(entrada([fila('b')], {}, s)).state).toBe('error');
    expect(construirHechosInventario(entrada([fila('a')], {}, s)).state).toBe('ok');
  });
  it('exige prueba externa única, campos mínimos y cantidad efectivamente leída', () => {
    const input = entrada([fila()]);
    expect(construirHechosInventario({ ...input, populations: [] }).state).toBe('error');
    expect(construirHechosInventario({ ...input, populations: [...input.populations, ...input.populations] }).state).toBe('error');
    expect(construirHechosInventario(entrada([fila()], { fields: ['id', 'cantidad_actual'] })).state).toBe('error');
    expect(construirHechosInventario(entrada([fila()], { rowsRead: 2, expectedRows: 2 })).state).toBe('error');
    expect(construirHechosInventario(entrada([fila()], { expectedRows: null })).state).toBe('error');
    expect(construirHechosInventario(entrada([fila()], { consistency: 'not_attested' })).state).toBe('error');
    expect(construirHechosInventario(entrada([fila()], { capturedAt: 'ayer' })).state).toBe('error');
  });
  it('presupuesta hechos, escanea anomalías tardías y no promueve omisión a inexistencia', () => {
    const rows = Array.from({ length: 201 }, (_, i) => fila(`p${i}`)); rows[200].cantidad_actual = null;
    const input = entrada(rows), e = construirHechosInventario(input);
    expect(e.facts).toHaveLength(399); expect(e.facts[0].value).toEqual({ kind: 'decimal', value: '201', unit: 'registro' });
    expect(e.issues.map(i => i.code)).toEqual(expect.arrayContaining(['budget_exceeded', 'missing_value']));
    expect(validarEvidencia(e, [scope], input.populations)).toBe(true);
    rows[200].id = 'p0'; expect(construirHechosInventario(entrada(rows)).state).toBe('error');
  });
  it('no emite recepción, ausencia física, cobro ni clasificación stock bajo sin definición aprobada', () => {
    const e = construirHechosInventario(entrada([fila()]));
    expect(e.facts.every(f => ['inventory.count', 'inventory.stock', 'inventory.minimum'].includes(f.metric))).toBe(true);
    expect(e.facts.filter(f => f.origin === 'derived').map(f => f.metric)).toEqual(['inventory.count']);
    expect(e.facts.every(f => !f.metric.includes('physical') && !f.metric.includes('receipt'))).toBe(true);
  });
});
