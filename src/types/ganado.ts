// Tipos del módulo de inventario de ganado (issue #51)
// Jerarquía: Ubicación → Finca (hectáreas) → Potrero → Inventario

export type TipoMovimientoGanado =
  | 'compra'
  | 'venta'
  | 'muerte'
  | 'traslado_entrada'
  | 'traslado_salida'
  | 'ajuste';

export type EstadoMovimientoGanado = 'pendiente' | 'confirmado' | 'descartado';

export interface GanUbicacion {
  id: string;
  nombre: string;
}

export interface GanFinca {
  id: string;
  nombre: string;
  ubicacion_id: string | null;
  hectareas: number;
  activa: boolean;
}

export interface GanPotrero {
  id: string;
  nombre: string;
  finca_id: string;
  activo: boolean;
}

export interface GanInventario {
  id: string;
  potrero_id: string;
  novillos: number;
  toros: number;
  peso_promedio_kg: number | null;
  updated_at: string;
}

export interface GanMovimiento {
  id: string;
  tipo: TipoMovimientoGanado;
  estado: EstadoMovimientoGanado;
  fecha: string;
  potrero_origen_id: string | null;
  potrero_destino_id: string | null;
  novillos_delta: number;
  toros_delta: number;
  peso_promedio_kg: number | null;
  transaccion_ganado_id: string | null;
  notas: string | null;
  created_at: string;
  created_by: string | null;
}

// Fila desnormalizada del inventario actual (potrero + finca + ubicación)
export interface InventarioPotreroRow {
  potrero_id: string;
  potrero: string;
  finca_id: string;
  finca: string;
  ubicacion_id: string | null;
  ubicacion: string;
  hectareas: number;
  novillos: number;
  toros: number;
  peso_promedio_kg: number | null;
  updated_at: string | null;
}

// Movimiento con nombres de potrero/finca resueltos para el log
export interface MovimientoConContexto extends GanMovimiento {
  potrero_origen: string | null;
  finca_origen: string | null;
  potrero_destino: string | null;
  finca_destino: string | null;
}

export interface KPIsInventarioGanado {
  totalCabezas: number;
  totalNovillos: number;
  totalToros: number;
  hectareasTotales: number;
  cabezasPorHa: number | null;
  porUbicacion: {
    ubicacion: string;
    cabezas: number;
    hectareas: number;
    cabezasPorHa: number | null;
  }[];
}

export interface VariacionInventario {
  entradas: number;
  salidas: number;
  neto: number;
}
