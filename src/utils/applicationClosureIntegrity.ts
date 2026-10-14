import type { PayloadCierreAplicacion } from '@/utils/calculosCierreAplicacion';

// Release gate: reviewed snapshot/CAS/receipt SQL must be installed before this caller.
// No legacy RPC or direct-table fallback can preserve these guarantees.
// Bind each RPC to its original owner even if SDK transport acquires a newer session.
export interface ApplicationClosureClient {
  auth: { getUser(): PromiseLike<{ data: { user: { id: string } | null }; error: { message: string } | null }> };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
type JsonObject = Record<string, unknown>;
export type ClosureExpected = JsonObject;
export interface ClosureReceipt {
  aplicacionId: string; cierreId: string; registrosEliminados: number;
  registrosInsertados: number; registrosActualizados: number; productosActualizados: number;
}
interface Attempt { version: 1; owner: string; application: string; key: string; payload: PayloadCierreAplicacion; expected: ClosureExpected }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (): never => { throw new Error('No se pudo verificar el cierre. Conserve los datos y verifique el intento pendiente antes de volver a cerrar.'); };
function object(value: unknown): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as JsonObject;
}
function uuid(value: unknown): string { return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : fail(); }
function exact(value: JsonObject, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) fail();
}
function finiteJson(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value)) fail();
  if (Array.isArray(value)) value.forEach(finiteJson);
  else if (value !== null && typeof value === 'object') Object.values(value).forEach(finiteJson);
  else if (value !== null && value !== undefined && !['string','number','boolean'].includes(typeof value)) fail();
}
function copy<T>(value: T): T { finiteJson(value); return JSON.parse(JSON.stringify(value)) as T; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as JsonObject)[key])).join(',') + '}';
  return JSON.stringify(value);
}
export function matchesClosureOriginal(left: unknown, right: unknown): boolean { return canonical(copy(left)) === canonical(copy(right)); }
function expected(value: unknown): ClosureExpected {
  const result = object(value); finiteJson(result);
  if (Object.keys(result).length === 0) fail();
  return result;
}
function payload(value: unknown, application: string): PayloadCierreAplicacion {
  const result = object(value); finiteJson(result);
  if (uuid(result.aplicacion_id) !== uuid(application) || !Array.isArray(result.registros_trabajo) || !Array.isArray(result.insumos_aplicados)) fail();
  const ids = new Set<string>();
  for (const item of result.insumos_aplicados as unknown[]) {
    const line = object(item), id = uuid(line.producto_id);
    if (ids.has(id) || typeof line.cantidad !== 'number' || !Number.isFinite(line.cantidad) || line.cantidad <= 0) fail();
    ids.add(id);
  }
  return result as unknown as PayloadCierreAplicacion;
}
function receipt(value: unknown, original: PayloadCierreAplicacion): ClosureReceipt {
  const result = object(value);
  exact(result, ['aplicacionId','cierreId','registrosEliminados','registrosInsertados','registrosActualizados','productosActualizados']);
  if (uuid(result.aplicacionId) !== uuid(original.aplicacion_id)) fail();
  uuid(result.cierreId);
  const counts = {
    registrosEliminados: original.registros_trabajo.filter(row => row._deleted && row.id).length,
    registrosInsertados: original.registros_trabajo.filter(row => row._isNew && !row._deleted).length,
    registrosActualizados: original.registros_trabajo.filter(row => row._modified && row.id && !row._isNew && !row._deleted).length,
    productosActualizados: original.insumos_aplicados.length,
  };
  for (const [field, count] of Object.entries(counts)) if (result[field] !== count) fail();
  return result as unknown as ClosureReceipt;
}
export function closureAttemptSlot(owner: string, application: string): string { return `application_closure_attempt_v1:${uuid(owner)}:${uuid(application)}`; }
function read(owner: string, application: string): Attempt | null {
  const raw = localStorage.getItem(closureAttemptSlot(owner, application));
  if (raw === null) return null;
  const result = object(JSON.parse(raw)); exact(result, ['version','owner','application','key','payload','expected']);
  if (result.version !== 1 || uuid(result.owner) !== uuid(owner) || uuid(result.application) !== uuid(application)) fail();
  uuid(result.key); payload(result.payload, application); expected(result.expected);
  return result as unknown as Attempt;
}
function locked<T>(owner: string, application: string, run: () => T): Promise<T> {
  if (!globalThis.navigator?.locks) throw new Error('Este navegador no permite guardar el cierre de forma segura. Abra la aplicación con HTTPS en un navegador actualizado.');
  return navigator.locks.request(closureAttemptSlot(owner, application), { mode: 'exclusive' }, run);
}
async function authorize(client: ApplicationClosureClient, owner: string, current: () => boolean) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || uuid(data.user.id) !== uuid(owner) || !current()) throw new Error('La sesión cambió. Vuelva a abrir el cierre con su cuenta.');
}
async function rpc(client: ApplicationClosureClient, name: string, args: JsonObject): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export async function loadClosureExpected(client: ApplicationClosureClient, owner: string, application: string, current: () => boolean): Promise<ClosureExpected> {
  await authorize(client, owner, current);
  const result = object(await rpc(client, 'fn_application_closure_snapshot', { p_aplicacion_id: uuid(application), p_expected_owner: uuid(owner) }));
  exact(result, ['aplicacion_id','expected']);
  if (uuid(result.aplicacion_id) !== uuid(application)) fail();
  const original = copy(expected(result.expected));
  await authorize(client, owner, current);
  return original;
}
async function clear(client: ApplicationClosureClient, owner: string, application: string, original: Attempt, current: () => boolean) {
  await authorize(client, owner, current);
  await locked(owner, application, () => {
    if (!current()) fail();
    const pending = read(owner, application);
    if (pending && !matchesClosureOriginal(pending, original)) fail();
    localStorage.removeItem(closureAttemptSlot(owner, application));
  });
}
export function hasPendingClosure(owner: string, application: string): boolean {
  try { return localStorage.getItem(closureAttemptSlot(owner, application)) !== null; } catch { return false; }
}
export async function closeApplication(client: ApplicationClosureClient, owner: string, value: PayloadCierreAplicacion, revision: ClosureExpected, current: () => boolean): Promise<ClosureReceipt> {
  const originalPayload = payload(copy(value), value.aplicacion_id), originalExpected = copy(expected(revision));
  const application = uuid(value.aplicacion_id);
  await authorize(client, owner, current);
  const attempt = await locked(owner, application, () => {
    if (!current()) fail();
    const previous = read(owner, application);
    if (previous) {
      if (!matchesClosureOriginal(previous.payload, originalPayload) || !matchesClosureOriginal(previous.expected, originalExpected)) throw new Error('Hay un cierre pendiente de verificar. Verifique el intento original antes de enviar los datos editados.');
      return previous;
    }
    const next: Attempt = { version: 1, owner: uuid(owner), application, key: crypto.randomUUID(), payload: originalPayload, expected: originalExpected };
    localStorage.setItem(closureAttemptSlot(owner, application), JSON.stringify(next));
    return next;
  });
  await authorize(client, owner, current);
  const result = object(await rpc(client, 'fn_application_close', { p_expected_owner: attempt.owner, p_request_key: attempt.key, p_payload: attempt.payload, p_expected: attempt.expected }));
  exact(result, ['request_key','receipt']);
  if (uuid(result.request_key) !== uuid(attempt.key)) fail();
  const confirmed = receipt(result.receipt, attempt.payload);
  await clear(client, owner, application, attempt, current);
  return confirmed;
}
export async function resolveClosure(client: ApplicationClosureClient, owner: string, application: string, current: () => boolean): Promise<{ state: 'cancelled' | 'committed'; payload: PayloadCierreAplicacion; expected: ClosureExpected; receipt?: ClosureReceipt }> {
  await authorize(client, owner, current);
  const attempt = await locked(owner, application, () => read(owner, application));
  if (!attempt) throw new Error('No hay un intento de cierre pendiente para verificar.');
  await authorize(client, owner, current);
  const result = object(await rpc(client, 'fn_application_closure_status', { p_expected_owner: attempt.owner, p_request_key: attempt.key, p_payload: attempt.payload, p_expected: attempt.expected }));
  if (uuid(result.request_key) !== uuid(attempt.key)) fail();
  let confirmed: ClosureReceipt | undefined;
  if (result.state === 'committed') { exact(result, ['state','request_key','receipt']); confirmed = receipt(result.receipt, attempt.payload); }
  else if (result.state === 'cancelled') exact(result, ['state','request_key']);
  else fail();
  await clear(client, owner, application, attempt, current);
  return { state: result.state as 'cancelled' | 'committed', payload: attempt.payload, expected: attempt.expected, receipt: confirmed };
}

