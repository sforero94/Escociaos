import { describe, expect, it, vi } from 'vitest';
import { ejecutarNucleoGanado, GANADO_PROYECCIONES, GANADO_LIMITE_CONTEXTO } from '@/utils/escoNucleoGanado';
import { validarEvidencia, type Metric } from '@/utils/escoEvidencia';
import type { ContextoNucleo, LecturaNucleo, PuertoNucleo, ResultadoNucleo } from '@/utils/escoNucleoComun';
import { validarTrasladoMulti } from '@/utils/calculosGanado';
type Row = Record<string, unknown>;
const ctx: ContextoNucleo = { currentUserText: 'Inventario de ganado', referenceDay: '2034-05-08', startedAt: '2034-05-08T12:00:00Z', period: { from: '2034-05-01', to: '2034-05-08' }, dateState: 'resolved', channel: 'web', identities: { client: false, supplier: false } };
const move = (id: string, tipo: string, n: unknown, t: unknown, origin: string | null, destination: string | null, extras: Row = {}): Row => ({ id, tipo, estado: 'confirmado', fecha: '2034-05-06', novillos_delta: n, toros_delta: t, potrero_origen_id: origin, potrero_destino_id: destination, peso_promedio_kg: null, transaccion_ganado_id: null, grupo_id: null, ...extras });
function fixture() {
 return {
  gan_ubicaciones: [{ id: 'u1', nombre: 'Norte' }, { id: 'u2', nombre: 'Sur' }],
  gan_fincas: [{ id: 'f1', nombre: 'Palma', ubicacion_id: 'u1', hectareas: '10.00', activa: true }, { id: 'f2', nombre: 'Roble', ubicacion_id: 'u2', hectareas: '5', activa: true }, { id: 'f3', nombre: 'Retiro', ubicacion_id: 'u1', hectareas: '2', activa: false }],
  gan_lotes: [{ id: 'l1', nombre: 'Lote Palma', finca_id: 'f1', activo: true }, { id: 'l2', nombre: 'Lote Roble', finca_id: 'f2', activo: true }],
  gan_potreros: [{ id: 'p1', nombre: 'Sol', finca_id: 'f1', lote_id: 'l1', etapa: 'ceba', activo: true }, { id: 'p2', nombre: 'Luna', finca_id: 'f1', lote_id: 'l1', etapa: 'levante', activo: true }, { id: 'p3', nombre: 'Río', finca_id: 'f2', lote_id: 'l2', etapa: null, activo: true }, { id: 'p4', nombre: 'Reserva', finca_id: 'f3', lote_id: null, etapa: 'ceba', activo: true }, { id: 'p5', nombre: 'Antiguo', finca_id: 'f1', lote_id: null, etapa: null, activo: false }],
  gan_inventario: [{ id: 'i1', potrero_id: 'p1', novillos: 4, toros: 1, updated_at: '2034-05-01T00:00:00Z' }, { id: 'i2', potrero_id: 'p2', novillos: 2, toros: 0, updated_at: '2034-05-01T00:00:00Z' }, { id: 'i3', potrero_id: 'p3', novillos: 1, toros: 2, updated_at: '2034-05-01T00:00:00Z' }, { id: 'i4', potrero_id: 'p4', novillos: 17, toros: 0 }, { id: 'i5', potrero_id: 'p5', novillos: 99, toros: 0 }],
  gan_pesos_historico: [{ id: 'w1', potrero_id: 'p1', fecha: '2034-05-01', peso_promedio_kg: '200.0' }, { id: 'w2', potrero_id: 'p1', fecha: '2034-05-07', peso_promedio_kg: '250.5' }],
  gan_movimientos: [move('m1', 'traslado_salida', -4, -1, 'p1', null, { grupo_id: 'g1' }), move('m2', 'traslado_entrada', 4, 1, null, 'p2', { grupo_id: 'g1' }), move('m3', 'compra', 3, 0, null, 'p3', { transaccion_ganado_id: 't1' }), move('m4', 'venta', -2, 0, 'p1', null, { transaccion_ganado_id: 't2' }), move('m5', 'muerte', 0, -1, 'p2', null), move('m6', 'ajuste', 100, 0, null, 'p1'), move('m7', 'compra', 8, 0, null, null, { estado: 'pendiente', fecha: '2034-04-20', transaccion_ganado_id: 't3' })],
 } as Record<string, Row[]>;
}
function portFor(data = fixture(), options: { fail?: (table: string, q: string) => boolean; corrupt?: (r: LecturaNucleo, table: string, q: string) => LecturaNucleo } = {}) {
 const calls: Array<{ table: string; query: string; keys?: readonly string[] }> = [];
 const port: PuertoNucleo = {
  now: () => '2034-05-08T12:00:01Z',
  read: async (table, query, keys) => {
   calls.push({ table, query, keys });
   if (options.fail?.(table, query)) throw Error('synthetic source unavailable');
   expect(Object.prototype.hasOwnProperty.call(GANADO_PROYECCIONES, table)).toBe(true);
   const url = new URL('https://synthetic.invalid/?' + query), fields = url.searchParams.get('select')!.split(',');
   expect(url.searchParams.get('select')).toBe(GANADO_PROYECCIONES[table as keyof typeof GANADO_PROYECCIONES]);
   expect(fields).not.toEqual(expect.arrayContaining(['notas', 'created_by', 'cliente_proveedor', 'observaciones', 'valor_total', 'salario']));
   let rows = (data[table] ?? []).filter(row => [...url.searchParams].every(([k, value]) => {
    if (k === 'select') return true;
    if (value.startsWith('eq.')) return String(row[k]) === value.slice(3);
    if (value.startsWith('gte.')) return String(row[k]) >= value.slice(4);
    if (value.startsWith('lte.')) return String(row[k]) <= value.slice(4);
    if (value.startsWith('in.(')) return value.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(row[k]));
    throw Error('unknown fixture filter');
   })).map(row => Object.fromEntries(fields.map(k => [k, row[k]])));
   // A missing optional DB field in a synthetic row is represented as null.
   rows = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === undefined ? null : v])));
   const read: LecturaNucleo = { rows, total: rows.length, capturedAt: '2034-05-08T12:00:01Z', identityKeys: keys ?? ['id'], complete: true, identityUnique: true, consistency: 'stable_count_pages' };
   return options.corrupt?.(read, table, query) ?? read;
  },
 };
 return { port, calls };
}
function facts(r: ResultadoNucleo, m: Metric) { return r.evidence.flatMap(e => e.facts).filter(f => f.metric === m); }
function value(r: ResultadoNucleo, m: Metric, key = 'gan:stock:selected') { return facts(r, m).find(f => f.scopeId === key)?.value; }
function eligible(r: ResultadoNucleo) {
 for (const e of r.evidence) if (e.state !== 'error') expect(validarEvidencia(e, r.scopes, r.populations)).toBe(true);
}
async function run(tool = 'get_ganado_inventory', args: Row = {}, context = ctx, data = fixture(), options: Parameters<typeof portFor>[1] = {}) {
 const f = portFor(data, options); const result = await ejecutarNucleoGanado(tool, args, context, f.port); eligible(result); return { ...f, result };
}

