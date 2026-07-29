// ARCHIVO: components/hato/components/RankingVacas.tsx
// DESCRIPCIÓN: Bloque 3 del tablero de Producción -- "Ranking por vaca"
// (decisiones 10/12 del dueño, plan
// `docs/plan_hato_produccion_rework.md` §4.2a/§4.3, SOW 5). Tabla ordenable
// con ventana semana/mes/trimestre/YTD (YTD agregado después: calendario-
// ancla, no rodante -- ver `ventanaDiasRanking`, `hatoProduccion.ts`) y las
// dos columnas del motor puro
// (`rendimientoPorVaca`, `hatoProduccion.ts`): `actual` (promedio móvil
// reciente) y `potencial` (pico de la lactancia). Punteras Y rezagadas --
// las rezagadas son el punto (§6 SOW 5: "the laggards are the point: they
// drive decisions"), así que se destacan arriba sin que el usuario tenga
// que invertir el orden manualmente. `—` para sin dato, SIEMPRE al final
// del orden en ambas direcciones (`ordenarConNulosAlFinal`) -- una vaca sin
// dato no es una rezagada.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronUp, ChevronDown, ChevronsUpDown, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EstadoChip } from './EstadoChip';
import { chipNumeroProvisional } from '@/utils/hatoUi';
import { formatNumber } from '@/utils/format';
import {
  rendimientoPorVaca,
  ordenarConNulosAlFinal,
  ventanaDiasRanking,
  type PesajeLecheVaca,
  type RendimientoVaca,
  type VentanaRanking,
  type DireccionOrden,
} from '@/utils/hatoProduccion';
import type { IdentidadAnimalHato } from '../hooks/useDatosProduccionPorVaca';

type ColumnaRanking = 'actual' | 'potencial';

const VENTANAS: Array<{ value: VentanaRanking; label: string }> = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'ytd', label: 'YTD' },
];

function etiquetaAnimal(animalId: string, identidad?: IdentidadAnimalHato): string {
  if (!identidad) return 'Vaca sin ficha';
  const chapeta = identidad.numero != null ? `#${identidad.numero}` : 'sin caravana';
  return `${chapeta}${identidad.nombre ? ` — ${identidad.nombre}` : ''}`;
}

function CabeceraOrdenable({
  label,
  columna,
  ordenActual,
  onOrdenar,
}: {
  label: string;
  columna: ColumnaRanking;
  ordenActual: { columna: ColumnaRanking; direccion: DireccionOrden };
  onOrdenar: (columna: ColumnaRanking) => void;
}) {
  const activa = ordenActual.columna === columna;
  return (
    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        className={`inline-flex items-center gap-1 hover:text-gray-900 ${activa ? 'text-gray-900' : ''}`}
      >
        {label}
        {activa ? (
          ordenActual.direccion === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 text-gray-300" />
        )}
      </button>
    </th>
  );
}

