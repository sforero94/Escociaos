// Types for Financial Flows Module

// Business Units
export interface Negocio {
  id: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

// Regions
export interface Region {
  id: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

// Payment Methods
export interface MedioPago {
  id: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

// Expense Categories
export interface CategoriaGasto {
  id: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

// Expense Concepts
export interface ConceptoGasto {
  id: string;
  nombre: string;
  descripcion?: string;
  categoria_id: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
  categoria?: CategoriaGasto;
}

// Providers
export interface Proveedor {
  id: string;
  nombre: string;
  nit?: string;
  telefono?: string;
  email?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
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
  descripcion?: string;
  negocio_id: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
  negocio?: Negocio;
}

// Buyers
export interface Comprador {
  id: string;
  nombre: string;
  telefono?: string;
  email?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
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