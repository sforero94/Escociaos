// ARCHIVO: components/hato/hooks/usePesajesVaca.ts
// DESCRIPCIÓN: Pesajes semanales (`hato_pesajes_leche`) de UNA vaca --
// alimenta `CurvaSemanalProduccion.tsx` en la Hoja de Vida (decisión 9 del
// dueño, plan `docs/plan_hato_produccion_rework.md` §4.4/§6 SOW 5). Un solo
// animal nunca acerca las ~2.340 filas/año del hato completo (riesgo
// R-9/R10 de `usePesajesYPartos.ts`) -- una consulta acotada por
// `animal_id` basta, sin paginación.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { PesajeLecheVaca } from '@/utils/hatoProduccion';

export function usePesajesVaca(animalId: string | undefined) {
  const [pesajes, setPesajes] = useState<PesajeLecheVaca[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!animalId) {
      setPesajes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // `hato_*` no está en `src/types/database.ts` -- mismo workaround que
      // el resto del módulo (`useHatoAnimal.ts` et al.).
      const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const { data, error: err } = await supabase
        .from('hato_pesajes_leche')
        .select('animal_id, fecha, litros_total')
        .eq('animal_id', animalId)
        .order('fecha', { ascending: true });
      if (err) throw err;
      setPesajes((data ?? []) as PesajeLecheVaca[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido cargando pesajes de la vaca');
    } finally {
      setLoading(false);
    }
  }, [animalId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { pesajes, loading, error, reload };
}
