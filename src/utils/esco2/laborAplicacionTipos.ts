import type { AplicacionInventario } from './aplicacionesTipos.ts';
import type { RegistroTrabajo } from './tipos.ts';
export interface ConsultaLaborAplicacion { seleccion_de?: string; aplicacion_ids: string[]; aplicaciones: string[]; desde?: string; hasta?: string }
export interface DatosLaborAplicacion {
  seleccion: 'ok' | 'no_leido' | 'no_resuelto';
  aplicaciones?: AplicacionInventario[];
  aplicaciones_visibles?: AplicacionInventario[];
  tareas?: { id: string; nombre?: string | null }[];
  registros?: RegistroTrabajo[];
  lotes?: { id: string; nombre?: string | null }[];
}
export interface TotalLaborAplicacion { jornales: number | null; costo: number | null; costo_registrado: number | null; completo: boolean }
export interface FilaLaborAplicacion {
  tarea_id: string | null; tarea_nombre?: string | null; aplicaciones: AplicacionInventario[];
  estado: 'ok' | 'sin_tarea_vinculada' | 'vinculo_no_leido' | 'tarea_no_disponible' | 'registros_no_leidos' | 'sin_jornales_registrados';
  total: TotalLaborAplicacion;
  lotes: { lote_id: string | null; lote_nombre?: string | null; total: TotalLaborAplicacion }[];
  compartida: boolean;
}
export interface ResultadoLaborAplicacion {
  tipo: 'labor_aplicacion'; id: string; seleccion?:{de?:string;estado:'ok'|'vacio_verificado'|'no_disponible';ids:string[];motivo?:string}; estado: 'ok' | 'parcial' | 'no_disponible' | 'no_resuelto';
  consulta: ConsultaLaborAplicacion; filas: FilaLaborAplicacion[]; total: TotalLaborAplicacion;
  fuente: 'lecturas_independientes';
}
