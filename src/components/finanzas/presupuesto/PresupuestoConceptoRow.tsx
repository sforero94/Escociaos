import { useState, useRef } from 'react';
import { formatCompact } from '@/utils/format';
import { EjecucionBadge, VariacionBadge, StatusDot } from './EjecucionBadge';
import { TableRow, TableCell } from '@/components/ui/table';
import type { PresupuestoRow } from '@/types/finanzas';

interface PresupuestoConceptoRowProps {
  row: PresupuestoRow;
  showPct: boolean;
  editable: boolean;
  onBudgetChange: (conceptoId: string, categoriaId: string, newAmount: number) => void;
  onVerGastos: () => void;
}

export function PresupuestoConceptoRow({ row, showPct, editable, onBudgetChange, onVerGastos }: PresupuestoConceptoRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = () => {
    setEditValue(row.monto_anual > 0 ? String(row.monto_anual) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleSave = () => {
    setEditing(false);
    const val = Number(editValue) || 0;
    if (val !== row.monto_anual) {
      onBudgetChange(row.concepto_id, row.categoria_id, val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  };

  const fmt = (v: number) => (v > 0 ? '$' + formatCompact(v) : '');

  return (
    <TableRow className="text-xs hover:bg-green-100">
      {/* Columna que identifica la fila (dot de estado + nombre del
          concepto), congelada — mismo patrón que PresupuestoCategoriaRow.
          El fondo blanco ya es el default de `sticky`, así que no hace
          falta repetirlo por className. */}
      <TableCell sticky className="pl-7 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusDot ejecucion={row.ejecucion_vs_q} />
          {/* Recorte 2026-08-07 — mismo arreglo y misma justificación que
              PresupuestoCategoriaRow.tsx: envolver a 2 líneas en vez de
              ensanchar la columna congelada (170px), más `title` de
              respaldo. Este renglón parte con menos ancho todavía (`pl-7`
              de sangría), así que el envolver importa más aquí. */}
          <span
            title={row.concepto_nombre}
            className={
              'truncate flex-1 min-w-0 max-sm:whitespace-normal max-sm:line-clamp-2 ' +
              (row.is_principal ? 'font-semibold text-foreground' : 'text-foreground')
            }
          >
            {row.concepto_nombre}
          </span>
        </div>
      </TableCell>

      {/* Actual Q — abre el detalle de gastos que suman esta cifra */}
      <TableCell className="py-1.5 text-center tabular-nums">
        {row.actual_q > 0 ? (
          <button
            type="button"
            onClick={onVerGastos}
            className="cursor-pointer hover:underline"
            title="Ver gastos"
          >
            {fmt(row.actual_q)}
          </button>
        ) : (
          fmt(row.actual_q)
        )}
      </TableCell>

      {/* Act % (toggleable) */}
      {showPct && <TableCell className="px-2 py-1.5 text-center text-gray-400 tabular-nums">{row.pct_actual > 0 ? Math.round(row.pct_actual) + '%' : ''}</TableCell>}

      {/* Group separator + Ppto Q */}
      <TableCell className="py-1.5 text-center border-l border-gray-100 tabular-nums">{fmt(row.monto_trimestral)}</TableCell>

      {/* Ppto Año (editable only in modo presupuesto) */}
      <TableCell className="px-2 py-1.5 text-center" onClick={editable && !editing ? handleStartEdit : undefined}>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onWheel={(e) => e.currentTarget.blur()}
            className="w-full text-center text-xs font-medium text-primary bg-green-50 border border-primary/30 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary/50"
            autoFocus
          />
        ) : editable ? (
          <span className="inline-flex items-center justify-center gap-1 cursor-pointer px-2 py-1 rounded bg-green-50/60 border border-primary/20 text-primary font-medium tabular-nums hover:bg-green-50">
            {fmt(row.monto_anual) || '—'}
          </span>
        ) : (
          <span className="tabular-nums">{fmt(row.monto_anual) || '—'}</span>
        )}
      </TableCell>

      {/* Ppto % (toggleable) */}
      {showPct && <TableCell className="px-2 py-1.5 text-center text-gray-400 tabular-nums">{row.pct_presupuesto > 0 ? Math.round(row.pct_presupuesto) + '%' : ''}</TableCell>}

      {/* Ejecución vs Q */}
      <TableCell className="py-1.5 text-center">
        <EjecucionBadge value={row.ejecucion_vs_q} />
      </TableCell>

      {/* Ejec vs Año (toggleable) */}
      {showPct && <TableCell className="py-1.5 text-center"><EjecucionBadge value={row.ejecucion_vs_anio} /></TableCell>}

      {/* Group separator + Q Anterior */}
      <TableCell className="py-1.5 text-center border-l border-gray-100 tabular-nums">{fmt(row.actual_q_anterior)}</TableCell>

      {/* Var YoY */}
      <TableCell className="px-2 py-1.5 text-center">
        <VariacionBadge value={row.variacion_yoy} />
      </TableCell>

      {/* Total Anterior */}
      <TableCell className="py-1.5 text-center tabular-nums">{fmt(row.actual_anio_anterior)}</TableCell>
    </TableRow>
  );
}
