// ARCHIVO: components/monitoreo/GraficoTendencias.tsx
// DESCRIPCIÓN: Gráfico de líneas para mostrar tendencias de incidencia de plagas
// DEPENDENCIAS: recharts (npm install recharts)
// Propósito: Visualización de evolución temporal de plagas

import { useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { Calendar, TrendingUp, Download } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { formatearFechaCorta } from '../../utils/fechas';

// ============================================
// INTERFACES
// ============================================

interface TendenciaData {
  fecha?: string;                // LEGACY: Mantener para compatibilidad
  semana?: number;               // LEGACY: Mantener para compatibilidad
  ocurrencia?: string;           // NUEVO: "Ocurrencia 1", "Ocurrencia 2", etc.
  fechaInicio?: string;          // NUEVO: Fecha más temprana de la ocurrencia
  fechaFin?: string;             // NUEVO: Fecha más tardía de la ocurrencia
  [key: string]: number | string | undefined; // Permite propiedades dinámicas para cada plaga
}

interface Plaga {
  id: string;
  nombre: string;
  color: string;
}

interface GraficoTendenciasProps {
  loteId?: string;
  subloteId?: string;
  plagaId?: string;
  fechaInicio?: Date;
  fechaFin?: Date;
}

// ============================================
// COLORES PARA LAS LÍNEAS (hasta 10 plagas)
// ============================================

const COLORES_PLAGAS = [
  '#73991C', // Verde aguacate
  '#E74C3C', // Rojo
  '#3498DB', // Azul
  '#F39C12', // Naranja
  '#9B59B6', // Púrpura
  '#1ABC9C', // Turquesa
  '#E67E22', // Naranja oscuro
  '#34495E', // Gris azulado
  '#16A085', // Verde azulado
  '#C0392B', // Rojo oscuro
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function GraficoTendencias({
  loteId,
  subloteId,
  plagaId,
  fechaInicio,
  fechaFin
}: GraficoTendenciasProps) {
  const [tendencias, setTendencias] = useState<TendenciaData[]>([]);
  const [plagasVisibles, setPlagasVisibles] = useState<Plaga[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // ✅ CORRECCIÓN: Sin límite de fecha por defecto, mostrar TODO
  const [rangoFechas, setRangoFechas] = useState({
    inicio: fechaInicio || null, // Sin límite por defecto
    fin: fechaFin || new Date()
  });

  // NUEVO: Estado para modo de visualización por ocurrencias
  const [modoVisualizacion, setModoVisualizacion] = useState<'ultimo' | 'ultimos3' | 'ultimos6'>('ultimo');

  // ============================================
  // CARGAR DATOS
  // ============================================

  useEffect(() => {
    cargarTendencias();
  }, [loteId, subloteId, plagaId, rangoFechas, modoVisualizacion]);

  const cargarTendencias = async () => {
    try {
      setIsLoading(true);
      const supabase = getSupabase();

      // ✅ SOLUCIÓN: Cargar en lotes de 1000 hasta 5000
      const BATCH_SIZE = 1000;
      const MAX_RECORDS = 5000;
      let allData: any[] = [];
      let currentOffset = 0;
      let hasMore = true;

      const fechaInicioStr = rangoFechas.inicio ? rangoFechas.inicio.toISOString().split('T')[0] : '1900-01-01';
      const fechaFinStr = rangoFechas.fin.toISOString().split('T')[0];


      while (hasMore && allData.length < MAX_RECORDS) {
        let query = supabase
          .from('monitoreos')
          .select(`
            fecha_monitoreo,
            incidencia,
            plaga_enfermedad_id,
            plagas_enfermedades_catalogo!inner(nombre),
            lote_id,
            sublote_id
          `)
          .gte('fecha_monitoreo', fechaInicioStr)
          .lte('fecha_monitoreo', fechaFinStr)
          .order('fecha_monitoreo', { ascending: true })
          .range(currentOffset, currentOffset + BATCH_SIZE - 1);

        // Filtros opcionales
        if (loteId) query = query.eq('lote_id', loteId);
        if (subloteId) query = query.eq('sublote_id', subloteId);
        if (plagaId) query = query.eq('plaga_enfermedad_id', plagaId);

        const { data, error } = await query;

        if (error) throw error;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          currentOffset += BATCH_SIZE;
          hasMore = data.length === BATCH_SIZE && allData.length < MAX_RECORDS;
        } else {
          hasMore = false;
        }
      }


      // Procesar datos
      procesarDatos(allData || []);

    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // PROCESAR DATOS PARA RECHARTS - POR OCURRENCIAS
  // ============================================

  const procesarDatos = (monitoreos: any[]) => {
    const plagasUnicas = new Set<string>();

    // PASO 1: Identificar todas las fechas únicas de monitoreo
    const fechasUnicasSet = new Set<string>();
    monitoreos.forEach(m => {
      fechasUnicasSet.add(m.fecha_monitoreo);
      plagasUnicas.add(m.plagas_enfermedades_catalogo.nombre);
    });

    // PASO 2: Ordenar fechas cronológicamente (más antigua a más reciente)
    const fechasOrdenadas = Array.from(fechasUnicasSet).sort((a, b) =>
      new Date(a).getTime() - new Date(b).getTime()
    );

    // PASO 3: Tomar las últimas N fechas según el modo
    const numOcurrencias = modoVisualizacion === 'ultimo' ? 1 :
                          modoVisualizacion === 'ultimos3' ? 3 : 6;
    const fechasSeleccionadas = fechasOrdenadas.slice(-numOcurrencias);

    // PASO 4: Para cada fecha (ocurrencia), agrupar y calcular promedios
    const datosFormateados: TendenciaData[] = fechasSeleccionadas.map((fecha, index) => {
      // Filtrar monitoreos de esta fecha
      const monitoreosDeEstaFecha = monitoreos.filter(m => m.fecha_monitoreo === fecha);

      // Agrupar por plaga y calcular promedio
      const promediosPorPlaga: { [plaga: string]: number } = {};

      monitoreosDeEstaFecha.forEach(m => {
        const plagaNombre = m.plagas_enfermedades_catalogo.nombre;
        const incidencia = parseFloat(m.incidencia) || 0;

        if (!promediosPorPlaga[plagaNombre]) {
          promediosPorPlaga[plagaNombre] = 0;
        }
        promediosPorPlaga[plagaNombre] += incidencia;
      });

      // Calcular promedios finales
      const conteosPorPlaga: { [plaga: string]: number } = {};
      monitoreosDeEstaFecha.forEach(m => {
        const plagaNombre = m.plagas_enfermedades_catalogo.nombre;
        conteosPorPlaga[plagaNombre] = (conteosPorPlaga[plagaNombre] || 0) + 1;
      });

      Object.keys(promediosPorPlaga).forEach(plaga => {
        promediosPorPlaga[plaga] = Math.round((promediosPorPlaga[plaga] / conteosPorPlaga[plaga]) * 10) / 10;
      });

      // Crear punto de datos
      const punto: TendenciaData = {
        ocurrencia: `Ocurrencia ${index + 1}`,
        fechaInicio: fecha,
        fechaFin: fecha, // En este caso, es la misma fecha
        ...promediosPorPlaga
      };

      return punto;
    });

    // Configurar plagas visibles con colores
    const plagasConColor: Plaga[] = Array.from(plagasUnicas).map((nombre, index) => ({
      id: nombre,
      nombre,
      color: COLORES_PLAGAS[index % COLORES_PLAGAS.length]
    }));

    setTendencias(datosFormateados);
    setPlagasVisibles(plagasConColor);
  };

  // ============================================
  // UTILIDADES
  // ============================================

  // Removed - now using formatearFechaCorta from utils/fechas

  const obtenerNumeroSemana = (fecha: Date): number => {
    const primerDia = new Date(fecha.getFullYear(), 0, 1);
    const dias = Math.floor((fecha.getTime() - primerDia.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((dias + primerDia.getDay() + 1) / 7);
  };

  const exportarCSV = () => {
    if (tendencias.length === 0) return;

    const headers = ['Fecha', 'Semana', ...plagasVisibles.map(p => p.nombre)];
    const rows = tendencias.map(t => [
      t.fecha,
      t.semana,
      ...plagasVisibles.map(p => t[p.nombre] || 0)
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tendencias_${rangoFechas.inicio ? rangoFechas.inicio.toISOString().split('T')[0] : '1900-01-01'}_${rangoFechas.fin.toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // ============================================
  // CUSTOM AXIS TICK - Mostrar ocurrencia + fecha
  // ============================================

  const CustomAxisTick = ({ x, y, payload }: any) => {
    const punto = tendencias.find(t => t.ocurrencia === payload.value);
    if (!punto) return null;

    const fechaTexto = punto.fechaInicio === punto.fechaFin
      ? formatearFechaCorta(punto.fechaInicio || '')
      : `${formatearFechaCorta(punto.fechaInicio || '')} - ${formatearFechaCorta(punto.fechaFin || '')}`;

    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={16} textAnchor="middle" className="text-xs fill-[#4D240F]">
          {payload.value}
        </text>
        <text x={0} y={16} dy={16} textAnchor="middle" className="text-[10px] fill-gray-500">
          {fechaTexto}
        </text>
      </g>
    );
  };

  // ============================================
  // CUSTOM TOOLTIP
  // ============================================

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="text-[#172E08] mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: <span>{entry.value}%</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // ============================================
  // RENDER
  // ============================================

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (tendencias.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <TrendingUp className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-[#172E08]">No hay datos para el rango seleccionado</p>
          <p className="mt-2">Intenta cambiar los filtros</p>
        </div>
      </div>
    );
  }

  // Calcular rango de fechas para subtítulo
  const fechaMasAntigua = tendencias.length > 0 ? tendencias[0].fechaInicio : null;
  const fechaMasReciente = tendencias.length > 0 ? tendencias[tendencias.length - 1].fechaFin : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* HEADER */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#73991C]/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#73991C]" />
            </div>
            <div>
              <h3 className="text-[#172E08] font-semibold">
                Tendencias de Incidencia
              </h3>
              {fechaMasAntigua && fechaMasReciente && (
                <p className="text-[#4D240F]/60 text-sm">
                  Datos de: {formatearFechaCorta(fechaMasAntigua)} a: {formatearFechaCorta(fechaMasReciente)}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={exportarCSV}
            className="flex items-center gap-2 px-4 py-2 bg-[#73991C] text-white rounded-lg hover:bg-[#5C7A16] transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>
        </div>

        {/* SELECTOR DE MODO DE VISUALIZACIÓN */}
        <div className="flex gap-2">
          <button
            onClick={() => setModoVisualizacion('ultimo')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              modoVisualizacion === 'ultimo'
                ? 'bg-[#73991C] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Último monitoreo
          </button>
          <button
            onClick={() => setModoVisualizacion('ultimos3')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              modoVisualizacion === 'ultimos3'
                ? 'bg-[#73991C] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Últimos 3 monitoreos
          </button>
          <button
            onClick={() => setModoVisualizacion('ultimos6')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              modoVisualizacion === 'ultimos6'
                ? 'bg-[#73991C] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Últimos 6 monitoreos
          </button>
        </div>
      </div>

      {/* GRÁFICO */}
      <div className="p-6">
        <ResponsiveContainer width="100%" height={450}>
          <LineChart data={tendencias} margin={{ bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7EDDD" />
            <XAxis
              dataKey="ocurrencia"
              stroke="#4D240F"
              style={{ fontSize: '12px' }}
              tick={<CustomAxisTick />}
              height={80}
            />
            <YAxis
              stroke="#4D240F"
              style={{ fontSize: '12px' }}
              label={{ value: 'Incidencia (%)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
            />
            {plagasVisibles.map((plaga) => (
              <Line
                key={plaga.id}
                type="monotone"
                dataKey={plaga.nombre}
                stroke={plaga.color}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                name={plaga.nombre}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* LEYENDA ADICIONAL */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center gap-2 text-[#4D240F]/60">
          <Calendar className="w-4 h-4" />
          <span>
            Mostrando {tendencias.length} puntos de datos • 
            {plagasVisibles.length} plaga{plagasVisibles.length !== 1 ? 's' : ''} monitoreada{plagasVisibles.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}