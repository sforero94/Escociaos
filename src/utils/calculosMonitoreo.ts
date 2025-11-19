// ARCHIVO: utils/calculosMonitoreo.ts
// DESCRIPCIÓN: Funciones para cálculos de incidencia, severidad, tendencias y estadísticas
// Propósito: Realizar todos los cálculos matemáticos del módulo de monitoreo

import { Monitoreo, EstadisticaRapida } from '../types/monitoreo';

export function calcularIncidencia(
  arbolesAfectados: number,
  arbolesMonitoreados: number
): number {
  if (arbolesMonitoreados === 0) return 0;
  return (arbolesAfectados / arbolesMonitoreados) * 100;
}

export function calcularSeveridad(
  individuos: number,
  arbolesAfectados: number
): number {
  if (arbolesAfectados === 0) return 0;
  return individuos / arbolesAfectados;
}

export function clasificarGravedad(incidencia: number): {
  texto: 'Baja' | 'Media' | 'Alta';
  numerica: 1 | 2 | 3;
  color: string;
  emoji: string;
} {
  if (incidencia >= 30) {
    return { texto: 'Alta', numerica: 3, color: '#DC3545', emoji: '🔴' };
  } else if (incidencia >= 10) {
    return { texto: 'Media', numerica: 2, color: '#FFA500', emoji: '🟡' };
  } else {
    return { texto: 'Baja', numerica: 1, color: '#28A745', emoji: '🟢' };
  }
}

export function calcularTendencia(
  valoresRecientes: number[]
): 'subiendo' | 'bajando' | 'estable' {
  if (valoresRecientes.length < 2) return 'estable';
  
  const primerosMitad = valoresRecientes.slice(0, Math.floor(valoresRecientes.length / 2));
  const segundaMitad = valoresRecientes.slice(Math.floor(valoresRecientes.length / 2));
  
  const promedioPrimera = primerosMitad.reduce((a, b) => a + b, 0) / primerosMitad.length;
  const promedioSegunda = segundaMitad.reduce((a, b) => a + b, 0) / segundaMitad.length;
  
  const cambio = ((promedioSegunda - promedioPrimera) / promedioPrimera) * 100;
  
  if (cambio > 10) return 'subiendo';
  if (cambio < -10) return 'bajando';
  return 'estable';
}

export function agruparPorPlagaYSemana(
  monitoreos: Monitoreo[]
): Map<string, Map<number, number[]>> {
  const agrupado = new Map<string, Map<number, number[]>>();
  
  monitoreos.forEach(m => {
    if (!agrupado.has(m.plaga_nombre)) {
      agrupado.set(m.plaga_nombre, new Map());
    }
    
    const plagaMap = agrupado.get(m.plaga_nombre)!;
    if (!plagaMap.has(m.semana)) {
      plagaMap.set(m.semana, []);
    }
    
    plagaMap.get(m.semana)!.push(m.incidencia);
  });
  
  return agrupado;
}

export function calcularEstadisticasRapidas(
  monitoreos: Monitoreo[],
  semanas: number = 8
): EstadisticaRapida[] {
  const plagasUnicas = [...new Set(monitoreos.map(m => m.plaga_nombre))];
  
  return plagasUnicas.map(plaga => {
    const datosPorPlaga = monitoreos.filter(m => m.plaga_nombre === plaga);
    const incidencias = datosPorPlaga.map(m => m.incidencia);
    
    const promedio = incidencias.reduce((a, b) => a + b, 0) / incidencias.length;
    const maximo = Math.max(...incidencias);
    
    const tendencia = calcularTendencia(incidencias);
    
    // Calcular cambio vs período anterior
    const mitad = Math.floor(incidencias.length / 2);
    const promedioAnterior = incidencias.slice(0, mitad).reduce((a, b) => a + b, 0) / mitad;
    const promedioReciente = incidencias.slice(mitad).reduce((a, b) => a + b, 0) / (incidencias.length - mitad);
    const cambio = ((promedioReciente - promedioAnterior) / promedioAnterior) * 100;
    
    let estado: 'critico' | 'alerta' | 'atencion' | 'normal' = 'normal';
    if (maximo >= 30) estado = 'critico';
    else if (maximo >= 20) estado = 'alerta';
    else if (maximo >= 10) estado = 'atencion';
    
    return {
      plaga,
      promedio: Math.round(promedio * 10) / 10,
      maximo: Math.round(maximo * 10) / 10,
      tendencia,
      cambio: Math.round(cambio),
      estado
    };
  }).sort((a, b) => b.maximo - a.maximo);
}

export function formatearPorcentaje(valor: number): string {
  return `${Math.round(valor * 10) / 10}%`;
}

export function formatearCambio(cambio: number): string {
  const signo = cambio >= 0 ? '+' : '';
  return `${signo}${Math.round(cambio)}%`;
}
