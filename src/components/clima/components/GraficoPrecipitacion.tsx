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
import { LecturaClimaAgregada } from '@/types/clima';

const formatFecha = (fecha: string) => {
  if (fecha.includes(':')) {
    return fecha.split(' ')[1] || fecha;
  }
  const parts = fecha.split('-');
  return `${parts[2]}/${parts[1]}`;
};

interface GraficoPrecipitacionProps {
  data: LecturaClimaAgregada[];
}

export function GraficoPrecipitacion({ data }: GraficoPrecipitacionProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Precipitacion</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-400">Sin datos</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Precipitación</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="fecha"
            tickFormatter={formatFecha}
            tick={{ fontSize: 11 }}
            stroke="#999"
          />
          <YAxis
            label={{ value: 'mm', angle: -90, position: 'insideLeft' }}
            tick={{ fontSize: 11 }}
            stroke="#999"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
            }}
            formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : value)}
          />
          <Legend />
          <Bar
            dataKey="lluvia_diaria_mm"
            fill="#3b82f6"
            name="Lluvia (mm)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
