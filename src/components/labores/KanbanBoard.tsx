import React from 'react';
import { Search, Settings, Plus } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import KanbanColumn from './KanbanColumn';
import { COLUMN_CONFIGS } from './kanban-types';
import type { Tarea } from './Labores';
import type { ColumnActions } from './kanban-types';

interface KanbanBoardProps {
  tareasFiltradas: Tarea[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  actions: ColumnActions;
  onNuevaTarea: (estado?: Tarea['estado']) => void;
  onOpenCatalogo: () => void;
  loading: boolean;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tareasFiltradas,
  searchTerm,
  onSearchChange,
  actions,
  onNuevaTarea,
  onOpenCatalogo,
  loading,
}) => {
  // Group tasks by status
  const tareasPorEstado: Record<Tarea['estado'], Tarea[]> = {
    Banco: tareasFiltradas.filter((t) => t.estado === 'Banco'),
    Programada: tareasFiltradas.filter((t) => t.estado === 'Programada'),
    'En Proceso': tareasFiltradas.filter((t) => t.estado === 'En Proceso'),
    Completada: tareasFiltradas.filter((t) => t.estado === 'Completada'),
    Cancelada: tareasFiltradas.filter((t) => t.estado === 'Cancelada'),
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Search + Actions bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Buscar tareas..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenCatalogo}
            className="flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden md:inline">Tipos de Tareas</span>
          </Button>
          <Button
            size="sm"
            onClick={() => onNuevaTarea()}
            className="flex items-center gap-2 bg-primary hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden md:inline">Nueva Tarea</span>
          </Button>
        </div>
      </div>

      {/* Column container */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMN_CONFIGS.map((config) => (
          <KanbanColumn
            key={config.key}
            config={config}
            tareas={tareasPorEstado[config.key]}
            actions={actions}
            onNuevaTarea={config.showAddButton ? onNuevaTarea : undefined}
          />
        ))}
      </div>
    </div>
  );
};

export default KanbanBoard;
