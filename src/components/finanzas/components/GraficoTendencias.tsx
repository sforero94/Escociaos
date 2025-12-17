import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { formatNumber } from '../../../utils/format';
import type { TendenciaData } from '../../../types/finanzas';

interface GraficoTendenciasProps {
  data: TendenciaData[];
  loading?: boolean;
}

/**
 * Componente de gráfico de líneas para tendencias de ingresos vs gastos
 */
export function GraficoTendencias({ data, loading = false }: GraficoTendenciasProps) {
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
          Tendencias de Ingresos vs Gastos
        </h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              📈
            </div>
            <p>No hay datos disponibles para el período seleccionado</p>
          </div>
        </div>
      </div>
    );
  }

  // Formatear datos para Recharts
  const chartData = data.map(item => ({
    ...item,
    fecha: item.fecha.length > 7 ? item.fecha.substring(0, 7) : item.fecha, // Asegurar formato YYYY-MM
    ingresos: item.ingresos || 0,
    gastos: item.gastos || 0
  }));

  // Calcular máximo para el eje Y
  const maxValue = Math.max(
    ...chartData.map(d => Math.max(d.ingresos, d.gastos))
  );
  const yAxisMax = Math.ceil(maxValue * 1.1); // 10% de margen superior

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">
        Tendencias de Ingresos vs Gastos
      </h3>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <XAxis
              dataKey="fecha"
              tick={{ fill: '#6B7280', fontSize: 12 }}
              stroke="#E5E7EB"
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6B7280', fontSize: 12 }}
              stroke="#E5E7EB"
              tickLine={false}
              domain={[0, yAxisMax]}
              tickFormatter={(value) => `$${formatNumber(value)}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '14px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              formatter={(value: any, name: string) => [
                `$${formatNumber(value)}`,
                name === 'ingresos' ? 'Ingresos' : 'Gastos'
              ]}
              labelFormatter={(label) => `Período: ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="ingresos"
              stroke="#10B981"
              strokeWidth={3}
              dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2 }}
              name="Ingresos"
            />
            <Line
              type="monotone"
              dataKey="gastos"
              stroke="#EF4444"
              strokeWidth={3}
              dot={{ fill: '#EF4444', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: '#EF4444', strokeWidth: 2 }}
              name="Gastos"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Resumen estadístico */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <p className="text-gray-600">Promedio Ingresos</p>
            <p className="text-lg font-semibold text-green-600">
              ${formatNumber(chartData.reduce((sum, d) => sum + d.ingresos, 0) / chartData.length)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-600">Promedio Gastos</p>
            <p className="text-lg font-semibold text-red-600">
              ${formatNumber(chartData.reduce((sum, d) => sum + d.gastos, 0) / chartData.length)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-600">Flujo Neto Promedio</p>
            <p className={`text-lg font-semibold ${
              chartData.reduce((sum, d) => sum + (d.ingresos - d.gastos), 0) / chartData.length >= 0
                ? 'text-blue-600'
                : 'text-red-600'
            }`}>
              ${formatNumber(chartData.reduce((sum, d) => sum + (d.ingresos - d.gastos), 0) / chartData.length)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}