// ARCHIVO: components/hato/hooks/useActualizarHatoAnimal.ts
// DESCRIPCIÓN: Escritura in-place de `hato_animales` -- el mecanismo de
// corrección que pidió el dueño para cuando Martha retagea el hato
// (migración 066: `numero` deja de ser identidad permanente y pasa a ser un
// atributo MUTABLE, "chapeta actual"; la identidad sigue siendo
// `hato_animales.id`). Único punto de escritura del diálogo "Editar" de
// HojaDeVida -- no crea animales nuevos, fuera de alcance.
//
// Colisión de caravana: el índice único parcial `hato_animales_numero_activa_unique`
// (066) rechaza un `numero` que ya lleva OTRO animal con `estado='activa'` --
// Postgres devuelve el código 23505 (mismo patrón que
// `configuracion/SublotesConfig.tsx`). Se traduce a un mensaje en español y
// nunca se propaga el error crudo de Postgres a la UI.

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { EtapaHato, EstadoAnimalHato } from '@/types/hato';

/** Subconjunto editable de `hato_animales` desde el diálogo "Editar" de la
 * ficha. Valores ya normalizados (`null`, no `''`) -- la conversión desde el
 * estado de los inputs del formulario vive en el componente del diálogo. */
export interface HatoAnimalEdicion {
  numero: number | null;
  nombre: string | null;
  etapa: EtapaHato;
  estado: EstadoAnimalHato;
  raza: string | null;
  fecha_nacimiento: string | null;
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

export function useActualizarHatoAnimal() {
  const [guardando, setGuardando] = useState(false);

  const actualizar = useCallback(
    async (animalId: string, edicion: HatoAnimalEdicion): Promise<ResultadoActualizarHatoAnimal> => {
      setGuardando(true);
      try {
        // `src/types/database.ts` (generado) no incluye las tablas hato_* --
        // mismo workaround que `useHatoAnimal.ts`/`useHatoAnimales.ts` (`as
        // any` en el punto de entrada, ver nota en CLAUDE.md).
        const supabase = getSupabase() as any;
        const { error } = await supabase
          .from('hato_animales')
          .update({
            numero: edicion.numero,
            nombre: edicion.nombre,
            etapa: edicion.etapa,
            estado: edicion.estado,
            raza: edicion.raza,
            fecha_nacimiento: edicion.fecha_nacimiento,
          })
          .eq('id', animalId);

        if (error) {
          if (error.code === '23505') {
            return {
              ok: false,
              esColisionCaravana: true,
              error: `La caravana ${edicion.numero} ya la lleva otro animal activo.`,
            };
          }
          throw error;
        }

        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Error desconocido actualizando el animal',
        };
      } finally {
        setGuardando(false);
      }
    },
    [],
  );

  return { actualizar, guardando };
}
