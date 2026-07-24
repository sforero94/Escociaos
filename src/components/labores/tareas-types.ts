import type { Tarea } from './Labores';

/**
 * Row-level actions shared by the desktop table rows and the mobile cards.
 * Renamed from the Kanban-era `ColumnActions` (same shape) — table rows and
 * mobile cards replace column cards as the callers.
 */
export interface TareaRowActions {
  onVerDetalles: (tarea: Tarea) => void;
  onEditar: (tarea: Tarea) => void;
  onRegistrarTrabajo: (tarea: Tarea) => void;
  onCambiarEstado: (tarea: Tarea, nuevoEstado: Tarea['estado']) => void;
  onEliminar: (tarea: Tarea) => void;
}

/**
 * Canonical estado order. Drives the inline `<Select>` items on every row
 * and the header "Estado" filter — one list, so both always agree.
 */
export const ESTADOS: Tarea['estado'][] = [
  'Banco',
  'Programada',
  'En Proceso',
  'Completada',
  'Cancelada',
];

export interface EstadoVisualConfig {
  /** bg/border/text Tailwind classes for the inline estado chip (table row
   *  <Select> trigger and mobile card badge). */
  chipClassName: string;
}

/**
 * Single source of truth for the estado color palette. Was `COLUMN_CONFIGS`
 * (Kanban column chrome) — the same color families now drive the inline
 * Estado <Select> chip instead of a column header.
 */
export const ESTADO_CONFIGS: Record<Tarea['estado'], EstadoVisualConfig> = {
  Banco: {
    chipClassName: 'bg-gray-50 border-gray-200 text-gray-600',
  },
  Programada: {
    chipClassName: 'bg-blue-50 border-blue-200 text-blue-700',
  },
  'En Proceso': {
    chipClassName: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  },
  Completada: {
    chipClassName: 'bg-green-50 border-green-200 text-green-700',
  },
  Cancelada: {
    chipClassName: 'bg-red-50 border-red-200 text-red-700',
  },
};

export interface PrioridadVisualConfig {
  chipClassName: string;
}

/**
 * Priority pill palette. Was `PRIORITY_STYLE` in the now-deleted
 * `TareaCard.tsx` — carried forward verbatim (same classes, same colors).
 */
export const PRIORIDAD_CONFIGS: Record<Tarea['prioridad'], PrioridadVisualConfig> = {
  Alta: { chipClassName: 'bg-red-50 border-red-200 text-red-600' },
  Media: { chipClassName: 'bg-orange-50 border-orange-200 text-orange-600' },
  Baja: { chipClassName: 'bg-green-50 border-green-200 text-green-600' },
};

/**
 * Resolves the display names of a tarea's assigned lotes, in priority order:
 * the new multi-lote array, then the view's aggregated column, then the
 * legacy single-lote column. Ported from the now-deleted `TareaCard.tsx`.
 */
export function getLoteNames(tarea: Tarea): string[] {
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

/**
 * Max number of lote pills shown inline before collapsing into a "+N" chip.
 * Keeps a row to ~1 line of pills regardless of how many lotes a tarea has —
 * the full list is still available via the "+N" pill's tooltip and the
 * detail dialog.
 */
export const MAX_VISIBLE_LOTES = 2;

/**
 * Plain-text lote summary ("Lote 2, Lote 3 +1") for contexts that render a
 * single text line rather than pill chips (mobile card meta row).
 */
export function formatLoteResumen(loteNames: string[], maxVisible = MAX_VISIBLE_LOTES): string {
  if (loteNames.length === 0) return 'Sin lote';
  if (loteNames.length <= maxVisible) return loteNames.join(', ');
  const restantes = loteNames.length - maxVisible;
  return `${loteNames.slice(0, maxVisible).join(', ')} +${restantes}`;
}
