import {
  ComposedChart,
  Line,
  LineChart,
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

interface GraficoHumedadRadiacionProps {
  data: LecturaClimaAgregada[];
  dataAnual?: SerieAnual | null;
}

export function GraficoHumedadRadiacion({ data, dataAnual }: GraficoHumedadRadiacionProps) {
  if (dataAnual && dataAnual.datos.length > 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Humedad Promedio (%)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dataAnual.datos}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#999" />
            <YAxis
              label={{ value: '%', angle: -90, position: 'insideLeft' }}
              domain={[0, 100]}
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
                dataKey={`humedad_${año}`}
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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Humedad y Radiacion Solar</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-400">Sin datos</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Humedad y Radiación Solar</h3>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="fecha" tickFormatter={formatFecha} tick={{ fontSize: 11 }} stroke="#999" />
          <YAxis yAxisId="left" label={{ value: '% Humedad', angle: -90, position: 'insideLeft' }} domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#999" />
          <YAxis yAxisId="right" orientation="right" label={{ value: 'W/m²', angle: 90, position: 'insideRight' }} tick={{ fontSize: 11 }} stroke="#999" />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
            formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : value)}
          />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="humedad_pct_promedio" stroke="#3b82f6" strokeWidth={2} dot={false} name="Humedad (%)" />
          <Line yAxisId="right" type="monotone" dataKey="radiacion_wm2_promedio" stroke="#f59e0b" strokeWidth={2} dot={false} name="Radiación (W/m²)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
