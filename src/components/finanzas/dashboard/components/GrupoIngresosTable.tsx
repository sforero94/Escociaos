import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';
import type { GrupoIngresos } from '@/utils/agrupacionIngresos';
import type { IngresoDetalleRow } from '@/types/finanzas';
import './dashboardTables.css';

export interface GrupoIngresosTableConfig {
  cantidadHeader: string;
  formatCantidad: (n: number) => string;
  precioHeader: string;
  detalleCol2Header: string;
  detalleCol2Value: (r: IngresoDetalleRow) => string;
  detalleCantidadFormat: (n: number) => string;
}

interface GrupoIngresosTableProps {
  grupos: GrupoIngresos[];
  config: GrupoIngresosTableConfig;
  emptyMessage?: string;
}

export function GrupoIngresosTable({ grupos, config, emptyMessage = 'Sin ingresos registrados' }: GrupoIngresosTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (grupos.length === 0) {
    return (
      <div className="dtab">
        <p className="dtab-empty">{emptyMessage}</p>
      </div>
    );
  }

  const precioCortoHeader = config.precioHeader.replace('Prom. ', '');

  return (
    <div className="dtab">
      {/* Encabezado — solo escritorio */}
      <div className="dtab-head dtab-head--green">
        <span>Cosecha / Período</span>
        <span className="r">{config.cantidadHeader}</span>
        <span className="r">{config.precioHeader}</span>
        <span className="r">Ingreso Total</span>
      </div>

      <div>
        {grupos.map((g) => {
          const isOpen = expanded.has(g.key);
          return (
            <div key={g.key} className="dtab-group">
              {/* Fila resumen / toggle */}
              <button type="button" onClick={() => toggle(g.key)} className="dtab-summary">
                <span className="dtab-summary-label">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span>{g.label}</span>
                </span>
                <span className="dtab-cell" data-label={config.cantidadHeader}>
                  {g.cantidad > 0 ? config.formatCantidad(g.cantidad) : '—'}
                </span>
                <span className="dtab-cell" data-label={config.precioHeader}>
                  {g.precioPromedio > 0 ? `$${formatNumber(g.precioPromedio)}` : '—'}
                </span>
                <span className="dtab-cell dtab-cell--total" data-label="Ingreso Total">
                  {formatCurrency(g.valorTotal)}
                </span>
              </button>

              {/* Detalle expandido */}
              {isOpen && (
                <div className="dtab-detail">
                  <div className="dtab-detail-head">
                    <span>Fecha</span>
                    <span>{config.detalleCol2Header}</span>
                    <span className="r">{config.cantidadHeader}</span>
                    <span className="r">{precioCortoHeader}</span>
                    <span className="r">Valor</span>
                  </div>

                  {g.rows.map((r, i) => (
                    <DetalleRow key={i} row={r} config={config} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetalleRow({ row: r, config }: { row: IngresoDetalleRow; config: GrupoIngresosTableConfig }) {
  return (
    <div className="dtab-detail-row">
      <span className="dtab-detail-fecha">{formatearFecha(r.fecha)}</span>
      <span className="dtab-detail-col2">{config.detalleCol2Value(r) || '—'}</span>
      <span className="dtab-detail-meta">
        <span className="dtab-dcell" data-label={config.cantidadHeader}>
          {r.cantidad != null && r.cantidad > 0 ? config.detalleCantidadFormat(r.cantidad) : '—'}
        </span>
        <span className="dtab-dcell" data-label="Precio">
          {r.precio_unitario != null ? `$${formatNumber(r.precio_unitario)}` : '—'}
        </span>
        <span className="dtab-dcell dtab-dcell--valor" data-label="Valor">
          {formatCurrency(r.valor)}
        </span>
      </span>
    </div>
  );
}
