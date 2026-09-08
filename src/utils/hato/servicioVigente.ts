// ARCHIVO: utils/hato/servicioVigente.ts
// DESCRIPCIÓN: ¿el último servicio registrado sigue ABIERTO, o ya lo cerró un
// parto/aborto posterior? Regla pedida por el dueño el 2026-09-08 tras ver la
// planilla que Martha alistó para su primer chequeo en la app: ella TACHÓ a
// mano la `Fecha Servicio` de seis vacas, todas vacías, porque la celda traía
// una fecha de 2025.
//
// EL DATO NO ESTABA MAL: `v_hato_estado_actual.ultimo_servicio_fecha` es
// `MAX(fecha)` sobre los eventos `servicio`, así que para una vaca ya parida
// devuelve, correctamente, el servicio que produjo esa cría. Lo que fallaba
// era la PREGUNTA que la celda contesta. En el corral esa columna significa
// "el servicio abierto de esta vaca", y para una vaca vacía la respuesta es
// que no hay ninguno. Costaba dos cosas a la vez:
//   1. La fila se contradecía sola -- `Estado registrado` decía `Vacía (4)` y
//      al lado aparecía una fecha de servicio.
//   2. Ocupaba la casilla donde Martha necesita ESCRIBIR el servicio nuevo, si
//      ocurrió entre chequeos y no entró por Telegram ni por la web.
//
// Un parto y un aborto son los dos hechos que CIERRAN un ciclo reproductivo.
// Un secado no: la vaca sigue preñada del mismo servicio. Por eso el cierre se
// calcula solo sobre esos dos.
//
// Este módulo es PURO y deliberadamente NO vive en `calculosHato.ts`: ese
// archivo se espeja byte a byte a los dos árboles de edge function
// (`calculosHato Paridad`), y ningún camino de servidor necesita esta regla --
// la consume solo la planilla, en el navegador. Mismo criterio con el que
// `hatoCategorias.ts` y `hatoCicloManual.ts` quedaron fuera de ese trío.
//
// El motor YA es coherente con esta regla en lo que deriva: con un servicio
// cerrado, `derivarEstadoReproductivo` clasifica `parida_reciente` y devuelve
// `fecha_secar`/`fecha_probable_parto` en `null` -- que es exactamente por qué
// esas dos columnas ya salían vacías en las filas que Martha tachó. Lo único
// que se saltaba la regla eran las columnas que se imprimen crudas desde la
// vista: `Fecha Servicio`, `Toro` y el tipo de servicio.

import type { TipoServicioHato } from '@/types/hato';

/** Fechas ISO `AAAA-MM-DD`; se comparan como texto (orden lexicográfico =
 * orden cronológico en ese formato), igual que el resto del módulo. */
export interface EntradaServicioVigente {
  ultimoServicioFecha: string | null;
  /** `hato_eventos` tipo `parto` más reciente. Cierra el ciclo. */
  ultimoPartoFecha: string | null;
  /** `hato_eventos` tipo `aborto` más reciente (columna de la vista desde la
   * migración 094). También cierra el ciclo: la vaca queda vacía. */
  ultimoAbortoFecha: string | null;
}

/**
 * Fecha del hecho que cerró el último ciclo reproductivo -- el más reciente
 * entre parto y aborto. `null` = no hay ninguno registrado.
 */
export function fechaCierreCicloReproductivo(entrada: EntradaServicioVigente): string | null {
  const { ultimoPartoFecha, ultimoAbortoFecha } = entrada;
  if (!ultimoPartoFecha) return ultimoAbortoFecha;
  if (!ultimoAbortoFecha) return ultimoPartoFecha;
  return ultimoPartoFecha > ultimoAbortoFecha ? ultimoPartoFecha : ultimoAbortoFecha;
}

/**
 * `true` solo cuando el último servicio sigue abierto. Tres decisiones del
 * dueño (2026-09-08) están acá dentro, y las tres son deliberadas:
 *
 * - **Sin servicio registrado -> `false`.** No hay nada que imprimir.
 * - **Servicio el MISMO día que el cierre -> `false`** (la comparación es `>`
 *   estricta). Un servicio el mismo día del parto no es una monta posparto.
 *   Coincide con el desempate del motor (`PRIORIDAD_EMPATE_CICLO`,
 *   `calculosHato.ts`), donde el parto le gana al servicio a igualdad de
 *   fecha.
 * - **Sin parto NI aborto registrado -> `false`.** Es la única regla que
 *   descarta un dato que podría ser válido, y el dueño la eligió a sabiendas:
 *   una vaca comprada puede traer un servicio suelto sin la historia que lo
 *   cierra, y prefiere la casilla vacía para que el primer registro entre
 *   completo -- a mano en el chequeo o por Telegram -- y se pueda retro-cargar
 *   lo que haya pasado fuera del hato. Nada se pierde: el evento sigue en
 *   `hato_eventos` y `Estado registrado` sigue mostrando el estado derivado.
 *   Al 2026-09-08 este caso son **0 de las 65 vacas activas** en producción,
 *   así que la regla es preventiva, no retroactiva.
 */
export function esServicioVigente(entrada: EntradaServicioVigente): boolean {
  const { ultimoServicioFecha } = entrada;
  if (!ultimoServicioFecha) return false;
  const cierre = fechaCierreCicloReproductivo(entrada);
  if (!cierre) return false;
  return ultimoServicioFecha > cierre;
}

/** Las tres celdas que describen el servicio en la planilla. Viajan JUNTAS
 * porque describen un mismo hecho: un toro impreso sin su fecha reintroduce
 * la misma contradicción que esta regla vino a quitar (decisión del dueño:
 * "blanks out with the field"). */
export interface CeldasServicioPlanilla {
  fechaServicio: string | null;
  toroNombre: string | null;
  tipoServicio: TipoServicioHato | null;
}

/**
 * Devuelve las tres celdas tal cual si el servicio sigue abierto, o las tres
 * en `null` si un parto/aborto ya lo cerró. Nunca devuelve una mezcla.
 *
 * La celda queda VACÍA, no con un texto de relleno: es una columna que se
 * diligencia (`COLUMNAS_A_DILIGENCIAR`, fondo blanco y borde marcado), así que
 * el blanco es la señal de "escriba acá". Si Martha anota un servicio nuevo,
 * el camino de subida lo trata como un evento nuevo -- `descomponerSX` filtra
 * contra `fechasServicioConocidas`, de modo que una fecha ya registrada no
 * duplica el evento y una fecha nueva sí lo crea.
 */
export function celdasServicioParaPlanilla(
  entrada: EntradaServicioVigente & { toroNombre: string | null; tipoServicio: TipoServicioHato | null },
): CeldasServicioPlanilla {
  if (!esServicioVigente(entrada)) {
    return { fechaServicio: null, toroNombre: null, tipoServicio: null };
  }
  return {
    fechaServicio: entrada.ultimoServicioFecha,
    toroNombre: entrada.toroNombre,
    tipoServicio: entrada.tipoServicio,
  };
}
