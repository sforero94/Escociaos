// ARCHIVO: utils/insightsAutomaticos.ts
// DESCRIPCIÓN: Genera insights automáticos detectando plagas críticas, mejoras y lotes problemáticos
// Propósito: Análisis inteligente de datos para alertas y recomendaciones

import { Monitoreo, Insight } from '../types/monitoreo';
import { calcularTendencia, formatearCambio } from './calculosMonitoreo';

export function generarInsights(monitoreos: Monitoreo[]): Insight[] {
  const insights: Insight[] = [];
  
  // 1. Detectar plagas críticas que están subiendo
  const plagasCriticas = detectarPlagasCriticas(monitoreos);
  plagasCriticas.forEach(insight => insights.push(insight));
  
  // 2. Detectar mejoras (plagas que bajaron)
  const mejoras = detectarMejoras(monitoreos);
  mejoras.forEach(insight => insights.push(insight));
  
  // 3. Detectar lotes problemáticos
  const lotes = detectarLotesProblematicos(monitoreos);
  lotes.forEach(insight => insights.push(insight));
  
  return insights.slice(0, 5); // Máximo 5 insights
}

function detectarPlagasCriticas(monitoreos: Monitoreo[]): Insight[] {
  const insights: Insight[] = [];
  
  // Agrupar por plaga y sublote
  const agrupado = new Map<string, Map<string, Monitoreo[]>>();
  
  monitoreos.forEach(m => {
    const key = `${m.plaga_nombre}-${m.lote_nombre}-${m.sublote_nombre}`;
    if (!agrupado.has(key)) {
      agrupado.set(key, new Map());
    }
    const subloteKey = `${m.lote_nombre}-${m.sublote_nombre}`;
    if (!agrupado.get(key)!.has(subloteKey)) {
      agrupado.get(key)!.set(subloteKey, []);
    }
    agrupado.get(key)!.get(subloteKey)!.push(m);
  });
  
  // Analizar cada combinación
  agrupado.forEach((sublotes, key) => {
    sublotes.forEach((registros, subloteKey) => {
      if (registros.length < 2) return;
      
      // Ordenar por semana
      registros.sort((a, b) => a.semana - b.semana);
      
      const ultimo = registros[registros.length - 1];
      const penultimo = registros[registros.length - 2];
      
      // Solo alertar si es crítico (≥30%) y está subiendo
      if (ultimo.incidencia >= 30 && ultimo.incidencia > penultimo.incidencia) {
        const cambio = ((ultimo.incidencia - penultimo.incidencia) / penultimo.incidencia) * 100;
        
        insights.push({
          tipo: 'urgente',
          titulo: `${ultimo.plaga_nombre} en ${ultimo.lote_nombre} ${ultimo.sublote_nombre}`,
          descripcion: `Subió de ${penultimo.incidencia.toFixed(1)}% a ${ultimo.incidencia.toFixed(1)}% esta semana ${formatearCambio(cambio)}`,
          plaga: ultimo.plaga_nombre,
          lote: ultimo.lote_nombre,
          sublote: ultimo.sublote_nombre,
          incidenciaActual: ultimo.incidencia,
          incidenciaAnterior: penultimo.incidencia,
          cambio,
          accion: 'Aplicar tratamiento hoy'
        });
      }
      // Alertar si está creciendo rápido (aunque no sea crítico aún)
      else if (ultimo.incidencia >= 20) {
        const incidencias = registros.slice(-4).map(r => r.incidencia);
        const tendencia = calcularTendencia(incidencias);
        
        if (tendencia === 'subiendo') {
          const cambio = ((ultimo.incidencia - penultimo.incidencia) / penultimo.incidencia) * 100;
          
          insights.push({
            tipo: 'atencion',
            titulo: `${ultimo.plaga_nombre} aumentando en ${subloteKey}`,
            descripcion: `Promedio pasó de ${penultimo.incidencia.toFixed(1)}% a ${ultimo.incidencia.toFixed(1)}% ${formatearCambio(cambio)}`,
            plaga: ultimo.plaga_nombre,
            lote: ultimo.lote_nombre,
            sublote: ultimo.sublote_nombre,
            incidenciaActual: ultimo.incidencia,
            incidenciaAnterior: penultimo.incidencia,
            cambio,
            accion: 'Monitorear de cerca'
          });
        }
      }
    });
  });
  
  return insights.sort((a, b) => (b.incidenciaActual || 0) - (a.incidenciaActual || 0));
}

function detectarMejoras(monitoreos: Monitoreo[]): Insight[] {
  const insights: Insight[] = [];
  
  // Agrupar por plaga
  const porPlaga = new Map<string, Monitoreo[]>();
  monitoreos.forEach(m => {
    if (!porPlaga.has(m.plaga_nombre)) {
      porPlaga.set(m.plaga_nombre, []);
    }
    porPlaga.get(m.plaga_nombre)!.push(m);
  });
  
  porPlaga.forEach((registros, plaga) => {
    if (registros.length < 4) return;
    
    // Calcular promedio de últimas 2 semanas vs 2 anteriores
    registros.sort((a, b) => a.semana - b.semana);
    
    const ultimas2 = registros.slice(-2);
    const anteriores2 = registros.slice(-4, -2);
    
    const promedioUltimas = ultimas2.reduce((sum, r) => sum + r.incidencia, 0) / ultimas2.length;
    const promedioAnteriores = anteriores2.reduce((sum, r) => sum + r.incidencia, 0) / anteriores2.length;
    
    if (promedioAnteriores > 10 && promedioUltimas < promedioAnteriores * 0.7) {
      const cambio = ((promedioUltimas - promedioAnteriores) / promedioAnteriores) * 100;
      
      insights.push({
        tipo: 'bueno',
        titulo: `${plaga} bajó en todos los lotes`,
        descripcion: `Promedio bajó de ${promedioAnteriores.toFixed(1)}% a ${promedioUltimas.toFixed(1)}% ${formatearCambio(cambio)}`,
        plaga,
        incidenciaActual: promedioUltimas,
        incidenciaAnterior: promedioAnteriores,
        cambio,
        accion: 'La aplicación funcionó'
      });
    }
  });
  
  return insights;
}

function detectarLotesProblematicos(monitoreos: Monitoreo[]): Insight[] {
  const insights: Insight[] = [];
  
  // Agrupar por lote
  const porLote = new Map<string, Monitoreo[]>();
  monitoreos.forEach(m => {
    if (!porLote.has(m.lote_nombre)) {
      porLote.set(m.lote_nombre, []);
    }
    porLote.get(m.lote_nombre)!.push(m);
  });
  
  porLote.forEach((registros, lote) => {
    // Contar cuántas plagas críticas tiene
    const criticas = registros.filter(r => r.incidencia >= 30);
    const plagasCriticas = new Set(criticas.map(r => r.plaga_nombre));
    
    if (plagasCriticas.size >= 2) {
      insights.push({
        tipo: 'atencion',
        titulo: `${lote} tiene múltiples plagas críticas`,
        descripcion: `${plagasCriticas.size} plagas con incidencia ≥30%: ${Array.from(plagasCriticas).join(', ')}`,
        lote,
        accion: 'Revisar estrategia de manejo'
      });
    }
  });
  
  return insights;
}
