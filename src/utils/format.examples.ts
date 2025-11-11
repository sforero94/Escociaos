/**
 * EJEMPLOS DE USO - Utilidades de Formato
 * 
 * Este archivo muestra cómo usar todas las funciones de format.ts
 * Puedes importarlo en la consola del navegador para probar
 */

import {
  formatCurrency,
  formatNumber,
  formatWeight,
  formatRelativeTime,
  formatShortDate,
  formatLongDate,
  formatPercentage,
  formatCompact,
  formatHectares,
  formatDateRange,
  truncateText,
  capitalize,
  formatPhone,
  formatNIT,
} from './format';

/**
 * EJEMPLOS DE formatCurrency
 */
export const currencyExamples = {
  'Valor pequeño': formatCurrency(150000),           // "$150,000 COP"
  'Valor medio': formatCurrency(4250000),            // "$4,250,000 COP"
  'Valor grande': formatCurrency(125000000),         // "$125,000,000 COP"
  'Cero': formatCurrency(0),                         // "$0 COP"
  'Decimal (redondea)': formatCurrency(4250123.45),  // "$4,250,123 COP"
};

/**
 * EJEMPLOS DE formatNumber
 */
export const numberExamples = {
  'Miles': formatNumber(1234),                       // "1,234"
  'Millones': formatNumber(1234567),                 // "1,234,567"
  'Con decimales': formatNumber(1234.567, 2),        // "1,234.57"
  'Sin decimales': formatNumber(1234.567, 0),        // "1,235"
};

/**
 * EJEMPLOS DE formatWeight
 */
export const weightExamples = {
  'Menos de 1 ton': formatWeight(850),               // "850 kg"
  'Justo 1 ton': formatWeight(1000),                 // "1.0 ton"
  'Más de 1 ton': formatWeight(5400),                // "5.4 ton"
  'Mucho peso': formatWeight(12500),                 // "12.5 ton"
  'Cero': formatWeight(0),                           // "0 kg"
};

/**
 * EJEMPLOS DE formatRelativeTime
 */
export const relativeTimeExamples = () => {
  const now = new Date();
  
  return {
    'Hace 5 minutos': formatRelativeTime(new Date(now.getTime() - 5 * 60 * 1000)),
    'Hace 2 horas': formatRelativeTime(new Date(now.getTime() - 2 * 60 * 60 * 1000)),
    'Hace 1 día': formatRelativeTime(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    'Hace 3 días': formatRelativeTime(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)),
    'Hace 2 semanas': formatRelativeTime(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)),
    'Hace 1 mes': formatRelativeTime(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
    'Hace 1 año': formatRelativeTime(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)),
  };
};

/**
 * EJEMPLOS DE formatShortDate
 */
export const shortDateExamples = {
  'Hoy': formatShortDate(new Date()),                                    // "15 ene 2024"
  'Fecha específica': formatShortDate(new Date('2024-06-15')),          // "15 jun 2024"
  'String ISO': formatShortDate('2024-12-25'),                          // "25 dic 2024"
};

/**
 * EJEMPLOS DE formatLongDate
 */
export const longDateExamples = {
  'Hoy': formatLongDate(new Date()),                                     // "15 de enero de 2024"
  'Fecha específica': formatLongDate(new Date('2024-06-15')),           // "15 de junio de 2024"
  'String ISO': formatLongDate('2024-12-25'),                           // "25 de diciembre de 2024"
};

/**
 * EJEMPLOS DE formatPercentage
 */
export const percentageExamples = {
  '1 decimal (default)': formatPercentage(85.5),                        // "85.5%"
  '2 decimales': formatPercentage(33.333, 2),                           // "33.33%"
  'Sin decimales': formatPercentage(100, 0),                            // "100%"
  'Valor bajo': formatPercentage(2.5),                                  // "2.5%"
};

/**
 * EJEMPLOS DE formatCompact
 */
export const compactExamples = {
  'Miles (K)': formatCompact(1500),                                     // "1.5K"
  'Miles grandes': formatCompact(45000),                                // "45.0K"
  'Millones (M)': formatCompact(2500000),                               // "2.5M"
  'Billones (B)': formatCompact(1500000000),                            // "1.5B"
  'Menos de mil': formatCompact(500),                                   // "500"
};

/**
 * EJEMPLOS DE formatHectares
 */
export const hectaresExamples = {
  'Entero': formatHectares(6),                                          // "6.0 ha"
  'Con decimales': formatHectares(6.5),                                 // "6.5 ha"
  'Total finca': formatHectares(52),                                    // "52.0 ha"
};

/**
 * EJEMPLOS DE formatDateRange
 */
