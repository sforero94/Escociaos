import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { formatearNumero } from '../../../utils/calculosReporteAplicacion';

interface ComparisonField {
  real: number;
  planeado: number;
  desviacion: number;
}

interface CanecasPorLote {
  lote_id: string;
  lote_nombre: string;
  canecas: ComparisonField;
  litros_totales: ComparisonField;
}

interface JornalesPorLote {
  lote_id: string;
  lote_nombre: string;
  jornales_total: ComparisonField;
  arboles_por_jornal: ComparisonField;
}

interface DatosGraficoBarrasLote {
  lote: string;
  planeado: number;
  real: number;
  anterior: number;
}

interface TechnicalSectionProps {
  canecasPorLote: CanecasPorLote[];
  canecasTotales: CanecasPorLote;
  jornalesPorLote: JornalesPorLote[];
  jornalesTotales: JornalesPorLote;
  graficoCanecas: DatosGraficoBarrasLote[];
  graficoJornales: DatosGraficoBarrasLote[];
  containerLabel: string;
  detalle_productos_por_lote: Record<string, Array<{ producto_nombre: string; cantidad: ComparisonField }>>;
}

type TabKey = 'canecas' | 'insumos' | 'jornales';

function deviationColor(desviacion: number): string {
  const abs = Math.abs(desviacion);
  if (abs <= 5) return 'text-green-600';
  if (abs <= 20) return 'text-amber-600';
  return 'text-red-600';
}

function ComparisonCell({ field, decimals = 1 }: { field: ComparisonField; decimals?: number }) {
  return (
    <td className="py-2.5 px-3 text-right text-sm">
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-foreground font-medium">{formatearNumero(field.real, decimals)}</span>
        {field.planeado > 0 && (
          <span className="text-gray-400 text-xs">Plan: {formatearNumero(field.planeado, decimals)}</span>
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

export function TechnicalSection({
  canecasPorLote,
  canecasTotales,
  jornalesPorLote,
  jornalesTotales,
  graficoCanecas,
  graficoJornales,
  containerLabel,
  detalle_productos_por_lote,
}: TechnicalSectionProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('canecas');

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'canecas', label: containerLabel },
    { key: 'insumos', label: 'Insumos' },
    { key: 'jornales', label: 'Jornales' },
  ];

  // Build insumos per lote aggregation for the table
  const insumosPorLote = canecasPorLote.map((loteCaneca) => {
    const prods = detalle_productos_por_lote[loteCaneca.lote_id] || [];
    const totalReal = prods.reduce((s, p) => s + p.cantidad.real, 0);
    const totalPlan = prods.reduce((s, p) => s + p.cantidad.planeado, 0);
    const desviacion = totalPlan > 0 ? ((totalReal - totalPlan) / totalPlan) * 100 : 0;
    return {
      lote_id: loteCaneca.lote_id,
      lote_nombre: loteCaneca.lote_nombre,
      insumos: { real: totalReal, planeado: totalPlan, desviacion } as ComparisonField,
    };
  });

  const insumosTotalReal = insumosPorLote.reduce((s, l) => s + l.insumos.real, 0);
  const insumosTotalPlan = insumosPorLote.reduce((s, l) => s + l.insumos.planeado, 0);
  const insumosTotalDesv = insumosTotalPlan > 0 ? ((insumosTotalReal - insumosTotalPlan) / insumosTotalPlan) * 100 : 0;

  // Build chart data for insumos tab
  const graficoInsumos: DatosGraficoBarrasLote[] = insumosPorLote.map((l) => ({
    lote: l.lote_nombre,
    planeado: l.insumos.planeado,
    real: l.insumos.real,
    anterior: 0,
  }));

  const chartData = activeTab === 'canecas' ? graficoCanecas
    : activeTab === 'insumos' ? graficoInsumos
    : graficoJornales;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-semibold text-foreground">Detalle Tecnico por Lote</h3>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-foreground font-medium shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-2.5 px-4 text-xs text-gray-500 font-medium sticky left-0 bg-gray-50 z-10">Lote</th>
              {activeTab === 'canecas' && (
                <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">{containerLabel}</th>
              )}
              {activeTab === 'insumos' && (
                <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">Insumos (kg)</th>
              )}
              {activeTab === 'jornales' && (
                <>
                  <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">Jornales</th>
                  <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">Arb/Jornal</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activeTab === 'canecas' && canecasPorLote.map((lote) => (
              <tr key={lote.lote_id} className="hover:bg-gray-50 transition-colors">
                <td className="py-2.5 px-4 text-sm text-foreground font-medium sticky left-0 bg-white z-10">{lote.lote_nombre}</td>
                <ComparisonCell field={lote.canecas} />
              </tr>
            ))}
            {activeTab === 'insumos' && insumosPorLote.map((lote) => (
              <tr key={lote.lote_id} className="hover:bg-gray-50 transition-colors">
                <td className="py-2.5 px-4 text-sm text-foreground font-medium sticky left-0 bg-white z-10">{lote.lote_nombre}</td>
                <ComparisonCell field={lote.insumos} />
              </tr>
            ))}
            {activeTab === 'jornales' && jornalesPorLote.map((lote) => (
              <tr key={lote.lote_id} className="hover:bg-gray-50 transition-colors">
                <td className="py-2.5 px-4 text-sm text-foreground font-medium sticky left-0 bg-white z-10">{lote.lote_nombre}</td>
                <ComparisonCell field={lote.jornales_total} />
                <ComparisonCell field={lote.arboles_por_jornal} decimals={0} />
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            {activeTab === 'canecas' && (
              <tr>
                <td className="py-2.5 px-4 text-sm font-semibold text-foreground sticky left-0 bg-gray-50 z-10">Total</td>
                <ComparisonCell field={canecasTotales.canecas} />
              </tr>
            )}
            {activeTab === 'insumos' && (
              <tr>
                <td className="py-2.5 px-4 text-sm font-semibold text-foreground sticky left-0 bg-gray-50 z-10">Total</td>
                <ComparisonCell field={{ real: insumosTotalReal, planeado: insumosTotalPlan, desviacion: insumosTotalDesv }} />
              </tr>
            )}
            {activeTab === 'jornales' && (
              <tr>
                <td className="py-2.5 px-4 text-sm font-semibold text-foreground sticky left-0 bg-gray-50 z-10">Total</td>
                <ComparisonCell field={jornalesTotales.jornales_total} />
                <ComparisonCell field={jornalesTotales.arboles_por_jornal} decimals={0} />
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {/* Chart */}
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
                <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis type="category" dataKey="lote" tick={{ fill: '#6B7280', fontSize: 12 }} width={100} />
                <Tooltip formatter={(v: number) => formatearNumero(v, 1)} />
                <Legend />
                <Bar dataKey="planeado" fill="#BFD97D" name="Plan" radius={[0, 2, 2, 0]} />
                <Bar dataKey="real" fill="#73991C" name="Real" radius={[0, 4, 4, 0]} />
                {chartData.some(d => d.anterior > 0) && (
                  <Bar dataKey="anterior" fill="#E5E7EB" name="Anterior" radius={[0, 2, 2, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
