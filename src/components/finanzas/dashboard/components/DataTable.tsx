import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';
import type { ColumnDef } from '@/types/finanzas';

interface DataTableProps {
  data: Record<string, unknown>[];
  columns: ColumnDef[];
  maxHeight?: string;    // kept for API compat; applies at lg+
  headerColor?: 'green' | 'red' | 'default';
  emptyMessage?: string;
}

export function DataTable({ data, columns, maxHeight: _maxHeight = '24rem', headerColor = 'default', emptyMessage = 'Sin datos' }: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const strA = String(aVal);
      const strB = String(bVal);
      return sortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [data, sortKey, sortDir]);

  const formatCell = (value: unknown, format?: ColumnDef['format']) => {
    if (value == null || value === '') return '—';
    switch (format) {
      case 'currency': return formatCurrency(Number(value));
      case 'number':   return formatNumber(Number(value));
      case 'date':     return formatearFecha(String(value));
      default:         return String(value);
    }
  };

  const headerBg = headerColor === 'green'
    ? 'bg-green-600 text-white'
    : headerColor === 'red'
      ? 'bg-red-600 text-white'
      : 'bg-gray-100 text-foreground';

  // CSS grid: equal-width columns; last col right-aligned for currency/number
  const gridCols = `repeat(${columns.length}, minmax(0, 1fr))`;

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-8 text-center">
        <p className="text-sm text-brand-brown/50">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
      {/* Encabezado sticky — solo escritorio */}
      <div
        className={`hidden lg:grid items-center gap-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide sticky top-0 z-10 ${headerBg}`}
        style={{ gridTemplateColumns: gridCols }}
      >
        {columns.map((col) => (
          <button
            key={col.key}
            type="button"
            className={`flex items-center gap-1 text-left ${col.sortable !== false ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            onClick={() => col.sortable !== false && handleSort(col.key)}
          >
            {col.label}
            {col.sortable !== false && (
              sortKey === col.key
                ? sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                : <ArrowUpDown className="w-3 h-3 opacity-40" />
            )}
          </button>
        ))}
      </div>

      {/* Zona scrollable solo en escritorio */}
      <div className="divide-y divide-primary/5 lg:overflow-y-auto lg:max-h-96 lg:overscroll-contain">
        {sortedData.map((row, i) => (
          <div
            key={i}
            className={`px-3 py-2.5 lg:grid lg:gap-2 lg:items-center ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
            style={{ gridTemplateColumns: gridCols }}
          >
            {columns.map((col, ci) => {
              const formatted = formatCell(row[col.key], col.format);
              const isNumeric = col.format === 'currency' || col.format === 'number';
              return (
                <span key={col.key} className={`flex items-baseline gap-1 lg:block text-sm ${isNumeric ? 'lg:text-right tabular-nums' : ''} ${ci > 0 ? '' : ''}`}>
                  <span className="text-[11px] text-brand-brown/40 lg:hidden shrink-0">{col.label}:</span>
                  <span className={isNumeric && ci === columns.length - 1 ? 'font-medium' : ''}>{formatted}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
