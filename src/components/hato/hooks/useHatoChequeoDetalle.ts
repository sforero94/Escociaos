// ARCHIVO: components/hato/hooks/useHatoChequeoDetalle.ts
// DESCRIPCIÓN: Ruta `/hato-lechero/chequeos/:id` (Figma alignment spec §5).
// Carga la cabecera de UN chequeo (`hato_chequeos`) + todas sus filas
// (`hato_chequeo_vacas`, capa cruda + normalizada -- ver la nota extendida
// en `types/hato.ts`) unidas a `hato_animales` para mostrar número/nombre.
// Solo lectura -- el flujo de carga/aprobación vive en
// `useSubirChequeoExcel.ts` (B0/V10); esta vista es la revisión posterior
// que pidió el dueño ("otherwise it's a useless list").

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { esNumeroProvisional } from '@/utils/importHato/overridesChapeta';
import type { HatoChequeoRow, HatoChequeoVacaRow } from '@/types/hato';

export interface ChequeoVacaDetalle extends HatoChequeoVacaRow {
  numero: number | null;
  nombre: string | null;
  numeroEsProvisional: boolean;
}

export interface HatoChequeoDetalle {
  chequeo: HatoChequeoRow;
  vacas: ChequeoVacaDetalle[];
}

interface FilaChequeoVacaSupabase extends HatoChequeoVacaRow {
  hato_animales: { numero: number | null; nombre: string | null } | { numero: number | null; nombre: string | null }[] | null;
}

export function useHatoChequeoDetalle(chequeoId: string | undefined) {
  const [detalle, setDetalle] = useState<HatoChequeoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!chequeoId) return;
    setLoading(true);
    setError(null);
    try {
      // `src/types/database.ts` (generado) no incluye las tablas hato_* --
      // mismo workaround que el resto del módulo.
      const supabase = getSupabase() as any;

      const [{ data: chequeo, error: chequeoError }, { data: vacas, error: vacasError }] = await Promise.all([
        supabase.from('hato_chequeos').select('*').eq('id', chequeoId).maybeSingle(),
        supabase
          .from('hato_chequeo_vacas')
          .select('*, hato_animales(numero, nombre)')
          .eq('chequeo_id', chequeoId),
      ]);
      if (chequeoError) throw chequeoError;
      if (vacasError) throw vacasError;
      if (!chequeo) throw new Error('No se encontró el chequeo solicitado.');

      const filas: ChequeoVacaDetalle[] = ((vacas ?? []) as FilaChequeoVacaSupabase[])
        .map(({ hato_animales, ...resto }) => {
          const animal = Array.isArray(hato_animales) ? hato_animales[0] : hato_animales;
          return {
            ...resto,
            numero: animal?.numero ?? null,
            nombre: animal?.nombre ?? null,
            numeroEsProvisional: esNumeroProvisional(animal?.numero ?? null),
          };
        })
        // Sin caravana al final, cualquiera sea el orden -- mismo criterio
        // "null al final" que la lista de Animales (§4).
        .sort((a, b) => {
          if (a.numero == null && b.numero == null) return 0;
          if (a.numero == null) return 1;
          if (b.numero == null) return -1;
          return a.numero - b.numero;
        });

      setDetalle({ chequeo: chequeo as HatoChequeoRow, vacas: filas });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando el chequeo');
    } finally {
      setLoading(false);
    }
  }, [chequeoId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { detalle, loading, error, reload };
}
