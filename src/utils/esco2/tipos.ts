import type { AnalisisConsulta, ResultadoAnalisis } from './analiticaTipos.ts';
import type { IntencionSolicitud } from './intencion.ts';
import type { ConsultaPesajesLeche, ConsultaLitrosQuincenales, ResultadoPesajesLeche, ResultadoLitrosQuincenales } from './lecheTipos.ts';
import type { ConsultaClima, ResultadoClima } from './climaTipos.ts';
import type { ConsultaHato, ResultadoHato } from './hatoTipos.ts';
import type { ConsultaConductividad, ResultadoConductividad } from './conductividadTipos.ts';
import type { ConsultaMonitoreo, ResultadoMonitoreo } from './monitoreoTipos.ts';
// Esco 2.0 — tipos del núcleo de consultas (M2.5: familia de labores).
// Sin dependencias de Deno ni del navegador: el mismo código corre en Vitest,
// en Node (runner de evaluación) y, más adelante, en la edge function.
import type { ConsultaLaborAplicacion, ResultadoLaborAplicacion } from './laborAplicacionTipos.ts';
import type { ConsultaAplicaciones, ResultadoAplicaciones } from './aplicacionesTipos.ts';
import type { ConsultaCostosAplicacion, ResultadoCostosAplicacion } from './costosTipos.ts';
import type { ConsultaFaltantesAplicacion, ResultadoFaltantesAplicacion } from './faltantesTipos.ts';
import type { ConsultaCantidadesAplicacion, ResultadoCantidadesAplicacion } from './cantidadesTipos.ts';
import type { CoberturaPlan } from './cobertura.ts';

/** Fila mínima de `registros_trabajo` que el núcleo necesita. */
export interface RegistroTrabajo {
  id: string;
  tarea_id: string;
  lote_id: string | null;
  fecha_trabajo: string; // AAAA-MM-DD
  fraccion_jornal: number;
  costo_jornal: number | null;
}

export interface Tarea {
  id: string;
  nombre: string;
  estado: string | null;
  tipo_tarea_id: string | null;
  jornales_estimados: number | null;
  /** Fechas AAAA-MM-DD planeadas y reales de la tarea. Ausentes (undefined) en snapshots viejos; null = sin fecha. */
  lote_ids?: string[] | null;
  fecha_estimada_inicio?: string | null;
  fecha_estimada_fin?: string | null;
  fecha_inicio_real?: string | null;
  fecha_fin_real?: string | null;
}

/** Aplicación fitosanitaria que originó una tarea (`aplicaciones.tarea_id`, relación 1:1). */
export interface Aplicacion {
  id: string;
  tarea_id: string;
  codigo_aplicacion: string | null;
  nombre_aplicacion: string | null;
  estado: string | null;
}

export interface TipoTarea {
  id: string;
  nombre: string;
  categoria: string | null;
}

export interface Lote {
  id: string;
  nombre: string;
  activo: boolean | null;
  /** Base de las métricas por árbol y por hectárea. Ausente o null = sin dato (nunca 0). */
  total_arboles?: number | null;
  area_hectareas?: number | null;
}

/** Datos que el ejecutor lee. La fuente (snapshot congelado o Supabase con JWT) es intercambiable. */
export interface DatosLabores {
  registros: RegistroTrabajo[];
  tareas: Tarea[];
  tiposTareas: TipoTarea[];
  lotes: Lote[];
  /** Aplicaciones con tarea asociada. Ausente = la fuente no las leyó. */
  aplicaciones?: Aplicacion[];
  fuente?: { consistencia: 'lecturas_independientes' | 'snapshot_sintetico'; camposNoDisponibles?: string[] };
}

export type Agrupacion = 'lote' | 'tarea' | 'categoria' | 'tipo_tarea' | 'dia' | 'mes' | 'semana';
export type Metrica =
  | 'jornales'
  | 'costo'
  | 'dias_con_registro'
  | 'primer_registro'
  | 'ultimo_registro'
  // Razones calculadas por código (el modelo nunca divide).
  | 'jornales_por_arbol'
  | 'jornales_por_hectarea'
  | 'costo_por_jornal';
export type SinLote = 'incluir' | 'excluir' | 'solo';

/** Argumentos validados de la operación `consultar_labores`. */
export interface ConsultaLabores {
  proposito: string;
  cohorte?: 'trabajo_registrado' | 'tarea_programada';
  base_fecha?: 'fecha_trabajo' | 'fecha_estimada_inicio';
  tarea_ids?: string[];
  lote_ids?: string[];
  ranking?: { metrica: Metrica; direccion: 'asc' | 'desc'; n: number; empates: 'incluir' | 'exactamente_n_por_id' };
  desde: string;
  hasta: string;
  lotes: string[];
  tareas: string[];
  categorias: string[];
  sin_lote: SinLote;
  agrupar_por: Agrupacion[];
  metricas: Metrica[];
  incluir_estado_tarea: boolean;
  limite: number | null;
}

