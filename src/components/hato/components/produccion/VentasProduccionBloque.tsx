// ARCHIVO: components/hato/components/produccion/VentasProduccionBloque.tsx
// DESCRIPCIÓN: bloque "Ventas" de Producción v2 -- el DATO REAL (D2/D18):
// litros que recogió el camión según la liquidación de El Pomar y los
// ingresos del negocio Hato Lechero. Gerencia-only: `fin_ingresos` es
// Gerencia por RLS, y sin el embed una quincena `medido` no tiene litros.
// Lo monta `ProduccionView` detrás de `RoleGuard`.

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DollarSign, Droplet, Loader2, Truck } from 'lucide-react';
import { formatMillonesCOP, formatNumber } from '@/utils/format';
import { resumirVentasPeriodo, variacionContraAnterior, type QuincenaVenta } from '@/utils/hato/produccionV2';
import type { RangoFecha } from '@/utils/hato/litrosPesados';
import { useRepartoVentasHato } from '../../hooks/useRepartoVentasHato';
import { HatoKpiCard } from '../HatoKpiCard';
import { deltaContraAnterior } from './kpiDelta';

const COLOR_REAL = '#73991C';

function FilaIngreso({ label, valor, total }: { label: string; valor: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (valor / total) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm text-gray-700">
        <span>{label}</span>
        <span className="font-semibold text-gray-900">{formatMillonesCOP(valor)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function VentasProduccionBloque({
  historial,
  cargandoHistorial,
  errorHistorial,
  rango,
  rangoAnterior,
  etiquetaAnterior,
}: {
  historial: QuincenaVenta[];
  cargandoHistorial: boolean;
  errorHistorial: string | null;
  rango: RangoFecha;
  rangoAnterior: RangoFecha;
  etiquetaAnterior: string;
}) {
  const { ingresos, loading, error } = useRepartoVentasHato();

  const actual = useMemo(() => resumirVentasPeriodo(historial, ingresos, rango), [historial, ingresos, rango]);
  const anterior = useMemo(() => resumirVentasPeriodo(historial, ingresos, rangoAnterior), [historial, ingresos, rangoAnterior]);

  const cargando = cargandoHistorial || loading;
  const fallo = errorHistorial ?? error;

  const barras = actual.barras.map((b) => ({ etiqueta: b.etiqueta, litros: b.litros }));
  const reparto = actual.reparto;

  // Una quincena cerrada sin liquidación (de este período o del anterior)
  // fabricaría una caída al comparar: se muestra la cifra, sin comparación.
  const faltantes = actual.quincenasSinLiquidacion + anterior.quincenasSinLiquidacion;
  const incompleto = faltantes > 0;
  const avisoIncompleto =
    actual.quincenasSinLiquidacion > 0
      ? `Falta la liquidación de ${actual.quincenasSinLiquidacion} quincena${actual.quincenasSinLiquidacion === 1 ? '' : 's'}. Sin comparación.`
      : `Al período anterior le faltan liquidaciones. Sin comparación.`;

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Ventas</h2>
          <p className="text-xs text-gray-500">
            Litros que recogió el camión y lo que se cobró · liquidación de El Pomar e ingresos del hato
          </p>
        </div>
        <span className="whitespace-nowrap rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
          Dato real
        </span>
      </div>

      {cargando ? (
        <p className="flex items-center text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando ventas…
        </p>
      ) : fallo ? (
        <p className="text-sm text-red-600">{fallo}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <HatoKpiCard
              icon={Truck}
              tone="green"
              label="Litros vendidos"
              value={actual.litrosVendidos == null ? '—' : formatNumber(actual.litrosVendidos)}
              unit={actual.litrosVendidos == null ? undefined : 'L'}
              delta={incompleto ? undefined : deltaContraAnterior(variacionContraAnterior(actual.litrosVendidos, anterior.litrosVendidos).variacion, etiquetaAnterior)}
              sub={actual.litrosVendidos == null ? 'Sin liquidaciones en el período' : incompleto ? avisoIncompleto : undefined}
            />
            <HatoKpiCard
              icon={Droplet}
              tone="brown"
              label="Litros vendidos por vaca"
              value={actual.litrosPorVaca == null ? '—' : formatNumber(actual.litrosPorVaca)}
              unit={actual.litrosPorVaca == null ? undefined : 'L'}
              delta={deltaContraAnterior(variacionContraAnterior(actual.litrosPorVaca, anterior.litrosPorVaca).variacion, etiquetaAnterior)}
              sub={
                actual.litrosPorVaca != null
                  ? 'Litros vendidos ÷ vacas en ordeño'
                  : actual.quincenasSinVacas > 0
                    ? 'Falta el número de vacas de una quincena. Complétalo en Cargas.'
                    : 'Sin conteo de vacas en ordeño'
              }
            />
            <HatoKpiCard
              icon={DollarSign}
              tone="blue"
              label="Ingreso del período"
              value={actual.ingreso == null ? '—' : formatMillonesCOP(actual.ingreso)}
              delta={incompleto ? undefined : deltaContraAnterior(variacionContraAnterior(actual.ingreso, anterior.ingreso).variacion, etiquetaAnterior)}
              sub={actual.ingreso == null ? 'Sin ingresos en el período' : incompleto ? avisoIncompleto : undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <p className="mb-2 text-sm font-semibold text-gray-900">Litros vendidos por quincena</p>
              {barras.every((b) => b.litros == null) ? (
                <p className="py-8 text-sm text-gray-400">Sin liquidaciones en el período.</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barras} margin={{ top: 8, right: 8, bottom: 16, left: 8 }}>
                      <CartesianGrid strokeDasharray="0" stroke="#F3F4F6" vertical={false} />
                      <XAxis
                        dataKey="etiqueta"
                        tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        stroke="#E5E7EB"
                        interval="preserveStartEnd"
                        label={{ value: 'Quincena de liquidación', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#9CA3AF' }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        stroke="#E5E7EB"
                        width={64}
                        tickFormatter={(v: number) => `${formatNumber(v)} L`}
                      />
                      <Tooltip
                        formatter={(v: number) => [`${formatNumber(v)} L`, 'Litros vendidos']}
                        cursor={{ fill: '#F8FAF5' }}
                      />
                      <Bar dataKey="litros" fill={COLOR_REAL} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">De dónde vino el ingreso</p>
              {!reparto || reparto.total <= 0 ? (
                <p className="text-sm text-gray-400">Sin ingresos en el período.</p>
              ) : (
                <>
                  <FilaIngreso label="Venta de leche" valor={reparto.leche.valor} total={reparto.total} />
                  <FilaIngreso label="Venta de terneros" valor={reparto.terneros.valor} total={reparto.total} />
                  <FilaIngreso label="Venta de vacas" valor={reparto.descarte.valor} total={reparto.total} />
                  {reparto.otros.valor > 0 && <FilaIngreso label="Otros" valor={reparto.otros.valor} total={reparto.total} />}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