/** Verify the existing enrichment helper did not silently drop related-reader errors. */
export function validateClosureWork(original: ClosureExpected, rows: readonly import('@/types/aplicaciones').RegistroTrabajoCierre[]): void {
  const stored = original.registros_trabajo;
  const employees = original.empleados, contractors = original.contratistas;
  if (!Array.isArray(stored) || !Array.isArray(employees) || !Array.isArray(contractors) || rows.length !== stored.length) return fail();
  const workers = new Map([...employees, ...contractors].map(value => { const row = object(value); return [uuid(row.id), row]; }));
  const seen = new Set<string>();
  for (const row of rows) {
    const id = uuid(row.id); if (seen.has(id)) fail(); seen.add(id);
    const source = stored.map(object).find(item => uuid(item.id) === id); if (!source) return fail();
    for (const key of ['tarea_id','empleado_id','contratista_id','lote_id','fecha_trabajo']) if ((row[key as keyof typeof row] ?? null) !== source[key]) fail();
    if (row.fraccion_jornal !== Number(source.fraccion_jornal) || row.costo_jornal !== (source.costo_jornal ?? 0)) fail();
    const worker = workers.get(uuid(row.empleado_id || row.contratista_id)); if (!worker) return fail();
    if (row.trabajador_nombre !== (worker.nombre || 'Desconocido')) fail();
    const fields = row.empleado_id ? { salario: 'salario', prestaciones: 'prestaciones_sociales', auxilios: 'auxilios_no_salariales', horas_semanales: 'horas_semanales' } : { tarifa_jornal: 'tarifa_jornal' };
    for (const [target, field] of Object.entries(fields)) if ((row[target as keyof typeof row] ?? null) !== (worker[field] ?? null)) fail();
  }
}
