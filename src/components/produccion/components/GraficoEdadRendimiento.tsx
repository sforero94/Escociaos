import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Label,
} from 'recharts';
import { Calendar, Info, TreeDeciduous, Activity } from 'lucide-react';
import type { EdadRendimientoData, MetricaProduccion } from '../../../types/produccion';
import { METRICA_LABELS, LOT_NAMES } from '../../../types/produccion';

interface GraficoEdadRendimientoProps {
  data: EdadRendimientoData[];
  metrica: MetricaProduccion;
  loading?: boolean;
}

// Custom tooltip
function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as EdadRendimientoData;
    return (
      <div className="bg-white p-4 border border-gray-200 shadow-lg rounded-lg text-sm z-50">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: data.lote_color }}
          />
          <span className="font-bold text-gray-800">{data.lote_nombre}</span>
          <span className="text-gray-500">({data.lote_codigo})</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">Edad:</span>
            <span className="font-bold">{data.edad_anos} anos</span>
          </div>
          <div className="flex items-center gap-2">
            <TreeDeciduous className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">Rendimiento:</span>
            <span className="font-bold text-blue-600">
              {data.rendimiento.toLocaleString('es-CO', {
                minimumFractionDigits: 2,
              })}{' '}
              kg/arbol
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">Arboles:</span>
            <span className="font-mono">{data.arboles.toLocaleString('es-CO')}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function ChartSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-64 mb-4" />
        <div className="h-[400px] bg-gray-100 rounded" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-32 mb-4" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="h-[400px] flex flex-col items-center justify-center text-gray-500">
        <Calendar className="w-12 h-12 mb-4 text-gray-300" />
        <p className="text-lg font-medium">No hay datos de edad</p>
        <p className="text-sm">Asegurate de tener fecha_siembra en los lotes</p>
      </div>
    </div>
  );
}

export function GraficoEdadRendimiento({
  data,
  metrica,
  loading = false,
}: GraficoEdadRendimientoProps) {
  if (loading) {
    return <ChartSkeleton />;
  }

  if (!data || data.length === 0) {
    return <EmptyState />;
  }

  // Umbral de rentabilidad (estimado)
  const umbralRentabilidad = 4;

  // Calcular tamano de puntos basado en arboles
  const maxArboles = Math.max(...data.map((d) => d.arboles));
  const getPointSize = (arboles: number) => {
    const minSize = 80;
    const maxSize = 400;
    return minSize + ((arboles / maxArboles) * (maxSize - minSize));
  };

  // Agrupar datos por categoria de edad
  const lotesMaduros = data.filter((d) => d.edad_anos >= 5);
  const lotesJovenes = data.filter((d) => d.edad_anos >= 3 && d.edad_anos < 5);
  const lotesNuevos = data.filter((d) => d.edad_anos < 3);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Scatter Chart */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Curva de Productividad por Edad
            </h3>
            <p className="text-sm text-gray-500">
              Edad del lote vs rendimiento promedio (tamano = poblacion)
            </p>
          </div>
        </div>

        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                type="number"
                dataKey="edad_anos"
                name="Edad"
                stroke="#9ca3af"
                tick={{ fontSize: 12 }}
                domain={[0, 'auto']}
                label={{
                  value: 'Edad del Lote (Anos)',
                  position: 'bottom',
                  offset: 10,
                  style: { fill: '#9ca3af', fontSize: 12 },
                }}
              />
              <YAxis
                type="number"
                dataKey="rendimiento"
                name="Rendimiento"
                stroke="#9ca3af"
                tick={{ fontSize: 12 }}
                label={{
                  value: 'Rendimiento (KG/Arbol)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle', fill: '#9ca3af', fontSize: 12 },
                }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <ReferenceLine
                y={umbralRentabilidad}
                stroke="#ef4444"
                strokeDasharray="5 5"
              >
                <Label
                  value="Umbral Rentabilidad (est.)"
                  position="right"
                  fill="#ef4444"
                  fontSize={10}
                />
              </ReferenceLine>
              <Scatter name="Lotes" data={data}>
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.lote_color}
                    fillOpacity={0.8}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Diagnostico Panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Diagnostico</h3>
        </div>

        <div className="space-y-4 max-h-[380px] overflow-y-auto">
          {/* Lotes Maduros */}
          {lotesMaduros.length > 0 && (
            <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
              <h4 className="font-bold text-green-800 text-sm mb-2 flex items-center gap-2">
                <TreeDeciduous className="w-4 h-4" />
                Lotes Maduros (&gt;5 anos)
              </h4>
              <p className="text-sm text-green-700 leading-relaxed">
                {lotesMaduros.map((l) => (
                  <span key={l.lote_id} className="font-medium">
                    {l.lote_nombre}
                    {lotesMaduros.indexOf(l) < lotesMaduros.length - 1 ? ', ' : ''}
                  </span>
                ))}{' '}
                son tu &quot;vaca lechera&quot;. Rendimiento estable. Mantener nutricion
                para evitar veceria.
              </p>
            </div>
          )}

          {/* Lotes en Desarrollo */}
          {lotesJovenes.length > 0 && (
            <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-xl">
              <h4 className="font-bold text-yellow-800 text-sm mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                En Desarrollo (3-5 anos)
              </h4>
              <p className="text-sm text-yellow-800 leading-relaxed">
                {lotesJovenes.map((l) => (
                  <span key={l.lote_id} className="font-medium">
                    {l.lote_nombre}
                    {lotesJovenes.indexOf(l) < lotesJovenes.length - 1 ? ', ' : ''}
                  </span>
                ))}{' '}
                estan en rampa de subida. Esperar aumento progresivo de produccion.
              </p>
            </div>
          )}

          {/* Lotes Nuevos */}
          {lotesNuevos.length > 0 && (
            <div className="p-4 bg-teal-50 border border-teal-100 rounded-xl">
              <h4 className="font-bold text-teal-800 text-sm mb-2 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Potencial Futuro (&lt;3 anos)
              </h4>
              <p className="text-sm text-teal-900 leading-relaxed">
                {lotesNuevos.map((l) => (
                  <span key={l.lote_id} className="font-medium">
                    {l.lote_nombre}
                    {lotesNuevos.indexOf(l) < lotesNuevos.length - 1 ? ', ' : ''}
                  </span>
                ))}{' '}
                tienen bajo rendimiento actual pero es normal. Es una inversion,
                no un fallo.
              </p>
            </div>
          )}

          {/* Tip */}
          <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-lg border border-blue-100">
            <strong>Nota:</strong> El tamano de cada punto representa la cantidad
            de arboles del lote.
          </div>
        </div>
      </div>
    </div>
  );
}
