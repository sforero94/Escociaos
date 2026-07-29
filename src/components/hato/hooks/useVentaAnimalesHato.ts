// ARCHIVO: components/hato/hooks/useVentaAnimalesHato.ts
// DESCRIPCIÓN: I/O de `VentaAnimalesHatoDialog` (SOW 3,
// docs/plan_hato_produccion_rework.md §3/§6) -- venta de terneros o vacas
// de descarte del hato, vía el RPC `fn_hato_registrar_venta_animales`
// (migración 070, `SECURITY INVOKER`). Reemplaza el camino
// `fin_transacciones_ganado` + `es_hato` que S9 usaba para esto (decisión
// 7 del dueño: descarte/terneros son flujos de `fin_ingresos`, no de
// ganado de ceba -- ver SOW 0 del mismo plan).
//
// El vínculo de animal es OPCIONAL (decisión 6 del dueño): cabezas + valor
// son obligatorios, elegir animales específicos no.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { esNumeroProvisional } from '@/utils/importHato/overridesChapeta';
import type { HatoAnimalActivoPicker, TipoVentaAnimalesHato, VentaAnimalesHatoPayload } from '@/types/hato';

export interface AnimalPickerVenta extends HatoAnimalActivoPicker {
  numeroEsProvisional: boolean;
}

export interface ResultadoRegistrarVentaAnimales {
  finIngresoId: string;
  animalesActualizados: number;
}

export function useVentaAnimalesHato() {
  // `hato_animales` no está en `src/types/database.ts` (generado) -- mismo
  // workaround `as any` que el resto del módulo hato.
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const [animales, setAnimales] = useState<AnimalPickerVenta[]>([]);
  const [loadingAnimales, setLoadingAnimales] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargarAnimales = useCallback(async () => {
    setLoadingAnimales(true);
    try {
      const { data, error } = await supabase
        .from('hato_animales')
        .select('id, numero, nombre')
        .eq('estado', 'activa')
        .order('numero', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setAnimales(
        ((data ?? []) as HatoAnimalActivoPicker[]).map((a) => ({
          ...a,
          numeroEsProvisional: esNumeroProvisional(a.numero),
        })),
      );
    } catch (err) {
      console.error('Error cargando animales activos del hato:', err);
      setAnimales([]);
    } finally {
      setLoadingAnimales(false);
    }
  }, [supabase]);

  useEffect(() => {
    cargarAnimales();
  }, [cargarAnimales]);

  /** Escritura atómica -- UN `.rpc()` a `fn_hato_registrar_venta_animales`
   * (migración 070): inserta `fin_ingresos` (categoría terneros o descarte,
   * resuelta por nombre del lado servidor) + un evento `venta` por animal
   * enlazado + marca esos animales `vendida`. `SECURITY INVOKER`: la RLS
   * de `fin_ingresos` (Gerencia-only) sigue aplicando. */
  const registrarVenta = useCallback(
    async (payload: {
      tipo: TipoVentaAnimalesHato;
      cabezas: number;
      valor: number;
      fecha: string;
      regionId: string;
      medioPagoId: string;
      compradorId: string | null;
      nombre: string | null;
      animalIds: string[];
    }): Promise<ResultadoRegistrarVentaAnimales> => {
      setGuardando(true);
      try {
        const rpcPayload: VentaAnimalesHatoPayload = {
          tipo: payload.tipo,
          cabezas: payload.cabezas,
          valor: payload.valor,
          fecha: payload.fecha,
          region_id: payload.regionId,
          medio_pago_id: payload.medioPagoId,
          comprador_id: payload.compradorId,
          nombre: payload.nombre,
          animal_ids: payload.animalIds,
        };
        const { data, error } = await supabase.rpc('fn_hato_registrar_venta_animales', { payload: rpcPayload });
        if (error) throw error;
        return data as ResultadoRegistrarVentaAnimales;
      } finally {
        setGuardando(false);
      }
    },
    [supabase],
  );

  return { animales, loadingAnimales, guardando, cargarAnimales, registrarVenta };
}