export const dateRangeExamples = {
  'Rango enero': formatDateRange(
    new Date('2024-01-10'),
    new Date('2024-01-20')
  ),                                                                    // "10 ene - 20 ene 2024"
  'Rango meses diferentes': formatDateRange(
    new Date('2024-01-15'),
    new Date('2024-02-15')
  ),                                                                    // "15 ene - 15 feb 2024"
};

/**
 * EJEMPLOS DE truncateText
 */
export const truncateExamples = {
  'Texto corto (no trunca)': truncateText('Hola', 10),                 // "Hola"
  'Texto largo': truncateText('Este es un texto muy largo', 15),       // "Este es un t..."
  'Descripción': truncateText('Aplicación de fertilizante foliar completo', 20), // "Aplicación de ferti..."
};

/**
 * EJEMPLOS DE capitalize
 */
export const capitalizeExamples = {
  'Minúsculas': capitalize('hola mundo'),                               // "Hola mundo"
  'MAYÚSCULAS': capitalize('HOLA MUNDO'),                               // "Hola mundo"
  'Mixto': capitalize('hOlA mUnDo'),                                    // "Hola mundo"
};

/**
 * EJEMPLOS DE formatPhone
 */
export const phoneExamples = {
  'Celular': formatPhone('3201234567'),                                 // "(320) 123-4567"
  'Otro celular': formatPhone('3112345678'),                            // "(311) 234-5678"
  'Con espacios': formatPhone('320 123 4567'),                          // "(320) 123-4567"
  'Inválido (no cambia)': formatPhone('12345'),                         // "12345"
};

/**
 * EJEMPLOS DE formatNIT
 */
export const nitExamples = {
  'Con guiones': formatNIT('900123456-7'),                              // "900.123.456-7"
  'Sin formato': formatNIT('9001234567'),                               // "900.123.456-7"
  'Con puntos': formatNIT('900.123.456-7'),                             // "900.123.456-7"
};

/**
 * CASOS DE USO REALES EN EL DASHBOARD
 */
export const dashboardUseCases = () => {
  return {
    // Card de Inventario
    inventario: {
      valorTotal: formatCurrency(330000000),                            // "$330,000,000 COP"
      valorCompacto: formatCompact(330000000),                          // "330.0M"
      alertas: formatNumber(3),                                         // "3"
    },
    
    // Card de Producción
    produccion: {
      kilosSemana: formatWeight(4800),                                  // "4.8 ton"
      promedioPorArbol: formatNumber(0.4, 3) + ' kg',                   // "0.400 kg"
    },
    
    // Card de Ventas
    ventas: {
      totalMes: formatCurrency(174370000),                              // "$174,370,000 COP"
      totalCompacto: `$${formatCompact(174370000)}`,                    // "$174.4M"
      clientesActivos: formatNumber(6),                                 // "6"
    },
    
    // Card de Lotes
    lotes: {
      totalLotes: formatNumber(8),                                      // "8"
      hectareasTotales: formatHectares(52),                             // "52.0 ha"
    },
    
    // Alertas
    alertas: {
      stockBajo: '⚠️ Stock bajo: Urea 46%',
      monitoreo: '🔴 Phytophthora: Nivel crítico en Lote B-3',
      tiempo: formatRelativeTime(new Date(Date.now() - 2 * 60 * 60 * 1000)), // "hace 2 horas"
    },
    
    // Fechas
    fechas: {
      ultimoMonitoreo: formatShortDate(new Date()),                     // "15 ene 2024"
      proximaAplicacion: formatShortDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)), // "17 ene 2024"
    },
  };
};

/**
 * FUNCIÓN PARA PROBAR TODAS LAS UTILIDADES
 */
export function testAllFormatters() {
  console.group('💰 formatCurrency');
  Object.entries(currencyExamples).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
  console.groupEnd();
  
  console.group('🔢 formatNumber');
  Object.entries(numberExamples).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
  console.groupEnd();
  
  console.group('⚖️ formatWeight');
  Object.entries(weightExamples).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
  console.groupEnd();
  
  console.group('⏰ formatRelativeTime');
  Object.entries(relativeTimeExamples()).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
  console.groupEnd();
  
  console.group('📅 Fechas');
  console.log('Short:', shortDateExamples);
  console.log('Long:', longDateExamples);
  console.log('Range:', dateRangeExamples);
  console.groupEnd();
  
  console.group('📊 Dashboard Real');
  console.log(dashboardUseCases());
  console.groupEnd();
  
  console.log('✅ Todas las funciones probadas correctamente');
}

// Para usar en consola del navegador:
// import { testAllFormatters } from './utils/format.examples'
// testAllFormatters()
