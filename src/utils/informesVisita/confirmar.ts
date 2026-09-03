import type { DecisionSnippet, SnippetPropuesto } from '@/types/informesVisita';

export class ConfirmacionIncompletaError extends Error {
  constructor(public readonly pendientes: string[]) {
    super(
      pendientes.length === 0
        ? 'No hay decisiones sobre los snippets propuestos.'
        : `Faltan decisiones para ${pendientes.length} snippet(s).`,
    );
    this.name = 'ConfirmacionIncompletaError';
  }
}

export function aplicarDecisiones(
  propuestas: SnippetPropuesto[],
  decisiones: DecisionSnippet[],
): { confirmadas: SnippetPropuesto[]; descartadas: string[]; pendientes: string[] } {
  const porClave = new Map(decisiones.map((d) => [d.clave, d]));
  const confirmadas: SnippetPropuesto[] = [];
  const descartadas: string[] = [];
  const pendientes: string[] = [];

  for (const snip of propuestas) {
    const d = porClave.get(snip.clave);
    if (!d) {
      pendientes.push(snip.clave);
      continue;
    }
    if (d.accion === 'descartar') {
      descartadas.push(snip.clave);
      continue;
    }
    confirmadas.push({ ...snip, ...d.edicion, clave: snip.clave, origen: snip.origen });
  }

  return { confirmadas, descartadas, pendientes };
}

/**
 * Puerta hacia el persistidor. Lanza si alguna propuesta del modelo no tiene
 * confirm/discard. Las notas de visita ya no son snippets: van en informes_visita.notas.
 */
export function snippetsListosParaPersistir(
  propuestas: SnippetPropuesto[],
  decisiones: DecisionSnippet[],
): SnippetPropuesto[] {
  const { confirmadas, pendientes } = aplicarDecisiones(propuestas, decisiones);
  if (propuestas.length > 0 && decisiones.length === 0) {
    throw new ConfirmacionIncompletaError(propuestas.map((p) => p.clave));
  }
  if (pendientes.length > 0) {
    throw new ConfirmacionIncompletaError(pendientes);
  }
  return confirmadas;
}
