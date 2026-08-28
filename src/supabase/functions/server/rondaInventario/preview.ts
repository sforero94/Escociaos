// ARCHIVO: src/supabase/functions/server/rondaInventario/preview.ts
// GENERADO por docs/inventario/regenerar-copias-ronda-inventario.py -- NUNCA
// edites este archivo a mano. Editá `src/utils/rondaInventario/preview.ts` y volvé a correr el script.
//
// POR QUÉ EXISTE ESTE DUPLICADO: el pipeline de voz de la ronda de
// inventario (`ronda-voz-pipeline.ts`, `ronda-inventario-tick.ts` -- de una
// fase posterior) corre en el árbol de despliegue de la edge function y no
// puede importar desde `src/utils/` -- cruzaría la frontera del árbol de
// despliegue de Deno. Misma restricción que ya produjo `calculos-hato.ts`,
// `priorizacion-scouting.ts` y `importHato/*`.
//
// Contenido idéntico al original salvo los especificadores de import
// (reescritos para Deno: `./xxx` -> `./xxx.ts`).
// `src/__tests__/rondaInventarioParidadServidor.test.ts` corre este mismo
// script en modo `--check` y falla si alguien hand-editó una copia en vez de
// regenerarla.

// ARCHIVO: utils/rondaInventario/preview.ts
// DESCRIPCIÓN: Construye el PREVIEW que Uriel confirma antes de que un
// hallazgo narrado se convierta en una excepción registrada (A-9/CA-29) --
// §5.6 del brief técnico. Puro, cero I/O, cero `Date.now()`: el llamador
// (el handler de Telegram, en una fase posterior) inyecta cualquier dato que
// dependa del reloj o de una consulta a la base.
//
// CONTRATO DE CA-30, LITERAL: "El preview muestra, por cada hallazgo:
// producto identificado, cantidad física, cantidad teórica TRAÍDA DEL
// SISTEMA (R-19), causa propuesta y vía propuesta en lenguaje que Uriel
// entienda («David lo resuelve» / «pasa a Santiago»). Sin precio ni valor
// (R-15)." Ese es el vocabulario que usa `renderPreviewTelegram` -- no una
// prosa distinta por causa, para que el mensaje sea consistente entre
// rondas y auditable contra el propio texto de la CA.
//
// R-15/CA-13: NINGUNA función de este archivo acepta ni puede mostrar
// `precio_unitario` ni ningún valor monetario -- ni siquiera como parámetro
// opcional. Si algún día hace falta agregarlo para otro consumidor (el
// reporte de cierre, que SÍ lo lleva para Santiago), va en `reporteCierre.ts`,
// nunca acá.

import type { FisicoOrigen } from './interpretarNota.ts';
import type { ViaExcepcion } from './causasRaiz.ts';

// ---------------------------------------------------------------------------
// 1. Una fila del preview -- ya resuelta (producto, físico, vía)
// ---------------------------------------------------------------------------

export interface FilaPreview {
  /** Literal, tal como lo dijo el modelo -- se muestra siempre, identificado
   * o no, porque es lo que Uriel reconoce de lo que él mismo narró. */
  productoMencionado: string;
  productoIdentificado: boolean;
  /** `null` si `!productoIdentificado` (R-20/CA-32: no identificado se
   * muestra así, nunca se resuelve al nombre más parecido). */
  productoId: string | null;
  /** Nombre CANÓNICO del catálogo si está identificado; si no, se repite
   * `productoMencionado` para que la fila tenga algo que mostrar. */
  nombreProducto: string;
  unidad: string | null;
  /** `null` si el hallazgo quedó incompleto (`derivarFisico` -> `incompleto`)
   * -- no se puede confirmar así (A-9 exige que Uriel complete la cifra). */
  fisico: number | null;
  fisicoOrigen: FisicoOrigen | null;
  /** `null` si no identificado -- no hay con qué comparar (R-19: el teórico
   * SIEMPRE sale de la foto congelada del sistema, nunca de lo que Uriel dijo). */
  teorico: number | null;
  causaClave: string | null;
  causaEtiqueta: string | null;
  via: ViaExcepcion;
  /** Cita de Uriel sobre lo que David habría dicho (CA-38) -- se muestra
   * como CITA, nunca como la palabra confirmada de David; esa confirmación
   * es un paso posterior (fuera de este archivo, capa de excepciones). */
  explicacionCitada: string | null;
  fragmentoLiteral: string;
  /** CA-4: `true` si el producto se identificó FUERA del alcance congelado
   * -- existía en el catálogo pero en cero/inactivo al abrir la ronda
   * (`resolverHallazgos.ts`). El teórico de estas filas siempre es 0. Se
   * muestra distinto en el preview para que quien confirma sepa que este
   * producto se va a AGREGAR al alcance de la ronda, no que ya estaba. */
  fueraDeAlcance: boolean;
}