export interface Aclaracion {
  pregunta: string;
  motivo: string;
}

/** Plan validado: las consultas pueden conservar una disposición parcial cerrada. La aclaración es exclusiva. */
export type Plan = (
  | { tipo: 'consultas'; consultas: ConsultaLabores[]; parcialFueraDeAlcance?: true }
  | { tipo: 'operaciones'; operaciones: OperacionConsulta[]; parcialFueraDeAlcance?: true }
  | { tipo: 'aclaracion'; aclaracion: Aclaracion }
  | { tipo: 'fuera_de_alcance'; motivo: string }) & { cobertura?: CoberturaPlan; intencion?: IntencionSolicitud };
export type OperacionConsulta = ({tipo:'pesajes_leche';consulta:ConsultaPesajesLeche}|{tipo:'litros_quincenales';consulta:ConsultaLitrosQuincenales}|{ tipo: 'hato'; consulta: ConsultaHato } | { tipo: 'conductividad'; consulta: ConsultaConductividad } | { tipo: 'labores'; consulta: ConsultaLabores } | { tipo: 'monitoreo'; consulta: ConsultaMonitoreo } | { tipo: 'clima'; consulta: ConsultaClima } | { tipo: 'aplicaciones'; consulta: ConsultaAplicaciones } | { tipo: 'cantidades_aplicacion'; consulta: ConsultaCantidadesAplicacion } | { tipo: 'costos_aplicacion'; consulta: ConsultaCostosAplicacion } | { tipo: 'labor_aplicacion'; consulta: ConsultaLaborAplicacion } | { tipo: 'faltantes_aplicacion'; consulta: ConsultaFaltantesAplicacion }) & { parte_ids?: string[]; analisis?: AnalisisConsulta };
export type PlanConsultas = Extract<Plan, { tipo: 'consultas' | 'operaciones' }>;
export function operacionesDelPlan(plan: PlanConsultas): OperacionConsulta[] {
  return plan.tipo === 'consultas' ? plan.consultas.map(consulta => ({ tipo: 'labores', consulta })) : plan.operaciones;
}
export function planDeOperaciones(operaciones: OperacionConsulta[], parcialFueraDeAlcance?: true, cobertura?: CoberturaPlan): PlanConsultas {
  if (parcialFueraDeAlcance !== undefined && parcialFueraDeAlcance !== true) throw new Error('disposicion_parcial_no_valida');
  const parcial = parcialFueraDeAlcance ? { parcialFueraDeAlcance } : {};
  const laborales = operaciones.filter((o): o is Extract<OperacionConsulta, { tipo: 'labores' }> => o.tipo === 'labores');
  return !cobertura && laborales.length === operaciones.length && operaciones.every(o => !o.parte_ids) ? { tipo: 'consultas', consultas: laborales.map(o => o.consulta), ...parcial } : { tipo: 'operaciones', operaciones, ...parcial, ...(cobertura ? { cobertura } : {}) };
}
export type ResultadoConsulta = (ResultadoPesajesLeche | ResultadoLitrosQuincenales | ResultadoHato | ResultadoConductividad | ResultadoParte | ResultadoClima | ResultadoMonitoreo | ResultadoAplicaciones | ResultadoCantidadesAplicacion | ResultadoCostosAplicacion | ResultadoLaborAplicacion | ResultadoFaltantesAplicacion) & {analisis?: ResultadoAnalisis; seleccion?:{de?:string;estado:'ok'|'vacio_verificado'|'no_disponible';ids:string[];motivo?:string}};
export const esResultadoAplicaciones = (r: ResultadoConsulta): r is ResultadoAplicaciones => 'tipo' in r && r.tipo === 'aplicaciones';
export const esResultadoCostos = (r: ResultadoConsulta): r is ResultadoCostosAplicacion => 'tipo' in r && r.tipo === 'costos_aplicacion';
export const esResultadoCantidades = (r: ResultadoConsulta): r is ResultadoCantidadesAplicacion => 'tipo' in r && r.tipo === 'cantidades_aplicacion';
export const esResultadoLaborAplicacion = (r: ResultadoConsulta): r is ResultadoLaborAplicacion => 'tipo' in r && r.tipo === 'labor_aplicacion';
export const esResultadoFaltantesAplicacion = (r: ResultadoConsulta): r is ResultadoFaltantesAplicacion => 'tipo' in r && r.tipo === 'faltantes_aplicacion';

export interface NoResuelto {
  tipo: 'lote' | 'tarea' | 'categoria';
  texto: string;
  motivo: 'sin_coincidencia' | 'ambiguo';
  sugerencias: string[];
}

export interface ValoresMetricas {
  jornales?: number;
  costo?: number | null;
  dias_con_registro?: number;
  primer_registro?: string | null;
  ultimo_registro?: string | null;
  /** Participación en jornales del total del alcance, calculada por código (0–100). */
  porcentaje_jornales?: number;
  /** null = no se puede calcular (sin base en el catálogo, sin costo o sin jornales); ver `notas`. */
  jornales_por_arbol?: number | null;
  jornales_por_hectarea?: number | null;
  costo_por_jornal?: number | null;
}

