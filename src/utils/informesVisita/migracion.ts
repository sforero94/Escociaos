/** Detecta que la migración 134 todavía no corre en este proyecto. */

export const MENSAJE_MIGRACION_PENDIENTE =
  'La migración 134 (informes de visita) no está aplicada. Las tablas todavía no existen.';

export function esTablaInformesAusente(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /42P01|does not exist|PGRST205|schema cache|Could not find the table|informes_visita/i.test(msg)
    && /does not exist|schema cache|Could not find|42P01|PGRST205/i.test(msg);
}
