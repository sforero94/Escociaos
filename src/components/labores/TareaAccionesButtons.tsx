import React from 'react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import type { Tarea } from './Labores';
import type { TareaRowActions } from './tareas-types';

interface TareaAccionesButtonsProps {
  tarea: Tarea;
  actions: TareaRowActions;
  /** Tighter horizontal padding + gap so both buttons fit the desktop
   *  table's narrow Acciones column. Mobile cards keep the roomier default. */
  compact?: boolean;
}

/**
 * Primary action(s) per estado — single source shared by the desktop table's
 * "Acciones" column and the mobile card footer, so the two views can never
 * drift apart.
 *
 * Mirrors the pre-revamp `TareaCard.tsx` logic, minus Banco's "Programar"
 * button: that transition now happens through the inline Estado `<Select>`
 * (see TareaEstadoSelect), per the approved table design.
 */
const TareaAccionesButtons: React.FC<TareaAccionesButtonsProps> = ({
  tarea,
  actions,
  compact = false,
}) => {
  const buttonClassName = compact ? 'px-2' : undefined;

  if (tarea.estado === 'Programada') {
    return (
      <Button size="sm" className={buttonClassName} onClick={() => actions.onRegistrarTrabajo(tarea)}>
        Registrar
      </Button>
    );
  }

  if (tarea.estado === 'En Proceso') {
    return (
      <div className={cn('flex flex-wrap', compact ? 'gap-1' : 'gap-2')}>
        <Button size="sm" className={buttonClassName} onClick={() => actions.onRegistrarTrabajo(tarea)}>
          Registrar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={buttonClassName}
          onClick={() => actions.onCambiarEstado(tarea, 'Completada')}
        >
          Completar
        </Button>
      </div>
    );
  }

  // Banco / Completada / Cancelada — no acciones.
  return null;
};

export default TareaAccionesButtons;
