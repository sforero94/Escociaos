/**
 * Centralized labor cost calculation utilities
 * Provides consistent cost calculations across the application
 */

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
 * Calculate labor costs using standardized formula
 * Formula: (salary + benefits + allowances) / weeklyHours * 8 * fractionWorked
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

  // Calculate hourly rate
  const hourlyRate = (salary + benefits + allowances) / weeklyHours;

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