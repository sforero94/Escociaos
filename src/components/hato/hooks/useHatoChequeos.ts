// ARCHIVO: components/hato/hooks/useHatoChequeos.ts
// DESCRIPCIÓN: Lista de chequeos ya cargados (`hato_chequeos`) para
// `ChequeosList` (S4) -- cabecera + cuántas vacas trae cada uno. Solo
// lectura: el flujo de carga vive en `useSubirChequeoExcel.ts` (B0/V10).

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { HatoChequeoRow } from '@/types/hato';

export interface ChequeoListItem extends HatoChequeoRow {
  totalVacas: number;
}

export function useHatoChequeos() {
  const [chequeos, setChequeos] = useState<ChequeoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Ver la nota de `useHatoAnimales.ts`: `database.ts` (generado) no
      // incluye las tablas hato_*, mismo workaround que
      // `useGanadoInventario.ts` (`as any` en el cliente).
      const supabase = getSupabase() as any;
      const { data, error: err } = await supabase
        .from('hato_chequeos')
        .select('*, hato_chequeo_vacas(count)')
        .order('fecha', { ascending: false });
      if (err) throw err;

      const filas = ((data ?? []) as (HatoChequeoRow & {
        hato_chequeo_vacas: { count: number }[] | { count: number } | null;
      })[]).map((fila) => {
        const conteo = Array.isArray(fila.hato_chequeo_vacas) ? fila.hato_chequeo_vacas[0] : fila.hato_chequeo_vacas;
        const { hato_chequeo_vacas, ...resto } = fila;
        void hato_chequeo_vacas;
        return { ...resto, totalVacas: conteo?.count ?? 0 };
      });

      setChequeos(filas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando los chequeos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { chequeos, loading, error, reload };
}
