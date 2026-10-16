// ARCHIVO: components/hato/components/produccion/ProduccionPesadaBloque.tsx
// DESCRIPCIÓN: bloque "Producción pesada" de Producción v2 -- el APROXIMADO
// (D18): el pesaje semanal es una muestra, no la producción total, y nunca
// se suma a las ventas. KPIs, barras por fecha de pesaje (clic → detalle
// mañana/tarde) y las 5 vacas que más y que menos dan, con las semanas
// desde el último parto (comentario del dueño en el lienzo).

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, Droplet, Loader2, TrendingUp } from 'lucide-react';
import { formatNumber } from '@/utils/format';
import {
  rankingVacasPeriodo,
  resumirPesadoPeriodo,
  topYBottom,
  variacionContraAnterior,
  etiquetaDiaPesaje,
  type VacaRanking,
} from '@/utils/hato/produccionV2';
import type { PesajeLitros, RangoFecha } from '@/utils/hato/litrosPesados';
import type { IdentidadAnimalHato } from '../../hooks/useDatosProduccionPorVaca';
import { HatoKpiCard } from '../HatoKpiCard';
import { deltaContraAnterior } from './kpiDelta';

const COLOR_APROXIMADO = '#BFD97D';

export function etiquetaVacaHato(animalId: string, identidad: IdentidadAnimalHato | undefined): string {
  if (!identidad) return 'Vaca sin ficha';
  const chapeta = identidad.numero != null ? `#${identidad.numero}` : 'Sin caravana';
  return identidad.nombre ? `${chapeta} ${identidad.nombre}` : chapeta;
}

