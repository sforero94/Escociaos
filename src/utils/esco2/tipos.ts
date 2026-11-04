// Esco 2.0 — tipos del núcleo de consultas (M2.5: familia de labores).
// Sin dependencias de Deno ni del navegador: el mismo código corre en Vitest,
// en Node (runner de evaluación) y, más adelante, en la edge function.

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

/** Plan validado de un turno: o consultas, o una aclaración. Nunca las dos cosas. */
export type Plan =
  | { tipo: 'consultas'; consultas: ConsultaLabores[] }
  | { tipo: 'aclaracion'; aclaracion: Aclaracion }
  | { tipo: 'fuera_de_alcance'; motivo: string };

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
    estimada_inicio: string | null;
    estimada_fin: string | null;
    real_inicio: string | null;
    real_fin: string | null;
  };
  /** null = la tarea no pertenece a ninguna aplicación (o no es visible para el usuario). */
  aplicacion?: { codigo: string | null; nombre: string | null; estado: string | null } | null;
}

export interface FilaResultado extends ValoresMetricas, DatosTareaFila {
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
  /** 'toda_la_categoria' o, con filtro de lote, 'tareas_con_registros_en_los_lotes'. */
  base: 'toda_la_categoria' | 'tareas_con_registros_en_los_lotes';
}

/** Resultado de una parte. Todas las cifras de la respuesta deben salir de aquí. */
export interface ResultadoParte {
  id: string;
  proposito: string;
  estado: 'ok' | 'sin_registros' | 'no_resuelto';
  alcance: {
    desde: string;
    hasta: string;
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
