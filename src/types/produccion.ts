// Types for Production/Harvest Module

// ============================================================================
// BASE TYPES
// ============================================================================

export type CosechaTipo = 'Principal' | 'Traviesa';
export type MetricaProduccion = 'kg_totales' | 'kg_por_arbol' | 'ton_por_ha';
export type VistaProduccion = 'una' | 'varias';

/** Identidad de campaña independiente del año de movimiento. */
export interface CosechaIdentidad {
  /** Clave estable: "Principal:2027" */
  key: string;
  tipo: CosechaTipo;
  /** Año de la campaña (nombre), no del movimiento. */
  ano: number;
  label: string;
  code: string;
}

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
  /** KG destinados a exportación. NULL en registros históricos sin desglose de calidad. */
  kg_exportacion?: number | null;
  /** KG destinados a mercado nacional. NULL en registros históricos sin desglose de calidad. */
  kg_nacional?: number | null;
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

/**
 * Filtros del tablero analítico (#463).
 * - `anos_movimiento`: años calendario del movimiento (no del nombre de campaña).
 * - `cosecha_keys`: identidades "Principal:2027" / "Traviesa:2026".
 * - `anos` / `cosecha_tipo` se conservan como proyección para Rentabilidad y
 *   consultas que aún filtran por columnas de campaña.
 */
export interface FiltrosProduccion {
  vista: VistaProduccion;
  /** Años calendario de movimiento seleccionados. Vacío = sin restricción. */
  anos_movimiento: number[];
  /** Identidades de cosecha seleccionadas. Vacío = todas las compatibles. */
  cosecha_keys: string[];
  lote_ids: string[];
  metrica: MetricaProduccion;
  /**
   * Años de campaña derivados (produccion.ano). Se recalculan al resolver
   * cosechas; se mantienen en el estado para consumidores legacy (Rentabilidad).
   */
  anos: number[];
  /** Compat: 'Ambas' si hay varios tipos; si no, el tipo único. */
  cosecha_tipo: CosechaTipo | 'Ambas';
}

export const FILTROS_PRODUCCION_DEFAULT: FiltrosProduccion = {
  vista: 'una',
  anos_movimiento: [],
  cosecha_keys: [],
  lote_ids: [],
  metrica: 'kg_totales',
  anos: [],
  cosecha_tipo: 'Ambas',
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
  /** KG destinados a exportación. Debe satisfacer kg_exportacion + kg_nacional = kg_totales cuando ambos son non-null. */
  kg_exportacion?: number | null;
  /** KG destinados a mercado nacional. */
  kg_nacional?: number | null;
  observaciones?: string;
}

// ============================================================================
// COST ENGINE TYPES
// ============================================================================

/** Insumos consumidos en movimientos_diarios_productos para un lote en un año. */
export interface InsumoLoteAnual {
  lote_id: string;
  /** Costo total de insumos (cantidad_utilizada × precio_unitario del producto). */
  costo_insumos: number;
}

/** Mano de obra de registros_trabajo para un lote en un año. */
export interface LaborLoteAnual {
  lote_id: string;
  /** Suma de costo_jornal de registros_trabajo con lote_id asignado. */
  costo_labor: number;
  /** Suma de fraccion_jornal. */
  jornales: number;
}

/** Gasto overhead de la finca (fin_gastos Confirmado, negocio Aguacate Hass,
 *  excluyendo categorías que ya se cuentan como costo directo). */
export interface OverheadFarmaAnual {
  ano: number;
  total: number;
}

/** Info básica de un lote necesaria para el cálculo de costos. */
export interface LoteInfoCosto {
  id: string;
  nombre: string;
  /** Ároles totales (GENERATED column en DB). NULL o 0 → excluir de asignación overhead. */
  total_arboles: number;
  /**
   * `lotes.activo`. Ausente = activo (lectura degradada mientras la migración 181
   * no esté aplicada: sólo se leen lotes activos).
   */
  activo?: boolean;
  /**
   * `lotes.fecha_erradicacion` (AAAA-MM-DD). NULL/ausente = sin fecha conocida.
   * Decide los días activos del lote en el prorrateo por árbol-día (ESCO-139).
   */
  fecha_erradicacion?: string | null;
}

