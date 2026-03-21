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

interface GraficoPrecipitacionProps {
  data: LecturaClimaAgregada[];
  dataAnual?: SerieAnual | null;
}

export function GraficoPrecipitacion({ data, dataAnual }: GraficoPrecipitacionProps) {
  if (dataAnual && dataAnual.datos.length > 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Precipitación Mensual (mm)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dataAnual.datos}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#999" />
            <YAxis
              label={{ value: 'mm', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 11 }}
              stroke="#999"
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
              formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : value)}
            />
            <Legend />
            {dataAnual.años.map((año, i) => (
              <Bar
                key={año}
                dataKey={`lluvia_${año}`}
                fill={YEAR_COLORS[i % YEAR_COLORS.length]}
                name={String(año)}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

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
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Precipitación Acumulada</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="fecha" tickFormatter={formatFecha} tick={{ fontSize: 11 }} stroke="#999" />
          <YAxis label={{ value: 'mm', angle: -90, position: 'insideLeft' }} tick={{ fontSize: 11 }} stroke="#999" />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
            formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : value)}
          />
          <Legend />
          <Bar dataKey="lluvia_diaria_mm" fill="#3b82f6" name="Acumulado diario (mm)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
