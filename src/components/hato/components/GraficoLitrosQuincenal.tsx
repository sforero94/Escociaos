// ARCHIVO: components/hato/components/GraficoLitrosQuincenal.tsx
// DESCRIPCIÓN: Card "Litros por quincena al camión" de `/hato-lechero/
// produccion` (Figma alignment spec Wave 2b, §6) -- adopta el look & feel
// de barras del mock "Litros diarios al camión" del Figma, pero rotulado
// honestamente: el dato real es QUINCENAL (V3/D2, S5), nunca diario --
// mismo criterio de relabeling que `CurvaProduccionLeche.tsx` usó para la
// curva de PL. Historial vacío (caso real de este entorno hoy) => estado
// "Sin registros aún", NUNCA barras en 0 como si fueran datos reales
// (spec §0b).
//
// Owner feedback (este rework, "esa UI para litros por quincena es
// atrocious"): se retiró el borde punteado ámbar de las barras derivadas y
// las etiquetas de valor pasan a texto oscuro estándar (sin color por
// estado). La distinción medido/derivado ahora vive en el FILL de la barra
// -- sólido `--primary` para medido, verde claro `--secondary` para
// derivado -- y en el diálogo de detalle (`DetalleQuincenaVentaDialog`,
// que abre al hacer clic en cualquier barra) es donde vive la explicación
// completa de la procedencia.

import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { formatNumber } from '@/utils/format';
import { prepararPuntosLitrosQuincenal, promedioLitrosQuincenal } from '@/utils/graficoLitrosQuincenal';
import { DetalleQuincenaVentaDialog } from './DetalleQuincenaVentaDialog';
import type { HatoProduccionQuincenalConIngreso } from '../hooks/useProduccionHato';

// Hex directo, no clases de Tailwind: son `fill` de un `<Cell>` de SVG, no
// hay arbitrario de Tailwind que aplique dentro del canvas de Recharts
// (mismo criterio que CurvaProduccionLeche.tsx/IngresosTrimestreChart.tsx).
// #73991C == --primary (quincena medida), #BFD97D == --secondary (derivada
// del backfill -- fill más claro, nunca idéntico a una quincena medida).
const COLOR_MEDIDO = '#73991C';
const COLOR_DERIVADO = '#BFD97D';
// #172E08 == --foreground (texto estándar del repo, nunca ámbar/verde).
const COLOR_ETIQUETA = '#172E08';

export function GraficoLitrosQuincenal({ historial }: { historial: HatoProduccionQuincenalConIngreso[] }) {
  const puntos = prepararPuntosLitrosQuincenal(historial);
  const promedio = promedioLitrosQuincenal(puntos);
  const hayDerivadas = puntos.some((p) => p.esDerivado);
  const [filaSeleccionada, setFilaSeleccionada] = useState<HatoProduccionQuincenalConIngreso | null>(null);

  // Recharts no tipa el payload de `onClick` de `<Bar>`; mismo patrón que
  // `GastosPorCategoriaChart.tsx` (`(entry: any) => onBarClick(entry.name)`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBarClick = (data: any) => {
    const fila = historial.find((h) => h.id === data?.clave) ?? null;
    setFilaSeleccionada(fila);
  };

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
      <div className="mb-4">
        <p className="text-xs text-gray-500">
          Recolección quincenal confirmada por el Pomar — dato distinto del pesaje semanal por vaca. Toca una barra
          para ver el detalle.
        </p>
        {hayDerivadas && (
          <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLOR_MEDIDO }} />
              Medida
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLOR_DERIVADO }} />
              Derivada de un ingreso mensual histórico (backfill)
            </span>
          </p>
        )}
      </div>
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
              <Bar
                dataKey="litros"
                radius={[4, 4, 0, 0]}
                onClick={handleBarClick}
                className="cursor-pointer"
              >
                <LabelList
                  dataKey="litros"
                  position="top"
                  formatter={(v: number) => formatNumber(v)}
                  style={{ fontSize: 11, fill: COLOR_ETIQUETA }}
                />
                {puntos.map((p) => (
                  <Cell key={p.clave} fill={p.esDerivado ? COLOR_DERIVADO : COLOR_MEDIDO} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <DetalleQuincenaVentaDialog
        fila={filaSeleccionada}
        open={filaSeleccionada != null}
        onOpenChange={(open) => { if (!open) setFilaSeleccionada(null); }}
      />
    </div>
  );
}
