/**
 * Funciones auxiliares para cálculos de monitoreo
 */

/**
 * Calcula la incidencia de una plaga
 * @param arbolesAfectados - Número de árboles afectados
 * @param arbolesMonitoreados - Total de árboles monitoreados
 * @returns Porcentaje de incidencia
 */
export function calcularIncidencia(arbolesAfectados: number, arbolesMonitoreados: number): number {
  if (arbolesMonitoreados === 0) return 0;
  return (arbolesAfectados / arbolesMonitoreados) * 100;
}

/**
 * Clasifica la gravedad de una plaga basándose en la incidencia
 * @param incidencia - Porcentaje de incidencia
 * @returns Objeto con texto y valor numérico de gravedad
 */
export function clasificarGravedad(incidencia: number): { texto: string; numerica: number } {
  if (incidencia >= 30) {
    return { texto: 'Alta', numerica: 3 };
  } else if (incidencia >= 10) {
    return { texto: 'Media', numerica: 2 };
  } else {
    return { texto: 'Baja', numerica: 1 };
  }
}

/**
 * Calcula la densidad de individuos por árbol afectado
 * @param individuosEncontrados - Total de individuos encontrados
 * @param arbolesAfectados - Árboles que tienen la plaga
 * @returns Densidad promedio
 */
export function calcularDensidad(individuosEncontrados: number, arbolesAfectados: number): number {
  if (arbolesAfectados === 0) return 0;
  return individuosEncontrados / arbolesAfectados;
}

/**
 * Calcula la tendencia de una serie de valores de incidencia
 * @param incidencias - Array de valores de incidencia ordenados cronológicamente
 * @returns 'subiendo' | 'bajando' | 'estable'
 */
export function calcularTendencia(incidencias: number[]): 'subiendo' | 'bajando' | 'estable' {
  if (incidencias.length < 2) return 'estable';

  // Calcular pendiente usando regresión lineal simple
  const n = incidencias.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += incidencias[i];
    sumXY += i * incidencias[i];
    sumX2 += i * i;
  }

  const pendiente = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Umbral: cambio de más de 2% por período = tendencia significativa
  if (pendiente > 2) return 'subiendo';
  if (pendiente < -2) return 'bajando';
  return 'estable';
}

/**
 * Formatea un cambio porcentual para mostrar en descripciones
 * @param cambio - Porcentaje de cambio (ej: 25.5 para +25.5%)
 * @returns String formateado (ej: "(+25.5%)" o "(-10.2%)")
 */
export function formatearCambio(cambio: number): string {
  const signo = cambio >= 0 ? '+' : '';
  return `(${signo}${cambio.toFixed(1)}%)`;
}
