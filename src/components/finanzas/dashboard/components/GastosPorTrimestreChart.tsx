import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCompact, formatCurrency } from '@/utils/format';
import type { DatoTrimestralMultiSerie } from '@/types/finanzas';

interface GastosPorTrimestreChartProps {
  data: DatoTrimestralMultiSerie[];
  negocios: string[];
  title?: string;
}

const COLORS = ['#73991C', '#4CAF50', '#FF9800', '#2196F3', '#9C27B0', '#F44336', '#00BCD4', '#795548'];

export function GastosPorTrimestreChart({ data, negocios, title = 'Gastos por Trimestre' }: GastosPorTrimestreChartProps) {
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
          <Legend />
          {negocios.map((neg, i) => (
            <Line
              key={neg}
              type="monotone"
              dataKey={neg}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
