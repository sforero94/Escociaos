// ARCHIVO: components/hato/hooks/useHatoTratamientos.ts
// DESCRIPCIÓN: Carga los tratamientos veterinarios de UN animal
// (`hato_tratamientos` + `hato_tratamiento_pasos` + nombre del protocolo,
// migración 055) para la card "Tratamientos" de la Hoja de Vida (Figma
// alignment spec §3). Hook hermano de `useHatoAnimal.ts` -- se mantiene
// aparte a propósito: es una consulta independiente que no participa del
// resto de la ficha, así que su `reload()` no fuerza recargar
// identidad/eventos/genealogía y viceversa.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';

export type EstadoTratamiento = 'activo' | 'completado' | 'cancelado';

export interface HatoTratamientoPasoDetalle {
  id: string;
  paso_num: number;
  descripcion: string | null;
  fecha_programada: string;
  fecha_ejecutada: string | null;
}

export interface HatoTratamientoDetalle {
  id: string;
  nombre: string | null;
  protocoloNombre: string | null;
  fecha_inicio: string;
  estado: EstadoTratamiento;
  nota: string | null;
  pasos: HatoTratamientoPasoDetalle[];
}

interface FilaTratamientoSupabase {
  id: string;
  nombre: string | null;
  fecha_inicio: string;
  estado: EstadoTratamiento;
  nota: string | null;
  hato_protocolos: { nombre: string } | { nombre: string }[] | null;
  hato_tratamiento_pasos: HatoTratamientoPasoDetalle[] | null;
}

export function useHatoTratamientos(animalId: string | undefined) {
  const [tratamientos, setTratamientos] = useState<HatoTratamientoDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!animalId) return;
    setLoading(true);
    setError(null);
    try {
      // `src/types/database.ts` (generado) no incluye las tablas hato_* --
      // mismo workaround que el resto del módulo.
      const supabase = getSupabase() as any;
      const { data, error: err } = await supabase
        .from('hato_tratamientos')
        .select('id, nombre, fecha_inicio, estado, nota, hato_protocolos(nombre), hato_tratamiento_pasos(id, paso_num, descripcion, fecha_programada, fecha_ejecutada)')
        .eq('animal_id', animalId)
        .order('fecha_inicio', { ascending: false });
      if (err) throw err;

      const filas: HatoTratamientoDetalle[] = ((data ?? []) as FilaTratamientoSupabase[]).map((fila) => {
        const protocolo = Array.isArray(fila.hato_protocolos) ? fila.hato_protocolos[0] : fila.hato_protocolos;
        return {
          id: fila.id,
          nombre: fila.nombre,
          protocoloNombre: protocolo?.nombre ?? null,
          fecha_inicio: fila.fecha_inicio,
          estado: fila.estado,
          nota: fila.nota,
          pasos: (fila.hato_tratamiento_pasos ?? []).slice().sort((a, b) => a.paso_num - b.paso_num),
        };
      });

      setTratamientos(filas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando los tratamientos');
    } finally {
      setLoading(false);
    }
  }, [animalId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { tratamientos, loading, error, reload };
}