function ListaVacas({
  titulo,
  vacas,
  maximo,
  color,
  identidadPorAnimal,
}: {
  titulo: string;
  vacas: VacaRanking[];
  maximo: number;
  color: string;
  identidadPorAnimal: Map<string, IdentidadAnimalHato>;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="text-xs font-semibold text-gray-700">{titulo}</p>
      {vacas.length === 0 ? (
        <p className="text-sm text-gray-400">Sin pesajes en el período.</p>
      ) : (
        vacas.map((v) => (
          <div
            key={v.animalId}
            className="grid items-center gap-x-4 text-sm text-gray-700"
            style={{ gridTemplateColumns: 'minmax(0, 180px) minmax(0, 1fr) 112px' }}
          >
            <Link to={`/hato-lechero/hato/${v.animalId}`} className="truncate text-gray-700 hover:underline">
              {etiquetaVacaHato(v.animalId, identidadPorAnimal.get(v.animalId))}
            </Link>
            <div className="h-2 rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full"
                style={{ width: `${maximo > 0 ? (v.litros / maximo) * 100 : 0}%`, backgroundColor: color }}
              />
            </div>
            <span className="whitespace-nowrap text-right">
              <strong className="text-gray-900">{formatNumber(v.litros, 1)} L</strong>{' '}
              <span className="text-gray-400">{v.semanasDesdeParto == null ? '— sem.' : `${v.semanasDesdeParto} sem.`}</span>
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export function ProduccionPesadaBloque({
  pesajes,
  partosPorAnimal,
  identidadPorAnimal,
  cargando,
  error,
  rango,
  rangoAnterior,
  etiquetaAnterior,
  etiquetaPeriodo,
  onFechaClick,
}: {
  pesajes: PesajeLitros[];
  partosPorAnimal: Map<string, string[]>;
  identidadPorAnimal: Map<string, IdentidadAnimalHato>;
  cargando: boolean;
  error: string | null;
  rango: RangoFecha;
  rangoAnterior: RangoFecha;
  etiquetaAnterior: string;
  etiquetaPeriodo: string;
  onFechaClick: (fecha: string) => void;
}) {
  const actual = useMemo(() => resumirPesadoPeriodo(pesajes, rango), [pesajes, rango]);
  const anterior = useMemo(() => resumirPesadoPeriodo(pesajes, rangoAnterior), [pesajes, rangoAnterior]);
  const ranking = useMemo(() => rankingVacasPeriodo(pesajes, rango, partosPorAnimal), [pesajes, rango, partosPorAnimal]);
  const { top, bottom } = useMemo(() => topYBottom(ranking), [ranking]);
  const maximo = ranking[0]?.litros ?? 0;

  const ultimoPesaje = useMemo(() => {
    let max: string | null = null;
    for (const p of pesajes) if (max == null || p.fecha > max) max = p.fecha;
    return max;
  }, [pesajes]);

  const barras = actual.barras.map((b) => ({ ...b, etiqueta: etiquetaDiaPesaje(b.fecha) }));

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Producción pesada</h2>
          <p className="text-xs text-gray-500">
            Litros de cada vaca, mañana y tarde, un día por semana. Es una muestra: no es la producción total ni se suma a las ventas.
          </p>
        </div>
        <span className="whitespace-nowrap rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          Aproximado
        </span>
      </div>

      {cargando ? (
        <p className="flex items-center text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando pesajes…
        </p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <HatoKpiCard
              icon={TrendingUp}
              tone="green"
              label="Litros pesados del hato al día"
              value={actual.litrosHatoDia == null ? '—' : formatNumber(actual.litrosHatoDia)}
              unit={actual.litrosHatoDia == null ? undefined : 'L'}
              delta={deltaContraAnterior(variacionContraAnterior(actual.litrosHatoDia, anterior.litrosHatoDia).variacion, etiquetaAnterior)}
              sub={actual.litrosHatoDia == null ? 'Sin pesajes en el período' : undefined}
            />
            <HatoKpiCard
              icon={Droplet}
              tone="brown"
              label="Litros pesados promedio por vaca"
              value={actual.litrosPorVaca == null ? '—' : formatNumber(actual.litrosPorVaca, 1)}
              unit={actual.litrosPorVaca == null ? undefined : 'L'}
              sub={`${actual.vacasPesadas} vacas pesadas · ${actual.nPesajes} pesajes en ${etiquetaPeriodo}`}
            />
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Último pesaje</p>
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                  <CalendarDays className="h-5 w-5" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{ultimoPesaje ? etiquetaDiaPesaje(ultimoPesaje) : '—'}</p>
              <Link to="/hato-lechero/cargas#carga-pesaje" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                Ver o corregir en Cargas
              </Link>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-900">Litros pesados del hato al día, en cada pesaje</p>
            {barras.length === 0 ? (
              <p className="py-8 text-sm text-gray-400">Sin pesajes en el período.</p>
            ) : (
              <>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barras} margin={{ top: 8, right: 8, bottom: 16, left: 8 }}>
                      <CartesianGrid stroke="#F3F4F6" vertical={false} />
                      <XAxis
                        dataKey="etiqueta"
                        tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        stroke="#E5E7EB"
                        interval="preserveStartEnd"
                        label={{ value: 'Fecha del pesaje', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#9CA3AF' }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        stroke="#E5E7EB"
                        width={56}
                        tickFormatter={(v: number) => `${formatNumber(v)} L`}
                      />
                      <Tooltip
                        formatter={(v: number, _n, item) => [
                          `${formatNumber(v)} L · ${(item?.payload as { nVacas?: number })?.nVacas ?? 0} vacas`,
                          'Pesado',
                        ]}
                        cursor={{ fill: '#F8FAF5' }}
                      />
                      <Bar
                        dataKey="litros"
                        fill={COLOR_APROXIMADO}
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(d: { fecha?: string }) => d?.fecha && onFechaClick(d.fecha)}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-gray-500">Toca una barra o una fecha para ver la mañana y la tarde de cada vaca:</p>
                  {barras.map((b) => (
                    <button
                      key={b.fecha}
                      type="button"
                      onClick={() => onFechaClick(b.fecha)}
                      className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {b.etiqueta}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-x-12 gap-y-6 lg:grid-cols-2">
            <ListaVacas
              titulo="Las 5 que más dan · litros pesados por día · semanas desde el parto"
              vacas={top}
              maximo={maximo}
              color="#73991C"
              identidadPorAnimal={identidadPorAnimal}
            />
            <ListaVacas
              titulo="Las 5 que menos dan · litros pesados por día · semanas desde el parto"
              vacas={bottom}
              maximo={maximo}
              color="#D97706"
              identidadPorAnimal={identidadPorAnimal}
            />
          </div>
        </>
      )}
    </section>
  );
}
