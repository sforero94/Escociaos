// Cycle reader and compatible stale-writer refusal. Mutations use useCycle.
import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from '@/utils/hatoConfigDesdeTabla';
import type { EstadoActualHatoRow, HatoConfig } from '@/utils/calculosHato';
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
  /** ESCO-135: ficha de la ternera retenida creada junto con el parto. */
  criaCreada?: { id: string; numero: number };
  /** ESCO-135: el parto se guardó pero la ficha de la ternera NO. */
  avisoCria?: string;
}

export function useMarcarCicloHato(animalId: string | undefined) {
  const { user } = useAuth();
  const [fila, setFila] = useState<EstadoActualHatoRow | null>(null);
  const [config, setConfig] = useState<HatoConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [observedAnimal,setObservedAnimal]=useState<Record<string,unknown>|null>(null);

  const cargar = useCallback(async () => {
    if (!animalId) {
      setObservedAnimal(null);
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

      setObservedAnimal(animal);
      setFila(filaDesdeVista(animal as HatoAnimalRow, (vista ?? null) as EstadoActualHatoViewRow | null));
      setConfig(construirHatoConfigDesdeFilas((configRows ?? []) as FilaHatoConfig[]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando el estado del animal');
    } finally {
      setLoading(false);
    }
  }, [animalId,user?.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Stale direct writer refuses: actual dialog uses prepared useCycle. */
  const marcarCiclo=useCallback(async()=>({ok:false,error:'Use la marca con revisión preparada y recuperación del intento original.'}),[]);
  return {fila,config,loading,error,observedAnimal,marcarCiclo,guardando:false,reload:cargar};
}
