import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';
import type { ColumnDef } from '@/types/finanzas';
import './dashboardTables.css';

interface DataTableProps {
  data: Record<string, unknown>[];
  columns: ColumnDef[];
  maxHeight?: string;    // kept for API compat (no longer used; tables grow naturally)
  headerColor?: 'green' | 'red' | 'default';
  emptyMessage?: string;
}

export function DataTable({ data, columns, maxHeight: _maxHeight, headerColor = 'default', emptyMessage = 'Sin datos' }: DataTableProps) {
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

  // CSS grid: equal-width columns (aplicado solo en escritorio vía media query).
  const gridCols = `repeat(${columns.length}, minmax(0, 1fr))`;

  if (data.length === 0) {
    return (
      <div className="dtbl">
        <p className="dtbl-empty">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="dtbl">
      {/* Encabezado — solo escritorio */}
      <div className={`dtbl-head dtbl-head--${headerColor}`} style={{ gridTemplateColumns: gridCols }}>
        {columns.map((col) => {
          const sortable = col.sortable !== false;
          return (
            <button
              key={col.key}
              type="button"
              className={`dtbl-th ${sortable ? '' : 'dtbl-th--static'}`}
              onClick={() => sortable && handleSort(col.key)}
            >
              {col.label}
              {sortable && (
                sortKey === col.key
                  ? sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                  : <ArrowUpDown className="w-3 h-3 opacity-40" />
              )}
            </button>
          );
        })}
      </div>

      <div>
        {sortedData.map((row, i) => (
          <div key={i} className="dtbl-row" style={{ gridTemplateColumns: gridCols }}>
            {columns.map((col) => {
              const formatted = formatCell(row[col.key], col.format);
              const isNumeric = col.format === 'currency' || col.format === 'number';
              return (
                <span key={col.key} className={`dtbl-cell ${isNumeric ? 'dtbl-cell--num' : ''}`} data-label={col.label}>
                  <span className="dtbl-val">{formatted}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
