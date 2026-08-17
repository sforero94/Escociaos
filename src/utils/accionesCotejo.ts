/**
 * El cotejo al pintar (§6 de `docs/brief_tecnico_motor_acciones.md`).
 *
 * Antes de mostrar una acción se comprueba contra datos frescos que el hecho
 * que la sostiene siga siendo cierto. Reutiliza `evaluarSelector` de
 * `accionesHechos.ts` (Fase 1, ya espejado) -- no hay dos implementaciones,
 * hay una función con dos consumidores (el ensamblador Deno y este cotejo
 * del navegador). Este módulo NO se mirroriza a Deno: el cotejo sólo ocurre
 * al pintar, y pintar sólo ocurre en el navegador.
 *
 * Función pura -- sin red, sin Supabase. El único efecto (el `PATCH
 * caducada_at` en modo dispara-y-olvida) vive en el hook
 * `useAccionesRecomendadas`, no aquí.
 */

import type { Hecho } from './accionesTipos';
import { evaluarSelector, type EntradaSelectores, type SelectorId } from './accionesHechos';

export type ResultadoCotejo = 'vigente' | 'caducada' | 'indeterminada';

/**
 * Coteja un único `Hecho` citado por una acción contra `entrada` (lo que el
 * pulso -- bloque 3 -- ya cargó en memoria).
 *
 * `hecho.cotejo.selector` está tipado como `SelectorId = string` (alias
 * abierto) en `accionesTipos.ts`, mientras que `evaluarSelector` exige la
 * unión CERRADA declarada en `accionesHechos.ts`. El `as` de abajo es
 * necesario para que ambos módulos seguros compilen entre sí, pero por eso
 * mismo NO se confía ciegamente en el resultado: si algún día se declara un
 * `Hecho` con un `selector` que `evaluarSelector` no reconoce, su `switch`
 * exhaustivo cae al `default` y devuelve, en tiempo de ejecución, el propio
 * string sin convertir (TypeScript no puede impedirlo -- el chequeo de
 * exhaustividad es sólo de compilación). La guarda `typeof === 'number'` de
 * abajo normaliza cualquier resultado no numérico a `null`, que es
 * exactamente la regla dura del brief: "null nunca invalida la acción".
 */
export function cotejarHecho(hecho: Hecho, entrada: EntradaSelectores): ResultadoCotejo {
  const spec = hecho.cotejo;
  if (spec.tipo === 'sin_cotejo') return 'vigente';

  const crudo = evaluarSelector(spec.selector as SelectorId, entrada);
  const actual = typeof crudo === 'number' ? crudo : null;
  if (actual === null) return 'indeterminada';

  if (spec.tipo === 'existe') return actual > 0 ? 'vigente' : 'caducada';
  // conteo_min
  return actual >= spec.minimo ? 'vigente' : 'caducada';
}

/**
 * Coteja TODOS los hechos citados por una acción (§6.3):
 *  - `caducada` si ALGÚN hecho citado falla su cotejo -- la acción se
 *    sostiene en su evidencia completa, no en la mejor parte.
 *  - `indeterminada` si algún selector devolvió `null` y ninguno falló ⇒
 *    se muestra (no saber no es lo mismo que saber que es falsa).
 *  - `vigente` en cualquier otro caso, incluida la lista vacía (defensivo;
 *    el validador ya exige `hecho_ids.length >= 1`).
 */
export function cotejarAccion(hechos: Hecho[], entrada: EntradaSelectores): ResultadoCotejo {
  let huboIndeterminado = false;
  for (const hecho of hechos) {
    const resultado = cotejarHecho(hecho, entrada);
    if (resultado === 'caducada') return 'caducada';
    if (resultado === 'indeterminada') huboIndeterminado = true;
  }
  return huboIndeterminado ? 'indeterminada' : 'vigente';
}