describe('inventario de ceba por propósito y universo', () => {
 it('preserva snapshot, tipos de cabezas y densidad con área única de fincas activas', async () => {
  const { result } = await run();
  expect(value(result, 'ganado.stock.novillos')).toEqual({ kind: 'decimal', value: '7', unit: 'cabeza' });
  expect(value(result, 'ganado.stock.toros')).toEqual({ kind: 'decimal', value: '3', unit: 'cabeza' });
  expect(value(result, 'ganado.stock.heads')).toEqual({ kind: 'decimal', value: '10', unit: 'cabeza' });
  expect(value(result, 'ganado.area')).toEqual({ kind: 'decimal', value: '15', unit: 'ha' });
  expect(value(result, 'ganado.density')).toEqual({ kind: 'decimal', value: '0.7', unit: 'cabeza/ha' });
  expect(result.scopes.find(s => s.id === 'gan:stock:selected')?.period).toBeNull();
  expect(result.scopes.find(s => s.id === 'gan:stock:selected')?.filters).toMatchObject({ activa: 'true', activo: 'true' });
 });
 it('filtra ubicación/finca por la solicitud real aunque el modelo omita el selector', async () => {
  const { result } = await run('get_ganado_inventory', {}, { ...ctx, currentUserText: 'Cabezas y densidad de la finca Palma' });
  expect(value(result, 'ganado.stock.heads')).toEqual({ kind: 'decimal', value: '7', unit: 'cabeza' });
  expect(value(result, 'ganado.area')).toEqual({ kind: 'decimal', value: '10', unit: 'ha' });
  expect(result.scopes.find(s => s.id === 'gan:stock:selected')?.entities).toEqual([{ kind: 'farm', id: 'f1', label: 'Palma' }]);
  const located = await run('get_ganado_inventory', { ubicacion_name: 'sur' }, { ...ctx, currentUserText: 'Inventario de Sur' });
  expect(value(located.result, 'ganado.stock.heads')).toEqual({ kind: 'decimal', value: '3', unit: 'cabeza' });
 });
 it('no permite que un selector propuesto sustituya o contradiga el pedido actual', async () => {
  for (const text of ['Inventario general', 'Inventario de Palma', 'Inventario sin Roble', 'Inventario no Roble', 'Inventario sin la finca Roble']) {
   const { result, calls } = await run('get_ganado_inventory', { finca_name: 'Roble' }, { ...ctx, currentUserText: text });
   expect(result.evidence.every(e => e.facts.length === 0)).toBe(true);
   expect(calls.some(c => c.table === 'gan_inventario')).toBe(false);
  }
 });
 it('conserva desconocidos y subtotal conocido, nunca rellena inventario ausente con cero', async () => {
  const data = fixture(); data.gan_inventario = data.gan_inventario.filter(r => r.potrero_id !== 'p2');
  const { result } = await run('get_ganado_inventory', {}, ctx, data);
  const total = facts(result, 'ganado.stock.heads').find(f => f.scopeId === 'gan:stock:selected')!;
  expect(total.value).toEqual({ kind: 'decimal', value: '8', unit: 'cabeza' });
  expect(total.assertion).toBe('verified_subtotal'); expect(total.coverage.values).toBe('partial');
  expect(value(result, 'ganado.density')?.kind).toBe('unknown');
 });
 it.each([null, 'kg', -1])('área inválida %s no produce densidad ni hereda área por potrero', async area => {
  const data = fixture(); data.gan_fincas[0].hectareas = area;
  const { result } = await run('get_ganado_inventory', {}, ctx, data);
  expect(value(result, 'ganado.density')?.kind).toBe('unknown'); expect(value(result, 'ganado.stock.heads')?.kind).toBe('decimal');
 });
 it('área cero no implica densidad cero', async () => {
  const data = fixture(); data.gan_fincas.forEach(f => { f.hectareas = 0; });
  expect(value((await run('get_ganado_inventory', {}, ctx, data)).result, 'ganado.density')?.kind).toBe('unknown');
 });
 it('permite cero registrado y vacío verificado sin afirmar ausencia física', async () => {
  const data = fixture(); data.gan_inventario.forEach(r => { r.novillos = 0; r.toros = 0; });
  expect(value((await run('get_ganado_inventory', {}, ctx, data)).result, 'ganado.stock.heads')).toEqual({ kind: 'decimal', value: '0', unit: 'cabeza' });
  const empty = await run('get_ganado_inventory', { finca_name: 'Inexistente' }, { ...ctx, currentUserText: 'Inventario de finca Inexistente' });
  expect(value(empty.result, 'ganado.stock.heads')).toEqual({ kind: 'decimal', value: '0', unit: 'cabeza' });
  expect(empty.result.scopes.find(s => s.id === 'gan:stock:selected')?.filters.finca_nombre_contiene).toBe('Inexistente');
 });
 it('preserva jerarquía por lote sin atribuirle hectáreas de finca', async () => {
  const { result } = await run('get_ganado_inventory', {}, { ...ctx, currentUserText: 'Desglose por lotes de Palma' });
  const lot = result.scopes.find(s => s.entities.some(e => e.kind === 'lot' && e.id === 'l1'))!;
  expect(lot).toBeDefined();
  expect(value(result, 'ganado.stock.heads', lot.id)).toEqual({ kind: 'decimal', value: '7', unit: 'cabeza' });
  expect(facts(result, 'ganado.area').some(f => f.scopeId === lot.id)).toBe(false);
  expect(facts(result, 'ganado.density').some(f => f.scopeId === lot.id)).toBe(false);
 });
 it('etapa null es sin_clasificar; no se reparte entre otras etapas', async () => {
  const { result } = await run('get_ganado_inventory', {}, { ...ctx, currentUserText: 'Inventario por etapa' });
  expect(value(result, 'ganado.stock.heads', 'gan:stock:stage:sin_clasificar')).toEqual({ kind: 'decimal', value: '3', unit: 'cabeza' });
  expect(value(result, 'ganado.stock.heads', 'gan:stock:stage:ceba')).toEqual({ kind: 'decimal', value: '5', unit: 'cabeza' });
 });
 it('último peso procede de historia y fecha, no del peso del último movimiento', async () => {
  const { result } = await run('get_ganado_inventory', {}, { ...ctx, currentUserText: 'Último peso del potrero Sol de Palma' });
  expect(value(result, 'ganado.weight.latest', 'gan:stock:paddock:p1')).toEqual({ kind: 'decimal', value: '250.5', unit: 'kg' });
  expect(value(result, 'ganado.weight.date', 'gan:stock:paddock:p1')).toEqual({ kind: 'date', value: '2034-05-07' });
  expect(facts(result, 'ganado.density').some(f => f.entities.some(e => e.kind === 'paddock'))).toBe(false);
 });
 it('pesos conflictivos de la última fecha no escogen un ganador arbitrario', async () => {
  const data = fixture(); data.gan_pesos_historico.push({ id: 'w3', potrero_id: 'p1', fecha: '2034-05-07', peso_promedio_kg: '260' });
  expect(value((await run('get_ganado_inventory', {}, { ...ctx, currentUserText: 'Último peso Sol' }, data)).result, 'ganado.weight.latest', 'gan:stock:paddock:p1')?.kind).toBe('unknown');
 });
 it('variación excluye ajustes y ambos lados del traslado, y sí aplica la finca solicitada', async () => {
  const global = (await run()).result;
  expect(value(global, 'ganado.variation.entries', 'gan:variation')).toEqual({ kind: 'decimal', value: '3', unit: 'cabeza' });
  expect(value(global, 'ganado.variation.exits', 'gan:variation')).toEqual({ kind: 'decimal', value: '3', unit: 'cabeza' });
  const local = (await run('get_ganado_inventory', { finca_name: 'Palma' }, { ...ctx, currentUserText: 'Inventario y variación de Palma' })).result;
  expect(value(local, 'ganado.variation.entries', 'gan:variation')).toEqual({ kind: 'decimal', value: '0', unit: 'cabeza' });
  expect(value(local, 'ganado.variation.net', 'gan:variation')).toEqual({ kind: 'decimal', value: '-3', unit: 'cabeza' });
 });
 it('pendientes son globales con período propio aunque inventario filtre finca', async () => {
  const { result } = await run('get_ganado_inventory', { finca_name: 'Palma' }, { ...ctx, currentUserText: 'Pendientes e inventario de Palma' });
  expect(value(result, 'ganado.pending.count', 'gan:pending:global')).toEqual({ kind: 'decimal', value: '1', unit: 'registro' });
  const pendingScope = result.scopes.find(s => s.id === 'gan:pending:global')!;
  expect(pendingScope.filters).toEqual({ estado: 'pendiente', universo: 'global_sin_potrero_asignado' });
  expect(pendingScope.period).toBeNull();
  expect(facts(result, 'ganado.movement.date').some(f => f.value.kind === 'date' && f.value.value === '2034-04-20')).toBe(true);
 });
 it('pendiente con potrero conserva su detalle global pero no se cuenta como sin potrero', async () => {
  const data = fixture(); data.gan_movimientos.push(move('assigned', 'compra', 2, 0, null, 'p3', { estado: 'pendiente' }));
  const { result } = await run('get_ganado_inventory', { finca_name: 'Palma' }, { ...ctx, currentUserText: 'Pendientes e inventario de Palma' }, data);
  expect(value(result, 'ganado.pending.count', 'gan:pending:global')).toEqual({ kind: 'decimal', value: '1', unit: 'registro' });
  expect(facts(result, 'ganado.movement.count').some(f => f.value.kind === 'decimal' && f.value.value === '2')).toBe(true);
 });
 it('el evento vinculado a un pendiente se cierra también contra miembros confirmados de la transacción', async () => {
  const data = fixture(); data.gan_movimientos = [move('pending', 'compra', 2, 0, null, null, { estado: 'pendiente', transaccion_ganado_id: 'tx' }), move('confirmed', 'compra', 3, 0, null, 'p1', { transaccion_ganado_id: 'tx' })];
  const { result, calls } = await run('get_ganado_inventory', {}, { ...ctx, currentUserText: 'Pendientes y su estado vinculado' }, data);
  expect(value(result, 'ganado.pending.count', 'gan:pending:global')).toEqual({ kind: 'decimal', value: '1', unit: 'registro' });
  expect(calls.some(c => c.query.includes('transaccion_ganado_id=in.') && !c.query.includes('estado=eq.pendiente'))).toBe(true);
  const pendingScopes = result.scopes.filter(s => s.filters.universo === 'global_pendientes');
  expect(pendingScopes.every(s => s.filters.estado === undefined && s.filters.seed_state === 'pendiente')).toBe(true);
  const count = facts(result, 'ganado.movement.count').find(f => pendingScopes.some(s => s.id === f.scopeId))!;
  expect(count.value.kind).toBe('unknown');
  expect(facts(result, 'ganado.movement.heads').some(f => f.entities.some(e => e.id === 'pending') && f.value.kind === 'decimal' && f.value.value === '2')).toBe(true);
  const event = pendingScopes.find(s => s.filters.event_kind === 't')!;
  const groupHeads = facts(result, 'ganado.movement.heads').find(f => f.scopeId === event.id)!;
  expect(groupHeads.value.kind).toBe('unknown'); expect(groupHeads.coverage).toMatchObject({ rowsRead: 2, expectedRows: 2 });
  expect(facts(result, 'ganado.movement.status').find(f => f.scopeId === event.id)?.value.kind).toBe('unknown');
  const confirmedLeg = facts(result, 'ganado.movement.heads').find(f => f.entities.some(e => e.id === 'confirmed'));
  if (confirmedLeg) {
   expect(confirmedLeg.value).toEqual({ kind: 'decimal', value: '3', unit: 'cabeza' });
   expect(pendingScopes.some(s => s.filters.membership === 'linked_context_outside_seed_state')).toBe(true);
  } else expect(result.evidence.some(e => e.issues.some(i => i.code === 'budget_exceeded'))).toBe(true);
 });
 it('fallo del cierre pendiente conserva el conteo válido de filas pero no certifica eventos completos', async () => {
  const data = fixture(); data.gan_movimientos = [move('pending', 'compra', 2, 0, null, null, { estado: 'pendiente', transaccion_ganado_id: 'tx' })];
  const { result } = await run('get_ganado_inventory', {}, { ...ctx, currentUserText: 'Pendientes registrados' }, data, { fail: (_t, q) => q.includes('transaccion_ganado_id=in.') });
  expect(value(result, 'ganado.pending.count', 'gan:pending:global')).toEqual({ kind: 'decimal', value: '1', unit: 'registro' });
  expect(facts(result, 'ganado.movement.count')).toEqual([]);
  expect(result.evidence.some(e => e.state === 'error' && e.scopes.some(s => s.filters.seed_state === 'pendiente'))).toBe(true);
 });
 it('fallo de movimientos preserva el snapshot; período ambiguo tampoco lo destruye', async () => {
  const a = await run('get_ganado_inventory', {}, ctx, fixture(), { fail: table => table === 'gan_movimientos' });
  expect(value(a.result, 'ganado.stock.heads')?.kind).toBe('decimal'); expect(a.result.evidence.some(e => e.state === 'error')).toBe(true);
  const b = await run('get_ganado_inventory', {}, { ...ctx, period: null, dateState: 'ambiguous' });
  expect(value(b.result, 'ganado.stock.heads')?.kind).toBe('decimal');
  expect(b.calls.some(c => c.table === 'gan_movimientos' && c.query.includes('fecha=gte'))).toBe(false);
 });
});

