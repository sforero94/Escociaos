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
  const guardando=false;

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

  /** Stale creation signature; editing remains its separate existing lane. */
  const crearToro=useCallback(async(edicion:HatoToroEdicion):Promise<ResultadoEscrituraToro>=>{
    void edicion;return {ok:false,error:'Prepare y revise el toro desde el diálogo actual; conserve el intento original.'};
  },[]);

  /** Stale direct edit signature; actual dialog uses prepared original recovery. */
  const actualizarToro=useCallback(async(id:string,edicion:HatoToroEdicion):Promise<ResultadoEscrituraToro>=>{
    void id;void edicion;return {ok:false,error:'Prepare y revise la edición desde el diálogo actual; conserve el intento original.'};
  },[]);

  return { toros, loading, error, guardando, reload, crearToro, actualizarToro };
}
