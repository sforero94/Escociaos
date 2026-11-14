// esco-consultas — motor SQL (modo `motor: 'sql'`).
//
// Se ejecuta DESPUÉS de la puerta de acceso de manejador.ts (JWT válido + Gerencia activa).
// Un parser determinista convierte el SQL a IR. PostgreSQL valida y compila de nuevo
// esa estructura (migración 194); el texto del modelo nunca llega a EXECUTE.
// La puerta web usa JWT del usuario; Telegram usa la RPC de actor autorizada.
import { convertirSqlSeguro, ErrorConsultaSegura } from '../../../src/utils/escoSql/consultaSegura.ts';
import type { ClienteLLM } from '../../../src/utils/esco2/llm.ts';
import { ErrorAccesoSql, ErrorSql, responderPregunta, type MensajeHistorialSql, type ResultadoSql, type EventoProgresoSql } from '../../../src/utils/escoSql/loop.ts';
import { calcularPyG, type ArgumentosPyG, type FilasCrudasPyG, type ReportePyG } from '../../../src/utils/escoSql/pyg.ts';

/** Forma mínima de supabase-js que usa el motor SQL. */
export interface ClienteRpc {
  rpc(nombre: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export function tieneRpc(cliente: unknown): cliente is ClienteRpc {
  return typeof (cliente as { rpc?: unknown })?.rpc === 'function';
}

/** Solo envía IR a la RPC segura. No existe fallback a la RPC de SQL arbitrario. */
export function ejecutorSqlSupabase(cliente: ClienteRpc, usuarioIdActor?: string): (sql: string) => Promise<ResultadoSql> {
  return async (sql) => {
    let consulta;
    try { consulta = convertirSqlSeguro(sql); }
    catch (e) {
      if (e instanceof ErrorConsultaSegura) throw new ErrorSql(e.codigo, '22023');
      throw new ErrorSql('sql_invalido', '22023');
    }
    const nombre = usuarioIdActor ? 'esco_sql_consultar_actor_v1' : 'esco_sql_consultar_v1';
    const args = usuarioIdActor ? { p_usuario: usuarioIdActor, p_consulta: consulta } : { p_consulta: consulta };
    const { data, error } = await cliente.rpc(nombre, args);
    if (error) {
      if (error.code === '42501') throw new ErrorAccesoSql(error.message ?? 'sin permiso');
      const cerrados = ['sql_invalido', 'version_no_admitida', 'nodo_no_admitido', 'relacion_no_admitida', 'columna_no_admitida', 'tipo_no_admitido', 'limite_excedido'];
      const motivo = error.code === '22023'
        ? (error.message && cerrados.includes(error.message) ? error.message : 'consulta_no_admitida')
        : (error.message ?? 'error de base de datos');
      throw new ErrorSql(motivo, error.code);
    }
    const d = data as { filas?: unknown; n_filas?: unknown; truncado?: unknown } | null;
    if (!d || !Array.isArray(d.filas) || typeof d.n_filas !== 'number') throw new ErrorSql('respuesta inesperada del ejecutor seguro');
    return { filas: d.filas as Record<string, unknown>[], n_filas: d.n_filas, truncado: d.truncado === true };
  };
}

// ── ESCO-180: P&G oficial ────────────────────────────────────────────────────

interface ConsultaPostgrest extends PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> {
  eq(columna: string, valor: unknown): ConsultaPostgrest;
  gte(columna: string, valor: unknown): ConsultaPostgrest;
  lte(columna: string, valor: unknown): ConsultaPostgrest;
  order(columna: string, opciones?: { ascending?: boolean }): ConsultaPostgrest;
  range(desde: number, hasta: number): ConsultaPostgrest;
}

/** Forma mínima de supabase-js para leer tablas (con el JWT del usuario: la RLS aplica). */
export interface ClienteTablas {
  from(tabla: string): { select(columnas: string): ConsultaPostgrest };
}

export function tieneTablas(cliente: unknown): cliente is ClienteTablas {
  return typeof (cliente as { from?: unknown })?.from === 'function';
}

const PAGINA = 1000;
/** ~1.250 gastos por año y PostgREST corta en 1.000 sin avisar: siempre se pagina. */
const MAX_PAGINAS = 50;

async function leerTodo(
  cliente: ClienteTablas,
  tabla: string,
  columnas: string,
  filtrar: (q: ConsultaPostgrest) => ConsultaPostgrest = (q) => q,
): Promise<Record<string, unknown>[]> {
  const filas: Record<string, unknown>[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const q = filtrar(cliente.from(tabla).select(columnas)).order('id', { ascending: true }).range(pagina * PAGINA, (pagina + 1) * PAGINA - 1);
    const { data, error } = await q;
    if (error) {
      if (error.code === '42501') throw new ErrorAccesoSql(error.message ?? 'sin permiso');
      throw new ErrorSql(`no se pudo leer ${tabla}`, error.code);
    }
    const lote = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    filas.push(...lote);
    if (lote.length < PAGINA) return filas;
  }
  // Un P&G calculado sobre datos cortados parece normal y está mal: nunca se devuelve.
  throw new ErrorSql(`${tabla} excede ${MAX_PAGINAS * PAGINA} filas`);
}

/** Mismas tablas, columnas y filtros que la pantalla (`useReportesFinancierosData.ts`). */
export function ejecutorPygSupabase(cliente: ClienteTablas): (args: ArgumentosPyG) => Promise<ReportePyG> {
  return async (args) => {
    const [negocios, categoriasGastos, conceptos, categoriasIngresos, gastos, ingresos, ganado, parametros] = await Promise.all([
      leerTodo(cliente, 'fin_negocios', 'id,nombre'),
      leerTodo(cliente, 'fin_categorias_gastos', 'id,nombre,tipo_costo'),
      leerTodo(cliente, 'fin_conceptos_gastos', 'id,nombre,tipo_costo'),
      leerTodo(cliente, 'fin_categorias_ingresos', 'id,nombre'),
      leerTodo(cliente, 'fin_gastos', 'id,fecha,negocio_id,valor,estado,categoria_id,concepto_id', (q) => q.gte('fecha', `${args.anio - 1}-01-01`).lte('fecha', `${args.anio}-12-31`)),
      leerTodo(cliente, 'fin_ingresos', 'id,fecha,negocio_id,valor,categoria_id,cosecha,cantidad'),
      // Historia COMPLETA y sin el hato: el costo promedio móvil depende de la serie entera.
      leerTodo(cliente, 'fin_transacciones_ganado', 'id,fecha,tipo,cantidad_cabezas,kilos_pagados,valor_total,es_hato', (q) => q.eq('es_hato', false)),
      leerTodo(cliente, 'fin_parametros', 'id,clave,anio,negocio_id,valor'),
    ]);
    const crudas: FilasCrudasPyG = { negocios, categoriasGastos, conceptos, categoriasIngresos, gastos, ingresos, ganado, parametros };
    return calcularPyG(args, crudas);
  };
}

export interface SalidaSql {
  estado: number;
  cuerpo: Record<string, unknown>;
}

export async function manejarSql(entrada: {
  cliente: unknown;
  usuarioIdActor?: string;
  llm: ClienteLLM;
  pregunta: string;
  historial: MensajeHistorialSql[];
  hoy: string;
  modelo?: { modelo: string; esfuerzo: 'none' | 'low' | 'medium' };
  registrar?: (evento: Record<string, unknown>) => void;
  onEvento?: (evento: EventoProgresoSql) => void;
  signal?: AbortSignal;
}): Promise<SalidaSql> {
  if (!tieneRpc(entrada.cliente)) return { estado: 503, cuerpo: { error: 'El motor SQL no está disponible en este entorno' } };
  try {
    const r = await responderPregunta({
      pregunta: entrada.pregunta,
      historial: entrada.historial,
      llm: entrada.llm,
      ejecutarSql: ejecutorSqlSupabase(entrada.cliente, entrada.usuarioIdActor),
      // Solo con el JWT del usuario (web). El camino de actor (Telegram) usa el service role,
      // que salta la RLS: ahí no se ofrece y el prompt remite a /finanzas/reportes.
      ejecutarPyg: !entrada.usuarioIdActor && tieneTablas(entrada.cliente) ? ejecutorPygSupabase(entrada.cliente) : undefined,
      hoy: entrada.hoy,
      config: entrada.modelo,
      onEvento: entrada.onEvento,
      signal: entrada.signal,
      registrarRechazoVisual: (motivo) => entrada.registrar?.({ funcion: 'esco-consultas', evento: 'visual_descartado', motivo }),
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
    // Las filas completas nunca salen por la traza; un visual lleva solo su proyección elegida.
    const consultas = r.consultas.map(({ filas_muestra: _muestra, ...consulta }) => consulta);
    return { estado: 200, cuerpo: { motor: 'sql', texto: r.texto, respuesta: r.respuesta, bloques: r.bloques, sugerencias: r.sugerencias, ...(r.aclaracion ? { aclaracion: r.aclaracion } : {}), consultas, uso: r.uso, ms: r.ms, hoy: entrada.hoy } };
  } catch (e) {
    if (e instanceof ErrorAccesoSql) return { estado: 403, cuerpo: { error: 'Esco está disponible solo para gerencia' } };
    // La migración segura no está aplicada: falla cerrado sin volver a la RPC anterior.
    if (e instanceof ErrorSql && e.codigo === 'PGRST202') return { estado: 503, cuerpo: { error: 'El motor SQL no está disponible: falta la migración 194' } };
    entrada.registrar?.({ funcion: 'esco-consultas', evento: 'turno_sql_error', error: e instanceof Error ? e.name : 'desconocido' });
    return { estado: 502, cuerpo: { error: 'No se pudo completar la consulta. Intenta de nuevo.' } };
  }
}