/** Período cerrado [inicio, fin], ambas fechas AAAA-MM-DD inclusive. */
export interface PeriodoCosto {
  inicio: string;
  fin: string;
}

/** Resultado de costo por lote para un año. */
export interface CostoLoteAnual {
  lote_id: string;
  lote_nombre: string;
  ano: number;
  arboles: number;
  /** Σ costo_jornal de registros_trabajo lote-tagged del año. */
  costo_labor: number;
  /** Σ cantidad_utilizada × precio_unitario de insumos lote-tagged del año. */
  costo_insumos: number;
  /** costo_labor + costo_insumos */
  costo_directo: number;
  /** Porción del overhead de finca asignada a este lote (por proporción de árboles). */
  overhead_asignado: number;
  /** costo_directo + overhead_asignado */
  costo_total: number;
}

/** Resultado de costo/kg para un lote y año específico. */
export interface CostoKgResult {
  lote_id: string;
  lote_nombre: string;
  ano: number;
  /** null cuando kg_totales <= 0 o arboles <= 0 */
  costo_kg: number | null;
  costo_total: number;
  kg_totales: number;
  /** Desglose por cosecha (Principal/Traviesa) cuando hay datos de producción para ambas. */
  por_cosecha: CostoKgCosecha[];
}

/** Desglose de costo total por tipo de cosecha, proporcional a los kg. */
export interface CostoKgCosecha {
  cosecha_tipo: CosechaTipo;
  kg: number;
  /** costo_total_lote × (kg_cosecha / kg_totales_lote) */
  costo_asignado: number;
  /** Mismo $/kg que el lote (el split es solo del $ total, no de la tasa). */
  costo_kg: number | null;
}

/** Fallback farm-level cost/kg para años sin desglose por lote (2023–2025). */
export interface CostoKgFarmFallback {
  ano: number;
  /** null si kg_totales_farm <= 0 */
  costo_kg: number | null;
  costo_total_farm: number;
  kg_totales_farm: number;
  /** Indica que es estimación a nivel finca, sin desglose por lote. */
  es_fallback: true;
}

/** Parámetros de entrada para el motor de costo. */
export interface ParametrosCostoKg {
  /** Año a calcular (>= 2026 para costo por lote; años anteriores usan fallback). */
  ano: number;
  /**
   * Nombres de categorías de gastos a EXCLUIR del overhead de finca porque ya
   * se cuentan como costo directo (labor/insumos). Ajustable por el llamador.
   * Default: ['Mano de Obra', 'Alimentos y Fertilizantes', 'Control de Plagas']
   */
  categoriasExcluidas?: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * @deprecated Preferir `derivarAnosMovimiento` / datos vivos. Se mantiene
 * solo como fallback vacío de UI mientras cargan opciones dinámicas.
 */
export const ANOS_DISPONIBLES: number[] = [];

/**
 * @deprecated Preferir `derivarCosechasDisponibles` / orden dinámico.
 */
export const COSECHAS_ORDEN: string[] = [];

/** Colores de serie por cosecha en comparación multicampaña. */
export const COSECHA_SERIES_COLORS = [
  '#73991C', // primary olive
  '#94A3B8', // slate
  '#3B82F6', // blue
  '#D97706', // amber
  '#0F766E', // teal
  '#7C3AED', // violet
] as const;

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
 * Format cosecha code (e.g., 2027, "Principal" -> "P27")
 */
export function formatCosechaCode(ano: number, tipo: CosechaTipo): string {
  const tipoAbrev = tipo === 'Principal' ? 'P' : 'T';
  return `${tipoAbrev}${String(ano).slice(-2)}`;
}

/**
 * Format cosecha label for display (e.g., 2027, "Principal" -> "Principal 2027")
 * Alineado con etiquetas de finanzas / issue #463.
 */
export function formatCosechaLabel(ano: number, tipo: CosechaTipo): string {
  return `${tipo} ${ano}`;
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
