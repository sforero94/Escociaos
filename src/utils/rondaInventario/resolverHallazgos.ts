// ARCHIVO: utils/rondaInventario/resolverHallazgos.ts
// DESCRIPCIÓN: Orquestador de UN hallazgo crudo del intérprete (§5.5 del
// brief técnico) contra el alcance congelado de una ronda -- Fase 3 (Telegram,
// Uriel), §13.
//
// La Fase 1 (`interpretarNota.ts`, `preview.ts`) mantuvo las piezas
// deliberadamente granulares (`resolverProducto`, `derivarFisico`,
// `derivarVia`) y dejó la composición como un helper DE TEST, explícito no
// producto (`src/__tests__/rondaInventarioInterpretacion.test.ts`,
// `resolverFilaPreview`): en ese momento no existía ningún llamador real. La
// Fase 3 sí lo tiene -- el handler de voz de Telegram necesita esta MISMA
// composición dos veces (al recibir la nota y al reinterpretar cada
// corrección, §7.3), así que gradúa a código de producto acá, con su propia
// cobertura (`src/__tests__/rondaInventarioResolverHallazgos.test.ts`), en
// vez de quedar reimplementada inline en un archivo Deno sin test -- que es
// exactamente lo que el backend engineer no debe hacer con lógica de negocio
// no trivial.
//
// Combina DOS cosas por cada hallazgo:
//   1. `FilaPreview` -- lo que Uriel VE en el mensaje de Telegram
//      (`preview.ts::renderPreviewTelegram`).
//   2. `HallazgoParaConfirmar | null` -- el fragmento exacto que
//      `fn_ronda_confirmar_hallazgos` (migración 126) espera dentro de su
//      arreglo `hallazgos`, o `null` si el hallazgo NO se puede confirmar
//      todavía (producto no identificado -- R-20/CA-32 -- o físico
//      incompleto -- A-9). El handler de Telegram nunca debe construir ese
//      payload a mano por otro camino: `previewConfirmable()` (preview.ts)
//      ya usa el mismo criterio (`fisico !== null && productoIdentificado`)
//      para decidir si el botón [Confirmar] se habilita.

import {
  buscarCausaRaiz,
  type ViaExcepcion,
} from './causasRaiz';
import {
  derivarFisico,
  derivarVia,
  resolverProducto,
  type ConfianzaInterprete,
  type FisicoOrigen,
  type HallazgoCrudo,
  type ProductoEnAlcance,
} from './interpretarNota';
import type { FilaPreview } from './preview';

/** Una fila del alcance congelado de la ronda (`rondas_inventario_alcance`,
 * R-5), con lo que este módulo necesita además de `productoId`/`nombre`
 * (que es todo lo que pide `resolverProducto`). Estructuralmente es un
 * superconjunto de `ProductoEnAlcance` -- se puede pasar tal cual a
 * `resolverProducto`. */
export interface AlcanceItem extends ProductoEnAlcance {
  cantidadTeorica: number;
  unidad: string;
}

/** El fragmento de payload que `fn_ronda_confirmar_hallazgos` espera dentro
 * de `hallazgos[]` (migración 126, §6.2 del brief técnico) -- nombres de
 * campo en camelCase acá; el handler de Telegram los traduce a snake_case al
 * armar el JSON del RPC (mismo criterio de frontera que el resto del repo:
 * TypeScript en camelCase, payload de RPC en snake_case). */
export interface HallazgoParaConfirmar {
  productoId: string;
  cantidadFisica: number;
  fisicoOrigen: FisicoOrigen;
  /** El fragmento literal del transcrito de donde salió este hallazgo --
   * viaja como `observacion_uriel` (R-2: da contexto sin ser un dato de
   * conteo). `null` si el modelo no dejó fragmento (no debería ocurrir en la
   * práctica, pero el esquema del modelo no lo garantiza). */
  observacionUriel: string | null;
  /** CA-38: viaja como CITA (`explicacion_citada`), nunca como la palabra de
   * David -- eso lo confirma/corrige David después, por su propio RPC
   * (`fn_ronda_explicacion_david`, Fase 4). */
  explicacionCitada: string | null;
  causaClave: string | null;
  causaConfianza: ConfianzaInterprete;
}

export interface HallazgoResuelto {
  fila: FilaPreview;
  /** `null` si el hallazgo no se puede confirmar tal cual: producto no
   * identificado (R-20/CA-32) o físico incompleto (A-9, `derivarFisico`
   * devolvió `'incompleto'`). El llamador NUNCA debe intentar construir el
   * payload de confirmación para un hallazgo con `paraConfirmar === null`. */
  paraConfirmar: HallazgoParaConfirmar | null;
}

