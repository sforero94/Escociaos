import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { formatCompact, formatCurrency } from '@/utils/format';
import type { DatoTrimestral } from '@/types/finanzas';

interface IngresosTrimestreChartProps {
  data: DatoTrimestral[];
  title?: string;
}

export function IngresosTrimestreChart({ data, title = 'Ingresos por Trimestre' }: IngresosTrimestreChartProps) {
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
          <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ borderRadius: '8px', border: '1px solid rgba(115,153,28,0.2)' }}
          />
          <Bar dataKey="valor" fill="#73991C" radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="valor"
              position="top"
              formatter={(v: number) => formatCompact(v)}
              style={{ fontSize: 10, fill: '#73991C' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
