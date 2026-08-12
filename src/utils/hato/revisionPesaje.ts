// ARCHIVO: utils/hato/revisionPesaje.ts
// DESCRIPCIÓN: Lógica pura de la grilla de revisión post-OCR del pesaje
// mensual (`RevisionPesajeFoto.tsx`). Nace del ajuste del dueño (2026-08-11,
// tercera ronda): "en el diálogo de confirmación de datos post OCR se deben
// poder agregar o remover vacas, además de poder editar las celdas".
//
// EL CASO REAL QUE LO MOTIVA. En una carga, MONZA estaba en la foto pero no
// quedó registrada; hubo que cargarla a mano después. El sistema SÍ lo había
// detectado -- `procesarLecturaOcrPesaje` ya calcula `vacasSinLeer` (roster
// menos lo que volvió del modelo) y el diálogo lo mostraba como "No
// aparecieron en ninguna foto". Lo que faltaba no era la detección sino
// PODER ACTUAR: esa lista era de solo lectura.
//
// De ahí la forma de este módulo. La grilla deja de derivarse del diff del
// OCR y pasa a tener su propio conjunto de filas, que arranca en el diff pero
// se puede editar. Y el "roster completo" no necesita una consulta nueva:
//
//     roster completo = filas del diff  ∪  vacasSinLeer
//
// porque `vacasSinLeer` se define exactamente como el complemento. Así, las
// vacas disponibles para agregar son siempre "el roster menos lo que ya está
// en la grilla", y quitar una la devuelve a esa lista -- sin estado paralelo
// que se pueda desincronizar.
//
// El universo de "agregar" queda acotado al roster a propósito (decisión del
// dueño en la misma ronda): `hato-pesaje-commit.ts` revalida cada celda
// contra `esCandidataRosterPesaje`, así que ofrecer un animal de fuera sería
// ofrecer algo que el servidor va a rechazar después de que el usuario creyó
// haberlo guardado.
//
// Puro, sin I/O.

import { ordenarPorValor } from '@/utils/ordenarAnimalesHato';
import { SEMANAS_PESAJE, type CeldaDiffPesaje, type SemanaPesaje } from '@/utils/importHato/ocrPesaje';

/** Una fila de la grilla: la vaca y nada más. Los litros viven aparte, en el
 * mapa de valores editables, indexados por `claveCeldaPesaje`. */
export interface FilaRevisionPesaje {
  animalId: string;
  nombre: string;
}

/** Lo que la grilla necesita saber de una celda editable. Se declara acá,
 * junto a la lógica que la consume, y `RevisionPesajeFoto.tsx` lo reexporta
 * para no romper a sus consumidores. */
export interface CeldaEditablePesaje {
  litrosAm: number | undefined;
  litrosPm: number | undefined;
  noConfiable: boolean;
}

/** Celda lista para `POST /hato/pesaje/commit`. Coincide estructuralmente
 * con `CeldaParaCommit` (`useSubirPesajeFoto.ts`), que es quien define el
 * contrato de red. */
export interface CeldaCommitPesajeUI {
  animalId: string;
  fecha: string;
  litrosAm: number | null;
  litrosPm: number | null;
}

/** Clave estable de una celda (vaca, semana). */
export function claveCeldaPesaje(animalId: string, semana: SemanaPesaje): string {
  return `${animalId}|${semana}`;
}

/** Deduplica por `animalId` conservando el primer nombre visto, y ordena
 * alfabéticamente -- mismo orden que la planilla impresa (`ordenarPorValor`,
 * nunca un segundo comparador). */
function ordenarFilas(filas: readonly FilaRevisionPesaje[]): FilaRevisionPesaje[] {
  const unicas = new Map<string, FilaRevisionPesaje>();
  for (const fila of filas) if (!unicas.has(fila.animalId)) unicas.set(fila.animalId, fila);
  return ordenarPorValor([...unicas.values()], (f) => f.nombre, 'asc');
}

/** Filas con las que arranca la grilla: las vacas que el OCR sí ancló. */
export function filasInicialesRevision(diff: readonly CeldaDiffPesaje[]): FilaRevisionPesaje[] {
  return ordenarFilas(diff.map((c) => ({ animalId: c.animalId, nombre: c.nombre })));
}

