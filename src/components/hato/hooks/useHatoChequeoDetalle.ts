// ARCHIVO: components/hato/hooks/useHatoChequeoDetalle.ts
// DESCRIPCIÓN: Ruta `/hato-lechero/chequeos/:id` (Figma alignment spec §5).
// Carga la cabecera de UN chequeo (`hato_chequeos`) + todas sus filas
// (`hato_chequeo_vacas`, capa cruda + normalizada -- ver la nota extendida
// en `types/hato.ts`) unidas a `hato_animales` para mostrar número/nombre.
// Solo lectura -- el flujo de carga/aprobación vive en
// `useSubirChequeoExcel.ts` (B0/V10); esta vista es la revisión posterior
// que pidió el dueño ("otherwise it's a useless list").
//
// Issue #192: además deriva el estado reproductivo de 5 etiquetas para la
// columna Estado (`Servida (4)`), con `fechaReferencia` = fecha del
// chequeo. Si `hato_config` o `v_hato_estado_actual` no se pueden leer, esas
// dos columnas extras quedan `null` y la UI cae al `TipoEstado` de la
// planilla -- la vista del chequeo no se cae por un dato de apoyo.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { esNumeroProvisional } from '@/utils/importHato/overridesChapeta';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from '@/utils/hatoConfigDesdeTabla';
import {
  derivarEstadoReproductivo,
  fechaAperturaEstadoReproductivo,
  mesesEnEstadoReproductivo,
  type EstadoActualHatoRow,
  type EstadoReproductivo,
} from '@/utils/calculosHato';
import type { HatoChequeoRow, HatoChequeoVacaRow } from '@/types/hato';

interface FilaEstadoChequeo extends EstadoActualHatoRow {
  animal_id: string;
}

export interface ChequeoVacaDetalle extends HatoChequeoVacaRow {
  numero: number | null;
  nombre: string | null;
  numeroEsProvisional: boolean;
  /** 5 estados de D-D, derivado contra la fecha del chequeo. `null` si no
   * se pudo leer el motor (config/vista) -- la UI cae a `estado` TipoEstado. */
  estadoReproductivo: EstadoReproductivo | null;
  /** Meses cumplidos en ese estado a la fecha del chequeo. `null` sin
   * evento de apertura -- nunca 0 inventado. */
  mesesEnEstado: number | null;
}

export interface HatoChequeoDetalle {
  chequeo: HatoChequeoRow;
  vacas: ChequeoVacaDetalle[];
}

interface FilaChequeoVacaSupabase extends HatoChequeoVacaRow {
  hato_animales: { numero: number | null; nombre: string | null } | { numero: number | null; nombre: string | null }[] | null;
}

export function useHatoChequeoDetalle(chequeoId: string | undefined) {
  const [detalle, setDetalle] = useState<HatoChequeoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!chequeoId) return;
    setLoading(true);
    setError(null);
    try {
      // `src/types/database.ts` (generado) no incluye las tablas hato_* --
      // mismo workaround que el resto del módulo.
      const supabase = getSupabase() as any;

      const [{ data: chequeo, error: chequeoError }, { data: vacas, error: vacasError }] = await Promise.all([
        supabase.from('hato_chequeos').select('*').eq('id', chequeoId).maybeSingle(),
        supabase
          .from('hato_chequeo_vacas')
          .select('*, hato_animales(numero, nombre)')
          .eq('chequeo_id', chequeoId),
      ]);
      if (chequeoError) throw chequeoError;
      if (vacasError) throw vacasError;
      if (!chequeo) throw new Error('No se encontró el chequeo solicitado.');

      const filasBase = ((vacas ?? []) as FilaChequeoVacaSupabase[]).map(({ hato_animales, ...resto }) => {
        const animal = Array.isArray(hato_animales) ? hato_animales[0] : hato_animales;
        return {
          ...resto,
          numero: animal?.numero ?? null,
          nombre: animal?.nombre ?? null,
          numeroEsProvisional: esNumeroProvisional(animal?.numero ?? null),
        };
      });

      const animalIds = [...new Set(filasBase.map((f) => f.animal_id).filter(Boolean))];
      let derivadoPorAnimal = new Map<string, { estado: EstadoReproductivo; meses: number | null }>();
      try {
        const [{ data: configRows, error: configError }, estadoRes] = await Promise.all([
          supabase.from('hato_config').select('clave, valor'),
          animalIds.length === 0
            ? Promise.resolve({ data: [], error: null })
            : supabase
                .from('v_hato_estado_actual')
                .select(
                  'animal_id, etapa, raza, estado, num_partos, ultimo_chequeo_fecha, ultimo_servicio_fecha, ultimo_parto_fecha, ultimo_secado_real_fecha, ultima_confirmacion_prenez_fecha, ultimo_evento_fecha, ultima_confirmacion_prenez_metodo, ultimo_aborto_fecha, ultimo_estado_chequeo',
                )
                .in('animal_id', animalIds),
        ]);
        if (configError) throw configError;
        if (estadoRes.error) throw estadoRes.error;
        const config = construirHatoConfigDesdeFilas((configRows ?? []) as FilaHatoConfig[]);
        const fechaChequeo = (chequeo as HatoChequeoRow).fecha;
        for (const fila of (estadoRes.data ?? []) as FilaEstadoChequeo[]) {
          const derivado = derivarEstadoReproductivo(fila, config, fechaChequeo);
          const fechaApertura = fechaAperturaEstadoReproductivo(derivado.estado, fila);
          derivadoPorAnimal.set(fila.animal_id, {
            estado: derivado.estado,
            meses: mesesEnEstadoReproductivo(fechaApertura, fechaChequeo),
          });
        }
      } catch {
        derivadoPorAnimal = new Map();
      }

      // Sin ordenar acá -- `ChequeoDetalle.tsx` ordena en cliente (T2, ronda
      // agosto 2026) para que los encabezados sean interactivos; el default
      // alfabético vive en el componente, no en el fetch.
      const filas: ChequeoVacaDetalle[] = filasBase.map((fila) => {
        const derivado = derivadoPorAnimal.get(fila.animal_id);
        return {
          ...fila,
          estadoReproductivo: derivado?.estado ?? null,
          mesesEnEstado: derivado?.meses ?? null,
        };
      });

      setDetalle({ chequeo: chequeo as HatoChequeoRow, vacas: filas });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando el chequeo');
    } finally {
      setLoading(false);
    }
  }, [chequeoId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { detalle, loading, error, reload };
}
