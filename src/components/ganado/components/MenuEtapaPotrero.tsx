import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { ORDEN_ETAPAS, ETIQUETA_ETAPA } from '@/types/ganado';
import { ETAPA_DOT } from './ChipsEtapa';
import type { EtapaProductiva } from '@/types/ganado';

/** Las 4 etapas reales; "sin_clasificar" no es una etapa, es su ausencia. */
const ETAPAS_ASIGNABLES = ORDEN_ETAPAS.filter(
  (e): e is EtapaProductiva => e !== 'sin_clasificar'
);

interface MenuEtapaPotreroProps {
  potreroId: string;
  nombrePotrero: string;
  etapaActual: EtapaProductiva | null;
  onCambiar: (potreroId: string, etapa: EtapaProductiva | null) => Promise<void>;
  children: React.ReactNode;
}

/**
 * Menú de edición en línea de la etapa de un potrero. Se usa dos veces por
 * fila —envolviendo el nombre y envolviendo el chip— para que el clic
 * funcione donde el usuario lo intente; la lista de opciones vive una sola
 * vez, acá.
 *
 * "Sin clasificar" es una opción explícita y no un hueco: dejar un potrero
 * sin etapa es una respuesta legítima («todavía no sé»), distinta de
 * elegir mal por salir del paso.
 */
export function MenuEtapaPotrero({
  potreroId,
  nombrePotrero,
  etapaActual,
  onCambiar,
  children,
}: MenuEtapaPotreroProps) {
  const [guardando, setGuardando] = useState(false);

  const cambiar = async (etapa: EtapaProductiva | null) => {
    if (etapa === etapaActual || guardando) return;
    setGuardando(true);
    try {
      await onCambiar(potreroId, etapa);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={guardando}>
        <button
          type="button"
          aria-label={`Cambiar etapa de ${nombrePotrero}`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md text-left transition-colors',
            'hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            'px-1 -mx-1 cursor-pointer',
            guardando && 'opacity-60 cursor-wait'
          )}
        >
          {children}
          {guardando && <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-xs font-normal text-brand-brown/60">
          Etapa de {nombrePotrero}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ETAPAS_ASIGNABLES.map((etapa) => (
          <DropdownMenuItem key={etapa} onSelect={() => cambiar(etapa)} className="gap-2">
            <span className={cn('w-2 h-2 rounded-full shrink-0', ETAPA_DOT[etapa])} />
            <span className="flex-1">{ETIQUETA_ETAPA[etapa]}</span>
            {etapaActual === etapa && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => cambiar(null)} className="gap-2">
          <span className={cn('w-2 h-2 rounded-full shrink-0', ETAPA_DOT.sin_clasificar)} />
          <span className="flex-1 italic text-brand-brown/60">Sin clasificar</span>
          {etapaActual == null && <Check className="w-3.5 h-3.5 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
