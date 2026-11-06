import type { CEDistribucion } from '../calculosConductividad.ts';
// undefined = no leído; null = NULL registrado. CE se selecciona por fecha, nunca por ronda.
export interface ConsultaConductividad { lote_ids: string[]; lotes: string[]; desde?: string; hasta?: string }
export interface CatalogoConductividad {
  lotes?: { id: string; nombre?: string | null }[];
  rondas?: { id: string }[];
}
export interface RegistroConductividad {
  id: string; lote_id?: string | null; ronda_id?: string | null; fecha_monitoreo?: string | null;
  valor_ce?: number | null; lecturas?: unknown; num_arboles?: number | null; ph?: number | null;
}
export interface DatosConductividad extends CatalogoConductividad { registros?: RegistroConductividad[] }
export interface FuenteConductividad {
  catalogo(): Promise<CatalogoConductividad>;
  leerRegistros(): Promise<RegistroConductividad[]>;
}
export interface FilaConductividad {
  id: string; lote_id: string; lote: string; fecha_monitoreo: string;
  valor_ce: number | null; distribucion: CEDistribucion | null; ph: number | null; num_arboles: number | null;
  ronda_id: string | null; ronda_estado: 'sin_vinculo' | 'visible' | 'no_legible' | 'no_leido';
  estado: 'ok' | 'parcial' | 'no_calculable'; motivos: string[];
}
export interface ResultadoConductividad {
  tipo: 'conductividad'; id: string; consulta: ConsultaConductividad;
  estado: 'ok' | 'parcial' | 'no_disponible' | 'no_resuelto' | 'aclaracion' | 'vacio_verificado';
  filas: FilaConductividad[]; filtros_visibles?: { lotes: string[] };
  excluidos: { padre_no_visible: number; incompatibles: number };
  avisos: string[]; motivo?: string; fuente: 'lecturas_independientes'; unidad: 'dS/m';
}
