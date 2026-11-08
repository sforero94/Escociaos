import { TrendingUp, Info } from 'lucide-react';
import { GAPS_PRODUCCION_ANALISIS } from '@/utils/calculosProduccionAnalisis';
import type { CosechaIdentidad } from '../../../types/produccion';

interface EvolucionSemanalGapProps {
  cosechas: CosechaIdentidad[];
  modo: 'una' | 'varias';
}

/**
 * Placeholder honesto para evolución semanal / acumulado.
 * El mock pide semanas ISO desde fecha de movimiento; el schema no las tiene.
 */
export function EvolucionSemanalGap({ cosechas, modo }: EvolucionSemanalGapProps) {
  const labels = cosechas.map((c) => c.label).join(', ') || 'la selección actual';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Evolución de la cosecha
          </h3>
          <p className="text-sm text-gray-500">
            {modo === 'varias'
              ? 'Series por campaña en eje relativo (semana desde inicio) — pendiente de fuente fechada'
              : `Acumulado semanal · ${labels}`}
          </p>
        </div>
      </div>

      <div className="relative h-[260px] rounded-lg border border-dashed border-gray-200 bg-[linear-gradient(180deg,#f8faf5_0%,#ffffff_100%)] flex flex-col items-center justify-center text-center px-6">
        <div className="absolute inset-x-8 top-10 bottom-14 flex flex-col justify-between opacity-40 pointer-events-none">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-t border-gray-200" />
          ))}
        </div>
        <p className="text-base font-medium text-gray-700 relative">
          Sin serie semanal disponible
        </p>
        <p className="text-sm text-gray-500 mt-2 max-w-xl relative">
          {GAPS_PRODUCCION_ANALISIS.entrada_semanal}
        </p>
      </div>

      <div className="mt-4 flex items-start gap-2 text-xs text-gray-500">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>
          Recomendación de producto: comparar a igual avance con «semana desde
          inicio» como eje relativo, sin prolongar períodos sin datos como
          ceros. Calendario ISO como alternativa cuando exista fecha de
          movimiento.
        </p>
      </div>
    </div>
  );
}
