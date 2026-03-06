import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';
import type { ColumnDef } from '@/types/finanzas';

interface DataTableProps {
  data: Record<string, unknown>[];
  columns: ColumnDef[];
  maxHeight?: string;
  headerColor?: 'green' | 'red' | 'default';
  emptyMessage?: string;
}

export function DataTable({ data, columns, maxHeight = '24rem', headerColor = 'default', emptyMessage = 'Sin datos' }: DataTableProps) {
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
    if (value == null || value === '') return '-';
    switch (format) {
      case 'currency': return formatCurrency(Number(value));
      case 'number': return formatNumber(Number(value));
      case 'date': return formatearFecha(String(value));
      default: return String(value);
    }
  };

  const headerBg = headerColor === 'green'
    ? 'bg-green-600 text-white'
    : headerColor === 'red'
      ? 'bg-red-600 text-white'
      : 'bg-gray-100 text-foreground';

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-8 text-center">
        <p className="text-sm text-brand-brown/50">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
      <div className="overflow-y-auto" style={{ maxHeight }}>
        <table className="w-full text-sm">
          <thead className={`sticky top-0 ${headerBg}`}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${
                    col.sortable !== false ? 'cursor-pointer select-none hover:opacity-80' : ''
                  }`}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && (
                      sortKey === col.key
                        ? sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        : <ArrowUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, i) => (
              <tr key={i} className={`border-t border-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                    {formatCell(row[col.key], col.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