export interface PreviewRonda {
  filas: FilaPreview[];
  /** A-7/R-16/CA-14: observaciones sobre productos que no están en el
   * catálogo, o comentarios generales -- nunca se fuerzan como hallazgo. */
  observacionesLibres: string[];
  avisos: string[];
}

export function construirPreview(
  filas: readonly FilaPreview[],
  observacionesLibres: readonly string[] = [],
  avisos: readonly string[] = [],
): PreviewRonda {
  return { filas: [...filas], observacionesLibres: [...observacionesLibres], avisos: [...avisos] };
}

/** `true` si todas las filas del preview tienen lo mínimo para poder
 * confirmarse: producto identificado y físico resuelto. Un preview con
 * alguna fila incompleta o no identificada NO se puede confirmar (A-9/CA-32)
 * -- el llamador usa esto para decidir si habilita el botón `Confirmar` o
 * pide una corrección primero. */
export function previewConfirmable(preview: PreviewRonda): boolean {
  if (preview.filas.length === 0) return false;
  return preview.filas.every((f) => f.productoIdentificado && f.fisico !== null);
}

// ---------------------------------------------------------------------------
// 2. El texto que Uriel ve en Telegram -- CA-30 literal, R-15/CA-13: nunca
//    precio ni valor.
// ---------------------------------------------------------------------------

/** Formato colombiano de cantidades (R-13: sin sufijo de unidad monetaria --
 * acá no hay monto, sólo cantidades). Entero cuando el valor es entero, con
 * un decimal cuando no lo es -- mismo criterio que `formatearNumeroCO` de
 * `acciones-hechos.ts`. NO se importa `@/utils/format`: este módulo se
 * espeja a los dos árboles de edge function
 * (`docs/inventario/regenerar-copias-ronda-inventario.py`), que no pueden
 * cruzar la frontera de `src/utils/format.ts` -- mismo motivo por el que
 * `acciones-hechos.ts` reimplementa su propio formateador en vez de
 * importarlo. */
