import type {
  CosechaIdentidad,
  CosechaTipo,
  FiltrosProduccion,
} from '@/types/produccion';
import {
  anosCampanaDeCosechas,
  resolverSeleccionCosechas,
} from '@/utils/calculosProduccionAnalisis';

export { anosCampanaDeCosechas };

/**
 * Inicializa filtros con el catálogo vivo: prioriza el año de movimiento más
 * reciente y deja la cosecha efectiva a la resolución (Principal siguiente
 * incluida cuando aplica).
 */
export function proyectarInicial(
  base: FiltrosProduccion,
  catalogo: { cosechas: CosechaIdentidad[]; anos_movimiento: number[] },
): FiltrosProduccion {
  const anoMovimiento =
    catalogo.anos_movimiento.length > 0
      ? [catalogo.anos_movimiento[catalogo.anos_movimiento.length - 1]]
      : [];

  const next: FiltrosProduccion = {
    ...base,
    anos_movimiento: anoMovimiento,
    cosecha_keys: [],
    vista: base.vista || 'una',
  };

  const seleccion = resolverSeleccionCosechas(catalogo.cosechas, next);
  const cosechas = seleccion.estado === 'ok' ? seleccion.cosechas : [];
  const anos = anosCampanaDeCosechas(cosechas);
  const tipos = Array.from(new Set(cosechas.map((c) => c.tipo)));
  const cosecha_tipo: CosechaTipo | 'Ambas' =
    tipos.length === 1 ? tipos[0] : 'Ambas';

  return {
    ...next,
    anos,
    cosecha_tipo,
    cosecha_keys: cosechas.map((c) => c.key),
  };
}