describe('eventos completos, lados y estados', () => {
 it('dos lados del mismo traslado son UN evento con cantidades de un solo lado', async () => {
  const data = fixture(); data.gan_movimientos = data.gan_movimientos.slice(0, 2);
  const { result, calls } = await run('get_ganado_movimientos_detalle', {}, ctx, data);
  expect(facts(result, 'ganado.movement.count')[0].value).toEqual({ kind: 'decimal', value: '1', unit: 'evento' });
  expect(facts(result, 'ganado.movement.count')[0].assertion).toBe('derived_measure');
  const eventScope = result.scopes.find(s => s.filters.event_kind === 'g')!;
  expect(value(result, 'ganado.movement.heads', eventScope.id)).toEqual({ kind: 'decimal', value: '5', unit: 'cabeza' });
  expect(eventScope.filters.origin_paddock_ids).toEqual(['p1']); expect(eventScope.filters.destination_paddock_ids).toEqual(['p2']);
  expect(calls.some(c => c.query.includes('grupo_id=in.') && !c.query.includes('fecha=gte'))).toBe(true);
  expect(result.scopes.some(s => s.filters.side === 'origin')).toBe(true);
  expect(result.scopes.some(s => s.filters.side === 'destination')).toBe(true);
 });
 it('vacío de movimientos solo emite cero después de leer y verificar el universo completo', async () => {
  const data = fixture(); data.gan_movimientos = [];
  const { result, calls } = await run('get_ganado_movimientos_detalle', {}, ctx, data);
  expect(calls.some(c => c.table === 'gan_movimientos' && c.query.includes('fecha=gte.2034-05-01'))).toBe(true);
  expect(facts(result, 'ganado.movement.count')[0].value).toEqual({ kind: 'decimal', value: '0', unit: 'evento' });
  expect(facts(result, 'ganado.movement.count')[0].coverage).toMatchObject({ population: 'complete', rowsRead: 0, expectedRows: 0 });
 });
 it('traslado N→M respeta los mismos totales por categoría que el helper canónico', async () => {
  expect(validarTrasladoMulti({ fecha: '2034-05-06', origenes: [{ potrero_id: 'p1', novillos: 4, toros: 1 }], destinos: [{ potrero_id: 'p2', novillos: 2, toros: 1 }, { potrero_id: 'p3', novillos: 2, toros: 0 }] })).toBeNull();
  const data = fixture(); data.gan_movimientos = [move('o', 'traslado_salida', -4, -1, 'p1', null, { grupo_id: 'g' }), move('a', 'traslado_entrada', 2, 1, null, 'p2', { grupo_id: 'g' }), move('b', 'traslado_entrada', 2, 0, null, 'p3', { grupo_id: 'g' })];
  const { result } = await run('get_ganado_movimientos_detalle', {}, ctx, data);
  expect(facts(result, 'ganado.movement.count')[0].value).toEqual({ kind: 'decimal', value: '1', unit: 'evento' });
  const s = result.scopes.find(s => s.filters.event_kind === 'g')!;
  expect(value(result, 'ganado.movement.novillos', s.id)).toEqual({ kind: 'decimal', value: '4', unit: 'cabeza' });
  expect(value(result, 'ganado.movement.toros', s.id)).toEqual({ kind: 'decimal', value: '1', unit: 'cabeza' });
 });
 it('cierra miembros fuera del rango sin ampliar la semilla de eventos solicitados', async () => {
  const data = fixture(); data.gan_movimientos = [move('o', 'traslado_salida', -4, 0, 'p1', null, { grupo_id: 'g' }), move('d', 'traslado_entrada', 4, 0, null, 'p2', { grupo_id: 'g', fecha: '2034-04-30' })];
  const { result } = await run('get_ganado_movimientos_detalle', {}, ctx, data);
  const s = result.scopes.find(s => s.filters.event_kind === 'g')!;
  expect(value(result, 'ganado.movement.heads', s.id)).toEqual({ kind: 'decimal', value: '4', unit: 'cabeza' });
  expect(value(result, 'ganado.movement.date', s.id)?.kind).toBe('unknown');
  expect(result.scopes.some(s => s.filters.membership === 'linked_context_outside_period' && s.period?.from === '2034-04-30')).toBe(true);
 });
 it.each(['missing_side', 'category_mismatch', 'same_paddock', 'null_quantity'])('no inventa cierre válido: %s', condition => {
  const data = fixture(); data.gan_movimientos = data.gan_movimientos.slice(0, 2);
  if (condition === 'missing_side') data.gan_movimientos.pop();
  if (condition === 'category_mismatch') { data.gan_movimientos[1].novillos_delta = 5; data.gan_movimientos[1].toros_delta = 0; }
  if (condition === 'same_paddock') data.gan_movimientos[1].potrero_destino_id = 'p1';
  if (condition === 'null_quantity') data.gan_movimientos[1].novillos_delta = null;
  return run('get_ganado_movimientos_detalle', {}, ctx, data).then(({ result }) => {
   const s = result.scopes.find(s => s.filters.event_kind === 'g')!;
   expect(value(result, 'ganado.movement.heads', s.id)?.kind).toBe('unknown');
   expect(result.evidence.some(e => e.issues.some(i => i.code === 'incomplete_population'))).toBe(true);
  });
 });
 it('compra repartida por transacción es un evento; mantiene venta, muerte, ajuste y descartado', async () => {
  const data = fixture(); data.gan_movimientos = [move('a', 'compra', 3, 0, null, 'p1', { transaccion_ganado_id: 't' }), move('b', 'compra', 2, 1, null, 'p2', { transaccion_ganado_id: 't' }), move('v', 'venta', -2, 0, 'p1', null), move('m', 'muerte', 0, -1, 'p2', null), move('j', 'ajuste', -1, 2, null, 'p1', { estado: 'descartado' })];
  const { result, calls } = await run('get_ganado_movimientos_detalle', {}, ctx, data);
  expect(facts(result, 'ganado.movement.count')[0].value).toEqual({ kind: 'decimal', value: '4', unit: 'evento' });
  const purchase = result.scopes.find(s => s.filters.event_kind === 't')!;
  expect(value(result, 'ganado.movement.heads', purchase.id)).toEqual({ kind: 'decimal', value: '6', unit: 'cabeza' });
  expect(calls.every(c => c.table !== 'fin_transacciones_ganado')).toBe(true);
 });
 it('agrupa compras por transacción y no por un grupo_id accidental compartido', async () => {
  const data = fixture(); data.gan_movimientos = [move('a', 'compra', 3, 0, null, 'p1', { grupo_id: 'accidental', transaccion_ganado_id: 'ta' }), move('b', 'compra', 2, 0, null, 'p2', { grupo_id: 'accidental', transaccion_ganado_id: 'tb' })];
  const { result } = await run('get_ganado_movimientos_detalle', {}, ctx, data);
  expect(facts(result, 'ganado.movement.count')[0].value).toEqual({ kind: 'decimal', value: '2', unit: 'evento' });
  expect(result.scopes.filter(s => s.filters.event_kind === 't')).toHaveLength(2);
 });
 it('expansión de relaciones es transitiva y no cuenta eventos vinculados que no tocaron la semilla', async () => {
  const data = fixture(); data.gan_movimientos = [move('a', 'compra', 1, 0, null, 'p1', { grupo_id: 'g1', transaccion_ganado_id: 'ta' }), move('b', 'compra', 2, 0, null, 'p2', { grupo_id: 'g1', transaccion_ganado_id: 'tb', fecha: '2034-04-30' }), move('c', 'compra', 3, 0, null, 'p3', { grupo_id: 'g2', transaccion_ganado_id: 'ta', fecha: '2034-04-29' }), move('d', 'compra', 4, 0, null, 'p1', { grupo_id: 'g2', transaccion_ganado_id: 'tc', fecha: '2034-04-28' })];
  const { result, calls } = await run('get_ganado_movimientos_detalle', {}, ctx, data);
  expect(calls.some(c => c.query.includes('grupo_id=in.') && decodeURIComponent(c.query).includes('g2'))).toBe(true);
  expect(facts(result, 'ganado.movement.count')[0].value).toEqual({ kind: 'decimal', value: '1', unit: 'evento' });
  const event = result.scopes.find(s => s.filters.event_kind === 't')!;
  expect(value(result, 'ganado.movement.heads', event.id)).toEqual({ kind: 'decimal', value: '4', unit: 'cabeza' });
 });
 it('una relación que reemplaza una fila previamente observada falla cerrada', async () => {
  const { result } = await run('get_ganado_movimientos_detalle', {}, ctx, fixture(), { corrupt: (r, table, q) => table === 'gan_movimientos' && q.includes('grupo_id=in.') ? { ...r, rows: r.rows.map(x => ({ ...x, novillos_delta: 999 })) } : r });
  expect(result.evidence.every(e => e.facts.length === 0)).toBe(true);
 });
 it('peso del movimiento es por fila, nunca última pesada ni promedio de un grupo', async () => {
  const data = fixture(); data.gan_movimientos = [move('o', 'traslado_salida', -4, 0, 'p1', null, { grupo_id: 'g', peso_promedio_kg: '210.0' }), move('d', 'traslado_entrada', 4, 0, null, 'p2', { grupo_id: 'g', peso_promedio_kg: '220.0' })];
  const { result } = await run('get_ganado_movimientos_detalle', {}, { ...ctx, currentUserText: 'Peso de cada movimiento de traslado' }, data);
  const weights = facts(result, 'ganado.movement.weight');
  expect(weights.map(f => f.value)).toEqual(expect.arrayContaining([{ kind: 'decimal', value: '210', unit: 'kg' }, { kind: 'decimal', value: '220', unit: 'kg' }]));
  expect(weights.every(f => f.assertion === 'record_value' && f.origin === 'recorded')).toBe(true);
  expect(weights.some(f => f.value.kind === 'decimal' && f.value.value === '215')).toBe(false);
  expect(facts(result, 'ganado.weight.latest')).toEqual([]);
  expect(weights.every(f => !result.scopes.find(s => s.id === f.scopeId)?.filters.event_kind)).toBe(true);
 });
 it('peso null queda desconocido y peso cero registrado no se pierde', async () => {
  const data = fixture(); data.gan_movimientos = [move('a', 'compra', 1, 0, null, 'p1'), move('b', 'compra', 1, 0, null, 'p2', { peso_promedio_kg: 0 })];
  const { result } = await run('get_ganado_movimientos_detalle', {}, ctx, data);
  expect(facts(result, 'ganado.movement.weight').map(f => f.value)).toEqual(expect.arrayContaining([{ kind: 'unknown', reason: 'missing_value' }, { kind: 'decimal', value: '0', unit: 'kg' }]));
 });
 it('historia de finca inactiva no se elimina por filtros del snapshot actual', async () => {
  const data = fixture(); data.gan_movimientos = [move('x', 'compra', 2, 0, null, 'p4')];
  const { result } = await run('get_ganado_movimientos_detalle', { finca_name: 'Retiro' }, { ...ctx, currentUserText: 'Movimientos de Retiro' }, data);
  expect(facts(result, 'ganado.movement.count')[0].value).toEqual({ kind: 'decimal', value: '1', unit: 'evento' });
  expect(result.scopes.every(s => s.filters.activa === undefined)).toBe(true);
 });
 it('include_movimientos conserva eventos del inventario sin otra llamada a modelo ni datos financieros', async () => {
  const { result, calls } = await run('get_ganado_inventory', { finca_name: 'Palma', include_movimientos: true }, { ...ctx, currentUserText: 'Inventario y movimientos de Palma' });
  expect(facts(result, 'ganado.movement.count').some(f => f.value.kind === 'decimal' && f.value.unit === 'evento')).toBe(true);
  expect(result.scopes.some(s => s.operation === 'cattle.movements')).toBe(true);
  expect(calls.some(c => c.table.startsWith('fin_'))).toBe(false);
 });
 it('fallo del cierre de grupo no promociona la semilla a evento completo', async () => {
  const { result } = await run('get_ganado_movimientos_detalle', {}, ctx, fixture(), { fail: (_t, q) => q.includes('grupo_id=in.') });
  expect(result.evidence.every(e => e.facts.length === 0)).toBe(true);
 });
 it('período del modelo nunca reemplaza al período de usuario; sin período pide precisión', async () => {
  const { calls } = await run('get_ganado_movimientos_detalle', { date_from: '1999-01-01', date_to: '1999-01-07' });
  expect(calls.some(c => c.query.includes('2034-05-01'))).toBe(true); expect(calls.some(c => c.query.includes('1999'))).toBe(false);
  const missing = await run('get_ganado_movimientos_detalle', {}, { ...ctx, period: null, dateState: 'absent' });
  expect(missing.calls).toEqual([]); expect(missing.result.parts.length).toBeGreaterThan(0);
 });
});

