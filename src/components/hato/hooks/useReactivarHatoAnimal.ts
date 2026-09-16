// ARCHIVO: components/hato/hooks/useReactivarHatoAnimal.ts
// DESCRIPCIÓN: Escritura ESTRECHA de `hato_animales` para la reactivación
// desde la ventana de revisión del chequeo (plan
// `docs/hato/plan_chequeo_novedades_implementacion.md` §4.6/§4.7/§6.3 --
// motivo `numero_animal_inactivo`, Path A). Escribe EXACTAMENTE tres
// columnas -- `estado`, `fecha_estado`, `notas` -- por `id`.
//
// NO es una extensión de `useActualizarHatoAnimal.ts`: ese hook escribe los
// DIEZ campos editables del diálogo "Editar" a la vez, y usarlo acá
// borraría en silencio cualquier campo que este flujo no cargó (`raza`,
// `etapa`, genealogía...). Un escritor nuevo y estrecho es la forma segura
// de tocar solo lo que este flujo decide.
//
// Por qué se lee la fila FRESCA justo antes de escribir (`numero, nombre,
// estado, fecha_estado, notas`): dos cosas dependen de lo que la fila diga
// EN ESE INSTANTE, no de lo que trajo el diff hace un minuto --
//   1. `construirNotaReactivacion` appendea sobre `notas` (PostgREST no
//      puede expresar `notas = COALESCE(notas,'') || $1`, mismo límite que
//      documenta la nota 4.7 del plan) -- appendear sobre un valor viejo
//      pisaría una edición ajena hecha en el medio.
//   2. El mensaje de colisión de caravana cita el `numero` real del animal.
//
// Colisión de caravana: el índice único parcial
// `hato_animales_numero_activa_unique` (066) rechaza reactivar un animal
// cuyo `numero` ya lo lleva OTRO animal `estado='activa'` -- Postgres
// devuelve 23505, MISMO patrón de traducción que `useActualizarHatoAnimal.ts`.
// `verificarColision` es el PRE-chequeo (explica antes de intentar); el
// `23505` de abajo es la garantía real, nunca se retira aunque el pre-chequeo
// diga que está libre (freshness: pudo cambiar entre el pre-chequeo y el
// guardado).

import { useCallback, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { obtenerFechaHoy } from '@/utils/fechas';
import {
  construirNotaReactivacion,
  detectarColisionCaravana,
  type AnimalActivoParaColision,
} from '@/utils/hato/reactivacionAnimal';

export interface ContextoReactivacionAnimal {
  /** Fecha del chequeo que originó la fila promovida -- `null` si la
   * ventana de revisión todavía no la fijó. */
  fechaChequeo: string | null;
  /** Texto libre opcional escrito por la persona en el diálogo. */
  motivo: string | null;
}

export interface ResultadoReactivarHatoAnimal {
  ok: boolean;
  /** `true` cuando el error es la colisión de caravana de la migración 066
   * (23505 sobre el índice único parcial) -- el caller debe dejar el
   * diálogo abierto para que la persona reasigne la caravana en la fila
   * (Path B), en vez de un error genérico. */
  esColisionCaravana?: boolean;
  error?: string;
  /** `numero` real leído justo antes de escribir -- solo presente cuando
   * `esColisionCaravana` es `true`, para que el mensaje de la UI cite la
   * caravana correcta sin volver a consultarla. */
  numero?: number | null;
}

export function useReactivarHatoAnimal() {
  const [guardando, setGuardando] = useState(false);
  const [verificandoColision, setVerificandoColision] = useState(false);

  /**
   * Pre-chequeo cliente de la colisión de caravana (§4.6 "Caravana
   * colisión"): busca, contra la base FRESCA, si algún animal `activa`
   * distinto de `excluyendoId` ya lleva `numero`. `null` significa "no se
   * pudo verificar" (nunca se bloquea el intento solo por eso -- el 23505
   * de `reactivar` sigue siendo la guarda real) o "no hay colisión"; el
   * caller distingue por el `error` que devuelve en el primer caso.
   */
  const verificarColision = useCallback(
    async (numero: number, excluyendoId: string): Promise<{ id: string; nombre: string | null } | null> => {
      setVerificandoColision(true);
      try {
        // `src/types/database.ts` (generado) no incluye las tablas hato_* --
        // mismo `as any` que el resto de los hooks del módulo.
        const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const { data, error } = await supabase
          .from('hato_animales')
          .select('id, numero, nombre')
          .eq('estado', 'activa')
          .eq('numero', numero);
        if (error) throw error;
        const activos = (data ?? []) as AnimalActivoParaColision[];
        return detectarColisionCaravana(numero, activos, excluyendoId);
      } catch {
        // Sin poder verificar, no se bloquea el intento en el cliente: el
        // 23505 del servidor sigue siendo la garantía real.
        return null;
      } finally {
        setVerificandoColision(false);
      }
    },
    [],
  );

  const reactivar = useCallback(
    async (animalId: string, contexto: ContextoReactivacionAnimal): Promise<ResultadoReactivarHatoAnimal> => {
      setGuardando(true);
      try {
        const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

        // Freshness read (§4.7): lo que se appendea a `notas` y lo que cita
        // el mensaje de colisión tienen que ser el estado REAL de la fila en
        // este instante, no el que trajo el diff hace un minuto.
        const { data: actual, error: errorLectura } = await supabase
          .from('hato_animales')
          .select('numero, nombre, estado, fecha_estado, notas')
          .eq('id', animalId)
          .single();
        if (errorLectura) throw errorLectura;

        const fechaHoy = obtenerFechaHoy();
        const notasNuevas = construirNotaReactivacion({
          notasPrevias: actual.notas,
          estadoAnterior: actual.estado,
          fechaEstadoAnterior: actual.fecha_estado,
          fechaHoy,
          fechaChequeo: contexto.fechaChequeo,
          motivo: contexto.motivo,
        });

        const { error } = await supabase
          .from('hato_animales')
          .update({ estado: 'activa', fecha_estado: fechaHoy, notas: notasNuevas })
          .eq('id', animalId);

        if (error) {
          if (error.code === '23505') {
            return {
              ok: false,
              esColisionCaravana: true,
              numero: actual.numero,
              error: `La caravana ${actual.numero} ya la lleva otro animal activo -- reasigna primero (corrige el número de la fila).`,
            };
          }
          throw error;
        }

        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Error desconocido reactivando el animal',
        };
      } finally {
        setGuardando(false);
      }
    },
    [],
  );

  return { reactivar, verificarColision, guardando, verificandoColision };
}
