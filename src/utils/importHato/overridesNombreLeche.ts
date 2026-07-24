// ARCHIVO: utils/importHato/overridesNombreLeche.ts
// DESCRIPCIÓN: Reasignaciones MANUALES de identidad para el backfill de
// pesajes de leche (D7, docs/hato/sesiones-b5-d7-e3.md "Session B"). Mismo
// patrón que `overridesChapeta.ts`, pero para NOMBRE en vez de chapeta: la
// planilla `PROMEDIO DE LECHE DESDE AÑO 2026.xlsx` no trae número de animal,
// solo nombre, así que la única ambigüedad posible es de nombre.
//
// Por qué empieza VACÍO: a diferencia de `overridesChapeta.ts` (que sí tenía
// evidencia -- comparación cruzada contra la planilla de leche, hojas
// observadas, etc. -- para asignar un número de trabajo con confianza), acá
// no hay ninguna señal en el propio archivo que permita saber, sin ambigüedad,
// cuál fila de "VALENCIANA"/"MONZA" pertenece a cuál animal real del hato.
// Eso solo lo sabe alguien que conozca el hato en el corral (Martha/Fernando).
// Hasta que decidan, esas lecturas quedan en la lista de "sin resolver" del
// reporte que emite `scripts/import-hato/backfill-leche.ts` -- NUNCA
// adivinadas.
//
// Cómo usarlo: agregar una entrada por cada nombre ambiguo ya adjudicado
// (opcionalmente `hoja` para limitarlo a un mes específico, si la
// adjudicación no aplica a todos los meses por igual) y volver a correr el
// backfill -- es idempotente sobre `UNIQUE(animal_id, fecha)`.

export interface OverrideNombreLeche {
  /** Nombre tal como aparece en la planilla de leche (se normaliza al comparar). */
  nombre: string;
  /** Si se define, el override SOLO aplica a esa hoja/mes (ej. "MZO 2026").
   * Si se omite, aplica a todas las hojas donde aparezca ese nombre. Un
   * override específico de hoja tiene prioridad sobre uno global del mismo
   * nombre. */
  hoja?: string;
  /** `hato_animales.id` (UUID) al que se le atribuye esta lectura. */
  animalId: string;
  decididoPor: string;
  fecha: string;
  motivo?: string;
}

/**
 * Overrides vigentes -- vacío hasta que Martha adjudique VALENCIANA/MONZA
 * (o cualquier otro nombre que el reporte marque como duplicado/sin match).
 */
export const OVERRIDES_NOMBRE_LECHE: OverrideNombreLeche[] = [];

/** Busca el override que aplica a un nombre (ya normalizado) en una hoja
 * dada. Prioriza un override ESPECÍFICO de esa hoja sobre uno global (sin
 * `hoja`) del mismo nombre. Recibe `normalizar` como parámetro (en vez de
 * importar `normalizarNombreLeche` de `pesajesLeche.ts`) para no crear un
 * ciclo de imports entre los dos módulos -- `pesajesLeche.ts` ya importa
 * este archivo para resolver overrides. */
export function buscarOverrideNombreLeche(
  nombreNormalizado: string,
  hoja: string,
  overrides: OverrideNombreLeche[],
  normalizar: (nombre: string) => string,
): OverrideNombreLeche | null {
  const especifico = overrides.find(
    (o) => o.hoja === hoja && normalizar(o.nombre) === nombreNormalizado,
  );
  if (especifico) return especifico;
  return overrides.find((o) => !o.hoja && normalizar(o.nombre) === nombreNormalizado) ?? null;
}
