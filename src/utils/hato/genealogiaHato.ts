// ARCHIVO: utils/hato/genealogiaHato.ts
// DESCRIPCIÓN: Lógica pura de los selectores de madre/padre del diálogo
// "Editar" de la ficha (`EditarAnimalDialog.tsx`). Pedido del dueño
// (2026-08-11): "en el diálogo de edición de la ficha de un animal debo
// poder modificar sus padres también para completar la información que haga
// falta".
//
// POR QUÉ FILTRAR Y NO MOSTRAR LA LISTA COMPLETA. El caso que motivó el
// pedido lo ilustra solo: al asignarle madre a #183 había DOS animales
// llamados MOTA -- la vaca #62 y una ternera #211 nacida en 2026. #183 nació
// en 2024, así que la ternera es imposible; con la lista cruda, elegir mal
// es un clic. `candidatasAMadre` descarta a quien nació DESPUÉS (o el mismo
// día) que el animal, así que esa ambigüedad no llega a la pantalla.
//
// El filtro es deliberadamente conservador: solo descarta lo IMPOSIBLE, no
// lo improbable. No exige edad mínima al parto ni nada parecido, porque
// buena parte del hato tiene `fecha_nacimiento` en null y un filtro más
// estricto escondería a la madre real. Sin fecha en cualquiera de los dos,
// la candidata se muestra -- "sin dato" nunca se trata como "no cumple".
//
// Los animales NO se filtran por `estado`: la madre de un animal vivo puede
// estar vendida o muerta hace años (MOTA #62 está vendida), y esconderla
// haría imposible completar justo la genealogía vieja que falta.
//
// Puro, sin I/O.

import { ordenarPorValor } from '@/utils/ordenarAnimalesHato';

/** Lo mínimo que necesitan los selectores de un animal candidato. */
export interface CandidatoGenealogia {
  id: string;
  numero: number | null;
  nombre: string | null;
  etapa: string;
  fecha_nacimiento: string | null;
}

/** Animal que se está editando -- solo lo que el filtro necesita mirar. */
export interface AnimalEnEdicion {
  id: string;
  fecha_nacimiento: string | null;
}

/**
 * Una madre tiene que haber nacido ANTES que su cría. Con fechas ISO
 * (`AAAA-MM-DD`) la comparación de strings ya es cronológica -- no hace falta
 * construir `Date`, que además arrastraría el bug de UTC documentado en
 * CLAUDE.md.
 *
 * `false` (no descartar) cuando falta cualquiera de las dos fechas: es
 * "no se puede saber", no "no cumple".
 */
function nacioDespuesOIgual(candidata: CandidatoGenealogia, animal: AnimalEnEdicion): boolean {
  if (!candidata.fecha_nacimiento || !animal.fecha_nacimiento) return false;
  return candidata.fecha_nacimiento >= animal.fecha_nacimiento;
}

/**
 * Candidatas a madre, ordenadas por nombre (mismo criterio que el resto del
 * módulo: Martha ubica por nombre, no por número). Descarta:
 *   - al propio animal (nadie es su propia madre),
 *   - los toros (`etapa='toro'`),
 *   - a quien nació después o el mismo día que el animal.
 */
export function candidatasAMadre(
  animales: readonly CandidatoGenealogia[],
  animal: AnimalEnEdicion,
): CandidatoGenealogia[] {
  const posibles = animales.filter(
    (c) => c.id !== animal.id && c.etapa !== 'toro' && !nacioDespuesOIgual(c, animal),
  );
  // `c.nombre` crudo, sin `?? ''`: `ordenarPorValor` manda los `null` al
  // final por contrato, y una vaca sin nombre es la excepción -- no merece
  // encabezar el selector. Coalescer a cadena vacía las pondría de primeras.
  return ordenarPorValor(posibles, (c) => c.nombre, 'asc');
}

/** Etiqueta de un candidato en el selector: nombre primero (es la identidad
 * real, D-1) y la caravana como desempate entre homónimos -- que es
 * exactamente el caso que hace falta resolver (dos MOTA, dos MORA). */
export function etiquetaCandidatoGenealogia(candidato: CandidatoGenealogia): string {
  const nombre = candidato.nombre?.trim() || 'Sin nombre';
  return candidato.numero != null ? `${nombre} · #${candidato.numero}` : `${nombre} · sin caravana`;
}
