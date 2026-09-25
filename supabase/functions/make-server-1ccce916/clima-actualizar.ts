// clima-actualizar.ts — la lógica PURA del botón «Actualizar» de la vista de
// Clima (`POST /clima/actualizar`, ESCO-127): qué días de la ventana reciente
// están incompletos, y cómo se llama el desenlace de cada uno después de
// volver a preguntarle a Ecowitt.
//
// Sin imports de Deno/Supabase (mismo patrón que `clima-reagregacion.ts`,
// `ganado-inventario.ts`, `cost-aggregation.ts`) para que sea testeable desde
// Vitest sin cruzar la frontera del árbol de despliegue.
// Guardado por `src/__tests__/climaActualizarDiasIncompletos.test.ts`.
//
// ---------------------------------------------------------------------------
// Por qué existe
// ---------------------------------------------------------------------------
// Después de cada corte de luz o de internet en la estación, los días
// afectados quedan con `cobertura_parcial`, sin horas de sol o sin lluvia por
// evento hasta que alguien pide un backfill EN UNA SESIÓN: `POST
// /clima/backfill` existe desde siempre y **ningún componente de
// `src/components` lo llama**. El único reintento automático es el cron de la
// migración 121 (`clima-reintento-sin-dato`, 06:00 Bogotá), que sólo mira la
// lluvia sin dato confiable y no mira `horas_sol_duracion`,
// `lluvia_mm_evento` ni `cobertura_hueco_max_min`.
//
// Ecowitt sólo entrega resolución de 5 minutos unos 90 días hacia atrás: un
// día que no se repara a tiempo pierde esa resolución para siempre.
//
// ---------------------------------------------------------------------------
// Lo que esta capa NO hace
// ---------------------------------------------------------------------------
// No reclasifica nada. `lluvia_confianza`, `horas_sol_duracion` y
// `cobertura_hueco_max_min` los escribe `fn_clima_rollup_diario` (068/103/115/
// 122/151/158/159) y esa sigue siendo la única lógica que decide. Acá sólo se
// LEE el resultado para decidir a qué días vale la pena volver a preguntarle a
// Ecowitt, y para contar qué pasó.

/** Ventana hacia atrás que revisa cada clic, en días. Siete cubre un fin de
 *  semana largo de corte sin acercarse al tope de la cuota de la History API
 *  (como máximo 7 llamadas a Ecowitt por clic). */
export const DIAS_VENTANA_ACTUALIZAR = 7;

/** Hueco máximo sin medición, en minutos, por encima del cual la migración 159
 *  considera que el día NO está cubierto. **No es un umbral nuevo**: es el
 *  mismo valor que usa `fn_clima_rollup_diario`, repetido acá porque esta capa
 *  no puede leer el cuerpo de la función. Si alguna vez cambia allá, cambia
 *  acá — nunca al revés. */
export const MINUTOS_HUECO_MAX_COBERTURA = 45;

/** La fila de `clima_resumen_diario` que necesita esta decisión. Es un
 *  subconjunto deliberado: las cuatro señales que un backfill puede reparar,
 *  más `lecturas_count`, que es lo que la guarda de no-empeorar compara. */
export interface FilaResumenDia {
  fecha: string;
  lluvia_confianza: string | null;
  lluvia_mm_evento: number | null;
  horas_sol_duracion: number | null;
  cobertura_hueco_max_min: number | null;
  lecturas_count: number | null;
}

export interface DiaCandidato {
  /** `AAAA-MM-DD`. */
  fecha: string;
  /** `clima_resumen_diario.lecturas_count` de la fila que ya existe, o `null`
   *  cuando el día no tiene fila. Viaja con el candidato porque es lo que la
   *  guarda `debeReagregarDia` necesita ver ANTES de reagregar. */
  lecturasPrevias: number | null;
}

/**
 * ¿Este día está incompleto, o sea: vale la pena gastar una llamada a Ecowitt?
 *
 * Los cinco criterios son los del hallazgo ESCO-127, y todos son estados que
 * un backfill PUEDE reparar:
 *
 *  1. No hay fila (el rollup nunca corrió para ese día).
 *  2. `lluvia_confianza = 'cobertura_parcial'` (migración 103/159).
 *  3. `lluvia_mm_evento` en NULL — el día nunca se reconstruyó con las tres
 *     señales de la migración 122, así que no se puede auditar después.
 *  4. `horas_sol_duracion` en NULL — la migración 158 lo anula en los días de
 *     cobertura corta, y la 159 en los truncados.
 *  5. `cobertura_hueco_max_min` por encima del umbral de la migración 159.
 *
 * `contador_congelado` NO entra: es un defecto del firmware del sensor, no un
 * hueco de captura, y Ecowitt devuelve la misma respuesta congelada. El cron
 * de la 121 ya lo reintenta a diario por si acaso; un clic humano no tiene
 * nada mejor que ofrecerle.
 */
export function diaEstaIncompleto(fila: FilaResumenDia | null | undefined): boolean {
  if (fila == null) return true;
  if (fila.lluvia_confianza === 'cobertura_parcial') return true;
  if (fila.lluvia_mm_evento == null) return true;
  if (fila.horas_sol_duracion == null) return true;
  if (fila.cobertura_hueco_max_min != null
      && fila.cobertura_hueco_max_min > MINUTOS_HUECO_MAX_COBERTURA) return true;
  return false;
}