function filaNoIdentificada(hallazgo: HallazgoCrudo, via: ViaExcepcion): FilaPreview {
  return {
    productoMencionado: hallazgo.productoMencionado,
    productoIdentificado: false,
    productoId: null,
    nombreProducto: hallazgo.productoMencionado,
    unidad: null,
    fisico: null,
    fisicoOrigen: null,
    teorico: null,
    causaClave: null,
    causaEtiqueta: null,
    via,
    explicacionCitada: hallazgo.explicacionDavidCitada || null,
    fragmentoLiteral: hallazgo.fragmentoLiteral,
  };
}

/**
 * Resuelve UN hallazgo crudo del intérprete contra el alcance congelado de
 * la ronda. Puro: no consulta nada, no llama al modelo -- el llamador ya
 * trae `alcance` leído de `rondas_inventario_alcance`.
 *
 * Orden, literal de §5.4/§5.5/§5.6 del brief técnico:
 *   1. `resolverProducto` -- coincidencia EXACTA normalizada (D-T7). Sin
 *      match único, `no_identificado`: la fila se muestra así (R-20/CA-32)
 *      y `paraConfirmar` es `null` -- no hay `productoId` con qué confirmar.
 *   2. `derivarFisico` contra el teórico de ESTE producto en el alcance
 *      (R-19: nunca el número que dijo Uriel). `'incompleto'` -> fila con
 *      `fisico: null` y `paraConfirmar: null` (A-9: no se puede confirmar
 *      sin la cifra).
 *   3. `derivarVia` -- del catálogo, nunca del modelo (CA-34). Se deriva
 *      SIEMPRE, identificado o no: R-18 vale incluso para un hallazgo cuyo
 *      producto no se pudo resolver (el preview igual necesita mostrar algo
 *      coherente en esa columna).
 */
export function resolverHallazgo(hallazgo: HallazgoCrudo, alcance: readonly AlcanceItem[]): HallazgoResuelto {
  const via = derivarVia(hallazgo);
  const resolucion = resolverProducto(hallazgo.productoMencionado, alcance);

  if (resolucion.estado === 'no_identificado') {
    return { fila: filaNoIdentificada(hallazgo, via), paraConfirmar: null };
  }

  const item = alcance.find((p) => p.productoId === resolucion.productoId);
  // No debería poder pasar (resolverProducto sólo devuelve un productoId que
  // vino del propio `alcance`), pero si pasara, tratar como no identificado
  // en vez de arriesgar un `teorico`/`unidad` inventados.
  if (!item) {
    return { fila: filaNoIdentificada(hallazgo, via), paraConfirmar: null };
  }

  const fisicoResuelto = derivarFisico(hallazgo, item.cantidadTeorica);
  const causa = hallazgo.causaClave ? buscarCausaRaiz(hallazgo.causaClave) : undefined;

  const fila: FilaPreview = {
    productoMencionado: hallazgo.productoMencionado,
    productoIdentificado: true,
    productoId: resolucion.productoId,
    nombreProducto: resolucion.nombreProducto,
    unidad: item.unidad,
    fisico: fisicoResuelto.estado === 'resuelto' ? fisicoResuelto.fisico : null,
    fisicoOrigen: fisicoResuelto.estado === 'resuelto' ? fisicoResuelto.origen : null,
    teorico: item.cantidadTeorica,
    causaClave: hallazgo.causaClave || null,
    causaEtiqueta: causa ? causa.etiqueta : null,
    via,
    explicacionCitada: hallazgo.explicacionDavidCitada || null,
    fragmentoLiteral: hallazgo.fragmentoLiteral,
  };

  if (fisicoResuelto.estado !== 'resuelto') {
    return { fila, paraConfirmar: null };
  }

  const paraConfirmar: HallazgoParaConfirmar = {
    productoId: resolucion.productoId,
    cantidadFisica: fisicoResuelto.fisico,
    fisicoOrigen: fisicoResuelto.origen,
    observacionUriel: hallazgo.fragmentoLiteral || null,
    explicacionCitada: hallazgo.explicacionDavidCitada || null,
    causaClave: hallazgo.causaClave || null,
    causaConfianza: hallazgo.causaConfianza,
  };

  return { fila, paraConfirmar };
}

/** Mapea `resolverHallazgo` sobre un arreglo, conservando el orden --
 * el orden en que el modelo reportó los hallazgos es el orden en que Uriel
 * los narró, y el preview los muestra igual (ningún reordenamiento propio). */
export function resolverHallazgos(
  hallazgos: readonly HallazgoCrudo[],
  alcance: readonly AlcanceItem[],
): HallazgoResuelto[] {
  return hallazgos.map((h) => resolverHallazgo(h, alcance));
}
