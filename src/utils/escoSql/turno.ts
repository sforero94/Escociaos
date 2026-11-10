import { normalizarHistorialEfectivoSql, type MensajeHistorialSql } from './historial.ts';
export type CanalTurnoSql = 'web' | 'telegram';
export interface UsoTurnoSql { llamadas: number; entrada: number; salida: number; costoUsd: number | null }
export interface ContextoTurnoSql { turno_id: string; canal: CanalTurnoSql; historial_sha256: string }
export interface ReciboTurnoSql extends ContextoTurnoSql {
  version: 1;
  estado: 'completado' | 'error' | 'cancelado';
  uso: UsoTurnoSql | null;
  coste: { estado: 'completo' | 'parcial' | 'desconocido'; observadoUsd: number | null; llamadasConCoste: number; llamadasSinCoste: number };
}
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const costeValido = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function leerUsoTurnoSql(valor: unknown): UsoTurnoSql | null {
  if (!objeto(valor) || !natural(valor.llamadas) || !natural(valor.entrada) || !natural(valor.salida) || !(valor.costoUsd === null || costeValido(valor.costoUsd))) return null;
  return { llamadas: valor.llamadas, entrada: valor.entrada, salida: valor.salida, costoUsd: valor.costoUsd as number | null };
}
export function leerReciboTurnoSql(valor: unknown): ReciboTurnoSql | null {
  if (!objeto(valor) || valor.version !== 1 || !uuid(valor.turno_id) || (typeof valor.canal !== 'string' || !['web', 'telegram'].includes(valor.canal)) || typeof valor.historial_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(valor.historial_sha256) || (typeof valor.estado !== 'string' || !['completado', 'error', 'cancelado'].includes(valor.estado)) || !objeto(valor.coste)) return null;
  const uso = valor.uso === null ? null : leerUsoTurnoSql(valor.uso);
  if (valor.uso !== null && (!uso || uso.llamadas < 1)) return null;
  const c = valor.coste;
  if ((typeof c.estado !== 'string' || !['completo', 'parcial', 'desconocido'].includes(c.estado)) || !natural(c.llamadasConCoste) || !natural(c.llamadasSinCoste) || !(c.observadoUsd === null || costeValido(c.observadoUsd))) return null;
  if (!Number.isSafeInteger(c.llamadasConCoste + c.llamadasSinCoste)) return null;
  if (uso && (c.llamadasConCoste > uso.llamadas || c.llamadasConCoste + c.llamadasSinCoste < uso.llamadas)) return null;
  if (c.estado === 'completo' && (!uso || c.llamadasConCoste !== uso.llamadas || c.llamadasConCoste < 1 || c.llamadasSinCoste !== 0 || c.observadoUsd === null || uso.costoUsd !== c.observadoUsd)) return null;
  if (c.estado === 'parcial' && (!uso || c.llamadasConCoste < 1 || c.observadoUsd === null || uso.costoUsd !== null || c.llamadasSinCoste === 0)) return null;
  if (c.estado === 'desconocido' && (c.llamadasConCoste !== 0 || c.observadoUsd !== null || (uso && (uso.costoUsd !== null || c.llamadasSinCoste < uso.llamadas)))) return null;
  return { version: 1, turno_id: valor.turno_id, canal: valor.canal as CanalTurnoSql, historial_sha256: valor.historial_sha256, estado: valor.estado as ReciboTurnoSql['estado'], uso, coste: { estado: c.estado as ReciboTurnoSql['coste']['estado'], observadoUsd: c.observadoUsd as number | null, llamadasConCoste: c.llamadasConCoste, llamadasSinCoste: c.llamadasSinCoste } };
}
export async function hashHistorialSql(historial: readonly MensajeHistorialSql[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizarHistorialEfectivoSql(historial)));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function crearContextoTurnoSql(canal: CanalTurnoSql, historial: readonly MensajeHistorialSql[], crearId: () => string = () => crypto.randomUUID()): Promise<ContextoTurnoSql> {
  if (!['web', 'telegram'].includes(canal)) throw new Error('ESCO_SQL_CHANNEL_INVALID');
  const historial_sha256 = await hashHistorialSql(historial);
  const turno_id = crearId();
  if (!uuid(turno_id)) throw new Error('ESCO_SQL_TURN_ID_INVALID');
  return { turno_id, canal, historial_sha256 };
}
