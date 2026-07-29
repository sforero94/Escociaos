// ARCHIVO: components/hato/hooks/usePesajesYPartos.ts
// DESCRIPCIÓN: Fuente compartida de pesajes semanales (`hato_pesajes_leche`)
// y fechas de parto (`hato_eventos` tipo `parto`) que consume el tablero de
// Producción -- SOW 5 de `docs/plan_hato_produccion_rework.md` §4.2/§4.3.
// Arma el shape mínimo que pide el motor puro (`rendimientoPorVaca`,
// `curvaVaca`/`curvaLactanciaHato`, `proyectarHato`, `vejezPesajes` en
// `hatoProduccion.ts`) -- NINGÚN cálculo vive aquí, solo I/O.
//
// `hato_pesajes_leche` crece a ~2.340 filas/año (CLAUDE.md riesgo R-9/R10):
// `fetchAll` paginado, nunca un `.select()` liso, para no truncar en 1.000
// filas en silencio -- la misma trampa que ya mordió a `execPygFlujoCaja`.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { fetchAll } from '@/utils/supabase/fetchAll';
import type { PesajeLecheVaca } from '@/utils/hatoProduccion';

export interface PesajesYPartos {
  pesajes: PesajeLecheVaca[];
  /** `animal_id` -> fecha del ÚLTIMO parto conocido (MAX(fecha) de
   * `hato_eventos` tipo `parto`). Vacas sin ningún parto simplemente no
   * aparecen en el mapa -- `rendimientoPorVaca`/`curvaLactanciaHato` ya
   * saben tratar esa ausencia (decisión 11: siguen visibles, nunca se les
   * imputa una fecha). */
  partos: Map<string, string>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function usePesajesYPartos(): PesajesYPartos {
  const [pesajes, setPesajes] = useState<PesajeLecheVaca[]>([]);
  const [partos, setPartos] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `hato_*` no está en `src/types/database.ts` (generado, anterior a
      // 044) -- mismo workaround que `useHatoAnimales.ts`/`useGanadoInventario.ts`.
      const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

      const [pesajesRes, partosRes] = await Promise.all([
        fetchAll<PesajeLecheVaca>((desde, hasta) =>
          supabase
            .from('hato_pesajes_leche')
            .select('animal_id, fecha, litros_total')
            .order('fecha', { ascending: true })
            .range(desde, hasta),
        ),
        fetchAll<{ animal_id: string; fecha: string }>((desde, hasta) =>
          supabase
            .from('hato_eventos')
            .select('animal_id, fecha')
            .eq('tipo', 'parto')
            .order('fecha', { ascending: true })
            .range(desde, hasta),
        ),
      ]);

      setPesajes(pesajesRes.filas);

      const mapaPartos = new Map<string, string>();
      for (const p of partosRes.filas) {
        const actual = mapaPartos.get(p.animal_id);
        if (!actual || p.fecha > actual) mapaPartos.set(p.animal_id, p.fecha);
      }
      setPartos(mapaPartos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando pesajes/partos del hato');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { pesajes, partos, loading, error, reload };
}
