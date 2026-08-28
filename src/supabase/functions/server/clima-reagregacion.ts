// clima-reagregacion.ts — la única decisión pura del reintento diario de clima
// (migración 121): ¿vale la pena volver a agregar este día, o reagregarlo lo
// dejaría PEOR de como está?
//
// Sin imports de Deno/Supabase (mismo patrón que `ganado-inventario.ts`,
// `cost-aggregation.ts`, `hato-aggregation.ts`) para que sea testeable desde
// Vitest sin cruzar la frontera del árbol de despliegue.
// Guardado por `src/__tests__/climaReintentoNoEmpeora.test.ts`.
//
// ---------------------------------------------------------------------------
// Por qué existe
// ---------------------------------------------------------------------------
// `backfillUnDia` inserta en `clima_lecturas` lo que devuelva la History API de
// Ecowitt y después corre `fn_clima_rollup_diario`, que agrega **sobre esa
// tabla** — la que la migración 036 poda a 24 h. Para un día viejo las lecturas
// originales ya no existen, así que el rollup sólo ve las recién insertadas y
// `lecturas_count` puede BAJAR. No es cosmético: `lecturas_count` es exactamente
// el predicado del umbral de cobertura de la migración 103, así que una
// respuesta parcial de Ecowitt puede empujar a `cobertura_parcial` un día que
// estaba mejor clasificado.
//
// Ocurrió en producción, y no una vez: el 2026-08-27, en la primera corrida del
// cron de la 121, `2026-08-19` pasó de 167 lecturas (valor verificado contra
// producción el 2026-08-21, migración 103) a 105 — en un día que la propia
// corrida reportó como NO resuelto. El 2026-08-28 volvió a hacer lo mismo.
//
// ---------------------------------------------------------------------------
// Por qué la guarda PREVIENE en vez de DETECTAR
// ---------------------------------------------------------------------------
// Una comprobación después del rollup detectaría la regresión pero no podría
// deshacerla: la fila anterior se calculó sobre lecturas que ya fueron podadas,
// así que no hay desde dónde reconstruirla. Por eso esto se consulta ANTES de
// insertar y antes de disparar el rollup.
//
// ---------------------------------------------------------------------------
// Qué SÍ deja pasar, que es el caso para el que el cron existe
// ---------------------------------------------------------------------------
// La estación se quedó sin luz/internet, se reconectó, y Ecowitt subió el búfer
// local del día. Ahí la historia trae MÁS lecturas de las que se capturaron en
// vivo, la guarda no interviene, y el día se recupera igual que antes.
//
// Costo conocido y aceptado: para un día MUY reciente, `lecturas_count` puede
// venir inflado por las lecturas de 5 minutos que todavía viven en la ventana
// de 24 h de `clima_lecturas`; si la historia devuelve menos que ese conteo, el
// día se omite. Se pierde a lo sumo una fusión marginal — nunca una
// recuperación real, que por definición trae más lecturas. El backfill manual
// (`POST /clima/backfill`, el que reparó la historia con la 122) no pasa por
// esta guarda: es una acción humana deliberada.

/**
 * ¿Se puede reagregar este día sin riesgo de empeorar su cobertura?
 *
 * @param lecturasNuevas  Lecturas que la History API de Ecowitt devolvió para el día.
 * @param lecturasPrevias `clima_resumen_diario.lecturas_count` de la fila que ya existe;
 *                        `null`/`undefined` cuando el día todavía no tiene fila.
 * @returns `true` si la cobertura no puede retroceder (o no hay nada que perder).
 */
export function debeReagregarDia(
  lecturasNuevas: number,
  lecturasPrevias: number | null | undefined,
): boolean {
  if (lecturasPrevias == null) return true;
  return lecturasNuevas >= lecturasPrevias;
}
