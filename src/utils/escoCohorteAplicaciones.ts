/** Server-private, single-slot application cohort receipt. Metadata is only a locator. */
export const PROYECTO_COHORTE = 'ywhtjwawnkeqlwxbvgup';
export const VIGENCIA_COHORTE_MS = 30 * 60 * 1000;
export interface CohorteAplicaciones { ids: string[]; desde: string; hasta: string }
export interface MensajeCohorte { id: string; role: string; content: string; metadata?: { application_cohort?: unknown } }
export interface ContextoCohorte {
  usuario: string; conversacion: string; canal: 'web' | 'telegram';
  anterior?: { asistenteId: string; usuarioId: string; pregunta: string; handle: unknown };
}
interface ReciboCohorte extends CohorteAplicaciones {
  version: 1; proyecto: typeof PROYECTO_COHORTE; usuario: string; conversacion: string;
  canal: ContextoCohorte['canal']; asistenteId: string; usuarioId: string; preguntaHash: string;
  handle: string; emitido: number; expira: number;
}
export interface AlmacenCohorte { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; del(key: string): Promise<void> }
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const fecha = (v: unknown): v is string => {
  if(typeof v!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const [y,m,d]=v.split('-').map(Number);
  const leap=y%4===0 && (y%100!==0 || y%400===0);
  return y>=1000 && m>=1 && m<=12 && d>=1 && d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
};
export function cohorteValida(v: unknown): v is CohorteAplicaciones {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as CohorteAplicaciones;
  return Array.isArray(r.ids) && r.ids.length <= 50 && r.ids.every(uuid) && new Set(r.ids).size === r.ids.length && fecha(r.desde) && fecha(r.hasta) && r.desde <= r.hasta;
}
export function contextoDesdeHistorial(usuario: string, conversacion: string, canal: ContextoCohorte['canal'], historia: MensajeCohorte[]): ContextoCohorte {
  const [prevUser, prevAssistant, currentUser] = historia.slice(-3);
  return { usuario, conversacion, canal, ...(prevUser?.role === 'user' && prevAssistant?.role === 'assistant' && currentUser?.role === 'user'
    ? { anterior: { asistenteId: prevAssistant.id, usuarioId: prevUser.id, pregunta: prevUser.content, handle: prevAssistant.metadata?.application_cohort } } : {}) };
}
const clave = (usuario: string) => 'esco:application-date-cohort:v1:' + usuario;
async function hash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x=>x.toString(16).padStart(2,'0')).join('');
}
export async function emitirCohorte(almacen: AlmacenCohorte, contexto: ContextoCohorte, usuarioId: string, asistenteId: string, pregunta: string, cohorte: CohorteAplicaciones, ahora = Date.now()): Promise<string | null> {
  if (![contexto.usuario, contexto.conversacion, usuarioId, asistenteId].every(uuid) || !cohorteValida(cohorte) || !Number.isSafeInteger(ahora)) return null;
  const handle = crypto.randomUUID();
  const recibo: ReciboCohorte = { desde:cohorte.desde, hasta:cohorte.hasta, ids: [...cohorte.ids], version: 1, proyecto: PROYECTO_COHORTE, usuario: contexto.usuario,
    conversacion: contexto.conversacion, canal: contexto.canal, usuarioId, asistenteId, preguntaHash: await hash(pregunta), handle, emitido: ahora, expira: ahora + VIGENCIA_COHORTE_MS };
  if(new TextEncoder().encode(JSON.stringify(recibo)).byteLength>4096)return null;
  await almacen.set(clave(contexto.usuario), recibo);
  return handle;
}
export async function cargarCohorte(almacen: AlmacenCohorte, contexto: ContextoCohorte, ahora = Date.now()): Promise<CohorteAplicaciones | null> {
  if (!Number.isSafeInteger(ahora) || !uuid(contexto.usuario) || !uuid(contexto.conversacion) || !contexto.anterior || !uuid(contexto.anterior.handle)) return null;
  const r = await almacen.get(clave(contexto.usuario)) as ReciboCohorte | null;
  if (!r || typeof r !== 'object') return null;
  // One bounded slot per user. Expiry is enforced on every read; physical deletion
  // is lazy, with replacement on the next eligible list (no background sweeper).
  if (!Number.isSafeInteger(r.expira) || r.expira <= ahora) { await almacen.del(clave(contexto.usuario)); return null; }
  if (!cohorteValida(r) || r.version !== 1 || r.proyecto !== PROYECTO_COHORTE || r.usuario !== contexto.usuario || r.conversacion !== contexto.conversacion || r.canal !== contexto.canal ||
    r.handle !== contexto.anterior.handle || r.asistenteId !== contexto.anterior.asistenteId || r.usuarioId !== contexto.anterior.usuarioId ||
    !Number.isSafeInteger(r.emitido) || r.emitido > ahora || r.expira - r.emitido !== VIGENCIA_COHORTE_MS || r.preguntaHash !== await hash(contexto.anterior.pregunta)) return null;
  return { ids: [...r.ids], desde: r.desde, hasta: r.hasta };
}
