import { useState, useRef } from 'react';
import { formatCompact } from '@/utils/format';
import { EjecucionBadge, VariacionBadge, StatusDot } from './EjecucionBadge';
import type { PresupuestoRow } from '@/types/finanzas';

interface PresupuestoConceptoRowProps {
  row: PresupuestoRow;
  showPct: boolean;
  onBudgetChange: (conceptoId: string, categoriaId: string, newAmount: number) => void;
}

export function PresupuestoConceptoRow({ row, showPct, onBudgetChange }: PresupuestoConceptoRowProps) {
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
    <tr className="border-b border-gray-100 hover:bg-gray-50/50 text-xs">
      {/* Status dot */}
      <td className="px-2 py-1.5 text-center">
        <StatusDot ejecucion={row.ejecucion_vs_q} />
      </td>

      {/* Concepto name */}
      <td className="pl-7 pr-3 py-1.5">
        <span className={row.is_principal ? 'font-semibold text-foreground' : 'text-foreground'}>
          {row.concepto_nombre}
        </span>
      </td>

      {/* Actual Q */}
      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(row.actual_q)}</td>

      {/* Act % (toggleable) */}
      {showPct && <td className="px-2 py-1.5 text-right text-gray-400 tabular-nums">{row.pct_actual > 0 ? Math.round(row.pct_actual) + '%' : ''}</td>}

      {/* Group separator + Ppto Q */}
      <td className="px-3 py-1.5 text-right border-l border-gray-100 tabular-nums">{fmt(row.monto_trimestral)}</td>

      {/* Ppto Año (editable) */}
      <td className="px-2 py-1.5 text-right" onClick={!editing ? handleStartEdit : undefined}>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onWheel={(e) => e.currentTarget.blur()}
            className="w-full text-right text-xs font-medium text-primary bg-green-50 border border-primary/30 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary/50"
            autoFocus
          />
        ) : (
          <span className="inline-flex items-center gap-1 cursor-pointer px-2 py-1 rounded bg-green-50/60 border border-primary/20 text-primary font-medium tabular-nums hover:bg-green-50">
            {fmt(row.monto_anual) || '—'}
          </span>
        )}
      </td>

      {/* Ppto % (toggleable) */}
      {showPct && <td className="px-2 py-1.5 text-right text-gray-400 tabular-nums">{row.pct_presupuesto > 0 ? Math.round(row.pct_presupuesto) + '%' : ''}</td>}

      {/* Ejecución vs Q */}
      <td className="px-3 py-1.5 text-center">
        <EjecucionBadge value={row.ejecucion_vs_q} />
      </td>

      {/* Ejec vs Año (toggleable) */}
      {showPct && <td className="px-3 py-1.5 text-center"><EjecucionBadge value={row.ejecucion_vs_anio} /></td>}

      {/* Group separator + Q Anterior */}
      <td className="px-3 py-1.5 text-right border-l border-gray-100 tabular-nums">{fmt(row.actual_q_anterior)}</td>

      {/* Var YoY */}
      <td className="px-2 py-1.5 text-center">
        <VariacionBadge value={row.variacion_yoy} />
      </td>

      {/* Total Anterior */}
      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(row.actual_anio_anterior)}</td>
    </tr>
  );
}