export function formatearCantidad(valor: number): string {
  const decimales = Number.isInteger(valor) ? 0 : 1;
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

/** Frase de vía en el lenguaje EXACTO de CA-30: «David lo resuelve» /
 * «pasa a Santiago». No varía por causa -- variarla por causa introduciría
 * una prosa distinta en cada mensaje, que es exactamente lo que un test de
 * regresión sobre el TEXTO no podría distinguir de un cambio de comportamiento. */
function fraseVia(via: ViaExcepcion): string {
  switch (via) {
    case 'captura_david':
      return 'David lo resuelve';
    case 'aprobacion_gerencia':
      return 'pasa a Santiago';
    case 'ninguna':
      return 'no mueve inventario';
  }
}

function renderFila(fila: FilaPreview): string {
  if (!fila.productoIdentificado) {
    return `«${fila.productoMencionado}» -- producto no identificado, elige uno de la lista`;
  }
  if (fila.fisico === null || fila.teorico === null) {
    return `${fila.nombreProducto}: falta la cantidad física para poder confirmar`;
  }

  const fisicoTexto = fila.fisicoOrigen === 'derivado'
    ? `${formatearCantidad(fila.fisico)} (derivado)`
    : formatearCantidad(fila.fisico);

  const causaTexto = fila.causaEtiqueta ? `${fila.causaEtiqueta} -- ` : '';
  // CA-4: este producto no estaba en el alcance que se congeló al abrir la
  // ronda (estaba en cero) -- avisa que confirmar lo agrega, para que no se
  // lea como si el sistema ya lo estuviera contando.
  const fueraDeAlcanceTexto = fila.fueraDeAlcance ? ' (no estaba en el alcance -- se agrega al confirmar)' : '';

  return `${fila.nombreProducto}${fueraDeAlcanceTexto}: hay ${fisicoTexto}, deberían haber ${formatearCantidad(fila.teorico)}. ${causaTexto}${fraseVia(fila.via)}`;
}

/**
 * Texto completo del preview para Telegram. R-15/CA-13: nunca precio ni
 * valor -- ninguna fila de este render puede mostrarlo porque `FilaPreview`
 * no tiene esa propiedad (D-T8 aplicado acá también: la ausencia en el tipo
 * es la garantía, no una revisión a ojo).
 */
export function renderPreviewTelegram(preview: PreviewRonda): string {
  const lineas = preview.filas.map((f) => `- ${renderFila(f)}`);
  const bloques = ['Esto entendí de tu nota:', ...lineas];

  if (preview.observacionesLibres.length > 0) {
    bloques.push('', 'Observaciones (no catalogadas):');
    bloques.push(...preview.observacionesLibres.map((o) => `- ${o}`));
  }

  if (preview.avisos.length > 0) {
    bloques.push('', 'Dudas del sistema al interpretar:');
    bloques.push(...preview.avisos.map((a) => `- ${a}`));
  }

  bloques.push('', previewConfirmable(preview)
    ? '¿Confirmás? [Confirmar] [Corregir] [Descartar]'
    : 'Falta identificar o completar algún hallazgo antes de poder confirmar. Corregí por texto.');

  return bloques.join('\n');
}

// ---------------------------------------------------------------------------
// 3. Corrección de un preview -- A-9/CA-35: la corrección se acumula, el
//    transcrito original NUNCA se reescribe (CA-36: es la capa cruda).
// ---------------------------------------------------------------------------

export interface Correccion {
  texto: string;
  /** ISO 8601. Lo inyecta el llamador -- este módulo no llama `Date.now()`. */
  en: string;
}

/**
 * Agrega una corrección de Uriel al historial. Nunca muta el arreglo de
 * entrada (mismo criterio que `aplicarFechaChequeo` en ocrChequeo.ts).
 * Quien vuelve a interpretar es el llamador: re-envía el transcrito ORIGINAL
 * más TODO el historial de correcciones al intérprete (CA-35: "la
 * corrección re-interpreta el transcrito original + el historial, nunca
 * edita el transcrito").
 */
export function aplicarCorreccion(correccionesPrevias: readonly Correccion[], texto: string, en: string): Correccion[] {
  return [...correccionesPrevias, { texto, en }];
}

/**
 * CA-35, literal: "la corrección re-interpreta el TRANSCRITO ORIGINAL + el
 * historial de correcciones acumuladas, nunca edita el transcrito [ni
 * reinterpreta] sólo la corrección aislada". Esto es lo que el handler de
 * Telegram le pasa a la etapa (2) del pipeline (`interpretarTranscrito`,
 * `ronda-voz-pipeline.ts`) en cada vuelta del bucle -- nunca el transcrito
 * solo, nunca la corrección sola. Sin correcciones, devuelve el transcrito
 * tal cual (no agrega ningún encabezado a algo que no lo necesita).
 */
export function construirTextoConCorrecciones(transcritoOriginal: string, correcciones: readonly Correccion[]): string {
  if (correcciones.length === 0) return transcritoOriginal;
  const listado = correcciones.map((c, i) => `${i + 1}. ${c.texto}`).join('\n');
  return [
    'Nota de voz original del verificador:',
    transcritoOriginal,
    '',
    'Correcciones que el verificador hizo DESPUÉS de esa nota, en orden -- tenlas en cuenta por encima de la nota original donde se contradigan:',
    listado,
  ].join('\n');
}

/** `MAX_INTENTOS_PREVIEW` de §7.3 del brief técnico: 3-4 intentos, se toma
 * el extremo generoso (4). Una sola constante, usada tanto por el handler
 * que cuenta los intentos como por el texto que le explica a Uriel que el
 * bot va a ceder -- para que no puedan decir números distintos. */
export const MAX_INTENTOS_PREVIEW = 4;

/** `true` si, tras un intento más de corrección, se agotó el margen de
 * CA-35 y el bot debe ceder (`sin_confirmar`, A-10) en vez de pedir otra
 * ronda de corrección. `intentosPreview` es el contador que ya trae la fila
 * de `rondas_transcritos` ANTES de sumar el intento que se está por hacer. */
export function intentosPreviewAgotados(intentosPreview: number): boolean {
  return intentosPreview >= MAX_INTENTOS_PREVIEW;
}
