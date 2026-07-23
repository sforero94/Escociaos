// ARCHIVO: components/hato/hooks/useHatoAnimales.ts
// DESCRIPCIÓN: Carga el hato completo para las vistas de lista/tablero (S4):
// una consulta a `hato_config` (parámetros del motor) + una a
// `v_hato_estado_actual` (hechos, migración 062), y aplica el motor puro
// `derivarEstadoReproductivo` (calculosHato.ts) fila por fila con
// `fechaReferencia = hoy`. Ningún cálculo de negocio vive en este hook --
// solo I/O + ensamblado, mismo patrón que `useGanadoInventario.ts`.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from '@/utils/hatoConfigDesdeTabla';
import { derivarEstadoReproductivo, type EstadoActualHatoRow, type EstadoReproductivoDerivado } from '@/utils/calculosHato';
import { clasificarCategoriaHato, type CategoriaHato } from '@/utils/hatoCategorias';
import { esNumeroProvisional } from '@/utils/importHato/overridesChapeta';
import type { EstadoActualHatoViewRow, EtapaHato, EstadoAnimalHato } from '@/types/hato';

export interface AnimalHatoDerivado {
  animalId: string;
  numero: number | null;
  numeroEsProvisional: boolean;
  nombre: string | null;
  etapa: EtapaHato;
  raza: string | null;
  estadoAnimal: EstadoAnimalHato;
  pl: number | null;
  numPartos: number;
  ultimoChequeoFecha: string | null;
  derivado: EstadoReproductivoDerivado;
  categoria: CategoriaHato | null;
}

function filaVistaAFactRow(fila: EstadoActualHatoViewRow): EstadoActualHatoRow {
  return {
    etapa: fila.etapa,
    raza: fila.raza,
    estado: fila.estado,
    num_partos: fila.num_partos,
    ultimo_chequeo_fecha: fila.ultimo_chequeo_fecha,
    ultimo_servicio_fecha: fila.ultimo_servicio_fecha,
    ultimo_parto_fecha: fila.ultimo_parto_fecha,
    ultimo_secado_real_fecha: fila.ultimo_secado_real_fecha,
    ultima_confirmacion_prenez_fecha: fila.ultima_confirmacion_prenez_fecha,
    ultimo_evento_fecha: fila.ultimo_evento_fecha,
    ultimo_estado_chequeo: fila.ultimo_estado_chequeo,
  };
}

export function useHatoAnimales() {
  const [animales, setAnimales] = useState<AnimalHatoDerivado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `src/types/database.ts` (generado) no incluye las tablas hato_* --
      // está desactualizado desde antes de 044 (`gan_inventario` tampoco
      // aparece ahí). Mismo workaround que `useGanadoInventario.ts`: castear
      // a `any` en el punto de entrada, tipar explícito en cada `as` de
      // salida. Regenerar `database.ts` es una tarea de tooling/backend
      // fuera del alcance de esta sesión (ver reporte de S4).
      const supabase = getSupabase() as any;
      const [{ data: configRows, error: configError }, { data: estadoRows, error: estadoError }] = await Promise.all([
        supabase.from('hato_config').select('clave, valor'),
        supabase.from('v_hato_estado_actual').select('*'),
      ]);
      if (configError) throw configError;
      if (estadoError) throw estadoError;

      const config = construirHatoConfigDesdeFilas((configRows ?? []) as FilaHatoConfig[]);
      const hoy = new Date().toISOString().slice(0, 10);

      const filas: AnimalHatoDerivado[] = ((estadoRows ?? []) as EstadoActualHatoViewRow[]).map((fila) => {
        const derivado = derivarEstadoReproductivo(filaVistaAFactRow(fila), config, hoy);
        return {
          animalId: fila.animal_id,
          numero: fila.numero,
          numeroEsProvisional: esNumeroProvisional(fila.numero),
          nombre: fila.nombre,
          etapa: fila.etapa,
          raza: fila.raza,
          estadoAnimal: fila.estado,
          pl: fila.pl,
          numPartos: fila.num_partos,
          ultimoChequeoFecha: fila.ultimo_chequeo_fecha,
          derivado,
          categoria: clasificarCategoriaHato(fila.etapa, derivado.estado),
        };
      });

      setAnimales(filas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando el hato');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { animales, loading, error, reload };
}
