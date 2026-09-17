/**
 * Helper compartido: nombre para mostrar de un animal del hato embebido vía
 * `hato_animales(nombre, numero)` (issue #266). Usado por `hatoEventos.ts` y
 * `hatoTratamientos.ts` -- la misma fórmula, nunca dos respuestas a la misma
 * pregunta ("cómo se nombra un animal en una línea de Novedades").
 *
 * PostgREST puede volver el embed como objeto o como array de 1 según cómo
 * infiera la relación -- mismo defensive-unwrap que `useHatoChequeoDetalle.ts`
 * ya usa para el mismo embed.
 */

export interface AnimalEmbebido {
  nombre: string | null;
  numero: number | null;
}

export function animalDesdeEmbed(
  embed: AnimalEmbebido | AnimalEmbebido[] | null,
): AnimalEmbebido | null {
  if (!embed) return null;
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

export function nombreAnimal(animal: AnimalEmbebido | null): string | null {
  if (!animal) return null;
  const nombre = animal.nombre?.trim() || null;
  if (nombre && animal.numero != null) return `${nombre} (#${animal.numero})`;
  if (nombre) return nombre;
  return animal.numero != null ? `#${animal.numero}` : null;
}
