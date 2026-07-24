// ARCHIVO: components/hato/hooks/useHatoPajillas.ts
// DESCRIPCIÓN: I/O del inventario de pajillas de inseminación (Épica G, S10)
// -- `hato_pajillas` (lotes/compras) + `hato_pajillas_uso` (log append-only)
// + `v_hato_pajillas_stock` (migración 057). Deliberadamente mínimo (plan
// §6 Épica G): sin proveedor/costo, un lote = un toro + una cantidad
// inicial; el stock puede ir a 0 o negativo y la UI solo advierte, nunca
// bloquea registrar un uso nuevo (G3).
//
// También trae el universo de animales activos para el selector opcional de
// "vaca servida" (G2) -- vínculo no obligatorio, se guarda `animal_id: null`
// cuando no se conoce, nunca se fuerza una elección.

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { esNumeroProvisional } from '@/utils/importHato/overridesChapeta';
import type { HatoPajillaStockRow, HatoAnimalActivoPicker } from '@/types/hato';

export interface PajillaConToro extends HatoPajillaStockRow {
  toroNombre: string;
}

export interface AnimalPickerPajillas extends HatoAnimalActivoPicker {
  numeroEsProvisional: boolean;
}

export interface ResultadoEscrituraPajillas {
  ok: boolean;
  error?: string;
}

export function useHatoPajillas() {
  // `hato_pajillas`/`hato_pajillas_uso`/`v_hato_pajillas_stock` no están en
  // `src/types/database.ts` (generado, desactualizado desde antes de la
  // migración 044) -- mismo workaround que el resto del módulo hato.
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const [pajillas, setPajillas] = useState<PajillaConToro[]>([]);
  const [animales, setAnimales] = useState<AnimalPickerPajillas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stockRes, torosRes, animalesRes] = await Promise.all([
        supabase.from('v_hato_pajillas_stock').select('pajilla_id, toro_id, cantidad_inicial, usos, cantidad_actual'),
        supabase.from('hato_toros').select('id, nombre'),
        supabase
          .from('hato_animales')
          .select('id, numero, nombre')
          .eq('estado', 'activa')
          .order('numero', { ascending: true, nullsFirst: false }),
      ]);
      if (stockRes.error) throw stockRes.error;
      if (torosRes.error) throw torosRes.error;
      if (animalesRes.error) throw animalesRes.error;

      const nombresPorToro = new Map<string, string>(
        ((torosRes.data ?? []) as { id: string; nombre: string }[]).map((t) => [t.id, t.nombre]),
      );

      const filasStock = ((stockRes.data ?? []) as HatoPajillaStockRow[]).map((fila) => ({
        ...fila,
        toroNombre: nombresPorToro.get(fila.toro_id) ?? 'Toro desconocido',
      }));
      filasStock.sort((a, b) => a.toroNombre.localeCompare(b.toroNombre));
      setPajillas(filasStock);

      setAnimales(
        ((animalesRes.data ?? []) as HatoAnimalActivoPicker[]).map((a) => ({
          ...a,
          numeroEsProvisional: esNumeroProvisional(a.numero),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando pajillas');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  /** G1: registra un lote/compra de pajillas para un toro ya existente en el
   * catálogo (G4) -- el toro se referencia por id, nunca texto suelto. */
  const registrarCompra = useCallback(
    async (toroId: string, cantidadInicial: number): Promise<ResultadoEscrituraPajillas> => {
      setGuardando(true);
      try {
        const { error: insertError } = await supabase
          .from('hato_pajillas')
          .insert({ toro_id: toroId, cantidad_inicial: cantidadInicial });
        if (insertError) throw insertError;
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido registrando la compra de pajillas' };
      } finally {
        setGuardando(false);
      }
    },
    [supabase],
  );

  /** G2: registra el uso de una pajilla -- append-only, nunca actualiza ni
   * borra usos previos. `animalId` es opcional (mejor registrar el uso sin
   * la vaca que no registrarlo). Nunca crea un `hato_eventos` -- vincular
   * automáticamente el servicio a una pajilla queda fuera de alcance de esta
   * épica (plan §6, nota de cierre de Épica G). El stock puede quedar en 0 o
   * negativo: esta función no valida ni bloquea sobre eso, la UI solo
   * advierte (G3). */
  const registrarUso = useCallback(
    async (pajillaId: string, fechaUso: string, animalId: string | null): Promise<ResultadoEscrituraPajillas> => {
      setGuardando(true);
      try {
        const { error: insertError } = await supabase
          .from('hato_pajillas_uso')
          .insert({ pajilla_id: pajillaId, fecha_uso: fechaUso, animal_id: animalId });
        if (insertError) throw insertError;
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido registrando el uso de la pajilla' };
      } finally {
        setGuardando(false);
      }
    },
    [supabase],
  );

  return { pajillas, animales, loading, error, guardando, reload, registrarCompra, registrarUso };
}
