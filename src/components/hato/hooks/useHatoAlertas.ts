// ARCHIVO: components/hato/hooks/useHatoAlertas.ts
// DESCRIPCIÓN: Carga la cola de `hato_alertas` (migración 056) para
// `AlertasView.tsx` (S6/V11). Dos consultas + join en cliente -- mismo
// patrón que `useHatoAnimales.ts`: `hato_alertas` no expone `numero`/
// `nombre` (solo `animal_id`), así que se resuelven contra `hato_animales`
// igual que un join manual, sin depender de la sintaxis de embed de
// PostgREST (evita sorpresas si `animal_id` es NULL en una alerta futura
// sin animal asociado, ej. un recordatorio genérico).
//
// Escritura: `actualizarEstadoAlerta` hace un UPDATE simple (estado +
// respondida_por opcional) -- la RLS de la tabla (migración 056) ya
// restringe la escritura a Administrador/Gerencia; este hook no duplica
// esa validación, solo la ejecuta. El gating de la UI (ocultar/deshabilitar
// los botones para otros roles) vive en `AlertasView.tsx`, igual que
// `GanadoMovimientos.tsx` con `useGanadoInventario.ts`.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { esNumeroProvisional } from '@/utils/importHato/overridesChapeta';
import type { TipoAlertaHato, EstadoAlertaHato } from '@/utils/hatoAlertasUi';

/** Fila cruda de `hato_alertas` (migración 056) tal como llega de Supabase. */
export interface HatoAlertaRow {
  id: string;
  tipo: TipoAlertaHato;
  animal_id: string | null;
  regla_clave: string;
  fecha_programada: string;
  estado: EstadoAlertaHato;
  destinatario_telegram_id: string | null;
  intentos: number;
  respuesta: string | null;
  respondida_por: string | null;
  paso_id: string | null;
  datos: Record<string, unknown> | null;
  escalada_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/** Fila enriquecida con la identidad del animal (número + nombre), la única
 * información que la vista necesita de `hato_animales`. Un `animal_id` nulo
 * (o que ya no resuelve -- no debería pasar por la FK, pero un animal podría
 * no estar en el mapa si la consulta de animales falla parcialmente) deja
 * ambos campos en `null`: "sin caravana"/"—", nunca un valor inventado. */
export interface AlertaHatoEnriquecida extends HatoAlertaRow {
  animalNumero: number | null;
  animalNombre: string | null;
  animalNumeroEsProvisional: boolean;
}

export function useHatoAlertas() {
  const [alertas, setAlertas] = useState<AlertaHatoEnriquecida[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `src/types/database.ts` no incluye las tablas hato_* -- mismo
      // workaround documentado en `useHatoAnimales.ts`/`useGanadoInventario.ts`.
      const supabase = getSupabase() as any;
      const { data: alertaRows, error: alertasError } = await supabase
        .from('hato_alertas')
        .select('*')
        .order('fecha_programada', { ascending: true });
      if (alertasError) throw alertasError;

      const rows = (alertaRows ?? []) as HatoAlertaRow[];
      const animalIds = Array.from(new Set(rows.map((r) => r.animal_id).filter((id): id is string => !!id)));

      let animalPorId = new Map<string, { numero: number | null; nombre: string | null }>();
      if (animalIds.length > 0) {
        const { data: animalRows, error: animalesError } = await supabase
          .from('hato_animales')
          .select('id, numero, nombre')
          .in('id', animalIds);
        if (animalesError) throw animalesError;
        animalPorId = new Map(
          ((animalRows ?? []) as { id: string; numero: number | null; nombre: string | null }[]).map((a) => [
            a.id,
            { numero: a.numero, nombre: a.nombre },
          ]),
        );
      }

      const enriquecidas: AlertaHatoEnriquecida[] = rows.map((r) => {
        const animal = r.animal_id ? animalPorId.get(r.animal_id) : undefined;
        const numero = animal?.numero ?? null;
        return {
          ...r,
          animalNumero: numero,
          animalNombre: animal?.nombre ?? null,
          animalNumeroEsProvisional: esNumeroProvisional(numero),
        };
      });

      setAlertas(enriquecidas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando la cola de alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const actualizarEstadoAlerta = useCallback(
    async (id: string, cambios: { estado: EstadoAlertaHato; respondidaPor?: string | null }) => {
      const supabase = getSupabase() as any;
      const { error: updateError } = await supabase
        .from('hato_alertas')
        .update({
          estado: cambios.estado,
          ...(cambios.respondidaPor !== undefined ? { respondida_por: cambios.respondidaPor } : {}),
        })
        .eq('id', id);
      if (updateError) throw updateError;
      await reload();
    },
    [reload],
  );

  return { alertas, loading, error, reload, actualizarEstadoAlerta };
}
