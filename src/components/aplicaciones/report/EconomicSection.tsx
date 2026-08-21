import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { formatearMoneda, formatearNumero } from '@/utils/format';
import { cn } from '@/components/ui/utils';

interface ComparisonField {
  real: number;
  planeado: number;
  desviacion: number | undefined;
}

interface FinancieroField {
  real: number;
  planeado: number;
  desviacion: number | undefined;
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

const EPSILON_SERIE_CERO = 0.05;

function deviationColor(desviacion: number): string {
  const abs = Math.abs(desviacion);
  if (abs <= 5) return 'text-success';
  if (abs <= 20) return 'text-warning';
  return 'text-destructive';
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `$${formatearNumero(value / 1_000_000, 1)}M`;
  if (value >= 1_000) return `$${formatearNumero(value / 1_000, 0)}K`;
  return `$${formatearNumero(value, 0)}`;
}

function CostComparisonCell({ field }: { field: ComparisonField }) {
  const tieneDesviacion = field.planeado > 0 && field.desviacion !== undefined;
  return (
    <TableCell className="text-right tabular-nums">
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-medium text-foreground">{formatearMoneda(field.real)}</span>
        {field.planeado > 0 && (
          <span className="text-xs text-muted-foreground">Plan: {formatearMoneda(field.planeado)}</span>
        )}
        {tieneDesviacion && (
          <span className={cn('text-xs font-semibold', deviationColor(field.desviacion as number))}>
            {(field.desviacion as number) > 0 ? '+' : ''}{formatearNumero(field.desviacion as number, 1)}%
          </span>
        )}
      </div>
    </TableCell>
  );
}

export function EconomicSection({
  financiero,
  detalle_productos_por_lote,
  jornalesPorLote,
  valorJornal,
}: EconomicSectionProps) {
  // Mismo criterio que TechnicalSection: "sin mapeo" se detecta por AUSENCIA de filas de
  // producto (real Y plan), no porque la suma dé 0 — evita confundir "no se rastreó" con
  // "se aplicaron cero insumos". Costo M.O. es independiente (sale de jornales × valor_jornal,
  // una fuente distinta) y por eso NO se apaga junto con Insumos.
  const sinMapeoInsumos = Object.values(detalle_productos_por_lote).every((filas) => (filas?.length ?? 0) === 0);

  const lotRows = jornalesPorLote.map((jl) => {
    const prods = detalle_productos_por_lote[jl.lote_id] || [];
    const costoInsumosReal = prods.reduce((s, p) => s + p.costo.real, 0);
    const costoInsumosPlan = prods.reduce((s, p) => s + p.costo.planeado, 0);
    const costoInsumosDesv = costoInsumosPlan > 0 ? ((costoInsumosReal - costoInsumosPlan) / costoInsumosPlan) * 100 : undefined;

    const costoMOReal = jl.jornales_total.real * valorJornal;
    const costoMOPlan = jl.jornales_total.planeado * valorJornal;
    const costoMODesv = costoMOPlan > 0 ? ((costoMOReal - costoMOPlan) / costoMOPlan) * 100 : undefined;

    const totalReal = costoInsumosReal + costoMOReal;
    const totalPlan = costoInsumosPlan + costoMOPlan;
    const totalDesv = totalPlan > 0 ? ((totalReal - totalPlan) / totalPlan) * 100 : undefined;

    return {
      lote_id: jl.lote_id,
      lote_nombre: jl.lote_nombre,
      insumos: { real: costoInsumosReal, planeado: costoInsumosPlan, desviacion: costoInsumosDesv },
      mano_obra: { real: costoMOReal, planeado: costoMOPlan, desviacion: costoMODesv },
      total: { real: totalReal, planeado: totalPlan, desviacion: totalDesv },
    };
  });

  const chartData = lotRows.map((r) => ({ lote: r.lote_nombre, insumos: r.insumos.real, mano_obra: r.mano_obra.real }));
  const hayInsumos = chartData.some((d) => Math.abs(d.insumos) > EPSILON_SERIE_CERO);
  const hayManoObra = chartData.some((d) => Math.abs(d.mano_obra) > EPSILON_SERIE_CERO);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-lg font-semibold text-foreground">
          Detalle Económico por Lote
        </h3>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lote</TableHead>
            <TableHead className="text-right">Costo Insumos</TableHead>
            <TableHead className="text-right">Costo M.O.</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lotRows.map((row) => (
            <TableRow key={row.lote_id}>
              <TableCell className="font-medium text-foreground">{row.lote_nombre}</TableCell>
              {sinMapeoInsumos ? (
                <TableCell className="text-right font-normal text-muted-foreground">—</TableCell>
              ) : (
                <CostComparisonCell field={row.insumos} />
              )}
              <CostComparisonCell field={row.mano_obra} />
              {sinMapeoInsumos ? (
                <TableCell className="text-right font-normal text-muted-foreground">—</TableCell>
              ) : (
                <CostComparisonCell field={row.total} />
              )}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            {sinMapeoInsumos ? (
              <TableCell className="text-right font-normal text-muted-foreground">—</TableCell>
            ) : (
              <CostComparisonCell field={financiero.costo_productos} />
            )}
            <CostComparisonCell field={financiero.costo_jornales} />
            <CostComparisonCell field={financiero.costo_total} />
          </TableRow>
        </TableFooter>
      </Table>

      {sinMapeoInsumos && (
        <p className="border-t border-gray-100 px-6 py-3 text-xs text-muted-foreground">
          Costo Insumos sin dato por lote — esta aplicación no registró productos por movimiento
          (<code>movimientos_diarios_productos</code>). El Costo M.O. y el Total sí son reales.
        </p>
      )}

      {(hayInsumos || hayManoObra) ? (
        <div className="border-t border-gray-100 px-6 py-4">
          <div style={{ height: 224 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 24, left: 10, bottom: 5 }}>
                <defs>
                  <pattern id="economico-mo-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill="var(--chart-4)" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={2} />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tickFormatter={formatCompact} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis type="category" dataKey="lote" tick={{ fill: '#6B7280', fontSize: 12 }} width={110} />
                <Tooltip formatter={(v: number) => formatearMoneda(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {hayInsumos && (
                  <Bar dataKey="insumos" stackId="cost" name="Insumos" fill="var(--chart-1)" stroke="var(--chart-1)" strokeWidth={1} />
                )}
                {hayManoObra && (
                  <Bar dataKey="mano_obra" stackId="cost" name="Mano de Obra" fill="url(#economico-mo-hatch)" stroke="var(--chart-4)" strokeWidth={1} radius={[0, 4, 4, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="border-t border-gray-100 px-6 py-8">
          <Empty className="p-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BarChart3 />
              </EmptyMedia>
              <EmptyTitle>Sin datos para graficar</EmptyTitle>
              <EmptyDescription>Ningún lote tiene costo de insumos ni de mano de obra mayor a cero.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}
    </Card>
  );
}
