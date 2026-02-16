/**
 * Centralized labor cost calculation utilities
 * Provides consistent cost calculations across the application
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RegistroTrabajoCierre, ResumenLaboresCierre } from '../types/aplicaciones';

export interface CostCalculationParams {
  salary: number;
  benefits: number;
  allowances: number;
  weeklyHours: number;
  fractionWorked: number;
}

export interface CostCalculationResult {
  hourlyRate: number;
  dailyCost: number;
  totalCost: number;
}

/**
 * Standard workday hours (8 hours per jornal)
 */
export const STANDARD_WORKDAY_HOURS = 8;

/**
 * Average weeks per month for monthly salary calculations
 */
export const WEEKS_PER_MONTH = 4.33;

/**
 * Calculate labor costs using standardized formula
 * Formula: (salary + benefits + allowances) / (weeklyHours * WEEKS_PER_MONTH) * 8 * fractionWorked
 * Note: Assumes salary is MONTHLY
 */
export function calculateLaborCost(params: CostCalculationParams): CostCalculationResult {
  const { salary, benefits, allowances, weeklyHours, fractionWorked } = params;

  // Input validation
  if (weeklyHours <= 0) {
    throw new Error('Weekly hours must be greater than 0');
  }

  if (fractionWorked < 0 || fractionWorked > 3) {
    throw new Error('Fraction worked must be between 0 and 3');
  }

  // Calculate hourly rate from MONTHLY salary
  // Convert weekly hours to monthly hours: weeklyHours * 4.33 (average weeks per month)
  const monthlyHours = weeklyHours * WEEKS_PER_MONTH;
  const hourlyRate = (salary + benefits + allowances) / monthlyHours;

  // Calculate daily cost (8 hours)
  const dailyCost = hourlyRate * STANDARD_WORKDAY_HOURS;

  // Calculate total cost for the fraction worked
  const totalCost = dailyCost * fractionWorked;

  return {
    hourlyRate: Math.round(hourlyRate * 100) / 100, // Round to 2 decimal places
    dailyCost: Math.round(dailyCost * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
  };
}

/**
 * Calculate estimated cost for a task based on responsible employee
 */
export function calculateTaskEstimatedCost(
  responsibleSalary: number,
  responsibleBenefits: number,
  responsibleAllowances: number,
  responsibleWeeklyHours: number,
  estimatedJornales: number
): number {
  const costResult = calculateLaborCost({
    salary: responsibleSalary,
    benefits: responsibleBenefits,
    allowances: responsibleAllowances,
    weeklyHours: responsibleWeeklyHours,
    fractionWorked: 1, // Full jornal
  });

  return Math.round(costResult.dailyCost * estimatedJornales * 100) / 100;
}

/**
 * Calculate actual cost from work records
 */
export function calculateActualCostFromRecords(records: Array<{
  costo_jornal: number;
}>): number {
  return records.reduce((total, record) => total + (record.costo_jornal || 0), 0);
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cost);
}

/**
 * Get default values for cost calculations
 */
export const DEFAULT_COST_PARAMS = {
  weeklyHours: 48, // Standard 48 hours per week
  benefits: 0,
  allowances: 0,
} as const;

/**
 * Calculate contractor labor costs using flat jornal rate
 * For contractors, use tarifa_jornal directly instead of salary breakdown
 *
 * @param tarifaJornal - Fixed daily rate for a full jornal (8 hours)
 * @param fractionWorked - Fraction of jornal worked (0.25, 0.5, 0.75, 1.0, etc.)
 * @returns Cost calculation result with hourly rate, daily cost, and total cost
 */
