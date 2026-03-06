import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCompact, formatCurrency } from '@/utils/format';
import type { DatoTrimestral } from '@/types/finanzas';

interface GastosTrimestreLineProps {
  data: DatoTrimestral[];
  title?: string;
}

export function GastosTrimestreLine({ data, title = 'Gastos por Trimestre' }: GastosTrimestreLineProps) {
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
        <LineChart data={data}>
          <XAxis dataKey="trimestre" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ borderRadius: '8px', border: '1px solid rgba(115,153,28,0.2)' }}
          />
          <Line
            type="monotone"
            dataKey="valor"
            stroke="#F44336"
            strokeWidth={2}
            dot={{ r: 4, fill: '#F44336' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
