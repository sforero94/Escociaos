import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';
import type { IngresoDetalleRow } from '@/types/finanzas';

interface CosechaTableProps {
  rows: IngresoDetalleRow[];
  emptyMessage?: string;
}

interface GrupoCosecha {
  cosecha: string;
  rows: IngresoDetalleRow[];
  kilos: number;
  valorTotal: number;
  valorConKilos: number;
  maxFecha: string;
}

const SIN_COSECHA = 'Sin cosecha';

/**
 * Tabla de ingresos de aguacate agrupada por cosecha.
 * Cada cosecha es una fila colapsada (toneladas, precio promedio $/kg,
 * ingreso total) que se expande al detalle de registros individuales.
 * `cantidad` se asume en kilos.
 */
export function CosechaTable({ rows, emptyMessage = 'Sin ingresos registrados' }: CosechaTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const grupos = useMemo<GrupoCosecha[]>(() => {
    const map = new Map<string, GrupoCosecha>();
    rows.forEach((r) => {
      const key = r.cosecha || SIN_COSECHA;
      if (!map.has(key)) {
        map.set(key, { cosecha: key, rows: [], kilos: 0, valorTotal: 0, valorConKilos: 0, maxFecha: '' });
      }
      const g = map.get(key)!;
      g.rows.push(r);
      g.valorTotal += r.valor || 0;
      if (r.cantidad != null && r.cantidad > 0) {
        g.kilos += r.cantidad;
        g.valorConKilos += r.valor || 0;
      }
      if (r.fecha > g.maxFecha) g.maxFecha = r.fecha;
    });
    return Array.from(map.values()).sort((a, b) => b.maxFecha.localeCompare(a.maxFecha));
  }, [rows]);

  const toggle = (cosecha: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cosecha)) next.delete(cosecha);
      else next.add(cosecha);
      return next;
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-8 text-center">
        <p className="text-sm text-brand-brown/50">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
      <div className="lg:overflow-y-scroll lg:overscroll-contain lg:touch-pan-y lg:max-h-[28rem]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-green-600 text-white">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Cosecha</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Toneladas</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Precio Prom. $/kg</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Ingreso Total</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => {
              const isOpen = expanded.has(g.cosecha);
              const precioPromedio = g.kilos > 0 ? g.valorConKilos / g.kilos : 0;
              return (
                <GrupoRows
                  key={g.cosecha}
                  grupo={g}
                  isOpen={isOpen}
                  precioPromedio={precioPromedio}
                  onToggle={() => toggle(g.cosecha)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GrupoRows({ grupo, isOpen, precioPromedio, onToggle }: {
  grupo: GrupoCosecha;
  isOpen: boolean;
  precioPromedio: number;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-t border-primary/5 bg-green-50/60 hover:bg-green-50 cursor-pointer select-none font-medium"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {isOpen ? <ChevronDown className="w-4 h-4 text-green-700" /> : <ChevronRight className="w-4 h-4 text-green-700" />}
            {grupo.cosecha}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(grupo.kilos / 1000, 1)} ton</td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">{precioPromedio > 0 ? `$${formatNumber(precioPromedio)}` : '-'}</td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatCurrency(grupo.valorTotal)}</td>
      </tr>
      {isOpen && (
        <tr className="border-t border-primary/5">
          <td colSpan={4} className="px-0 py-0 bg-gray-50/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-brand-brown/60 uppercase tracking-wide">
                  <td className="px-3 py-1.5 pl-9">Fecha</td>
                  <td className="px-3 py-1.5">Comprador</td>
                  <td className="px-3 py-1.5 text-right">Cantidad</td>
                  <td className="px-3 py-1.5 text-right">Precio $/kg</td>
                  <td className="px-3 py-1.5 text-right">Valor</td>
                </tr>
              </thead>
              <tbody>
                {grupo.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-3 py-2 pl-9 whitespace-nowrap">{formatearFecha(r.fecha)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.comprador || '-'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{r.cantidad != null ? `${formatNumber(r.cantidad / 1000, 1)} ton` : '-'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{r.precio_unitario != null ? `$${formatNumber(r.precio_unitario)}` : '-'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(r.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
