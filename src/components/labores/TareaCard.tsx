import React from 'react';
import { MoreVertical, Eye, Pencil, ClipboardList, ArrowRight, Trash2, Calendar as CalendarIcon, Tag, MapPin } from 'lucide-react';
import { Badge } from '../ui/badge';
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

const PRIORITY_BADGE_STYLE: Record<string, { variant: 'destructive' | 'default' | 'secondary'; className?: string }> = {
  Alta: { variant: 'destructive' },
  Media: { variant: 'default' },
  Baja: { variant: 'secondary' },
};

const TareaCard: React.FC<TareaCardProps> = ({ tarea, estado, actions, isArchived }) => {
  const loteNames = getLoteNames(tarea);
  const priorityBorder = PRIORITY_BORDER[tarea.prioridad] || 'border-l-gray-300';
  const priorityBadge = PRIORITY_BADGE_STYLE[tarea.prioridad] || { variant: 'secondary' as const };

  return (
    <div
      className={`
        bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden
        border-l-[3px] ${priorityBorder}
        hover:shadow-md hover:border-gray-300 transition-all duration-150
        ${isArchived ? 'opacity-75' : ''}
      `}
    >
      {/* Card content */}
      <div className="p-3 space-y-2">
        {/* Row 1: Title + Priority badge */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm text-gray-900 line-clamp-2 flex-1 min-w-0">
            {tarea.nombre}
          </h4>
          <Badge
            variant={priorityBadge.variant}
            className="text-[10px] px-1.5 py-0 h-5 flex-shrink-0"
          >
            {tarea.prioridad}
          </Badge>
        </div>

        {/* Row 2: Description (1-line) */}
        {tarea.descripcion && (
          <p className="text-xs text-gray-500 line-clamp-1">
            {tarea.descripcion}
          </p>
        )}

        {/* Row 3: Lote pills */}
        <div className="flex items-center gap-1 flex-wrap">
          <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
          {loteNames.length > 0 ? (
            <>
              {loteNames.slice(0, 2).map((name) => {
                const color = getLoteColor(name);
                return (
                  <span
                    key={name}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border truncate max-w-[100px]"
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
                <span className="text-[10px] text-gray-400 font-medium px-1">
                  +{loteNames.length - 2}
                </span>
              )}
            </>
          ) : (
            <span className="text-[10px] text-gray-400">Sin lote</span>
          )}
        </div>

        {/* Row 4: Task type */}
        <div className="flex items-center gap-1 text-xs text-gray-500">
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
