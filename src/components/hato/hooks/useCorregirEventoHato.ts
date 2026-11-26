// ARCHIVO: components/hato/hooks/useCorregirEventoHato.ts
// DESCRIPCIÓN: T4b (S3, docs/plan_hato_ciclo_manual_override.md §4.6) --
// editar o eliminar UN `hato_eventos` ya registrado. La traza la escribe
// SOLA el trigger `fn_hato_registrar_correccion` (migración 084) -- este
// hook solo hace el UPDATE/DELETE por `id`, nunca escribe en
// `hato_correcciones` directamente (no podría: sin política de escritura
// para `authenticated`).
//
// `motivo` (opcional) viaja en `datos.motivo_correccion` -- el ÚNICO canal
// que el trigger sabe leer (084 §5.3). `tipo` y `animal_id` NO son
// editables por diseño: cambiar el tipo es borrar y crear, no corregir
// (§4.6) -- por eso `EdicionEventoHato` no los incluye.

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { ConfianzaFecha, CriaDestino, HatoEventoRow, TipoServicioHato } from '@/types/hato';
import {
  eliminarEventoHato,
  REFERENCIAS_CRIA,
  sumarReferencias,
  type CriaLeida,
  type ResultadoConteo,
  type ResultadoEliminarEvento,
} from '@/utils/hato/eliminarPartoConCria';

export interface EdicionEventoHato {
  fecha: string;
  fecha_confianza: ConfianzaFecha;
  tipo_servicio: TipoServicioHato | null;
  toro_id: string | null;
  cria_destino: CriaDestino | null;
  nota: string;
  /** Opcional -- si se da, se escribe en `datos.motivo_correccion` (único
   * canal que lee el trigger de la 084). Si no se da, se deja el motivo
   * previo intacto (nunca se borra uno ya existente sin uno nuevo). */
  motivo?: string;
}

export interface ResultadoCorreccionEventoHato {
  ok: boolean;
  error?: string;
}

export function useCorregirEventoHato() {
  const [guardando, setGuardando] = useState(false);

  const editar = useCallback(
    async (evento: HatoEventoRow, edicion: EdicionEventoHato): Promise<ResultadoCorreccionEventoHato> => {
      setGuardando(true);
      try {
        const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

        const datosSiguiente: Record<string, unknown> = { ...(evento.datos ?? {}) };
        const notaLimpia = edicion.nota.trim();
        if (notaLimpia) datosSiguiente.nota = notaLimpia;
        else delete datosSiguiente.nota;
        if (edicion.motivo?.trim()) datosSiguiente.motivo_correccion = edicion.motivo.trim();

        const { error } = await supabase
          .from('hato_eventos')
          .update({
            fecha: edicion.fecha,
            fecha_confianza: edicion.fecha_confianza,
            tipo_servicio: edicion.tipo_servicio,
            toro_id: edicion.toro_id,
            cria_destino: edicion.cria_destino,
            datos: Object.keys(datosSiguiente).length > 0 ? datosSiguiente : null,
          })
          .eq('id', evento.id);
        if (error) throw error;
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Error desconocido corrigiendo el evento',
        };
      } finally {
        setGuardando(false);
      }
    },
    [],
  );

  /** Borra UN evento. Si es un parto con ficha automática de la ternera
   * (ESCO-135), borra también esa ficha cuando sigue intacta (ESCO-186,
   * `eliminarPartoConCria.ts`); si no, la conserva y devuelve un aviso. */
  const eliminar = useCallback(async (evento: HatoEventoRow): Promise<ResultadoEliminarEvento> => {
    setGuardando(true);
    try {
      const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      return await eliminarEventoHato(evento, {
        leerCria: async (criaId) => {
          const { data, error } = await supabase
            .from('hato_animales')
            .select('id, numero, madre_id, nombre, estado, import_meta')
            .eq('id', criaId)
            .maybeSingle();
          return { cria: (data ?? null) as CriaLeida | null, error: error ? error.message : null };
        },
        contarReferencias: async (criaId, eventoId) => {
          const conteos = await Promise.all(
            REFERENCIAS_CRIA.map((ref) => {
              let q = supabase.from(ref.tabla).select('id', { count: 'exact', head: true }).eq(ref.columna, criaId);
              if (ref.excluirEvento) q = q.neq('id', eventoId);
              if (ref.soloHato) q = q.eq('es_hato', true);
              return q;
            }),
          );
          return sumarReferencias(conteos as ResultadoConteo[]);
        },
        borrarEvento: async (eventoId) => {
          const { error } = await supabase.from('hato_eventos').delete().eq('id', eventoId);
          return error ? error.message : null;
        },
        borrarCria: async (criaId) => {
          const { error } = await supabase.from('hato_animales').delete().eq('id', criaId);
          return error ? error.message : null;
        },
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Error desconocido eliminando el evento',
      };
    } finally {
      setGuardando(false);
    }
  }, []);

  return { editar, eliminar, guardando };
}
