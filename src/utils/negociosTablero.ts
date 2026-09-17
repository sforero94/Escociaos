/**
 * Negocios del Tablero General -- etiquetas y rutas compartidas.
 *
 * `NegocioAccion` y sus etiquetas/rutas vivían duplicadas dentro del motor
 * de "Acciones recomendadas" (`src/utils/accionesTipos.ts`,
 * `AccionesRecomendadas.tsx`, `AccionCard.tsx`) -- ese motor se retira
 * completo en el mismo release en que aparece "Novedades" (issue #266,
 * `docs/plan_novedades.md` §7). `PulsoNegocio.tsx`, que NO se retira, ya
 * dependía del mismo tipo, así que este archivo es su hogar estable.
 *
 * `src/utils/accionesTipos.ts` TODAVÍA declara su propia copia de
 * `NegocioAccion` -- se deja intacta a propósito en esta fase: los módulos
 * del motor que aún no se borran (`accionesHechos.ts`, `accionesOrden.ts`,
 * `accionesValidador.ts`, `accionesRecomendadasEstado.ts`,
 * `useAccionesRecomendadas.ts`, `AccionesRecomendadas.tsx`, `AccionCard.tsx`,
 * `useGanadoParaAcciones.ts`) siguen importando la de allá. Cuando ese motor
 * se borre (fase F4 del plan técnico), esos importadores desaparecen con
 * él y esta queda como la única fuente.
 */

/** Los tres negocios operativos que el Tablero muestra por separado. */
export type NegocioAccion = 'hato_lechero' | 'aguacate' | 'ganado';

/** Etiqueta visible por negocio (antes duplicada en `AccionesRecomendadas.tsx`). */
export const NEGOCIO_ETIQUETA: Record<NegocioAccion, string> = {
  hato_lechero: 'Hato Lechero',
  aguacate: 'Aguacate Hass',
  ganado: 'Ganado',
};

/** Etiqueta en minúscula para frases de estado vacío, p. ej. "no se registró
 *  nada en el hato" (antes `ETIQUETA_NEGOCIO_VACIO` en `AccionCard.tsx`). */
export const ETIQUETA_NEGOCIO_VACIO: Record<NegocioAccion, string> = {
  hato_lechero: 'el hato',
  aguacate: 'aguacate',
  ganado: 'ganado',
};

/**
 * Ruta de referencia por negocio (antes `NEGOCIO_RUTA` en
 * `AccionesRecomendadas.tsx`). Aguacate no tiene una pantalla "de inicio"
 * propia (grupo de sidebar sin landing única); Monitoreo es la que más
 * señales trae.
 */
export const NEGOCIO_RUTA: Record<NegocioAccion, string> = {
  hato_lechero: '/hato-lechero',
  aguacate: '/monitoreo',
  ganado: '/ganado',
};
