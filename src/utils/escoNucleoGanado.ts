import { desplazarDia } from '@/utils/escoAlcance';
import { DEFINITIONS, fechaValida, validarEvidencia, validarScope, type Fact, type Metric, type Scope, type Value } from '@/utils/escoEvidencia';
import { coberturaNucleo, nucleoVacio, parteNoVerificable, periodoNucleo, pruebaDerivadaNucleo, textoNucleo, unirNucleo, validarLecturaNucleo, type ContextoNucleo, type LecturaNucleo, type PuertoNucleo, type ResultadoNucleo } from '@/utils/escoNucleoComun';

type Row = Record<string, unknown>;
type Entidad = Scope['entities'][number];
const INVENTARIO = 'get_ganado_inventory', MOVIMIENTOS = 'get_ganado_movimientos_detalle';
const STOCK: Metric[] = ['ganado.stock.novillos', 'ganado.stock.toros', 'ganado.stock.heads'];
const MOV: Metric[] = ['ganado.movement.type', 'ganado.movement.status', 'ganado.movement.date', 'ganado.movement.novillos', 'ganado.movement.toros', 'ganado.movement.heads'];
const TIPOS = ['compra', 'venta', 'muerte', 'ajuste', 'traslado_entrada', 'traslado_salida'];
const ESTADOS = ['pendiente', 'confirmado', 'descartado'];
const ETAPAS = ['terneros', 'levante', 'ceba', 'repele', 'sin_clasificar'];
const MOV_COLS = 'id,tipo,estado,fecha,potrero_origen_id,potrero_destino_id,novillos_delta,toros_delta,peso_promedio_kg,transaccion_ganado_id,grupo_id';
export const GANADO_PROYECCIONES = {
 gan_ubicaciones: 'id,nombre', gan_fincas: 'id,nombre,ubicacion_id,hectareas,activa',
 gan_lotes: 'id,finca_id,nombre,activo', gan_potreros: 'id,nombre,finca_id,lote_id,etapa,activo',
 gan_inventario: 'id,potrero_id,novillos,toros,updated_at', gan_pesos_historico: 'id,potrero_id,fecha,peso_promedio_kg',
 gan_movimientos: MOV_COLS,
} as const;
export const GANADO_LIMITE_CONTEXTO = 22000;
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128 && v.trim() === v && [...v].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127);
const entero = (v: unknown, signed = false): number | null => {
 const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d{1,15}$/.test(v) ? Number(v) : NaN;
 return Number.isSafeInteger(n) && (signed || n >= 0) ? n : null;
};
// Áreas/pesos existentes tienen escala <=2. La densidad conserva el redondeo
// existente a un decimal, sin convertir unidades ni asignar hectáreas a lotes.
const centimos = (v: unknown): bigint | null => {
 const s = typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER ? String(v) : v;
 if (typeof s !== 'string' || !/^\d{1,15}(?:\.\d{1,2})?$/.test(s)) return null;
 const [a, b = ''] = s.split('.'); return BigInt(a) * 100n + BigInt(b.padEnd(2, '0'));
};
const decimal = (n: bigint, scale = 100n): string => {
 const digits = String(scale).length - 1, fraction = String(n % scale).padStart(digits, '0').replace(/0+$/, '');
 return String(n / scale) + (fraction ? '.' + fraction : '');
};
const desconocido = (reason = 'missing_value'): Value => ({ kind: 'unknown', reason });
const numero = (n: number | null, unit: string): Value => n === null ? desconocido() : !Number.isSafeInteger(n) ? desconocido('invalid_value') : { kind: 'decimal', value: String(n), unit };
const suma = (values: Array<number | null>): number | null => { const n = values.some(x => x === null) ? NaN : values.reduce<number>((a, x) => a + x!, 0); return Number.isSafeInteger(n) ? n : null; };
const label = (r: Row): string => typeof r.nombre === 'string' && r.nombre.length > 0 && r.nombre.length <= 128 ? r.nombre : String(r.id);
const entidad = (kind: Entidad['kind'], r: Row): Entidad => ({ kind, id: String(r.id), label: label(r) });
const errorCode = (e: unknown): string => e instanceof Error && ['outside_scope', 'scope_ambiguous', 'budget_exceeded', 'invalid_value', 'unknown_unit'].includes(e.message) ? e.message : 'source_error';
function scope(ctx: ContextoNucleo, key: string, operation: Scope['operation'], entities: Entidad[] = [], filters: Scope['filters'] = {}, period: Scope['period'] = null): Scope {
 return { id: key, operation, entities, filters, period };
}
function fallo(ctx: ContextoNucleo, operation: Scope['operation'], code: string): ResultadoNucleo {
 const s = scope(ctx, operation + ':unavailable', operation, [], {}, operation === 'cattle.movements' ? periodoNucleo(ctx, 'fecha', 'recorded_at') : null);
 if (!validarScope(s)) return { ...nucleoVacio(), parts: [{ id: operation + ':unavailable', operation, scopeIds: [], metrics: ['ganado.movement.count'], label: 'Movimientos: falta período inequívoco' }] };
 return parteNoVerificable(s, operation === 'cattle.inventory' ? STOCK : ['ganado.movement.count'], 'Ganado registrado: parte no verificable', code);
}
async function leer(port: PuertoNucleo, ctx: ContextoNucleo, table: keyof typeof GANADO_PROYECCIONES, filter = ''): Promise<LecturaNucleo> {
 const r = await port.read(table, `select=${GANADO_PROYECCIONES[table]}${filter}`, ['id']);
 if (!validarLecturaNucleo(r) || JSON.stringify(r.identityKeys) !== JSON.stringify(['id']) || Date.parse(r.capturedAt) < Date.parse(ctx.startedAt)) throw Error('source_error');
 return r;
}
function validarCatalogo(r: LecturaNucleo): Map<string, Row> {
 if (r.rows.some(x => !id(x.id)) || new Set(r.rows.map(x => x.id)).size !== r.rows.length) throw Error('source_error');
 return new Map(r.rows.map(x => [String(x.id), x]));
}
function mencionado(text: string, name: string): boolean {
 const q = ' ' + textoNucleo(text) + ' ', n = textoNucleo(name);
 if (!n.length) return false;
 const term = ' ' + n + ' '; let offset = q.indexOf(term);
 while (offset >= 0) {
  const excluded = /(?:\b(?:sin|excepto|excluye)|\bno(?: incluir| muestres)?)(?: (?:la|el|las|los|finca|fincas|ubicacion|ubicaciones|potrero|potreros|lote|lotes))* $/.test(q.slice(0, offset + 1));
  if (!excluded) return true; offset = q.indexOf(term, offset + term.length - 1);
 }
 return false;
}
/** Selector de negocio vinculado a la pregunta actual. No decide cobertura. */
function filtrarCatalogo(rows: Row[], arg: unknown, ctx: ContextoNucleo): Row[] {
 const question = ctx.currentUserText;
 if (arg !== undefined) {
  if (!id(arg) || !textoNucleo(arg) || !mencionado(question, arg)) throw Error('scope_ambiguous');
  const selected = rows.filter(r => textoNucleo(label(r)).includes(textoNucleo(arg)));
  const explicit = rows.filter(r => mencionado(question, label(r)));
  if (explicit.some(r => !selected.includes(r))) throw Error('scope_ambiguous');
  return selected;
 }
 const explicit = rows.filter(r => mencionado(question, label(r)));
 const negated = rows.some(r => (' ' + textoNucleo(question) + ' ').includes(' ' + textoNucleo(label(r)) + ' ') && !mencionado(question, label(r)));
 if (negated) throw Error('scope_ambiguous');
 return explicit.length ? explicit : rows;
}
function marco(s: Scope, reads: LecturaNucleo[], tool: string, metrics: Metric[], values: Partial<Record<Metric, Value>>, count: number, title: string, operations: Partial<Record<Metric, NonNullable<Fact['derivation']>['operation']>> = {}, missing: Partial<Record<Metric, number>> = {}): ResultadoNucleo {
 const fields = [...new Set(metrics.map(m => DEFINITIONS[m].field))];
 const p = pruebaDerivadaNucleo(reads, s, tool, fields, count);
 const facts: Fact[] = metrics.map((m, i) => {
  const value = values[m] ?? desconocido('not_observed'), op = operations[m];
  const absent = missing[m] ?? (value.kind === 'unknown' && count > 0 ? count : 0);
  const coverage = coberturaNucleo(p, absent, value.kind === 'unknown' ? [value.reason] : absent ? ['missing_value'] : []);
  return { id: `gan:${i}:${m}`, scopeId: s.id, metric: m, definitionId: m + '.v1', entities: s.entities.map(({ kind, id }) => ({ kind, id })),
   value, origin: op ? 'derived' : 'recorded', coverage, source: { tool, field: DEFINITIONS[m].field, capturedAt: p.capturedAt },
   assertion: value.kind !== 'unknown' && coverage.missingValues > 0 ? 'verified_subtotal' : op ? 'derived_measure' : 'record_value', ...(op ? { derivation: { operation: op, inputs: [{ populationId: p.populationId, field: DEFINITIONS[m].field }] } } : {}) };
 });
 const issues = [...new Set(facts.flatMap(f => f.value.kind === 'unknown' ? [f.value.reason] : f.coverage.missingValues ? ['missing_value'] : []))].map(code => ({ partId: s.id, code }));
 const e = { version: 1 as const, state: issues.length ? 'partial' as const : 'ok' as const, scopes: [s], facts, issues };
 if (!validarEvidencia(e, [s], [p])) throw Error('source_error');
 return { scopes: [s], populations: [p], evidence: [e], parts: [{ id: s.id, operation: s.operation, scopeIds: [s.id], metrics, label: title }], labels: Object.fromEntries(s.entities.map(e => [e.kind + ':' + e.id, e.label])) };
}
function acotar(frames: ResultadoNucleo[]): ResultadoNucleo {
 const kept: ResultadoNucleo[] = [];
 let omitted = false;
 for (const f of frames) {
  const next = unirNucleo([...kept, f]);
  const serialized = { scopes: next.scopes, facts: next.evidence.flatMap(e => e.facts), issues: next.evidence.flatMap(e => e.issues) };
  if (next.scopes.length > 18 || serialized.facts.length > 180 || new TextEncoder().encode(JSON.stringify(serialized)).length > GANADO_LIMITE_CONTEXTO) { omitted = true; continue; }
  kept.push(f);
 }
 if (omitted && kept.length) { kept[0].evidence[0].state = 'partial'; kept[0].evidence[0].issues.push({ partId: kept[0].parts[0].id, code: 'budget_exceeded' }); kept[0].parts[0].label += ' — detalle omitido por límite; no es exhaustivo'; }
 const result = unirNucleo(kept);
 // Identificadores cortos y únicos en el resultado; las identidades de negocio
 // permanecen completas en entities. Todas las derivaciones usan poblaciones.
 result.evidence.forEach((e, frameIndex) => e.facts.forEach((f, factIndex) => { f.id = `gan:${frameIndex}:${factIndex}`; }));
 return result;
}
interface Catalogos { reads: LecturaNucleo[]; ubicaciones: Map<string, Row>; fincas: Map<string, Row>; lotes: Map<string, Row>; potreros: Map<string, Row>; selected: Row[]; filters: Scope['filters'] }
async function catalogos(port: PuertoNucleo, ctx: ContextoNucleo, args: Row, active: boolean): Promise<Catalogos> {
 const [u, f, l, p] = await Promise.all(['gan_ubicaciones', 'gan_fincas', 'gan_lotes', 'gan_potreros'].map(t => leer(port, ctx, t as keyof typeof GANADO_PROYECCIONES)));
 const ubicaciones = validarCatalogo(u), fincas = validarCatalogo(f), lotes = validarCatalogo(l), potreros = validarCatalogo(p);
 if (f.rows.some(x => typeof x.activa !== 'boolean' || x.ubicacion_id !== null && !ubicaciones.has(String(x.ubicacion_id)))
  || p.rows.some(x => typeof x.activo !== 'boolean' || !fincas.has(String(x.finca_id)) || x.lote_id !== null && (!lotes.has(String(x.lote_id)) || lotes.get(String(x.lote_id))!.finca_id !== x.finca_id)
   || x.etapa !== null && !ETAPAS.includes(String(x.etapa)))) throw Error('source_error');
 const nullLocation = typeof args.ubicacion_name === 'string' && textoNucleo('Sin ubicación').includes(textoNucleo(args.ubicacion_name)) && mencionado(ctx.currentUserText, args.ubicacion_name);
 const us = filtrarCatalogo(u.rows, args.ubicacion_name, ctx), fs = filtrarCatalogo(f.rows, args.finca_name, ctx);
 const filterU = args.ubicacion_name !== undefined || us.length !== u.rows.length;
 const filterF = args.finca_name !== undefined || fs.length !== f.rows.length;
 const selected = f.rows.filter(x => (!active || x.activa === true) && (!filterU || nullLocation && x.ubicacion_id === null || us.some(y => y.id === x.ubicacion_id)) && (!filterF || fs.some(y => y.id === x.id)));
 const filters: Scope['filters'] = active ? { activa: 'true', activo: 'true' } : {};
 if (filterU) { if (args.ubicacion_name !== undefined) filters.ubicacion_nombre_contiene = String(args.ubicacion_name); else filters.ubicacion_id = us.map(r => String(r.id)); }
 if (filterF) { if (args.finca_name !== undefined) filters.finca_nombre_contiene = String(args.finca_name); else filters.finca_id = fs.map(r => String(r.id)); }
 return { reads: [u, f, l, p], ubicaciones, fincas, lotes, potreros, selected, filters };
}
function fechaVentana(ctx: ContextoNucleo): { from: string; to: string } {
 if (ctx.period && ctx.dateState === 'resolved') { if (fechaValida(ctx.period.from) && fechaValida(ctx.period.to) && ctx.period.from <= ctx.period.to) return ctx.period; throw Error('scope_ambiguous'); }
 if (ctx.dateState === 'open' && ctx.bounds) {
  const window = { from: ctx.bounds.from ?? desplazarDia(ctx.referenceDay, -30), to: ctx.bounds.to ?? ctx.referenceDay };
  if (fechaValida(window.from) && fechaValida(window.to) && window.from <= window.to) return window;
 }
 if (ctx.dateState !== 'absent') throw Error('scope_ambiguous');
 return { from: desplazarDia(ctx.referenceDay, -30), to: ctx.referenceDay };
}
function endpoints(row: Row): string[] { return [row.potrero_origen_id, row.potrero_destino_id].filter((x): x is string => typeof x === 'string'); }
function pertenece(row: Row, cat: Catalogos): boolean { return endpoints(row).some(p => cat.selected.some(f => f.id === cat.potreros.get(p)?.finca_id)); }
function validarMovs(rows: Row[], cat: Catalogos): void {
 if (rows.some(r => !id(r.id) || !TIPOS.includes(String(r.tipo)) || !ESTADOS.includes(String(r.estado)) || !fechaValida(r.fecha)
  || [r.grupo_id, r.transaccion_ganado_id, r.potrero_origen_id, r.potrero_destino_id].some(v => v !== null && !id(v))
  || endpoints(r).some(p => !cat.potreros.has(p)))) throw Error('source_error');
}
interface Evento { key: string; rows: Row[]; type: string; n: number | null; t: number | null; valid: boolean }
function agrupar(rows: Row[]): Evento[] {
 const groups = new Map<string, Row[]>();
 for (const row of rows) {
  const adjustmentGroup = row.tipo === 'ajuste' && row.grupo_id && rows.filter(r => r.grupo_id === row.grupo_id).length >= 2 && rows.filter(r => r.grupo_id === row.grupo_id).every(r => r.tipo === 'ajuste');
  const key = ['compra', 'venta'].includes(String(row.tipo)) && row.transaccion_ganado_id ? 't:' + row.transaccion_ganado_id : (String(row.tipo).startsWith('traslado_') || adjustmentGroup) && row.grupo_id ? 'g:' + row.grupo_id : 'r:' + row.id;
  groups.set(key, [...(groups.get(key) ?? []), row]);
 }
 return [...groups].map(([key, members]) => {
  const types = new Set(members.map(m => String(m.tipo))), states = new Set(members.map(m => m.estado));
  const transfer = members.every(m => ['traslado_entrada', 'traslado_salida'].includes(String(m.tipo)));
  let valid = states.size === 1 && !(key.startsWith('g:') && rows.some(r => r.grupo_id === members[0].grupo_id && !members.includes(r))), n: number | null, t: number | null;
  if (transfer) {
   const from = members.filter(m => m.tipo === 'traslado_salida'), to = members.filter(m => m.tipo === 'traslado_entrada');
   const outN = suma(from.map(m => entero(m.novillos_delta, true))), outT = suma(from.map(m => entero(m.toros_delta, true)));
   const inN = suma(to.map(m => entero(m.novillos_delta))), inT = suma(to.map(m => entero(m.toros_delta)));
   valid &&= from.length > 0 && to.length > 0 && outN !== null && outT !== null && inN !== null && inT !== null && -outN === inN && -outT === inT
    && from.every(m => entero(m.novillos_delta, true)! <= 0 && entero(m.toros_delta, true)! <= 0 && id(m.potrero_origen_id) && m.potrero_destino_id === null)
    && to.every(m => id(m.potrero_destino_id) && m.potrero_origen_id === null)
    && !from.some(a => to.some(b => a.potrero_origen_id === b.potrero_destino_id));
   n = valid ? inN : null; t = valid ? inT : null;
  } else {
   valid &&= types.size === 1;
   n = valid ? suma(members.map(m => entero(m.novillos_delta, true))) : null;
   t = valid ? suma(members.map(m => entero(m.toros_delta, true))) : null;
   if (members[0].tipo === 'venta' || members[0].tipo === 'muerte') { n = n === null ? null : -n; t = t === null ? null : -t; }
   if (members[0].tipo !== 'ajuste' && (n !== null && n < 0 || t !== null && t < 0)) { valid = false; n = null; t = null; }
  }
  return { key, rows: members, type: transfer && valid ? 'traslado' : types.size === 1 ? String(members[0].tipo) : '', n, t, valid };
 });
}
async function cerrar(seed: LecturaNucleo, port: PuertoNucleo, ctx: ContextoNucleo, cat: Catalogos): Promise<{ rows: Row[]; reads: LecturaNucleo[] }> {
 validarMovs(seed.rows, cat);
 const all = new Map(seed.rows.map(r => [String(r.id), r])); const reads = [seed];
 const queried = { grupo_id: new Set<string>(), transaccion_ganado_id: new Set<string>() };
 for (;;) {
  let expanded = false;
  for (const field of ['grupo_id', 'transaccion_ganado_id'] as const) {
   const ids = [...new Set([...all.values()].map(r => r[field]).filter(id))].filter(x => !queried[field].has(x));
   for (let i = 0; i < ids.length; i += 100) {
    expanded = true; const batch = ids.slice(i, i + 100);
    if (batch.some(x => !/^[a-zA-Z0-9_-]+$/.test(x))) throw Error('source_error');
    const valores = batch.map(x => '"' + x + '"').join(',');
    const read = await leer(port, ctx, 'gan_movimientos', `&${field}=in.(${encodeURIComponent(valores)})`); validarMovs(read.rows, cat); reads.push(read);
    if (read.rows.some(r => !batch.includes(String(r[field])))) throw Error('source_error');
    batch.forEach(x => queried[field].add(x));
    for (const r of read.rows) { if (all.has(String(r.id)) && JSON.stringify(all.get(String(r.id))) !== JSON.stringify(r)) throw Error('source_error'); all.set(String(r.id), r); }
    if (all.size > 20000) throw Error('budget_exceeded');
   }
  }
  if (!expanded) break;
 }
 return { rows: [...all.values()], reads };
}
function eventoFrames(events: Evento[], reads: LecturaNucleo[], ctx: ContextoNucleo, cat: Catalogos, period: Scope['period'], filters: Scope['filters'], title: string, offset = 0): ResultadoNucleo[] {
 const frames: ResultadoNucleo[] = [], legs: ResultadoNucleo[] = [], all = scope(ctx, 'gan:events:' + title.slice(0, 16), 'cattle.movements', [], filters, period);
 const invalid = events.filter(e => !e.valid).length, verified = events.length - invalid;
 frames.push(marco(all, reads, MOVIMIENTOS, ['ganado.movement.count'], { 'ganado.movement.count': invalid && !verified ? desconocido('incomplete_population') : numero(verified, 'evento') }, events.length, title + (invalid ? ' — subtotal de eventos con cierre verificado' : ' — eventos agrupados completos'), { 'ganado.movement.count': 'group_events' }, { 'ganado.movement.count': invalid }));
 const sorted = [...events].sort((a, b) => String(b.rows[0].fecha).localeCompare(String(a.rows[0].fecha)) || a.key.localeCompare(b.key));
 for (const [index, e] of sorted.slice(offset).entries()) {
  const ms = e.rows, dates = new Set(ms.map(r => r.fecha)), states = new Set(ms.map(r => r.estado));
  const refs: Entidad[] = [{ kind: 'movement', id: e.key.slice(2), label: e.type || 'Grupo incompatible' }];
  for (const pid of [...new Set(ms.flatMap(endpoints))]) refs.push(entidad('paddock', cat.potreros.get(pid)!));
  const origins = [...new Set(ms.map(r => r.potrero_origen_id).filter(id))], destinations = [...new Set(ms.map(r => r.potrero_destino_id).filter(id))];
  const omittedRefs = refs.length > 200 || origins.length > 200 || destinations.length > 200;
  const s = scope(ctx, `gan:event:${index}:${e.key.slice(0, 55)}`, 'cattle.movements', omittedRefs ? [refs[0]] : refs, { ...filters, event_membership: 'intersects_selected_farms_full_group', event_kind: e.key.slice(0, 1), ...(origins.length && origins.length <= 200 ? { origin_paddock_ids: origins } : {}), ...(destinations.length && destinations.length <= 200 ? { destination_paddock_ids: destinations } : {}) }, period);
  const metrics: Metric[] = ms.length === 1 ? [...MOV, 'ganado.movement.weight'] : [...MOV];
  const recordedWeight = ms.length === 1 ? centimos(ms[0].peso_promedio_kg) : null;
  const values: Partial<Record<Metric, Value>> = {
   'ganado.movement.weight': recordedWeight === null ? desconocido(ms[0].peso_promedio_kg == null ? 'missing_value' : 'invalid_value') : { kind: 'decimal', value: decimal(recordedWeight), unit: 'kg' },
   'ganado.movement.type': e.type ? { kind: 'status', value: e.type } : desconocido('invalid_value'),
   'ganado.movement.status': states.size === 1 ? { kind: 'status', value: String(ms[0].estado) } : desconocido('invalid_value'),
   'ganado.movement.date': dates.size === 1 ? { kind: 'date', value: String(ms[0].fecha) } : desconocido('invalid_value'),
   'ganado.movement.novillos': numero(e.n, 'cabeza'), 'ganado.movement.toros': numero(e.t, 'cabeza'), 'ganado.movement.heads': numero(e.n === null || e.t === null ? null : e.n + e.t, 'cabeza'),
  };
  // El tipo de cada pata identifica origen/destino; se conserva el contexto de
  // todas las puntas aun cuando la semilla del período solo haya traído un lado.
  const directions = ms.map(r => `${r.tipo}:${endpoints(r).join(',')}`).join(';');
  const frame = marco(s, reads, MOVIMIENTOS, metrics, values, ms.length, `${title}: ${e.type || 'grupo incompatible'} — ${directions}`, Object.fromEntries(MOV.filter(m => m.endsWith('novillos') || m.endsWith('toros') || m.endsWith('heads')).map(m => [m, 'group_events'])));
  if (!e.valid) { frame.evidence[0].state = 'partial'; frame.evidence[0].issues.push({ partId: s.id, code: 'incomplete_population' }); }
  if (omittedRefs) { frame.evidence[0].state = 'partial'; frame.evidence[0].issues.push({ partId: s.id, code: 'budget_exceeded' }); frame.parts[0].label += ' — referencias de potreros omitidas, detalle no exhaustivo'; }
  frames.push(frame);
  for (const [legIndex, r] of (ms.length > 1 ? ms : []).entries()) {
   const pid = endpoints(r)[0], side = r.potrero_origen_id !== null ? 'origin' : r.potrero_destino_id !== null ? 'destination' : 'unassigned';
   const legScope = scope(ctx, `gan:leg:${title.slice(0, 10)}:${index}:${e.key.slice(0, 42)}:${legIndex}`, 'cattle.movements', [{ kind: 'movement', id: String(r.id), label: String(r.tipo) }, ...(pid ? [entidad('paddock', cat.potreros.get(pid)!)] : [])],
    { ...filters, side, membership: period && (String(r.fecha) < period.from || String(r.fecha) > period.to) ? filters.seed_state && r.estado !== filters.seed_state ? 'linked_context_outside_period_and_seed_state' : 'linked_context_outside_period' : filters.seed_state && r.estado !== filters.seed_state ? 'linked_context_outside_seed_state' : 'queried_period' },
    periodoNucleo({ ...ctx, period: { from: String(r.fecha), to: String(r.fecha) } }, 'fecha', 'recorded_at'));
   const rawN = entero(r.novillos_delta, true), rawT = entero(r.toros_delta, true);
   const positive = r.tipo !== 'ajuste', expectedSign = ['venta', 'muerte', 'traslado_salida'].includes(String(r.tipo)) ? -1 : 1;
   const validSign = !positive || rawN !== null && rawT !== null && rawN * expectedSign >= 0 && rawT * expectedSign >= 0;
   const n = rawN === null || !validSign ? null : positive ? Math.abs(rawN) : rawN, t = rawT === null || !validSign ? null : positive ? Math.abs(rawT) : rawT;
   const weight = centimos(r.peso_promedio_kg);
   legs.push(marco(legScope, reads, MOVIMIENTOS, [...MOV, 'ganado.movement.weight'], {
    'ganado.movement.weight': weight === null ? desconocido(r.peso_promedio_kg == null ? 'missing_value' : 'invalid_value') : { kind: 'decimal', value: decimal(weight), unit: 'kg' },
    'ganado.movement.type': { kind: 'status', value: String(r.tipo) }, 'ganado.movement.status': { kind: 'status', value: String(r.estado) }, 'ganado.movement.date': { kind: 'date', value: String(r.fecha) },
    'ganado.movement.novillos': numero(n, 'cabeza'), 'ganado.movement.toros': numero(t, 'cabeza'), 'ganado.movement.heads': numero(n === null || t === null ? null : n + t, 'cabeza'),
   }, 1, `Punta ${side} — ${pid ? label(cat.potreros.get(pid)!) : 'sin potrero asignado'}${String(legScope.filters.membership).includes('outside_period') ? ' (contexto vinculado fuera del período)' : String(legScope.filters.membership).includes('outside_seed_state') ? ' (contexto vinculado de otro estado)' : ''}; sin asignar rutas N→M`, { 'ganado.movement.novillos': 'group_events', 'ganado.movement.toros': 'group_events', 'ganado.movement.heads': 'group_events' }));
  }
 }
 const weightRequested = textoNucleo(ctx.currentUserText).split(' ').some(w => ['peso', 'pesos'].includes(w));
 return weightRequested ? [frames[0], ...legs, ...frames.slice(1)] : [...frames, ...legs];
}
interface Nodo { key: string; refs: Entidad[]; paddocks: Row[]; farms: Row[]; filter?: Scope['filters']; title: string; density: boolean }
function stockFrame(node: Nodo, cat: Catalogos, inv: LecturaNucleo, weights: LecturaNucleo | null, ctx: ContextoNucleo): ResultadoNucleo {
 const readRows = inv.rows;
 if (readRows.some(r => !id(r.id) || !id(r.potrero_id) || !cat.potreros.has(r.potrero_id)) || new Set(readRows.map(r => r.potrero_id)).size !== readRows.length) throw Error('source_error');
 const map = new Map(readRows.map(r => [String(r.potrero_id), r]));
 const ns = node.paddocks.map(p => entero(map.get(String(p.id))?.novillos)), ts = node.paddocks.map(p => entero(map.get(String(p.id))?.toros));
 const hs = ns.map((n, i) => n === null || ts[i] === null ? null : n + ts[i]!);
 const knownSum = (vs: Array<number | null>): number | null => vs.length === 0 ? 0 : vs.every(v => v !== null) ? suma(vs) : vs.every(v => v === null) ? null : suma(vs.filter((v): v is number => v !== null));
 const values: Partial<Record<Metric, Value>> = { 'ganado.stock.novillos': numero(knownSum(ns), 'cabeza'), 'ganado.stock.toros': numero(knownSum(ts), 'cabeza'), 'ganado.stock.heads': numero(knownSum(hs), 'cabeza') };
 const missing: Partial<Record<Metric, number>> = { 'ganado.stock.novillos': ns.filter(v => v === null).length, 'ganado.stock.toros': ts.filter(v => v === null).length, 'ganado.stock.heads': hs.filter(v => v === null).length };
 const metrics: Metric[] = [...STOCK], ops: Partial<Record<Metric, NonNullable<Fact['derivation']>['operation']>> = Object.fromEntries(STOCK.map(m => [m, 'sum']));
 const reads = [...cat.reads, inv];
 if (node.density) {
  const areas = node.farms.map(f => centimos(f.hectareas)), complete = areas.every(v => v !== null);
  const area = areas.reduce<bigint>((n, v) => n + (v ?? 0n), 0n);
  metrics.push('ganado.area', 'ganado.density'); ops['ganado.area'] = 'sum'; ops['ganado.density'] = 'ratio';
  values['ganado.area'] = complete ? { kind: 'decimal', value: decimal(area), unit: 'ha' } : desconocido();
  const heads = suma(hs);
  // Redondeo half-up positivo a 1 decimal, equivalente al contrato existente.
  const tenth = heads !== null && complete && area > 0n ? (BigInt(heads) * 1000n + area / 2n) / area : null;
  values['ganado.density'] = tenth === null ? desconocido(area === 0n && complete ? 'not_observed' : 'missing_value') : { kind: 'decimal', value: decimal(tenth, 10n), unit: 'cabeza/ha' };
 }
 if (node.refs.length === 1 && node.refs[0].kind === 'paddock') {
  metrics.push('ganado.weight.latest', 'ganado.weight.date');
  const found = weights?.rows.filter(w => w.potrero_id === node.refs[0].id) ?? [];
  if (weights) reads.push(weights);
  if (found.some(w => !id(w.id) || !fechaValida(w.fecha))) throw Error('source_error');
  const orderedDates = found.map(w => String(w.fecha)).sort();
  const latest = orderedDates[orderedDates.length - 1], last = found.filter(w => w.fecha === latest);
  const vals = last.map(w => centimos(w.peso_promedio_kg));
  const safe = last.length > 0 && vals.every(v => v !== null) && new Set(vals.map(String)).size === 1;
  values['ganado.weight.latest'] = safe ? { kind: 'decimal', value: decimal(vals[0]!), unit: 'kg' } : desconocido(weights === null ? 'source_error' : last.length ? 'invalid_value' : 'not_observed');
  values['ganado.weight.date'] = latest ? { kind: 'date', value: latest } : desconocido(weights === null ? 'source_error' : 'not_observed');
 }
 const s = scope(ctx, 'gan:stock:' + node.key, 'cattle.inventory', node.refs, { ...cat.filters, ...node.filter });
 return marco(s, reads, INVENTARIO, metrics, values, Math.max(node.paddocks.length, node.farms.length), node.title + ' — saldo registrado actual, no saldo histórico', ops, missing);
}
function nodos(cat: Catalogos, ctx: ContextoNucleo): Nodo[] {
 const paddocks = [...cat.potreros.values()].filter(p => p.activo === true && cat.selected.some(f => f.id === p.finca_id));
 const full: Nodo = { key: 'selected', refs: cat.selected.length === 1 ? [entidad('farm', cat.selected[0])] : [], paddocks, farms: cat.selected, title: 'Existencias de fincas/potreros activos seleccionados', density: true };
 const nodes: Nodo[] = [full];
 const locations = [...new Set(cat.selected.map(f => f.ubicacion_id))];
 if (locations.length > 1) for (const uid of locations) {
  const farms = cat.selected.filter(f => f.ubicacion_id === uid);
  nodes.push({ key: 'location:' + String(uid), refs: uid === null ? [] : [entidad('location', cat.ubicaciones.get(String(uid))!)], farms, paddocks: paddocks.filter(p => farms.some(f => f.id === p.finca_id)), filter: uid === null ? { ubicacion_id: 'sin_ubicacion' } : undefined, title: uid === null ? 'Sin ubicación registrada' : 'Ubicación ' + label(cat.ubicaciones.get(String(uid))!), density: true });
 }
 if (cat.selected.length > 1) for (const f of cat.selected) nodes.push({ key: 'farm:' + String(f.id), refs: [entidad('farm', f)], farms: [f], paddocks: paddocks.filter(p => p.finca_id === f.id), title: 'Finca ' + label(f), density: true });
 for (const l of cat.lotes.values()) {
  const ps = paddocks.filter(p => p.lote_id === l.id);
  if (ps.length) nodes.push({ key: 'lot:' + String(l.id), refs: [entidad('lot', l)], farms: [], paddocks: ps, title: 'Lote ' + label(l) + ' (sin área propia)', density: false });
 }
 const noLot = paddocks.filter(p => p.lote_id === null);
 if (noLot.length) nodes.push({ key: 'no-lot', refs: [], farms: [], paddocks: noLot, filter: { lote_id: 'sin_lote' }, title: 'Potreros sin lote asignado', density: false });
 for (const stage of ETAPAS) {
  const ps = paddocks.filter(p => (p.etapa ?? 'sin_clasificar') === stage);
  nodes.push({ key: 'stage:' + stage, refs: [], farms: [], paddocks: ps, filter: { etapa: stage }, title: 'Etapa ' + stage + ' (sin reparto inferido)', density: false });
 }
 for (const p of paddocks) nodes.push({ key: 'paddock:' + String(p.id), refs: [entidad('paddock', p)], farms: [], paddocks: [p], title: 'Potrero ' + label(p) + ' (sin área propia)', density: false });
 // Prioriza el detalle explícitamente solicitado sin cambiar ningún universo.
 const requestWords = textoNucleo(ctx.currentUserText).split(' ');
 const explicit = nodes.filter(n => n.refs.some(e => mencionado(ctx.currentUserText, e.label)) || requestWords.some(w => ['peso', 'pesos', 'potrero', 'potreros'].includes(w)) && n.refs.some(e => e.kind === 'paddock') || requestWords.some(w => ['etapa', 'etapas'].includes(w)) && n.key.startsWith('stage:') || requestWords.some(w => ['lote', 'lotes'].includes(w)) && n.refs.some(e => e.kind === 'lot') || requestWords.some(w => ['finca', 'fincas'].includes(w)) && n.refs.some(e => e.kind === 'farm') || requestWords.some(w => ['ubicacion', 'ubicaciones'].includes(w)) && n.refs.some(e => e.kind === 'location'));
 return [full, ...explicit.filter(n => n !== full), ...nodes.filter(n => n !== full && !explicit.includes(n))];
}
function variacion(read: LecturaNucleo, cat: Catalogos, ctx: ContextoNucleo, window: { from: string; to: string }): ResultadoNucleo {
 validarMovs(read.rows, cat);
 if (read.rows.some(r => r.estado !== 'confirmado' || String(r.fecha) < window.from || String(r.fecha) > window.to)) throw Error('source_error');
 const selected = read.rows.filter(r => pertenece(r, cat) && ['compra', 'venta', 'muerte'].includes(String(r.tipo)));
 const entries = selected.filter(r => r.tipo === 'compra'), exits = selected.filter(r => r.tipo === 'venta' || r.tipo === 'muerte');
 const qty = (rows: Row[], sign: number) => suma(rows.map(r => { const n = entero(r.novillos_delta, true), t = entero(r.toros_delta, true); return n === null || t === null || n * sign < 0 || t * sign < 0 ? null : (n + t) * sign; }));
 const n = qty(entries, 1), t = qty(exits, -1);
 const s = scope(ctx, 'gan:variation', 'cattle.inventory', [], { ...cat.filters, estado: 'confirmado', tipos: ['compra', 'venta', 'muerte'] }, periodoNucleo({ ...ctx, period: window }, 'fecha', 'recorded_at'));
 return marco(s, [...cat.reads, read], INVENTARIO, ['ganado.variation.entries', 'ganado.variation.exits', 'ganado.variation.net'], {
  'ganado.variation.entries': numero(n, 'cabeza'), 'ganado.variation.exits': numero(t, 'cabeza'), 'ganado.variation.net': numero(n === null || t === null ? null : n - t, 'cabeza'),
 }, selected.length, 'Variación registrada en el período — excluye traslados y ajustes', { 'ganado.variation.entries': 'sum', 'ganado.variation.exits': 'sum', 'ganado.variation.net': 'difference' });
}
async function pending(read: LecturaNucleo, ctx: ContextoNucleo, cat: Catalogos, port: PuertoNucleo): Promise<ResultadoNucleo[]> {
 validarMovs(read.rows, cat); if (read.rows.some(r => r.estado !== 'pendiente')) throw Error('source_error');
 const s = scope(ctx, 'gan:pending:global', 'cattle.inventory', [], { estado: 'pendiente', universo: 'global_sin_potrero_asignado' });
 const unassigned = read.rows.filter(r => endpoints(r).length === 0);
 const count = marco(s, [read], INVENTARIO, ['ganado.pending.count'], { 'ganado.pending.count': numero(unassigned.length, 'registro') }, unassigned.length, 'Pendientes GLOBALES registrados — filtro de finca no aplicable', { 'ganado.pending.count': 'count' });
 if (!read.rows.length) return [count];
 const dates = read.rows.map(r => String(r.fecha)).sort();
 const period = periodoNucleo({ ...ctx, period: { from: dates[0], to: dates[dates.length - 1] } }, 'fecha', 'recorded_at');
 const filters: Scope['filters'] = { seed_state: 'pendiente', universo: 'global_pendientes' };
 try {
  // El conjunto pendiente es semilla, no prueba de todos los miembros del
  // evento: una transacción puede tener filas confirmadas o descartadas.
  const closed = await cerrar(read, port, ctx, cat), seedIds = new Set(read.rows.map(r => String(r.id)));
  const events = agrupar(closed.rows).filter(e => e.rows.some(r => seedIds.has(String(r.id))));
  return [count, ...eventoFrames(events, [...closed.reads, ...cat.reads], ctx, cat, period, filters, 'Eventos vinculados a pendientes globales (miembros de otros estados explícitos)')];
 } catch (error) {
  const unavailable = scope(ctx, 'gan:pending:closure-unavailable', 'cattle.movements', [], filters, period);
  return [count, parteNoVerificable(unavailable, ['ganado.movement.count', ...MOV], 'No se verificó el cierre de eventos vinculados; conteo pendiente de filas conservado', errorCode(error))];
 }
}
/** Frontera de dos herramientas existentes. Los gates de actor ya fueron
 * aplicados por el servidor. No HTTP, modelos, escritura ni concesiones aquí.
 * Todas las lecturas son proyecciones estáticas completas del puerto confiable.
 */