/** Datos de la tarea en una fila agrupada por tarea (incluir_estado_tarea). */
export interface DatosTareaFila {
  estado_tarea?: string | null;
  jornales_estimados?: number | null;
  fechas_tarea?: {
    estimada_inicio?: string | null;
    estimada_fin?: string | null;
    real_inicio?: string | null;
    real_fin?: string | null;
  };
  /** null = la tarea no pertenece a ninguna aplicación (o no es visible para el usuario). */
  aplicacion?: { codigo: string | null; nombre: string | null; estado: string | null } | null;
}

export interface FilaResultado extends ValoresMetricas, DatosTareaFila {
  grupo_ids?: Partial<Record<Agrupacion, string>>;
  fuentes?: string[];
  asociaciones?: { estado: 'conocido' | 'vacio_verificado' | 'no_disponible'; aplicaciones: { id: string; codigo: string | null; nombre: string | null; estado: string | null }[] };
  campos_no_disponibles?: string[];
  grupo: Partial<Record<Agrupacion, string>>;
}

/**
 * D30: jornales estimados de las tareas de una categoría, SIEMPRE junto a los registrados y
 * rotulados aparte. Es el plan completo de cada tarea, no el del período consultado.
 */
export interface EstimadosCategoria {
  jornales_estimados: number;
  tareas_en_alcance: number;
  tareas_sin_estimado: number;
  tareas_estimado_no_disponible?: number;
  /** 'toda_la_categoria' o, con filtro de lote, 'tareas_con_registros_en_los_lotes'. */
  base: 'toda_la_categoria' | 'tareas_con_registros_en_los_lotes';
}

/** Resultado de una parte. Todas las cifras de la respuesta deben salir de aquí. */
export interface ResultadoParte {
  id: string;
  proposito: string;
  aclaracion?: {tipo:'categoria_o_tareas';categoria:string;tareas:string[];requiere_eleccion?:boolean};
  estado: 'ok' | 'sin_registros' | 'no_resuelto' | 'no_disponible';
  semantica?: { cohorte: 'trabajo_registrado' | 'tarea_programada'; base_fecha: 'fecha_trabajo' | 'fecha_estimada_inicio'; disposicion: 'respondida' | 'fuente_no_disponible' | 'no_soportada' | 'aclaracion'; motivo?: string; miembros: string[]; fuentes: string[]; calificadores: string[] };
  alcance: {
    desde: string;
    hasta: string;
    lote_ids?: string[];
    tarea_ids?: string[];
    hasta_recortado_a_hoy: boolean;
    lotes: string[] | 'todos';
    tareas: string[] | 'todas';
    categorias: string[] | 'todas';
    sin_lote: SinLote;
    agrupar_por: Agrupacion[];
  };
  no_resueltos: NoResuelto[];
  filas: FilaResultado[];
  total: ValoresMetricas;
  particiones?: {con_lote:ValoresMetricas;sin_lote:ValoresMetricas};
  poblacion?: { universo: 'seleccion_efectiva'; miembros: string[]; con_lote: { estado: 'seleccionado' | 'vacio_verificado' | 'excluido'; registros: number | null }; sin_lote: { estado: 'seleccionado' | 'vacio_verificado' | 'excluido'; registros: number | null } };
  /** D30: presente siempre que la consulta filtra por categoría de tarea. */
  estimados?: EstimadosCategoria;
  /** Por qué una métrica del total o de una fila es null, en palabras del sistema. */
  notas: string[];
  cobertura: {
    registros: number;
    registros_sin_lote: number;
    registros_sin_costo: number;
    grupos_totales: number;
    grupos_mostrados: number;
  };
}

export interface MensajeHistorial {
  rol: 'user' | 'assistant';
  texto: string;
}

export const esResultadoMonitoreo = (r: ResultadoConsulta): r is ResultadoMonitoreo => 'tipo' in r && r.tipo === 'monitoreo';

export const esResultadoConductividad = (r: ResultadoConsulta): r is ResultadoConductividad => 'tipo' in r && r.tipo === 'conductividad';

export const esResultadoClima = (r: ResultadoConsulta): r is ResultadoClima => 'tipo' in r && r.tipo === 'clima';
export const esResultadoHato = (r: ResultadoConsulta): r is ResultadoHato => 'tipo' in r && r.tipo === 'hato';

export const esResultadoPesajesLeche = (r:ResultadoConsulta):r is ResultadoPesajesLeche => 'tipo' in r && r.tipo==='pesajes_leche';
export const esResultadoLitrosQuincenales = (r:ResultadoConsulta):r is ResultadoLitrosQuincenales => 'tipo' in r && r.tipo==='litros_quincenales';
