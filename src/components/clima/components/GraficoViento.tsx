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
import type { LecturaClimaAgregada, SerieAnual } from '@/types/clima';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const YEAR_COLORS = ['#94a3b8', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];

const formatFecha = (fecha: string) => {
  if (/^\d{4}-\d{2}$/.test(fecha)) {
    const [y, m] = fecha.split('-');
    return `${MESES[parseInt(m, 10) - 1]} ${y}`;
  }
  if (fecha.includes(':')) {
    return fecha.split(' ')[1] || fecha;
  }
  const parts = fecha.split('-');
  return `${parts[2]}/${parts[1]}`;
};

interface GraficoVientoProps {
  data: LecturaClimaAgregada[];
  dataAnual?: SerieAnual | null;
}

export function GraficoViento({ data, dataAnual }: GraficoVientoProps) {
  if (dataAnual && dataAnual.datos.length > 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Viento Promedio (km/h)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dataAnual.datos}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#999" />
            <YAxis
              label={{ value: 'km/h', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 11 }}
              stroke="#999"
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
              formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : value)}
            />
            <Legend />
            {dataAnual.años.map((año, i) => (
              <Line
                key={año}
                type="monotone"
                dataKey={`viento_${año}`}
                stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                strokeWidth={2}
                dot={false}
                name={String(año)}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

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
          <XAxis dataKey="fecha" tickFormatter={formatFecha} tick={{ fontSize: 11 }} stroke="#999" />
          <YAxis label={{ value: 'km/h', angle: -90, position: 'insideLeft' }} tick={{ fontSize: 11 }} stroke="#999" />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
            formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : value)}
          />
          <Legend />
          <Line type="monotone" dataKey="viento_kmh_promedio" stroke="#10b981" strokeWidth={2} dot={false} name="Velocidad Promedio" />
          <Line type="monotone" dataKey="rafaga_kmh_max" stroke="#ef4444" strokeWidth={2} dot={false} name="Ráfaga Máxima" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