export function calculateContractorCost(
  tarifaJornal: number,
  fractionWorked: number
): CostCalculationResult {
  // Input validation
  if (tarifaJornal < 0) {
    throw new Error('Tarifa jornal must be greater than or equal to 0');
  }

  if (fractionWorked < 0 || fractionWorked > 3) {
    throw new Error('Fraction worked must be between 0 and 3');
  }

  // For contractors, tarifa_jornal is the daily cost for a full jornal
  const dailyCost = tarifaJornal;
  const totalCost = dailyCost * fractionWorked;
  const hourlyRate = dailyCost / STANDARD_WORKDAY_HOURS;

  return {
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    dailyCost: Math.round(dailyCost * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
  };
}

/**
 * Recalculate costo_jornal for a RegistroTrabajoCierre when fraction changes.
 * Uses the worker's stored salary/tarifa data.
 */
export function recalcularCostoJornal(registro: RegistroTrabajoCierre, nuevaFraccion: number): number {
  if (registro.trabajador_tipo === 'contratista' && registro.tarifa_jornal != null) {
    return calculateContractorCost(registro.tarifa_jornal, nuevaFraccion).totalCost;
  }
  if (registro.trabajador_tipo === 'empleado' && registro.salario != null) {
    return calculateLaborCost({
      salary: registro.salario,
      benefits: registro.prestaciones || 0,
      allowances: registro.auxilios || 0,
      weeklyHours: registro.horas_semanales || 48,
      fractionWorked: nuevaFraccion,
    }).totalCost;
  }
  // Fallback: proportional recalculation from existing cost
  if (registro.fraccion_jornal > 0) {
    const costPerUnit = registro.costo_jornal / registro.fraccion_jornal;
    return Math.round(costPerUnit * nuevaFraccion * 100) / 100;
  }
  return 0;
}

/**
 * Fetch registros_trabajo for a given tarea and aggregate for closure review.
 */
export async function fetchRegistrosTrabajoParaCierre(
  supabase: SupabaseClient,
  tareaId: string
): Promise<ResumenLaboresCierre> {
  // Query registros_trabajo with worker and lote info
  const { data: registros, error } = await supabase
    .from('registros_trabajo')
    .select(`
      id,
      tarea_id,
      empleado_id,
      contratista_id,
      lote_id,
      fecha_trabajo,
      fraccion_jornal,
      costo_jornal,
      valor_jornal_empleado,
      observaciones
    `)
    .eq('tarea_id', tareaId)
    .order('fecha_trabajo', { ascending: true });

  if (error) throw new Error(`Error cargando registros de trabajo: ${error.message}`);

  const rows = registros || [];

  // Collect unique IDs for batch lookups
  const empleadoIds = [...new Set(rows.filter(r => r.empleado_id).map(r => r.empleado_id!))];
  const contratistaIds = [...new Set(rows.filter(r => r.contratista_id).map(r => r.contratista_id!))];
  const loteIds = [...new Set(rows.map(r => r.lote_id).filter(Boolean))];

  // Parallel fetch of worker and lote names
  const [empleadosRes, contratistasRes, lotesRes] = await Promise.all([
    empleadoIds.length > 0
      ? supabase.from('empleados').select('id, nombre, salario, prestaciones_sociales, auxilios_no_salariales, horas_semanales').in('id', empleadoIds)
      : { data: [] },
    contratistaIds.length > 0
      ? supabase.from('contratistas').select('id, nombre, tarifa_jornal').in('id', contratistaIds)
      : { data: [] },
    loteIds.length > 0
      ? supabase.from('lotes').select('id, nombre').in('id', loteIds)
      : { data: [] },
  ]);

  const empleadosMap = new Map((empleadosRes.data || []).map((e: any) => [e.id, e]));
  const contratistasMap = new Map((contratistasRes.data || []).map((c: any) => [c.id, c]));
  const lotesMap = new Map((lotesRes.data || []).map((l: any) => [l.id, l.nombre]));

  // Build enriched registros
  const registrosCierre: RegistroTrabajoCierre[] = rows.map(r => {
    const esEmpleado = !!r.empleado_id;
    const empleado = esEmpleado ? empleadosMap.get(r.empleado_id!) : null;
    const contratista = !esEmpleado ? contratistasMap.get(r.contratista_id!) : null;

    return {
      id: r.id,
      tarea_id: r.tarea_id,
      empleado_id: r.empleado_id || undefined,
      contratista_id: r.contratista_id || undefined,
      trabajador_nombre: empleado?.nombre || contratista?.nombre || 'Desconocido',
      trabajador_tipo: esEmpleado ? 'empleado' as const : 'contratista' as const,
      lote_id: r.lote_id,
      lote_nombre: lotesMap.get(r.lote_id) || 'Sin lote',
      fecha_trabajo: r.fecha_trabajo,
      fraccion_jornal: parseFloat(r.fraccion_jornal) || 0,
      costo_jornal: r.costo_jornal || 0,
      observaciones: r.observaciones || undefined,
      // Worker data for recalculations
      salario: empleado?.salario,
      prestaciones: empleado?.prestaciones_sociales,
      auxilios: empleado?.auxilios_no_salariales,
      horas_semanales: empleado?.horas_semanales,
      tarifa_jornal: contratista?.tarifa_jornal,
    };
  });

  // Aggregate by lote
  const porLoteMap = new Map<string, { lote_id: string; lote_nombre: string; total_jornales: number; total_costo: number }>();
  for (const reg of registrosCierre) {
    const existing = porLoteMap.get(reg.lote_id);
    if (existing) {
      existing.total_jornales += reg.fraccion_jornal;
      existing.total_costo += reg.costo_jornal;
    } else {
      porLoteMap.set(reg.lote_id, {
        lote_id: reg.lote_id,
        lote_nombre: reg.lote_nombre,
        total_jornales: reg.fraccion_jornal,
        total_costo: reg.costo_jornal,
      });
    }
  }

  const fechasUnicas = new Set(registrosCierre.map(r => r.fecha_trabajo));
  const trabajadoresUnicos = new Set(
    registrosCierre.map(r => r.empleado_id || r.contratista_id || '')
  );

  return {
    tarea_id: tareaId,
    registros: registrosCierre,
    porLote: Array.from(porLoteMap.values()),
    totalJornales: registrosCierre.reduce((s, r) => s + r.fraccion_jornal, 0),
    totalCosto: registrosCierre.reduce((s, r) => s + r.costo_jornal, 0),
    diasTrabajados: fechasUnicas.size,
    trabajadoresUnicos: trabajadoresUnicos.size,
  };
}