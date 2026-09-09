// ARCHIVO: components/hato/hooks/useRegistrarTratamientoHato.ts
// DESCRIPCIÓN: Escritura de un tratamiento veterinario desde la Hoja de
// Vida (card "Tratamientos"). Llama al RPC `fn_hato_registrar_tratamiento`
// (migración 138), NUNCA dos `.insert()` sueltos: el tratamiento y su paso
// de seguimiento son dos filas en dos tablas y tienen que quedar juntas, o
// el usuario ve el tratamiento guardado y el recordatorio no existe.
//
// `created_by` viaja explícito, igual que en `useMarcarCicloHato`:
// `hato_tratamientos` no tiene trigger de atribución (ninguna de
// 040/050/063/074 lo cubre).
//
// `getSupabase() as any`: `src/types/database.ts` (generado) no incluye las
// tablas hato_* -- mismo workaround que el resto del módulo.

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface InputRegistrarTratamiento {
  animalId: string;
  /** Qué se aplicó. Texto libre -- el catálogo `hato_protocolos` sigue vacío. */
  nombre: string;
  fechaInicio: string;
  /** Todo lo demás (dosis, quién aplicó, retiro de leche) en texto libre,
   * mientras se aprende qué se repite lo bastante como para ser columna. */
  nota: string | null;
  /** Opcional. Enciende la alerta `tratamiento_paso` del motor (056/S6). */
  fechaProximoPaso: string | null;
  descripcionPaso: string | null;
}

export interface ResultadoRegistrarTratamiento {
  ok: boolean;
  error?: string;
}

export function useRegistrarTratamientoHato() {
  const { user } = useAuth();
  const [guardando, setGuardando] = useState(false);

  const registrar = useCallback(
    async (input: InputRegistrarTratamiento): Promise<ResultadoRegistrarTratamiento> => {
      setGuardando(true);
      try {
        const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.rpc('fn_hato_registrar_tratamiento', {
          p_animal_id: input.animalId,
          p_nombre: input.nombre,
          p_fecha_inicio: input.fechaInicio,
          p_nota: input.nota,
          p_fecha_proximo_paso: input.fechaProximoPaso,
          p_descripcion_paso: input.descripcionPaso,
          p_fuente: 'web',
          p_created_by: user?.id ?? null,
        });
        if (error) throw error;
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Error desconocido registrando el tratamiento',
        };
      } finally {
        setGuardando(false);
      }
    },
    [user],
  );

  return { registrar, guardando };
}
