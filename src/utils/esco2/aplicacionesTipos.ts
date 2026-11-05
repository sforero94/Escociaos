// Minimal P3 Task 2 source. Undefined means unread; null is a recorded NULL.
import type { ConsultaCostosAplicacion, DatosCostosAplicacion } from './costosTipos.ts';
import type { ConsultaCantidadesAplicacion, DatosCantidadesAplicacion } from './cantidadesTipos.ts';
export const BASES_FECHA_APLICACIONES = ['fecha_inicio_planeada', 'fecha_movimiento', 'fecha_cierre_operativo', 'sin_precisar', 'cierre_administrativo'] as const;
export type BaseFechaAplicaciones = typeof BASES_FECHA_APLICACIONES[number];
export const ESTADOS_APLICACION = ['Calculada', 'En ejecución', 'Cerrada'] as const;
export type EstadoAplicacion = typeof ESTADOS_APLICACION[number];
export interface ConsultaAplicaciones {
  desde: string;
  hasta: string;
  base_fecha: BaseFechaAplicaciones;
  aplicacion_ids: string[];
  aplicaciones: string[];
  estados: EstadoAplicacion[];
}
export interface AplicacionInventario {
  id: string;
  codigo_aplicacion?: string | null;
  nombre_aplicacion?: string | null;
  tipo_aplicacion?: string | null;
  estado?: EstadoAplicacion | null;
  fecha_inicio_planeada?: string | null;
  fecha_fin_planeada?: string | null;
  fecha_inicio_ejecucion?: string | null;
  fecha_fin_ejecucion?: string | null;
  tarea_id?: string | null;
}
export interface MovimientoInventario {
  id: string;
  aplicacion_id: string;
  lote_id?: string | null;
  fecha_movimiento?: string | null;
}
export interface CierreInventario {
  id: string;
  aplicacion_id: string;
  fecha_cierre?: string | null;
}
export interface DatosInventarioAplicaciones {
  aplicaciones?: AplicacionInventario[];
  movimientos?: MovimientoInventario[];
  cierres?: CierreInventario[];
}
export interface FuenteAplicaciones {
  leer(base: BaseFechaAplicaciones): Promise<DatosInventarioAplicaciones>;
  leerLaborAplicacion?(consulta: ConsultaLaborAplicacion): Promise<DatosLaborAplicacion>;
  leerCantidades?(consulta: ConsultaCantidadesAplicacion): Promise<DatosCantidadesAplicacion>;
  leerCostos?(consulta: ConsultaCostosAplicacion): Promise<DatosCostosAplicacion>;
}
export interface ResultadoAplicaciones {
  tipo: 'aplicaciones';
  id: string;
  estado: 'ok' | 'vacio_verificado' | 'no_disponible' | 'no_resuelto' | 'aclaracion' | 'no_soportada';
  consulta: ConsultaAplicaciones;
  filas: (AplicacionInventario & { fechas_seleccion: string[] })[];
  conteo: number | null;
  excluidos: { sin_fecha: number; sin_cierre: number; sin_estado: number };
  motivo?: 'fuente_no_disponible' | 'fecha_no_leida' | 'estado_no_leido' | 'identidad_no_disponible' | 'seleccion_no_resuelta' | 'base_sin_precisar' | 'cierre_administrativo_no_registrado';
  fuente: 'lecturas_independientes';
  requiere_eleccion?: boolean;
  fechas_futuras?: boolean;
}
export const esUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
