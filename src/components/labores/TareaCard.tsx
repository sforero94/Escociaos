import React from 'react';
import { MoreVertical, Pencil, ClipboardList, ArrowRight, Trash2, Calendar as CalendarIcon, Eye, MapPin } from 'lucide-react';
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

// Soft pastel pill — rounded-lg like Figma, not rounded-full
const PRIORITY_STYLE: Record<string, string> = {
  Alta:  'bg-red-50    text-red-600    border border-red-200',
  Media: 'bg-orange-50 text-orange-500 border border-orange-200',
  Baja:  'bg-green-50  text-green-600  border border-green-200',
};

const TareaCard: React.FC<TareaCardProps> = ({ tarea, estado, actions, isArchived }) => {
  const loteNames = getLoteNames(tarea);
  const priorityClasses = PRIORITY_STYLE[tarea.prioridad] ?? PRIORITY_STYLE.Baja;

  const isArchiveColumn = estado === 'Completada' || estado === 'Cancelada';

  return (
    <div
      className={`
        bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden
        hover:shadow-md transition-shadow duration-150
        ${isArchived ? 'opacity-75' : ''}
      `}
    >
      <div className="p-4 flex flex-col gap-3">

        {/* ── Row 1: Title + Priority pill + three-dot ── */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-bold text-base text-gray-900 line-clamp-2 flex-1 min-w-0 leading-snug">
            {tarea.nombre}
          </h4>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${priorityClasses}`}>
              {tarea.prioridad}
            </span>
            {/* Three-dot menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => actions.onVerDetalles(tarea)}>
                  <Eye className="h-4 w-4" />
                  Ver Detalles
                </DropdownMenuItem>
                {!isArchiveColumn && (
                  <DropdownMenuItem onClick={() => actions.onEditar(tarea)}>
                    <Pencil className="h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                )}
                {!isArchiveColumn && (
                  <>
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
        </div>

        {/* ── Row 2: Description ── */}
        {tarea.descripcion && (
          <p className="text-sm text-gray-400 line-clamp-2 leading-snug -mt-1">
            {tarea.descripcion}
          </p>
        )}

        {/* ── Row 3: Lotes — pin icon + stacked pills ── */}
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
          {loteNames.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {loteNames.map((name, idx) => (
                <span
                  key={name}
                  className="inline-block text-sm text-gray-600 border border-gray-200 rounded-md px-2.5 py-0.5 bg-white w-fit"
                >
                  {idx + 1}. {name}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-sm text-gray-400">Sin lote</span>
          )}
        </div>

        {/* ── Row 4: Task type (left) + Primary action (right) ── */}
        <div className="flex items-center justify-between gap-2">
          {/* Task type with gray dot */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="h-2 w-2 rounded-full bg-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-500 truncate">
              {tarea.tipo_tarea?.nombre || 'Sin tipo'}
            </span>
          </div>

          {/* Primary CTA */}
          {estado === 'Banco' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onCambiarEstado(tarea, 'Programada')}
              className="h-8 px-3 text-sm flex-shrink-0"
            >
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              Programar
            </Button>
          )}

          {estado === 'Programada' && (
            <Button
              size="sm"
              onClick={() => actions.onRegistrarTrabajo(tarea)}
              className="h-8 px-4 text-sm font-semibold bg-[#73991C] hover:bg-[#5a7716] text-white flex-shrink-0 rounded-lg"
            >
              Registrar
            </Button>
          )}

          {estado === 'En Proceso' && (
            <div className="flex gap-1.5 flex-shrink-0">
              <Button
                size="sm"
                onClick={() => actions.onRegistrarTrabajo(tarea)}
                className="h-8 px-3 text-sm font-semibold bg-[#73991C] hover:bg-[#5a7716] text-white rounded-lg"
              >
                <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                Registrar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => actions.onCambiarEstado(tarea, 'Completada')}
                className="h-8 px-3 text-sm text-green-700 border-green-300 hover:bg-green-50"
              >
                <ArrowRight className="h-3.5 w-3.5 mr-1" />
                Completar
              </Button>
            </div>
          )}

          {isArchiveColumn && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onVerDetalles(tarea)}
              className="h-8 px-3 text-sm flex-shrink-0"
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Ver Detalles
            </Button>
          )}
        </div>

      </div>
    </div>
  );
};

export default TareaCard;
