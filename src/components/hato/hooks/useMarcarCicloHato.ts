// ARCHIVO: components/hato/hooks/useMarcarCicloHato.ts
// DESCRIPCIÓN: T4a (S3, docs/plan_hato_ciclo_manual_override.md §3.4) --
// I/O de `MarcarCicloDialog`. Dos responsabilidades:
//   1. Cargar la `EstadoActualHatoRow` + `HatoConfig` de UN animal -- lo que
//      `validarMarcaCiclo`/`proyectarEstadoTrasMarca` (hatoCicloManual.ts)
//      necesitan para construir el "Estado actual → quedará" y las
//      advertencias ANTES de guardar. Fetch propio, independiente de
//      `useHatoAnimal`/`useHatoAnimales` (mismo criterio que
//      `useVentaAnimalesHato.ts`: cada hook trae solo lo que necesita).
//   2. Escribir la marca: UN solo `.insert([...])` de 1-2 eventos (§3.3,
//      atomicidad) con `created_by` explícito -- `hato_eventos` NO tiene
//      trigger de atribución (ninguna de 040/050/063/074 lo cubre).
//
// `getSupabase() as any`: `src/types/database.ts` (generado) no incluye
// las tablas hato_* -- mismo workaround que el resto del módulo.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from '@/utils/hatoConfigDesdeTabla';
import type { EstadoActualHatoRow, HatoConfig } from '@/utils/calculosHato';
import { construirEventosMarcaCiclo, type InputMarcaCiclo } from '@/utils/hatoCicloManual';
import type { EstadoActualHatoViewRow, HatoAnimalRow } from '@/types/hato';

function filaDesdeVista(animal: HatoAnimalRow, vista: EstadoActualHatoViewRow | null): EstadoActualHatoRow {
  if (!vista) {
    return {
      etapa: animal.etapa,
      raza: animal.raza,
      estado: animal.estado,
      num_partos: 0,
      ultimo_chequeo_fecha: null,
      ultimo_servicio_fecha: null,
      ultimo_parto_fecha: null,
      ultimo_secado_real_fecha: null,
      ultima_confirmacion_prenez_fecha: null,
      ultimo_evento_fecha: null,
      ultima_confirmacion_prenez_metodo: null,
      ultimo_aborto_fecha: null,
      ultimo_estado_chequeo: null,
    };
  }
  return {
    etapa: vista.etapa,
    raza: vista.raza,
    estado: vista.estado,
    num_partos: vista.num_partos,
    ultimo_chequeo_fecha: vista.ultimo_chequeo_fecha,
    ultimo_servicio_fecha: vista.ultimo_servicio_fecha,
    ultimo_parto_fecha: vista.ultimo_parto_fecha,
    ultimo_secado_real_fecha: vista.ultimo_secado_real_fecha,
    ultima_confirmacion_prenez_fecha: vista.ultima_confirmacion_prenez_fecha,
    ultimo_evento_fecha: vista.ultimo_evento_fecha,
    ultima_confirmacion_prenez_metodo: vista.ultima_confirmacion_prenez_metodo,
    ultimo_aborto_fecha: vista.ultimo_aborto_fecha,
    ultimo_estado_chequeo: vista.ultimo_estado_chequeo,
  };
}

export interface ResultadoMarcarCiclo {
  ok: boolean;
  error?: string;
}

export function useMarcarCicloHato(animalId: string | undefined) {
  const { user } = useAuth();
  const [fila, setFila] = useState<EstadoActualHatoRow | null>(null);
  const [config, setConfig] = useState<HatoConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!animalId) {
      setFila(null);
      setConfig(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const [
        { data: animal, error: animalError },
        { data: vista, error: vistaError },
        { data: configRows, error: configError },
      ] = await Promise.all([
        supabase.from('hato_animales').select('*').eq('id', animalId).maybeSingle(),
        supabase.from('v_hato_estado_actual').select('*').eq('animal_id', animalId).maybeSingle(),
        supabase.from('hato_config').select('clave, valor'),
      ]);
      if (animalError) throw animalError;
      if (vistaError) throw vistaError;
      if (configError) throw configError;
      if (!animal) throw new Error('No se encontró el animal solicitado.');

      setFila(filaDesdeVista(animal as HatoAnimalRow, (vista ?? null) as EstadoActualHatoViewRow | null));
      setConfig(construirHatoConfigDesdeFilas((configRows ?? []) as FilaHatoConfig[]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando el estado del animal');
    } finally {
      setLoading(false);
    }
  }, [animalId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const marcarCiclo = useCallback(
    async (input: InputMarcaCiclo): Promise<ResultadoMarcarCiclo> => {
      if (!animalId) return { ok: false, error: 'Falta el animal' };
      setGuardando(true);
      try {
        const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const eventos = construirEventosMarcaCiclo(input).map((evento) => ({
          ...evento,
          animal_id: animalId,
          created_by: user?.id ?? null,
        }));
        // Un solo INSERT con N filas -- una sentencia, una transacción
        // (§3.3: nunca dos llamadas sueltas para esto).
        const { error: insertError } = await supabase.from('hato_eventos').insert(eventos);
        if (insertError) throw insertError;
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Error desconocido registrando la marca del ciclo',
        };
      } finally {
        setGuardando(false);
      }
    },
    [animalId, user],
  );

  return { fila, config, loading, error, marcarCiclo, guardando, reload: cargar };
}
