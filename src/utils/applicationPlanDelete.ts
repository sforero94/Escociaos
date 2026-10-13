// Requires the reviewed unused-plan SQL protocol; no table-delete fallback.
// The server must bind snapshot/replay/mutation to the original operation owner.
import { matchesClosureOriginal, type ApplicationClosureClient } from '@/utils/applicationClosureIntegrity';
export type PlanDeleteExpected = Record<string, unknown>;
export interface PlanDeleteReceipt { actor: string; request_key: string; application_id: string; deleted: Record<string, string[]>; preserved_task_id: string | null }
interface Attempt { version: 1; owner: string; application: string; key: string; expected: PlanDeleteExpected }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (): never => { throw new Error('No se pudo verificar la eliminación. Verifique el intento pendiente antes de volver a eliminar.'); };
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail();
const uuid = (v: unknown): string => typeof v === 'string' && uuidPattern.test(v) ? v.toLowerCase() : fail();
const exact = (v: Record<string, unknown>, keys: string[]) => { if (Object.keys(v).length !== keys.length || keys.some(k => !(k in v))) fail(); };
const tables = ['aplicaciones','aplicaciones_lotes','aplicaciones_mezclas','aplicaciones_productos','aplicaciones_calculos','aplicaciones_compras'];
function original(value: unknown, application: string): PlanDeleteExpected {
  const e = obj(value), app = obj(e.aplicaciones);
  if (uuid(app.id) !== uuid(application)) fail();
  for (const t of tables.slice(1)) { if (!Array.isArray(e[t])) fail(); (e[t] as unknown[]).forEach(row => uuid(obj(row).id)); }
  return JSON.parse(JSON.stringify(e)) as PlanDeleteExpected;
}
export const planDeleteSlot = (owner: string, application: string) => `application_plan_delete_v1:${uuid(owner)}:${uuid(application)}`;
export const hasPendingPlanDelete = (owner: string, application: string) => localStorage.getItem(planDeleteSlot(owner, application)) !== null;
function read(owner: string, application: string): Attempt | null {
  const raw = localStorage.getItem(planDeleteSlot(owner, application)); if (raw === null) return null;
  const a = obj(JSON.parse(raw)); exact(a,['version','owner','application','key','expected']);
  if (a.version !== 1 || uuid(a.owner) !== uuid(owner) || uuid(a.application) !== uuid(application)) fail();
  uuid(a.key); original(a.expected,application); return a as unknown as Attempt;
}
function lock<T>(owner: string, application: string, run: () => T): Promise<T> {
  if (!navigator.locks) throw new Error('Use un navegador actualizado con HTTPS para eliminar el plan.');
  return navigator.locks.request(planDeleteSlot(owner,application),{mode:'exclusive'},run);
}
async function auth(client: ApplicationClosureClient, owner: string, current: () => boolean) {
  const r = await client.auth.getUser();
  if (r.error || !r.data.user || uuid(r.data.user.id) !== uuid(owner) || !current()) throw new Error('La sesión cambió. Vuelva a abrir la lista con su cuenta.');
}
async function rpc(client: ApplicationClosureClient, name: string, args: Record<string,unknown>) {
  const r = await client.rpc(name,args); if (r.error) throw new Error(r.error.message.startsWith('Solo puede eliminar') || r.error.message.startsWith('El plan cambió') ? r.error.message : 'No se pudo verificar el plan. Sus datos se conservaron. Verifique cualquier intento pendiente antes de volver a eliminar.'); return obj(r.data);
}
export async function loadPlanDeleteExpected(client: ApplicationClosureClient, owner: string, application: string, current: () => boolean) {
  await auth(client,owner,current);
  const r = await rpc(client,'fn_application_plan_delete_snapshot',{p_application_id:uuid(application),p_expected_owner:uuid(owner)});
  exact(r,['application_id','expected']); if (uuid(r.application_id) !== uuid(application)) fail();
  const e = original(r.expected,application); await auth(client,owner,current); return e;
}
function receipt(value: unknown, a: Attempt): PlanDeleteReceipt {
  const r = obj(value); exact(r,['actor','request_key','application_id','deleted','preserved_task_id']);
  if (uuid(r.actor) !== uuid(a.owner) || uuid(r.request_key) !== uuid(a.key) || uuid(r.application_id) !== uuid(a.application)) fail();
  const ids: Record<string,string[]> = {};
  for (const t of tables) ids[t] = (t === 'aplicaciones' ? [obj(a.expected.aplicaciones)] : a.expected[t] as unknown[]).map(v => uuid(obj(v).id)).sort();
  if (!matchesClosureOriginal(r.deleted,ids)) fail();
  const task = a.expected.tarea === null ? null : uuid(obj(a.expected.tarea).id);
  if (r.preserved_task_id !== task) fail(); return r as unknown as PlanDeleteReceipt;
}
async function clear(client: ApplicationClosureClient, a: Attempt, current: () => boolean) {
  await auth(client,a.owner,current);
  await lock(a.owner,a.application,() => { if (!current()) fail(); const saved = read(a.owner,a.application); if (saved && !matchesClosureOriginal(saved,a)) fail(); localStorage.removeItem(planDeleteSlot(a.owner,a.application)); });
}
export async function deleteUnusedPlan(client: ApplicationClosureClient, owner: string, application: string, e: PlanDeleteExpected, current: () => boolean) {
  const expected = original(e,application); await auth(client,owner,current);
  const a = await lock(owner,application,() => {
    if (!current()) return fail(); const saved = read(owner,application);
    if (saved) { if (!matchesClosureOriginal(saved.expected,expected)) throw new Error('Hay una eliminación pendiente. Verifique el intento original.'); return saved; }
    const next: Attempt = {version:1,owner:uuid(owner),application:uuid(application),key:crypto.randomUUID(),expected};
    localStorage.setItem(planDeleteSlot(owner,application),JSON.stringify(next)); return next;
  });
  await auth(client,owner,current);
  const r = await rpc(client,'fn_application_plan_delete',{p_expected_owner:a.owner,p_request_key:a.key,p_application_id:a.application,p_expected:a.expected});
  exact(r,['request_key','receipt']); if (uuid(r.request_key) !== uuid(a.key)) fail();
  const confirmed = receipt(r.receipt,a); await clear(client,a,current); return confirmed;
}
export async function resolvePlanDelete(client: ApplicationClosureClient, owner: string, application: string, current: () => boolean) {
  await auth(client,owner,current); const a = await lock(owner,application,() => read(owner,application)); if (!a) throw new Error('No hay una eliminación pendiente para verificar.');
  await auth(client,owner,current);
  const r = await rpc(client,'fn_application_plan_delete_status',{p_expected_owner:a.owner,p_request_key:a.key,p_application_id:a.application,p_expected:a.expected});
  if (uuid(r.request_key) !== uuid(a.key)) fail();
  if (r.state === 'committed') { exact(r,['state','request_key','receipt']); receipt(r.receipt,a); }
  else if (r.state === 'cancelled') exact(r,['state','request_key']); else fail();
  await clear(client,a,current); return r.state as 'committed' | 'cancelled';
}
