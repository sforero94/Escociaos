import { formatCompact } from '@/utils/format';
import { EjecucionBadge, VariacionBadge, StatusDot } from './EjecucionBadge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { TableRow, TableCell } from '@/components/ui/table';
import type { PresupuestoCategoriaRow as CatRow } from '@/types/finanzas';

interface PresupuestoCategoriaRowProps {
  categoria: CatRow;
  expanded: boolean;
  onToggle: () => void;
  showPct: boolean;
  onVerGastos: () => void;
}

export function PresupuestoCategoriaRow({ categoria, expanded, onToggle, showPct, onVerGastos }: PresupuestoCategoriaRowProps) {
  const exec = categoria.ejecucion_vs_q;
  const bgColor =
    exec === null
      ? 'bg-green-50/80'
      : exec <= 80
        ? 'bg-green-50/80'
        : exec <= 100
          ? 'bg-yellow-50/80'
          : 'bg-red-50/60';

  const fmt = (v: number) => (v > 0 ? '$' + formatCompact(v) : '');
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <TableRow
      className={cn('cursor-pointer text-xs font-semibold', bgColor, 'hover:bg-green-100')}
      onClick={onToggle}
    >
      {/* Columna que identifica la fila (dot de estado + chevron + nombre),
          congelada (sticky) para que siga visible al hacer scroll horizontal
          en móvil — Patrón A de docs/sistema-visual.md §3-bis. Ancho real
          viene del <colgroup> (170px en móvil, flexible en escritorio). El
          fondo (`bgColor`, calculado arriba por nivel de ejecución) se pasa
          por `className` y le gana al `bg-white` que trae `sticky` por
          defecto -- es exactamente la jerarquía de fondos por fila que el
          primitivo no automatiza, resuelta por composición, sin tocar
          ui/table.tsx. */}
      <TableCell sticky className={cn('pl-2 py-2.5', bgColor)}>
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusDot ejecucion={exec} />
          <Chevron className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <span className="truncate flex-1 min-w-0">{categoria.categoria_nombre}</span>
        </div>
      </TableCell>

      {/* Actual Q — abre el detalle de gastos; el clic no debe plegar la fila */}
      <TableCell className="py-2.5 text-center tabular-nums">
        {categoria.actual_q > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onVerGastos();
            }}
            className="cursor-pointer hover:underline"
            title="Ver gastos"
          >
            {fmt(categoria.actual_q)}
          </button>
        ) : (
          fmt(categoria.actual_q)
        )}
      </TableCell>

      {/* Act % */}
      {showPct && <TableCell className="px-2 py-2.5 text-center text-gray-500 tabular-nums">{categoria.pct_actual > 0 ? Math.round(categoria.pct_actual) + '%' : ''}</TableCell>}

      {/* Ppto Q */}
      <TableCell className="py-2.5 text-center border-l border-gray-200/60 tabular-nums">{fmt(categoria.monto_trimestral)}</TableCell>

      {/* Ppto Año */}
      <TableCell className="py-2.5 text-center tabular-nums">{fmt(categoria.monto_anual)}</TableCell>

      {/* Ppto % */}
      {showPct && <TableCell className="px-2 py-2.5 text-center text-gray-500 tabular-nums">{categoria.pct_presupuesto > 0 ? Math.round(categoria.pct_presupuesto) + '%' : ''}</TableCell>}

      {/* Ejecución vs Q */}
      <TableCell className="py-2.5 text-center">
        <EjecucionBadge value={exec} />
      </TableCell>

      {/* Ejec vs Año */}
      {showPct && <TableCell className="py-2.5 text-center"><EjecucionBadge value={categoria.ejecucion_vs_anio} /></TableCell>}

      {/* Q Anterior */}
      <TableCell className="py-2.5 text-center border-l border-gray-200/60 tabular-nums">{fmt(categoria.actual_q_anterior)}</TableCell>

      {/* Var YoY */}
      <TableCell className="px-2 py-2.5 text-center">
        <VariacionBadge value={categoria.variacion_yoy} />
      </TableCell>

      {/* Total Anterior */}
      <TableCell className="py-2.5 text-center tabular-nums">{fmt(categoria.actual_anio_anterior)}</TableCell>
    </TableRow>
  );
}
