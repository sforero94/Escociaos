import { useRef } from 'react';
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
import { useAnchoContenedor } from '@/hooks/useAnchoContenedor';
import type { ChartSpec } from '@/types/chat';

const COLORS = ['#73991C', '#E74C3C', '#3498DB', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E'];

/** Por debajo de esto una gráfica de barras verticales es ilegible: se pasa a horizontal. */
const ANCHO_MINIMO_BARRAS_VERTICALES = 460;

/**
 * Llaves que el modelo usa cuando el JSON no tiene un nombre de serie real.
 * Renderizarlas tal cual producía leyendas que decían literalmente «value».
 */
const LLAVES_GENERICAS = new Set(['value', 'valor', 'total', 'y', 'count', 'cantidad', 'monto']);

function nombreSerie(llave: string, titulo: string, esUnica: boolean): string {
  if (esUnica && LLAVES_GENERICAS.has(llave.toLowerCase())) return titulo;
  const limpia = llave.replace(/_/g, ' ');
  return limpia.charAt(0).toUpperCase() + limpia.slice(1);
}

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
  const contenedorRef = useRef<HTMLDivElement>(null);
  const ancho = useAnchoContenedor(contenedorRef);

  const keys = Array.isArray(yKey) ? yKey : [yKey];
  const palette = colors ?? (color ? [color] : COLORS);
  const tickFmt = getTickFormatter(yFormat);
  const tooltipFmt = getTooltipFormatter(yFormat);
  const unaSolaSerie = keys.length === 1;
  const nombreDe = (k: string) => nombreSerie(k, title, unaSolaSerie);

  // Barras horizontales cuando no hay ancho: los nombres de categoría son texto
  // largo en español («Mano de Obra y Asistencia Técnica») y en vertical se
  // recortan a tres letras o se apilan en diagonal. `ancho === 0` es el primer
  // frame, antes de medir — se asume amplio para no parpadear.
  const barrasHorizontales =
    type === 'bar' && ancho > 0 && ancho < ANCHO_MINIMO_BARRAS_VERTICALES;

  // Una gráfica de una sola serie no necesita leyenda: el título ya la nombra.
  const leyenda = unaSolaSerie ? null : <Legend />;

  const alto = barrasHorizontales
    ? Math.max(180, Math.min(420, data.length * 34 + 60))
    : type === 'pie'
      ? 260
      : 280;

  const ejesCartesianos = barrasHorizontales ? (
    <>
      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
      <XAxis type="number" tickFormatter={tickFmt} tick={{ fontSize: 11 }} />
      <YAxis
        type="category"
        dataKey={xKey}
        tick={{ fontSize: 11 }}
        width={Math.min(140, Math.max(70, ancho * 0.34))}
        interval={0}
      />
      <Tooltip formatter={tooltipFmt} />
      {leyenda}
    </>
  ) : (
    <>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
      <YAxis tickFormatter={tickFmt} tick={{ fontSize: 12 }} />
      <Tooltip formatter={tooltipFmt} />
      {leyenda}
    </>
  );

  function renderChart() {
    switch (type) {
      case 'bar':
        return (
          // `key` fuerza el remonte al cambiar de orientación: recharts no
          // re-deriva los ejes cuando `layout` cambia sobre una instancia viva,
          // así que sin esto la gráfica se queda vertical al angostarse.
          <BarChart
            key={barrasHorizontales ? 'horizontal' : 'vertical'}
            data={data}
            layout={barrasHorizontales ? 'vertical' : 'horizontal'}
            margin={barrasHorizontales ? { left: 4, right: 12, top: 4, bottom: 4 } : undefined}
          >
            {ejesCartesianos}
            {keys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                name={nombreDe(k)}
                fill={palette[i % palette.length]}
                stackId={stacked ? 'stack' : undefined}
                radius={barrasHorizontales ? [0, 3, 3, 0] : [3, 3, 0, 0]}
              />
            ))}
          </BarChart>
        );

      case 'line':
        return (
          <LineChart data={data}>
            {ejesCartesianos}
            {keys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                name={nombreDe(k)}
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
            {ejesCartesianos}
            {keys.map((k, i) => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                name={nombreDe(k)}
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
              outerRadius={ancho > 0 && ancho < 380 ? 78 : 100}
              label={ancho === 0 || ancho >= 380}
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
    <div ref={contenedorRef} className="my-3 rounded-lg border bg-card p-3">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <ResponsiveContainer width="100%" height={alto}>
        {renderChart()!}
      </ResponsiveContainer>
    </div>
  );
}
