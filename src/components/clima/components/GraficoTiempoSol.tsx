import {
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
import { TEXTO_COBERTURA_PARCIAL, TEXTO_TIEMPO_SOL, UMBRAL_TIEMPO_SOL_WM2 } from '@/utils/calculosRadiacion';
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

interface GraficoTiempoSolProps {
  data: LecturaClimaAgregada[];
  dataAnual?: SerieAnual | null;
}

export function GraficoTiempoSol({ data, dataAnual }: GraficoTiempoSolProps) {
  if (dataAnual && dataAnual.datos.length > 0) {
    const haySerie = dataAnual.años.some((año) =>
      dataAnual.datos.some((d) => d[`tiempo_sol_${año}`] != null),
    );
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <TituloClima titulo="Tiempo de sol (h/día)" ayuda={TEXTO_TIEMPO_SOL} />
        {!haySerie ? (
          <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm text-center px-6">
            Sin duración histórica todavía. El rollup nocturno la calcula a partir de lecturas de 5 min (umbral {UMBRAL_TIEMPO_SOL_WM2} W/m²).
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dataAnual.datos}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#999" />
              <YAxis
                label={{ value: 'h', angle: -90, position: 'insideLeft' }}
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
                  dataKey={`tiempo_sol_${año}`}
                  stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  name={String(año)}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <TituloClima titulo="Tiempo de sol" ayuda={TEXTO_TIEMPO_SOL} />
        <div className="flex items-center justify-center h-[300px] text-gray-400">Sin datos</div>
      </div>
    );
  }

  const hayDuracion = data.some(d => d.tiempo_sol_horas != null);
  const diasParciales = data.filter(d => d.cobertura_parcial).length;
  const esHorario = data.some(d => d.fecha.includes(':'));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <TituloClima
        titulo={esHorario ? 'Tiempo de sol (h por hora)' : 'Tiempo de sol (h/día)'}
        ayuda={TEXTO_TIEMPO_SOL}
      />
      {diasParciales > 0 && (
        <p className="text-xs text-amber-700 mb-3">{diasParciales} día{diasParciales > 1 ? 's' : ''} con cobertura parcial — {TEXTO_COBERTURA_PARCIAL}</p>
      )}
      {!hayDuracion ? (
        <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm text-center px-6">
          Sin duración para este rango. En la vista de 24 h se calcula de las lecturas vivas; en días cerrados aparece cuando el rollup nocturno ya corrió.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="fecha" tickFormatter={formatFecha} tick={{ fontSize: 11 }} stroke="#999" />
            <YAxis label={{ value: 'h', angle: -90, position: 'insideLeft' }} tick={{ fontSize: 11 }} stroke="#999" />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
              formatter={(value) => (typeof value === 'number' ? `${value.toFixed(1)} h` : '—')}
            />
            <Legend />
            <Line type="monotone" dataKey="tiempo_sol_horas" stroke="#ea580c" strokeWidth={2} dot={false} name="Tiempo de sol (h)" connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
