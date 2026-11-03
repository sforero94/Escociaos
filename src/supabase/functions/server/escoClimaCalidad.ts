// ============================================================================
// Lluvia confiable (migración 068)
// ============================================================================

// El backfill historico de la 068 solo marca lluvia_confianza y deja el valor
// crudo intacto (a proposito, para auditoria). Por eso TODO consumidor de
// clima_resumen_diario debe pasar por aqui: sumar lluvia_total_mm directo
// revive el duplicado que la migracion detecto. "Sin dato" es NULL, nunca 0.
//
// MIGRACIÓN 122 — `cobertura_parcial` SALE de este conjunto.
// Desde la 122 esa etiqueta dejó de significar "sin dato" y pasa a significar
// "el valor es una COTA INFERIOR real": el rollup reconstruye la lluvia del día
// desde `lluvia_evento_mm` (acumulador por evento, independiente del contador
// diario) y guarda lo que efectivamente se midió en las horas capturadas. Las
// filas históricas de `cobertura_parcial` traen `lluvia_total_mm = NULL` y se
// siguen leyendo como sin dato — el NULL habla solo, no hace falta la etiqueta.
//
// `contador_congelado` SE QUEDA, y por una razón concreta: 24 de las 31 filas
// marcadas así conservan un valor que ES el duplicado falso que la 068 detectó
// (verificado 2026-08-27: las 24 tienen hoy_mm = ayer_mm exacto). Hasta que el
// backfill de Ecowitt las reconstruya, ese número no se puede usar. El rollup
// ya no escribe esta etiqueta salvo cuando no hay señal independiente.
const CONFIANZAS_SIN_DATO = new Set(['contador_congelado']);

export function lluviaConfiableDeResumen(
  fila: { lluvia_total_mm: number | null; lluvia_confianza?: string | null }
): number | null {
  if (fila.lluvia_confianza != null && CONFIANZAS_SIN_DATO.has(fila.lluvia_confianza)) return null;
  return fila.lluvia_total_mm;
}

/**
 * `true` cuando el valor del día es una COTA INFERIOR y no un total: sólo se
 * capturó parte de la jornada (migraciones 103/115), así que lo medido es "al
 * menos esto", nunca "esto fue todo".
 *
 * La distinción importa y no es cosmética. Una cota inferior de 0 mm no informa
 * NADA — "no llovió durante las horas que miramos" no es "no llovió" — mientras
 * que una cota inferior de 8 mm sí es un hecho: llovió al menos 8 mm. Por eso
 * los consumidores tratan distinto los dos casos en vez de meterlos en la misma
 * bolsa.
 */
export function esCotaInferior(
  fila: { lluvia_confianza?: string | null }
): boolean {
  return fila.lluvia_confianza === 'cobertura_parcial';
}
