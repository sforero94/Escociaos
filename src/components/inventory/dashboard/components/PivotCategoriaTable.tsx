import { useState, Fragment } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCompact, formatNumber } from '@/utils/format';
import type { PivotTrimestreRow } from '../hooks/useInventoryDashboard';

interface PivotCategoriaTableProps {
  data: PivotTrimestreRow[];
  labels: string[];
  loading?: boolean;
}

function VariacionBadge({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior === 0 && actual === 0) return null;
  const pct = anterior === 0 ? 100 : ((actual - anterior) / anterior) * 100;
  if (Math.abs(pct) < 1) return null;

  const isUp = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${
      isUp ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
    }`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{pct.toFixed(0)}%
    </span>
  );
}

export function PivotCategoriaTable({ data, labels, loading }: PivotCategoriaTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (cat: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
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

  if (data.length === 0 || labels.length === 0) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-8 text-center">
        <p className="text-sm text-brand-brown/50">Sin datos de movimientos</p>
      </div>
    );
  }

  // Totals per quarter
  const totals = labels.map((_, qi) =>
    data.reduce((acc, r) => ({
      cop: acc.cop + (r.trimestres[qi]?.cop || 0),
      qty: acc.qty + (r.trimestres[qi]?.qty || 0),
    }), { cop: 0, qty: 0 }),
  );

  return (
    <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-primary/10">
        <h3 className="text-sm font-semibold text-foreground">Movimientos por Categoria (Trimestral)</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground" />
              {labels.map((label, i) => (
                <th key={label} colSpan={i < labels.length - 1 ? 1 : 2} className="px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-foreground">
                  {label}
                </th>
              ))}
            </tr>
            <tr className="bg-gray-50">
              <th className="px-3 py-1.5 text-left text-[10px] font-medium text-brand-brown/50">Categoria</th>
              {labels.map((label, i) => (
                <Fragment key={label}>
                  <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">COP</th>
                  {i === labels.length - 1 && (
                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">Var</th>
                  )}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const isExpanded = expanded.has(row.categoria);
              const hasProductos = row.productos && row.productos.length > 0;
              const lastQ = row.trimestres[labels.length - 1]?.cop || 0;
              const prevQ = row.trimestres[labels.length - 2]?.cop || 0;

              return (
                <Fragment key={row.categoria}>
                  <tr
                    className={`border-t border-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-green-50 transition-colors ${hasProductos ? 'cursor-pointer' : ''}`}
                    onClick={() => hasProductos && toggleExpand(row.categoria)}
                  >
                    <td className="px-3 py-2 font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        {hasProductos && (
                          isExpanded
                            ? <ChevronDown className="w-4 h-4 text-brand-brown/50" />
                            : <ChevronRight className="w-4 h-4 text-brand-brown/50" />
                        )}
                        {row.categoria}
                      </div>
                    </td>
                    {labels.map((label, qi) => (
                      <Fragment key={label}>
                        <td className={`px-3 py-2 text-right tabular-nums ${qi === labels.length - 1 ? 'font-medium' : ''}`}>
                          ${formatCompact(row.trimestres[qi]?.cop || 0)}
                        </td>
                        {qi === labels.length - 1 && (
                          <td className="px-3 py-2 text-right">
                            <VariacionBadge actual={lastQ} anterior={prevQ} />
                          </td>
                        )}
                      </Fragment>
                    ))}
                  </tr>
                  {isExpanded && row.productos?.map(prod => {
                    const pLastQ = prod.trimestres[labels.length - 1]?.cop || 0;
                    const pPrevQ = prod.trimestres[labels.length - 2]?.cop || 0;
                    return (
                      <tr key={prod.categoria} className="bg-primary/[0.02] border-t border-primary/5 hover:bg-green-50 transition-colors">
                        <td className="px-3 py-2 pl-10 text-brand-brown/70 text-sm">{prod.categoria}</td>
                        {labels.map((label, qi) => (
                          <Fragment key={label}>
                            <td className="px-3 py-2 text-right tabular-nums text-sm">
                              ${formatCompact(prod.trimestres[qi]?.cop || 0)}
                            </td>
                            {qi === labels.length - 1 && (
                              <td className="px-3 py-2 text-right">
                                <VariacionBadge actual={pLastQ} anterior={pPrevQ} />
                              </td>
                            )}
                          </Fragment>
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
            <tr className="border-t-2 border-foreground/20 bg-gray-100 font-bold">
              <td className="px-3 py-2 text-foreground">TOTAL</td>
              {labels.map((label, qi) => (
                <Fragment key={label}>
                  <td className="px-3 py-2 text-right tabular-nums">${formatCompact(totals[qi]?.cop || 0)}</td>
                  {qi === labels.length - 1 && (
                    <td className="px-3 py-2 text-right">
                      <VariacionBadge actual={totals[labels.length - 1]?.cop || 0} anterior={totals[labels.length - 2]?.cop || 0} />
                    </td>
                  )}
                </Fragment>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
