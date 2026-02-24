import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell } from 'recharts';
import { formatNumber } from '../../../utils/format';
import type { DistribucionData, FiltrosFinanzas } from '../../../types/finanzas';

type ChartType = 'gastos' | 'ingresos';

interface DistributionChartProps {
  data: DistribucionData[];
  loading?: boolean;
  filtrosActivos?: FiltrosFinanzas;
  type: ChartType;
}

// Color palettes
const COLORS_GASTOS = [
  '#EF4444', '#F59E0B', '#F97316', '#EC4899', '#8B5CF6',
  '#3B82F6', '#06B6D4', '#14B8A6', '#10B981', '#84CC16',
  '#22C55E', '#6366F1', '#A855F7', '#F43F5E', '#EAB308',
];

const COLORS_INGRESOS = [
  '#10B981', '#22C55E', '#84CC16', '#34D399', '#059669',
  '#16A34A', '#65A30D', '#4ADE80', '#86EFAC', '#047857',
  '#15803D', '#3F6212', '#6EE7B7', '#14532D', '#A7F3D0',
];

const CONFIG = {
  gastos: {
    title: 'Distribución de Gastos por Categoría',
    colors: COLORS_GASTOS,
    navPath: '/finanzas/gastos',
    tooltipLabel: 'gastos',
    summaryLabel: 'gastos',
  },
  ingresos: {
    title: 'Distribución de Ingresos por Categoría',
    colors: COLORS_INGRESOS,
    navPath: '/finanzas/ingresos',
    tooltipLabel: 'ingresos',
    summaryLabel: 'ingresos',
  },
};

function CustomTooltip({ active, payload, tooltipLabel }: { active?: boolean; payload?: any[]; tooltipLabel: string }) {
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
          Click para ver {tooltipLabel} de esta categoría
        </p>
      </div>
    );
  }
  return null;
}

/**
 * Generic distribution chart component for gastos and ingresos
 */
export function DistributionChart({ data, loading = false, filtrosActivos, type }: DistributionChartProps) {
  const navigate = useNavigate();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const config = CONFIG[type];

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
          {config.title}
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

  // Sort data and assign colors
  const chartData = [...data]
    .sort((a, b) => b.valor - a.valor)
    .map((item, index) => ({
      ...item,
      fill: config.colors[index % config.colors.length]
    }));

  // Navigate with filters
  const handleBarClick = (data: any) => {
    if (data && data.categoria_id) {
      navigate(config.navPath, {
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
        {config.title}
      </h3>

      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
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
            <Tooltip content={<CustomTooltip tooltipLabel={config.tooltipLabel} />} />
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

      {/* Summary */}
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
              Categorías con {config.summaryLabel}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Backward-compatible exports
export function GraficoDistribucion(props: Omit<DistributionChartProps, 'type'>) {
  return <DistributionChart {...props} type="gastos" />;
}

export function GraficoDistribucionIngresos(props: Omit<DistributionChartProps, 'type'>) {
  return <DistributionChart {...props} type="ingresos" />;
}
