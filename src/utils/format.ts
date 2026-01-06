/**
 * Utilidades de formato para el Dashboard de Escocia Hass
 * 
 * Este archivo contiene funciones para formatear:
 * - Moneda (COP)
 * - Números con separador de miles
 * - Pesos (kg/toneladas)
 * - Tiempo relativo
 */

/**
 * Formatea un número como moneda colombiana (COP)
 * 
 * @param value - Valor numérico a formatear
 * @returns String formateado como "$X,XXX,XXX COP"
 * 
 * @example
 * formatCurrency(4250000) // "$4,250,000 COP"
 * formatCurrency(1500000) // "$1,500,000 COP"
 * formatCurrency(0) // "$0 COP"
 */
export function formatCurrency(value: number): string {
  const formatted = new Intl.NumberFormat('es-CO', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
  
  return `$${formatted} COP`;
}

/**
 * Formatea un número con separador de miles
 * 
 * @param value - Valor numérico a formatear
 * @param decimals - Número de decimales (opcional, default: 0)
 * @returns String formateado como "X,XXX,XXX"
 * 
 * @example
 * formatNumber(1234567) // "1,234,567"
 * formatNumber(1234.567, 2) // "1,234.57"
 * formatNumber(100) // "100"
 */
export function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Formatea un peso en kilogramos
 * Convierte automáticamente a toneladas si es > 1000 kg
 * 
 * @param kg - Peso en kilogramos
 * @returns String formateado como "XXX kg" o "X.X ton"
 * 
 * @example
 * formatWeight(5400) // "5.4 ton"
 * formatWeight(850) // "850 kg"
 * formatWeight(1250) // "1.3 ton"
 * formatWeight(0) // "0 kg"
 */
export function formatWeight(kg: number): string {
  if (kg > 1000) {
    const tons = kg / 1000;
    return `${tons.toFixed(1)} ton`;
  }
  return `${Math.round(kg)} kg`;
}

/**
 * Formatea una fecha como tiempo relativo en español
 * 
 * @param date - Fecha a formatear (Date object o string ISO)
 * @returns String formateado como "hace X minutos/horas/días/semanas"
 * 
 * @example
 * formatRelativeTime(new Date()) // "hace unos segundos"
 * formatRelativeTime(new Date('2024-01-10')) // "hace 3 días"
 * formatRelativeTime('2024-01-01') // "hace 2 semanas"
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  // Años
  if (diffYears > 0) {
    return diffYears === 1 ? 'hace 1 año' : `hace ${diffYears} años`;
  }
  
  // Meses
  if (diffMonths > 0) {
    return diffMonths === 1 ? 'hace 1 mes' : `hace ${diffMonths} meses`;
  }
  
  // Semanas
  if (diffWeeks > 0) {
    return diffWeeks === 1 ? 'hace 1 semana' : `hace ${diffWeeks} semanas`;
  }
  
  // Días
  if (diffDays > 0) {
    if (diffDays === 1) return 'hace 1 día';
    if (diffDays === 2) return 'hace 2 días';
    return `hace ${diffDays} días`;
  }
  
  // Horas
  if (diffHours > 0) {
    return diffHours === 1 ? 'hace 1 hora' : `hace ${diffHours} horas`;
  }
  
  // Minutos
  if (diffMinutes > 0) {
    return diffMinutes === 1 ? 'hace 1 minuto' : `hace ${diffMinutes} minutos`;
  }
  
  // Segundos
  if (diffSeconds > 10) {
    return `hace ${diffSeconds} segundos`;
  }
  
  return 'hace unos segundos';
}

/**
 * Formatea una fecha como texto corto en español
 * 
 * @param date - Fecha a formatear
 * @returns String formateado como "DD MMM YYYY"
 * 
 * @example
 * formatShortDate(new Date('2024-01-15')) // "15 ene 2024"
 */
export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Formatea una fecha completa en español
 * 
 * @param date - Fecha a formatear
 * @returns String formateado como "DD de MMMM de YYYY"
 * 
 * @example
 * formatLongDate(new Date('2024-01-15')) // "15 de enero de 2024"
 */
export function formatLongDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/**
 * Formatea un porcentaje
 * 
 * @param value - Valor del 0 al 100
 * @param decimals - Número de decimales (opcional, default: 1)
 * @returns String formateado como "XX.X%"
 * 
 * @example
 * formatPercentage(85.5) // "85.5%"
 * formatPercentage(100) // "100.0%"
 * formatPercentage(33.333, 2) // "33.33%"
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Formatea un valor compacto (K, M, B)
 * Útil para dashboards con números grandes
 * 
 * @param value - Valor numérico
 * @returns String formateado como "X.XK" o "X.XM"
 * 
 * @example
 * formatCompact(1500) // "1.5K"
 * formatCompact(2500000) // "2.5M"
 * formatCompact(1500000000) // "1.5B"
 */
export function formatCompact(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
}

/**
 * Formatea una hectárea con decimales
 * 
 * @param ha - Hectáreas
 * @returns String formateado como "X.X ha"
 * 
 * @example
 * formatHectares(6.5) // "6.5 ha"
 * formatHectares(10) // "10.0 ha"
 */
export function formatHectares(ha: number): string {
  return `${ha.toFixed(1)} ha`;
}

/**
 * Formatea un rango de fechas
 * 
 * @param startDate - Fecha de inicio
 * @param endDate - Fecha de fin
 * @returns String formateado como "DD MMM - DD MMM YYYY"
 * 
 * @example
 * formatDateRange(new Date('2024-01-10'), new Date('2024-01-20')) 
 * // "10 ene - 20 ene 2024"
 */
export function formatDateRange(startDate: Date | string, endDate: Date | string): string {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  
  const startFormatted = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
  }).format(start);
  
  const endFormatted = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(end);
  
  return `${startFormatted} - ${endFormatted}`;
}

