/**
 * Una aplicación cerrada no se edita desde la aplicación (ESCO-188, decisión de
 * Santiago 2026-11-26): "Editar aplicaciones cerradas solo lo puedo hacer yo con
 * ediciones al back end." No hay botón para reabrir.
 *
 * El cierre ya descontó el inventario y fijó los costos. Volver a guardar el plan
 * desde la calculadora reescribe dosis y cantidades sobre un hecho cerrado.
 */
export const MENSAJE_APLICACION_CERRADA =
  'Esta aplicación está cerrada y no se puede editar. Si hay un error, pídele a Santiago que lo corrija.';

export function aplicacionEsEditable(estado: string | null | undefined): boolean {
  return estado !== 'Cerrada';
}
