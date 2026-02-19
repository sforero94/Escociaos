import React from 'react';
import { MoreVertical, Eye, Pencil, ClipboardList, ArrowRight, Trash2, Calendar as CalendarIcon, Tag, MapPin } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { Tarea } from './Labores';
import type { ColumnActions } from './kanban-types';

interface TareaCardProps {
  tarea: Tarea;
  estado: Tarea['estado'];
  actions: ColumnActions;
  isArchived?: boolean;
}

function getLoteNames(tarea: Tarea): string[] {
  if (tarea.lotes && tarea.lotes.length > 0) {
    return tarea.lotes.map((l) => l.nombre);
  }
  if (tarea.lote_nombres) {
    return tarea.lote_nombres.split(', ').filter(Boolean);
  }
  if (tarea.lote?.nombre) {
    return [tarea.lote.nombre];
  }
  return [];
}

const PRIORITY_STYLE: Record<string, string> = {
  Alta: 'bg-red-50 text-red-700 border border-red-200',
  Media: 'bg-amber-50 text-amber-700 border border-amber-200',
  Baja: 'bg-green-50 text-green-700 border border-green-200',
};

const TareaCard: React.FC<TareaCardProps> = ({ tarea, estado, actions, isArchived }) => {
  const loteNames = getLoteNames(tarea);
  const priorityClasses = PRIORITY_STYLE[tarea.prioridad] || PRIORITY_STYLE.Baja;

  return (
    <div
      className={`
        bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden
        hover:shadow-md hover:border-gray-300 transition-all duration-150
        ${isArchived ? 'opacity-75' : ''}
      `}
    >
      {/* Card content */}
      <div className="p-3 space-y-1.5">
        {/* Row 1: Title + Priority pill */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-sm text-gray-900 line-clamp-2 flex-1 min-w-0">
            {tarea.nombre}
          </h4>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 whitespace-nowrap ${priorityClasses}`}
          >
            {tarea.prioridad}
          </span>
        </div>

        {/* Row 2: Description (1-line) */}
        {tarea.descripcion && (
          <p className="text-xs text-gray-500 line-clamp-1">
            {tarea.descripcion}
          </p>
        )}

        {/* Row 3: Lotes - plain text, no color coding */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <MapPin className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">
            {loteNames.length > 0 ? loteNames.join(', ') : 'Sin lote'}
          </span>
        </div>

        {/* Row 4: Task type */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Tag className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{tarea.tipo_tarea?.nombre || 'Sin tipo'}</span>
        </div>
      </div>

      {/* Action buttons row */}
      <div className="px-3 pb-2.5 pt-0">
        <div className="flex items-center gap-1 border-t border-gray-100 pt-2">
          {/* Primary actions - visible, state-dependent */}
          {estado === 'Banco' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onCambiarEstado(tarea, 'Programada')}
              className="h-7 px-2 text-xs"
            >
              <CalendarIcon className="h-3 w-3 mr-1" />
              Programar
            </Button>
          )}

          {estado === 'Programada' && (
            <Button
              size="sm"
              onClick={() => actions.onRegistrarTrabajo(tarea)}
              className="h-7 px-2 text-xs bg-[#73991C] hover:bg-[#5a7716] text-white"
            >
              <ClipboardList className="h-3 w-3 mr-1" />
              Registrar
            </Button>
          )}

          {estado === 'En Proceso' && (
            <>
              <Button
                size="sm"
                onClick={() => actions.onRegistrarTrabajo(tarea)}
                className="h-7 px-2 text-xs bg-[#73991C] hover:bg-[#5a7716] text-white"
              >
                <ClipboardList className="h-3 w-3 mr-1" />
                Registrar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => actions.onCambiarEstado(tarea, 'Completada')}
                className="h-7 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50"
              >
                <ArrowRight className="h-3 w-3 mr-1" />
                Completar
              </Button>
            </>
          )}

          {(estado === 'Completada' || estado === 'Cancelada') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onVerDetalles(tarea)}
              className="h-7 px-2 text-xs"
            >
              <Eye className="h-3 w-3 mr-1" />
              Ver Detalles
            </Button>
          )}

          {/* Spacer to push overflow menu to the right */}
          <div className="flex-1" />

          {/* Overflow menu for secondary actions */}
          {estado !== 'Completada' && estado !== 'Cancelada' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                >
                  <MoreVertical className="h-3.5 w-3.5 text-gray-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => actions.onVerDetalles(tarea)}>
                  <Eye className="h-4 w-4" />
                  Ver Detalles
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.onEditar(tarea)}>
                  <Pencil className="h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => actions.onEliminar(tarea)}
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
};

export default TareaCard;
