import { obtenerFechaHoy } from './fechas';

/** Application date-only pairs. Null ends are valid for ongoing execution. */
export interface FechasAplicacion {
  fecha_inicio_planeada?: string | null;
  fecha_fin_planeada?: string | null;
  fecha_inicio_ejecucion?: string | null;
  fecha_fin_ejecucion?: string | null;
}
function fechaValida(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0);
  return year > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function validarFechasAplicacion(value: FechasAplicacion): void {
  for (const [start, end, label] of [
    [value.fecha_inicio_planeada, value.fecha_fin_planeada, 'planeadas'],
    [value.fecha_inicio_ejecucion, value.fecha_fin_ejecucion, 'reales'],
  ]) {
    if ((start && !fechaValida(start)) || (end && !fechaValida(end))) throw new Error(`Fechas ${label}: usa fechas de calendario YYYY-MM-DD.`);
    if (start && end && start > end) throw new Error(`Fechas ${label}: el inicio no puede ser posterior al final.`);
  }
}

/** Compare calendar dates in the browser local day, never UTC-parsed midnights. */
export function validarInicioEjecucion(fecha: string, hoy = obtenerFechaHoy()): void {
  if (!fechaValida(fecha) || !fechaValida(hoy)) throw new Error('Usa fechas de calendario YYYY-MM-DD.');
  if (fecha > hoy) throw new Error('La fecha de inicio no puede ser futura');
}
