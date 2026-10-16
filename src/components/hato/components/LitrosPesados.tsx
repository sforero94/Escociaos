// ARCHIVO: components/hato/components/LitrosPesados.tsx
// DESCRIPCIÓN: reemplaza el tracker de barras en Hato › Producción.
// Tarjetas + líneas, un punto por fecha de pesaje. Dos vistas (hato y
// por vacas) y un filtro de período. La proyección de 2 semanas es la de
// `proyeccionVacasCongeladas` y se dibuja punteada; no entra en los totales.
// Un turno incompleto (solo AM o solo PM) queda fuera y se dice.

import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Droplet, Loader2, Milk, Search, TrendingUp, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { formatNumber, formatShortDate } from '@/utils/format';
import {
  proyeccionVacasCongeladas,
  proyectarHato,
  type EstadoReproductivoProyeccion,
} from '@/utils/hatoProduccion';
import {
  HORIZONTE_PROYECCION_SEMANAS,
  MAX_VACAS_COMPARADAS,
  SEMANAS_TENDENCIA_PROYECCION,
  alternarVacaSeleccionada,
  cambioContraPeriodoAnterior,
  coincideBusquedaVaca,
  filasGraficoVacas,
  periodoAnteriorIgual,
  rangoPeriodoLitrosPesados,
  resumirLitrosPesados,
  serieHato,
  turnoIncompleto,
  type FilaGraficoVacas,
  type PeriodoLitrosPesados,
  type PesajeLitros,
  type PuntoSerie,
} from '@/utils/hato/litrosPesados';
import type { IdentidadAnimalHato } from '../hooks/useDatosProduccionPorVaca';
import { HatoKpiCard } from './HatoKpiCard';

const NOTA_PESAJE = 'Basado en el pesaje semanal (AM + PM), no es la producción total';
const COLOR_MEDIDO = '#73991C';
const COLOR_PROYECTADO = '#172E08';
const COLORES_VACA = ['#172E08', '#73991C', '#1D4ED8', '#B45309', '#7C3AED', '#0F766E', '#BE123C', '#0369A1'];

const PERIODOS: Array<{ id: PeriodoLitrosPesados; label: string }> = [
  { id: 'quincena', label: 'Quincena' },
  { id: 'mes', label: 'Mes' },
  { id: 'trimestre', label: 'Trimestre' },
  { id: 'semestre', label: 'Semestre' },
  { id: 'anio', label: 'Año' },
  { id: 'personalizado', label: 'Personalizado' },
];

interface LitrosPesadosProps {
  pesajes: PesajeLitros[];
  estadosReproductivos: EstadoReproductivoProyeccion[];
  fechaReferencia: string;
  identidadPorAnimal: Map<string, IdentidadAnimalHato>;
  loading: boolean;
  error: string | null;
  onFechaMedidaClick?: (fecha: string, etiqueta: string) => void;
}

function etiquetaVaca(animalId: string, identidad: IdentidadAnimalHato | undefined): string {
  if (!identidad) return 'Vaca sin ficha';
  const chapeta = identidad.numero != null ? `#${identidad.numero}` : 'Sin chapeta';
  return identidad.nombre ? `${chapeta} ${identidad.nombre}` : chapeta;
}

function textoCambio(variacion: number | null): string {
  if (variacion == null) return '—';
  const porcentaje = formatNumber(variacion * 100, 1);
  return variacion > 0 ? `+${porcentaje}` : porcentaje;
}

interface FilaHatoGrafico {
  fecha: string;
  etiqueta: string;
  tipo: 'medido' | 'proyectado';
  medido: number | null;
  proyectado: number | null;
  nVacas: number;
}

function filasHatoParaGrafico(puntos: PuntoSerie[], clave: 'litros' | 'litrosPorVaca'): FilaHatoGrafico[] {
  const hayProyeccion = puntos.some((p) => p.tipo === 'proyectado');
  const ultimo = hayProyeccion ? [...puntos].reverse().find((p) => p.tipo === 'medido' && p[clave] != null) : undefined;
  return puntos.map((punto) => ({
    fecha: punto.fecha,
    etiqueta: formatShortDate(punto.fecha),
    tipo: punto.tipo,
    nVacas: punto.nVacas,
    medido: punto.tipo === 'medido' ? punto[clave] : null,
    proyectado: punto.tipo === 'proyectado' ? punto[clave] : punto === ultimo ? punto[clave] : null,
  }));
}

