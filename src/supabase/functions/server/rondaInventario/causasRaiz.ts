// ARCHIVO: src/supabase/functions/server/rondaInventario/causasRaiz.ts
// GENERADO por docs/inventario/regenerar-copias-ronda-inventario.py -- NUNCA
// edites este archivo a mano. Editá `src/utils/rondaInventario/causasRaiz.ts` y volvé a correr el script.
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

// ARCHIVO: utils/rondaInventario/causasRaiz.ts
// DESCRIPCIÓN: Catálogo de causa raíz (R-7, docs/plan_verificacion_inventario.md)
// + mapeo causa->vía (§5.3 del brief técnico), como constante TypeScript.
//
// Espejo obligado de la semilla SQL de `inventario_causas_raiz` en
// `src/sql/migrations/125_ronda_inventario_esquema.sql` (§4.2 del brief
// técnico, decisión D-T2). Las SIETE claves, en el MISMO orden, con el MISMO
// mapeo a `via` -- ni una más, ni una menos. La paridad la prueba
// `src/__tests__/rondaInventarioCausasParidad.test.ts`, que lee las filas
// sembradas directamente del archivo de migración (no de una copia a mano)
// y falla si diverge de esta constante.
//
// Por qué esto vive en una tabla de la base Y en una constante de TypeScript
// a la vez, en vez de sólo en la base: el intérprete de notas de voz
// (`interpretarNota.ts`) corre del lado del cliente/edge function y necesita
// resolver `causa_clave -> via` sin una consulta a la base en el camino
// caliente del preview (§5.5 del brief técnico). El RPC de una fase
// posterior (`fn_ronda_confirmar_hallazgos`, Fase 2) vuelve a derivar la vía
// contra la TABLA, nunca confía en lo que mande el cliente -- dos sitios,
// una regla, verificados en paridad.

/** Las tres vías que puede tomar una excepción, derivadas del catálogo de
 * causa raíz -- nunca del modelo (CA-34, D-T8). */
export type ViaExcepcion = 'captura_david' | 'aprobacion_gerencia' | 'ninguna';

export interface CausaRaiz {
  clave: string;
  etiqueta: string;
  via: ViaExcepcion;
  mueveInventario: boolean;
  exigeNota: boolean;
  orden: number;
  /** Reflejo de `inventario_causas_raiz.activo` (siempre `true` en la
   * semilla). El RPC de una fase posterior (`fn_ronda_confirmar_hallazgos`)
   * filtra por esta columna al re-derivar la vía contra la tabla viva
   * (§5.5 del brief técnico: "catalogo.find(c => c.clave === ... && c.activo)");
   * `derivarVia` hace lo mismo acá para que las dos derivaciones puedan
   * comparar en paridad. */
  activo: boolean;
}

/** Semilla EXACTA de la migración 125 (R-7 + tabla de §5.3 del brief de
 * producto). Siete filas, en el mismo orden que el `INSERT` de la migración.
 * "La lista no se cambia a la ligera" (R-7): agregar o quitar una causa acá
 * SIN una migración nueva que sincronice `inventario_causas_raiz` deja el
 * catálogo vivo y el intérprete diciendo cosas distintas. */
export const CAUSAS_RAIZ: readonly CausaRaiz[] = [
  { clave: 'movimiento_no_capturado', etiqueta: 'Movimiento no capturado', via: 'captura_david', mueveInventario: true, exigeNota: false, orden: 1, activo: true },
  { clave: 'consumo_no_registrado', etiqueta: 'Consumo no registrado', via: 'captura_david', mueveInventario: true, exigeNota: false, orden: 2, activo: true },
  { clave: 'error_captura_previa', etiqueta: 'Error de captura previa', via: 'captura_david', mueveInventario: true, exigeNota: false, orden: 3, activo: true },
  { clave: 'perdida_o_dano', etiqueta: 'Pérdida o daño', via: 'aprobacion_gerencia', mueveInventario: true, exigeNota: false, orden: 4, activo: true },
  { clave: 'sustraccion', etiqueta: 'Sustracción', via: 'aprobacion_gerencia', mueveInventario: true, exigeNota: false, orden: 5, activo: true },
  { clave: 'error_de_conteo', etiqueta: 'Error de conteo', via: 'ninguna', mueveInventario: false, exigeNota: false, orden: 6, activo: true },
  { clave: 'otro', etiqueta: 'Otro (con nota)', via: 'aprobacion_gerencia', mueveInventario: true, exigeNota: true, orden: 7, activo: true },
] as const;

/** Las siete claves, en orden -- lo que el test de paridad compara contra la
 * migración. */
export const CLAVES_CAUSA_RAIZ: readonly string[] = CAUSAS_RAIZ.map((c) => c.clave);

const CAUSAS_POR_CLAVE: ReadonlyMap<string, CausaRaiz> = new Map(CAUSAS_RAIZ.map((c) => [c.clave, c]));

/** Busca una causa por clave. `undefined` si la clave no existe en el
 * catálogo -- el llamador (`derivarVia`) trata eso como R-18: cautela, nunca
 * una vía inventada. */
export function buscarCausaRaiz(clave: string): CausaRaiz | undefined {
  return CAUSAS_POR_CLAVE.get(clave);
}
