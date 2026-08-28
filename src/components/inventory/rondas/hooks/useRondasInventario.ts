// ARCHIVO: components/inventory/rondas/hooks/useRondasInventario.ts
// DESCRIPCIÓN: Lista de rondas de inventario (`/inventario/rondas`, C-3 del
// brief de producto). Sólo lectura -- ningún RPC de escritura se llama desde
// este módulo (esa es la Fase 2, en curso en paralelo).
//
// `src/types/database.ts` (generado) no incluye las tablas `rondas_*` --
// mismo hueco que `hato_*`/`gan_*`; se castea `getSupabase() as any` en el
// call site, igual que `useGanadoInventario.ts` y los hooks de
// `src/components/hato/hooks/`.

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { calcularResumenDesenlaces, type ResumenDesenlaces } from '@/utils/rondaInventarioUi';
import type { EstadoExcepcionInventario, RondaInventarioRow } from '@/types/rondaInventario';

export interface RondaListItem {
  ronda: RondaInventarioRow;
  resumen: ResumenDesenlaces;
}

export function useRondasInventario() {
  const [rondas, setRondas] = useState<RondaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase() as any;

      const { data: rondasData, error: rondasError } = await supabase
        .from('rondas_inventario')
        .select('*')
        .order('periodo', { ascending: false });
      if (rondasError) throw rondasError;

      const filas = (rondasData ?? []) as RondaInventarioRow[];
      const rondaIds = filas.map((r) => r.id);

      let excepciones: { ronda_id: string; estado: EstadoExcepcionInventario }[] = [];
      if (rondaIds.length > 0) {
        const { data: excData, error: excError } = await supabase
          .from('rondas_excepciones')
          .select('ronda_id, estado')
          .in('ronda_id', rondaIds);
        if (excError) throw excError;
        excepciones = (excData ?? []) as { ronda_id: string; estado: EstadoExcepcionInventario }[];
      }

      const items: RondaListItem[] = filas.map((ronda) => ({
        ronda,
        resumen: calcularResumenDesenlaces(
          excepciones.filter((e) => e.ronda_id === ronda.id).map((e) => ({ estado: e.estado })),
        ),
      }));

      setRondas(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando las rondas de inventario.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { rondas, loading, error, reload };
}