function TooltipHato({
  active,
  payload,
  sufijo,
}: {
  active?: boolean;
  payload?: Array<{ payload: FilaHatoGrafico }>;
  sufijo: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const punto = payload[0].payload;
  const litros = punto.tipo === 'proyectado' ? punto.proyectado : punto.medido;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm max-w-xs">
      <p className="font-semibold text-gray-900 mb-1">
        {punto.etiqueta} · {punto.tipo === 'medido' ? 'Medido' : 'Proyectado'}
      </p>
      <p className="text-gray-700">{litros == null ? 'Sin dato' : `${formatNumber(litros, 1)} ${sufijo}`}</p>
      {punto.nVacas > 0 && <p className="text-gray-500">{punto.nVacas} vaca(s) pesada(s)</p>}
      {punto.tipo === 'proyectado' && <p className="text-gray-500">No entra en el total medido.</p>}
    </div>
  );
}

function GraficoHato({
  titulo,
  datos,
  sufijo,
  onMedido,
}: {
  titulo: string;
  datos: FilaHatoGrafico[];
  sufijo: string;
  onMedido?: (fecha: string, etiqueta: string) => void;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-2">{titulo}</h4>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} stroke="#9ca3af" minTickGap={28} />
            <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" width={44} tickFormatter={(v: number) => formatNumber(v)} />
            <Tooltip content={<TooltipHato sufijo={sufijo} />} />
            <Line
              type="monotone"
              dataKey="medido"
              name="Medido"
              stroke={COLOR_MEDIDO}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
              isAnimationActive={false}
              onClick={(data) => {
                const punto = (data as { payload?: FilaHatoGrafico })?.payload;
                if (!punto || punto.tipo !== 'medido' || punto.medido == null || !onMedido) return;
                onMedido(punto.fecha, punto.etiqueta);
              }}
            />
            <Line
              type="monotone"
              dataKey="proyectado"
              name="Proyectado"
              stroke={COLOR_PROYECTADO}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3, strokeDasharray: '0' }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LitrosPesados({
  pesajes,
  estadosReproductivos,
  fechaReferencia,
  identidadPorAnimal,
  loading,
  error,
  onFechaMedidaClick,
}: LitrosPesadosProps) {
  const [vista, setVista] = useState<'hato' | 'vacas'>('hato');
  const [periodo, setPeriodo] = useState<PeriodoLitrosPesados>('mes');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState('');

  const rango = useMemo(
    () => rangoPeriodoLitrosPesados(periodo, fechaReferencia, { desde, hasta }),
    [periodo, fechaReferencia, desde, hasta],
  );

  const pesajesVista = useMemo(
    () => (vista === 'hato' ? pesajes : pesajes.filter((p) => seleccion.includes(p.animal_id))),
    [vista, pesajes, seleccion],
  );

  const resumen = useMemo(
    () => (rango ? resumirLitrosPesados(pesajesVista, rango) : null),
    [pesajesVista, rango],
  );
  const resumenAnterior = useMemo(() => {
    if (!rango) return null;
    return resumirLitrosPesados(pesajesVista, periodoAnteriorIgual(rango));
  }, [pesajesVista, rango]);
  const cambio = cambioContraPeriodoAnterior(resumen?.totalLitros ?? null, resumenAnterior?.totalLitros ?? null);

  const incluirProyeccion = rango != null && rango.hasta >= fechaReferencia;
  const completos = useMemo(() => pesajes.filter((p) => !turnoIncompleto(p)), [pesajes]);
  const vacasCongeladas = useMemo(
    () =>
      proyeccionVacasCongeladas({
        pesajes: completos,
        fechaReferencia,
        semanasTendencia: SEMANAS_TENDENCIA_PROYECCION,
      }),
    [completos, fechaReferencia],
  );
  const metaProyeccion = useMemo(
    () =>
      proyectarHato({
        pesajes: completos,
        fechaReferencia,
        horizonteSemanas: HORIZONTE_PROYECCION_SEMANAS,
        ventanaMedidaSemanas: 1,
        semanasTendencia: SEMANAS_TENDENCIA_PROYECCION,
        estadosReproductivos,
      }).filter((s) => s.tipo === 'proyectado'),
    [completos, fechaReferencia, estadosReproductivos],
  );

  const serie = useMemo(
    () => (resumen ? serieHato(resumen, vacasCongeladas, fechaReferencia, incluirProyeccion) : []),
    [resumen, vacasCongeladas, fechaReferencia, incluirProyeccion],
  );
  const datosTotal = useMemo(() => filasHatoParaGrafico(serie, 'litros'), [serie]);
  const datosVaca = useMemo(() => filasHatoParaGrafico(serie, 'litrosPorVaca'), [serie]);

  const filasVacas = useMemo(
    () =>
      rango
        ? filasGraficoVacas(pesajes, seleccion, rango, vacasCongeladas, fechaReferencia, incluirProyeccion)
        : [],
    [pesajes, seleccion, rango, vacasCongeladas, fechaReferencia, incluirProyeccion],
  );

  const opciones = useMemo(() => {
    const ids = [...new Set(pesajes.map((p) => p.animal_id))];
    return ids
      .map((id) => ({ id, identidad: identidadPorAnimal.get(id) }))
      .filter(
        (opcion) =>
          seleccion.includes(opcion.id) ||
          coincideBusquedaVaca(opcion.identidad?.nombre ?? null, opcion.identidad?.numero ?? null, busqueda),
      )
      .sort((a, b) => {
        const na = a.identidad?.numero;
        const nb = b.identidad?.numero;
        if (na == null && nb == null) return etiquetaVaca(a.id, a.identidad).localeCompare(etiquetaVaca(b.id, b.identidad), 'es');
        if (na == null) return 1;
        if (nb == null) return -1;
        return na - nb;
      });
  }, [pesajes, identidadPorAnimal, busqueda, seleccion]);

  const elegirPeriodo = (siguiente: PeriodoLitrosPesados) => {
    if (siguiente === 'personalizado' && (desde === '' || hasta === '')) {
      const mes = rangoPeriodoLitrosPesados('mes', fechaReferencia);
      if (mes) {
        setDesde(mes.desde);
        setHasta(mes.hasta);
      }
    }
    setPeriodo(siguiente);
  };

  const fechasMedidas = (vista === 'hato' ? serie : filasVacas).filter((p) => p.tipo === 'medido');
  const hayLinea = vista === 'hato' ? serie.some((p) => p.litros != null) : filasVacas.some((f) => Object.keys(f.medidos).length > 0);
  const sinProyeccionElegida = seleccion.filter((id) => !vacasCongeladas.some((v) => v.animalId === id)).length;
  const partosFuera = metaProyeccion.reduce((n, semana) => n + semana.vacasEntran.length, 0);
  const secadosContados = metaProyeccion.reduce((n, semana) => n + semana.vacasSalen.length, 0);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Litros pesados</h3>
        <p className="text-xs text-gray-500 mt-1">{NOTA_PESAJE}</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Vista">
          {(
            [
              ['hato', 'Hato'],
              ['vacas', 'Por vacas'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={vista === id}
              onClick={() => setVista(id)}
              className={`rounded-md px-3 py-1.5 text-sm ${vista === id ? 'bg-primary text-white' : 'border border-gray-200 text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
          {PERIODOS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={periodo === item.id}
              onClick={() => elegirPeriodo(item.id)}
              className={`rounded-md px-2.5 py-1.5 text-xs sm:text-sm ${periodo === item.id ? 'bg-primary text-white' : 'border border-gray-200 text-gray-700'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {periodo === 'personalizado' && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="text-xs text-gray-600 flex flex-col gap-1">
              Desde
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-full sm:w-40" />
            </label>
            <label className="text-xs text-gray-600 flex flex-col gap-1">
              Hasta
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-full sm:w-40" />
            </label>
          </div>
        )}
        {rango && (
          <p className="text-xs text-gray-500">
            Del {formatShortDate(rango.desde)} al {formatShortDate(rango.hasta)}
            {vista === 'vacas' ? ' · de las vacas elegidas' : ''}
          </p>
        )}
      </div>

      {vista === 'vacas' && (
        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar vaca por nombre o chapeta"
              aria-label="Buscar vaca"
              className="pl-8"
            />
          </div>
          <p className="text-xs text-gray-500">
            {seleccion.length} de {MAX_VACAS_COMPARADAS} vacas
            {seleccion.length >= MAX_VACAS_COMPARADAS ? ' · máximo alcanzado' : ''}
          </p>
          <ul className="max-h-52 overflow-y-auto space-y-1">
            {opciones.length === 0 ? (
              <li className="text-sm text-gray-500 px-1 py-2">Ninguna vaca coincide.</li>
            ) : (
              opciones.map((opcion) => {
                const marcada = seleccion.includes(opcion.id);
                const bloqueada = !marcada && seleccion.length >= MAX_VACAS_COMPARADAS;
                return (
                  <li key={opcion.id}>
                    <label className={`flex items-center gap-2 rounded-md px-1 py-1.5 text-sm ${bloqueada ? 'text-gray-400' : 'text-gray-800'}`}>
                      <Checkbox
                        checked={marcada}
                        disabled={bloqueada}
                        onCheckedChange={() => setSeleccion((actual) => alternarVacaSeleccionada(actual, opcion.id))}
                        aria-label={etiquetaVaca(opcion.id, opcion.identidad)}
                      />
                      {etiquetaVaca(opcion.id, opcion.identidad)}
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="flex items-center py-8 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando pesajes…
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 py-4">{error}</p>
      ) : !rango ? (
        <p className="text-sm text-gray-500">Elige un desde y un hasta válidos.</p>
      ) : (
        <>
          {resumen && resumen.nIncompletos > 0 && (
            <p className="text-xs text-amber-700">
              Quedan fuera {resumen.nIncompletos} pesaje{resumen.nIncompletos === 1 ? '' : 's'} con un solo turno (mañana o tarde).
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <HatoKpiCard
              icon={Milk}
              tone="green"
              label="Total de litros pesados"
              value={resumen?.totalLitros == null ? '—' : formatNumber(resumen.totalLitros, 1)}
              unit={resumen?.totalLitros == null ? undefined : 'L'}
            />
            <HatoKpiCard
              icon={TrendingUp}
              tone="blue"
              label="Cambio vs período anterior"
              value={textoCambio(cambio.variacion)}
              unit={cambio.variacion == null ? undefined : '%'}
              delta={
                cambio.variacion == null || cambio.diferencia == null
                  ? null
                  : {
                      direction: cambio.variacion >= 0 ? 'up' : 'down',
                      label: `${cambio.diferencia > 0 ? '+' : ''}${formatNumber(cambio.diferencia, 1)} L`,
                      good: cambio.variacion >= 0,
                    }
              }
              sub={cambio.variacion == null ? 'Sin pesajes en el período anterior' : undefined}
            />
            <HatoKpiCard
              icon={Users}
              tone="amber"
              label="Vacas pesadas"
              value={resumen ? formatNumber(resumen.vacasPesadas) : '—'}
              sub={resumen && resumen.nPesajes > 0 ? `${formatNumber(resumen.nPesajes)} pesajes completos` : undefined}
            />
            <HatoKpiCard
              icon={Droplet}
              tone="brown"
              label="Litros pesados por vaca"
              value={resumen?.litrosPorVaca == null ? '—' : formatNumber(resumen.litrosPorVaca, 1)}
              unit={resumen?.litrosPorVaca == null ? undefined : 'L'}
            />
          </div>

          {vista === 'vacas' && seleccion.length === 0 ? (
            <p className="text-sm text-gray-500">Elige hasta {MAX_VACAS_COMPARADAS} vacas para verlas en el mismo gráfico.</p>
          ) : !hayLinea ? (
            <p className="text-sm text-gray-500">Sin pesajes completos en este período.</p>
          ) : vista === 'hato' ? (
            <div className="space-y-6">
              <GraficoHato titulo="Total de litros pesados" datos={datosTotal} sufijo="L" onMedido={onFechaMedidaClick} />
              <GraficoHato titulo="Litros pesados por vaca" datos={datosVaca} sufijo="L/vaca" onMedido={onFechaMedidaClick} />
            </div>
          ) : (
            <GraficoVacas filas={filasVacas} seleccion={seleccion} identidadPorAnimal={identidadPorAnimal} onMedido={onFechaMedidaClick} />
          )}

          {hayLinea && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4" style={{ backgroundColor: COLOR_MEDIDO }} />
                  Medido
                </span>
                {incluirProyeccion && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: COLOR_PROYECTADO }} />
                    Proyectado, 2 semanas
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {incluirProyeccion
                  ? `La línea punteada sigue la tendencia de ${SEMANAS_TENDENCIA_PROYECCION} semanas de las vacas del último pesaje. No se suma a los litros pesados.`
                  : `La proyección de 2 semanas se muestra cuando el período incluye el último pesaje (${formatShortDate(fechaReferencia)}).`}
                {incluirProyeccion && metaProyeccion.some((s) => s.planas.length > 0)
                  ? ' Algunas vacas se sostienen planas: no tienen dos semanas con dato.'
                  : ''}
                {incluirProyeccion && partosFuera > 0 ? ` No suma ${partosFuera} vaca(s) con parto previsto en esas semanas.` : ''}
                {incluirProyeccion && secadosContados > 0 ? ` Sigue contando ${secadosContados} vaca(s) con secado previsto.` : ''}
                {vista === 'vacas' && sinProyeccionElegida > 0
                  ? ` ${sinProyeccionElegida} de las elegidas no ${sinProyeccionElegida === 1 ? 'está' : 'están'} en el último pesaje, así que no ${sinProyeccionElegida === 1 ? 'tiene' : 'tienen'} proyección.`
                  : ''}
              </p>
            </>
          )}

          {onFechaMedidaClick && fechasMedidas.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <p className="w-full text-xs text-gray-500">Toca un punto medido para ver la mañana y la tarde.</p>
              {fechasMedidas.map((punto) => (
                <button
                  key={punto.fecha}
                  type="button"
                  onClick={() => onFechaMedidaClick(punto.fecha, formatShortDate(punto.fecha))}
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Ver {formatShortDate(punto.fecha)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function GraficoVacas({
  filas,
  seleccion,
  identidadPorAnimal,
  onMedido,
}: {
  filas: FilaGraficoVacas[];
  seleccion: readonly string[];
  identidadPorAnimal: Map<string, IdentidadAnimalHato>;
  onMedido?: (fecha: string, etiqueta: string) => void;
}) {
  const datos = filas.map((fila) => {
    const row: Record<string, string | number | null> = {
      fecha: fila.fecha,
      etiqueta: formatShortDate(fila.fecha),
      tipo: fila.tipo,
    };
    for (const id of seleccion) {
      row[`m:${id}`] = fila.medidos[id] ?? null;
      row[`p:${id}`] = fila.proyectados[id] ?? null;
    }
    return row;
  });

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-2">Litros pesados por vaca</h4>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} stroke="#9ca3af" minTickGap={28} />
            <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" width={36} tickFormatter={(v: number) => formatNumber(v)} />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }}
              formatter={(value: number, name: string) => {
                const id = name.slice(2);
                const marca = name.startsWith('p:') ? 'proyectado' : 'medido';
                return [`${formatNumber(value, 1)} L`, `${etiquetaVaca(id, identidadPorAnimal.get(id))} (${marca})`];
              }}
            />
            {seleccion.map((id, indice) => {
              const color = COLORES_VACA[indice % COLORES_VACA.length];
              return (
                <Line
                  key={`m-${id}`}
                  type="monotone"
                  dataKey={`m:${id}`}
                  name={`m:${id}`}
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                  isAnimationActive={false}
                  onClick={(data) => {
                    const punto = data as { fecha?: string; tipo?: string; etiqueta?: string };
                    if (punto.tipo !== 'medido' || !punto.fecha || !onMedido) return;
                    onMedido(punto.fecha, punto.etiqueta ?? formatShortDate(punto.fecha));
                  }}
                />
              );
            })}
            {seleccion.map((id, indice) => (
              <Line
                key={`p-${id}`}
                type="monotone"
                dataKey={`p:${id}`}
                name={`p:${id}`}
                stroke={COLORES_VACA[indice % COLORES_VACA.length]}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
                legendType="none"
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {seleccion.map((id, indice) => (
          <li key={id} className="inline-flex items-center gap-1.5 text-xs text-gray-700">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLORES_VACA[indice % COLORES_VACA.length] }} />
            {etiquetaVaca(id, identidadPorAnimal.get(id))}
          </li>
        ))}
      </ul>
    </div>
  );
}
