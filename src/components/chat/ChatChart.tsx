import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { formatCurrency, formatCompact, formatNumber } from '@/utils/format';
import type { ChartSpec } from '@/types/chat';

const COLORS = ['#73991C', '#E74C3C', '#3498DB', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E'];

function getTickFormatter(yFormat?: ChartSpec['yFormat']) {
  switch (yFormat) {
    case 'currency':
      return (v: number) => `$${formatCompact(v)}`;
    case 'percent':
      return (v: number) => `${v}%`;
    case 'kg':
      return (v: number) => `${formatCompact(v)} kg`;
    default:
      return (v: number) => formatCompact(v);
  }
}

function getTooltipFormatter(yFormat?: ChartSpec['yFormat']) {
  switch (yFormat) {
    case 'currency':
      return (v: number) => formatCurrency(v);
    case 'percent':
      return (v: number) => `${formatNumber(v, 1)}%`;
    case 'kg':
      return (v: number) => `${formatNumber(v)} kg`;
    default:
      return (v: number) => formatNumber(v);
  }
}

export function ChatChart({ spec }: { spec: ChartSpec }) {
  const { type, title, data, xKey, yKey, yFormat, color, colors, stacked } = spec;
  const keys = Array.isArray(yKey) ? yKey : [yKey];
  const palette = colors ?? (color ? [color] : COLORS);
  const tickFmt = getTickFormatter(yFormat);
  const tooltipFmt = getTooltipFormatter(yFormat);

  const commonAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
      <YAxis tickFormatter={tickFmt} tick={{ fontSize: 12 }} />
      <Tooltip formatter={tooltipFmt} />
      <Legend />
    </>
  );

  function renderChart() {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={data}>
            {commonAxes}
            {keys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                fill={palette[i % palette.length]}
                stackId={stacked ? 'stack' : undefined}
              />
            ))}
          </BarChart>
        );

      case 'line':
        return (
          <LineChart data={data}>
            {commonAxes}
            {keys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={palette[i % palette.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart data={data}>
            {commonAxes}
            {keys.map((k, i) => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                fill={palette[i % palette.length]}
                stroke={palette[i % palette.length]}
                fillOpacity={0.3}
                stackId={stacked ? 'stack' : undefined}
              />
            ))}
          </AreaChart>
        );

      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey={keys[0]}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {data.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip formatter={tooltipFmt} />
            <Legend />
          </PieChart>
        );

      default:
        return null;
    }
  }

  return (
    <div className="my-3 rounded-lg border bg-card p-3">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <ResponsiveContainer width="100%" height={280}>
        {renderChart()!}
      </ResponsiveContainer>
    </div>
  );
}
