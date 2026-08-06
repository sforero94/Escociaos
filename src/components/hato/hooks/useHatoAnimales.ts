// ARCHIVO: components/hato/hooks/useHatoAnimales.ts
// DESCRIPCIÓN: Carga el hato completo para las vistas de lista/tablero (S4):
// una consulta a `hato_config` (parámetros del motor) + una a
// `v_hato_estado_actual` (hechos, migración 062), y aplica fila por fila la
// reconciliación única chip/pestaña `clasificarAnimalHato`
// (`hatoCategorias.ts`, D-13 -- corregida 2026-08-06: alimenta el motor con
// la etapa YA CALCULADA, nunca con la cruda de la vista, para que el chip
// de estado nunca contradiga la pestaña donde el animal aparece) con
// `fechaReferencia = hoy`. Ningún cálculo de negocio vive en este hook --
// solo I/O + ensamblado, mismo patrón que `useGanadoInventario.ts`.

import { useState, useCallback, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from '@/utils/hatoConfigDesdeTabla';
import type { EstadoReproductivoDerivado } from '@/utils/calculosHato';
import {
  clasificarAnimalHato,
  construirUmbralesCategoriaHatoDesdeFilas,
  type CategoriaHato,
  type SubetapaTernera,
} from '@/utils/hatoCategorias';
import { esNumeroProvisional } from '@/utils/importHato/overridesChapeta';
import type { EstadoActualHatoViewRow, EtapaHato, EstadoAnimalHato } from '@/types/hato';
import { obtenerFechaHoy } from '@/utils/fechas';

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
  /** `ultimo_parto_fecha` de `v_hato_estado_actual` -- MAX(fecha) de
   * `hato_eventos` tipo `parto` para el animal. `null` = sin partos
   * registrados, nunca una fecha inventada (columna "Último parto",
   * AnimalesList.tsx). */
  ultimoPartoFecha: string | null;
  derivado: EstadoReproductivoDerivado;
  categoria: CategoriaHato | null;
  /** De dónde salió la etapa que decidió `categoria` (S6, D-13, corregido
   * por la migración 092): `calculado` (num_partos/fecha_nacimiento) u
   * `override_manual` -- este último cubre TANTO `etapa_forzada = true`
   * (el usuario forzó la etapa a mano desde `EditarAnimalDialog`, gana
   * siempre) COMO el fallback de siempre cuando el cálculo no pudo
   * resolver la edad. Si algún consumidor necesita distinguir cuál de los
   * dos ocurrió, la fuente de esa distinción es `etapa_forzada` en la fila
   * cruda, no este campo. `null` cuando `categoria` también es `null`
   * (estado terminal, no aplica ninguna de las dos). */
  categoriaOrigen: 'calculado' | 'override_manual' | null;
  /** Subgrupo contable dentro de "ternera" (D-13: leche/concentrado),
   * `null` para toda categoría que no sea `ternera` o cuando la edad no se
   * pudo calcular. */
  subetapaTernera: SubetapaTernera | null;
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
      // Mismas filas crudas de `hato_config` que ya se pidieron arriba --
      // sin una segunda consulta (S6, D-13).
      const umbralesCategoria = construirUmbralesCategoriaHatoDesdeFilas((configRows ?? []) as FilaHatoConfig[]);
      const hoy = obtenerFechaHoy();

      const filas: AnimalHatoDerivado[] = ((estadoRows ?? []) as EstadoActualHatoViewRow[]).map((fila) => {
        // `fila` (EstadoActualHatoViewRow) ya cumple la forma que pide
        // `clasificarAnimalHato` (EstadoActualHatoRow + fecha_nacimiento +
        // etapa_forzada) sin conversión -- ver `FilaClasificacionHato`.
        const { derivado, categoria, categoriaOrigen, subetapaTernera } = clasificarAnimalHato(
          fila,
          config,
          umbralesCategoria,
          hoy,
        );
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
          ultimoPartoFecha: fila.ultimo_parto_fecha,
          derivado,
          categoria,
          categoriaOrigen,
          subetapaTernera,
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
