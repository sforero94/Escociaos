import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';
import type { IngresoDetalleRow } from '@/types/finanzas';

interface QuincenaTableProps {
  rows: IngresoDetalleRow[];
  emptyMessage?: string;
}

interface GrupoQuincena {
  key: string; // "YYYY-MM-1" | "YYYY-MM-2" — ordenable lexicograficamente
  label: string;
  rows: IngresoDetalleRow[];
  litros: number;
  valorTotal: number;
  valorConLitros: number;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function quincenaDe(fecha: string): { key: string; label: string } {
  const year = fecha.substring(0, 4);
  const monthIdx = parseInt(fecha.substring(5, 7), 10) - 1;
  const day = parseInt(fecha.substring(8, 10), 10);
  const q = day <= 15 ? 1 : 2;
  const mes = MESES[monthIdx] || '';
  return {
    key: `${fecha.substring(0, 7)}-${q}`,
    label: q === 1 ? `1-15 ${mes} ${year}` : `16-fin ${mes} ${year}`,
  };
}

/**
 * Tabla de ingresos del Hato Lechero agrupada por quincena (1-15 y 16-fin de mes).
 * Litros y precio promedio $/L se calculan solo con las filas que tienen
 * cantidad registrada (leche); el ingreso total incluye todas las filas.
 */
export function QuincenaTable({ rows, emptyMessage = 'Sin ingresos registrados' }: QuincenaTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const grupos = useMemo<GrupoQuincena[]>(() => {
    const map = new Map<string, GrupoQuincena>();
    rows.forEach((r) => {
      const { key, label } = quincenaDe(r.fecha);
      if (!map.has(key)) {
        map.set(key, { key, label, rows: [], litros: 0, valorTotal: 0, valorConLitros: 0 });
      }
      const g = map.get(key)!;
      g.rows.push(r);
      g.valorTotal += r.valor || 0;
      if (r.cantidad != null && r.cantidad > 0) {
        g.litros += r.cantidad;
        g.valorConLitros += r.valor || 0;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [rows]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
      <div className="overflow-auto" style={{ maxHeight: '28rem' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-green-600 text-white">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Quincena</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Litros</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Precio Prom. $/L</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Ingreso Total</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => {
              const isOpen = expanded.has(g.key);
              const precioPromedio = g.litros > 0 ? g.valorConLitros / g.litros : 0;
              return (
                <GrupoQuincenaRows
                  key={g.key}
                  grupo={g}
                  isOpen={isOpen}
                  precioPromedio={precioPromedio}
                  onToggle={() => toggle(g.key)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GrupoQuincenaRows({ grupo, isOpen, precioPromedio, onToggle }: {
  grupo: GrupoQuincena;
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
            {grupo.label}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">{grupo.litros > 0 ? `${formatNumber(grupo.litros)} L` : '-'}</td>
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
                  <td className="px-3 py-1.5">Tipo ingreso</td>
                  <td className="px-3 py-1.5 text-right">Litros</td>
                  <td className="px-3 py-1.5 text-right">Precio $/L</td>
                  <td className="px-3 py-1.5 text-right">Valor</td>
                </tr>
              </thead>
              <tbody>
                {grupo.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-3 py-2 pl-9 whitespace-nowrap">{formatearFecha(r.fecha)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.tipo_ingreso || '-'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{r.cantidad != null ? `${formatNumber(r.cantidad)} L` : '-'}</td>
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
