// P0/P1 experimental boundary only. No deployed source imports this module.
import type { Agrupacion, ConsultaLabores, DatosLabores, Metrica } from '../../../src/utils/esco2/tipos.ts';

export type Variante = 'baseline' | 'repair' | 'redesign';
export type Cohorte = 'trabajo_registrado' | 'tarea_programada';
export type BaseFecha = 'fecha_trabajo' | 'fecha_estimada_inicio';
export type EstadoValor = 'conocido' | 'nulo' | 'no_disponible' | 'vacio_verificado';
export type Disposicion = 'respondida' | 'aclaracion' | 'fuente_no_disponible' | 'no_soportada' | 'error';
export type TablaFuente = 'registros' | 'tareas' | 'tiposTareas' | 'lotes' | 'aplicaciones';

export interface FuenteExperimento {
  id: string;
  /** Completeness is scoped to the caller-visible synthetic population. */
  tablasCompletas: TablaFuente[];
  /** Fully qualified unavailable fields; other supplied row fields remain usable. */
  camposNoDisponibles: string[];
  aplicacionesCompletas: boolean;
  consistencia: 'snapshot_sintetico' | 'lecturas_independientes';
  /** Hypothetical fixture-only membership relation, absent from the current live reader.
   * Work rows never imply scheduling assignment. A passing enriched fixture proves no live guarantee. */
  asignacionesTareaLote?: { tareaId: string; loteId: string }[];
  asignacionesCompletas?: boolean;
}

export interface Ranking {
  metrica: Metrica;
  direccion: 'asc' | 'desc';
  n: number;
  empates: 'incluir' | 'exactamente_n_por_id';
}

export interface Obligacion {
  id: string;
  consulta: ConsultaLabores;
  cohorte: Cohorte;
  baseFecha: BaseFecha;
  /** Resolved IDs are authoritative; labels never establish identity. */
  tareaIds?: string[];
  loteIds?: string[];
  ranking?: Ranking;
  requeridos: ('metricas' | 'miembros' | 'estado_actual' | 'asociaciones' | 'estimados' | 'reconciliacion')[];
  /** Only predeclared capabilities outside this slice use this disposition. */
  noSoportada?: string;
  aclaracion?: { termino: string; alternativas: { id: string; etiqueta: string; tareaIds?: string[]; categorias?: string[] }[] };
}

export interface EstadoConversacion {
  version: 1;
  propietario: string;
  alcanceAceptado?: { loteIds?: string[]; tareaIds?: string[]; desde: string; hasta: string };
  pendiente?: { obligacionId: string; termino: string; alternativas: { id: string; etiqueta: string; tareaIds?: string[]; categorias?: string[] }[] };
}

export interface EntradaExperimento {
  pregunta: string;
  hoyBogota: string;
  datos: DatosLabores;
  fuente: FuenteExperimento;
  actor: { id: string; autenticado: boolean; activo: boolean; rol: string };
  obligaciones: Obligacion[];
  estado?: EstadoConversacion;
  /** Exact accepted option ID; unrelated input does not resolve pending state. */
  respuestaAclaracion?: string;
}

export interface Afirmacion {
  id: string;
  obligacionId: string;
  entidad: { tipo: Agrupacion | 'total' | 'aplicacion'; id: string; nombre: string };
  metrica: Metrica | 'miembros' | 'estado_actual' | 'asociaciones' | 'jornales_estimados' | 'reconciliacion';
  unidad: string;
  cohorte: Cohorte;
  baseFecha: BaseFecha;
  desde: string;
  hasta: string;
  estado: EstadoValor;
  valor: number | string | string[] | null;
  calificadores: string[];
  /** Stable synthetic row IDs or source scope IDs, never user-question values. */
  fuentes: string[];
}

export interface ResultadoObligacion {
  id: string;
  disposicion: Disposicion;
  afirmaciones: Afirmacion[];
  calificadores: string[];
  motivo?: string;
}

export interface SalidaExperimento {
  variante: Variante;
  resultados: ResultadoObligacion[];
  texto: string;
  estado?: EstadoConversacion;
  seguridad: { permitido: boolean; lecturas: number; propietario: string };
}
