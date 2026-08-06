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

  const eliminar = useCallback(async (eventoId: string): Promise<ResultadoCorreccionEventoHato> => {
    setGuardando(true);
    try {
      const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('hato_eventos').delete().eq('id', eventoId);
      if (error) throw error;
      return { ok: true };
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
