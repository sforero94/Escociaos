import { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarChart3, PackageX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { formatearNumero } from '@/utils/format';
import { cn } from '@/components/ui/utils';

interface ComparisonField {
  real: number;
  planeado: number;
  // D2: `undefined` = sin base de comparación (planeado 0/ausente) — nunca un +100% fabricado.
  desviacion: number | undefined;
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

/** Umbral para tratar una serie como "en cero" — tolera el ruido de punto flotante que llega
 * agregado desde Supabase (mismo problema de familia que D1: aritmética sin redondear antes de
 * comparar). No es 0 estricto a propósito. */
const EPSILON_SERIE_CERO = 0.05;

function deviationColor(desviacion: number): string {
  const abs = Math.abs(desviacion);
  if (abs <= 5) return 'text-success';
  if (abs <= 20) return 'text-warning';
  return 'text-destructive';
}

/** Celda "valor real / Plan: X / ±X%" apilada — 3 usos en el módulo, no amerita un
 * sub-componente compartido (decisión del spec, §8). */
function ComparisonCell({ field, decimals = 1 }: { field: ComparisonField; decimals?: number }) {
  const tieneDesviacion = field.planeado > 0 && field.desviacion !== undefined;
  return (
    <TableCell className="text-right tabular-nums">
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-medium text-foreground">{formatearNumero(field.real, decimals)}</span>
        {field.planeado > 0 && (
          <span className="text-xs text-muted-foreground">Plan: {formatearNumero(field.planeado, decimals)}</span>
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

/** Serie de un gráfico Real/Plan/Anterior por lote — omitida entera (barra + leyenda) cuando
 * ningún lote tiene valor. Cierra D2/D7: antes la leyenda mostraba "Plan" sin ninguna barra
 * visible porque `aplicaciones_lotes_planificado` está vacía y `planeado` es 0 en todos lados. */
function seriesConDatos(
  datos: DatosGraficoBarrasLote[],
  patternId: string,
): Array<{ key: 'real' | 'planeado' | 'anterior'; nombre: string; fill: string; stroke: string; strokeDasharray?: string; radioFinal: boolean }> {
  const tieneValores = (key: 'real' | 'planeado' | 'anterior') =>
    datos.some((d) => Math.abs(d[key]) > EPSILON_SERIE_CERO);

  const todas = [
    { key: 'real' as const, nombre: 'Real', fill: 'var(--chart-1)', stroke: 'var(--chart-1)', radioFinal: false },
    { key: 'planeado' as const, nombre: 'Plan', fill: `url(#${patternId})`, stroke: 'var(--chart-2)', radioFinal: false },
    { key: 'anterior' as const, nombre: 'Anterior', fill: 'var(--chart-5)', stroke: 'var(--muted-foreground)', strokeDasharray: '3 3', radioFinal: true },
  ];

  return todas.filter((s) => tieneValores(s.key));
}

function GraficoBarrasLote({ datos, patternId, formatearValor }: {
  datos: DatosGraficoBarrasLote[];
  patternId: string;
  formatearValor: (v: number) => string;
}) {
  const series = seriesConDatos(datos, patternId);

  if (datos.length === 0 || series.length === 0) {
    return (
      <div className="border-t border-gray-100 px-6 py-8">
        <Empty className="p-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BarChart3 />
            </EmptyMedia>
            <EmptyTitle>Sin datos para graficar</EmptyTitle>
            <EmptyDescription>Ningún lote tiene un valor mayor a cero en esta pestaña.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 px-6 py-4">
      <div style={{ height: 224 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} layout="vertical" margin={{ top: 5, right: 24, left: 10, bottom: 5 }}>
            <defs>
              <pattern id={patternId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--chart-2)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--primary)" strokeOpacity={0.3} strokeWidth={2} />
              </pattern>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" tick={{ fill: 'var(--gray-500, #6B7280)', fontSize: 12 }} />
            <YAxis type="category" dataKey="lote" tick={{ fill: 'var(--gray-500, #6B7280)', fontSize: 12 }} width={110} />
            <Tooltip formatter={(v: number) => formatearValor(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.nombre}
                fill={s.fill}
                stroke={s.stroke}
                strokeWidth={1}
                strokeDasharray={s.strokeDasharray}
                radius={s.radioFinal ? [0, 4, 4, 0] : [0, 2, 2, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
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

  // Insumos: agregación por lote para la tabla + gráfico de esta pestaña.
  const insumosPorLote = canecasPorLote.map((loteCaneca) => {
    const prods = detalle_productos_por_lote[loteCaneca.lote_id] || [];
    const totalReal = prods.reduce((s, p) => s + p.cantidad.real, 0);
    const totalPlan = prods.reduce((s, p) => s + p.cantidad.planeado, 0);
    const desviacion = totalPlan > 0 ? ((totalReal - totalPlan) / totalPlan) * 100 : undefined;
    return {
      lote_id: loteCaneca.lote_id,
      lote_nombre: loteCaneca.lote_nombre,
      insumos: { real: totalReal, planeado: totalPlan, desviacion } as ComparisonField,
    };
  });
  const insumosTotalReal = insumosPorLote.reduce((s, l) => s + l.insumos.real, 0);
  const insumosTotalPlan = insumosPorLote.reduce((s, l) => s + l.insumos.planeado, 0);
  const insumosTotalDesv = insumosTotalPlan > 0 ? ((insumosTotalReal - insumosTotalPlan) / insumosTotalPlan) * 100 : undefined;

  // "Sin mapeo mezcla→lote" — condición estructural (CLAUDE.md, Applications Data Architecture:
  // 4 de 20 aplicaciones cerradas no tienen ese mapeo), no una lectura real de 0. Se detecta por
  // AUSENCIA de filas de producto, no por que la suma dé 0 — una suma en 0 con filas presentes
  // sí sería un "0" real y se muestra como tal.
  const sinMapeoInsumos = Object.values(detalle_productos_por_lote).every((filas) => (filas?.length ?? 0) === 0);

  const graficoInsumos: DatosGraficoBarrasLote[] = insumosPorLote.map((l) => ({
    lote: l.lote_nombre,
    planeado: l.insumos.planeado,
    real: l.insumos.real,
    anterior: 0,
  }));

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-foreground">
            Detalle Técnico por Lote
          </h3>
          <TabsList>
            <TabsTrigger value="canecas" className="text-sm">{containerLabel}</TabsTrigger>
            <TabsTrigger value="insumos" className="text-sm">Insumos</TabsTrigger>
            <TabsTrigger value="jornales" className="text-sm">Jornales</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="canecas" className="mt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">{containerLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {canecasPorLote.map((lote) => (
                <TableRow key={lote.lote_id}>
                  <TableCell className="font-medium text-foreground">{lote.lote_nombre}</TableCell>
                  <ComparisonCell field={lote.canecas} />
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <ComparisonCell field={canecasTotales.canecas} />
              </TableRow>
            </TableFooter>
          </Table>
          <GraficoBarrasLote datos={graficoCanecas} patternId="tecnico-plan-hatch-canecas" formatearValor={(v) => formatearNumero(v, 1)} />
        </TabsContent>

        <TabsContent value="insumos" className="mt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Insumos (kg)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {insumosPorLote.map((lote) => (
                <TableRow key={lote.lote_id}>
                  <TableCell className="font-medium text-foreground">{lote.lote_nombre}</TableCell>
                  {sinMapeoInsumos ? (
                    <TableCell className="text-right font-normal text-muted-foreground">—</TableCell>
                  ) : (
                    <ComparisonCell field={lote.insumos} />
                  )}
                </TableRow>
              ))}
            </TableBody>
            {!sinMapeoInsumos && (
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <ComparisonCell field={{ real: insumosTotalReal, planeado: insumosTotalPlan, desviacion: insumosTotalDesv }} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
          {sinMapeoInsumos ? (
            <div className="border-t border-gray-100 px-6 py-8">
              <Empty className="p-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PackageX />
                  </EmptyMedia>
                  <EmptyTitle>Sin datos de insumos por lote</EmptyTitle>
                  <EmptyDescription>
                    Esta aplicación no tiene mapeo mezcla→lote en <code>aplicaciones_calculos.mezcla_id</code>
                    {' '}(ausente en 4 de 20 aplicaciones cerradas). No es una barra que no cargó — es una
                    lectura real de "sin dato", y se muestra como tal.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <GraficoBarrasLote datos={graficoInsumos} patternId="tecnico-plan-hatch-insumos" formatearValor={(v) => formatearNumero(v, 1)} />
          )}
        </TabsContent>

        <TabsContent value="jornales" className="mt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Jornales</TableHead>
                <TableHead className="text-right">Arb/Jornal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jornalesPorLote.map((lote) => (
                <TableRow key={lote.lote_id}>
                  <TableCell className="font-medium text-foreground">{lote.lote_nombre}</TableCell>
                  <ComparisonCell field={lote.jornales_total} />
                  <ComparisonCell field={lote.arboles_por_jornal} decimals={0} />
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <ComparisonCell field={jornalesTotales.jornales_total} />
                <ComparisonCell field={jornalesTotales.arboles_por_jornal} decimals={0} />
              </TableRow>
            </TableFooter>
          </Table>
          <GraficoBarrasLote datos={graficoJornales} patternId="tecnico-plan-hatch-jornales" formatearValor={(v) => formatearNumero(v, 1)} />
        </TabsContent>
      </Card>
    </Tabs>
  );
}
