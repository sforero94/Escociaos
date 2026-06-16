import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';
import type { GrupoIngresos } from '@/utils/agrupacionIngresos';
import type { IngresoDetalleRow } from '@/types/finanzas';

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

// Grid classes shared between header and rows
const GRID = 'lg:grid lg:grid-cols-[1fr_9rem_9rem_10rem]';

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
      <div className="rounded-xl border border-primary/10 bg-white p-8 text-center">
        <p className="text-sm text-brand-brown/50">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
      {/* Encabezado — solo escritorio */}
      <div className={`hidden ${GRID} items-center gap-3 px-3 py-2.5 bg-green-600 text-white text-xs font-semibold uppercase tracking-wide sticky top-0 z-10`}>
        <span>Cosecha / Período</span>
        <span className="text-right">{config.cantidadHeader}</span>
        <span className="text-right">{config.precioHeader}</span>
        <span className="text-right">Ingreso Total</span>
      </div>

      {/* Zona scrollable solo en escritorio */}
      <div className="lg:overflow-y-auto lg:max-h-[28rem] lg:overscroll-contain">
        {grupos.map((g) => {
          const isOpen = expanded.has(g.key);
          return (
            <div key={g.key} className="border-t border-primary/5 first:border-t-0">
              {/* Fila resumen / toggle */}
              <button
                type="button"
                onClick={() => toggle(g.key)}
                className={`w-full text-left px-3 py-2.5 bg-green-50/60 hover:bg-green-50 transition-colors select-none ${GRID} gap-3 items-center`}
              >
                {/* Columna 1: chevron + label */}
                <span className="flex items-start gap-1.5 font-medium text-sm">
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-green-700 mt-0.5 flex-shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-green-700 mt-0.5 flex-shrink-0" />}
                  <span>{g.label}</span>
                </span>

                {/* Métricas — en móvil como fila wrap, en escritorio como celdas alineadas */}
                <span className="col-span-3 lg:contents">
                  <span className="hidden lg:block" /> {/* placeholder para que contents funcione */}
                  <MetricaResumen
                    label={config.cantidadHeader}
                    valor={g.cantidad > 0 ? config.formatCantidad(g.cantidad) : '—'}
                  />
                  <MetricaResumen
                    label={config.precioHeader}
                    valor={g.precioPromedio > 0 ? `$${formatNumber(g.precioPromedio)}` : '—'}
                  />
                  <MetricaResumen
                    label="Ingreso Total"
                    valor={formatCurrency(g.valorTotal)}
                    valorClass="text-green-700 font-semibold"
                  />
                </span>
              </button>

              {/* Detalle expandido */}
              {isOpen && (
                <div className="border-t border-primary/5 bg-gray-50/40 divide-y divide-primary/5">
                  {/* Sub-encabezado — solo escritorio */}
                  <div className={`hidden lg:grid lg:grid-cols-[2rem_1fr_1fr_7rem_7rem_8rem] gap-2 px-3 py-1.5 text-[11px] text-brand-brown/50 uppercase tracking-wide font-medium`}>
                    <span />
                    <span>Fecha</span>
                    <span>{config.detalleCol2Header}</span>
                    <span className="text-right">{config.cantidadHeader}</span>
                    <span className="text-right">{config.precioHeader.replace('Prom. ', '')}</span>
                    <span className="text-right">Valor</span>
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

function MetricaResumen({ label, valor, valorClass = 'text-sm tabular-nums' }: {
  label: string;
  valor: string;
  valorClass?: string;
}) {
  return (
    <span className="flex items-baseline gap-1 lg:justify-end lg:block">
      <span className="text-xs text-brand-brown/50 lg:hidden">{label}:</span>
      <span className={valorClass}>{valor}</span>
    </span>
  );
}

function DetalleRow({ row: r, config }: { row: IngresoDetalleRow; config: GrupoIngresosTableConfig }) {
  return (
    <div className="px-3 py-2 lg:grid lg:grid-cols-[2rem_1fr_1fr_7rem_7rem_8rem] lg:gap-2 lg:items-center">
      {/* Indent — solo escritorio */}
      <span className="hidden lg:block" />

      {/* Fecha */}
      <span className="text-sm text-brand-brown/70 lg:text-xs">{formatearFecha(r.fecha)}</span>

      {/* Col2: comprador / tipo */}
      <span className="text-sm font-medium lg:text-xs lg:font-normal lg:text-brand-brown/80">
        {config.detalleCol2Value(r) || '—'}
      </span>

      {/* Métricas: en móvil como flex-wrap con etiquetas, en escritorio celdas alineadas */}
      <span className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 lg:contents">
        <MiniMetrica
          label={config.cantidadHeader}
          valor={r.cantidad != null && r.cantidad > 0 ? config.detalleCantidadFormat(r.cantidad) : '—'}
        />
        <MiniMetrica
          label="Precio"
          valor={r.precio_unitario != null ? `$${formatNumber(r.precio_unitario)}` : '—'}
        />
        <MiniMetrica
          label="Valor"
          valor={formatCurrency(r.valor)}
          valorClass="font-semibold text-green-700"
        />
      </span>
    </div>
  );
}

function MiniMetrica({ label, valor, valorClass = 'tabular-nums' }: {
  label: string;
  valor: string;
  valorClass?: string;
}) {
  return (
    <span className="flex items-baseline gap-1 text-xs lg:justify-end lg:block">
      <span className="text-brand-brown/40 lg:hidden">{label}:</span>
      <span className={valorClass}>{valor}</span>
    </span>
  );
}
