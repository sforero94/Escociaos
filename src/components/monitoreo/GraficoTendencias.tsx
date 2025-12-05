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
  fecha: string;
  semana: number;
  [key: string]: number | string; // Permite propiedades dinámicas para cada plaga
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

  // ============================================
  // CARGAR DATOS
  // ============================================

  useEffect(() => {
    cargarTendencias();
  }, [loteId, subloteId, plagaId, rangoFechas]);

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

      console.log('🔄 Cargando tendencias en lotes...');

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
          console.log(`✅ Lote cargado: ${data.length} registros (Total: ${allData.length})`);
        } else {
          hasMore = false;
        }
      }

      console.log(`🎉 Tendencias cargadas: ${allData.length} registros`);

      // Procesar datos
      procesarDatos(allData || []);

    } catch (error) {
      console.error('Error al cargar tendencias:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // PROCESAR DATOS PARA RECHARTS
  // ============================================

  const procesarDatos = (monitoreos: any[]) => {
    // Agrupar por fecha y plaga
    const datosPorFecha: { [fecha: string]: { [plaga: string]: number[] } } = {};
    const plagasUnicas = new Set<string>();

    monitoreos.forEach((m) => {
      const fecha = m.fecha_monitoreo;
      const plagaNombre = m.plagas_enfermedades_catalogo.nombre;
      const incidencia = parseFloat(m.incidencia) || 0;

      plagasUnicas.add(plagaNombre);

      if (!datosPorFecha[fecha]) {
        datosPorFecha[fecha] = {};
      }
      if (!datosPorFecha[fecha][plagaNombre]) {
        datosPorFecha[fecha][plagaNombre] = [];
      }
      datosPorFecha[fecha][plagaNombre].push(incidencia);
    });

    // Calcular promedios y formatear para Recharts
    const datosFormateados: TendenciaData[] = Object.entries(datosPorFecha)
      .map(([fecha, plagas]) => {
        const punto: TendenciaData = {
          fecha: formatearFechaCorta(fecha),
          semana: obtenerNumeroSemana(new Date(fecha)),
        };

        Object.entries(plagas).forEach(([plaga, incidencias]) => {
          const promedio = incidencias.reduce((a, b) => a + b, 0) / incidencias.length;
          punto[plaga] = Math.round(promedio * 10) / 10; // Redondear a 1 decimal
        });

        return punto;
      })
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

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

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* HEADER */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#73991C]/10 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-[#73991C]" />
          </div>
          <div>
            <h3 className="text-[#172E08]">
              Tendencias de Incidencia
            </h3>
            <p className="text-[#4D240F]/60">
              {formatearFechaCorta(rangoFechas.inicio ? rangoFechas.inicio.toISOString().split('T')[0] : '1900-01-01')} - {formatearFechaCorta(rangoFechas.fin.toISOString().split('T')[0])}
            </p>
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

      {/* GRÁFICO */}
      <div className="p-6">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={tendencias}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7EDDD" />
            <XAxis 
              dataKey="fecha" 
              stroke="#4D240F"
              style={{ fontSize: '12px' }}
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