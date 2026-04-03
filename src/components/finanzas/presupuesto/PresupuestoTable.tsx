import { useState } from 'react';
import { formatCompact } from '@/utils/format';
import { EjecucionBadge, VariacionBadge } from './EjecucionBadge';
import { PresupuestoCategoriaRow } from './PresupuestoCategoriaRow';
import { PresupuestoConceptoRow } from './PresupuestoConceptoRow';
import type { PresupuestoData } from '@/types/finanzas';

function formatQuarterLabel(quarters: number[]): string {
  if (quarters.length === 1) return `Q${quarters[0]}`;
  if (quarters.length === 4) return 'Año';
  return quarters.map((q) => `Q${q}`).join('+');
}

interface PresupuestoTableProps {
  data: PresupuestoData;
  showPct: boolean;
  anio: number;
  quarters: number[];
  onBudgetChange: (conceptoId: string, categoriaId: string, newAmount: number) => void;
}

export function PresupuestoTable({ data, showPct, anio, quarters, onBudgetChange }: PresupuestoTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleCategory = (catId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const fmt = (v: number) => (v > 0 ? '$' + formatCompact(v) : '');
  const t = data.totals;

  // Column count varies with showPct toggle
  const extraCols = showPct ? 3 : 0; // Act%, Ppto%, EjecAño

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
      <table className="w-full text-left">
        {/* Column group headers */}
        <thead>
          <tr className="bg-gray-50/80 text-[10px] font-semibold tracking-wider uppercase">
            <th colSpan={showPct ? 4 : 3} className="px-3 py-1.5 text-gray-400">
              Ejecución
            </th>
            <th colSpan={showPct ? 4 : 3} className="px-3 py-1.5 text-primary border-l border-gray-100">
              Presupuesto
            </th>
            <th colSpan={3} className="px-3 py-1.5 text-gray-400 border-l border-gray-100">
              Comparativo año anterior
            </th>
          </tr>

          {/* Column headers */}
          <tr className="bg-gray-50 text-[11px] font-semibold text-gray-500 border-b border-gray-200">
            <th className="w-8 px-2 py-2"></th>
            <th className="px-3 py-2">Concepto</th>
            <th className="px-3 py-2 text-right">Ejecución {formatQuarterLabel(quarters)}</th>
            {showPct && <th className="px-2 py-2 text-right">Ejec %</th>}
            <th className="px-3 py-2 text-right border-l border-gray-100">Ppto {formatQuarterLabel(quarters)}</th>
            <th className="px-3 py-2 text-right">Ppto Año</th>
            {showPct && <th className="px-2 py-2 text-right">Ppto %</th>}
            <th className="px-3 py-2 text-center">Ejecución</th>
            {showPct && <th className="px-3 py-2 text-center">Ejec Año</th>}
            <th className="px-3 py-2 text-right border-l border-gray-100">{formatQuarterLabel(quarters)} {anio - 1}</th>
            <th className="px-2 py-2 text-center">Var YoY</th>
            <th className="px-3 py-2 text-right">Total {anio - 1}</th>
          </tr>
        </thead>

        <tbody>
          {/* Grand total row */}
          <tr className="bg-primary text-white text-xs font-semibold">
            <td className="px-2 py-2.5"></td>
            <td className="px-3 py-2.5">Suma Total</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{fmt(t.actual_q)}</td>
            {showPct && <td className="px-2 py-2.5 text-right">100%</td>}
            <td className="px-3 py-2.5 text-right tabular-nums">{fmt(t.monto_trimestral)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{fmt(t.monto_anual)}</td>
            {showPct && <td className="px-2 py-2.5 text-right">100%</td>}
            <td className="px-3 py-2.5 text-center">{t.ejecucion_vs_q !== null ? t.ejecucion_vs_q + '%' : ''}</td>
            {showPct && <td className="px-3 py-2.5 text-center">{t.ejecucion_vs_anio !== null ? t.ejecucion_vs_anio + '%' : ''}</td>}
            <td className="px-3 py-2.5 text-right tabular-nums">{fmt(t.actual_q_anterior)}</td>
            <td className="px-2 py-2.5 text-center">{t.variacion_yoy !== null ? (t.variacion_yoy > 0 ? '+' : '') + t.variacion_yoy + '%' : ''}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{fmt(t.actual_anio_anterior)}</td>
          </tr>

          {/* Categories + conceptos */}
          {data.categorias.map((cat) => {
            const isExpanded = expanded.has(cat.categoria_id);
            return (
              <PresupuestoCategoryGroup
                key={cat.categoria_id}
                categoria={cat}
                expanded={isExpanded}
                onToggle={() => toggleCategory(cat.categoria_id)}
                showPct={showPct}
                onBudgetChange={onBudgetChange}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PresupuestoCategoryGroup({
  categoria,
  expanded,
  onToggle,
  showPct,
  onBudgetChange,
}: {
  categoria: PresupuestoData['categorias'][0];
  expanded: boolean;
  onToggle: () => void;
  showPct: boolean;
  onBudgetChange: (conceptoId: string, categoriaId: string, newAmount: number) => void;
}) {
  return (
    <>
      <PresupuestoCategoriaRow
        categoria={categoria}
        expanded={expanded}
        onToggle={onToggle}
        showPct={showPct}
      />
      {expanded &&
        categoria.conceptos.map((row) => (
          <PresupuestoConceptoRow
            key={row.concepto_id}
            row={row}
            showPct={showPct}
            onBudgetChange={onBudgetChange}
          />
        ))}
    </>
  );
}
