// Detección compartida mínima, sin agregados ni proyección.
/** `true` solo cuando hay exactamente un turno. Los dos vacíos (jornada
 * histórica) o los dos presentes cuentan como pesaje completo. */
export function turnoIncompleto(pesaje: { litros_am?: number | null; litros_pm?: number | null }): boolean {
  const am = pesaje.litros_am != null;
  const pm = pesaje.litros_pm != null;
  return am !== pm;
}

