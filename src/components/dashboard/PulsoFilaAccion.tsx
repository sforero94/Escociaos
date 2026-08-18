import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface PulsoFilaAccionProps {
  onClick: () => void;
  children: ReactNode;
}

/**
 * PulsoFilaAccion - fila clicable al pie de una tarjeta del "Pulso por
 * negocio", separada por línea (docs/plan_dashboard_centro_control.md
 * §9.2: "Línea de revisión clicable con su conteo, con ChevronRight").
 *
 * `<button>` real (no un `<div onClick>`): teclado, foco visible y
 * suficiente alto de toque (CLAUDE.md, accesibilidad -- mínimo 44px en
 * móvil) en vez de simular un enlace con un contenedor no interactivo.
 */
export function PulsoFilaAccion({ onClick, children }: PulsoFilaAccionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 pt-3 border-t border-gray-100 w-full min-h-11 flex items-center justify-between gap-2 text-left rounded-b-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
    >
      <div className="min-w-0">{children}</div>
      <ChevronRight className="w-4 h-4 text-brand-brown/40 shrink-0" aria-hidden="true" />
    </button>
  );
}
