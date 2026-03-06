import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { formatCompact, formatCurrency } from '@/utils/format';

interface GastosPorCategoriaChartProps {
  data: { name: string; value: number; [key: string]: number | string }[];
  title?: string;
  stacked?: boolean;
  negocios?: string[];
  horizontal?: boolean;
  onBarClick?: (categoriaNombre: string) => void;
}

const COLORS = ['#73991C', '#4CAF50', '#FF9800', '#2196F3', '#9C27B0', '#F44336', '#00BCD4', '#795548'];

export function GastosPorCategoriaChart({ data, title = 'Gastos por Categoria', stacked, negocios, horizontal, onBarClick }: GastosPorCategoriaChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-6 text-center">
        <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
        <p className="text-sm text-brand-brown/50">Sin datos</p>
      </div>
    );
  }

  const layout = horizontal ? 'vertical' : 'horizontal';

  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4">
      <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
      <ResponsiveContainer width="100%" height={450}>
        <BarChart data={data} layout={layout} margin={{ left: horizontal ? 80 : 0 }}>
          {horizontal ? (
            <>
              <XAxis type="number" tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11 }} />
            </>
          )}
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ borderRadius: '8px', border: '1px solid rgba(115,153,28,0.2)' }}
          />
          {stacked && negocios ? (
            <>
              <Legend />
              {negocios.map((neg, i) => (
                <Bar key={neg} dataKey={neg} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === negocios.length - 1 ? [4, 4, 0, 0] : undefined} />
              ))}
            </>
          ) : (
            <Bar
              dataKey="value"
              radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              onClick={onBarClick ? (entry: any) => onBarClick(entry.name) : undefined}
              className={onBarClick ? 'cursor-pointer' : ''}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
