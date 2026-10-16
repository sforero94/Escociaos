// Legacy sale helper remains pending its separate writer review; direct death is fenced.
import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { construirEventoVentaHato, estadoTrasSalida } from '@/utils/hatoSalida';

export interface ResultadoRegistrarSalidaHato {
  ok: boolean;
  error?: string;
}

export function useRegistrarSalidaHato() {
  const { user } = useAuth();
  const [guardando, setGuardando] = useState(false);

  const registrarVenta = useCallback(
    async (
      animalId: string,
      transaccion: { id: string; fecha: string },
    ): Promise<ResultadoRegistrarSalidaHato> => {
      setGuardando(true);
      try {
        // `src/types/database.ts` (generado) no incluye las tablas hato_* --
        // mismo workaround que `useHatoAnimales.ts`/`useActualizarHatoAnimal.ts`.
        const supabase = getSupabase() as any;
        const evento = construirEventoVentaHato(animalId, transaccion.fecha, transaccion.id);

        const { error: eventoError } = await supabase
          .from('hato_eventos')
          .insert({ ...evento, created_by: user?.id ?? null });
        if (eventoError) {
          return {
            ok: false,
            error:
              `La transacción financiera se guardó, pero no se pudo registrar el evento de venta en la ficha del animal: ${eventoError.message}. ` +
              `El animal sigue como "activa" -- inténtalo de nuevo o corrige manualmente desde Editar.`,
          };
        }

        const { error: estadoError } = await supabase
          .from('hato_animales')
          .update({ estado: estadoTrasSalida('venta'), fecha_estado: transaccion.fecha })
          .eq('id', animalId);
        if (estadoError) {
          return {
            ok: false,
            error:
              `La transacción y el evento de venta se guardaron, pero no se pudo marcar el animal como "vendida": ${estadoError.message}. ` +
              `Corrige el estado manualmente desde Editar.`,
          };
        }

        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return { ok: false, error: `Error registrando la venta en la ficha del animal: ${message}` };
      } finally {
        setGuardando(false);
      }
    },
    [user],
  );

  // Prospective death writes require the prepared atomic protocol.
  const registrarMuerte = useCallback(async (): Promise<ResultadoRegistrarSalidaHato> => ({ok:false,error:'Use Registrar muerte con revisión preparada y recuperación del intento original.'}), []);

  return { registrarVenta, registrarMuerte, guardando };
}
