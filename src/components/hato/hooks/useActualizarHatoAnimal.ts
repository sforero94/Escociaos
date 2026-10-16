// Compatibility boundary: general animal edits use useAnimalEdit prepared review.
// Stale direct callers fail before accessing Auth, the client or database.

import { useCallback } from 'react';
import type { EtapaHato } from '@/types/hato';

/** Subconjunto editable de `hato_animales` desde el diálogo "Editar" de la
 * ficha. Valores ya normalizados (`null`, no `''`) -- la conversión desde el
 * estado de los inputs del formulario vive en el componente del diálogo. */
export interface HatoAnimalEdicion {
  numero: number | null;
  nombre: string | null;
  etapa: EtapaHato;
  raza: string | null;
  fecha_nacimiento: string | null;
  /** Corrección de precedencia D-13 (migración 092, 2026-08-06): cuando es
   * `true`, `etapa` gana siempre sobre el cálculo por
   * fecha_nacimiento/num_partos. Se fija desde el mismo diálogo -- ver
   * `EditarAnimalDialog.tsx`. */
  etapa_forzada: boolean;
  /** Genealogía editable (pedido del dueño, 2026-08-11) -- completar lo que
   * la importación histórica dejó vacío: 94 de 179 animales no tienen madre.
   * `null` = "no se sabe", que es un valor legítimo y distinto de no haberlo
   * tocado; por eso el diálogo ofrece explícitamente "Sin registrar" y nunca
   * deja una madre puesta sin forma de quitarla. */
  madre_id: string | null;
  /** `hato_toros` (el catálogo), NO `hato_animales`. `padre_id` -- el otro
   * camino del esquema, para un toro que sea animal del propio hato -- no se
   * edita acá: no hay un solo `etapa='toro'` en la tabla. */
  padre_toro_id: string | null;
}

export interface ResultadoActualizarHatoAnimal {
  ok: boolean;
  /** `true` cuando el error es la colisión de caravana de la migración 066
   * (23505 sobre el índice único parcial) -- el caller debe dejar el
   * diálogo abierto para que el usuario corrija el número, a diferencia de
   * un error genérico donde no hay nada específico que corregir. */
  esColisionCaravana?: boolean;
  error?: string;
}

/** Compatible stale caller refuses before any client or mutation. */
export function useActualizarHatoAnimal() {
 const actualizar=useCallback(async(_animalId:string,_edicion:HatoAnimalEdicion):Promise<ResultadoActualizarHatoAnimal>=>({ok:false,error:'Use la edición con revisión preparada y recuperación del intento original.'}),[]);
 return {actualizar,guardando:false};
}
