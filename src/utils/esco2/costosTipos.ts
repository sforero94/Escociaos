import type { AplicacionInventario, CierreInventario } from './aplicacionesTipos.ts';
import type { ConsultaCantidadesAplicacion, DatosCantidadesAplicacion, UnidadCantidad } from './cantidadesTipos.ts';
export interface ConsultaCostosAplicacion extends ConsultaCantidadesAplicacion { incluir_plan?: boolean }
export interface CostosGuardados {
  id: string; estado?: string | null;
  costo_total_insumos?: number | null; costo_total_mano_obra?: number | null; costo_total?: number | null;
}
export interface PrecioProductoCosto { id: string; nombre?: string | null; unidad_medida?: string | null; precio_unitario?: number | null }
export interface DatosCostosAplicacion {
  seleccion: 'ok' | 'no_leido' | 'no_resuelto';
  aplicacion?: AplicacionInventario;
  aplicacion_nombre_repetido?: boolean;
  costos?: CostosGuardados;
  cierres?: CierreInventario[];
  cantidades?: DatosCantidadesAplicacion;
  precios?: PrecioProductoCosto[];
}
export type EstadoDatoCosto = 'conocido' | 'sin_dato' | 'no_leido' | 'incompatible' | 'inventario_no_disponible' | 'no_verificado' | 'discrepancia' | 'sin_filas';
export interface FilaValorada {
  producto_id: string; producto_nombre?: string | null; unidad: UnidadCantidad | null;
  cantidad: number | null; precio_unitario: number | null; costo: number | null;
  estado: EstadoDatoCosto; motivos: string[];
}
export interface BloqueValoracion {
  estado: EstadoDatoCosto | 'parcial'; total: number | null; subtotal_conocido: number | null;
  fecha_consulta: string; filas: FilaValorada[]; motivos: string[];
}
export interface BloqueCongelado {
  estado: EstadoDatoCosto | 'parcial'; fecha_cierre: string | null;
  insumos: number | null; mano_obra: number | null; total: number | null; total_guardado: number | null;
  estados_campos: { insumos: EstadoDatoCosto; mano_obra: EstadoDatoCosto; total: EstadoDatoCosto };
  motivos: string[];
}
export interface ResultadoCostosAplicacion {
  tipo: 'costos_aplicacion'; id: string;
  resultados_poblacion?: ResultadoCostosAplicacion[];
  seleccion?: {de?:string;estado:'ok'|'vacio_verificado'|'no_disponible';ids:string[];motivo?:string}; consulta: ConsultaCostosAplicacion;
  estado: 'ok' | 'parcial' | 'no_disponible' | 'no_resuelto'; aplicacion?: AplicacionInventario;
  aplicacion_nombre_repetido?: boolean;
  congelado?: BloqueCongelado; ejecucion?: BloqueValoracion; plan?: BloqueValoracion;
  motivos: string[]; fuente: 'lecturas_independientes';
}
