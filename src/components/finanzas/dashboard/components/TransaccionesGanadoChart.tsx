import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatNumber } from '@/utils/format';

interface TransaccionesGanadoChartProps {
  data: { trimestre: string; compra: number; venta: number }[];
  title?: string;
}

export function TransaccionesGanadoChart({ data, title = 'Transacciones por Trimestre (cabezas)' }: TransaccionesGanadoChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-6 text-center">
        <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
        <p className="text-sm text-brand-brown/50">Sin datos</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4">
      <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <XAxis dataKey="trimestre" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number, name: string) => [formatNumber(value), name === 'compra' ? 'Compras' : 'Ventas']}
            contentStyle={{ borderRadius: '8px', border: '1px solid rgba(115,153,28,0.2)' }}
          />
          <Legend formatter={(v) => v === 'compra' ? 'Compras' : 'Ventas'} />
          <Bar dataKey="compra" fill="#FF9800" radius={[4, 4, 0, 0]} />
          <Bar dataKey="venta" fill="#73991C" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
