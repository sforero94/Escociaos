// ARCHIVO: components/hato/components/HatoKpiCard.tsx
// DESCRIPCIÓN: Upgrade del `KPICard` inline que vivía en HatoDashboard.tsx
// (Figma alignment spec §1b). Insignia de ícono con tinte suave por
// métrica (nunca un círculo sólido plano), valor grande, sufijo de unidad
// opcional, y línea de delta opcional (↑/↓) -- SOLO se renderiza cuando el
// caller provee un delta real (regla "sin dato, nunca 0"/nunca una
// tendencia inventada, spec §0b). Clases verificadas contra
// `src/index.css` (build de Tailwind congelado) -- ninguna nueva se
// necesitó en `globals.css` para este componente.

import type { LucideIcon } from 'lucide-react';
import { ArrowUp, ArrowDown } from 'lucide-react';

export type HatoKpiTone = 'green' | 'blue' | 'amber' | 'brown' | 'neutral';

const TONE_CLASES: Record<HatoKpiTone, string> = {
  green: 'bg-green-50 text-green-700',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-700',
  brown: 'bg-orange-50 text-orange-700',
  neutral: 'bg-gray-100 text-gray-600',
};

export interface HatoKpiCardDelta {
  direction: 'up' | 'down';
  label: string;
  /** Si se conoce, decide el color explícitamente (una alta natalidad
   * "sube" pero puede ser buena o mala según la métrica); si se omite, el
   * color por defecto sigue la dirección (arriba = verde, abajo = ámbar). */
  good?: boolean;
}

export interface HatoKpiCardProps {
  icon: LucideIcon;
  label: string;
  /** Ya formateado -- "—" si "sin dato" (spec §0b), nunca esta card decide
   * eso por su cuenta. */
  value: string;
  unit?: string;
  tone?: HatoKpiTone;
  /** `null`/`undefined` = no se renderiza ninguna línea de delta -- nunca
   * se fabrica una tendencia sin un valor previo real (spec §0b). */
  delta?: HatoKpiCardDelta | null;
  sub?: string;
}

export function HatoKpiCard({ icon: Icon, label, value, unit, tone = 'neutral', delta, sub }: HatoKpiCardProps) {
  const deltaColor =
    delta == null
      ? ''
      : delta.good === false
        ? 'text-red-600'
        : delta.good === true
          ? 'text-green-600'
          : delta.direction === 'up'
            ? 'text-green-600'
            : 'text-amber-600';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${TONE_CLASES[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">
        {value}
        {unit && <span className="text-sm font-medium text-gray-500 ml-1">{unit}</span>}
      </p>
      {delta && (
        <p className={`flex items-center gap-1 text-xs font-medium mt-1 ${deltaColor}`}>
          {delta.direction === 'up' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {delta.label}
        </p>
      )}
      {sub && !delta && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
