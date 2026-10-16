// ARCHIVO: components/hato/components/produccion/CompararVacasBloque.tsx
// DESCRIPCIÓN: "Comparar vacas" de Producción v2 (D19): líneas de litros
// pesados por día de hasta 6 vacas, pesaje a pesaje. Una semana sin pesaje
// deja un hueco en la línea (`connectNulls={false}`), nunca un cero.

import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatNumber } from '@/utils/format';
import {
  MAX_VACAS_COMPARAR,
  agregarVacas,
  etiquetaDiaPesaje,
  filasCompararVacas,
  rankingVacasPeriodo,
  topYBottom,
} from '@/utils/hato/produccionV2';
import { coincideBusquedaVaca, type PesajeLitros, type RangoFecha } from '@/utils/hato/litrosPesados';
import type { IdentidadAnimalHato } from '../../hooks/useDatosProduccionPorVaca';
import { etiquetaVacaHato } from './ProduccionPesadaBloque';

const COLORES = ['#172E08', '#1D4ED8', '#B45309', '#7C3AED', '#0F766E', '#BE123C'];

export function CompararVacasBloque({
  pesajes,
  partosPorAnimal,
  identidadPorAnimal,
  rango,
}: {
  pesajes: PesajeLitros[];
  partosPorAnimal: Map<string, string[]>;
  identidadPorAnimal: Map<string, IdentidadAnimalHato>;
  rango: RangoFecha;
}) {
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);

  const ranking = useMemo(() => rankingVacasPeriodo(pesajes, rango, partosPorAnimal), [pesajes, rango, partosPorAnimal]);
  const { top, bottom } = useMemo(() => topYBottom(ranking), [ranking]);
  const filas = useMemo(() => filasCompararVacas(pesajes, seleccion, rango), [pesajes, seleccion, rango]);
  const datos = filas.map((f) => ({ ...f, etiqueta: etiquetaDiaPesaje(f.fecha) }));

  const opciones = ranking.filter((v) => {
    if (seleccion.includes(v.animalId)) return false;
    const id = identidadPorAnimal.get(v.animalId);
    return coincideBusquedaVaca(id?.nombre ?? null, id?.numero ?? null, busqueda);
  });
  const lleno = seleccion.length >= MAX_VACAS_COMPARAR;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Comparar vacas</h2>
        <p className="text-xs text-gray-500">
          Litros pesados por día de cada vaca elegida, pesaje a pesaje. Hasta {MAX_VACAS_COMPARAR} vacas.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {seleccion.map((id, i) => (
          <span key={id} className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 py-0.5 pl-2 pr-1 text-xs font-medium text-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORES[i % COLORES.length] }} aria-hidden="true" />
            {etiquetaVacaHato(id, identidadPorAnimal.get(id))}
            <button
              type="button"
              aria-label={`Quitar ${etiquetaVacaHato(id, identidadPorAnimal.get(id))}`}
              onClick={() => setSeleccion((s) => s.filter((x) => x !== id))}
              className="flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <Popover open={abierto} onOpenChange={setAbierto}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={lleno}>
              <Plus className="h-4 w-4" /> Agregar vaca
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre o caravana"
                aria-label="Buscar vaca"
                className="pl-8"
              />
            </div>
            <ul className="max-h-60 overflow-y-auto">
              {opciones.length === 0 ? (
                <li className="px-2 py-2 text-sm text-gray-500">Ninguna vaca pesada en el período coincide.</li>
              ) : (
                opciones.map((v) => (
                  <li key={v.animalId}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setSeleccion((s) => agregarVacas(s, [v.animalId]));
                        setAbierto(false);
                        setBusqueda('');
                      }}
                    >
                      <span className="truncate">{etiquetaVacaHato(v.animalId, identidadPorAnimal.get(v.animalId))}</span>
                      <span className="ml-2 text-xs text-gray-400">{formatNumber(v.litros, 1)} L</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </PopoverContent>
        </Popover>
        <Button variant="link" size="sm" disabled={lleno || top.length === 0} onClick={() => setSeleccion((s) => agregarVacas(s, top.map((v) => v.animalId)))}>
          Agregar las 5 que más dan
        </Button>
        <Button variant="link" size="sm" disabled={lleno || bottom.length === 0} onClick={() => setSeleccion((s) => agregarVacas(s, bottom.map((v) => v.animalId)))}>
          Agregar las 5 que menos dan
        </Button>
      </div>

      {seleccion.length === 0 ? (
        <p className="py-6 text-sm text-gray-400">Elige una o varias vacas para ver sus líneas.</p>
      ) : datos.length === 0 ? (
        <p className="py-6 text-sm text-gray-400">Las vacas elegidas no tienen pesajes en el período.</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos} margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
              <CartesianGrid stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="etiqueta"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                stroke="#E5E7EB"
                interval="preserveStartEnd"
                label={{ value: 'Fecha del pesaje', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#9CA3AF' }}
              />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} stroke="#E5E7EB" width={48} tickFormatter={(v: number) => `${formatNumber(v)} L`} />
              <Tooltip formatter={(v: number, nombre: string) => [`${formatNumber(v, 1)} L`, etiquetaVacaHato(nombre, identidadPorAnimal.get(nombre))]} />
              {seleccion.map((id, i) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  name={id}
                  stroke={COLORES[i % COLORES.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-xs text-gray-500">Una semana sin pesaje deja un hueco en la línea. Nunca se dibuja como cero.</p>
    </section>
  );
}
