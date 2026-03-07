import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCompact } from '@/utils/format';
import type { TreemapCategoriaItem } from '../hooks/useInventoryDashboard';

interface TreemapValoracionProps {
  data: TreemapCategoriaItem[];
  total: number;
}

const COLORS: Record<string, string> = {
  Fertilizante: '#73991C',
  Fungicida: '#4CAF50',
  Insecticida: '#FF9800',
  Acaricida: '#E91E63',
  Herbicida: '#9C27B0',
  Biocontrolador: '#00BCD4',
  Coadyuvante: '#607D8B',
  Herramienta: '#795548',
  Equipo: '#3F51B5',
  Otros: '#9E9E9E',
  Regulador: '#78909C',
  Fitorregulador: '#78909C',
  'Biologicos': '#BDBDBD',
};

function CustomContent(props: any) {
  const { x, y, width, height, name } = props;
  if (!width || !height || width < 20 || height < 20) return null;

  const label = name || '';
  const color = COLORS[label] || '#9E9E9E';

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        fillOpacity={0.85}
        stroke="#fff"
        strokeWidth={3}
        rx={6}
      />
      {label && width > 50 && height > 25 && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#fff"
          fontSize={width > 120 ? 14 : 11}
          fontWeight={600}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-primary/10 bg-white px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-foreground">{data.name}</p>
      <p className="text-primary font-semibold mt-1">${formatCompact(data.valor || 0)}</p>
    </div>
  );
}

export function TreemapValoracion({ data, total }: TreemapValoracionProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-primary/10 bg-white p-8 text-center">
        <p className="text-sm text-brand-brown/50">Sin datos de valoracion</p>
      </div>
    );
  }

  // Recharts Treemap needs a specific data shape
  const treemapData = data.map(d => ({ name: d.name, valor: d.valor }));

  return (
    <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-primary/10 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Valoracion por Categoria</h3>
        <span className="text-xs text-brand-brown/50">Total: ${formatCompact(total)}</span>
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={350}>
          <Treemap
            data={treemapData}
            dataKey="valor"
            aspectRatio={4 / 3}
            content={<CustomContent />}
          >
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-100">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS[d.name] || '#9E9E9E' }} />
              <span className="text-xs text-brand-brown/60">{d.name} (${formatCompact(d.valor)})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
