import { useState } from 'react';
import { formatCompact } from '@/utils/format';
import { PresupuestoCategoriaRow } from './PresupuestoCategoriaRow';
import { PresupuestoConceptoRow } from './PresupuestoConceptoRow';
import { GastosEjecucionDialog, type GastosEjecucionTarget } from './GastosEjecucionDialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { PresupuestoData } from '@/types/finanzas';

function formatQuarterLabel(quarters: number[]): string {
  if (quarters.length === 1) return `Q${quarters[0]}`;
  if (quarters.length === 4) return 'Año';
  return quarters.map((q) => `Q${q}`).join('+');
}

interface PresupuestoTableProps {
  data: PresupuestoData;
  showPct: boolean;
  anio: number;
  quarters: number[];
  negocioId: string;
  modoPresupuesto: boolean;
  onBudgetChange: (conceptoId: string, categoriaId: string, newAmount: number) => void;
}

export function PresupuestoTable({ data, showPct, anio, quarters, negocioId, modoPresupuesto, onBudgetChange }: PresupuestoTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detalleTarget, setDetalleTarget] = useState<GastosEjecucionTarget | null>(null);

  const toggleCategory = (catId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const fmt = (v: number) => (v > 0 ? '$' + formatCompact(v) : '');
  const t = data.totals;

  return (
    <>
    {/* `table-fixed` + `text-left` reproducen exactamente el `<table>` original
        (docs/sistema-visual.md §3-ter): el `<colgroup>` fija el ancho real de
        cada columna, y `text-left` es la alineación ambiente que los `<th>`
        de agrupación (fila 1) necesitan porque no la declaran por celda. El
        recurso `Table` aporta el contenedor canónico (esquinas redondeadas,
        borde y encabezado neutros) que reemplaza el `rounded-lg` +
        `tabla-scroll` a mano. */}
    <Table className="table-fixed text-left">
        {/* Anchos de columna: el concepto (identidad de la fila) usa lo que
            necesita para leerse en móvil y vuelve a ser flexible en escritorio
            (`sm:w-auto`, igual que el `<col />` original). Las numéricas son
            fijas en ambos anchos — la matriz scrollea en horizontal por
            debajo de 640px, que es la excepción declarada en
            docs/sistema-visual.md §3-bis Patrón A para una tabla que solo
            significa algo en el cruce de fila y columna. */}
        <colgroup>
          <col className="w-[170px] sm:w-auto" />
          <col className="w-[108px]" />
          {showPct && <col className="w-[56px]" />}
          <col className="w-[108px]" />
          <col className="w-[100px]" />
          {showPct && <col className="w-[56px]" />}
          <col className="w-[76px]" />
          {showPct && <col className="w-[76px]" />}
          <col className="w-[108px]" />
          <col className="w-[72px]" />
          <col className="w-[112px]" />
        </colgroup>

        <TableHeader>
          {/* Fila 1: encabezados de grupo (colSpan). No es un encabezado de
              columna "real" — el recurso no modela dos niveles — así que se
              deja como `<th>` a mano, apenas más tenue que la fila 2 (mismo
              gris de la familia canónica, no el tono de marca que tenía
              antes el "Presupuesto"). */}
          <TableRow>
            <th className="sticky left-0 z-10 bg-gray-50/80 px-3 py-1.5"></th>
            <th colSpan={showPct ? 2 : 1} className="px-3 py-1.5 text-gray-400 text-xs font-semibold tracking-wide uppercase">
              Ejecución
            </th>
            {/* Incluye "Ejec Año" (col. condicional) — antes de este ajuste el
                colSpan se quedaba corto en 1 columna cuando showPct=true y
                "Ejec Año" quedaba sin encabezado de grupo. */}
            <th colSpan={showPct ? 5 : 3} className="px-3 py-1.5 text-primary text-xs font-semibold tracking-wide uppercase border-l border-gray-100">
              Presupuesto
            </th>
            <th colSpan={3} className="px-3 py-1.5 text-gray-400 text-xs font-semibold tracking-wide uppercase border-l border-gray-100">
              Comparativo año anterior
            </th>
          </TableRow>

          {/* Fila 2: encabezados de columna reales — usa el `TableHead`
              canónico (fondo gris tenue, texto gris uppercase) en vez del
              `text-[11px]` a mano que motivó la queja del dueño. */}
          <TableRow className="border-b border-gray-200">
            <TableHead sticky>Concepto</TableHead>
            <TableHead className="text-center">Ejecución {formatQuarterLabel(quarters)}</TableHead>
            {showPct && <TableHead className="px-2 text-center">Ejec %</TableHead>}
            <TableHead className="text-center border-l border-gray-100">Ppto {formatQuarterLabel(quarters)}</TableHead>
            <TableHead className="text-center">Ppto Año</TableHead>
            {showPct && <TableHead className="px-2 text-center">Ppto %</TableHead>}
            <TableHead className="text-center">Ejecución</TableHead>
            {showPct && <TableHead className="text-center">Ejec Año</TableHead>}
            <TableHead className="text-center border-l border-gray-100">{formatQuarterLabel(quarters)} {anio - 1}</TableHead>
            <TableHead className="px-2 text-center">Var YoY</TableHead>
            <TableHead className="text-center">Total {anio - 1}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {/* Grand total row — celda de identidad sticky con SU PROPIO fondo
              (`bg-primary`, no el `bg-white` por defecto de `TableCell`), el
              mismo mecanismo de composición que las filas de abajo: pasar el
              color de fondo real de la fila por `className` le gana al
              default vía `cn()`/tailwind-merge (verificado), así que no hizo
              falta extender el primitivo para este caso. */}
          <TableRow className="bg-primary text-white text-xs font-semibold hover:bg-primary">
            <TableCell sticky className="bg-primary py-2.5">Suma Total</TableCell>
            <TableCell className="py-2.5 text-center tabular-nums">{fmt(t.actual_q)}</TableCell>
            {showPct && <TableCell className="px-2 py-2.5 text-center">100%</TableCell>}
            <TableCell className="py-2.5 text-center tabular-nums">{fmt(t.monto_trimestral)}</TableCell>
            <TableCell className="py-2.5 text-center tabular-nums">{fmt(t.monto_anual)}</TableCell>
            {showPct && <TableCell className="px-2 py-2.5 text-center">100%</TableCell>}
            <TableCell className="py-2.5 text-center">{t.ejecucion_vs_q !== null ? t.ejecucion_vs_q + '%' : ''}</TableCell>
            {showPct && <TableCell className="py-2.5 text-center">{t.ejecucion_vs_anio !== null ? t.ejecucion_vs_anio + '%' : ''}</TableCell>}
            <TableCell className="py-2.5 text-center tabular-nums">{fmt(t.actual_q_anterior)}</TableCell>
            <TableCell className="px-2 py-2.5 text-center">{t.variacion_yoy !== null ? (t.variacion_yoy > 0 ? '+' : '') + t.variacion_yoy + '%' : ''}</TableCell>
            <TableCell className="py-2.5 text-center tabular-nums">{fmt(t.actual_anio_anterior)}</TableCell>
          </TableRow>

          {/* Categories + conceptos */}
          {data.categorias.map((cat) => {
            const isExpanded = expanded.has(cat.categoria_id);
            return (
              <PresupuestoCategoryGroup
                key={cat.categoria_id}
                categoria={cat}
                expanded={isExpanded}
                onToggle={() => toggleCategory(cat.categoria_id)}
                showPct={showPct}
                modoPresupuesto={modoPresupuesto}
                onBudgetChange={onBudgetChange}
                onVerGastos={setDetalleTarget}
              />
            );
          })}
        </TableBody>
    </Table>

    <GastosEjecucionDialog
      target={detalleTarget}
      onClose={() => setDetalleTarget(null)}
      negocioId={negocioId}
      anio={anio}
      quarters={quarters}
    />
    </>
  );
}

