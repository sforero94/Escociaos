// ARCHIVO: components/hato/hooks/useHatoAlertasConfig.ts
// DESCRIPCIÓN: Lee/escribe `hato_alertas_config` (migración 056) para la
// pestaña Tipos del gestor (issue #217). El tick ya respeta `activo` y
// `horas_escalamiento`. `destinatario_telegram_id` es vestigial desde 096
// y este hook no lo toca.

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { validarHorasEscalamiento } from '@/utils/hatoAlertasGestor';
import type { TipoAlertaHato } from '@/utils/hatoAlertasUi';

export interface HatoAlertaConfigRow {
  id: string;
  tipo: TipoAlertaHato;
  horas_escalamiento: number;
  activo: boolean;
}

export function useHatoAlertasConfig() {
  const [filas, setFilas] = useState<HatoAlertaConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase() as any;
      const { data, error: queryError } = await supabase
        .from('hato_alertas_config')
        .select('id, tipo, horas_escalamiento, activo')
        .order('tipo', { ascending: true });
      if (queryError) throw queryError;
      setFilas((data ?? []) as HatoAlertaConfigRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando la configuración de alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const actualizarConfig = useCallback(
    async (tipo: TipoAlertaHato, cambios: { activo?: boolean; horas_escalamiento?: number }) => {
      if (cambios.horas_escalamiento !== undefined) {
        const errorHoras = validarHorasEscalamiento(cambios.horas_escalamiento);
        if (errorHoras) throw new Error(errorHoras);
      }
      const supabase = getSupabase() as any;
      const { error: updateError } = await supabase
        .from('hato_alertas_config')
        .update(cambios)
        .eq('tipo', tipo);
      if (updateError) throw updateError;
      await reload();
    },
    [reload],
  );

  return { filas, loading, error, reload, actualizarConfig };
}
