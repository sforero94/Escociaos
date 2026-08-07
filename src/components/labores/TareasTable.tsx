import React, { useMemo, useState } from 'react';
import { Search, Settings, Plus, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { Tarea } from './Labores';
import { ESTADOS, type TareaRowActions } from './tareas-types';
import TareaTableRow from './TareaTableRow';
import TareaMobileCard from './TareaMobileCard';

export type EstadoFiltro = 'Todos' | Tarea['estado'];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

interface TareasTableProps {
  /** Ya filtradas por búsqueda + estado (derivación única en Labores.tsx). */
  tareas: Tarea[];
  /** Total sin filtrar, para el encabezado "Tareas N en total". */
  totalTareas: number;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  estadoFiltro: EstadoFiltro;
  onEstadoFiltroChange: (value: EstadoFiltro) => void;
  actions: TareaRowActions;
  onNuevaTarea: () => void;
  onOpenCatalogo: () => void;
  loading: boolean;
}

/**
 * Orchestrator for the Tareas table: header filters, desktop table + footer,
 * and the < 640px mobile card-list fallback. Row rendering lives in
 * `TareaTableRow.tsx` / `TareaMobileCard.tsx` so this file stays focused on
 * filters, pagination and selection state.
 */
const TareasTable: React.FC<TareasTableProps> = ({
  tareas,
  totalTareas,
  searchTerm,
  onSearchChange,
  estadoFiltro,
  onEstadoFiltroChange,
  actions,
  onNuevaTarea,
  onOpenCatalogo,
  loading,
}) => {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [rowSelection, setRowSelection] = useState<Set<string>>(new Set());

  const totalPages = Math.max(1, Math.ceil(tareas.length / pageSize));

  // Reset to the first page whenever the search term or the estado filter
  // changes — a stale page from a previous filter is confusing, not useful.
  // Adjusting state during render (not in an effect) per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  // avoids the extra render/commit an effect-based reset would cause.
  const [prevFiltros, setPrevFiltros] = useState({ searchTerm, estadoFiltro });
  let effectivePageIndex = pageIndex;
  if (prevFiltros.searchTerm !== searchTerm || prevFiltros.estadoFiltro !== estadoFiltro) {
    setPrevFiltros({ searchTerm, estadoFiltro });
    effectivePageIndex = 0;
    setPageIndex(0);
  }

  // If the tareas list shrinks (delete, or a narrower filter result) and the
  // current page no longer exists, clamp to the last valid page instead of
  // rendering empty — a pure derivation, no state needed.
  effectivePageIndex = Math.min(effectivePageIndex, totalPages - 1);

  const pagedTareas = useMemo(() => {
    const start = effectivePageIndex * pageSize;
    return tareas.slice(start, start + pageSize);
  }, [tareas, effectivePageIndex, pageSize]);

  const selectedCount = useMemo(
    () => tareas.filter((t) => rowSelection.has(t.id)).length,
    [tareas, rowSelection],
  );
  const allSelected = tareas.length > 0 && selectedCount === tareas.length;
  const someSelected = !allSelected && selectedCount > 0;

  const toggleSelected = (id: string) => {
    setRowSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setRowSelection((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        tareas.forEach((t) => next.delete(t.id));
      } else {
        tareas.forEach((t) => next.add(t.id));
      }
      return next;
    });
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPageIndex(0);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const estadoFiltroSelect = (
    <Select value={estadoFiltro} onValueChange={(v) => onEstadoFiltroChange(v as EstadoFiltro)}>
      <SelectTrigger size="sm" className="tareas-select-inline">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Todos">Estado: Todos</SelectItem>
        {ESTADOS.map((estado) => (
          <SelectItem key={estado} value={estado}>
            Estado: {estado}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const paginationFooter = (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-t flex-wrap">
      <div className="text-xs text-muted-foreground">
        {selectedCount} de {tareas.length} fila(s) seleccionada(s).
      </div>
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span>Filas por página</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger size="sm" className="tareas-select-inline">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs whitespace-nowrap">
          Página {effectivePageIndex + 1} de {totalPages}
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            disabled={effectivePageIndex === 0}
            onClick={() => setPageIndex(0)}
            title="Primera página"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={effectivePageIndex === 0}
            onClick={() => setPageIndex(Math.max(0, effectivePageIndex - 1))}
            title="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={effectivePageIndex >= totalPages - 1}
            onClick={() => setPageIndex(Math.min(totalPages - 1, effectivePageIndex + 1))}
            title="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={effectivePageIndex >= totalPages - 1}
            onClick={() => setPageIndex(totalPages - 1)}
            title="Última página"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Tareas{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {totalTareas} en total
          </span>
        </h2>
      </div>

      {/* ===== Desktop filters row ===== */}
      <div className="tareas-view-desktop">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
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
          {estadoFiltroSelect}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onOpenCatalogo} className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>Tipos de Tareas</span>
          </Button>
          <Button size="sm" onClick={onNuevaTarea} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            <span>Crear tarea</span>
          </Button>
        </div>

        <div className="bg-card rounded-lg border overflow-hidden">
          {/* `Table` already wraps itself in an `overflow-x-auto` container — that
              stays as the safety net for narrower desktops, but `table-layout: fixed`
              plus the explicit `<col>` widths below keep the table itself inside the
              content column at a 1440px viewport (measured: needed 1197px against a
              1086px container). Tarea is the only column left unsized, so it absorbs
              whatever width remains. */}
          <Table style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: '40px' }} />
              <col />
              <col style={{ width: '140px' }} />
              <col style={{ width: '70px' }} />
              <col style={{ width: '142px' }} />
              <col style={{ width: '96px' }} />
              <col style={{ width: '112px' }} />
              <col style={{ width: '188px' }} />
              <col style={{ width: '40px' }} />
            </colgroup>
            <TableHeader>
              <TableRow className="tareas-table-row">
                <TableHead>
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    aria-label="Seleccionar todas las tareas"
                  />
                </TableHead>
                <TableHead>Tarea</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">
                  <div>Jornales</div>
                  <div className="text-xs font-normal text-muted-foreground">(Ejec. / Plan.)</div>
                </TableHead>
                <TableHead>Fecha objetivo</TableHead>
                <TableHead>Acciones</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedTareas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No hay tareas que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              ) : (
                pagedTareas.map((tarea) => (
                  <TareaTableRow
                    key={tarea.id}
                    tarea={tarea}
                    selected={rowSelection.has(tarea.id)}
                    onToggleSelected={toggleSelected}
                    actions={actions}
                  />
                ))
              )}
            </TableBody>
          </Table>

          {paginationFooter}
        </div>
      </div>

      {/* ===== Mobile card-list fallback (< 640px) ===== */}
      <div className="tareas-view-mobile">
        <div className="flex flex-col gap-2 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar tareas..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
          {estadoFiltroSelect}
          <Button size="sm" onClick={onNuevaTarea} className="flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" />
            <span>Crear tarea</span>
          </Button>
        </div>

        {pagedTareas.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-base">
            No hay tareas que coincidan con los filtros.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pagedTareas.map((tarea) => (
              <TareaMobileCard key={tarea.id} tarea={tarea} actions={actions} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <div className="text-sm whitespace-nowrap">
            Página {effectivePageIndex + 1} de {totalPages}
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={effectivePageIndex === 0}
              onClick={() => setPageIndex(Math.max(0, effectivePageIndex - 1))}
              title="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={effectivePageIndex >= totalPages - 1}
              onClick={() => setPageIndex(Math.min(totalPages - 1, effectivePageIndex + 1))}
              title="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TareasTable;
