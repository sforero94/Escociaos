import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { formatearMoneda } from '../../../utils/calculosReporteAplicacion';

interface ComparisonField {
  real: number;
  planeado: number;
  desviacion: number;
}

interface FinancieroField {
  real: number;
  planeado: number;
  desviacion: number;
  cambio: number;
}

interface EconomicSectionProps {
  financiero: {
    costo_productos: FinancieroField;
    costo_jornales: FinancieroField;
    costo_total: FinancieroField;
    costo_por_arbol: FinancieroField;
  };
  detalle_productos_por_lote: Record<string, Array<{ producto_nombre: string; cantidad: ComparisonField; costo: ComparisonField }>>;
  jornalesPorLote: Array<{ lote_id: string; lote_nombre: string; jornales_total: ComparisonField }>;
  valorJornal: number;
}

function deviationColor(desviacion: number, invertCost = true): string {
  const abs = Math.abs(desviacion);
  const isOver = desviacion > 0;
  if (abs <= 5) return 'text-green-600';
  if (abs <= 20) return 'text-amber-600';
  return invertCost && isOver ? 'text-red-600' : invertCost && !isOver ? 'text-green-600' : 'text-red-600';
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

interface CostCell {
  real: number;
  planeado: number;
  desviacion: number;
}

function CostComparisonCell({ field }: { field: CostCell }) {
  return (
    <td className="py-2.5 px-3 text-right text-sm">
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-foreground font-medium">{formatearMoneda(field.real)}</span>
        {field.planeado > 0 && (
          <span className="text-gray-400 text-xs">Plan: {formatearMoneda(field.planeado)}</span>
        )}
        {field.planeado > 0 && (
          <span className={`text-xs font-medium ${deviationColor(field.desviacion)}`}>
            {field.desviacion > 0 ? '+' : ''}{field.desviacion.toFixed(1)}%
          </span>
        )}
      </div>
    </td>
  );
}

export function EconomicSection({
  financiero,
  detalle_productos_por_lote,
  jornalesPorLote,
  valorJornal,
}: EconomicSectionProps) {
  // Build per-lot economic rows
  const lotRows = jornalesPorLote.map((jl) => {
    const prods = detalle_productos_por_lote[jl.lote_id] || [];
    const costoInsumosReal = prods.reduce((s, p) => s + p.costo.real, 0);
    const costoInsumosPlan = prods.reduce((s, p) => s + p.costo.planeado, 0);
    const costoInsumosDesv = costoInsumosPlan > 0 ? ((costoInsumosReal - costoInsumosPlan) / costoInsumosPlan) * 100 : 0;

    const costoMOReal = jl.jornales_total.real * valorJornal;
    const costoMOPlan = jl.jornales_total.planeado * valorJornal;
    const costoMODesv = costoMOPlan > 0 ? ((costoMOReal - costoMOPlan) / costoMOPlan) * 100 : 0;

    const totalReal = costoInsumosReal + costoMOReal;
    const totalPlan = costoInsumosPlan + costoMOPlan;
    const totalDesv = totalPlan > 0 ? ((totalReal - totalPlan) / totalPlan) * 100 : 0;

    return {
      lote_id: jl.lote_id,
      lote_nombre: jl.lote_nombre,
      insumos: { real: costoInsumosReal, planeado: costoInsumosPlan, desviacion: costoInsumosDesv },
      mano_obra: { real: costoMOReal, planeado: costoMOPlan, desviacion: costoMODesv },
      total: { real: totalReal, planeado: totalPlan, desviacion: totalDesv },
    };
  });

  // Chart data: stacked horizontal bar (Insumos + M.O.)
  const chartData = lotRows.map((r) => ({
    lote: r.lote_nombre,
    insumos: r.insumos.real,
    mano_obra: r.mano_obra.real,
  }));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-foreground">Detalle Economico por Lote</h3>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-2.5 px-4 text-xs text-gray-500 font-medium sticky left-0 bg-gray-50 z-10">Lote</th>
              <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">Costo Insumos</th>
              <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">Costo M.O.</th>
              <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lotRows.map((row) => (
              <tr key={row.lote_id} className="hover:bg-gray-50 transition-colors">
                <td className="py-2.5 px-4 text-sm text-foreground font-medium sticky left-0 bg-white z-10">{row.lote_nombre}</td>
                <CostComparisonCell field={row.insumos} />
                <CostComparisonCell field={row.mano_obra} />
                <CostComparisonCell field={row.total} />
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td className="py-2.5 px-4 text-sm font-semibold text-foreground sticky left-0 bg-gray-50 z-10">Total</td>
              <CostComparisonCell field={{
                real: financiero.costo_productos.real,
                planeado: financiero.costo_productos.planeado,
                desviacion: financiero.costo_productos.desviacion,
              }} />
              <CostComparisonCell field={{
                real: financiero.costo_jornales.real,
                planeado: financiero.costo_jornales.planeado,
                desviacion: financiero.costo_jornales.desviacion,
              }} />
              <CostComparisonCell field={{
                real: financiero.costo_total.real,
                planeado: financiero.costo_total.planeado,
                desviacion: financiero.costo_total.desviacion,
              }} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Stacked horizontal bar chart */}
      {chartData.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-100">
          <div style={{ height: 224 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tickFormatter={(v) => formatCompact(v)} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis type="category" dataKey="lote" tick={{ fill: '#6B7280', fontSize: 12 }} width={100} />
                <Tooltip formatter={(v: number) => formatearMoneda(v)} />
                <Legend />
                <Bar dataKey="insumos" stackId="cost" fill="#3B82F6" name="Insumos" />
                <Bar dataKey="mano_obra" stackId="cost" fill="#8B5CF6" name="Mano de Obra" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
