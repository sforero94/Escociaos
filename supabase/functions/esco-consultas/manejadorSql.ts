// esco-consultas — motor SQL (modo `motor: 'sql'`).
//
// Se ejecuta DESPUÉS de la puerta de acceso de manejador.ts (JWT válido + Gerencia activa).
// Las consultas viajan por la RPC esco_sql_lectura (migración 192) con el cliente creado
// con el JWT del usuario: la RLS que aplica es la de quien pregunta, en una transacción de
// solo lectura. Aquí no hay ningún analizador de SQL: la seguridad la da Postgres.
import type { ClienteLLM } from '../../../src/utils/esco2/llm.ts';
import { ErrorAccesoSql, ErrorSql, responderPregunta, type MensajeHistorialSql, type ResultadoSql } from '../../../src/utils/escoSql/loop.ts';

/** Forma mínima de supabase-js que usa el motor SQL. */
export interface ClienteRpc {
  rpc(nombre: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export function tieneRpc(cliente: unknown): cliente is ClienteRpc {
  return typeof (cliente as { rpc?: unknown })?.rpc === 'function';
}

/** Ejecuta una consulta por la RPC. 42501 → ErrorAccesoSql; PGRST202 = la migración 192 no está. */
export function ejecutorSqlSupabase(cliente: ClienteRpc): (sql: string) => Promise<ResultadoSql> {
  return async (sql) => {
    const { data, error } = await cliente.rpc('esco_sql_lectura', { p_sql: sql });
    if (error) {
      if (error.code === '42501') throw new ErrorAccesoSql(error.message ?? 'sin permiso');
      throw new ErrorSql(error.message ?? 'error de base de datos', error.code);
    }
    const d = data as { filas?: unknown; n_filas?: unknown; truncado?: unknown } | null;
    if (!d || !Array.isArray(d.filas) || typeof d.n_filas !== 'number') throw new ErrorSql('respuesta inesperada de esco_sql_lectura');
    return { filas: d.filas as Record<string, unknown>[], n_filas: d.n_filas, truncado: d.truncado === true };
  };
}

export interface SalidaSql {
  estado: number;
  cuerpo: Record<string, unknown>;
}

export async function manejarSql(entrada: {
  cliente: unknown;
  llm: ClienteLLM;
  pregunta: string;
  historial: MensajeHistorialSql[];
  hoy: string;
  modelo?: { modelo: string; esfuerzo: 'none' | 'low' | 'medium' };
  registrar?: (evento: Record<string, unknown>) => void;
}): Promise<SalidaSql> {
  if (!tieneRpc(entrada.cliente)) return { estado: 503, cuerpo: { error: 'El motor SQL no está disponible en este entorno' } };
  try {
    const r = await responderPregunta({
      pregunta: entrada.pregunta,
      historial: entrada.historial,
      llm: entrada.llm,
      ejecutarSql: ejecutorSqlSupabase(entrada.cliente),
      hoy: entrada.hoy,
      config: entrada.modelo,
    });
    // Traza mínima: sin la pregunta, el SQL ni la respuesta (datos de la finca).
    entrada.registrar?.({
      funcion: 'esco-consultas',
      evento: 'turno_sql',
      consultas: r.consultas.length,
      errores: r.consultas.filter((c) => c.error).length,
      llamadas: r.uso.llamadas,
      ms: r.ms,
      costoUsd: r.uso.costoUsd,
    });
    return { estado: 200, cuerpo: { motor: 'sql', respuesta: r.respuesta, consultas: r.consultas, uso: r.uso, ms: r.ms, hoy: entrada.hoy } };
  } catch (e) {
    if (e instanceof ErrorAccesoSql) return { estado: 403, cuerpo: { error: 'Esco está disponible solo para gerencia' } };
    // La migración 192 no está aplicada: PostgREST no encuentra la función.
    if (e instanceof ErrorSql && e.codigo === 'PGRST202') return { estado: 503, cuerpo: { error: 'El motor SQL no está disponible: falta la migración 192' } };
    entrada.registrar?.({ funcion: 'esco-consultas', evento: 'turno_sql_error', error: e instanceof Error ? e.name : 'desconocido' });
    return { estado: 502, cuerpo: { error: 'No se pudo completar la consulta. Intenta de nuevo.' } };
  }
}
