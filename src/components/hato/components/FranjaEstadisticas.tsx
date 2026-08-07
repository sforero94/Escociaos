// ARCHIVO: components/hato/components/FranjaEstadisticas.tsx
// DESCRIPCIÓN: Componente canónico nuevo del plan §7.6 -- "franja de
// estadísticas compactas" bajo el header de la Hoja de Vida (PL, #Partos,
// duración de la etapa actual, Secar, Parto probable en una fila). Denso a
// propósito: solo aparece en vistas de detalle de un único registro (nunca
// en listas). `—` para cualquier valor ausente -- nunca 0 (regla del
// módulo).
//
// El ítem de duración (antes "Días abiertos" fijo) es DINÁMICO desde E3.2:
// cambia de label y de campo fuente según el `estado` reproductivo actual
// -- "Tiempo de preñez" / "Tiempo secada" / "Tiempo vacía" / "Días
// abiertos" (fallback). La lógica pura vive en `utils/hatoDuracion.ts`
// (tested) -- este componente solo la renderiza.

import { formatNumber, formatShortDate } from '@/utils/format';
import { duracionEstadoActual } from '@/utils/hatoDuracion';
import type { EstadoReproductivo } from '@/utils/calculosHato';

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
  estado,
  diasAbiertos,
  tiempoPrenezDias,
  tiempoSecadaDias,
  fechaSecar,
  fechaProbableParto,
}: {
  pl: number | null;
  numPartos: number;
  estado: EstadoReproductivo;
  diasAbiertos: number | null;
  tiempoPrenezDias: number | null;
  tiempoSecadaDias: number | null;
  fechaSecar: string | null;
  fechaProbableParto: string | null;
}) {
  const duracion = duracionEstadoActual({
    estado,
    dias_abiertos: diasAbiertos,
    tiempo_prenez_dias: tiempoPrenezDias,
    tiempo_secada_dias: tiempoSecadaDias,
  });

  const items: EstadisticaHato[] = [
    { label: 'PL', value: numeroOGuion(pl, 1) },
    { label: 'N.º partos', value: formatNumber(numPartos) },
    duracion,
    { label: 'Secar', value: fechaOGuion(fechaSecar) },
    { label: 'Parto probable', value: fechaOGuion(fechaProbableParto) },
  ];

  return (
    <div className="flex flex-wrap gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-[120px] flex-1 sm:text-left text-center">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{item.label}</p>
          <p className="text-sm font-semibold text-gray-900 tabular-nums">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
