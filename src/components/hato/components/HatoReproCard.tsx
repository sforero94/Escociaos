// ARCHIVO: components/hato/components/HatoReproCard.tsx
// DESCRIPCIÓN: Card de estado reproductivo del hato en ordeño (reemplaza la
// KPI única "% Preñez" por decisión del dueño). Muestra 3 KPIs sobre el
// mismo denominador (vacas en ordeño): % Preñadas (confirmadas), % Servidas
// (montadas, aún sin confirmar) y % Vacías (abiertas -- ni preñadas ni
// montadas). Las tres particionan al 100% del hato en ordeño, así que el
// desglose es la foto reproductiva completa, no tres métricas sueltas.
//
// Mismo contenedor/insignia que `HatoKpiCard` (Figma alignment spec §1b).
// Clases verificadas contra `src/index.css` (build de Tailwind congelado);
// los colores de punto van por `style` inline (var(--primary)/hex), nunca
// como clases arbitrarias que no compilarían.

import { Heart } from 'lucide-react';
import { formatNumber, formatPercentage } from '@/utils/format';

interface StatRepro {
  label: string;
  count: number;
  /** Color del punto -- verde = preñada (bien), azul = servida (en curso),
   * ámbar = vacía (requiere atención), en línea con la paleta semántica de
   * `hatoUi.ts`. */
  color: string;
}

export interface HatoReproCardProps {
  /** Total de vacas en ordeño (denominador de los 3 porcentajes). 0 => "—". */
  enOrdeno: number;
  prenadas: number;
  servidas: number;
  vacias: number;
}

export function HatoReproCard({ enOrdeno, prenadas, servidas, vacias }: HatoReproCardProps) {
  const stats: StatRepro[] = [
    { label: 'Preñadas', count: prenadas, color: 'var(--primary)' },
    { label: 'Servidas', count: servidas, color: '#2563eb' },
    { label: 'Vacías', count: vacias, color: '#d97706' },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Reproducción</p>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-orange-50 text-orange-700">
          <Heart className="w-5 h-5" />
        </div>
      </div>

      {enOrdeno === 0 ? (
        <p className="text-2xl font-bold text-gray-900">—</p>
      ) : (
        <>
          <ul className="space-y-2">
            {stats.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
                <span className="text-sm font-bold text-gray-900 whitespace-nowrap">
                  {formatPercentage((s.count / enOrdeno) * 100, 0)}{' '}
                  <span className="text-xs font-normal text-gray-400">({formatNumber(s.count)})</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400 mt-3">de {formatNumber(enOrdeno)} en ordeño</p>
        </>
      )}
    </div>
  );
}