/**
 * Cruza las fechas de la ventana contra las filas que hay en la base y
 * devuelve sólo los días incompletos, de la más vieja a la más nueva.
 *
 * El orden importa: el día más viejo es el que está más cerca de salirse de la
 * ventana de 5 minutos de Ecowitt, así que es el que primero hay que rescatar
 * si la cuota se agota a mitad del recorrido. Mismo criterio que la migración
 * 164 con sus tramos.
 */
export function seleccionarDiasIncompletos(
  fechasVentana: string[],
  filas: FilaResumenDia[],
): DiaCandidato[] {
  const porFecha = new Map(filas.map((f) => [f.fecha, f]));
  return [...fechasVentana]
    .sort()
    .filter((fecha) => diaEstaIncompleto(porFecha.get(fecha)))
    .map((fecha) => ({ fecha, lecturasPrevias: porFecha.get(fecha)?.lecturas_count ?? null }));
}

/**
 * Las fechas de la ventana, de la más vieja a la más nueva.
 *
 * **HOY queda fuera a propósito, y no es un detalle.** El día en curso está
 * incompleto por definición — su rollup corre esta noche — así que incluirlo
 * gastaría una llamada a Ecowitt en cada clic para un día que nadie puede
 * reparar todavía. Peor: `backfillUnDia` BORRA las lecturas ya guardadas en el
 * rango que va a cubrir antes de insertar (dedup de origen, ESCO-65), y como
 * hoy todavía no tiene fila, la guarda de no-empeorar no tiene con qué
 * compararse y deja pasar el reemplazo. Se perderían las lecturas en vivo de
 * hoy a cambio de lo que la History API alcance a tener.
 *
 * @param hoy `AAAA-MM-DD` en hora de Bogotá, no en UTC (ver `hoyBogota` en el
 *            llamador: el edge function corre en UTC y desde las 19:00 locales
 *            ya estaría un día adelante).
 */
export function fechasVentanaActualizar(hoy: string, dias = DIAS_VENTANA_ACTUALIZAR): string[] {
  const base = Date.parse(`${hoy}T00:00:00Z`);
  if (Number.isNaN(base)) throw new Error(`fecha inválida: ${hoy}`);
  const fechas: string[] = [];
  for (let i = dias; i >= 1; i--) {
    fechas.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10));
  }
  return fechas;
}

/** Desenlace de un día, verificado POR FILA — nunca por la respuesta HTTP del
 *  backfill, que dice «la consulta salió bien», no «el día se arregló». */
export type DesenlaceDia = 'recuperado' | 'sin_cambio' | 'sin_datos_ecowitt' | 'error';

export interface ResultadoBackfillPuro {
  ok: boolean;
  /** El día se dejó intacto porque reagregarlo habría bajado su cobertura. */
  omitido?: boolean;
  error?: string;
}

/** Ecowitt contesta bien pero no tiene nada para ese día. `backfillUnDia`
 *  devuelve esos dos textos, y son distintos de un fallo de red o de un
 *  rechazo de PostgREST: no hay nada que reintentar ni nada que reportar como
 *  avería. */
function esFaltaDeDatos(error: string | undefined): boolean {
  if (!error) return false;
  return error.includes('sin datos de Ecowitt') || error.includes('0 lecturas parseadas');
}

/**
 * Cómo quedó un día, comparando la fila ANTES con la fila DESPUÉS.
 *
 * Regla, deliberadamente conservadora: `recuperado` sólo si el día dejó de
 * estar incompleto. Un día que mejoró pero sigue incompleto se reporta
 * `sin_cambio`, porque en la pantalla sigue leyéndose «sin dato» y decirle
 * «recuperado» al usuario sería mentirle sobre lo que va a ver.
 */
export function clasificarDia(
  antes: FilaResumenDia | null | undefined,
  despues: FilaResumenDia | null | undefined,
  backfill: ResultadoBackfillPuro,
): DesenlaceDia {
  if (!backfill.ok) return esFaltaDeDatos(backfill.error) ? 'sin_datos_ecowitt' : 'error';
  if (backfill.omitido) return 'sin_cambio';
  if (diaEstaIncompleto(despues)) return 'sin_cambio';
  // Un día que ya estaba completo no debería haber entrado a la lista; si por
  // una carrera entró, se reporta `sin_cambio` y no un falso «recuperado».
  return diaEstaIncompleto(antes) ? 'recuperado' : 'sin_cambio';
}

export interface ResumenActualizacion {
  revisados: number;
  recuperados: number;
  sinCambio: number;
  sinDatos: number;
  errores: number;
}

/** Conteo por desenlace, para el mensaje que ve el usuario. */
export function resumirActualizacion(
  desenlaces: DesenlaceDia[],
  revisados: number,
): ResumenActualizacion {
  return {
    revisados,
    recuperados: desenlaces.filter((d) => d === 'recuperado').length,
    sinCambio: desenlaces.filter((d) => d === 'sin_cambio').length,
    sinDatos: desenlaces.filter((d) => d === 'sin_datos_ecowitt').length,
    errores: desenlaces.filter((d) => d === 'error').length,
  };
}
