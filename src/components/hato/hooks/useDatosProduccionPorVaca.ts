// ARCHIVO: components/hato/hooks/useDatosProduccionPorVaca.ts
// DESCRIPCIÓN: Compone `useHatoAnimales` (estado reproductivo YA derivado
// por el motor puro, calculosHato.ts) + `usePesajesYPartos` (I/O de
// `hato_pesajes_leche`/`hato_eventos` tipo `parto`) en el shape exacto que
// piden `TrackerProductividad`/`RankingVacas` -- SOW 5 de
// `docs/plan_hato_produccion_rework.md` §4.2c/§4.3. Ningún cálculo vive
// aquí: solo ensamblado de I/O y un reshape trivial (renombrar/filtrar por
// categoría), nunca aritmética (esa vive en `hatoProduccion.ts`, §4.1).

import { useMemo, useCallback } from 'react';
import { useHatoAnimales } from './useHatoAnimales';
import { usePesajesYPartos } from './usePesajesYPartos';
import type { EstadoReproductivoProyeccion } from '@/utils/hatoProduccion';

export interface IdentidadAnimalHato {
  numero: number | null;
  nombre: string | null;
  numeroEsProvisional: boolean;
}

export function useDatosProduccionPorVaca() {
  const { animales, loading: loadingAnimales, error: errorAnimales, reload: reloadAnimales } = useHatoAnimales();
  const { pesajes, partos, loading: loadingPesajes, error: errorPesajes, reload: reloadPesajes } = usePesajesYPartos();

  // Universo de `proyectarHato` (§4.2c): SOLO vacas activas relevantes a
  // producción -- en ordeño (`hato`) o secas próximas a parir (`horro`).
  // Terneras/novillas nunca aportan ni consumen litros; los estados
  // terminales (vendida/muerta/descartada, `categoria === null`) tampoco.
  const estadosReproductivos = useMemo<EstadoReproductivoProyeccion[]>(
    () =>
      animales
        .filter((a) => a.categoria === 'hato' || a.categoria === 'horro')
        .map((a) => ({
          animalId: a.animalId,
          enOrdeno: a.categoria === 'hato',
          fechaProbableParto: a.derivado.fecha_probable_parto,
          fechaSecar: a.derivado.fecha_secar,
        })),
    [animales],
  );

  // Identidad para mostrar en el ranking/tracker -- superset de los
  // animales con pesajes (incluye históricos vendidos/muertos, la vista no
  // filtra por estado), así que cualquier `animal_id` con pesaje siempre
  // resuelve a un nombre/número.
  const identidadPorAnimal = useMemo(() => {
    const mapa = new Map<string, IdentidadAnimalHato>();
    for (const a of animales) {
      mapa.set(a.animalId, { numero: a.numero, nombre: a.nombre, numeroEsProvisional: a.numeroEsProvisional });
    }
    return mapa;
  }, [animales]);

  const reload = useCallback(() => {
    reloadAnimales();
    reloadPesajes();
  }, [reloadAnimales, reloadPesajes]);

  return {
    pesajes,
    partos,
    estadosReproductivos,
    identidadPorAnimal,
    loading: loadingAnimales || loadingPesajes,
    error: errorAnimales ?? errorPesajes,
    reload,
  };
}
