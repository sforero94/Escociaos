import type {
  CosechaIdentidad,
  CosechaTipo,
  FiltrosProduccion,
} from '@/types/produccion';
import {
  anosCampanaDeCosechas,
  ordenarCosechas,
} from '@/utils/calculosProduccionAnalisis';

export { anosCampanaDeCosechas };

/**
 * Inicializa filtros con el catálogo vivo: la unidad es la cosecha más reciente.
 * No aplica filtro de año de movimiento por defecto (ese acote es opcional).
 */
export function proyectarInicial(
  base: FiltrosProduccion,
  catalogo: { cosechas: CosechaIdentidad[]; anos_movimiento: number[] },
): FiltrosProduccion {
  const ordenadas = ordenarCosechas(catalogo.cosechas);
  const ultima = ordenadas[ordenadas.length - 1];
  const vista = base.vista || 'una';

  // Una cosecha → la más reciente. Varias → sin keys (todas las cosechas).
  // Nunca partimos de un año calendario como eje.
  const cosecha_keys =
    vista === 'una' && ultima ? [ultima.key] : [];

  const cosechasEfectivas =
    vista === 'una' && ultima
      ? [ultima]
      : ordenadas;

  const anos = anosCampanaDeCosechas(cosechasEfectivas);
  const tipos = Array.from(new Set(cosechasEfectivas.map((c) => c.tipo)));
  const cosecha_tipo: CosechaTipo | 'Ambas' =
    tipos.length === 1 ? tipos[0] : 'Ambas';

  return {
    ...base,
    vista,
    anos_movimiento: [],
    cosecha_keys,
    anos,
    cosecha_tipo,
  };
}
