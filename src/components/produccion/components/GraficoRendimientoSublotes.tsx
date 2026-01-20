import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Grid3X3, Award } from 'lucide-react';
import type {
  RendimientoSubloteData,
  TopSubloteData,
  MetricaProduccion,
} from '../../../types/produccion';
import { METRICA_LABELS, formatMetricValue } from '../../../types/produccion';

interface GraficoRendimientoSublotesProps {
  scatterData: RendimientoSubloteData[];
  topData: TopSubloteData[];
  metrica: MetricaProduccion;
  loading?: boolean;
}

// Custom tooltip para scatter
function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as RendimientoSubloteData;
    return (
      <div className="bg-white p-4 border border-gray-200 shadow-lg rounded-lg text-sm z-50">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: data.lote_color }}
          />
          <span className="font-bold text-gray-800">{data.sublote_nombre}</span>
        </div>
        <div className="space-y-1 text-gray-600">
          <p>
            Lote: <span className="font-medium">{data.lote_nombre}</span>
          </p>
          <p>
            Cosecha: <span className="font-medium">{data.cosecha}</span>
          </p>
          <p>
            KG Totales:{' '}
            <span className="font-mono font-medium">
              {data.kg_totales.toLocaleString('es-CO')}
            </span>
          </p>
          <p>
            KG/Arbol:{' '}
            <span className="font-mono font-medium">
              {data.kg_por_arbol.toLocaleString('es-CO', {
                minimumFractionDigits: 2,
              })}
            </span>
          </p>
          <p>
            Arboles:{' '}
            <span className="font-mono font-medium">
              {data.arboles.toLocaleString('es-CO')}
            </span>
          </p>
        </div>
      </div>
    );
  }
  return null;
}

function ChartSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
        <div className="h-[400px] bg-gray-100 rounded" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-32 mb-4" />
        <div className="space-y-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="h-[400px] flex flex-col items-center justify-center text-gray-500">
        <Grid3X3 className="w-12 h-12 mb-4 text-gray-300" />
        <p className="text-lg font-medium">No hay datos de sublotes</p>
        <p className="text-sm">
          Los datos a nivel sublote estan disponibles desde T24
        </p>
      </div>
    </div>
  );
}

export function GraficoRendimientoSublotes({
  scatterData,
  topData,
  metrica,
  loading = false,
}: GraficoRendimientoSublotesProps) {
  if (loading) {
    return <ChartSkeleton />;
  }

  if (!scatterData || scatterData.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Scatter Chart */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#73991C]/10 rounded-lg flex items-center justify-center">
            <Grid3X3 className="w-5 h-5 text-[#73991C]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Rendimiento por Sublote
            </h3>
            <p className="text-sm text-gray-500">
              KG Totales vs KG/Arbol (color = lote)
            </p>
          </div>
        </div>

        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                type="number"
                dataKey="kg_totales"
                name="KG Totales"
                stroke="#9ca3af"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                label={{
                  value: 'KG Totales',
                  position: 'bottom',
                  offset: 0,
                  style: { fill: '#9ca3af', fontSize: 12 },
                }}
              />
              <YAxis
                type="number"
                dataKey="kg_por_arbol"
                name="KG/Arbol"
                stroke="#9ca3af"
                tick={{ fontSize: 12 }}
                label={{
                  value: 'KG/Arbol',
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle', fill: '#9ca3af', fontSize: 12 },
                }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter name="Sublotes" data={scatterData}>
                {scatterData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.lote_color}
                    fillOpacity={0.8}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Sublotes List */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <Award className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Top 10</h3>
            <p className="text-sm text-gray-500">{METRICA_LABELS[metrica]}</p>
          </div>
        </div>

        <div className="space-y-2 max-h-[420px] overflow-y-auto">
          {topData.map((item) => (
            <div
              key={`${item.sublote_id}-${item.ranking}`}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                    item.ranking <= 3
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {item.ranking}
                </span>
                <div>
                  <p className="font-medium text-gray-800">{item.sublote_nombre}</p>
                  <div className="flex items-center gap-1">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: item.lote_color }}
                    />
                    <p className="text-xs text-gray-500">{item.lote_nombre}</p>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono font-bold text-gray-900">
                  {formatMetricValue(item.valor, item.metrica)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
