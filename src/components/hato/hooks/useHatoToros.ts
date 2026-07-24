// ARCHIVO: components/hato/hooks/useHatoToros.ts
// DESCRIPCIÓN: CRUD del catálogo `hato_toros` (G4/V12, S10) -- fuente única
// del toro que alimenta la genealogía (`padre_toro_id`) y los servicios/
// pajillas. La lista se sembró automáticamente desde el histórico (S3), pero
// debe poder editarse desde la UI sin tocar código.
//
// El índice único es `lower(nombre)` (migración 053) -- crear/renombrar un
// toro puede chocar con uno existente. Se detecta el código Postgres 23505 y
// se traduce a un mensaje en español ("ese toro ya existe"), nunca se
// propaga el error crudo -- mismo patrón que `useActualizarHatoAnimal.ts`
// para la colisión de caravana (migración 066).

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { HatoToroRow, TipoServicioHato } from '@/types/hato';

export interface HatoToroEdicion {
  nombre: string;
  tipo: TipoServicioHato | null;
  raza: string | null;
  activo: boolean;
}

export interface ResultadoEscrituraToro {
  ok: boolean;
  esNombreDuplicado?: boolean;
  error?: string;
}

export function useHatoToros() {
  // `hato_toros` no está en `src/types/database.ts` (generado, desactualizado
  // desde antes de la migración 044) -- mismo workaround que el resto del
  // módulo hato.
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const [toros, setToros] = useState<HatoToroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('hato_toros')
        .select('id, nombre, tipo, raza, activo')
        .order('nombre');
      if (fetchError) throw fetchError;
      setToros((data ?? []) as HatoToroRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando el catálogo de toros');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const crearToro = useCallback(
    async (edicion: HatoToroEdicion): Promise<ResultadoEscrituraToro> => {
      setGuardando(true);
      try {
        const { error: insertError } = await supabase.from('hato_toros').insert({
          nombre: edicion.nombre.trim(),
          tipo: edicion.tipo,
          raza: edicion.raza,
          activo: edicion.activo,
        });
        if (insertError) {
          if (insertError.code === '23505') {
            return { ok: false, esNombreDuplicado: true, error: `Ese toro ya existe: "${edicion.nombre.trim()}".` };
          }
          throw insertError;
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido creando el toro' };
      } finally {
        setGuardando(false);
      }
    },
    [supabase],
  );

  const actualizarToro = useCallback(
    async (id: string, edicion: HatoToroEdicion): Promise<ResultadoEscrituraToro> => {
      setGuardando(true);
      try {
        const { error: updateError } = await supabase
          .from('hato_toros')
          .update({
            nombre: edicion.nombre.trim(),
            tipo: edicion.tipo,
            raza: edicion.raza,
            activo: edicion.activo,
          })
          .eq('id', id);
        if (updateError) {
          if (updateError.code === '23505') {
            return { ok: false, esNombreDuplicado: true, error: `Ese toro ya existe: "${edicion.nombre.trim()}".` };
          }
          throw updateError;
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido actualizando el toro' };
      } finally {
        setGuardando(false);
      }
    },
    [supabase],
  );

  return { toros, loading, error, guardando, reload, crearToro, actualizarToro };
}
