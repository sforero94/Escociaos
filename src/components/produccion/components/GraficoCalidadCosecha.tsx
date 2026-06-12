import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { BarChart2 } from 'lucide-react';

interface DatoCalidadCosecha {
  cosecha: string;
  cosecha_label: string;
  kg_exportacion: number;
  kg_nacional: number;
  kg_sin_desglose: number;
}

interface GraficoCalidadCosechaProps {
  data: DatoCalidadCosecha[];
  loading?: boolean;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
  return (
    <div className="bg-white p-4 border border-gray-200 shadow-lg rounded-lg text-sm z-50 min-w-[180px]">
      <p className="font-bold text-gray-800 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: p.fill }} />
            <span className="text-gray-600">{p.name}</span>
          </div>
          <span className="font-mono font-medium">
            {(p.value as number).toLocaleString('es-CO')} kg
          </span>
        </div>
      ))}
      <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between">
        <span className="text-gray-500">Total</span>
        <span className="font-mono font-bold">{total.toLocaleString('es-CO')} kg</span>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-64 mb-4" />
      <div className="h-[300px] bg-gray-100 rounded" />
    </div>
  );
}

/**
 * Gráfico de barras apiladas exportación vs nacional por cosecha.
 * Sólo se renderiza si hay al menos un registro con desglose de calidad.
 * Registros sin desglose aparecen como "Sin clasificar".
 */
export function GraficoCalidadCosecha({
  data,
  loading = false,
}: GraficoCalidadCosechaProps) {
  if (loading) return <ChartSkeleton />;

  // No mostrar si no hay data ninguna
  if (!data || data.length === 0) return null;

  // Solo mostrar si al menos un punto tiene desglose de calidad
  const tieneCalidad = data.some((d) => d.kg_exportacion > 0 || d.kg_nacional > 0);
  if (!tieneCalidad) return null;

  const tieneSinDesglose = data.some((d) => d.kg_sin_desglose > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
          <BarChart2 className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Distribución Exportación / Nacional
          </h3>
          <p className="text-sm text-gray-500">
            KG por destino de mercado por cosecha
          </p>
        </div>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
            barCategoryGap="30%"
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="cosecha_label"
              stroke="#9ca3af"
              tick={{ fontSize: 12 }}
              tickMargin={8}
            />
            <YAxis
              stroke="#9ca3af"
              tick={{ fontSize: 12 }}
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
              }
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: 12, fontSize: 13 }} />
            <Bar
              dataKey="kg_exportacion"
              name="Exportación"
              stackId="calidad"
              fill="#3b82f6"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="kg_nacional"
              name="Nacional"
              stackId="calidad"
              fill="#10b981"
              radius={[0, 0, 0, 0]}
            />
            {tieneSinDesglose && (
              <Bar
                dataKey="kg_sin_desglose"
                name="Sin clasificar"
                stackId="calidad"
                fill="#d1d5db"
                radius={[4, 4, 0, 0]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Las cosechas sin desglose de calidad aparecen en gris. El desglose exportación/nacional
        está disponible a partir de los registros con migración 046.
      </p>
    </div>
  );
}
