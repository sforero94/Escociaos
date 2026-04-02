// Types for Financial Flows Module

// Business Units
export interface Negocio {
  id: string;
  nombre: string;
  descripcion?: string | null;
  activo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

// Regions
export interface Region {
  id: string;
  nombre: string;
  descripcion?: string | null;
  activo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

// Payment Methods
export interface MedioPago {
  id: string;
  nombre: string;
  descripcion?: string | null;
  activo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

// Expense Categories
export interface CategoriaGasto {
  id: string;
  nombre: string;
  descripcion?: string | null;
  orden?: number | null;
  activo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

// Expense Concepts
export interface ConceptoGasto {
  id: string;
  nombre: string;
  descripcion?: string | null;
  categoria_id: string;
  activo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  categoria?: CategoriaGasto;
}

// Providers
export interface Proveedor {
  id: string;
  nombre: string;
  nit?: string | null;
  telefono?: string | null;
  email?: string | null;
  activo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

// Expense
export interface Gasto {
  id: string;
  fecha: string;
  negocio_id: string;
  region_id: string;
  categoria_id: string;
  concepto_id: string;
  nombre: string;
  proveedor_id?: string;
  valor: number;
  medio_pago_id: string;
  observaciones?: string;
  estado: 'Pendiente' | 'Confirmado';
  url_factura?: string;
  created_at: string;
  updated_at: string;
  // Relations
  negocio?: Negocio;
  region?: Region;
  categoria?: CategoriaGasto;
  concepto?: ConceptoGasto;
  proveedor?: Proveedor;
  medio_pago?: MedioPago;
}

// Income Categories
export interface CategoriaIngreso {
  id: string;
  nombre: string;
  descripcion?: string | null;
  negocio_id: string;
  activo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  negocio?: Negocio;
}

// Buyers
export interface Comprador {
  id: string;
  nombre: string;
  nit?: string | null;
  telefono?: string | null;
  email?: string | null;
  activo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

// Income
export interface Ingreso {
  id: string;
  fecha: string;
  negocio_id: string;
  region_id: string;
  categoria_id: string;
  nombre: string;
  comprador_id?: string;
  valor: number;
  medio_pago_id: string;
  observaciones?: string;
  url_factura?: string;
  cantidad?: number;
  precio_unitario?: number;
  cosecha?: string;
  alianza?: string;
  cliente?: string;
  finca?: string;
  created_at: string;
  updated_at: string;
  // Relations
  negocio?: Negocio;
  region?: Region;
  categoria?: CategoriaIngreso;
  comprador?: Comprador;
  medio_pago?: MedioPago;
}

// Filter types
export interface FiltrosFinanzas {
  fecha_desde?: string;
  fecha_hasta?: string;
  negocio_id?: string | string[];
  region_id?: string | string[];
  periodo?: 'mes_actual' | 'trimestre' | 'ytd' | 'ano_anterior' | 'rango_personalizado';
}

// KPI Data
export interface KPIData {
  ingresos_total: number;
  gastos_total: number;
  flujo_neto: number;
  margen_porcentaje: number;
  periodo: string;
}

// Chart Data
export interface TendenciaData {
  fecha: string;
  ingresos: number;
  gastos: number;
}

export interface DistribucionData {
  categoria: string;
  categoria_id: string;
  valor: number;
  porcentaje: number;
}

// Form types
export interface GastoFormData {
  fecha: string;
  negocio_id: string;
  region_id: string;
  categoria_id: string;
  concepto_id: string;
  nombre: string;
  proveedor_id?: string;
  valor: number;
  medio_pago_id: string;
  observaciones?: string;
  url_factura?: string;
}

export interface IngresoFormData {
  fecha: string;
  negocio_id: string;
  region_id: string;
  categoria_id: string;
  nombre: string;
  comprador_id?: string;
  valor: number;
  medio_pago_id: string;
  observaciones?: string;
  url_factura?: string;
}

// Report types
export interface ReportePyG {
  ingresos: {
    total: number;
    por_negocio: Array<{
      negocio: string;
      total: number;
      categorias: Array<{
        categoria: string;
        total: number;
      }>;
    }>;
  };
  gastos: {
    total: number;
    por_categoria: Array<{
      categoria: string;
      total: number;
    }>;
  };
  utilidad_operativa: number;
  comparativo?: {
    periodo_anterior: {
      ingresos: number;
      gastos: number;
      utilidad: number;
    };
    variacion_porcentaje: {
      ingresos: number;
      gastos: number;
      utilidad: number;
    };
    variacion_valor: {
      ingresos: number;
      gastos: number;
      utilidad: number;
    };
  };
}

// Export types
export interface ExportOptions {
  formato: 'pdf' | 'excel';
  periodo: string;
  incluir_comparativo: boolean;
}

// Dashboard types
export type DashboardTab = 'general' | 'aguacate' | 'hato' | 'ganado' | 'caballos' | 'agricola';

export type DashboardPeriodo = 'mes_actual' | 'trimestre' | 'ytd' | 'ano_anterior' | 'rango_personalizado';

export interface KPIConVariacion {
  valor: number;
  variacion_porcentaje: number;
  periodo_label: string;
}

export interface PivotRow {
  negocio: string;
  negocio_id: string;
  ytd_actual: number;
  ytd_anterior: number;
  total_anterior: number;
  total_n2: number;
  categorias?: PivotRow[];
}

export interface DatoTrimestral {
  trimestre: string;
  valor: number;
}

export interface DatoTrimestralMultiSerie {
  trimestre: string;
  [negocio: string]: number | string;
}

export interface TransaccionGanado {
  id: string;
  fecha: string;
  tipo: 'compra' | 'venta';
  finca?: string;
  cliente_proveedor?: string;
  cantidad_cabezas: number;
  kilos_pagados?: number;
  precio_kilo?: number;
  valor_total: number;
  observaciones?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface ColumnDef {
  key: string;
  label: string;
  sortable?: boolean;
  format?: 'currency' | 'number' | 'date' | 'text';
}

export interface NegocioDashboardConfig {
  slug: string;
  nombre: string;
  negocio_nombre: string;
  ingresos_columns: ColumnDef[];
  donut_label: string;
}

export type GanadoChartMode = 'dinero' | 'kilos';

export type UnifiedFinanceItem =
  | { source: 'gasto'; id: string; fecha: string; nombre: string; valor: number; details: string; estado: string; raw: Gasto }
  | { source: 'ingreso'; id: string; fecha: string; nombre: string; valor: number; details: string; raw: Ingreso }
  | { source: 'ganado'; id: string; fecha: string; nombre: string; valor: number; details: string; raw: TransaccionGanado };

// Batch registration — Gastos
export interface BatchRowData {
  id: string;
  fecha: string;
  nombre: string;
  valor: string;
  negocio_id: string;
  region_id: string;
  categoria_id: string;
  concepto_id: string;
  proveedor_id: string;
  medio_pago_id: string;
  observaciones: string;
  factura_file: File | null;
  factura_uploaded: boolean;
}

// Batch registration — Ingresos
export interface BatchRowDataIngreso {
  id: string;
  fecha: string;
  nombre: string;
  valor: string;
  negocio_id: string;
  region_id: string;
  categoria_id: string;
  comprador_id: string;
  medio_pago_id: string;
  observaciones: string;
  factura_file: File | null;
  factura_uploaded: boolean;
}

// ── Budget (Presupuesto) ─────────────────────────────────────────

/** DB row in fin_presupuestos */
export interface Presupuesto {
  id: string;
  anio: number;
  negocio_id: string;
  categoria_id: string;
  concepto_id: string;
  monto_anual: number;
  is_principal: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

/** Concepto-level row in the budget comparison table */
export interface PresupuestoRow {
  categoria_id: string;
  categoria_nombre: string;
  concepto_id: string;
  concepto_nombre: string;
  is_principal: boolean;
  presupuesto_id?: string;
  monto_anual: number;
  monto_trimestral: number;
  pct_presupuesto: number;
  actual_q: number;
  pct_actual: number;
  ejecucion_vs_q: number | null;
  ejecucion_vs_anio: number | null;
  actual_q_anterior: number;
  variacion_yoy: number | null;
  actual_anio_anterior: number;
}

/** Category aggregate row */
export interface PresupuestoCategoriaRow {
  categoria_id: string;
  categoria_nombre: string;
  conceptos: PresupuestoRow[];
  monto_anual: number;
  monto_trimestral: number;
  actual_q: number;
  pct_presupuesto: number;
  pct_actual: number;
  ejecucion_vs_q: number | null;
  ejecucion_vs_anio: number | null;
  actual_q_anterior: number;
  variacion_yoy: number | null;
  actual_anio_anterior: number;
}

/** Full page data returned by usePresupuestoData */
export interface PresupuestoData {
  categorias: PresupuestoCategoriaRow[];
  totals: {
    monto_anual: number;
    monto_trimestral: number;
    actual_q: number;
    ejecucion_vs_q: number | null;
    ejecucion_vs_anio: number | null;
    actual_q_anterior: number;
    variacion_yoy: number | null;
    actual_anio_anterior: number;
  };
}