function PresupuestoCategoryGroup({
  categoria,
  expanded,
  onToggle,
  showPct,
  modoPresupuesto,
  onBudgetChange,
  onVerGastos,
}: {
  categoria: PresupuestoData['categorias'][0];
  expanded: boolean;
  onToggle: () => void;
  showPct: boolean;
  modoPresupuesto: boolean;
  onBudgetChange: (conceptoId: string, categoriaId: string, newAmount: number) => void;
  onVerGastos: (target: GastosEjecucionTarget) => void;
}) {
  const visibleConceptos = modoPresupuesto
    ? categoria.conceptos
    : categoria.conceptos.filter((r) => r.monto_anual > 0 || r.actual_q > 0 || r.actual_q_anterior > 0 || r.actual_anio_anterior > 0);

  return (
    <>
      <PresupuestoCategoriaRow
        categoria={categoria}
        expanded={expanded}
        onToggle={onToggle}
        showPct={showPct}
        onVerGastos={() =>
          onVerGastos({
            titulo: categoria.categoria_nombre,
            conceptoIds: categoria.conceptos.map((c) => c.concepto_id),
          })
        }
      />
      {expanded &&
        visibleConceptos.map((row) => (
          <PresupuestoConceptoRow
            key={row.concepto_id}
            row={row}
            showPct={showPct}
            editable={modoPresupuesto}
            onBudgetChange={onBudgetChange}
            onVerGastos={() =>
              onVerGastos({
                titulo: row.concepto_nombre,
                categoriaNombre: row.categoria_nombre,
                conceptoIds: [row.concepto_id],
              })
            }
          />
        ))}
    </>
  );
}
