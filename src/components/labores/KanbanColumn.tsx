import React, { useState } from 'react';
import { Plus, ChevronDown, ChevronUp, Inbox } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import TareaCard from './TareaCard';
import type { Tarea } from './Labores';
import type { ColumnActions, ColumnConfig } from './kanban-types';

interface KanbanColumnProps {
  config: ColumnConfig;
  tareas: Tarea[];
  actions: ColumnActions;
  onNuevaTarea?: (estado: Tarea['estado']) => void;
}

const ARCHIVE_VISIBLE_COUNT = 5;

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  config,
  tareas,
  actions,
  onNuevaTarea,
}) => {
  const [showAllArchived, setShowAllArchived] = useState(false);
  const Icon = config.icon;

  const isArchive = config.isArchive;
  const visibleTareas = isArchive && !showAllArchived
    ? tareas.slice(0, ARCHIVE_VISIBLE_COUNT)
    : tareas;
  const hiddenCount = isArchive ? Math.max(0, tareas.length - ARCHIVE_VISIBLE_COUNT) : 0;

  return (
    <div
      className={`${config.bgClass} rounded-lg border ${config.borderClass} flex-1 min-w-[220px] flex flex-col`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between p-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.iconColorClass}`} />
          <h3 className="font-semibold text-sm text-gray-900">{config.title}</h3>
        </div>
        <Badge variant="secondary" className="text-xs h-5 min-w-[20px] justify-center">
          {tareas.length}
        </Badge>
      </div>

      {/* Scrollable card area */}
      <ScrollArea className="flex-1 min-h-0 px-3 pb-3" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        <div className="space-y-2">
          {tareas.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Inbox className="h-8 w-8 mb-2" />
              <p className="text-xs">Sin tareas</p>
            </div>
          ) : (
            <>
              {visibleTareas.map((tarea) => (
                <TareaCard
                  key={tarea.id}
                  tarea={tarea}
                  estado={config.key}
                  actions={actions}
                  isArchived={isArchive}
                />
              ))}

              {/* Archive expand/collapse for Completada/Cancelada */}
              {isArchive && hiddenCount > 0 && (
                <Collapsible open={showAllArchived} onOpenChange={setShowAllArchived}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full text-xs text-gray-500 hover:text-gray-700 py-2 flex items-center justify-center gap-1 transition-colors">
                      {showAllArchived ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          Ocultar
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          Ver todas ({hiddenCount} más)
                        </>
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2">
                      {tareas.slice(ARCHIVE_VISIBLE_COUNT).map((tarea) => (
                        <TareaCard
                          key={tarea.id}
                          tarea={tarea}
                          estado={config.key}
                          actions={actions}
                          isArchived={isArchive}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}

          {/* Add task button */}
          {config.showAddButton && onNuevaTarea && (
            <Button
              variant="ghost"
              className="w-full text-gray-500 hover:text-gray-700 border-2 border-dashed border-gray-300 hover:border-gray-400 h-8 text-xs"
              onClick={() => onNuevaTarea(config.key)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Agregar tarea
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default KanbanColumn;
