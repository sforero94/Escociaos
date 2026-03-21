import {
  Area,
  AreaChart,
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

interface GraficoTemperaturaProps {
  data: LecturaClimaAgregada[];
  dataAnual?: SerieAnual | null;
}

export function GraficoTemperatura({ data, dataAnual }: GraficoTemperaturaProps) {
  if (dataAnual && dataAnual.datos.length > 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Temperatura Promedio (°C)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={dataAnual.datos}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#999" />
            <YAxis
              label={{ value: '°C', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 11 }}
              stroke="#999"
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
              formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : value)}
            />
            <Legend />
            {dataAnual.años.map((año, i) => (
              <Area
                key={año}
                type="monotone"
                dataKey={`temp_${año}`}
                stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                fill="none"
                strokeWidth={2}
                dot={false}
                name={String(año)}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Temperatura</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-400">Sin datos</div>
      </div>
    );
  }

  const hasMaxMin = data.some(d => d.temp_c_max != null || d.temp_c_min != null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Temperatura</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          {hasMaxMin && (
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
          )}
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
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
            formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : value)}
          />
          <Legend />
          {hasMaxMin && (
            <>
              <Area type="monotone" dataKey="temp_c_max" stroke="#ef4444" fill="url(#colorMax)" name="Máx" strokeWidth={2} connectNulls={false} />
              <Area type="monotone" dataKey="temp_c_min" stroke="#3b82f6" fill="url(#colorMin)" name="Mín" strokeWidth={2} connectNulls={false} />
            </>
          )}
          <Area type="monotone" dataKey="temp_c_promedio" stroke="#22c55e" fill="none" strokeWidth={2} dot={false} name="Promedio" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
