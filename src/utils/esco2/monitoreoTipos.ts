// P4-1: undefined = no leído; null = NULL registrado. Identidad siempre por ID.
export interface ConsultaMonitoreo {
  ronda_ids: string[]; rondas: string[];
  lote_ids: string[]; lotes: string[];
  sublote_ids: string[]; sublotes: string[];
  plaga_ids: string[]; plagas: string[];
  agrupar_por: ('lote' | 'sublote')[];
  desde?: string; hasta?: string;
  seleccion_ronda?: 'todas' | 'ultima_global';
}
export interface NombreMonitoreo { id: string; nombre?: string | null }
export interface RondaMonitoreo extends NombreMonitoreo { fecha_inicio?: string | null; fecha_fin?: string | null }
export interface SubloteMonitoreo extends NombreMonitoreo { lote_id?: string | null }
export interface ObservacionMonitoreo {
  id: string; ronda_id?: string | null; lote_id?: string | null; sublote_id?: string | null;
  plaga_enfermedad_id?: string | null; fecha_monitoreo?: string | null;
  arboles_afectados?: number | null; arboles_monitoreados?: number | null;
}
export interface CatalogoMonitoreo {
  rondas?: RondaMonitoreo[]; lotes?: NombreMonitoreo[];
  sublotes?: SubloteMonitoreo[]; plagas?: NombreMonitoreo[];
}
export interface DatosMonitoreo extends CatalogoMonitoreo { observaciones?: ObservacionMonitoreo[] }
export interface FuenteMonitoreo {
  catalogo(): Promise<CatalogoMonitoreo>;
  leerObservaciones(): Promise<ObservacionMonitoreo[]>;
}
export interface FilaMonitoreo {
  ronda_id: string; ronda: string; ronda_inicio: string; ronda_fin: string | null;
  lote_id: string | null; lote: string | null; sublote_id: string | null; sublote: string | null;
  plaga_id: string; plaga: string;
  estado: 'ok' | 'no_revisado' | 'no_calculable';
  afectados: number | null; muestreados: number | null;
  observaciones: number; fechas: string[];
  incidencia: number | null; gravedad: string | null;
  no_calculables: number;
}
export interface ResultadoMonitoreo {
  tipo: 'monitoreo'; id: string; consulta: ConsultaMonitoreo;
  estado: 'ok' | 'parcial' | 'no_disponible' | 'no_resuelto' | 'aclaracion' | 'vacio_verificado';
  filas: FilaMonitoreo[];
  filtros_visibles?: { lotes: string[]; sublotes: string[]; plagas: string[] };
  excluidos: { sin_ronda: number; padre_no_visible: number; incompatibles: number };
  avisos: string[];
  motivo?: string;
  fuente: 'lecturas_independientes';
  unidad: 'observaciones de árboles muestreados';
}
