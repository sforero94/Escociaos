// ARCHIVO: components/configuracion/hooks/useAjustesHato.ts
// DESCRIPCIÓN: I/O de la pantalla "Hato" en Configuración global (Épica H,
// S10, docs/plan_hato_lechero_module.md §6/§8). Toda la lógica de forma
// (serializar/validar/reconstruir) vive en `utils/ajustesHatoValidacion.ts`
// (pura, testeada) -- este hook solo hace `select`/`update` contra
// `hato_config` y decide CUÁNDO llamar a la validación antes de guardar.
//
// Persistencia: UPDATE-por-`clave` sobre las filas YA sembradas por las
// migraciones 058/062/064 -- nunca INSERT (evita duplicados bajo el índice
// único `hato_config_clave_unique`) y nunca `.upsert()` de PostgREST (mismo
// razonamiento de fondo que `fin_parametros`/052 y `hato_produccion_quincenal`:
// preferimos un UPDATE explícito y detectable a un upsert opaco). Si una
// clave no tiene fila (entorno sin migrar, o una clave H3 futura que aún no
// se sembró), el UPDATE afecta 0 filas y se reporta como advertencia -- nunca
// se inserta silenciosamente una fila nueva desde esta pantalla.

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import {
  serializarAjustesHato,
  validarAjustesHatoParaMotor,
  formularioDesdeFilas,
  type AjustesHatoForm,
} from '@/utils/ajustesHatoValidacion';
import type { FilaHatoConfig } from '@/utils/hatoConfigDesdeTabla';

export interface ResultadoGuardarAjustesHato {
  ok: boolean;
  /** Claves que no tenían fila en `hato_config` y por lo tanto no se
   * guardaron (el UPDATE afectó 0 filas) -- se reporta, nunca se inserta. */
  clavesSinFila?: string[];
  /** En un fallo a mitad de guardado: qué claves SÍ quedaron escritas antes
   * del error. `hato_config` alimenta el motor de fechas/alertas de todo el
   * hato, así que un guardado parcial silencioso es inconsistencia real --
   * el caller debe mostrar ambas listas para que Gerencia reintente. */
  clavesGuardadas?: string[];
  /** En un fallo a mitad de guardado: qué claves quedaron SIN escribir
   * (la que falló y todas las posteriores). */
  clavesPendientes?: string[];
  error?: string;
}

export function useAjustesHato() {
  // `hato_config` no está en `src/types/database.ts` (generado, desactualizado
  // desde antes de la migración 044) -- mismo workaround ya establecido en
  // todo el módulo hato (`useHatoAnimales.ts`, `useProduccionHato.ts`, etc.).
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AjustesHatoForm | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase.from('hato_config').select('clave, valor');
      if (fetchError) throw fetchError;
      setForm(formularioDesdeFilas((data ?? []) as FilaHatoConfig[]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando hato_config');
    } finally {
      setCargando(false);
    }
  }, [supabase]);

  /**
   * Valida contra el motor (`validarAjustesHatoParaMotor`) ANTES de tocar la
   * base de datos -- un formulario que no satisface el contrato del motor no
   * debe llegar a escribirse nunca, ni parcialmente.
   */
  const guardar = useCallback(
    async (nuevoForm: AjustesHatoForm, userId: string | undefined): Promise<ResultadoGuardarAjustesHato> => {
      setGuardando(true);
      try {
        const filas = serializarAjustesHato(nuevoForm);

        try {
          validarAjustesHatoParaMotor(filas);
        } catch (errValidacion) {
          return {
            ok: false,
            error: errValidacion instanceof Error ? errValidacion.message : 'Los valores no son válidos para el motor de fechas/alertas.',
          };
        }

        // Los UPDATEs son secuenciales e independientes (PostgREST no ofrece
        // transacción multi-fila desde el cliente). Si uno falla a mitad de
        // camino, NO se lanza un error genérico: se reporta exactamente qué
        // claves quedaron escritas y cuáles no, para que Gerencia reintente
        // sabiendo el estado real (hallazgo QA 2026-07-23; el paso a una RPC
        // transaccional tipo fn_hato_commit_chequeo queda como follow-up).
        const clavesSinFila: string[] = [];
        const clavesGuardadas: string[] = [];
        for (let i = 0; i < filas.length; i++) {
          const fila = filas[i];
          const { data, error: updateError } = await supabase
            .from('hato_config')
            .update({ valor: fila.valor, updated_by: userId ?? null })
            .eq('clave', fila.clave)
            .select('clave');
          if (updateError) {
            const clavesPendientes = filas.slice(i).map((f) => f.clave);
            return {
              ok: false,
              clavesGuardadas,
              clavesPendientes,
              error:
                `Guardado parcial: fallo en "${fila.clave}" (${updateError.message ?? 'error desconocido'}). ` +
                `Guardadas: ${clavesGuardadas.length > 0 ? clavesGuardadas.join(', ') : 'ninguna'}. ` +
                `Sin guardar: ${clavesPendientes.join(', ')}. Reintenta para dejar la configuración consistente.`,
            };
          }
          if (!data || data.length === 0) clavesSinFila.push(fila.clave);
          else clavesGuardadas.push(fila.clave);
        }

        setForm(nuevoForm);
        return clavesSinFila.length > 0 ? { ok: true, clavesSinFila } : { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido guardando hato_config' };
      } finally {
        setGuardando(false);
      }
    },
    [supabase],
  );

  return { form, cargando, guardando, error, cargar, guardar };
}
