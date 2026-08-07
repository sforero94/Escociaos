import React from 'react';
import { formatearFecha } from '../../utils/fechas';
import { cn } from '../ui/utils';
import type { Tarea } from './Labores';
import {
  PRIORIDAD_CONFIGS,
  getLoteNames,
  formatLoteResumen,
  type TareaRowActions,
} from './tareas-types';
import TareaAccionesButtons from './TareaAccionesButtons';
import TareaEstadoSelect from './TareaEstadoSelect';
import TareaRowMenu from './TareaRowMenu';

interface TareaMobileCardProps {
  tarea: Tarea;
  actions: TareaRowActions;
}

/**
 * Mobile (< 640px) fallback for a table row. Same visual language as the
 * deleted `TareaCard.tsx` (Kanban card) — the file is gone, the look isn't:
 * name + estado + prioridad visible at a glance, everything else moves to
 * the detail dialog (tap → TareaDetalleDialog).
 *
 * Estado (via `TareaEstadoSelect`) and the ⋮ menu (via `TareaRowMenu`) are
 * both reachable here too — Editar/Eliminar and the estado transition are
 * not desktop-only.
 */
const TareaMobileCard: React.FC<TareaMobileCardProps> = ({ tarea, actions }) => {
  const loteNames = getLoteNames(tarea);
  const loteResumen = formatLoteResumen(loteNames);
  const fechaLabel = tarea.fecha_estimada_fin
    ? formatearFecha(tarea.fecha_estimada_fin)
    : 'Sin fecha objetivo';

  const tieneAcciones = tarea.estado === 'Programada' || tarea.estado === 'En Proceso';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => actions.onVerDetalles(tarea)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          actions.onVerDetalles(tarea);
        }
      }}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-base text-foreground flex-1 min-w-0">{tarea.nombre}</h4>
        <div
          className="flex items-center gap-1 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className={cn(
              'inline-flex rounded-md border px-2 py-1 text-sm font-semibold',
              PRIORIDAD_CONFIGS[tarea.prioridad].chipClassName,
            )}
          >
            {tarea.prioridad}
          </span>
          <TareaRowMenu tarea={tarea} actions={actions} />
        </div>
      </div>

      {/* Estado (editable), tipo, lotes (capped) and fecha objetivo — always
          shown together, never an either/or between lote and fecha. */}
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
        <TareaEstadoSelect tarea={tarea} onCambiarEstado={actions.onCambiarEstado} />
      </div>

      {/* Tipo · lotes · fecha en su propia línea: con el <Select> dentro de esta
          misma fila el chip ocupaba todo el ancho y empujaba el primer "·" al
          renglón siguiente, dejándolo huérfano al inicio de la línea. */}
      <div className="flex flex-wrap items-center gap-1 mt-2 text-sm text-muted-foreground">
        <span>{tarea.tipo_tarea?.nombre || 'Sin tipo'}</span>
        <span>·</span>
        <span>{loteResumen}</span>
        <span>·</span>
        <span>{fechaLabel}</span>
      </div>

      {/* Jornales y acciones van en filas separadas, no en la misma fila con
          justify-between: con el piso táctil de 44px (src/components/ui/button.tsx)
          dos botones ("Registrar" + "Completar") ya no caben junto al texto de
          jornales sin apretarse. Acciones a ancho completo evita que floten a
          tamaños distintos o se monten una sobre otra. */}
      <div className="flex flex-col gap-3 mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-medium tareas-jornales">
          {(tarea.jornales_reales ?? 0).toFixed(1)}
          <span className="text-muted-foreground"> / </span>
          {tarea.jornales_estimados != null ? tarea.jornales_estimados.toFixed(1) : '—'}
          <span className="text-muted-foreground"> jornales</span>
        </span>

        {tieneAcciones ? (
          <TareaAccionesButtons tarea={tarea} actions={actions} stretch />
        ) : (
          <button
            type="button"
            onClick={() => actions.onVerDetalles(tarea)}
            className="text-sm text-muted-foreground"
          >
            Ver detalles →
          </button>
        )}
      </div>
    </div>
  );
};

export default TareaMobileCard;
