// shared.ts
// Shared types used across multiple modules (aplicaciones, labores, finanzas, etc.)

// ============================================================================
// EMPLOYEE TYPES
// ============================================================================

export interface Empleado {
  id?: string;
  nombre: string;
  cargo?: string;
  estado: 'Activo' | 'Inactivo';
  // Identity & contact
  cedula?: string;
  telefono?: string;
  email?: string;
  // Contract details
  tipo_contrato?: string;
  fecha_inicio_contrato?: string;
  fecha_fin_contrato?: string;
  periodicidad_pago?: string;
  // Compensation
  salario?: number;
  prestaciones_sociales?: number;
  auxilios_no_salariales?: number;
  horas_semanales?: number;
  // Payment info
  medio_pago?: string;
  banco?: string;
  numero_cuenta?: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// CONTRACTOR TYPES
// ============================================================================

export interface Contratista {
  id?: string;
  nombre: string;
  tipo_contrato: 'Jornal' | 'Contrato';
  tarifa_jornal: number;           // Daily rate
  cedula?: string;
  telefono?: string;
  estado: 'Activo' | 'Inactivo';
  fecha_inicio?: string;
  fecha_fin?: string;
  observaciones?: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// DISCRIMINATED UNION FOR TYPE-SAFE WORKER HANDLING
// ============================================================================

// Trabajador = Employee OR Contractor
// Use type-safe pattern matching with this discriminated union
export type Trabajador =
  | { type: 'empleado'; data: Empleado }
  | { type: 'contratista'; data: Contratista };

// Helper type guards
export function isEmpleado(trabajador: Trabajador): trabajador is { type: 'empleado'; data: Empleado } {
  return trabajador.type === 'empleado';
}

export function isContratista(trabajador: Trabajador): trabajador is { type: 'contratista'; data: Contratista } {
  return trabajador.type === 'contratista';
}

// Helper to get worker ID
export function getTrabajadorId(trabajador: Trabajador): string | undefined {
  return trabajador.data.id;
}

// Helper to get worker name
export function getTrabajadorNombre(trabajador: Trabajador): string {
  return trabajador.data.nombre;
}

// ============================================================================
// LOTE TYPES
// ============================================================================

export interface Lote {
  id: string;
  nombre: string;
  area_hectareas?: number | null;
  // Agronomic fields (used by configuracion/LotesConfig)
  numero_orden?: number | null;
  arboles_grandes?: number | null;
  arboles_medianos?: number | null;
  arboles_pequenos?: number | null;
  arboles_clonales?: number | null;
  total_arboles?: number | null;
  activo?: boolean | null;
  sublotes?: Sublote[];
  created_at?: string;
  updated_at?: string;
}

export interface Sublote {
  id: string;
  lote_id: string;
  nombre: string;
  area_hectareas?: number;
  // Agronomic fields (used by configuracion/SublotesConfig)
  numero_sublote?: number | null;
  arboles_grandes?: number | null;
  arboles_medianos?: number | null;
  arboles_pequenos?: number | null;
  arboles_clonales?: number | null;
  total_arboles?: number | null;
  created_at?: string;
}

// ============================================================================
// WORK REGISTRATION MATRIX TYPES
// ============================================================================

// Matrix structure: trabajadorId -> loteId -> fraccion (as string)
export type WorkMatrix = Record<string, Record<string, string>>;

// Matrix structure: trabajadorId -> loteId -> observaciones (as string)
export type ObservacionesMatrix = Record<string, Record<string, string>>;

// Fractions of a standard workday (8 hours)
export type FraccionJornal = '0.0' | '0.25' | '0.5' | '0.75' | '1.0';

// Labels for UI display
export const FRACCION_JORNAL_LABELS: Record<FraccionJornal, string> = {
  '0.0': 'No trabajó (0h)',
  '0.25': '1/4 jornal (2h)',
  '0.5': '1/2 jornal (4h)',
  '0.75': '3/4 jornal (6h)',
  '1.0': 'Jornal completo (8h)',
};
