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
