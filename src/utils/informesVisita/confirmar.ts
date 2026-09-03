import type { DecisionFila, FilaPropuesta } from '@/types/informesVisita';

export class ConfirmacionIncompletaError extends Error {
  constructor(public readonly pendientes: string[]) {
    super(
      pendientes.length === 0
        ? 'No hay decisiones sobre las filas propuestas.'
        : `Faltan decisiones para ${pendientes.length} fila(s) propuesta(s).`,
    );
    this.name = 'ConfirmacionIncompletaError';
  }
}

/**
 * Aplica confirm/edit/discard. Las filas sin decisión quedan pendientes.
 * Nada de esto escribe a la base: el persistidor debe llamar
 * `filasListasParaPersistir` y esa función lanza si queda alguna pendiente.
 */
export function aplicarDecisiones(
  propuestas: FilaPropuesta[],
  decisiones: DecisionFila[],
): { confirmadas: FilaPropuesta[]; descartadas: string[]; pendientes: string[] } {
  const porClave = new Map(decisiones.map((d) => [d.clave, d]));
  const confirmadas: FilaPropuesta[] = [];
  const descartadas: string[] = [];
  const pendientes: string[] = [];

  for (const fila of propuestas) {
    const d = porClave.get(fila.clave);
    if (!d) {
      pendientes.push(fila.clave);
      continue;
    }
    if (d.accion === 'descartar') {
      descartadas.push(fila.clave);
      continue;
    }
    confirmadas.push({ ...fila, ...d.edicion, clave: fila.clave });
  }

  return { confirmadas, descartadas, pendientes };
}

/**
 * Única puerta hacia el persistidor. Lanza si alguna propuesta no tiene
 * confirm/discard. Las descartadas no salen. Nunca inventa filas.
 */
export function filasListasParaPersistir(
  propuestas: FilaPropuesta[],
  decisiones: DecisionFila[],
): FilaPropuesta[] {
  const { confirmadas, pendientes } = aplicarDecisiones(propuestas, decisiones);
  if (propuestas.length > 0 && decisiones.length === 0) {
    throw new ConfirmacionIncompletaError(propuestas.map((p) => p.clave));
  }
  if (pendientes.length > 0) {
    throw new ConfirmacionIncompletaError(pendientes);
  }
  return confirmadas;
}
