import React from 'react';
import { MoreVertical, Eye, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { Tarea } from './Labores';
import type { TareaRowActions } from './tareas-types';

interface TareaRowMenuProps {
  tarea: Tarea;
  actions: TareaRowActions;
}

/**
 * The ⋮ menu (Ver detalles · Editar · separador · Eliminar). Shared by the
 * desktop table row and the mobile card so Editar/Eliminar stay reachable
 * on both surfaces.
 */
const TareaRowMenu: React.FC<TareaRowMenuProps> = ({ tarea, actions }) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground outline-none"
      aria-label={`Más acciones para "${tarea.nombre}"`}
    >
      <MoreVertical className="h-4 w-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => actions.onVerDetalles(tarea)}>
        <Eye className="h-4 w-4" />
        Ver detalles
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => actions.onEditar(tarea)}>
        <Pencil className="h-4 w-4" />
        Editar
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={() => actions.onEliminar(tarea)}>
        <Trash2 className="h-4 w-4" />
        Eliminar
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default TareaRowMenu;
