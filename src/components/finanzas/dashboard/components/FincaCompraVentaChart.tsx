import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ArrowLeftRight } from 'lucide-react';
import { formatCompact, formatCurrency, formatNumber } from '@/utils/format';
import type { GanadoChartMode } from '@/types/finanzas';

interface FincaDatum {
  finca: string;
  compra_dinero: number;
  venta_dinero: number;
  compra_kilos: number;
  venta_kilos: number;
}

interface FincaCompraVentaChartProps {
  data: FincaDatum[];
  title?: string;
}

export function FincaCompraVentaChart({ data, title = 'Compra vs Venta por Finca' }: FincaCompraVentaChartProps) {
  const [mode, setMode] = useState<GanadoChartMode>('dinero');

  const totalVentas = data.reduce((s, d) => s + d.venta_dinero, 0);
  const totalKilosVendidos = data.reduce((s, d) => s + d.venta_kilos, 0);
  const totalCompras = data.reduce((s, d) => s + d.compra_dinero, 0);
  const totalKilosComprados = data.reduce((s, d) => s + d.compra_kilos, 0);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-6 text-center">
        <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
        <p className="text-sm text-brand-brown/50">Sin datos</p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    finca: d.finca || 'Sin finca',
    compra: mode === 'dinero' ? d.compra_dinero : d.compra_kilos,
    venta: mode === 'dinero' ? d.venta_dinero : d.venta_kilos,
  }));

  const formatFn = mode === 'dinero'
    ? (v: number) => formatCompact(v)
    : (v: number) => formatNumber(v);

  const tooltipFn = mode === 'dinero'
    ? (v: number) => formatCurrency(v)
    : (v: number) => `${formatNumber(v)} kg`;

  const chartHeight = Math.max(250, data.length * 70);

  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <button
          onClick={() => setMode((prev) => (prev === 'dinero' ? 'kilos' : 'dinero'))}
          className="flex items-center gap-1.5 rounded-lg border border-primary/20 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-primary/5 transition-colors"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          {mode === 'dinero' ? 'Ver kilos' : 'Ver dinero'}
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 mb-2">
        <div className="rounded-lg bg-green-50 p-3 text-center">
          <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-0.5">Ventas Totales</p>
          <p className="text-2xl font-bold text-green-800">${formatCompact(totalVentas)}</p>
        </div>
        <div className="rounded-lg bg-green-50 p-3 text-center">
          <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-0.5">Kilos Vendidos</p>
          <p className="text-2xl font-bold text-green-800">{formatNumber(totalKilosVendidos)} kg</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="rounded-lg bg-orange-50 p-3 text-center">
          <p className="text-xs font-medium text-orange-700 uppercase tracking-wide mb-0.5">Compras Totales</p>
          <p className="text-2xl font-bold text-orange-800">${formatCompact(totalCompras)}</p>
        </div>
        <div className="rounded-lg bg-orange-50 p-3 text-center">
          <p className="text-xs font-medium text-orange-700 uppercase tracking-wide mb-0.5">Kilos Comprados</p>
          <p className="text-2xl font-bold text-orange-800">{formatNumber(totalKilosComprados)} kg</p>
        </div>
      </div>

      <div className="flex justify-center">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
            <XAxis type="number" tickFormatter={formatFn} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="finca" tick={{ fontSize: 11 }} width={80} />
            <Tooltip
              formatter={(value: number, name: string) => [tooltipFn(value), name === 'compra' ? 'Compras' : 'Ventas']}
              contentStyle={{ borderRadius: '8px', border: '1px solid rgba(115,153,28,0.2)' }}
            />
            <Legend formatter={(v) => v === 'compra' ? 'Compras' : 'Ventas'} />
            <Bar dataKey="compra" fill="#FF9800" radius={[0, 4, 4, 0]} />
            <Bar dataKey="venta" fill="#73991C" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
