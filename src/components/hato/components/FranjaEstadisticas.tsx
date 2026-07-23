// ARCHIVO: components/hato/components/FranjaEstadisticas.tsx
// DESCRIPCIÓN: Componente canónico nuevo del plan §7.6 -- "franja de
// estadísticas compactas" bajo el header de la Hoja de Vida (PL, #Partos,
// días abiertos, Secar, Parto probable en una fila). Denso a propósito:
// solo aparece en vistas de detalle de un único registro (nunca en listas).
// `—` para cualquier valor ausente -- nunca 0 (regla del módulo).

import { formatNumber, formatShortDate } from '@/utils/format';

export interface EstadisticaHato {
  label: string;
  value: string;
}

function fechaOGuion(fecha: string | null): string {
  return fecha ? formatShortDate(fecha) : '—';
}

function numeroOGuion(valor: number | null, decimales = 0): string {
  return valor != null ? formatNumber(valor, decimales) : '—';
}

export function FranjaEstadisticas({
  pl,
  numPartos,
  diasAbiertos,
  fechaSecar,
  fechaProbableParto,
}: {
  pl: number | null;
  numPartos: number;
  diasAbiertos: number | null;
  fechaSecar: string | null;
  fechaProbableParto: string | null;
}) {
  const items: EstadisticaHato[] = [
    { label: 'PL', value: numeroOGuion(pl, 1) },
    { label: 'N.º partos', value: formatNumber(numPartos) },
    { label: 'Días abiertos', value: numeroOGuion(diasAbiertos) },
    { label: 'Secar', value: fechaOGuion(fechaSecar) },
    { label: 'Parto probable', value: fechaOGuion(fechaProbableParto) },
  ];

  // Nota de layout: el build de Tailwind congelado (`src/index.css`, CLAUDE.md
  // "Caution Zones") NO trae `grid-cols-5` ni `sm:grid-cols-5` en ninguna
  // combinación -- se usa `flex flex-wrap` con `min-w-[120px]` (SÍ presente
  // en el build) en vez de una grilla fija de 5 columnas.
  return (
    <div className="flex flex-wrap gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-[120px] flex-1 sm:text-left text-center">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{item.label}</p>
          {/* `tabular-nums` no existe en el build congelado -- se usa la
              propiedad CSS directa. */}
          <p className="text-sm font-semibold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
