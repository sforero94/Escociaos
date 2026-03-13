import { useState, Fragment } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCompact } from '@/utils/format';
import type { PivotRow } from '@/types/finanzas';
import { GastosDetalleDialog } from './GastosDetalleDialog';

const formatPivot = (v: number) => `$${formatCompact(v)}`;
const cellClickable = "cursor-pointer hover:bg-primary/10 rounded transition-colors";

function VariacionBadge({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior === 0 && actual === 0) return null;
  const pct = anterior === 0 ? 100 : ((actual - anterior) / anterior) * 100;
  const isUp = pct > 0;
  const isNeutral = pct === 0;

  if (isNeutral) return null;

  // For gastos: up = bad (red), down = good (green)
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${
      isUp ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
    }`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{pct.toFixed(0)}%
    </span>
  );
}

type ColumnKey = 'ytd_actual' | 'ytd_anterior' | 'total_anterior' | 'total_n2';

function getDateRange(col: ColumnKey): { desde: string; hasta: string; label: string } {
  const now = new Date();
  const year = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  switch (col) {
    case 'ytd_actual':
      return { desde: `${year}-01-01`, hasta: `${year}-${mm}-${dd}`, label: `YTD ${year}` };
    case 'ytd_anterior':
      return { desde: `${year - 1}-01-01`, hasta: `${year - 1}-${mm}-${dd}`, label: `YTD ${year - 1}` };
    case 'total_anterior':
      return { desde: `${year - 1}-01-01`, hasta: `${year - 1}-12-31`, label: `Total ${year - 1}` };
    case 'total_n2':
      return { desde: `${year - 2}-01-01`, hasta: `${year - 2}-12-31`, label: `Total ${year - 2}` };
  }
}

interface DetalleGastosExpandibleProps {
  data: PivotRow[];
  loading?: boolean;
}

interface DialogState {
  negocioId: string;
  negocioNombre: string;
  categoriaNombre: string;
  periodoLabel: string;
  fechaDesde: string;
  fechaHasta: string;
}

export function DetalleGastosExpandible({ data, loading }: DetalleGastosExpandibleProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const currentYear = new Date().getFullYear();

  const toggleExpand = (negocioId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(negocioId)) {
        next.delete(negocioId);
      } else {
        next.add(negocioId);
      }
      return next;
    });
  };

  const toggleExpandCat = (key: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleCellClick = (
    parentRow: PivotRow,
    categoriaNombre: string,
    col: ColumnKey,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    const range = getDateRange(col);
    setDialog({
      negocioId: parentRow.negocio_id,
      negocioNombre: parentRow.negocio,
      categoriaNombre,
      periodoLabel: range.label,
      fechaDesde: range.desde,
      fechaHasta: range.hasta,
    });
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-6">
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) return null;

  return (
    <>
      <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-primary/10">
          <h3 className="text-sm font-semibold text-foreground">Detalle de Gastos por Negocio y Categoria</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground" />
                <th colSpan={3} className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-foreground">YTD</th>
                <th colSpan={3} className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-foreground">Total Anual</th>
              </tr>
              <tr className="bg-gray-50">
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-brand-brown/50" />
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">{currentYear}</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">{currentYear - 1}</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">Var YoY</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">{currentYear - 1}</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">{currentYear - 2}</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">Var YoY</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const grandTotal = {
                  ytd_actual: data.reduce((s, r) => s + r.ytd_actual, 0),
                  ytd_anterior: data.reduce((s, r) => s + r.ytd_anterior, 0),
                  total_anterior: data.reduce((s, r) => s + r.total_anterior, 0),
                  total_n2: data.reduce((s, r) => s + r.total_n2, 0),
                };
                return (
                  <tr className="border-t-2 border-foreground/20 bg-gray-100 font-bold">
                    <td className="px-3 py-2 text-foreground">TOTAL</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPivot(grandTotal.ytd_actual)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPivot(grandTotal.ytd_anterior)}</td>
                    <td className="px-3 py-2 text-right"><VariacionBadge actual={grandTotal.ytd_actual} anterior={grandTotal.ytd_anterior} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPivot(grandTotal.total_anterior)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPivot(grandTotal.total_n2)}</td>
                    <td className="px-3 py-2 text-right"><VariacionBadge actual={grandTotal.total_anterior} anterior={grandTotal.total_n2} /></td>
                  </tr>
                );
              })()}
              {data.map((row, i) => {
                const isExpanded = expanded.has(row.negocio_id);
                const hasCategorias = row.categorias && row.categorias.length > 0;

                return (
                  <Fragment key={row.negocio_id}>
                    <tr
                      className={`border-t border-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-green-50 transition-colors ${hasCategorias ? 'cursor-pointer' : ''}`}
                      onClick={() => hasCategorias && toggleExpand(row.negocio_id)}
                    >
                      <td className="px-3 py-2 font-medium text-foreground">
                        <div className="flex items-center gap-1.5">
                          {hasCategorias && (
                            isExpanded
                              ? <ChevronDown className="w-4 h-4 text-brand-brown/50" />
                              : <ChevronRight className="w-4 h-4 text-brand-brown/50" />
                          )}
                          {row.negocio}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatPivot(row.ytd_actual)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPivot(row.ytd_anterior)}</td>
                      <td className="px-3 py-2 text-right"><VariacionBadge actual={row.ytd_actual} anterior={row.ytd_anterior} /></td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatPivot(row.total_anterior)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPivot(row.total_n2)}</td>
                      <td className="px-3 py-2 text-right"><VariacionBadge actual={row.total_anterior} anterior={row.total_n2} /></td>
                    </tr>
                    {isExpanded && row.categorias?.map((cat) => {
                      const catKey = `${row.negocio_id}::${cat.negocio_id}`;
                      const isCatExpanded = expandedCats.has(catKey);
                      const hasConceptos = cat.categorias && cat.categorias.length > 0;

                      return (
                        <Fragment key={cat.negocio_id}>
                          <tr
                            className={`bg-primary/[0.02] border-t border-primary/5 hover:bg-green-50 transition-colors ${hasConceptos ? 'cursor-pointer' : ''}`}
                            onClick={() => hasConceptos && toggleExpandCat(catKey)}
                          >
                            <td className="px-3 py-2 pl-10 text-brand-brown/70 text-sm">
                              <div className="flex items-center gap-1.5">
                                {hasConceptos && (
                                  isCatExpanded
                                    ? <ChevronDown className="w-3.5 h-3.5 text-brand-brown/40" />
                                    : <ChevronRight className="w-3.5 h-3.5 text-brand-brown/40" />
                                )}
                                {cat.negocio}
                              </div>
                            </td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums text-sm ${cellClickable}`}
                              onClick={(e) => handleCellClick(row, cat.negocio, 'ytd_actual', e)}
                            >
                              {formatPivot(cat.ytd_actual)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums text-sm ${cellClickable}`}
                              onClick={(e) => handleCellClick(row, cat.negocio, 'ytd_anterior', e)}
                            >
                              {formatPivot(cat.ytd_anterior)}
                            </td>
                            <td className="px-3 py-2 text-right"><VariacionBadge actual={cat.ytd_actual} anterior={cat.ytd_anterior} /></td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums text-sm ${cellClickable}`}
                              onClick={(e) => handleCellClick(row, cat.negocio, 'total_anterior', e)}
                            >
                              {formatPivot(cat.total_anterior)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums text-sm ${cellClickable}`}
                              onClick={(e) => handleCellClick(row, cat.negocio, 'total_n2', e)}
                            >
                              {formatPivot(cat.total_n2)}
                            </td>
                            <td className="px-3 py-2 text-right"><VariacionBadge actual={cat.total_anterior} anterior={cat.total_n2} /></td>
                          </tr>
                          {isCatExpanded && cat.categorias?.map((concepto) => (
                            <tr key={concepto.negocio_id} className="bg-primary/[0.01] border-t border-primary/5 hover:bg-green-50/50 transition-colors">
                              <td className="px-3 py-1.5 pl-16 text-brand-brown/50 text-xs">{concepto.negocio}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-xs text-brand-brown/60">{formatPivot(concepto.ytd_actual)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-xs text-brand-brown/60">{formatPivot(concepto.ytd_anterior)}</td>
                              <td className="px-3 py-1.5 text-right"><VariacionBadge actual={concepto.ytd_actual} anterior={concepto.ytd_anterior} /></td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-xs text-brand-brown/60">{formatPivot(concepto.total_anterior)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-xs text-brand-brown/60">{formatPivot(concepto.total_n2)}</td>
                              <td className="px-3 py-1.5 text-right"><VariacionBadge actual={concepto.total_anterior} anterior={concepto.total_n2} /></td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {dialog && (
        <GastosDetalleDialog
          open
          onOpenChange={(open) => { if (!open) setDialog(null); }}
          negocioId={dialog.negocioId}
          negocioNombre={dialog.negocioNombre}
          categoriaNombre={dialog.categoriaNombre}
          periodoLabel={dialog.periodoLabel}
          fechaDesde={dialog.fechaDesde}
          fechaHasta={dialog.fechaHasta}
        />
      )}
    </>
  );
}
