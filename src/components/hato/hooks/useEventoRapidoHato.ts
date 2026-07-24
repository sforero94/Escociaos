// ARCHIVO: components/hato/hooks/useEventoRapidoHato.ts
// DESCRIPCIÓN: Escritura del botón de acción rápida "Registrar parto" de
// `HojaDeVida.tsx` (Figma alignment spec §3). Mismo patrón
// `getSupabase() as any` que el resto del módulo.
//
// `registrarParto` inserta UN `hato_eventos` (tipo `parto`). Es suficiente:
// `v_hato_estado_actual.num_partos` es un COUNT(*) sobre `hato_eventos
// WHERE tipo='parto'` (migración 056), así que el evento por sí solo ya
// actualiza la ficha/lista/dashboard sin tocar `hato_animales`. Un solo
// INSERT ya es atómico.
//
// La venta/muerte NO vive aquí: la maneja S9
// (`VentaAnimalDialog`/`MuerteAnimalDialog` + `useRegistrarSalidaHato`), con
// integración financiera vía `TransaccionGanadoForm`.

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type { CriaDestino } from '@/types/hato';

export interface RegistrarPartoInput {
  fecha: string;
  criaDestino: CriaDestino;
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

  return { registrarParto, guardando };
}
