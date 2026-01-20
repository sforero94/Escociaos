import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Info } from 'lucide-react';
import type {
  TendenciaHistoricaData,
  MetricaProduccion,
} from '../../../types/produccion';
import {
  LOT_COLORS,
  LOT_NAMES,
  METRICA_LABELS,
  METRICA_UNITS,
} from '../../../types/produccion';

interface GraficoTendenciasHistoricoProps {
  data: TendenciaHistoricaData[];
  metrica: MetricaProduccion;
  lotes: string[];
  loading?: boolean;
}

// Custom tooltip
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 border border-gray-200 shadow-lg rounded-lg text-sm z-50">
        <p className="font-bold text-gray-800 mb-3">{label}</p>
        <div className="space-y-2">
          {payload
            .sort((a: any, b: any) => b.value - a.value)
            .map((entry: any, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-600 min-w-[100px]">
                  {LOT_NAMES[entry.dataKey] || entry.dataKey}:
                </span>
                <span className="font-mono font-medium">
                  {typeof entry.value === 'number'
                    ? entry.value.toLocaleString('es-CO', {
                        maximumFractionDigits: 2,
                      })
                    : entry.value}
                </span>
              </div>
            ))}
        </div>
      </div>
    );
  }
  return null;
}

function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-64 mb-4" />
        <div className="h-[400px] bg-gray-100 rounded flex items-center justify-center">
          <span className="text-gray-400">Cargando grafico...</span>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="h-[400px] flex flex-col items-center justify-center text-gray-500">
        <TrendingUp className="w-12 h-12 mb-4 text-gray-300" />
        <p className="text-lg font-medium">No hay datos disponibles</p>
        <p className="text-sm">Ajusta los filtros para ver el historico</p>
      </div>
    </div>
  );
}

export function GraficoTendenciasHistorico({
  data,
  metrica,
  lotes,
  loading = false,
}: GraficoTendenciasHistoricoProps) {
  if (loading) {
    return <ChartSkeleton />;
  }

  if (!data || data.length === 0) {
    return <EmptyState />;
  }

  // Calcular maximo para eje Y
  const maxValue = Math.max(
    ...data.flatMap((d) =>
      lotes.map((lote) => (typeof d[lote] === 'number' ? d[lote] : 0) as number)
    )
  );
  const yAxisMax = Math.ceil(maxValue * 1.1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#73991C]/10 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-[#73991C]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Evolucion de Produccion por Lote
            </h3>
            <p className="text-sm text-gray-500">
              Metrica: {METRICA_LABELS[metrica]}
            </p>
          </div>
        </div>
      </div>

      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="cosecha"
              stroke="#9ca3af"
              tick={{ fontSize: 12 }}
              tickMargin={10}
            />
            <YAxis
              stroke="#9ca3af"
              tick={{ fontSize: 12 }}
              domain={[0, yAxisMax]}
              tickFormatter={(value) =>
                metrica === 'kg_totales'
                  ? `${(value / 1000).toFixed(0)}k`
                  : value.toFixed(1)
              }
              label={{
                value: METRICA_UNITS[metrica],
                angle: -90,
                position: 'insideLeft',
                offset: 0,
                style: { textAnchor: 'middle', fill: '#9ca3af', fontSize: 12 },
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: 20 }}
              formatter={(value) => LOT_NAMES[value] || value}
            />
            {lotes.map((lote) => (
              <Line
                key={lote}
                type="monotone"
                dataKey={lote}
                name={lote}
                stroke={LOT_COLORS[lote] || '#6b7280'}
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: 'white' }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tip informativo */}
      <div className="mt-4 p-3 bg-blue-50 text-blue-800 text-sm rounded-lg border border-blue-100 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <strong>Tip:</strong> Cambia la metrica a &quot;KG/Arbol&quot; para comparar
          la eficiencia real de cada lote independientemente de su tamano.
        </div>
      </div>
    </div>
  );
}
