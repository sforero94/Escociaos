import { useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import {
  guardarOperacionInventario, leerIntentoInventario, reintentarOperacionInventario,
  type IntentoInventario, type OperacionInventario,
} from '@/utils/guardadoInventario';

export function useGuardadoInventario(usuarioId: string | undefined, operacion: OperacionInventario) {
  const [, refrescar] = useState(0);
  let pendiente = false;
  let errorLocal: string | null = null;
  try {
    pendiente = !!usuarioId && !!leerIntentoInventario(usuarioId, operacion);
  } catch {
    errorLocal = 'No se puede conservar la confirmación del guardado en este navegador. Avisa a Gerencia.';
  }
  const ejecutar = async (datos?: IntentoInventario['datos']) => {
    if (!usuarioId) throw new Error('Vuelve a iniciar sesión antes de guardar.');
    if (errorLocal) throw new Error(errorLocal);
    try {
      return datos
        ? await guardarOperacionInventario(getSupabase(), usuarioId, operacion, datos)
        : await reintentarOperacionInventario(getSupabase(), usuarioId, operacion);
    } finally {
      refrescar(v => v + 1);
    }
  };
  return { pendiente, errorLocal, guardar: (datos: IntentoInventario['datos']) => ejecutar(datos), reintentar: () => ejecutar() };
}
