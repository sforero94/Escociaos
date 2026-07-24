// ARCHIVO: utils/hatoDuracion.ts
// DESCRIPCIÓN: KPI de duración dinámico de la Hoja de Vida (E3.2,
// docs/hato/sesiones-b5-d7-e3.md) -- reemplaza el ítem estático "Días
// abiertos" de `FranjaEstadisticas` por un contador cuyo label Y campo
// fuente cambian según el `estado` reproductivo YA derivado por
// `derivarEstadoReproductivo` (calculosHato.ts, E3.1):
//   - preñada / proxima_a_secar -> "Tiempo de preñez" (`tiempo_prenez_dias`).
//   - seca                       -> "Tiempo secada"   (`tiempo_secada_dias`).
//   - vacia_por_servir / parida_reciente -> "Tiempo vacía" (`dias_abiertos`,
//     el mismo dato que ya existía -- E3.1 no le agregó un campo propio).
//   - cualquier otro estado -> fallback "Días abiertos" (`dias_abiertos`),
//     mismo comportamiento que tenía la franja antes de E3.2.
// `null` en el campo fuente -> "—", NUNCA 0 (regla del módulo) -- ninguno de
// estos campos decide un umbral de negocio, solo eligen qué dato ya
// calculado mostrar y cómo formatearlo.

import { formatNumber } from '@/utils/format';
import type { EstadoReproductivo } from '@/utils/calculosHato';

export interface DuracionEstadoActual {
  label: string;
  value: string;
}

/** Un conteo de días en "X m Y d" (30 días/mes, aproximación de
 * visualización -- nunca se usa para calcular fechas, solo para mostrar un
 * número de días ya calculado de forma legible). Omite el segmento que da
 * 0 en vez de mostrar "0 m"/"0 d" redundante. */
function formatMesesDias(dias: number): string {
  const meses = Math.floor(dias / 30);
  const restoDias = dias % 30;
  if (meses === 0) return `${formatNumber(restoDias)} d`;
  if (restoDias === 0) return `${formatNumber(meses)} m`;
  return `${formatNumber(meses)} m ${formatNumber(restoDias)} d`;
}

function valorODuracion(dias: number | null, formatear: (d: number) => string): string {
  return dias != null ? formatear(dias) : '—';
}

type DerivadoParaDuracion = {
  estado: EstadoReproductivo;
  dias_abiertos: number | null;
  tiempo_prenez_dias: number | null;
  tiempo_secada_dias: number | null;
};

/** Duración de la etapa reproductiva ACTUAL de la vaca (una sola, según su
 * `estado` -- nunca las tres a la vez). Ver cabecera del archivo para el
 * mapa estado -> label/campo. */
export function duracionEstadoActual(derivado: DerivadoParaDuracion): DuracionEstadoActual {
  switch (derivado.estado) {
    case 'preñada':
    case 'proxima_a_secar':
      return { label: 'Tiempo de preñez', value: valorODuracion(derivado.tiempo_prenez_dias, formatMesesDias) };
    case 'seca':
      return { label: 'Tiempo secada', value: valorODuracion(derivado.tiempo_secada_dias, formatMesesDias) };
    case 'vacia_por_servir':
    case 'parida_reciente':
      return { label: 'Tiempo vacía', value: valorODuracion(derivado.dias_abiertos, (d) => formatNumber(d)) };
    default:
      return { label: 'Días abiertos', value: valorODuracion(derivado.dias_abiertos, (d) => formatNumber(d)) };
  }
}
