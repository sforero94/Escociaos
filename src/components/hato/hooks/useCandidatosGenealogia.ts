// ARCHIVO: components/hato/hooks/useCandidatosGenealogia.ts
// DESCRIPCIÓN: Carga los candidatos de los selectores de madre/padre del
// diálogo "Editar" de la ficha (pedido del dueño, 2026-08-11). Solo I/O --
// el filtrado y el orden viven en `utils/hato/genealogiaHato.ts`.
//
// DOS CONSULTAS, DOS TABLAS DISTINTAS, porque el padre puede venir de dos
// lados en el esquema (migración 053): `padre_toro_id` -> `hato_toros` (el
// catálogo de toros/pajillas) y `padre_id` -> `hato_animales` (un toro que
// sea animal del propio hato). Este diálogo edita SOLO `padre_toro_id`:
// `hato_animales` no tiene ni un animal con `etapa='toro'` (0 de 179 al
// 2026-08-11), así que el otro selector no tendría de dónde escoger.
// `GenealogiaArbol.tsx` sí sabe mostrar `padre_id` si algún día se puebla
// por otra vía -- lo que no se hace acá es ofrecer un control vacío.
//
// La lista de animales viene SIN filtrar por estado: la madre de un animal
// vivo puede llevar años vendida (MOTA #62), y esconderla haría imposible
// completar la genealogía vieja, que es justo la que falta. 179 filas hoy --
// muy lejos del corte de 1.000 de PostgREST, no necesita paginar.

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { CandidatoGenealogia } from '@/utils/hato/genealogiaHato';
import type { HatoToroRow } from '@/types/hato';

export interface CandidatosGenealogia {
  animales: CandidatoGenealogia[];
  toros: Pick<HatoToroRow, 'id' | 'nombre'>[];
}

export function useCandidatosGenealogia(activo: boolean) {
  // `src/types/database.ts` (generado) no incluye las tablas hato_* -- mismo
  // workaround que el resto del módulo.
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const [candidatos, setCandidatos] = useState<CandidatosGenealogia>({ animales: [], toros: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [animalesRes, torosRes] = await Promise.all([
        supabase.from('hato_animales').select('id, numero, nombre, etapa, fecha_nacimiento'),
        supabase.from('hato_toros').select('id, nombre').eq('activo', true),
      ]);
      if (animalesRes.error) throw animalesRes.error;
      if (torosRes.error) throw torosRes.error;
      setCandidatos({
        animales: (animalesRes.data ?? []) as CandidatoGenealogia[],
        toros: (torosRes.data ?? []) as Pick<HatoToroRow, 'id' | 'nombre'>[],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los candidatos de genealogía');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Se carga solo cuando el diálogo está abierto: son dos consultas que no
  // hacen falta mientras la ficha está en modo lectura.
  useEffect(() => {
    if (activo) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  return { candidatos, loading, error };
}
