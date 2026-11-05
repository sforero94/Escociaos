import type { AplicacionInventario } from './aplicacionesTipos.ts';
export interface ConsultaCantidadesAplicacion {
  aplicacion_id?: string;
  aplicacion?: string;
  desde?: string;
  hasta?: string;
}
type NumeroFuente = number | null | undefined;
export interface MezclaCantidad { id: string; aplicacion_id: string; numero_mezcla?: NumeroFuente; nombre_mezcla?: string | null }
export interface CalculoCantidad {
  id: string; aplicacion_id: string; lote_id: string; mezcla_id?: string | null;
  total_arboles?: NumeroFuente; numero_canecas?: NumeroFuente; litros_mezcla?: NumeroFuente; numero_bultos?: NumeroFuente; kilos_totales?: NumeroFuente;
}
export interface BaseLoteCantidad {
  id: string; aplicacion_id: string; lote_id: string;
  arboles_grandes?: NumeroFuente; arboles_medianos?: NumeroFuente; arboles_pequenos?: NumeroFuente; arboles_clonales?: NumeroFuente;
  total_arboles?: NumeroFuente; calibracion_litros_arbol?: NumeroFuente; tamano_caneca?: NumeroFuente;
}
export interface ProductoPlanCantidad {
  id: string; mezcla_id: string; producto_id: string;
  producto_nombre?: string | null; producto_unidad?: string | null; cantidad_total_necesaria?: NumeroFuente;
  dosis_por_caneca?: NumeroFuente; unidad_dosis?: string | null;
  dosis_grandes?: NumeroFuente; dosis_medianos?: NumeroFuente; dosis_pequenos?: NumeroFuente; dosis_clonales?: NumeroFuente;
}
export interface MovimientoCantidad {
  id: string; aplicacion_id: string; lote_id?: string | null; fecha_movimiento?: string | null;
  numero_canecas?: NumeroFuente; numero_bultos?: NumeroFuente;
}
export interface ProductoEjecutadoCantidad {
  id: string; movimiento_diario_id: string; producto_id: string;
  producto_nombre?: string | null; cantidad_utilizada?: NumeroFuente; unidad?: string | null;
}
export interface DatosCantidadesAplicacion {
  seleccion: 'ok' | 'no_leido' | 'no_resuelto';
  aplicacion?: AplicacionInventario;
  mezclas?: MezclaCantidad[];
  calculos?: CalculoCantidad[];
  bases_lotes?: BaseLoteCantidad[];
  productos_plan?: ProductoPlanCantidad[];
  movimientos?: MovimientoCantidad[];
  productos_ejecutados?: ProductoEjecutadoCantidad[];
  lotes?: { id: string; nombre?: string | null }[];
}
export type UnidadCantidad = 'kg' | 'L' | 'unidades';
/** `no_concilia`: the per-lot calculation exists but its sum does not match the saved total, so it is never published as exact. */
export type EstadoCantidad = 'conocido' | 'sin_dato' | 'no_leido' | 'incompatible' | 'no_concilia';
export interface CantidadPorLote {
  lote_id: string | null;
  producto_id: string;
  unidad: UnidadCantidad | null;
  cantidad: number | null;
  estado: EstadoCantidad;
  producto_nombre?: string | null;
  lote_nombre?: string | null;
  motivos: string[];
  fuentes: string[];
}
export interface TotalProductoGuardado {
  mezcla_id: string; producto_id: string; unidad: UnidadCantidad | null; cantidad: number | null;
  estado: EstadoCantidad; motivos: string[];
  producto_nombre?: string | null; mezcla_nombre?: string | null;
}
export interface ConciliacionMezcla {
  mezcla_id: string; producto_id: string; unidad: UnidadCantidad | null;
  guardado: number | null; reconstruido: number | null;
  estado: 'coincide' | 'discrepancia' | 'no_verificable';
  producto_nombre?: string | null; mezcla_nombre?: string | null;
}
export interface RecipienteGuardado {
  lote_id: string | null;
  lote_nombre?: string | null;
  unidad: 'canecas' | 'bultos' | null;
  cantidad: number | null;
  estado: EstadoCantidad;
  mezcla_litros_kilos?: { unidad: 'L de mezcla' | 'kg de mezcla'; cantidad: number | null; estado: EstadoCantidad };
  motivos: string[];
  fuentes: string[];
}
export type UnidadResumenCantidad = UnidadCantidad | 'canecas' | 'bultos' | 'L de mezcla' | 'kg de mezcla' | null;
export type EstadoResumenCantidad = EstadoCantidad | 'parcial';
export interface TotalResumenCantidad {
  unidad: UnidadResumenCantidad;
  /** A complete amount; a valid stored plan remains available when reconstruction does not reconcile. */
  cantidad: number | null;
  /** Explicit known subtotal, never promoted to a complete amount if another contribution is missing. */
  subtotal_conocido: number | null;
  estado: EstadoResumenCantidad;
  motivos: string[];
  fuentes: string[];
}
export interface ProductoResumenCantidad extends TotalResumenCantidad {
  producto_id: string;
  producto_nombre?: string | null;
  unidad: UnidadCantidad | null;
}
export interface BloqueResumenCantidades {
  estado: 'conocido' | 'parcial' | 'no_leido' | 'sin_filas' | 'sin_movimientos' | 'sin_productos';
  productos: ProductoResumenCantidad[];
  recipientes: TotalResumenCantidad[];
  mezcla: TotalResumenCantidad[];
}
export interface ResumenCantidadesAplicacion { plan: BloqueResumenCantidades; ejecucion: BloqueResumenCantidades }
export interface ResultadoCantidadesAplicacion {
  tipo: 'cantidades_aplicacion'; id: string;
  estado: 'ok' | 'parcial' | 'no_disponible' | 'no_resuelto';
  consulta: ConsultaCantidadesAplicacion;
  aplicacion?: AplicacionInventario;
  /** `avisos` are disclosed method notes that do not block a quantity (e.g. `equivalencia_cc_g:<producto_id>`). */
  plan: { estado: 'conocido' | 'parcial' | 'no_leido' | 'sin_filas'; filas: CantidadPorLote[]; totales_guardados: TotalProductoGuardado[]; conciliacion: ConciliacionMezcla[]; recipientes: RecipienteGuardado[]; motivos: string[]; avisos: string[] };
  ejecucion: { estado: 'conocido' | 'parcial' | 'no_leido' | 'sin_movimientos' | 'sin_productos'; filas: CantidadPorLote[]; recipientes: RecipienteGuardado[]; motivos: string[] };
  /** Aggregate only the already validated source of each metric; never a join to product/lot fan-out. */
  resumen?: ResumenCantidadesAplicacion;
  fuente: 'lecturas_independientes';
}
