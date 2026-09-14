import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import type { LecturaClimaAgregada, SerieAnual } from '@/types/clima';
import { TEXTO_COBERTURA_PARCIAL, TEXTO_ENERGIA_SOLAR } from '@/utils/calculosRadiacion';
import { TituloClima } from './TituloClima';

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

interface GraficoEnergiaSolarProps {
  data: LecturaClimaAgregada[];
  dataAnual?: SerieAnual | null;
}

export function GraficoEnergiaSolar({ data, dataAnual }: GraficoEnergiaSolarProps) {
  if (dataAnual && dataAnual.datos.length > 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <TituloClima titulo="Energía solar (kWh/m²/día)" ayuda={TEXTO_ENERGIA_SOLAR} />
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dataAnual.datos}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#999" />
            <YAxis
              label={{ value: 'kWh/m²', angle: -90, position: 'insideLeft' }}
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
                dataKey={`energia_${año}`}
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
        <TituloClima titulo="Energía solar (kWh/m²)" ayuda={TEXTO_ENERGIA_SOLAR} />
        <div className="flex items-center justify-center h-[300px] text-gray-400">Sin datos</div>
      </div>
    );
  }

  const diasParciales = data.filter(d => d.cobertura_parcial).length;
  const esHorario = data.some(d => d.fecha.includes(':'));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <TituloClima
        titulo={esHorario ? 'Energía solar (kWh/m² por hora)' : 'Energía solar (kWh/m²/día)'}
        ayuda={TEXTO_ENERGIA_SOLAR}
      />
      {diasParciales > 0 && (
        <p className="text-xs text-amber-700 mb-3">{diasParciales} día{diasParciales > 1 ? 's' : ''} con cobertura parcial — {TEXTO_COBERTURA_PARCIAL}</p>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="fecha" tickFormatter={formatFecha} tick={{ fontSize: 11 }} stroke="#999" />
          <YAxis label={{ value: 'kWh/m²', angle: -90, position: 'insideLeft' }} tick={{ fontSize: 11 }} stroke="#999" />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
            formatter={(value) => (typeof value === 'number' ? `${value.toFixed(1)} kWh/m²` : value)}
          />
          <Legend />
          {!esHorario && <ReferenceArea y1={5} y2={7} fill="#16a34a" fillOpacity={0.08} />}
          <Line type="monotone" dataKey="energia_kwh_m2" stroke="#f59e0b" strokeWidth={2} dot={false} name="Energía (kWh/m²)" connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
