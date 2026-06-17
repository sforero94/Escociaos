import { formatCompact } from '@/utils/format';
import type { PivotRow } from '@/types/finanzas';
import './dashboardTables.css';

const formatPivot = (v: number) => `$${formatCompact(v)}`;

function VariacionBadge({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior === 0 && actual === 0) return null;
  const pct = anterior === 0 ? 100 : ((actual - anterior) / anterior) * 100;
  if (pct === 0) return null;
  const isUp = pct > 0;

  return (
    <span className={`pivot-var ${isUp ? 'pivot-var--up' : 'pivot-var--down'}`}>
      {isUp ? '+' : ''}{pct.toFixed(0)}%
    </span>
  );
}

interface PivotTableGastosProps {
  data: PivotRow[];
  loading?: boolean;
}

export function PivotTableGastos({ data, loading }: PivotTableGastosProps) {
  const currentYear = new Date().getFullYear();

  const grandTotal: PivotRow = {
    negocio: 'TOTAL',
    negocio_id: '',
    ytd_actual: data.reduce((s, r) => s + r.ytd_actual, 0),
    ytd_anterior: data.reduce((s, r) => s + r.ytd_anterior, 0),
    total_anterior: data.reduce((s, r) => s + r.total_anterior, 0),
    total_n2: data.reduce((s, r) => s + r.total_n2, 0),
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

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-8 text-center">
        <p className="text-sm text-brand-brown/50">Sin datos de gastos</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-primary/10">
        <h3 className="text-sm font-semibold text-foreground">Gastos Acumulados por Negocio</h3>
      </div>
      <div className="pivot-scroll">
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
              <th className="px-3 py-1.5 text-left text-[10px] font-medium text-brand-brown/50">Negocio</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">{currentYear}</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">{currentYear - 1}</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">Var YoY</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">{currentYear - 1}</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">{currentYear - 2}</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-medium text-brand-brown/50">Var YoY</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.negocio_id} className={`border-t border-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                <td className="px-3 py-2 font-medium text-foreground">{row.negocio}</td>
                <td className="px-3 py-2 text-right tabular-nums" data-label={`YTD ${currentYear}`}>{formatPivot(row.ytd_actual)}</td>
                <td className="px-3 py-2 text-right tabular-nums" data-label={`YTD ${currentYear - 1}`}>{formatPivot(row.ytd_anterior)}</td>
                <td className="px-3 py-2 text-right" data-label="Var YoY (YTD)"><VariacionBadge actual={row.ytd_actual} anterior={row.ytd_anterior} /></td>
                <td className="px-3 py-2 text-right tabular-nums" data-label={`Total ${currentYear - 1}`}>{formatPivot(row.total_anterior)}</td>
                <td className="px-3 py-2 text-right tabular-nums" data-label={`Total ${currentYear - 2}`}>{formatPivot(row.total_n2)}</td>
                <td className="px-3 py-2 text-right" data-label="Var YoY (Total)"><VariacionBadge actual={row.total_anterior} anterior={row.total_n2} /></td>
              </tr>
            ))}
            <tr className="pivot-total border-t-2 border-foreground/20 bg-gray-100 font-bold">
              <td className="px-3 py-2 text-foreground">{grandTotal.negocio}</td>
              <td className="px-3 py-2 text-right tabular-nums" data-label={`YTD ${currentYear}`}>{formatPivot(grandTotal.ytd_actual)}</td>
              <td className="px-3 py-2 text-right tabular-nums" data-label={`YTD ${currentYear - 1}`}>{formatPivot(grandTotal.ytd_anterior)}</td>
              <td className="px-3 py-2 text-right" data-label="Var YoY (YTD)"><VariacionBadge actual={grandTotal.ytd_actual} anterior={grandTotal.ytd_anterior} /></td>
              <td className="px-3 py-2 text-right tabular-nums" data-label={`Total ${currentYear - 1}`}>{formatPivot(grandTotal.total_anterior)}</td>
              <td className="px-3 py-2 text-right tabular-nums" data-label={`Total ${currentYear - 2}`}>{formatPivot(grandTotal.total_n2)}</td>
              <td className="px-3 py-2 text-right" data-label="Var YoY (Total)"><VariacionBadge actual={grandTotal.total_anterior} anterior={grandTotal.total_n2} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
