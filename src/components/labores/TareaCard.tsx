import React from 'react';
import { MoreVertical, Eye, Pencil, ClipboardList, ArrowRight, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { getLoteColor } from '../../types/produccion';
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

const PRIORITY_BORDER: Record<string, string> = {
  Alta: 'border-l-red-500',
  Media: 'border-l-amber-500',
  Baja: 'border-l-gray-300',
};

const TareaCard: React.FC<TareaCardProps> = ({ tarea, estado, actions, isArchived }) => {
  const loteNames = getLoteNames(tarea);
  const priorityBorder = PRIORITY_BORDER[tarea.prioridad] || 'border-l-gray-300';

  return (
    <div
      className={`
        bg-white rounded-lg border border-gray-200 shadow-sm
        border-l-[3px] ${priorityBorder}
        cursor-pointer group relative
        hover:shadow-md hover:border-gray-300 transition-all duration-150
        ${isArchived ? 'opacity-70' : ''}
      `}
      onClick={() => actions.onVerDetalles(tarea)}
    >
      <div className="p-2.5 space-y-1.5">
        {/* Row 1: Title + hover menu */}
        <div className="flex items-start justify-between gap-1">
          <h4 className="font-medium text-sm text-gray-900 line-clamp-1 flex-1 min-w-0">
            {tarea.nombre}
          </h4>
          {/* Three-dot menu: always visible on mobile, hover on desktop */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5 text-gray-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => actions.onVerDetalles(tarea)}>
                <Eye className="h-4 w-4" />
                Ver Detalles
              </DropdownMenuItem>

              {estado !== 'Completada' && estado !== 'Cancelada' && (
                <>
                  <DropdownMenuItem onClick={() => actions.onEditar(tarea)}>
                    <Pencil className="h-4 w-4" />
                    Editar
                  </DropdownMenuItem>

                  {estado === 'Banco' && (
                    <DropdownMenuItem onClick={() => actions.onCambiarEstado(tarea, 'Programada')}>
                      <CalendarIcon className="h-4 w-4" />
                      Programar
                    </DropdownMenuItem>
                  )}

                  {(estado === 'Programada' || estado === 'En Proceso') && (
                    <DropdownMenuItem onClick={() => actions.onRegistrarTrabajo(tarea)}>
                      <ClipboardList className="h-4 w-4" />
                      Registrar Trabajo
                    </DropdownMenuItem>
                  )}

                  {estado === 'En Proceso' && (
                    <DropdownMenuItem onClick={() => actions.onCambiarEstado(tarea, 'Completada')}>
                      <ArrowRight className="h-4 w-4" />
                      Completar
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => actions.onEliminar(tarea)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Row 2: Lote pills */}
        <div className="flex flex-wrap gap-1">
          {loteNames.length > 0 ? (
            <>
              {loteNames.slice(0, 2).map((name) => {
                const color = getLoteColor(name);
                return (
                  <span
                    key={name}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border"
                    style={{
                      color: color,
                      backgroundColor: color + '15',
                      borderColor: color + '40',
                    }}
                  >
                    {name}
                  </span>
                );
              })}
              {loteNames.length > 2 && (
                <span className="text-[10px] text-gray-400 font-medium px-1 self-center">
                  +{loteNames.length - 2}
                </span>
              )}
            </>
          ) : (
            <span className="text-[10px] text-gray-400">Sin lote</span>
          )}
        </div>

        {/* Row 3: Task type */}
        <div className="text-xs text-gray-500 truncate">
          {tarea.tipo_tarea?.nombre || 'Sin tipo'}
        </div>
      </div>
    </div>
  );
};

export default TareaCard;
