// ARCHIVO: components/hato/components/HistorialCorreccionesCard.tsx
// DESCRIPCIÓN: T4b (S3, docs/plan_hato_ciclo_manual_override.md §5) --
// muestra la traza append-only de `hato_correcciones` (migración 084) para
// UN animal, `corregido_en DESC` (hay índice para ese orden, ya aplicado
// por `useHatoAnimal.ts`). Solo lectura: la traza la escribe el trigger
// sola, esta tarjeta nunca escribe en `hato_correcciones`.

import { AlertTriangle, Loader2, Pencil, Trash2 } from 'lucide-react';
import { LABEL_TABLA_CORRECCION, resumirCambiosCorreccion } from '@/utils/hatoCorrecciones';
import { formatShortDate } from '@/utils/format';
import type { HatoCorreccionRow } from '@/types/hato';

function formatFechaHora(iso: string): string {
  const d = new Date(iso);
  // `formatShortDate` recibe el objeto `Date` completo, NUNCA
  // `d.toISOString().slice(0, 10)`: ese slice trunca al día calendario en
  // UTC, y `formatShortDate` trataría ese string como una fecha LOCAL pura
  // -- exactamente el bug off-by-one que documenta CLAUDE.md del módulo
  // (SOW5 FIX 1). Pasando el `Date` real, `Intl.DateTimeFormat` ya resuelve
  // el día calendario correcto en la zona horaria del navegador.
  const fecha = formatShortDate(d);
  const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return `${fecha} · ${hora}`;
}

export function HistorialCorreccionesCard({
  correcciones,
  nombrePorUsuarioId,
  loading,
  error,
}: {
  correcciones: HatoCorreccionRow[];
  nombrePorUsuarioId: Record<string, string>;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Historial de correcciones</h2>
      {loading ? (
        <div className="flex items-center py-4 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando historial…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      ) : correcciones.length === 0 ? (
        <p className="text-sm text-gray-500">Sin correcciones registradas todavía.</p>
      ) : (
        <ul className="space-y-3">
          {correcciones.map((c, i) => (
            // `first:border-t-0`/`first:pt-0` no existen en el build
            // congelado (ninguna variante `first:` compila) -- se decide
            // por índice, mismo criterio que el zebra-striping (`i % 2`)
            // que ya usa el resto del módulo.
            <li key={c.id} className={i === 0 ? '' : 'border-t border-gray-100 pt-3'}>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {c.operacion === 'delete' ? (
                  <Trash2 className="w-4 h-4 text-red-500" />
                ) : (
                  <Pencil className="w-4 h-4 text-amber-500" />
                )}
                <span className="font-medium text-gray-900">{LABEL_TABLA_CORRECCION[c.tabla]}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500">{formatFechaHora(c.corregido_en)}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500">
                  {c.corregido_por ? nombrePorUsuarioId[c.corregido_por] ?? 'Usuario desconocido' : 'Usuario desconocido'}
                </span>
              </div>
              <ul className="mt-1 space-y-1">
                {resumirCambiosCorreccion(c).map((linea, j) => (
                  <li key={j} className="text-xs text-gray-600">{linea}</li>
                ))}
              </ul>
              {c.motivo && <p className="text-xs text-gray-500 italic mt-1">"{c.motivo}"</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
