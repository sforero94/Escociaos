// ARCHIVO: components/hato/components/AlertasGrupoTema.tsx
// DESCRIPCIÓN: Sección colapsable de la cola de alertas agrupada por tema
// (`tipo`). Default cerrado para no mostrar todas las filas de golpe -- el
// encabezado lleva ícono + etiqueta + conteo; al expandir se listan las
// `AlertaFila` del grupo. Misma idea que los Collapsible de
// `PriorizacionScoutingView.tsx` (zona/lote con conteo en el header).

import { useState, type ReactNode } from 'react';
import { ChevronDown, Droplet, Syringe, Repeat, HelpCircle, Baby } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { formatNumber } from '@/utils/format';
import {
  LABEL_TIPO_ALERTA_HATO,
  type TipoAlertaHato,
} from '@/utils/hatoAlertasUi';

/** Mismo set que `AlertaFila` / `HatoDashboard` -- lenguaje visual del módulo. */
const ICONO_TIPO_ALERTA: Record<TipoAlertaHato, typeof Droplet> = {
  secado_due: Droplet,
  tratamiento_paso: Syringe,
  rechequeo_due: Repeat,
  servicio_sin_confirmacion: HelpCircle,
  parto_proximo: Baby,
};

export interface AlertasGrupoTemaProps {
  tipo: TipoAlertaHato;
  cantidad: number;
  /** Si el padre fuerza abrir (p. ej. filtro de tipo activo, o un solo grupo). */
  forzarAbierto?: boolean;
  /** Descarte masivo: seleccionar todas las filas de ESTE grupo. */
  seleccionable?: boolean;
  todasSeleccionadas?: boolean;
  onToggleSeleccionarTodas?: (seleccionar: boolean) => void;
  children: ReactNode;
}

export function AlertasGrupoTema({
  tipo,
  cantidad,
  forzarAbierto = false,
  seleccionable = false,
  todasSeleccionadas = false,
  onToggleSeleccionarTodas,
  children,
}: AlertasGrupoTemaProps) {
  // Abierto si el padre lo fuerza O si el usuario lo expandió. Sin
  // useEffect: `forzarAbierto || userOpen` ya sincroniza el filtro de tipo.
  const [userOpen, setUserOpen] = useState(false);
  const open = forzarAbierto || userOpen;
  const Icono = ICONO_TIPO_ALERTA[tipo];

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        if (forzarAbierto) return;
        setUserOpen(next);
      }}
      className="overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={`${LABEL_TIPO_ALERTA_HATO[tipo]}, ${cantidad} alerta${cantidad === 1 ? '' : 's'}, ${open ? 'ocultar' : 'mostrar'}`}
            className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <ChevronDown
              className="w-4 h-4 shrink-0 text-gray-400 transition-transform"
              style={{ transform: open ? undefined : 'rotate(-90deg)' }}
            />
            <Icono className="w-4 h-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
              {LABEL_TIPO_ALERTA_HATO[tipo]}
            </span>
            <span className="shrink-0 text-xs text-gray-500 tabular-nums">
              {formatNumber(cantidad)}
            </span>
          </button>
        </CollapsibleTrigger>
        {seleccionable && onToggleSeleccionarTodas && open && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none shrink-0">
            <Checkbox
              checked={todasSeleccionadas}
              onCheckedChange={(checked) => onToggleSeleccionarTodas(checked === true)}
            />
            Todas
          </label>
        )}
      </div>
      <CollapsibleContent>
        <div className="space-y-2 border-t border-gray-100 px-3 py-3">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
