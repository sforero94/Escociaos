// ARCHIVO: supabase/functions/make-server-1ccce916/rondaInventario/resolverHallazgos.ts
// GENERADO por docs/inventario/regenerar-copias-ronda-inventario.py -- NUNCA
// edites este archivo a mano. Editá `src/utils/rondaInventario/resolverHallazgos.ts` y volvé a correr el script.
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
} from './causasRaiz.ts';
import {
  derivarFisico,
  derivarVia,
  resolverProducto,
  type ConfianzaInterprete,
  type FisicoOrigen,
  type HallazgoCrudo,
  type ProductoEnAlcance,
} from './interpretarNota.ts';
import type { FilaPreview } from './preview.ts';

/** Una fila del alcance congelado de la ronda (`rondas_inventario_alcance`,
 * R-5), con lo que este módulo necesita además de `productoId`/`nombre`
 * (que es todo lo que pide `resolverProducto`). Estructuralmente es un
 * superconjunto de `ProductoEnAlcance` -- se puede pasar tal cual a
 * `resolverProducto`. */
export interface AlcanceItem extends ProductoEnAlcance {
  cantidadTeorica: number;
  unidad: string;
}

/** Un producto del catálogo que existe pero NO está en el alcance congelado
 * de la ronda (`cantidad_actual <= 0` al abrir, o dado de alta después) --
 * CA-4, ver el comentario de `resolverProducto` en `interpretarNota.ts`. Sin
 * `cantidadTeorica`: por definición es 0 -- no viene de
 * `rondas_inventario_alcance`, viene de `productos` directo. */
export interface ProductoFueraDeAlcance extends ProductoEnAlcance {
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
  /** CA-4: `true` si el producto se resolvió fuera del alcance congelado
   * (existía en el catálogo pero en cero/inactivo). El llamador de
   * `fn_ronda_confirmar_hallazgos` viaja esto como `fuera_de_alcance` en el
   * payload -- el RPC (migración 131) lo re-verifica server-side contra
   * `productos.cantidad_actual` antes de agregarlo al alcance de la ronda,
   * nunca confía en esta bandera ciegamente. */
  fueraDeAlcance: boolean;
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
    fueraDeAlcance: false,
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
export function resolverHallazgo(
  hallazgo: HallazgoCrudo,
  alcance: readonly AlcanceItem[],
  fueraDeAlcance: readonly ProductoFueraDeAlcance[] = [],
): HallazgoResuelto {
  const via = derivarVia(hallazgo);
  const resolucion = resolverProducto(hallazgo.productoMencionado, alcance, fueraDeAlcance);

  if (resolucion.estado === 'no_identificado') {
    return { fila: filaNoIdentificada(hallazgo, via), paraConfirmar: null };
  }

  const esFueraDeAlcance = resolucion.origen === 'fuera_de_alcance';
  const item: AlcanceItem | ProductoFueraDeAlcance | undefined = esFueraDeAlcance
    ? fueraDeAlcance.find((p) => p.productoId === resolucion.productoId)
    : alcance.find((p) => p.productoId === resolucion.productoId);
  // No debería poder pasar (resolverProducto sólo devuelve un productoId que
  // vino de una de las dos listas que él mismo recibió), pero si pasara,
  // tratar como no identificado en vez de arriesgar un `teorico`/`unidad`
  // inventados.
  if (!item) {
    return { fila: filaNoIdentificada(hallazgo, via), paraConfirmar: null };
  }

  // CA-4: un producto fuera del alcance congelado no tiene `cantidadTeorica`
  // -- el teórico ES 0 (nunca se contó como existencia al abrir la ronda).
  const teoricoFoto = esFueraDeAlcance ? 0 : (item as AlcanceItem).cantidadTeorica;

  const fisicoResuelto = derivarFisico(hallazgo, teoricoFoto);
  const causa = hallazgo.causaClave ? buscarCausaRaiz(hallazgo.causaClave) : undefined;

  const fila: FilaPreview = {
    productoMencionado: hallazgo.productoMencionado,
    productoIdentificado: true,
    productoId: resolucion.productoId,
    nombreProducto: resolucion.nombreProducto,
    unidad: item.unidad,
    fisico: fisicoResuelto.estado === 'resuelto' ? fisicoResuelto.fisico : null,
    fisicoOrigen: fisicoResuelto.estado === 'resuelto' ? fisicoResuelto.origen : null,
    teorico: teoricoFoto,
    causaClave: hallazgo.causaClave || null,
    causaEtiqueta: causa ? causa.etiqueta : null,
    via,
    explicacionCitada: hallazgo.explicacionDavidCitada || null,
    fragmentoLiteral: hallazgo.fragmentoLiteral,
    fueraDeAlcance: esFueraDeAlcance,
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
    fueraDeAlcance: esFueraDeAlcance,
  };

  return { fila, paraConfirmar };
}

/** Mapea `resolverHallazgo` sobre un arreglo, conservando el orden --
 * el orden en que el modelo reportó los hallazgos es el orden en que Uriel
 * los narró, y el preview los muestra igual (ningún reordenamiento propio). */
export function resolverHallazgos(
  hallazgos: readonly HallazgoCrudo[],
  alcance: readonly AlcanceItem[],
  fueraDeAlcance: readonly ProductoFueraDeAlcance[] = [],
): HallazgoResuelto[] {
  return hallazgos.map((h) => resolverHallazgo(h, alcance, fueraDeAlcance));
}
