// ARCHIVO: components/monitoreo/MonitoreoDashboard.tsx
// DESCRIPCIÓN: Dashboard principal del módulo de Monitoreo con insights automáticos
// Propósito: Vista principal que integra todos los componentes del módulo de monitoreo

import { useState, useEffect } from 'react';
import {
  Upload,
  TrendingUp,
  Bookmark,
  Bug,
  Calendar,
  AlertTriangle,
  TrendingDown,
  Activity,
  MapPin,
  Clock
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { GraficoTendencias } from './GraficoTendencias';
import { VistasRapidas } from './VistasRapidas';
import { CatalogoPlagas } from './CatalogoPlagas';
import { CargaCSV } from './CargaCSV';
import { TablaMonitoreos } from './TablaMonitoreos';

// ============================================
// INTERFACES
// ============================================

interface MetricaDashboard {
  label: string;
  valor: string | number;
  cambio?: number;
  tendencia?: 'subiendo' | 'bajando' | 'estable';
  icono: any;
  color: string;
}

interface InsightAutomatico {
  tipo: 'critico' | 'advertencia' | 'info' | 'exito';
  titulo: string;
  descripcion: string;
  accion?: {
    texto: string;
    onClick: () => void;
  };
}

interface TopPlaga {
  nombre: string;
  sublotes: number;
  incidenciaPromedio: number;
  incidenciaMaxima: number;
  tendencia: 'subiendo' | 'bajando' | 'estable';
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function MonitoreoDashboard() {
  const [metricas, setMetricas] = useState<MetricaDashboard[]>([]);
  const [insights, setInsights] = useState<InsightAutomatico[]>([]);
  const [topPlagas, setTopPlagas] = useState<TopPlaga[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [vistaActual, setVistaActual] = useState<'dashboard' | 'tendencias' | 'vistas' | 'catalogo' | 'todos'>('dashboard');
  const [filtrosSeleccionados, setFiltrosSeleccionados] = useState<any>(null);
  const [rangoSeleccionado, setRangoSeleccionado] = useState<'semana' | 'mes' | 'trimestre' | 'todo'>('todo');

  // ============================================
  // CARGAR DATOS
  // ============================================

  useEffect(() => {
    cargarDatosDashboard();
  }, [rangoSeleccionado]);

  const cargarDatosDashboard = async () => {
    try {
      setIsLoading(true);
      const supabase = getSupabase();

      // ✅ CORRECCIÓN CRÍTICA: Quitar límite hardcodeado de 7 días
      // Calcular fechas según rango seleccionado
      let fechaInicio: string | null = null;
      const fechaFin = new Date().toISOString().split('T')[0];

      switch (rangoSeleccionado) {
        case 'semana':
          fechaInicio = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          break;
        case 'mes':
          fechaInicio = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          break;
        case 'trimestre':
          fechaInicio = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          break;
        case 'todo':
          fechaInicio = null; // Sin límite
          break;
      }

      // Query principal - Cargar en lotes de 1000 hasta 5000
      const BATCH_SIZE = 1000;
      const MAX_RECORDS = 5000;
      let allMonitoreos: any[] = [];
      let currentOffset = 0;
      let hasMore = true;

      console.log('🔄 Cargando datos en lotes...');

      while (hasMore && allMonitoreos.length < MAX_RECORDS) {
        let query = supabase
          .from('monitoreos')
          .select(`
            *,
            plagas_enfermedades_catalogo!inner(nombre),
            sublotes!inner(nombre, lote_id),
            lotes!inner(nombre)
          `);

        // Aplicar filtro de fecha SOLO si hay fechaInicio
        if (fechaInicio) {
          query = query.gte('fecha_monitoreo', fechaInicio);
        }
        query = query.lte('fecha_monitoreo', fechaFin);
        query = query.order('fecha_monitoreo', { ascending: false });
        query = query.range(currentOffset, currentOffset + BATCH_SIZE - 1);

        const { data, error } = await query;

        if (error) throw error;

        if (data && data.length > 0) {
          allMonitoreos = [...allMonitoreos, ...data];
          currentOffset += BATCH_SIZE;
          hasMore = data.length === BATCH_SIZE && allMonitoreos.length < MAX_RECORDS;
          console.log(`✅ Lote cargado: ${data.length} registros (Total: ${allMonitoreos.length})`);
        } else {
          hasMore = false;
        }
      }

      console.log(`✅ Monitoreos cargados (${rangoSeleccionado}):`, allMonitoreos?.length || 0);

      // Procesar datos
      await procesarMetricas(allMonitoreos || []);
      await generarInsights(allMonitoreos || []);
      await calcularTopPlagas(allMonitoreos || []);

    } catch (error) {
      console.error('Error al cargar dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // PROCESAR MÉTRICAS
  // ============================================

  const procesarMetricas = async (monitoreos: any[]) => {
    const totalRegistros = monitoreos.length;
    
    // Última fecha de monitoreo
    const fechas = monitoreos.map(m => new Date(m.fecha_monitoreo));
    const ultimaFecha = fechas.length > 0 
      ? new Date(Math.max(...fechas.map(f => f.getTime())))
      : new Date();

    // Registros críticos (Alta gravedad)
    const criticos = monitoreos.filter(m => m.gravedad_texto === 'Alta');

    // Incidencia promedio
    const incidencias = monitoreos.map(m => parseFloat(m.incidencia) || 0);
    const incidenciaPromedio = incidencias.length > 0
      ? incidencias.reduce((a, b) => a + b, 0) / incidencias.length
      : 0;

    // Label dinámico según rango
    const rangoLabel = {
      semana: '7 días',
      mes: '30 días',
      trimestre: '90 días',
      todo: 'Total'
    }[rangoSeleccionado];

    const nuevasMetricas: MetricaDashboard[] = [
      {
        label: 'Último Monitoreo',
        valor: ultimaFecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }),
        icono: Calendar,
        color: 'blue'
      },
      {
        label: `Registros (${rangoLabel})`,
        valor: totalRegistros,
        icono: Activity,
        color: 'green'
      },
      {
        label: 'Críticos',
        valor: criticos.length,
        cambio: criticos.length > 0 ? -15 : 0,
        tendencia: criticos.length > 5 ? 'subiendo' : 'bajando',
        icono: AlertTriangle,
        color: criticos.length > 5 ? 'red' : 'orange'
      },
      {
        label: 'Incidencia Promedio',
        valor: `${incidenciaPromedio.toFixed(1)}%`,
        tendencia: incidenciaPromedio > 15 ? 'subiendo' : 'bajando',
        icono: TrendingUp,
        color: incidenciaPromedio > 15 ? 'red' : 'green'
      }
    ];

    setMetricas(nuevasMetricas);
  };

  // ============================================
  // GENERAR INSIGHTS AUTOMÁTICOS
  // ============================================

  const generarInsights = async (monitoreos: any[]) => {
    const nuevosInsights: InsightAutomatico[] = [];

    // Insight 1: Registros críticos recientes
    const criticos = monitoreos.filter(m => m.gravedad_texto === 'Alta');
    if (criticos.length > 5) {
      nuevosInsights.push({
        tipo: 'critico',
        titulo: `⚠️ ${criticos.length} registros críticos esta semana`,
        descripcion: `Se detectaron ${criticos.length} monitoreos con gravedad alta. Revisa y programa tratamientos.`,
        accion: {
          texto: 'Ver Críticos',
          onClick: () => console.log('Filtrar críticos')
        }
      });
    }

    // Insight 2: Plaga más frecuente
    const plagaCounts: { [key: string]: number } = {};
    monitoreos.forEach(m => {
      const nombre = m.plagas_enfermedades_catalogo.nombre;
      plagaCounts[nombre] = (plagaCounts[nombre] || 0) + 1;
    });
    const [plagaTop, countTop] = Object.entries(plagaCounts)
      .sort((a, b) => b[1] - a[1])[0] || ['', 0];
    
    if (plagaTop && countTop > 3) {
      nuevosInsights.push({
        tipo: 'advertencia',
        titulo: `📊 ${plagaTop} aparece en ${countTop} monitoreos`,
        descripcion: `Esta plaga es la más frecuente esta semana. Considera aumentar su monitoreo.`,
      });
    }

    // Insight 3: Lote con más problemas
    const loteCounts: { [key: string]: number } = {};
    monitoreos.forEach(m => {
      const lote = m.lotes.nombre;
      loteCounts[lote] = (loteCounts[lote] || 0) + 1;
    });
    const [loteTop, loteCount] = Object.entries(loteCounts)
      .sort((a, b) => b[1] - a[1])[0] || ['', 0];
    
    if (loteTop && loteCount > 5) {
      nuevosInsights.push({
        tipo: 'info',
        titulo: `📍 Lote ${loteTop} requiere atención`,
        descripcion: `Este lote tiene ${loteCount} registros de monitoreo esta semana.`,
      });
    }

    // Insight 4: Todo bien
    if (criticos.length === 0 && monitoreos.length > 0) {
      nuevosInsights.push({
        tipo: 'exito',
        titulo: '✅ No hay registros críticos',
        descripcion: 'El monitoreo esta semana no muestra plagas de gravedad alta. ¡Excelente trabajo!',
      });
    }

    setInsights(nuevosInsights);
  };

  // ============================================
  // CALCULAR TOP 5 PLAGAS
  // ============================================

  const calcularTopPlagas = async (monitoreos: any[]) => {
    // Agrupar por plaga
    const plagaData: {
      [nombre: string]: {
        sublotes: Set<string>;
        incidencias: number[];
      };
    } = {};

    monitoreos.forEach(m => {
      const nombre = m.plagas_enfermedades_catalogo.nombre;
      if (!plagaData[nombre]) {
        plagaData[nombre] = { sublotes: new Set(), incidencias: [] };
      }
      plagaData[nombre].sublotes.add(m.sublote_id);
      plagaData[nombre].incidencias.push(parseFloat(m.incidencia) || 0);
    });

    // Calcular métricas
    const plagasArray: TopPlaga[] = Object.entries(plagaData).map(([nombre, data]) => {
      const incidencias = data.incidencias;
      const promedio = incidencias.reduce((a, b) => a + b, 0) / incidencias.length;
      const maxima = Math.max(...incidencias);

      return {
        nombre,
        sublotes: data.sublotes.size,
        incidenciaPromedio: Math.round(promedio * 10) / 10,
        incidenciaMaxima: Math.round(maxima * 10) / 10,
        tendencia: promedio > 15 ? 'subiendo' : promedio < 8 ? 'bajando' : 'estable'
      };
    });

    // Ordenar por incidencia promedio (descendente)
    plagasArray.sort((a, b) => b.incidenciaPromedio - a.incidenciaPromedio);

    setTopPlagas(plagasArray.slice(0, 5));
  };

  // ============================================
  // HELPERS
  // ============================================

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'green': return 'bg-green-50 text-green-700 border-green-200';
      case 'red': return 'bg-red-50 text-red-700 border-red-200';
      case 'orange': return 'bg-orange-50 text-orange-700 border-orange-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getInsightClasses = (tipo: InsightAutomatico['tipo']) => {
    switch (tipo) {
      case 'critico': return 'bg-red-50 border-red-200 text-red-800';
      case 'advertencia': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'info': return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'exito': return 'bg-green-50 border-green-200 text-green-800';
    }
  };

  const getTendenciaIcon = (tendencia: 'subiendo' | 'bajando' | 'estable') => {
    switch (tendencia) {
      case 'subiendo': return <TrendingUp className="w-4 h-4 text-red-600" />;
      case 'bajando': return <TrendingDown className="w-4 h-4 text-green-600" />;
      case 'estable': return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-12 h-12 border-4 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-[#F8FAF5] min-h-screen">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[#172E08]">Monitoreo de Plagas</h1>
          <p className="text-[#4D240F]/60 mt-2">
            Sistema de monitoreo fitosanitario con insights automáticos
          </p>
        </div>

        {/* NAVEGACIÓN DE VISTAS */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setVistaActual('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              vistaActual === 'dashboard'
                ? 'bg-[#73991C] text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Activity className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setVistaActual('todos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              vistaActual === 'todos'
                ? 'bg-[#73991C] text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            <MapPin className="w-4 h-4" />
            Todos
          </button>
          <button
            onClick={() => setVistaActual('tendencias')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              vistaActual === 'tendencias'
                ? 'bg-[#73991C] text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Tendencias
          </button>
          <button
            onClick={() => setVistaActual('vistas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              vistaActual === 'vistas'
                ? 'bg-[#73991C] text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            Vistas
          </button>
          <button
            onClick={() => setVistaActual('catalogo')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              vistaActual === 'catalogo'
                ? 'bg-[#73991C] text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Bug className="w-4 h-4" />
            Catálogo
          </button>
        </div>
      </div>

      {/* CONTENIDO SEGÚN VISTA */}
      {vistaActual === 'dashboard' && (
        <>
          {/* SELECTOR DE RANGO */}
          <div className="flex items-center gap-2 bg-white rounded-xl p-4 border border-gray-200">
            <Clock className="w-5 h-5 text-[#73991C]" />
            <span className="text-[#172E08] mr-2">Período:</span>
            <div className="flex gap-2">
              {(['semana', 'mes', 'trimestre', 'todo'] as const).map((rango) => (
                <button
                  key={rango}
                  onClick={() => setRangoSeleccionado(rango)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    rangoSeleccionado === rango
                      ? 'bg-[#73991C] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {rango === 'semana' && '7 días'}
                  {rango === 'mes' && '30 días'}
                  {rango === 'trimestre' && '90 días'}
                  {rango === 'todo' && 'Todo'}
                </button>
              ))}
            </div>
          </div>

          {/* MÉTRICAS PRINCIPALES */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {metricas.map((metrica, index) => {
              const Icono = metrica.icono;
              return (
                <div
                  key={index}
                  className={`bg-white rounded-xl border p-6 ${getColorClasses(metrica.color)}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="opacity-80 mb-1">{metrica.label}</p>
                      <p className="text-[#172E08]">{metrica.valor}</p>
                      {metrica.tendencia && (
                        <div className="flex items-center gap-1 mt-2">
                          {getTendenciaIcon(metrica.tendencia)}
                          {metrica.cambio && (
                            <span>
                              {metrica.cambio > 0 ? '+' : ''}{metrica.cambio}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="w-12 h-12 bg-white/50 rounded-lg flex items-center justify-center">
                      <Icono className="w-6 h-6" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* INSIGHTS AUTOMÁTICOS */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#73991C]/10 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[#73991C]" />
              </div>
              <h2 className="text-[#172E08]">Insights Automáticos</h2>
            </div>

            <div className="space-y-3">
              {insights.map((insight, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${getInsightClasses(insight.tipo)}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="mb-1">{insight.titulo}</p>
                      <p className="opacity-90">{insight.descripcion}</p>
                    </div>
                    {insight.accion && (
                      <button
                        onClick={insight.accion.onClick}
                        className="px-3 py-1 bg-white rounded-lg hover:shadow transition-shadow whitespace-nowrap"
                      >
                        {insight.accion.texto}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TOP 5 PLAGAS CRÍTICAS */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#73991C]/10 rounded-lg flex items-center justify-center">
                  <Bug className="w-5 h-5 text-[#73991C]" />
                </div>
                <div>
                  <h2 className="text-[#172E08]">
                    Top 5 Plagas Críticas
                  </h2>
                  <p className="text-[#4D240F]/60 mt-1">Última semana</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-gray-700 uppercase">
                      Plaga
                    </th>
                    <th className="px-6 py-3 text-center text-gray-700 uppercase">
                      Sublotes
                    </th>
                    <th className="px-6 py-3 text-center text-gray-700 uppercase">
                      Inc. Prom
                    </th>
                    <th className="px-6 py-3 text-center text-gray-700 uppercase">
                      Máx
                    </th>
                    <th className="px-6 py-3 text-center text-gray-700 uppercase">
                      Tendencia
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {topPlagas.map((plaga, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-[#172E08]">
                        {plaga.nombre}
                      </td>
                      <td className="px-6 py-4 text-center">{plaga.sublotes}</td>
                      <td className="px-6 py-4 text-center">
                        {plaga.incidenciaPromedio}%
                      </td>
                      <td className="px-6 py-4 text-center text-red-600">
                        {plaga.incidenciaMaxima}%
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getTendenciaIcon(plaga.tendencia)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* GRÁFICO DE TENDENCIAS */}
          <GraficoTendencias />

          {/* BOTÓN CARGAR CSV */}
          <CargaCSV />
        </>
      )}

      {vistaActual === 'vistas' && (
        <VistasRapidas 
          onVistaSeleccionada={(filtros) => {
            setFiltrosSeleccionados(filtros);
            setVistaActual('dashboard');
          }} 
        />
      )}

      {vistaActual === 'tendencias' && (
        <GraficoTendencias />
      )}

      {vistaActual === 'todos' && (
        <TablaMonitoreos />
      )}

      {vistaActual === 'catalogo' && (
        <CatalogoPlagas />
      )}
    </div>
  );
}