// Legacy direct reactivation refuses before mutation; read-only collision helper retained.
import { useCallback, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import {
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
  const guardando = false;
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

  const reactivar = useCallback(async (): Promise<ResultadoReactivarHatoAnimal> => ({ok:false,error:'Use Reactivar con revisión preparada y recuperación del intento original.'}), []);

  return { reactivar, verificarColision, guardando, verificandoColision };
}
