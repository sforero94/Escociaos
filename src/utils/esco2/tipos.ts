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
}

/** Datos que el ejecutor lee. La fuente (snapshot congelado o Supabase con JWT) es intercambiable. */
export interface DatosLabores {
  registros: RegistroTrabajo[];
  tareas: Tarea[];
  tiposTareas: TipoTarea[];
  lotes: Lote[];
}

export type Agrupacion = 'lote' | 'tarea' | 'categoria' | 'mes' | 'semana';
export type Metrica = 'jornales' | 'costo' | 'dias_con_registro' | 'primer_registro' | 'ultimo_registro';
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
}

export interface FilaResultado extends ValoresMetricas {
  grupo: Partial<Record<Agrupacion, string>>;
  estado_tarea?: string | null;
  jornales_estimados?: number | null;
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
