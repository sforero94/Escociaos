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
  modoPresupuesto: boolean;
  onBudgetChange: (conceptoId: string, categoriaId: string, newAmount: number) => void;
}

export function PresupuestoTable({ data, showPct, anio, quarters, modoPresupuesto, onBudgetChange }: PresupuestoTableProps) {
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
      <table className="w-full table-fixed text-left">
        {/* Column widths: concepto gets remaining space, numerics are fixed */}
        <colgroup>
          <col className="w-7" />
          <col />
          <col className="w-[108px]" />
          {showPct && <col className="w-[56px]" />}
          <col className="w-[108px]" />
          <col className="w-[100px]" />
          {showPct && <col className="w-[56px]" />}
          <col className="w-[76px]" />
          {showPct && <col className="w-[76px]" />}
          <col className="w-[108px]" />
          <col className="w-[72px]" />
          <col className="w-[112px]" />
        </colgroup>

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
            <th className="px-2 py-2"></th>
            <th className="px-3 py-2">Concepto</th>
            <th className="px-3 py-2 text-center">Ejecución {formatQuarterLabel(quarters)}</th>
            {showPct && <th className="px-2 py-2 text-center">Ejec %</th>}
            <th className="px-3 py-2 text-center border-l border-gray-100">Ppto {formatQuarterLabel(quarters)}</th>
            <th className="px-3 py-2 text-center">Ppto Año</th>
            {showPct && <th className="px-2 py-2 text-center">Ppto %</th>}
            <th className="px-3 py-2 text-center">Ejecución</th>
            {showPct && <th className="px-3 py-2 text-center">Ejec Año</th>}
            <th className="px-3 py-2 text-center border-l border-gray-100">{formatQuarterLabel(quarters)} {anio - 1}</th>
            <th className="px-2 py-2 text-center">Var YoY</th>
            <th className="px-3 py-2 text-center">Total {anio - 1}</th>
          </tr>
        </thead>

        <tbody>
          {/* Grand total row */}
          <tr className="bg-primary text-white text-xs font-semibold">
            <td className="px-2 py-2.5"></td>
            <td className="px-3 py-2.5">Suma Total</td>
            <td className="px-3 py-2.5 text-center tabular-nums">{fmt(t.actual_q)}</td>
            {showPct && <td className="px-2 py-2.5 text-center">100%</td>}
            <td className="px-3 py-2.5 text-center tabular-nums">{fmt(t.monto_trimestral)}</td>
            <td className="px-3 py-2.5 text-center tabular-nums">{fmt(t.monto_anual)}</td>
            {showPct && <td className="px-2 py-2.5 text-center">100%</td>}
            <td className="px-3 py-2.5 text-center">{t.ejecucion_vs_q !== null ? t.ejecucion_vs_q + '%' : ''}</td>
            {showPct && <td className="px-3 py-2.5 text-center">{t.ejecucion_vs_anio !== null ? t.ejecucion_vs_anio + '%' : ''}</td>}
            <td className="px-3 py-2.5 text-center tabular-nums">{fmt(t.actual_q_anterior)}</td>
            <td className="px-2 py-2.5 text-center">{t.variacion_yoy !== null ? (t.variacion_yoy > 0 ? '+' : '') + t.variacion_yoy + '%' : ''}</td>
            <td className="px-3 py-2.5 text-center tabular-nums">{fmt(t.actual_anio_anterior)}</td>
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
                modoPresupuesto={modoPresupuesto}
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
  modoPresupuesto,
  onBudgetChange,
}: {
  categoria: PresupuestoData['categorias'][0];
  expanded: boolean;
  onToggle: () => void;
  showPct: boolean;
  modoPresupuesto: boolean;
  onBudgetChange: (conceptoId: string, categoriaId: string, newAmount: number) => void;
}) {
  const visibleConceptos = modoPresupuesto
    ? categoria.conceptos
    : categoria.conceptos.filter((r) => r.monto_anual > 0 || r.actual_q > 0 || r.actual_q_anterior > 0 || r.actual_anio_anterior > 0);

  return (
    <>
      <PresupuestoCategoriaRow
        categoria={categoria}
        expanded={expanded}
        onToggle={onToggle}
        showPct={showPct}
      />
      {expanded &&
        visibleConceptos.map((row) => (
          <PresupuestoConceptoRow
            key={row.concepto_id}
            row={row}
            showPct={showPct}
            editable={modoPresupuesto}
            onBudgetChange={onBudgetChange}
          />
        ))}
    </>
  );
}
