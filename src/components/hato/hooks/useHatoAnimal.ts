// ARCHIVO: components/hato/hooks/useHatoAnimal.ts
// DESCRIPCIÓN: Carga la ficha individual (Hoja de Vida, A2/A3/A5) de UN
// animal: identidad + estado derivado (mismo motor que la lista, S4) +
// TODOS los eventos de `hato_eventos` en orden cronológico (A3/V7: incluye
// cada intento de servicio, no solo el vigente) + historial de chequeos
// (`hato_chequeo_vacas`) + genealogía (madre, padre biológico si es propio
// del hato, padre_toro del catálogo, crías -- A5/V8).

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from '@/utils/hatoConfigDesdeTabla';
import { derivarEstadoReproductivo, type EstadoActualHatoRow, type EstadoReproductivoDerivado } from '@/utils/calculosHato';
import { esNumeroProvisional } from '@/utils/importHato/overridesChapeta';
import type {
  EstadoActualHatoViewRow,
  HatoAnimalRow,
  HatoEventoRow,
  HatoChequeoVacaRow,
  HatoChequeoRow,
} from '@/types/hato';

export interface AnimalRelacionado {
  id: string;
  numero: number | null;
  nombre: string | null;
}

export interface ChequeoHistorialItem extends HatoChequeoVacaRow {
  chequeoFecha: string;
}

export interface HatoAnimalDetalle {
  animal: HatoAnimalRow;
  numeroEsProvisional: boolean;
  /** PL del último chequeo (`v_hato_estado_actual.pl`) -- `null` si nunca se
   * pesó, nunca 0. */
  pl: number | null;
  numPartos: number;
  derivado: EstadoReproductivoDerivado;
  eventos: HatoEventoRow[];
  chequeos: ChequeoHistorialItem[];
  madre: AnimalRelacionado | null;
  padreToro: { id: string; nombre: string } | null;
  padreAnimal: AnimalRelacionado | null;
  crias: AnimalRelacionado[];
  /** Catálogo completo `hato_toros` (id -> nombre) -- lo necesita
   * `EventoTimeline` para resolver el toro de cada evento `servicio`, no
   * solo el `padre_toro_id` de la ficha. Catálogo pequeño (G4/V12), se trae
   * completo sin paginar. */
  nombresToroPorId: Record<string, string>;
}

function filaFactRow(
  animalRow: HatoAnimalRow,
  vista: EstadoActualHatoViewRow | null,
): EstadoActualHatoRow {
  if (!vista) {
    return {
      etapa: animalRow.etapa,
      raza: animalRow.raza,
      estado: animalRow.estado,
      num_partos: 0,
      ultimo_chequeo_fecha: null,
      ultimo_servicio_fecha: null,
      ultimo_parto_fecha: null,
      ultimo_secado_real_fecha: null,
      ultima_confirmacion_prenez_fecha: null,
      ultimo_evento_fecha: null,
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
    ultimo_estado_chequeo: vista.ultimo_estado_chequeo,
  };
}

export function useHatoAnimal(animalId: string | undefined) {
  const [detalle, setDetalle] = useState<HatoAnimalDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!animalId) return;
    setLoading(true);
    setError(null);
    try {
      // Ver la nota de `useHatoAnimales.ts`: `database.ts` (generado) no
      // incluye las tablas hato_*, mismo workaround que
      // `useGanadoInventario.ts` (`as any` en el cliente).
      const supabase = getSupabase() as any;

      const { data: animal, error: animalError } = await supabase
        .from('hato_animales')
        .select('*')
        .eq('id', animalId)
        .maybeSingle();
      if (animalError) throw animalError;
      if (!animal) throw new Error('No se encontró el animal solicitado.');
      const animalRow = animal as HatoAnimalRow;

      const [
        configRes,
        estadoRes,
        eventosRes,
        chequeoVacasRes,
        criasRes,
        torosRes,
        madreRes,
        padreToroRes,
        padreAnimalRes,
      ] = await Promise.all([
        supabase.from('hato_config').select('clave, valor'),
        supabase.from('v_hato_estado_actual').select('*').eq('animal_id', animalId).maybeSingle(),
        supabase.from('hato_eventos').select('*').eq('animal_id', animalId).order('fecha', { ascending: true }),
        supabase
          .from('hato_chequeo_vacas')
          .select('*, hato_chequeos(fecha)')
          .eq('animal_id', animalId)
          .order('created_at', { ascending: false }),
        supabase.from('hato_animales').select('id, numero, nombre').eq('madre_id', animalId).order('numero'),
        supabase.from('hato_toros').select('id, nombre'),
        animalRow.madre_id
          ? supabase.from('hato_animales').select('id, numero, nombre').eq('id', animalRow.madre_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        animalRow.padre_toro_id
          ? supabase.from('hato_toros').select('id, nombre').eq('id', animalRow.padre_toro_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        animalRow.padre_id
          ? supabase.from('hato_animales').select('id, numero, nombre').eq('id', animalRow.padre_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (configRes.error) throw configRes.error;
      if (estadoRes.error) throw estadoRes.error;
      if (eventosRes.error) throw eventosRes.error;
      if (chequeoVacasRes.error) throw chequeoVacasRes.error;
      if (criasRes.error) throw criasRes.error;
      if (torosRes.error) throw torosRes.error;

      const config = construirHatoConfigDesdeFilas((configRes.data ?? []) as FilaHatoConfig[]);
      const hoy = new Date().toISOString().slice(0, 10);
      const vista = estadoRes.data as EstadoActualHatoViewRow | null;
      const derivado = derivarEstadoReproductivo(filaFactRow(animalRow, vista), config, hoy);

      const chequeos: ChequeoHistorialItem[] = ((chequeoVacasRes.data ?? []) as (HatoChequeoVacaRow & {
        hato_chequeos: HatoChequeoRow | HatoChequeoRow[] | null;
      })[]).map(({ hato_chequeos, ...resto }) => {
        const chequeo = Array.isArray(hato_chequeos) ? hato_chequeos[0] : hato_chequeos;
        return { ...resto, chequeoFecha: chequeo?.fecha ?? '' };
      });

      setDetalle({
        animal: animalRow,
        numeroEsProvisional: esNumeroProvisional(animalRow.numero),
        pl: vista?.pl ?? null,
        numPartos: vista?.num_partos ?? 0,
        derivado,
        eventos: (eventosRes.data ?? []) as HatoEventoRow[],
        chequeos,
        madre: (madreRes.data as AnimalRelacionado | null) ?? null,
        padreToro: (padreToroRes.data as { id: string; nombre: string } | null) ?? null,
        padreAnimal: (padreAnimalRes.data as AnimalRelacionado | null) ?? null,
        crias: (criasRes.data ?? []) as AnimalRelacionado[],
        nombresToroPorId: Object.fromEntries(
          ((torosRes.data ?? []) as { id: string; nombre: string }[]).map((t) => [t.id, t.nombre]),
        ),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando la ficha del animal');
    } finally {
      setLoading(false);
    }
  }, [animalId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { detalle, loading, error, reload };
}