/**
 * Trunca un texto largo con "..."
 * 
 * @param text - Texto a truncar
 * @param maxLength - Longitud máxima
 * @returns String truncado
 * 
 * @example
 * truncateText("Este es un texto muy largo", 15) // "Este es un t..."
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Capitaliza la primera letra de un string
 * 
 * @param text - Texto a capitalizar
 * @returns String capitalizado
 * 
 * @example
 * capitalize("hola mundo") // "Hola mundo"
 */
export function capitalize(text: string): string {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Formatea un número de teléfono colombiano
 * 
 * @param phone - Número de teléfono (string de 10 dígitos)
 * @returns String formateado como "(XXX) XXX-XXXX"
 * 
 * @example
 * formatPhone("3201234567") // "(320) 123-4567"
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  return phone; // Retornar sin formato si no tiene 10 dígitos
}

/**
 * Formatea un NIT colombiano
 * 
 * @param nit - NIT sin formato
 * @returns String formateado como "XXX.XXX.XXX-X"
 * 
 * @example
 * formatNIT("900123456-7") // "900.123.456-7"
 */
export function formatNIT(nit: string): string {
  const cleaned = nit.replace(/[.-]/g, '');

  if (cleaned.length >= 9) {
    const digits = cleaned.slice(0, -1);
    const verifier = cleaned.slice(-1);

    const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${formatted}-${verifier}`;
  }

  return nit;
}

// ============================================
// Spanish-named aliases for PDF generation
// ============================================

/**
 * Formatea un valor como moneda colombiana (alias en español)
 * @param valor - Valor numérico
 * @returns String formateado como "$X,XXX,XXX"
 */
export function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(valor);
}

/**
 * Formatea un número con separador de miles (alias en español)
 * @param valor - Valor numérico
 * @param decimales - Número de decimales (default: 2)
 * @returns String formateado
 */
export function formatearNumero(valor: number, decimales: number = 2): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  }).format(valor);
}
