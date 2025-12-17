import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell } from 'recharts';
import { formatNumber } from '../../../utils/format';
import type { DistribucionData, FiltrosFinanzas } from '../../../types/finanzas';

interface GraficoDistribucionProps {
  data: DistribucionData[];
  loading?: boolean;
  filtrosActivos?: FiltrosFinanzas;
}

/**
 * Componente de gráfico de barras para distribución de gastos por categoría
 */
export function GraficoDistribucion({ data, loading = false, filtrosActivos }: GraficoDistribucionProps) {
  const navigate = useNavigate();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // Colores para las categorías
  const COLORS = [
    '#EF4444', // Rojo
    '#F59E0B', // Amarillo
    '#F97316', // Naranja
    '#EC4899', // Rosa
    '#8B5CF6', // Morado
    '#3B82F6', // Azul
    '#06B6D4', // Cyan
    '#14B8A6', // Teal
    '#10B981', // Verde
    '#84CC16', // Lima
    '#22C55E', // Verde lima
    '#6366F1', // Indigo
    '#A855F7', // Violeta
    '#F43F5E', // Rojo rosado
    '#EAB308', // Amarillo dorado
  ];

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Distribución de Gastos por Categoría
        </h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              📊
            </div>
            <p>No hay datos disponibles para mostrar</p>
          </div>
        </div>
      </div>
    );
  }

  // Ordenar datos de mayor a menor y asignar colores
  const chartData = [...data]
    .sort((a, b) => b.valor - a.valor)
    .map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));

  // Tooltip personalizado
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{data.categoria}</p>
          <p className="text-sm text-gray-600">
            Valor: <span className="font-semibold">${formatNumber(data.valor)}</span>
          </p>
          <p className="text-sm text-gray-600">
            Porcentaje: <span className="font-semibold">{data.porcentaje}%</span>
          </p>
          <p className="text-xs text-gray-500 mt-1 italic">
            Click para ver gastos de esta categoría
          </p>
        </div>
      );
    }
    return null;
  };

  // Navegar a gastos con todos los filtros activos + categoría
  const handleBarClick = (data: any) => {
    if (data && data.categoria_id) {
        categoria: data.categoria_id,
        filtrosActivos
      });

      navigate('/finanzas/gastos', {
        state: {
          categoria: data.categoria_id,
          periodo: filtrosActivos?.periodo,
          negocio_id: filtrosActivos?.negocio_id,
          region_id: filtrosActivos?.region_id,
          fecha_desde: filtrosActivos?.fecha_desde,
          fecha_hasta: filtrosActivos?.fecha_hasta
        }
      });
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">
        Distribución de Gastos por Categoría
      </h3>

      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              type="number"
              tick={{ fill: '#6B7280', fontSize: 12 }}
              stroke="#E5E7EB"
              tickLine={false}
              tickFormatter={(value: number) => `$${formatNumber(value)}`}
            />
            <YAxis
              type="category"
              dataKey="categoria"
              tick={{ fill: '#6B7280', fontSize: 12 }}
              stroke="#E5E7EB"
              tickLine={false}
              width={150}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="valor"
              radius={[0, 8, 8, 0]}
              onClick={handleBarClick}
              cursor="pointer"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Resumen */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="text-center">
            <p className="text-gray-600">Categoría Principal</p>
            <p className="text-lg font-semibold text-gray-900">
              {chartData[0]?.categoria}
            </p>
            <p className="text-sm text-gray-500">
              {chartData[0]?.porcentaje}% del total
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-600">Total de Categorías</p>
            <p className="text-lg font-semibold text-gray-900">
              {chartData.length}
            </p>
            <p className="text-sm text-gray-500">
              Categorías con gastos
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}