/**
 * El roster impreso, reconstruido sin consultar nada: lo que el OCR leyó más
 * lo que el propio servidor reportó como no leído. Es el universo del que se
 * puede agregar una fila, y coincide con lo que el commit va a aceptar.
 */
export function rosterCompletoRevision(
  diff: readonly CeldaDiffPesaje[],
  vacasSinLeer: readonly FilaRevisionPesaje[],
): FilaRevisionPesaje[] {
  return ordenarFilas([...diff.map((c) => ({ animalId: c.animalId, nombre: c.nombre })), ...vacasSinLeer]);
}

/** Las del roster que no están en la grilla -- lo que ofrece "Agregar vaca".
 * Que MONZA aparezca acá es, por sí solo, el aviso de que el OCR la saltó. */
export function vacasDisponiblesParaAgregar(
  rosterCompleto: readonly FilaRevisionPesaje[],
  filasEnGrilla: readonly FilaRevisionPesaje[],
): FilaRevisionPesaje[] {
  const presentes = new Set(filasEnGrilla.map((f) => f.animalId));
  return rosterCompleto.filter((f) => !presentes.has(f.animalId));
}

/** Agrega una vaca a la grilla. Idempotente: agregar dos veces la misma no
 * la duplica (el botón puede llegar a dispararse dos veces en un móvil). */
export function agregarFilaRevision(
  filas: readonly FilaRevisionPesaje[],
  vaca: FilaRevisionPesaje,
): FilaRevisionPesaje[] {
  return ordenarFilas([...filas, vaca]);
}

/**
 * Quita una vaca de la grilla Y BORRA SUS VALORES. Las dos cosas juntas, en
 * una sola función, porque separarlas deja el peor bug posible de este
 * diálogo: una fila que ya no se ve en pantalla pero cuyos litros siguen
 * viajando en el commit. Volver a agregarla después arranca en blanco, que es
 * lo que el usuario espera de un "quitar".
 */
export function quitarFilaRevision(
  filas: readonly FilaRevisionPesaje[],
  valores: ReadonlyMap<string, CeldaEditablePesaje>,
  animalId: string,
): { filas: FilaRevisionPesaje[]; valores: Map<string, CeldaEditablePesaje> } {
  const valoresRestantes = new Map(valores);
  for (const semana of SEMANAS_PESAJE) valoresRestantes.delete(claveCeldaPesaje(animalId, semana));
  return {
    filas: filas.filter((f) => f.animalId !== animalId),
    valores: valoresRestantes,
  };
}

/**
 * Arma el payload del commit a partir de LA GRILLA, no del diff del OCR --
 * ese es todo el punto del ajuste: una fila agregada a mano no existe en el
 * diff, y una quitada sigue existiendo ahí.
 *
 * Solo entran las semanas con una fecha real ese mes (un mes de 4 miércoles
 * nunca escribe una 5ª semana) y solo las celdas con algún litro: una celda
 * en blanco es "no se pesó", nunca un 0 -- misma regla D del módulo que
 * respeta el resto del flujo.
 */
export function celdasParaCommitDesdeGrilla(
  filas: readonly FilaRevisionPesaje[],
  valores: ReadonlyMap<string, CeldaEditablePesaje>,
  fechasPorSemana: Readonly<Record<SemanaPesaje, string | null>>,
): CeldaCommitPesajeUI[] {
  const salida: CeldaCommitPesajeUI[] = [];
  for (const fila of filas) {
    for (const semana of SEMANAS_PESAJE) {
      const fecha = fechasPorSemana[semana];
      if (!fecha) continue;
      const valor = valores.get(claveCeldaPesaje(fila.animalId, semana));
      const litrosAm = valor?.litrosAm ?? null;
      const litrosPm = valor?.litrosPm ?? null;
      if (litrosAm === null && litrosPm === null) continue;
      salida.push({ animalId: fila.animalId, fecha, litrosAm, litrosPm });
    }
  }
  return salida;
}
