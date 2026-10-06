// ARCHIVO: components/configuracion/hooks/useHorarioAlertas.ts
// DESCRIPCIÓN: Lee y cambia la hora de envío de las alertas (migración 175).
// El navegador no puede leer el esquema `cron`, así que todo pasa por las dos
// funciones de la 175, que comprueban que el llamante sea Gerencia.

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import {
  esFuncionHorarioAusente,
  validarHoraAlertas,
  type FilaHorarioAlertas,
  type JobHorarioAlertas,
} from '@/utils/horarioAlertas';

export function useHorarioAlertas() {
  const [filas, setFilas] = useState<FilaHorarioAlertas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinMigracion, setSinMigracion] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `fn_alertas_horario_listar` no está en database.ts todavía.
      const supabase = getSupabase() as any;
      const { data, error: rpcError } = await supabase.rpc('fn_alertas_horario_listar');
      if (rpcError) {
        if (esFuncionHorarioAusente(rpcError)) {
          setSinMigracion(true);
          setFilas([]);
          return;
        }
        throw rpcError;
      }
      setSinMigracion(false);
      setFilas((data ?? []) as FilaHorarioAlertas[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando el horario de las alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const cambiarHora = useCallback(
    async (jobname: JobHorarioAlertas, hora: string) => {
      const errorHora = validarHoraAlertas(hora);
      if (errorHora) throw new Error(errorHora);
      const supabase = getSupabase() as any;
      const { error: rpcError } = await supabase.rpc('fn_alertas_horario_cambiar', {
        p_jobname: jobname,
        p_hora: hora.trim(),
      });
      if (rpcError) throw new Error(rpcError.message ?? 'No se pudo cambiar la hora');
      await reload();
    },
    [reload],
  );

  return { filas, loading, error, sinMigracion, reload, cambiarHora };
}
