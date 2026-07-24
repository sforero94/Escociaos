import React from 'react';
import { MapPin } from 'lucide-react';
import { TableRow, TableCell } from '../ui/table';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { cn } from '../ui/utils';
import { formatearFecha } from '../../utils/fechas';
import type { Tarea } from './Labores';
import {
  MAX_VISIBLE_LOTES,
  PRIORIDAD_CONFIGS,
  getLoteNames,
  type TareaRowActions,
} from './tareas-types';
import TareaAccionesButtons from './TareaAccionesButtons';
import TareaEstadoSelect from './TareaEstadoSelect';
import TareaRowMenu from './TareaRowMenu';

interface TareaTableRowProps {
  tarea: Tarea;
  selected: boolean;
  onToggleSelected: (id: string) => void;
  actions: TareaRowActions;
}

/** One row of the desktop Tareas table. Kept separate from `TareasTable.tsx`
 *  so the orchestrator (filters + pagination + footer) stays small. */
const TareaTableRow: React.FC<TareaTableRowProps> = ({
  tarea,
  selected,
  onToggleSelected,
  actions,
}) => {
  const loteNames = getLoteNames(tarea);
  const visibleLotes = loteNames.slice(0, MAX_VISIBLE_LOTES);
  const hiddenLotes = loteNames.slice(MAX_VISIBLE_LOTES);

  return (
    <TableRow className="tareas-table-row" data-selected={selected}>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelected(tarea.id)}
          aria-label={`Seleccionar tarea "${tarea.nombre}"`}
        />
      </TableCell>

      {/* Tarea: nombre + código + lotes (capped to MAX_VISIBLE_LOTES pills + "+N") */}
      <TableCell>
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => actions.onVerDetalles(tarea)}
            className="tareas-tarea-nombre font-semibold text-sm text-foreground text-left"
          >
            {tarea.nombre}
          </button>
          <div className="text-xs text-muted-foreground font-mono mt-1">
            {tarea.codigo_tarea}
          </div>
          <div className="tareas-lotes mt-1">
            {loteNames.length > 0 ? (
              <>
                <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                {visibleLotes.map((name) => (
                  <span
                    key={name}
                    title={name}
                    className="tareas-lote-pill text-xs text-gray-600 border border-gray-200 rounded-md px-2 py-1 bg-white"
                  >
                    {name}
                  </span>
                ))}
                {hiddenLotes.length > 0 && (
                  <span
                    title={hiddenLotes.join(', ')}
                    className="flex-shrink-0 text-xs text-gray-600 border border-gray-200 rounded-md px-2 py-1 bg-white"
                  >
                    +{hiddenLotes.length}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Sin lote</span>
            )}
          </div>
        </div>
      </TableCell>

      {/* Tipo — truncated so a long tipo name never pushes the column wider. */}
      <TableCell>
        {tarea.tipo_tarea?.nombre ? (
          <Badge
            variant="outline"
            className="tareas-tipo-badge font-normal"
            title={tarea.tipo_tarea.nombre}
          >
            {tarea.tipo_tarea.nombre}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Sin tipo</span>
        )}
      </TableCell>

      {/* Prioridad */}
      <TableCell>
        <span
          className={cn(
            'inline-flex rounded-md border px-2 py-1 text-xs font-semibold',
            PRIORIDAD_CONFIGS[tarea.prioridad].chipClassName,
          )}
        >
          {tarea.prioridad}
        </span>
      </TableCell>

      {/* Estado — inline <Select>, every transition (including Banco →
          Programada) goes through here and hits the same
          `handleCambiarEstado` validation as before. */}
      <TableCell>
        <TareaEstadoSelect tarea={tarea} onCambiarEstado={actions.onCambiarEstado} />
      </TableCell>

      {/* Jornales (Ejec. / Plan.) — jornales_reales is COALESCE(...,0) in the
          view (always real data, never render "—"); jornales_estimados is
          nullable (render "—" when absent, never 0). The " / " separator is
          plain text (not a margin utility) so the pair reads as two numbers
          regardless of font metrics. */}
      <TableCell className="text-right tareas-jornales">
        <span className="font-medium">{(tarea.jornales_reales ?? 0).toFixed(1)}</span>
        <span className="text-muted-foreground"> / </span>
        {tarea.jornales_estimados != null ? (
          <span className="font-medium">{tarea.jornales_estimados.toFixed(1)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Fecha objetivo */}
      <TableCell>
        {tarea.fecha_estimada_fin ? (
          formatearFecha(tarea.fecha_estimada_fin)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Acciones — compact spacing so both buttons fit the narrow column. */}
      <TableCell>
        <TareaAccionesButtons tarea={tarea} actions={actions} compact />
      </TableCell>

      {/* ⋮ menu */}
      <TableCell>
        <TareaRowMenu tarea={tarea} actions={actions} />
      </TableCell>
    </TableRow>
  );
};

export default TareaTableRow;
