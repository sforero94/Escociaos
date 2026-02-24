// utils/calculosReporteAplicacion.ts
// Utility functions for closed application reports

import type { TipoAplicacion } from '../types/aplicaciones';

// ============================================================================
// DEVIATION & COMPARISON CALCULATIONS
// ============================================================================

/**
 * Calculate percentage deviation between planned and actual values
 * Returns: (real - planeado) / planeado * 100
 */
export function calcularDesviacion(planeado: number, real: number): number {
  if (planeado === 0) return real === 0 ? 0 : 100;
  return ((real - planeado) / planeado) * 100;
}

/**
 * Calculate percentage change between current and previous values
 * Returns: (actual - anterior) / anterior * 100
 */
export function calcularCambio(actual: number, anterior: number | null | undefined): number | undefined {
  if (anterior === null || anterior === undefined || anterior === 0) return undefined;
  return ((actual - anterior) / anterior) * 100;
}

/**
 * Format deviation as string with arrow and percentage
 * @param value - The percentage deviation
 * @param invertSign - If true, negative is good (e.g., for costs)
 */
export function formatearDesviacion(value: number, invertSign: boolean = false): { 
  text: string; 
  isPositive: boolean; 
  arrow: '↑' | '↓' | '→';
} {
  const absValue = Math.abs(value);
  const isUp = value > 0;
  
  // Determine if the change is positive (good) or negative (bad)
  // For costs: going up is bad, going down is good (invert)
  // For efficiency: going up is good, going down is bad (normal)
  const isPositive = invertSign ? !isUp : isUp;
  
  if (absValue < 0.5) {
    return { text: '0%', isPositive: true, arrow: '→' };
  }
  
  const arrow = isUp ? '↑' : '↓';
  const text = `${arrow}${absValue.toFixed(1)}%`;
  
  return { text, isPositive, arrow };
}

// ============================================================================
// VOLUME CONVERSIONS
// ============================================================================

interface CanecasPorTipo {
  canecas20L?: number;
  canecas200L?: number;
  canecas500L?: number;
  canecas1000L?: number;
}

/**
 * Convert canecas of various sizes to total liters
 */
export function convertirCanecasALitros(canecas: CanecasPorTipo): number {
  const litros20 = (canecas.canecas20L || 0) * 20;
  const litros200 = (canecas.canecas200L || 0) * 200;
  const litros500 = (canecas.canecas500L || 0) * 500;
  const litros1000 = (canecas.canecas1000L || 0) * 1000;
  
  return litros20 + litros200 + litros500 + litros1000;
}

/**
 * Convert canecas to 200L equivalent for comparison
 */
export function convertirACanecas200LEquivalente(canecas: CanecasPorTipo): number {
  return convertirCanecasALitros(canecas) / 200;
}

/**
 * Convert bultos (50kg bags) to total kilos
 */
export function convertirBultosAKilos(bultos: number, pesoUnitario: number = 50): number {
  return bultos * pesoUnitario;
}

// ============================================================================
// EFFICIENCY METRICS
// ============================================================================

/**
 * Calculate liters per plant (L/planta)
 */
export function calcularLitrosPorPlanta(litrosTotales: number, totalArboles: number): number {
  if (totalArboles === 0) return 0;
  return litrosTotales / totalArboles;
}

/**
 * Calculate kilos per plant (KG/planta) - for fertilization
 */
export function calcularKilosPorPlanta(kilosTotales: number, totalArboles: number): number {
  if (totalArboles === 0) return 0;
  return kilosTotales / totalArboles;
}

/**
 * Calculate trees per labor day (árboles/jornal)
 */
export function calcularArbolesPorJornal(totalArboles: number, jornales: number): number {
  if (jornales === 0) return 0;
  return totalArboles / jornales;
}

/**
 * Calculate cost per unit ($/L or $/KG)
 */
export function calcularCostoPorUnidad(costoTotal: number, unidadesTotales: number): number {
  if (unidadesTotales === 0) return 0;
  return costoTotal / unidadesTotales;
}

/**
 * Calculate cost per tree ($/árbol)
 */
export function calcularCostoPorArbol(costoTotal: number, totalArboles: number): number {
  if (totalArboles === 0) return 0;
  return costoTotal / totalArboles;
}

// ============================================================================
// CHART DATA TRANSFORMATIONS
// ============================================================================

export interface DatosGraficoLote {
  lote: string;
  planeado: number;
  real: number;
  anterior?: number;
}

export interface DatosGraficoCostoHistorico {
  aplicacion: string;
  costoTotal: number;
  costoProductos: number;
  costoJornales: number;
}

/**
 * Transform lot comparison data for grouped horizontal bar charts
 */
export function prepararDatosGraficoLotes(
  datos: Map<string, { planeado: number; real: number; anterior?: number }>,
  ordenLotes?: string[]
): DatosGraficoLote[] {
  const lotes = ordenLotes || Array.from(datos.keys());
  
  return lotes.map(lote => {
    const valores = datos.get(lote) || { planeado: 0, real: 0 };
    return {
      lote,
      planeado: valores.planeado,
      real: valores.real,
      anterior: valores.anterior,
    };
  });
}

/**
 * Transform historical cost data for trend charts
 */
export function prepararDatosGraficoCostos(
  aplicaciones: Array<{
    nombre: string;
    costoTotal: number;
    costoProductos: number;
    costoJornales: number;
  }>
): DatosGraficoCostoHistorico[] {
  return aplicaciones.map(app => ({
    aplicacion: app.nombre,
    costoTotal: app.costoTotal,
    costoProductos: app.costoProductos,
    costoJornales: app.costoJornales,
  }));
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format number as Colombian currency
 */
export function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor);
}

/**
 * Format number with locale-specific separators
 */
export function formatearNumero(valor: number, decimales: number = 2): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  }).format(valor);
}

/**
 * Get the primary unit label based on application type
 */
export function obtenerUnidadPrincipal(tipo: TipoAplicacion): { 
  volumen: string; 
  eficiencia: string;
} {
  if (tipo === 'Fertilización') {
    return { volumen: 'KG', eficiencia: 'KG/planta' };
  }
  return { volumen: 'L', eficiencia: 'L/planta' };
}

/**
 * Get the container label based on application type
 */
export function obtenerNombreContenedor(tipo: TipoAplicacion): string {
  if (tipo === 'Fertilización') {
    return 'Bultos';
  }
  return 'Canecas';
}
