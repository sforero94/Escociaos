// ARCHIVO: utils/rondaInventario/resolucion.ts
// DESCRIPCIÓN: Fase 4 (Telegram, David y Santiago) de
// docs/brief_tecnico_verificacion_inventario.md §7.2/§13 -- mensajes PUROS
// para el cierre del ciclo de una excepción: David confirma/explica y
// captura con respaldo (B-1/B-2), David o Uriel proponen el ajuste (B-5), y
// Santiago aprueba o desestima (B-6) y lo aplica (B-7). Cero I/O: el
// llamador (`bot.ts` / `conversations/excepcionDavid.ts`) lee las filas de
// `rondas_excepciones` (con el `producto:productos(nombre, unidad_medida)`
// embebido) y arma los objetos de entrada de este archivo.
//
// R-15/CA-13: NINGUNA función de acá acepta ni puede mostrar `precio_unitario`
// ni ningún valor monetario -- mismo criterio D-T8 que `preview.ts`: la
// ausencia en el TIPO es la garantía. CA-6/B-4 piden además "el valor de la
// diferencia" para el caso completo que ve Santiago, pero esa cifra depende
// del saneamiento de precios (§11 del brief técnico) y de
// `inventario_parametros.valoracion_publicable`, que gobierna el reporte de
// cierre (Fase 5, todavía sin construir) -- nunca el mensaje de aprobación de
// Telegram. Se deja fuera de este archivo a propósito; ver el reporte de la
// sesión que agregó Fase 4.
//
// Formato colombiano LOCAL, no importado de `@/utils/format` -- mismo motivo
// que `preview.ts`/`alcanceTxt.ts`/`reporteCierre.ts`: este módulo se espeja
// a los dos árboles de edge function
// (docs/inventario/regenerar-copias-ronda-inventario.py) y no puede cruzar la
// frontera de `src/utils/`.

import { causaPorIndice, indiceDeCausa } from './causasRaiz';

// ---------------------------------------------------------------------------
// 1. Formato colombiano local
// ---------------------------------------------------------------------------

