import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '@/utils/format';

interface DonutDatum {
  name: string;
  value: number;
  porcentaje: number;
}

interface DonutTipoVentaProps {
  data: DonutDatum[];
  title: string;
}

const COLORS = ['#73991C', '#4CAF50', '#FF9800', '#2196F3', '#9C27B0', '#F44336', '#00BCD4', '#795548'];

export function DonutTipoVenta({ data, title }: DonutTipoVentaProps) {
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
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ borderRadius: '8px', border: '1px solid rgba(115,153,28,0.2)' }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value: string, entry) => {
              const item = data.find((d) => d.name === value);
              return `${value} (${item?.porcentaje.toFixed(1)}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
