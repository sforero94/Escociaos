// ARCHIVO: components/hato/hooks/useEventoRapidoHato.ts
// DESCRIPCIÓN: Escrituras de los dos botones de acción rápida de
// `HojaDeVida.tsx` (Figma alignment spec §3): "Registrar parto" y "Marcar
// vendida / muerta". Mismo patrón `getSupabase() as any` que el resto del
// módulo.
//
// - `registrarParto` inserta UN `hato_eventos` (tipo `parto`). Es
//   suficiente: `v_hato_estado_actual.num_partos` es un COUNT(*) sobre
//   `hato_eventos WHERE tipo='parto'` (migración 056), así que el evento
//   por sí solo ya actualiza la ficha/lista/dashboard sin tocar
//   `hato_animales`. Un solo INSERT ya es atómico -- no pasa por RPC.
// - `marcarSalida` (venta/muerte) necesita DOS escrituras -- el
//   `hato_eventos` (tipo `venta`/`muerte`, capa de auditoría) Y
//   `hato_animales.estado`/`fecha_estado`, a diferencia de "parto":
//   `estado` NO se deriva de `hato_eventos` en la vista
//   (`v_hato_estado_actual.estado` es `a.estado` directo, ver migración
//   056 §5), así que loguear el evento sin tocar `hato_animales` dejaría
//   la ficha/lista/dashboard mostrando "activa" para siempre -- una UI que
//   miente. Antes esto eran dos escrituras sueltas desde el cliente (no
//   atómicas); ahora es UNA llamada a `fn_hato_registrar_salida`
//   (migración 067, SECURITY INVOKER -- una función plpgsql es una
//   transacción, y al no ser DEFINER la RLS patrón 044 de ambas tablas
//   sigue gateando la escritura a Administrador/Gerencia con el rol de
//   quien llama, igual que antes).

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { CriaDestino } from '@/types/hato';

export interface RegistrarPartoInput {
  fecha: string;
  criaDestino: CriaDestino;
  nota: string;
}

export interface MarcarSalidaInput {
  tipo: 'venta' | 'muerte';
  fecha: string;
  nota: string;
}

export interface ResultadoEventoRapido {
  ok: boolean;
  error?: string;
}

export function useEventoRapidoHato() {
  const [guardando, setGuardando] = useState(false);

  const registrarParto = useCallback(
    async (animalId: string, input: RegistrarPartoInput): Promise<ResultadoEventoRapido> => {
      setGuardando(true);
      try {
        const supabase = getSupabase() as any;
        const { error } = await supabase.from('hato_eventos').insert({
          animal_id: animalId,
          tipo: 'parto',
          fecha: input.fecha,
          fecha_confianza: 'exacta',
          cria_destino: input.criaDestino,
          datos: input.nota.trim() ? { nota: input.nota.trim() } : null,
          fuente: 'web',
        });
        if (error) throw error;
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido registrando el parto' };
      } finally {
        setGuardando(false);
      }
    },
    [],
  );

  const marcarSalida = useCallback(
    async (animalId: string, input: MarcarSalidaInput): Promise<ResultadoEventoRapido> => {
      setGuardando(true);
      try {
        const supabase = getSupabase() as any;
        const { error } = await supabase.rpc('fn_hato_registrar_salida', {
          p_animal_id: animalId,
          p_tipo: input.tipo,
          p_fecha: input.fecha,
          p_nota: input.nota.trim() ? input.nota.trim() : null,
        });
        if (error) throw error;

        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Error desconocido registrando la salida del animal',
        };
      } finally {
        setGuardando(false);
      }
    },
    [],
  );

  return { registrarParto, marcarSalida, guardando };
}
