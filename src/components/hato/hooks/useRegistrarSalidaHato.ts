// ARCHIVO: components/hato/hooks/useRegistrarSalidaHato.ts
// DESCRIPCIÓN: Escritura del flujo venta/muerte de un animal del hato (S9).
// Dos operaciones -- registrar el evento append-only en `hato_eventos` y
// marcar `hato_animales.estado` -- que no viven detrás de una única
// transacción SQL (a diferencia de `fn_hato_commit_chequeo`, no hay RPC
// para esto todavía: el volumen es bajo, "las ventas son infrecuentes,
// no bloquea nada" -- plan §8 S9). Por eso cada paso se reporta por
// separado: si el evento se graba pero el estado no, o viceversa, el
// mensaje de error dice EXACTAMENTE cuál de los dos quedó a medias --
// nunca un error genérico que oculte qué se guardó y qué no.

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { construirEventoVentaHato, construirEventoMuerteHato, estadoTrasSalida } from '@/utils/hatoSalida';

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

  const registrarMuerte = useCallback(
    async (animalId: string, fecha: string, causa?: string): Promise<ResultadoRegistrarSalidaHato> => {
      setGuardando(true);
      try {
        const supabase = getSupabase() as any;
        const evento = construirEventoMuerteHato(animalId, fecha, causa);

        const { error: eventoError } = await supabase
          .from('hato_eventos')
          .insert({ ...evento, created_by: user?.id ?? null });
        if (eventoError) {
          return {
            ok: false,
            error: `No se pudo registrar el evento de muerte: ${eventoError.message}. El animal sigue como "activa".`,
          };
        }

        const { error: estadoError } = await supabase
          .from('hato_animales')
          .update({ estado: estadoTrasSalida('muerte'), fecha_estado: fecha })
          .eq('id', animalId);
        if (estadoError) {
          return {
            ok: false,
            error:
              `El evento de muerte se guardó, pero no se pudo marcar el animal como "muerta": ${estadoError.message}. ` +
              `Corrige el estado manualmente desde Editar.`,
          };
        }

        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return { ok: false, error: `Error registrando la muerte del animal: ${message}` };
      } finally {
        setGuardando(false);
      }
    },
    [user],
  );

  return { registrarVenta, registrarMuerte, guardando };
}