describe('prueba de fuente, límites y privacidad', () => {
 it.each(['web', 'telegram'] as const)('mismo contrato de lectura por %s, sin conceder permisos por contexto', async channel => {
  const { result } = await run('get_ganado_inventory', {}, { ...ctx, channel });
  expect(value(result, 'ganado.stock.heads')?.kind).toBe('decimal');
 });
 it.each(['count', 'identity', 'old', 'missing_flag'])('prueba de lectura inválida %s no certifica saldos', async condition => {
  const { result } = await run('get_ganado_inventory', {}, ctx, fixture(), { corrupt: (r, table) => {
   if (table !== 'gan_inventario') return r;
   if (condition === 'count') return { ...r, total: r.total + 1 };
   if (condition === 'identity') return { ...r, rows: [...r.rows, r.rows[0]], total: r.total + 1 };
   if (condition === 'old') return { ...r, capturedAt: '2034-05-07T00:00:00Z' };
   return { ...r, complete: false } as unknown as LecturaNucleo;
  } });
  expect(facts(result, 'ganado.stock.heads')).toEqual([]);
 });
 it('IDs de scopes y hechos son únicos al mezclar inventario y detalle pendiente/confirmado', async () => {
  const data = fixture(); data.gan_movimientos.push(move('pa', 'compra', 1, 0, null, null, { estado: 'pendiente', transaccion_ganado_id: 'tp' }), move('pb', 'compra', 2, 0, null, null, { estado: 'pendiente', transaccion_ganado_id: 'tp' }));
  const { result } = await run('get_ganado_inventory', { include_movimientos: true }, { ...ctx, currentUserText: 'Inventario, movimientos y pendientes' }, data);
  expect(new Set(result.scopes.map(s => s.id)).size).toBe(result.scopes.length);
  const fs = result.evidence.flatMap(e => e.facts); expect(new Set(fs.map(f => f.id)).size).toBe(fs.length);
 });
 it('desde una fecha abierta conserva límite hasta el día Bogotá; fecha ambigua no inventa rango', async () => {
  const open = await run('get_ganado_inventory', {}, { ...ctx, period: null, dateState: 'open', bounds: { from: '2034-04-01' } });
  expect(open.calls.some(c => c.query.includes('fecha=gte.2034-04-01&fecha=lte.2034-05-08'))).toBe(true);
  const arbitrary = await run('get_ganado_inventory', { date_from: '1999-01-01' }, { ...ctx, period: null, dateState: 'absent' });
  expect(arbitrary.calls.some(c => c.query.includes('1999-01-01'))).toBe(false);
 });
 it('lecturas no pagan payloads de personas/notas/URLs, incluso ante fuente con extensiones', async () => {
  const data = fixture(); Object.values(data).forEach(rows => rows.forEach(r => Object.assign(r, { notas: 'SYN_PRIVATE_NOTE', created_by: 'SYN_PRIVATE_PERSON', salario: 123456789, cliente_proveedor: 'SYN_PRIVATE_BUYER' })));
  const fetch = vi.fn(() => { throw Error('HTTP forbidden'); }); vi.stubGlobal('fetch', fetch);
  try {
   const { result } = await run('get_ganado_inventory', { include_movimientos: true }, ctx, data);
   expect(JSON.stringify(result)).not.toMatch(/SYN_PRIVATE_NOTE|SYN_PRIVATE_PERSON|123456789|SYN_PRIVATE_BUYER/); expect(fetch).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
 });
 it('rechaza scripts, consultas o filtros personales en vez de ejecutarlos', async () => {
  for (const args of [{ query: 'select *' }, { script: 'f()' }, { empleado: 'Persona' }]) {
   const { result, calls } = await run('get_ganado_inventory', args); expect(calls).toEqual([]); expect(result.evidence[0].facts).toEqual([]);
  }
 });
 it('un traslado con más de 200 referencias conserva conteo y total, declarando referencias omitidas', async () => {
  const data = fixture();
  const destinations = Array.from({ length: 201 }, (_, i) => 'large-' + i);
  data.gan_potreros.push(...destinations.map(id => ({ id, nombre: id, finca_id: 'f1', lote_id: null, etapa: null, activo: true })));
  data.gan_movimientos = [move('large-origin', 'traslado_salida', -201, 0, 'p1', null, { grupo_id: 'large-group' }), ...destinations.map((p, i) => move('large-m-' + i, 'traslado_entrada', 1, 0, null, p, { grupo_id: 'large-group' }))];
  const { result } = await run('get_ganado_movimientos_detalle', {}, ctx, data);
  expect(facts(result, 'ganado.movement.count')[0].value).toEqual({ kind: 'decimal', value: '1', unit: 'evento' });
  const event = result.scopes.find(s => s.filters.event_kind === 'g')!;
  expect(value(result, 'ganado.movement.heads', event.id)).toEqual({ kind: 'decimal', value: '201', unit: 'cabeza' });
  expect(result.evidence.some(e => e.issues.some(i => i.code === 'budget_exceeded'))).toBe(true);
 });
 it('un total de especies que excede MAX_SAFE_INTEGER queda desconocido, nunca redondeado', async () => {
  const data = fixture(); data.gan_movimientos = [move('large', 'compra', Number.MAX_SAFE_INTEGER, 2, null, 'p1')];
  const { result } = await run('get_ganado_movimientos_detalle', {}, ctx, data);
  const event = result.scopes.find(s => s.filters.event_kind === 'r')!;
  expect(value(result, 'ganado.movement.heads', event.id)).toEqual({ kind: 'unknown', reason: 'invalid_value' });
  expect(value(result, 'ganado.movement.novillos', event.id)).toEqual({ kind: 'decimal', value: String(Number.MAX_SAFE_INTEGER), unit: 'cabeza' });
 });
 it('ventana por defecto usa el día civil Bogotá y resta exactamente treinta días incluso en bisiesto', async () => {
  const context = { ...ctx, referenceDay: '2036-03-01', startedAt: '2036-03-01T12:00:00Z', period: null, dateState: 'absent' as const };
  const { calls } = await run('get_ganado_inventory', {}, context, fixture(), { corrupt: r => ({ ...r, capturedAt: '2036-03-01T12:00:01Z' }) });
  expect(calls.some(c => c.query.includes('fecha=gte.2036-01-31&fecha=lte.2036-03-01'))).toBe(true);
 });
 it('referencia heredada no vinculada se aclara antes de I/O', async () => {
  const f = portFor();
  await expect(ejecutarNucleoGanado('get_ganado_inventory', {}, { ...ctx, referencePending: true }, f.port)).rejects.toThrow('scope_ambiguous');
  expect(f.calls).toEqual([]);
 });
 it('detalle acotado conserva total completo y declara omisiones', async () => {
  const data = fixture(); data.gan_movimientos = Array.from({ length: 100 }, (_, i) => move('r' + i, 'compra', 1, 0, null, 'p1'));
  const { result } = await run('get_ganado_movimientos_detalle', {}, ctx, data);
  expect(facts(result, 'ganado.movement.count')[0].value).toEqual({ kind: 'decimal', value: '100', unit: 'evento' });
  expect(result.evidence.some(e => e.issues.some(i => i.code === 'budget_exceeded'))).toBe(true);
  const serialized = { scopes: result.scopes, facts: result.evidence.flatMap(e => e.facts), issues: result.evidence.flatMap(e => e.issues) };
  expect(new TextEncoder().encode(JSON.stringify(serialized)).length).toBeLessThan(GANADO_LIMITE_CONTEXTO + 500);
 });
});
