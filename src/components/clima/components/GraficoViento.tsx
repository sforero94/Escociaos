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
import { LecturaClimaAgregada } from '@/types/clima';

const formatFecha = (fecha: string) => {
  if (fecha.includes(':')) {
    return fecha.split(' ')[1] || fecha;
  }
  const parts = fecha.split('-');
  return `${parts[2]}/${parts[1]}`;
};

interface GraficoVientoProps {
  data: LecturaClimaAgregada[];
}

export function GraficoViento({ data }: GraficoVientoProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Velocidad de Viento</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-400">Sin datos</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Velocidad de Viento</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="fecha"
            tickFormatter={formatFecha}
            tick={{ fontSize: 11 }}
            stroke="#999"
          />
          <YAxis
            label={{ value: 'km/h', angle: -90, position: 'insideLeft' }}
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
          <Line
            type="monotone"
            dataKey="viento_kmh_promedio"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name="Velocidad Promedio"
          />
          <Line
            type="monotone"
            dataKey="rafaga_kmh_max"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            name="Ráfaga Máxima"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
