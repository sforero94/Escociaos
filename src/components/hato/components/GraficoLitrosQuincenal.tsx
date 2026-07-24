// ARCHIVO: components/hato/components/GraficoLitrosQuincenal.tsx
// DESCRIPCIÓN: Card "Litros por quincena al camión" de `/hato-lechero/
// produccion` (Figma alignment spec Wave 2b, §6) -- adopta el look & feel
// de barras del mock "Litros diarios al camión" del Figma, pero rotulado
// honestamente: el dato real es QUINCENAL (V3/D2, S5), nunca diario --
// mismo criterio de relabeling que `CurvaProduccionLeche.tsx` usó para la
// curva de PL. La quincena más reciente se resalta en verde oscuro
// (`--primary`); el resto queda en verde pálido (`--secondary`). Historial
// vacío (caso real de este entorno hoy) => estado "Sin registros aún",
// NUNCA barras en 0 como si fueran datos reales (spec §0b).

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { formatNumber } from '@/utils/format';
import { prepararPuntosLitrosQuincenal, promedioLitrosQuincenal } from '@/utils/graficoLitrosQuincenal';
import type { HatoProduccionQuincenal } from '@/types/hato';

// #73991C == --primary (quincena actual), #BFD97D == --secondary (resto) --
// hex directo, no clases de Tailwind: son `fill` de un `<Cell>` de SVG, no
// hay arbitrario de Tailwind que aplique dentro del canvas de Recharts
// (mismo criterio que CurvaProduccionLeche.tsx/IngresosTrimestreChart.tsx).
const COLOR_ACTUAL = '#73991C';
const COLOR_PASADO = '#BFD97D';

export function GraficoLitrosQuincenal({ historial }: { historial: HatoProduccionQuincenal[] }) {
  const puntos = prepararPuntosLitrosQuincenal(historial);
  const promedio = promedioLitrosQuincenal(puntos);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-gray-900">Litros por quincena al camión</h3>
        {promedio != null && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 flex-shrink-0">
            Prom. {formatNumber(promedio)} L
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Recolección quincenal confirmada por el Pomar — dato distinto del pesaje semanal por vaca.
      </p>
      {puntos.length === 0 ? (
        <div className="text-center py-8">
          <BarChart3 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Sin registros aún.</p>
        </div>
      ) : (
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={puntos} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" width={44} tickFormatter={(v: number) => formatNumber(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
                formatter={(value: number) => [`${formatNumber(value)} L`, 'Litros']}
              />
              <Bar dataKey="litros" radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey="litros"
                  position="top"
                  formatter={(v: number) => formatNumber(v)}
                  style={{ fontSize: 11, fill: '#4b5563' }}
                />
                {puntos.map((p) => (
                  <Cell key={p.clave} fill={p.esActual ? COLOR_ACTUAL : COLOR_PASADO} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
