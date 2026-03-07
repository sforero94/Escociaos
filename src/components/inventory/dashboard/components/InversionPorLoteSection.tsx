import { useState, Fragment } from 'react';
import { MapPin, ChevronDown, ChevronRight } from 'lucide-react';
import { KPIScorecard } from '@/components/finanzas/dashboard/components/KPIScorecard';
import { PeriodoFilter } from '@/components/finanzas/dashboard/components/PeriodoFilter';
import { formatCompact, formatNumber } from '@/utils/format';
import type { DashboardPeriodo } from '@/types/finanzas';
import type { InversionLote } from '../hooks/useInventoryDashboard';

interface InversionPorLoteSectionProps {
  lotes: InversionLote[];
  totales: {
    costo_total: number;
    hectareas: number;
    arboles: number;
    costo_por_ha: number;
    costo_por_arbol: number;
  };
  loading?: boolean;
  periodo: DashboardPeriodo;
  onPeriodoChange: (periodo: DashboardPeriodo, fechas?: { desde: string; hasta: string }) => void;
}

export function InversionPorLoteSection({ lotes, totales, loading, periodo, onPeriodoChange }: InversionPorLoteSectionProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (loteId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(loteId)) next.delete(loteId);
      else next.add(loteId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-6">
        <div className="animate-pulse space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          Inversion por Lote
        </h3>
        <PeriodoFilter value={periodo} onChange={onPeriodoChange} />
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPIScorecard label="Inversion Total" valor={totales.costo_total} formato="compact" size="sm" />
        <KPIScorecard label="Area Total" valor={totales.hectareas} formato="number" size="sm" />
        <KPIScorecard label="Costo / Hectarea" valor={totales.costo_por_ha} formato="compact" size="sm" />
        <KPIScorecard label="Costo / Arbol" valor={totales.costo_por_arbol} formato="compact" size="sm" />
      </div>

      {/* Tabla por lote */}
      {lotes.length === 0 ? (
        <div className="rounded-xl border border-primary/10 bg-white p-8 text-center">
          <MapPin className="w-10 h-10 text-brand-brown/30 mx-auto mb-2" />
          <p className="text-sm text-brand-brown/50">Sin movimientos asignados a lotes en este periodo</p>
        </div>
      ) : (
        <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-foreground w-8" />
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-foreground">Lote</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-foreground">Inversion</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-foreground">Hectareas</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-foreground">Arboles</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-foreground">$/ha</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-foreground">$/arbol</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((lote, i) => {
                  const isExpanded = expanded.has(lote.lote_id);
                  const hasCategorias = lote.categorias.length > 0;

                  return (
                    <Fragment key={lote.lote_id}>
                      <tr
                        className={`border-t border-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-green-50 transition-colors ${hasCategorias ? 'cursor-pointer' : ''}`}
                        onClick={() => hasCategorias && toggleExpand(lote.lote_id)}
                      >
                        <td className="px-3 py-2 text-center">
                          {hasCategorias && (
                            isExpanded
                              ? <ChevronDown className="w-4 h-4 text-brand-brown/50" />
                              : <ChevronRight className="w-4 h-4 text-brand-brown/50" />
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">{lote.lote}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">${formatCompact(lote.costo_total)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{lote.hectareas > 0 ? formatNumber(lote.hectareas, 1) : '-'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{lote.arboles > 0 ? formatNumber(Math.round(lote.arboles)) : '-'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{lote.costo_por_ha > 0 ? `$${formatCompact(Math.round(lote.costo_por_ha))}` : '-'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{lote.costo_por_arbol > 0 ? `$${formatCompact(Math.round(lote.costo_por_arbol))}` : '-'}</td>
                      </tr>
                      {isExpanded && lote.categorias.map(cat => {
                        const catHa = lote.hectareas > 0 ? cat.costo / lote.hectareas : 0;
                        const catArbol = lote.arboles > 0 ? cat.costo / lote.arboles : 0;
                        return (
                          <tr key={`${lote.lote_id}-${cat.categoria}`} className="bg-primary/[0.02] border-t border-primary/5">
                            <td />
                            <td className="px-3 py-1.5 pl-10 text-brand-brown/70 text-sm">{cat.categoria}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-sm">${formatCompact(cat.costo)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-sm text-brand-brown/50" colSpan={2}>
                              {formatNumber(cat.cantidad, 2)} {cat.unidad}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-sm">{catHa > 0 ? `$${formatCompact(Math.round(catHa))}` : '-'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-sm">{catArbol > 0 ? `$${formatCompact(Math.round(catArbol))}` : '-'}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-foreground/20 bg-gray-100 font-bold">
                  <td />
                  <td className="px-3 py-2 text-foreground">TOTAL</td>
                  <td className="px-3 py-2 text-right tabular-nums">${formatCompact(totales.costo_total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(totales.hectareas, 1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(Math.round(totales.arboles))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${formatCompact(totales.costo_por_ha)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${formatCompact(totales.costo_por_arbol)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
