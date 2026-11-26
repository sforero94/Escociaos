// ARCHIVO: utils/hato/eliminarPartoConCria.ts
// DESCRIPCIÓN: ESCO-186 -- borrar un parto desde la app también borra la
// ficha de la ternera que el sistema creó para ese parto (ESCO-135), en la
// misma acción, SOLO si la ficha sigue intacta.
//
// Antes, eliminar el parto desde la Hoja de Vida dejaba la ficha
// automática viva y huérfana: una ternera "fantasma" sin parto que la
// explique (caso VENUS #151). El Deshacer de Telegram ya resolvía esto; este
// módulo reutiliza exactamente su regla:
//
//   - `decidirDeshacerCria` (`criaAutomatica.ts`) decide si la ficha se
//     puede borrar: creada por el flujo automático, de ESTA madre, sin
//     nombre, activa y sin ninguna referencia propia.
//   - `REFERENCIAS_CRIA` es la misma lista de tablas que cuenta el Deshacer
//     (`telegram/bot.ts`, `hato_ev_undo`). La prueba
//     `hatoEliminarPartoConCria.test.ts` falla si las dos listas se separan.
//   - Falla cerrado: un conteo que da error cuenta como referencia.
//
// Diferencia deliberada con Telegram: allá, una ficha con registros propios
// rechaza el Deshacer completo. Acá el parto se borra igual (es lo que el
// usuario pidió y lo que la app hacía siempre) y la ficha se conserva, con
// un aviso que dice por qué. Nunca se borra una ternera en la que alguien ya
// trabajó.
//
// No es atómico: son dos DELETE desde el navegador. El orden es forzoso
// (`hato_eventos.cria_id` referencia la ficha, FK sin cascada). Si el
// segundo falla, el parto ya se borró y la ficha queda, como antes, y el
// resultado lo dice explícitamente. Las FK sin cascada de las otras tablas
// hacia `hato_animales` son una segunda guarda: si entre el conteo y el
// DELETE aparece una referencia, la base rechaza el borrado de la ficha.

import { decidirDeshacerCria, type CriaParaDeshacer } from './criaAutomatica';

// ----------------------------------------------------------------------------
// Referencias que cuenta el Deshacer de Telegram
// ----------------------------------------------------------------------------

export interface ReferenciaCria {
  tabla: string;
  columna: string;
  /** `hato_eventos.cria_id`: el parto que se está borrando no cuenta. */
  excluirEvento?: boolean;
  /** `fin_transacciones_ganado`: solo filas del Hato (`es_hato = true`). */
  soloHato?: boolean;
}

export const REFERENCIAS_CRIA: readonly ReferenciaCria[] = [
  { tabla: 'hato_eventos', columna: 'animal_id' },
  { tabla: 'hato_eventos', columna: 'cria_id', excluirEvento: true },
  { tabla: 'hato_animales', columna: 'madre_id' },
  { tabla: 'hato_animales', columna: 'padre_id' },
  { tabla: 'hato_chequeo_vacas', columna: 'animal_id' },
  { tabla: 'hato_pesajes_leche', columna: 'animal_id' },
  { tabla: 'hato_tratamientos', columna: 'animal_id' },
  { tabla: 'hato_pajillas_uso', columna: 'animal_id' },
  { tabla: 'hato_alertas', columna: 'animal_id' },
  { tabla: 'fin_transacciones_ganado', columna: 'hato_animal_id', soloHato: true },
];

export interface ResultadoConteo {
  count: number | null;
  error: unknown;
}

/** Suma de referencias, fallando cerrado: un conteo con error, o sin
 * número, cuenta como 1 (ante la duda, la ficha no se borra). */
export function sumarReferencias(conteos: ResultadoConteo[]): number {
  return conteos.reduce((total, r) => total + (r.error ? 1 : (r.count ?? 1)), 0);
}

// ----------------------------------------------------------------------------
// Orquestación
// ----------------------------------------------------------------------------

export interface EventoParaEliminar {
  id: string;
  tipo: string;
  animal_id: string;
  cria_id: string | null;
}

export interface CriaLeida extends CriaParaDeshacer {
  numero: number | null;
}

export interface DependenciasEliminarEvento {
  leerCria: (criaId: string) => Promise<{ cria: CriaLeida | null; error: string | null }>;
  /** Total de referencias a la cría fuera de este parto (fail-closed). */
  contarReferencias: (criaId: string, eventoId: string) => Promise<number>;
  borrarEvento: (eventoId: string) => Promise<string | null>;
  borrarCria: (criaId: string) => Promise<string | null>;
}

export interface ResultadoEliminarEvento {
  ok: boolean;
  error?: string;
  /** Ficha de la ternera borrada junto con el parto. */
  criaBorrada?: { numero: number | null };
  /** El parto se borró y la ficha de la ternera se conservó. */
  avisoCria?: string;
}

function etiquetaCria(cria: { numero: number | null; nombre: string | null }): string {
  const numero = cria.numero != null ? ` #${cria.numero}` : '';
  const nombre = cria.nombre ? ` ${cria.nombre}` : '';
  return `la ternera${numero}${nombre}`;
}

export async function eliminarEventoHato(
  evento: EventoParaEliminar,
  deps: DependenciasEliminarEvento,
): Promise<ResultadoEliminarEvento> {
  // Cualquier evento que no sea un parto con cría vinculada: igual que antes.
  if (evento.tipo !== 'parto' || !evento.cria_id) {
    const error = await deps.borrarEvento(evento.id);
    return error ? { ok: false, error } : { ok: true };
  }

  const lectura = await deps.leerCria(evento.cria_id);
  if (lectura.error) {
    return {
      ok: false,
      error: `No se pudo revisar la ficha de la ternera, así que no se borró nada. Intenta de nuevo. (${lectura.error})`,
    };
  }
  const cria = lectura.cria;

  const referencias = cria ? await deps.contarReferencias(cria.id, evento.id) : 0;
  const decision = decidirDeshacerCria({ cria, madreId: evento.animal_id, referencias });

  const errorEvento = await deps.borrarEvento(evento.id);
  if (errorEvento) return { ok: false, error: errorEvento };

  if (decision.accion === 'sin_cria' || !cria) return { ok: true };

  if (decision.accion === 'rechazar') {
    return {
      ok: true,
      avisoCria: `Se eliminó el parto. La ficha de ${etiquetaCria(cria)} se conservó porque ${decision.motivo}. Si sobra, revísala en su hoja de vida.`,
    };
  }

  const errorCria = await deps.borrarCria(decision.criaId);
  if (errorCria) {
    return {
      ok: true,
      avisoCria: `Se eliminó el parto, pero la ficha de ${etiquetaCria(cria)} no se pudo borrar (${errorCria}). Bórrala desde su hoja de vida.`,
    };
  }
  return { ok: true, criaBorrada: { numero: cria.numero } };
}
