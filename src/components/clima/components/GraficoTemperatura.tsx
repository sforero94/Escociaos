import {
  Line,
  Area,
  AreaChart,
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

interface GraficoTemperaturaProps {
  data: LecturaClimaAgregada[];
}

export function GraficoTemperatura({ data }: GraficoTemperaturaProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Temperatura</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-400">Sin datos</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Temperatura</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorMax" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorMin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="fecha"
            tickFormatter={formatFecha}
            tick={{ fontSize: 11 }}
            stroke="#999"
          />
          <YAxis
            label={{ value: '°C', angle: -90, position: 'insideLeft' }}
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
          <Area
            type="monotone"
            dataKey="temp_c_max"
            stroke="#ef4444"
            fill="url(#colorMax)"
            name="Máx"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="temp_c_min"
            stroke="#3b82f6"
            fill="url(#colorMin)"
            name="Mín"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="temp_c_promedio"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            name="Promedio"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
