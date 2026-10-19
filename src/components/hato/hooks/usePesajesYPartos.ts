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

interface FilaPesajeCruda {
  animal_id: string;
  fecha: string;
  litros_total: number | string;
  litros_am: number | string | null;
  litros_pm: number | string | null;
  fuente: string | null;
}

function numero(valor: number | string | null): number | null {
  if (valor == null || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

function pesajeDesdeCruda(fila: FilaPesajeCruda): PesajeLecheVaca | null {
  const litros = numero(fila.litros_total);
  if (litros == null) return null;
  return {
    animal_id: fila.animal_id,
    fecha: fila.fecha,
    litros_total: litros,
    litros_am: numero(fila.litros_am),
    litros_pm: numero(fila.litros_pm),
    fuente: fila.fuente,
  };
}

export interface PesajesYPartos {
  pesajes: PesajeLecheVaca[];
  /** `animal_id` -> fecha del ÚLTIMO parto conocido (MAX(fecha) de
   * `hato_eventos` tipo `parto`). Vacas sin ningún parto simplemente no
   * aparecen en el mapa -- `rendimientoPorVaca`/`curvaLactanciaHato` ya
   * saben tratar esa ausencia (decisión 11: siguen visibles, nunca se les
   * imputa una fecha). */
  partos: Map<string, string>;
  /** `animal_id` -> TODAS sus fechas de parto. Producción v2 necesita el
   * último parto ANTERIOR a un pesaje, no el último de todos. */
  partosPorAnimal: Map<string, string[]>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function usePesajesYPartos(): PesajesYPartos {
  const [pesajes, setPesajes] = useState<PesajeLecheVaca[]>([]);
  const [partos, setPartos] = useState<Map<string, string>>(new Map());
  const [partosPorAnimal, setPartosPorAnimal] = useState<Map<string, string[]>>(new Map());
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
        fetchAll<FilaPesajeCruda>((desde, hasta) =>
          supabase
            .from('hato_pesajes_leche')
            .select('animal_id, fecha, litros_total, litros_am, litros_pm, fuente')
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

      setPesajes(pesajesRes.filas.map(pesajeDesdeCruda).filter((fila): fila is PesajeLecheVaca => fila != null));

      const mapaPartos = new Map<string, string>();
      const todosPartos = new Map<string, string[]>();
      for (const p of partosRes.filas) {
        const actual = mapaPartos.get(p.animal_id);
        if (!actual || p.fecha > actual) mapaPartos.set(p.animal_id, p.fecha);
        const lista = todosPartos.get(p.animal_id);
        if (lista) lista.push(p.fecha);
        else todosPartos.set(p.animal_id, [p.fecha]);
      }
      setPartos(mapaPartos);
      setPartosPorAnimal(todosPartos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando pesajes/partos del hato');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { pesajes, partos, partosPorAnimal, loading, error, reload };
}