function formatearCantidadResolucion(valor: number): string {
  const decimales = Number.isInteger(valor) ? 0 : 1;
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

function sufijoUnidad(unidad: string | null): string {
  return unidad ? ` ${unidad}` : '';
}

// ---------------------------------------------------------------------------
// 2. Delta -- físico (lo que Uriel contó, congelado) menos teórico (la foto
//    del sistema al abrir la ronda, congelada también, R-5). MISMA fórmula
//    que `fn_ronda_proponer_ajuste`/`fn_ronda_aplicar_ajuste` (migración
//    126, R-4): "delta := excepcion.cantidad_fisica - excepcion.teorico_conteo".
//    Un solo lugar que la calcula -- nadie más la repite inline.
// ---------------------------------------------------------------------------

export function calcularDelta(fisico: number, teorico: number): number {
  return fisico - teorico;
}

/** "faltan 10" / "sobran 3" / "coincide" -- nunca un signo matemático pelado:
 * es el vocabulario que Uriel/David/Santiago ya usan hablando de la ronda. */
function fraseDelta(delta: number): string {
  if (delta === 0) return 'coincide';
  const magnitud = formatearCantidadResolucion(Math.abs(delta));
  return delta > 0 ? `sobran ${magnitud}` : `faltan ${magnitud}`;
}

// ---------------------------------------------------------------------------
// 3. David -- lista de pendientes (/explicar) y el caso completo que abre la
//    conversación `excepcionDavid` (paso 1, antes de pedir la cita/explicación).
// ---------------------------------------------------------------------------

export interface CasoExcepcion {
  productoNombre: string;
  unidad: string | null;
  fisico: number;
  teorico: number;
  observacionUriel: string | null;
}

/** Resumen de una línea -- lo que ve David en la lista de `/explicar` junto
 * al botón que entra a la conversación para ESA excepción puntual. */
export function renderLineaPendienteDavid(caso: CasoExcepcion): string {
  const delta = calcularDelta(caso.fisico, caso.teorico);
  return `${caso.productoNombre} — ${fraseDelta(delta)}`;
}

/** El caso completo -- primer mensaje de la conversación `excepcionDavid`,
 * antes de mostrar la cita de Uriel (si la hay) o de pedir la explicación de
 * cero. */
export function renderCasoDavid(caso: CasoExcepcion): string {
  const delta = calcularDelta(caso.fisico, caso.teorico);
  const lineas = [
    `🔎 ${caso.productoNombre}`,
    `Teórico: ${formatearCantidadResolucion(caso.teorico)}${sufijoUnidad(caso.unidad)}`,
    `Físico reportado: ${formatearCantidadResolucion(caso.fisico)}${sufijoUnidad(caso.unidad)}`,
    `Diferencia: ${formatearCantidadResolucion(delta)}${sufijoUnidad(caso.unidad)} (${fraseDelta(delta)})`,
  ];
  if (caso.observacionUriel) lineas.push(`Observación de Uriel: ${caso.observacionUriel}`);
  return lineas.join('\n');
}

/** La cita del audio de Uriel sobre lo que David habría dicho (CA-38) --
 * SIEMPRE mostrada como cita, nunca como la palabra confirmada de David. */
export function renderCitaDavid(explicacionCitada: string): string {
  return `Uriel citó que dijiste: "${explicacionCitada}"\n\n¿Confirmás esto tal cual, o lo corregís?`;
}

// ---------------------------------------------------------------------------
// 4. Proponer el ajuste (B-5, David o Uriel) -- lista de `/proponer` y el
//    caso completo antes de elegir causa.
// ---------------------------------------------------------------------------

export interface CasoProponer extends CasoExcepcion {
  explicacionDavid: string | null;
  /** Etiqueta de la causa que SUGIRIÓ el intérprete (`causa_sugerida`) --
   * nunca vinculante (D-T8/CA-34): se muestra sólo como pista, quien propone
   * sigue eligiendo la causa del catálogo con un toque. */
  causaSugeridaEtiqueta: string | null;
}

export function renderLineaProponer(caso: CasoProponer): string {
  const delta = calcularDelta(caso.fisico, caso.teorico);
  return `${caso.productoNombre} — ${fraseDelta(delta)}`;
}

export function renderCasoProponer(caso: CasoProponer): string {
  const lineas = [renderCasoDavid(caso)];
  if (caso.explicacionDavid) lineas.push(`Explicación de David: ${caso.explicacionDavid}`);
  if (caso.causaSugeridaEtiqueta) lineas.push(`El sistema sugiere: ${caso.causaSugeridaEtiqueta} (no vinculante -- la causa la eliges tú)`);
  lineas.push('', '¿Cuál es la causa raíz?');
  return lineas.join('\n');
}

// ---------------------------------------------------------------------------
// 5. Aprobación de Santiago (B-6/B-7) -- lista de `/aprobar` y el caso
//    completo con Aprobar/Desestimar (CA-6 menos el valor -- ver cabecera).
// ---------------------------------------------------------------------------

export interface CasoSantiago extends CasoExcepcion {
  explicacionDavid: string | null;
  propuestaCausaEtiqueta: string;
  propuestaNota: string | null;
  /** Nombre legible de quien propuso -- resuelto server-side vía
   * `fn_ronda_actor_nombre` (misma función que usan los RPC de captura y
   * aplicación, migración 126), nunca recalculado acá. */
  propuestoPor: string;
}

export function renderLineaSantiago(caso: CasoSantiago): string {
  const delta = calcularDelta(caso.fisico, caso.teorico);
  return `${caso.productoNombre} — ${fraseDelta(delta)} — causa propuesta: ${caso.propuestaCausaEtiqueta} (${caso.propuestoPor})`;
}

export function renderCasoSantiago(caso: CasoSantiago): string {
  const lineas = [renderCasoDavid(caso)];
  if (caso.explicacionDavid) lineas.push(`Explicación de David: ${caso.explicacionDavid}`);
  lineas.push(`Causa propuesta por ${caso.propuestoPor}: ${caso.propuestaCausaEtiqueta}`);
  if (caso.propuestaNota) lineas.push(`Nota: ${caso.propuestaNota}`);
  return lineas.join('\n');
}

/** 'Aprobar' / 'Desestimar' -- vocabulario único para el texto del mensaje y
 * para el nombre del botón, así los dos no pueden decir cosas distintas. */
export function etiquetaDecision(decision: 'aprobado' | 'desestimado'): string {
  return decision === 'aprobado' ? 'Aprobar' : 'Desestimar';
}

export function renderConfirmacionDecision(
  productoNombre: string,
  decision: 'aprobado' | 'desestimado',
  causaEtiqueta: string,
): string {
  return `Vas a ${etiquetaDecision(decision).toLowerCase()} el ajuste de "${productoNombre}" con causa "${causaEtiqueta}". ¿Confirmás?`;
}

export function renderConfirmacionPropuesta(productoNombre: string, causaEtiqueta: string): string {
  return `Vas a proponer el ajuste de "${productoNombre}" con causa "${causaEtiqueta}". ¿Confirmás?`;
}

// ---------------------------------------------------------------------------
// 6. Índice de causa -- re-exportado de `causasRaiz.ts` bajo los nombres que
//    usa este archivo (D-T2: el catálogo tiene un solo dueño). `bot.ts` los
//    usa para construir/parsear el `callback_data` compacto de §7.2 -- ver la
//    cabecera de `indiceDeCausa`/`causaPorIndice` en `causasRaiz.ts` para el
//    porqué del índice en vez de la clave.
// ---------------------------------------------------------------------------

export { causaPorIndice, indiceDeCausa };
