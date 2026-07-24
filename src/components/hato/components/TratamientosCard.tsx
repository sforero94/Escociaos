// ARCHIVO: components/hato/components/TratamientosCard.tsx
// DESCRIPCIÓN: Card "Tratamientos" de la Hoja de Vida (Figma alignment spec
// §3) -- puramente presentacional, alimentada por `useHatoTratamientos`.
// Cada tratamiento muestra el protocolo (o el nombre libre si no vino de un
// protocolo del catálogo) + sus pasos programados/ejecutados. Vacío ->
// "Sin tratamientos", nunca una tabla en blanco sin explicación.

import { Loader2, AlertTriangle, Check, Circle } from 'lucide-react';
import { EstadoChip } from './EstadoChip';
import { chipEstadoTratamiento } from '@/utils/hatoUi';
import { formatShortDate } from '@/utils/format';
import type { HatoTratamientoDetalle } from '../hooks/useHatoTratamientos';

export function TratamientosCard({
  tratamientos,
  loading,
  error,
}: {
  tratamientos: HatoTratamientoDetalle[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Tratamientos</h2>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      ) : tratamientos.length === 0 ? (
        <p className="text-sm text-gray-500">Sin tratamientos registrados.</p>
      ) : (
        <ul className="space-y-4">
          {tratamientos.map((t) => (
            <li key={t.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium text-gray-900">{t.protocoloNombre ?? t.nombre ?? 'Tratamiento'}</p>
                <EstadoChip chip={chipEstadoTratamiento(t.estado)} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatShortDate(t.fecha_inicio)}
                {t.nota ? ` — ${t.nota}` : ''}
              </p>
              {t.pasos.length > 0 && (
                <ol className="mt-2 space-y-1">
                  {t.pasos.map((p) => (
                    <li key={p.id} className="flex items-start gap-2 text-xs text-gray-600">
                      {p.fecha_ejecutada ? (
                        <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                      )}
                      <span>
                        Paso {p.paso_num}
                        {p.descripcion ? `: ${p.descripcion}` : ''} — programado {formatShortDate(p.fecha_programada)}
                        {p.fecha_ejecutada && ` (hecho ${formatShortDate(p.fecha_ejecutada)})`}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
