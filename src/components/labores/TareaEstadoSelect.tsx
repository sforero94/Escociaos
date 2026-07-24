import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { cn } from '../ui/utils';
import type { Tarea } from './Labores';
import { ESTADOS, ESTADO_CONFIGS } from './tareas-types';

interface TareaEstadoSelectProps {
  tarea: Tarea;
  onCambiarEstado: (tarea: Tarea, nuevoEstado: Tarea['estado']) => void;
}

/**
 * Inline Estado <Select>, rendered as a colored chip. Every transition —
 * including Banco → Programada (the old Kanban "Programar" button) — goes
 * through here and hits the same `handleCambiarEstado` validation as before.
 *
 * Shared by the desktop table row and the mobile card so estado can be
 * changed from either surface without duplicating the validation wiring.
 */
const TareaEstadoSelect: React.FC<TareaEstadoSelectProps> = ({ tarea, onCambiarEstado }) => (
  <Select
    value={tarea.estado}
    onValueChange={(value) => onCambiarEstado(tarea, value as Tarea['estado'])}
  >
    <SelectTrigger
      size="sm"
      aria-label={`Cambiar estado de la tarea "${tarea.nombre}"`}
      className={cn(
        'tareas-estado-chip rounded-md border text-xs font-semibold',
        ESTADO_CONFIGS[tarea.estado].chipClassName,
      )}
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {ESTADOS.map((estado) => (
        <SelectItem key={estado} value={estado}>
          {estado}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export default TareaEstadoSelect;