function TarjetaDestacada({
  titulo,
  icono: Icono,
  tono,
  filas,
  identidadPorAnimal,
}: {
  titulo: string;
  icono: React.ElementType;
  tono: 'verde' | 'rojo';
  filas: RendimientoVaca[];
  identidadPorAnimal: Map<string, IdentidadAnimalHato>;
}) {
  const colorIcono = tono === 'verde' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${colorIcono}`}>
          <Icono className="w-4 h-4" />
        </span>
        <p className="text-xs font-semibold text-gray-700">{titulo}</p>
      </div>
      {filas.length === 0 ? (
        <p className="text-xs text-gray-400">Sin datos suficientes.</p>
      ) : (
        <ul className="space-y-1">
          {filas.map((f) => {
            const identidad = identidadPorAnimal.get(f.animalId);
            return (
              <li key={f.animalId} className="flex items-center justify-between gap-2 text-xs">
                <Link to={`/hato-lechero/hato/${f.animalId}`} className="text-gray-700 hover:text-gray-900 truncate">
                  {etiquetaAnimal(f.animalId, identidad)}
                </Link>
                <span className="font-medium text-gray-900 whitespace-nowrap">
                  {f.actual != null ? `${formatNumber(f.actual, 1)} L` : '—'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const TOP_N_DESTACADAS = 3;

interface RankingVacasProps {
  pesajes: PesajeLecheVaca[];
  partos: Map<string, string>;
  identidadPorAnimal: Map<string, IdentidadAnimalHato>;
  fechaReferencia: string;
  loading: boolean;
  error: string | null;
}

export function RankingVacas({ pesajes, partos, identidadPorAnimal, fechaReferencia, loading, error }: RankingVacasProps) {
  const [ventana, setVentana] = useState<VentanaRanking>('mes');
  const [orden, setOrden] = useState<{ columna: ColumnaRanking; direccion: DireccionOrden }>({
    columna: 'actual',
    direccion: 'desc',
  });

  const filas = useMemo(
    () => rendimientoPorVaca(pesajes, partos, fechaReferencia, { ventanaDias: ventanaDiasRanking(ventana, fechaReferencia) }),
    [pesajes, partos, fechaReferencia, ventana],
  );

  const filasOrdenadas = useMemo(
    () => ordenarConNulosAlFinal(filas, (f) => f[orden.columna], orden.direccion),
    [filas, orden],
  );

  const punteras = useMemo(
    () => ordenarConNulosAlFinal(filas, (f) => f.actual, 'desc').filter((f) => f.actual != null).slice(0, TOP_N_DESTACADAS),
    [filas],
  );
  const rezagadas = useMemo(
    () => ordenarConNulosAlFinal(filas, (f) => f.actual, 'asc').filter((f) => f.actual != null).slice(0, TOP_N_DESTACADAS),
    [filas],
  );

  const handleOrdenar = (columna: ColumnaRanking) => {
    setOrden((prev) =>
      prev.columna === columna
        ? { columna, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }
        : { columna, direccion: 'desc' },
    );
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Ranking por vaca</h3>
            <p className="text-xs text-gray-500">
              Actual (promedio móvil) vs. potencial (pico de la lactancia) — {filas.length} vaca(s) con pesajes
            </p>
          </div>
          <Tabs value={ventana} onValueChange={(v) => setVentana(v as VentanaRanking)}>
            <TabsList>
              {VENTANAS.map((v) => (
                <TabsTrigger key={v.value} value={v.value}>{v.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center py-8 px-5 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando pesajes…
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 px-5 py-4">{error}</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-gray-400 px-5 py-8">Sin pesajes registrados en la ventana seleccionada.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5">
            <TarjetaDestacada
              titulo="Punteras"
              icono={TrendingUp}
              tono="verde"
              filas={punteras}
              identidadPorAnimal={identidadPorAnimal}
            />
            <TarjetaDestacada
              titulo="Rezagadas"
              icono={TrendingDown}
              tono="rojo"
              filas={rezagadas}
              identidadPorAnimal={identidadPorAnimal}
            />
          </div>

          <div className="overflow-x-auto border-t border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Vaca</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Sem. desde parto</th>
                  <CabeceraOrdenable label="Actual (L/día)" columna="actual" ordenActual={orden} onOrdenar={handleOrdenar} />
                  <CabeceraOrdenable label="Potencial (L/día)" columna="potencial" ordenActual={orden} onOrdenar={handleOrdenar} />
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((f, i) => {
                  const identidad = identidadPorAnimal.get(f.animalId);
                  return (
                    <tr key={f.animalId} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Link to={`/hato-lechero/hato/${f.animalId}`} className="font-medium text-gray-900 hover:underline">
                            {etiquetaAnimal(f.animalId, identidad)}
                          </Link>
                          {identidad?.numeroEsProvisional && <EstadoChip chip={chipNumeroProvisional()} />}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600">
                        {f.semanasDesdeParto != null ? f.semanasDesdeParto : (
                          <span className="text-gray-400 italic" title="Sin parto de referencia -- potencial calculado sobre todo el historial">
                            s/parto
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-medium text-gray-900">
                        {f.actual != null ? formatNumber(f.actual, 1) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-gray-700">
                        {f.potencial != null ? formatNumber(f.potencial, 1) : '—'}
                        {!f.lactanciaConocida && f.potencial != null && (
                          <span className="ml-1 text-xs text-gray-400" title="Sin parto de referencia -- pico sobre todo el historial de la vaca">
                            *
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-2 text-xs text-gray-400 border-t border-gray-100">
            * potencial calculado sobre todo el historial de la vaca (sin fecha de parto de referencia).
          </p>
        </>
      )}
    </div>
  );
}
