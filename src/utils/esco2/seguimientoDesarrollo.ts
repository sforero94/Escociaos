// Development fixtures select a declared button ID, never interpret free text.
import type { ModoCaso } from './evaluacion.ts';

export function solicitudDesarrollo(args: {
  pregunta: string;
  estadoToken?: string;
  opciones?: { id: string; etiqueta: string }[];
  opcionId?: string;
  modo?: ModoCaso;
}): { pregunta: string; estadoToken?: string; respuestaAclaracion?: string } {
  // The frozen D26 development follow-up explicitly selects the named tasks.
  const opcionId = args.opcionId ?? (args.modo === 'aclaracion_d26' ? 'tarea' : undefined);
  const opcion = args.opciones?.find(o => o.id === opcionId);
  if (args.opciones?.length && opcionId && !opcion)
    throw new Error('opcion_desarrollo_no_ofrecida');
  if (opcion && !args.estadoToken)
    throw new Error('aclaracion_desarrollo_sin_token');
  return { pregunta: opcion?.etiqueta ?? args.pregunta, estadoToken: args.estadoToken, respuestaAclaracion: opcion?.id };
}