export async function ejecutarNucleoGanado(tool: string, args: Row, ctx: ContextoNucleo, port: PuertoNucleo): Promise<ResultadoNucleo> {
 if(ctx.referencePending)throw Error('scope_ambiguous');
 const operation = tool === INVENTARIO ? 'cattle.inventory' : 'cattle.movements';
 if (![INVENTARIO, MOVIMIENTOS].includes(tool)) return fallo(ctx, operation, 'unsupported_operation');
 const allowed = tool === INVENTARIO ? ['ubicacion_name', 'finca_name', 'include_movimientos', 'date_from', 'date_to'] : ['date_from', 'date_to', 'detalle_offset', 'ubicacion_name', 'finca_name'];
 if (!args || Object.keys(args).some(k => !allowed.includes(k)) || args.include_movimientos !== undefined && typeof args.include_movimientos !== 'boolean') return fallo(ctx, operation, 'outside_scope');
 try {
  if (!fechaValida(ctx.referenceDay) || !Number.isFinite(Date.parse(ctx.startedAt))) throw Error('invalid_value');
  if (tool === MOVIMIENTOS && (ctx.dateState !== 'resolved' || !ctx.period || !fechaValida(ctx.period.from) || !fechaValida(ctx.period.to) || ctx.period.from > ctx.period.to)) return fallo(ctx, operation, 'scope_ambiguous');
  const cat = await catalogos(port, ctx, args, tool === INVENTARIO);
  const frames: ResultadoNucleo[] = [];
  if (tool === MOVIMIENTOS) {
   const offset = args.detalle_offset === undefined ? 0 : entero(args.detalle_offset); if (offset === null) throw Error('invalid_value');
   const period = periodoNucleo(ctx, 'fecha', 'recorded_at')!;
   const seed = await leer(port, ctx, 'gan_movimientos', `&fecha=gte.${ctx.period!.from}&fecha=lte.${ctx.period!.to}`);
   if (seed.rows.some(r => String(r.fecha) < ctx.period!.from || String(r.fecha) > ctx.period!.to)) throw Error('source_error');
   const closed = await cerrar(seed, port, ctx, cat), seedIds = new Set(seed.rows.filter(r => pertenece(r, cat) || endpoints(r).length === 0 && args.finca_name === undefined && args.ubicacion_name === undefined).map(r => String(r.id)));
   const groups = agrupar(closed.rows).filter(e => e.rows.some(r => seedIds.has(String(r.id))));
   return acotar(eventoFrames(groups, [...cat.reads, ...closed.reads], ctx, cat, period, { ...cat.filters, detalle_offset: String(offset) }, 'Movimientos registrados del período', offset));
  }
  let window: { from: string; to: string } | null = null;
  try { window = fechaVentana(ctx); } catch { /* El snapshot no depende de resolver el período histórico. */ }
  const [invResult, weightResult, movResult, pendingResult] = await Promise.allSettled([
   leer(port, ctx, 'gan_inventario'), leer(port, ctx, 'gan_pesos_historico'),
   window ? leer(port, ctx, 'gan_movimientos', `&estado=eq.confirmado&fecha=gte.${window.from}&fecha=lte.${window.to}`) : Promise.reject(Error('scope_ambiguous')),
   leer(port, ctx, 'gan_movimientos', '&estado=eq.pendiente'),
  ]);
  const stockScope = scope(ctx, 'gan:stock:error', 'cattle.inventory', [], cat.filters);
  if (invResult.status === 'fulfilled') {
   for (const node of nodos(cat, ctx)) frames.push(stockFrame(node, cat, invResult.value, weightResult.status === 'fulfilled' ? weightResult.value : null, ctx));
  } else frames.push(parteNoVerificable(stockScope, STOCK, 'Saldo registrado no verificable', 'source_error'));
  const extras: ResultadoNucleo[] = [];
  if (movResult.status === 'fulfilled' && window) {
   try {
    extras.push(variacion(movResult.value, cat, ctx, window));
    if (args.include_movimientos === true) { const closed = await cerrar(movResult.value, port, ctx, cat); const ids = new Set(movResult.value.rows.filter(r => pertenece(r, cat)).map(r => String(r.id))); extras.push(...eventoFrames(agrupar(closed.rows).filter(e => e.rows.some(r => ids.has(String(r.id)))), [...cat.reads, ...closed.reads], ctx, cat, periodoNucleo({ ...ctx, period: window }, 'fecha', 'recorded_at'), cat.filters, 'Movimientos confirmados recientes (fuente registrada)')); }
   } catch (e) { extras.push(parteNoVerificable({ ...stockScope, id: 'gan:variation:error', period: periodoNucleo({ ...ctx, period: window }, 'fecha', 'recorded_at') }, ['ganado.variation.entries', 'ganado.variation.exits', 'ganado.variation.net'], 'Variación no verificable', errorCode(e))); }
  } else extras.push(parteNoVerificable({ ...stockScope, id: 'gan:variation:error', period: periodoNucleo({ ...ctx, period: window }, 'fecha', 'recorded_at') }, ['ganado.variation.entries'], 'Variación no verificable', 'source_error'));
  if (pendingResult.status === 'fulfilled') { try { extras.push(...await pending(pendingResult.value, ctx, cat, port)); } catch (e) { extras.push(parteNoVerificable({ ...stockScope, id: 'gan:pending:error', filters: { universo: 'global' } }, ['ganado.pending.count'], 'Pendientes globales no verificables', errorCode(e))); } }
  else extras.push(parteNoVerificable({ ...stockScope, id: 'gan:pending:error', filters: { universo: 'global' } }, ['ganado.pending.count'], 'Pendientes globales no verificables', 'source_error'));
  // Esenciales primero; la omisión de detalle se declara después del cálculo
  // completo, nunca se convierte una página o recorte en la población fuente.
  const words = textoNucleo(ctx.currentUserText).split(' '), request = textoNucleo(ctx.currentUserText);
  const wantsDetail = words.some(w => ['peso', 'pesos', 'potrero', 'potreros', 'lote', 'lotes', 'etapa', 'etapas', 'finca', 'fincas', 'ubicacion', 'ubicaciones'].includes(w));
  const countOnly = extras.filter(f => f.parts.some(p => p.metrics.includes('ganado.pending.count') || p.metrics.includes('ganado.variation.net')));
  const details = extras.filter(f => !countOnly.includes(f));
  const pendingRequested = request.includes('pendiente');
  return acotar([...(frames.length ? [frames[0]] : []), ...(pendingRequested ? countOnly : []), ...(wantsDetail && !args.include_movimientos && !pendingRequested ? frames.slice(1) : []), ...(!pendingRequested ? countOnly : []), ...(args.include_movimientos || pendingRequested ? details : []), ...(!wantsDetail || args.include_movimientos || pendingRequested ? frames.slice(1) : []), ...(!args.include_movimientos && !pendingRequested ? details : [])]);
 } catch (e) { return fallo(ctx, operation, errorCode(e)); }
}
