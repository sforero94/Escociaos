// Types for Production/Harvest Module

// ============================================================================
// BASE TYPES
// ============================================================================

export type CosechaTipo = 'Principal' | 'Traviesa';
export type MetricaProduccion = 'kg_totales' | 'kg_por_arbol' | 'ton_por_ha';

// ============================================================================
// DATABASE ENTITY TYPES
// ============================================================================

export interface Produccion {
  id: string;
  lote_id: string;
  sublote_id: string | null;
  ano: number;
  cosecha_tipo: CosechaTipo;
  kg_totales: number;
  arboles_registrados: number;
  kg_por_arbol: number; // Generated column
  observaciones?: string;
  created_at: string;
  updated_at: string;
  // Relations (when joined)
  lote?: LoteProduccion;
  sublote?: SubloteProduccion;
}

export interface LoteProduccion {
  id: string;
  nombre: string;
  area_hectareas: number | null;
  total_arboles: number | null;
  fecha_siembra: string | null;
  activo: boolean;
}

export interface SubloteProduccion {
  id: string;
  nombre: string;
  lote_id: string;
  numero_sublote: number;
  total_arboles: number | null;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

export interface FiltrosProduccion {
  anos: number[];
  cosecha_tipo: CosechaTipo | 'Ambas';
  lote_ids: string[];
  metrica: MetricaProduccion;
}

export const FILTROS_PRODUCCION_DEFAULT: FiltrosProduccion = {
  anos: [2023, 2024, 2025, 2026],
  cosecha_tipo: 'Ambas',
  lote_ids: [],
  metrica: 'kg_totales',
};

// ============================================================================
// KPI TYPES
// ============================================================================

export interface KPIProduccion {
  produccion_total_kg: number;
  rendimiento_promedio_kg_arbol: number;
  ton_por_ha_promedio: number;
  lotes_activos: number;
  periodo: string;
}

// ============================================================================
// CHART DATA TYPES
// ============================================================================

// For Historico LineChart - trends over time by lote
export interface TendenciaHistoricaData {
  cosecha: string; // "P23", "T23", "P24", etc.
  cosecha_label: string; // "Principal 23", "Traviesa 23", etc.
  ano: number;
  tipo: CosechaTipo;
  [loteKey: string]: number | string | CosechaTipo; // Dynamic lote values: PP, ST, AU, etc.
}

// For Sublotes ScatterChart - sublote performance comparison
export interface RendimientoSubloteData {
  sublote_id: string;
  sublote_nombre: string;
  lote_id: string;
  lote_nombre: string;
  lote_color: string;
  kg_totales: number;
  kg_por_arbol: number;
  ton_por_ha: number;
  arboles: number;
  cosecha: string;
}

// For Sublotes Top List
export interface TopSubloteData {
  sublote_id: string;
  sublote_nombre: string;
  lote_nombre: string;
  lote_color: string;
  valor: number;
  metrica: MetricaProduccion;
  ranking: number;
}

// For Edad vs Rendimiento ScatterChart
export interface EdadRendimientoData {
  lote_id: string;
  lote_nombre: string;
  lote_codigo: string;
  lote_color: string;
  edad_anos: number;
  rendimiento: number;
  arboles: number;
}

// ============================================================================
// FORM TYPES
// ============================================================================

export interface ProduccionFormData {
  lote_id: string;
  sublote_id?: string;
  ano: number;
  cosecha_tipo: CosechaTipo;
  kg_totales: number;
  arboles_registrados: number;
  observaciones?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const ANOS_DISPONIBLES = [2023, 2024, 2025, 2026];

export const COSECHAS_ORDEN: string[] = [
  'P23',
  'T23',
  'P24',
  'T24',
  'P25',
  'T25',
  'P26',
];

// Lote colors for charts (from prototype)
export const LOT_COLORS: Record<string, string> = {
  PP: '#10b981', // green - Piedra Paula
  ST: '#3b82f6', // blue - Salto Tequendama
  AU: '#f59e0b', // amber - Australia
  LV: '#8b5cf6', // purple - La Vega
  UN: '#ec4899', // pink - La Union
  PG: '#6366f1', // indigo - Pedregal
  IR: '#ef4444', // red - Irlanda
  AC: '#14b8a6', // teal - Acueducto
};

// Full lote names
export const LOT_NAMES: Record<string, string> = {
  PP: 'Piedra Paula',
  ST: 'Salto Tequendama',
  AU: 'Australia',
  LV: 'La Vega',
  UN: 'La Union',
  PG: 'Pedregal',
  IR: 'Irlanda',
  AC: 'Acueducto',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get lote code from full name (e.g., "Piedra Paula" -> "PP")
 */
export function getLoteCode(nombreLote: string): string {
  const normalized = nombreLote.toLowerCase();
  if (normalized.includes('piedra') || normalized.includes('pp')) return 'PP';
  if (normalized.includes('salto') || normalized.includes('tequendama') || normalized.includes('st'))
    return 'ST';
  if (normalized.includes('australia') || normalized.includes('au')) return 'AU';
  if (normalized.includes('vega') || normalized.includes('lv')) return 'LV';
  if (normalized.includes('union') || normalized.includes('un')) return 'UN';
  if (normalized.includes('pedregal') || normalized.includes('pg')) return 'PG';
  if (normalized.includes('irlanda') || normalized.includes('ir')) return 'IR';
  if (normalized.includes('acueducto') || normalized.includes('ac')) return 'AC';
  return nombreLote.substring(0, 2).toUpperCase();
}

/**
 * Get color for lote by name
 */
export function getLoteColor(nombreLote: string): string {
  const code = getLoteCode(nombreLote);
  return LOT_COLORS[code] || '#6b7280'; // gray default
}

/**
 * Format cosecha label (e.g., 2023, "Principal" -> "P23")
 */
export function formatCosechaCode(ano: number, tipo: CosechaTipo): string {
  const tipoAbrev = tipo === 'Principal' ? 'P' : 'T';
  return `${tipoAbrev}${String(ano).slice(-2)}`;
}

/**
 * Format cosecha label for display (e.g., 2023, "Principal" -> "Principal 23")
 */
export function formatCosechaLabel(ano: number, tipo: CosechaTipo): string {
  return `${tipo} ${String(ano).slice(-2)}`;
}

/**
 * Parse cosecha code back to components (e.g., "P23" -> { ano: 2023, tipo: "Principal" })
 */
export function parseCosechaCode(
  code: string
): { ano: number; tipo: CosechaTipo } | null {
  const match = code.match(/^([PT])(\d{2})$/);
  if (!match) return null;
  return {
    ano: 2000 + parseInt(match[2]),
    tipo: match[1] === 'P' ? 'Principal' : 'Traviesa',
  };
}

// Metric labels for UI
export const METRICA_LABELS: Record<MetricaProduccion, string> = {
  kg_totales: 'KG Totales',
  kg_por_arbol: 'KG/Arbol',
  ton_por_ha: 'Ton/Ha',
};

// Metric units for formatting
export const METRICA_UNITS: Record<MetricaProduccion, string> = {
  kg_totales: 'kg',
  kg_por_arbol: 'kg/arbol',
  ton_por_ha: 'ton/ha',
};

/**
 * Format metric value with appropriate precision and unit
 */
export function formatMetricValue(
  value: number,
  metrica: MetricaProduccion
): string {
  switch (metrica) {
    case 'kg_totales':
      return `${value.toLocaleString('es-CO', { maximumFractionDigits: 0 })} kg`;
    case 'kg_por_arbol':
      return `${value.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg/arbol`;
    case 'ton_por_ha':
      return `${value.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ton/ha`;
    default:
      return value.toLocaleString('es-CO');
  }
}
