import { formatCompact } from '@/utils/format';
import { EjecucionBadge, VariacionBadge, StatusDot } from './EjecucionBadge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import type { PresupuestoCategoriaRow as CatRow } from '@/types/finanzas';

interface PresupuestoCategoriaRowProps {
  categoria: CatRow;
  expanded: boolean;
  onToggle: () => void;
  showPct: boolean;
}

export function PresupuestoCategoriaRow({ categoria, expanded, onToggle, showPct }: PresupuestoCategoriaRowProps) {
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
    <tr
      className={cn('border-b border-gray-200 cursor-pointer text-xs font-semibold', bgColor)}
      onClick={onToggle}
    >
      {/* Status dot */}
      <td className="px-2 py-2.5 text-center">
        <StatusDot ejecucion={exec} />
      </td>

      {/* Categoria name */}
      <td className="pl-2 pr-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Chevron className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <span>{categoria.categoria_nombre}</span>
        </div>
      </td>

      {/* Actual Q */}
      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(categoria.actual_q)}</td>

      {/* Act % */}
      {showPct && <td className="px-2 py-2.5 text-right text-gray-500 tabular-nums">{categoria.pct_actual > 0 ? Math.round(categoria.pct_actual) + '%' : ''}</td>}

      {/* Ppto Q */}
      <td className="px-3 py-2.5 text-right border-l border-gray-200/60 tabular-nums">{fmt(categoria.monto_trimestral)}</td>

      {/* Ppto Año */}
      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(categoria.monto_anual)}</td>

      {/* Ppto % */}
      {showPct && <td className="px-2 py-2.5 text-right text-gray-500 tabular-nums">{categoria.pct_presupuesto > 0 ? Math.round(categoria.pct_presupuesto) + '%' : ''}</td>}

      {/* Ejecución vs Q */}
      <td className="px-3 py-2.5 text-center">
        <EjecucionBadge value={exec} />
      </td>

      {/* Ejec vs Año */}
      {showPct && <td className="px-3 py-2.5 text-center"><EjecucionBadge value={categoria.ejecucion_vs_anio} /></td>}

      {/* Q Anterior */}
      <td className="px-3 py-2.5 text-right border-l border-gray-200/60 tabular-nums">{fmt(categoria.actual_q_anterior)}</td>

      {/* Var YoY */}
      <td className="px-2 py-2.5 text-center">
        <VariacionBadge value={categoria.variacion_yoy} />
      </td>

      {/* Total Anterior */}
      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(categoria.actual_anio_anterior)}</td>
    </tr>
  );
}
