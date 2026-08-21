// utils/calculadoraAplicacionesHelpers.ts
// Ayudas puras del rediseño estructural W01 v2 de la Calculadora de Aplicaciones
// (docs/../W01-calculadora-v2.md, campos #1 y #4). No toca calculosAplicaciones.ts —
// esa es la lógica de dominio de dosis/canecas/bultos; esto es únicamente texto/fecha
// de conveniencia para el "Plan" de una aplicación.

import type { TipoAplicacionLocal } from '../types/aplicaciones';

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

const ETIQUETA_TIPO: Record<TipoAplicacionLocal, string> = {
  fumigacion: 'Fumigación',
  fertilizacion: 'Fertilización',
  drench: 'Drench',
};

/**
 * Sugiere un nombre para la aplicación a partir de lo que ya se decidió arriba en el
 * formulario (tipo, cuántos lotes, mes/año de inicio) — campo #1 de la auditoría de W01 v2.
 * Nunca lanza ni asume: cualquier segmento sin dato todavía se omite en vez de mostrar un
 * placeholder inventado ("undefined lotes", "Invalid Date", etc.).
 *
 * Ejemplo real: sugerirNombreAplicacion('fertilizacion', 4, '2026-08-18')
 *   -> "Fertilización · 4 lotes · ago 2026"
 */
export function sugerirNombreAplicacion(
  tipo: TipoAplicacionLocal | undefined,
  numLotes: number,
  fechaInicioISO: string,
): string {
  const partes: string[] = [];

  if (tipo) {
    partes.push(ETIQUETA_TIPO[tipo]);
  }

  if (numLotes > 0) {
    partes.push(numLotes === 1 ? '1 lote' : `${numLotes} lotes`);
  }

  if (fechaInicioISO && /^\d{4}-\d{2}-\d{2}$/.test(fechaInicioISO)) {
    const [anio, mesStr] = fechaInicioISO.split('-');
    const mesIndex = parseInt(mesStr, 10) - 1;
    if (mesIndex >= 0 && mesIndex < 12) {
      partes.push(`${MESES_CORTOS[mesIndex]} ${anio}`);
    }
  }

  return partes.join(' · ');
}

/**
 * Sugiere `fecha_fin_planeada` como `fecha_inicio_planeada` + 1 mes calendario, en hora
 * LOCAL (nunca UTC — ver la regla de CLAUDE.md sobre `obtenerFechaHoy()`). Heurística
 * marcada como "a confirmar con el dueño" en el diseño (campo #4 de la auditoría); coincide
 * con el único dato real disponible (18/08 -> 18/09, 31 días exactos).
 *
 * Si el día de inicio no existe en el mes destino (ej. 31 de enero -> febrero), cae al
 * último día de ese mes en vez de desbordar a marzo — mismo comportamiento que la mayoría
 * de calendarios, y evita que "fin" caiga después del mes siguiente por sorpresa.
 */
export function sugerirFechaFin(fechaInicioISO: string): string {
  if (!fechaInicioISO || !/^\d{4}-\d{2}-\d{2}$/.test(fechaInicioISO)) return '';

  const [anioStr, mesStr, diaStr] = fechaInicioISO.split('-');
  const anio = parseInt(anioStr, 10);
  const mes = parseInt(mesStr, 10) - 1; // 0-indexed
  const dia = parseInt(diaStr, 10);

  // Día 0 del mes siguiente-siguiente = último día del mes destino. Construir la fecha
  // objetivo primero y comparar contra ese tope evita el desborde de `new Date(y, m, d)`
  // cuando `d` no existe en el mes destino (JS normaliza en vez de fallar).
  const ultimoDiaMesDestino = new Date(anio, mes + 2, 0).getDate();
  const diaFinal = Math.min(dia, ultimoDiaMesDestino);

  const fechaFin = new Date(anio, mes + 1, diaFinal);

  const y = fechaFin.getFullYear();
  const m = String(fechaFin.getMonth() + 1).padStart(2, '0');
  const d = String(fechaFin.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
