// ARCHIVO: utils/hato/reactivacionAnimal.ts
// DESCRIPCIÓN: Lógica PURA de la reactivación de un animal desde la ventana
// de revisión del chequeo (plan `docs/hato/plan_chequeo_novedades_implementacion.md`
// §4.6/§6.2 -- motivo `numero_animal_inactivo`, Path A "El animal sigue en el
// hato"). Dos funciones, ninguna toca la base:
//
//   * `construirNotaReactivacion` -- arma el párrafo que se APPENDEA a
//     `hato_animales.notas` (nunca reemplaza lo que ya había). Mismo tono que
//     `153_correccion_chequeo_2026_09_08.sql` §B: `notas || E'\n\nReactivada
//     {fecha}: {detalle} ({fuente}).'` -- este módulo es justo el mecanismo
//     que reemplaza a esa migración manual para el próximo caso.
//   * `detectarColisionCaravana` -- el pre-chequeo cliente de la colisión de
//     caravana (índice único parcial `hato_animales_numero_activa_unique`,
//     migración 066): busca un animal ACTIVO que ya lleve el número que se va
//     a reactivar, excluyendo al propio animal (que la escritura real
//     confirma con el `23505` de Postgres -- este pre-chequeo es la
//     explicación amigable, no la garantía).
//
// Ninguna de las dos llama `new Date()`: la fecha de hoy y la del chequeo
// viajan siempre como parámetro (pureza + testeable con fechas fijas).

/** Escritura mínima aplicable por `useReactivarHatoAnimal`. Se declara acá,
 * junto a la nota que la acompaña, para que la forma del payload y el texto
 * que explica por qué cambió viajen juntos en un solo lugar. */
export interface DatosReactivacionAnimal {
  estado: 'activa';
  fecha_estado: string;
  notas: string;
}

export interface InputNotaReactivacion {
  /** `notas` actual del animal, tal cual viene de la fila fresca leída antes
   * de escribir (freshness read). `null`/`''` -> sin nota previa. */
  notasPrevias: string | null;
  /** `hato_animales.estado` antes de esta reactivación (`descartada` |
   * `vendida` | `muerta` | cualquier otro no-activo -- decisión del dueño
   * 2026-09-15: todos se tratan igual, sin ramas por estado). */
  estadoAnterior: string;
  /** `hato_animales.fecha_estado` antes de esta reactivación. `null` = no se
   * conoce -- la nota lo dice sin inventar una fecha. */
  fechaEstadoAnterior: string | null;
  /** `obtenerFechaHoy()` (local, Bogotá) -- inyectada, nunca calculada acá. */
  fechaHoy: string;
  /** Fecha del chequeo que originó la fila promovida. `null` si todavía no se
   * fijó (la ventana de revisión permite corregir antes de tener fecha) -- la
   * nota se redacta sin "desde el chequeo del..." en ese caso. */
  fechaChequeo: string | null;
  /** Texto libre opcional que escribió la persona en el diálogo. `null`/
   * cadena en blanco -> no se agrega nada. */
  motivo: string | null;
}

/**
 * El párrafo que se appendea a `notas`. Nunca reemplaza lo que ya había --
 * si `notasPrevias` trae contenido, la nota nueva va después de una línea en
 * blanco (mismo separador que la migración 153: `notas || E'\n\n...'`).
 */
export function construirNotaReactivacion(input: InputNotaReactivacion): string {
  const previas = (input.notasPrevias ?? '').trim();

  const antes = input.fechaEstadoAnterior
    ? `antes ${input.estadoAnterior} desde ${input.fechaEstadoAnterior}`
    : `antes ${input.estadoAnterior}`;

  const origen = input.fechaChequeo
    ? `Reactivada ${input.fechaHoy} desde el chequeo del ${input.fechaChequeo}: apareció escrita a mano en la planilla (${antes}).`
    : `Reactivada ${input.fechaHoy}: apareció escrita a mano en un chequeo (${antes}).`;

  const motivo = input.motivo?.trim();
  const notaNueva = motivo ? `${origen} ${motivo}` : origen;

  return previas === '' ? notaNueva : `${previas}\n\n${notaNueva}`;
}

/** Un animal activo, en la forma mínima que hace falta para el cotejo --
 * mismo shape que `AnimalFueraDelRoster`/`candidatosInactivos` sin acoplarse
 * a ese tipo (este módulo no depende de `importHato/`). */
export interface AnimalActivoParaColision {
  id: string;
  numero: number | null;
  nombre: string | null;
}

/**
 * Busca, entre los animales activos ya cargados, uno que lleve el `numero`
 * que se va a reactivar -- excluyendo SIEMPRE al propio animal que se está
 * reactivando (`excluyendoId`). Es el pre-chequeo cliente de
 * `hato_animales_numero_activa_unique` (migración 066): explica el choque
 * ANTES de intentar escribir, pero el `23505` real del servidor sigue siendo
 * la garantía -- ver `useReactivarHatoAnimal.ts`.
 */
export function detectarColisionCaravana(
  numero: number,
  activos: readonly AnimalActivoParaColision[],
  excluyendoId: string,
): { id: string; nombre: string | null } | null {
  if (numero == null) return null;
  const encontrado = activos.find((a) => a.numero === numero && a.id !== excluyendoId);
  return encontrado ? { id: encontrado.id, nombre: encontrado.nombre } : null;
}
