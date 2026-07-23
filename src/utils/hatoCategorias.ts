// ARCHIVO: utils/hatoCategorias.ts
// DESCRIPCIÓN: Clasificación de un animal del hato en las TRES categorías
// que el dueño pidió explícitamente para la vista de inventario de S4
// (decisión del dueño, segunda ronda, 2026-07-22 -- plan
// docs/plan_hato_lechero_module.md §8: "El hato tiene tres categorías:
// terneras, hato (en ordeño) y horro (secas próximas a parir) -- el
// inventario y la vista de S4 deben mostrar esas tres").
//
// Puro: compone sobre `EstadoReproductivo`, que YA calcula
// `derivarEstadoReproductivo` en `calculosHato.ts` (motor protegido por
// paridad byte-idéntica con el servidor, S2) -- este archivo NO reimplementa
// ni reinterpreta ese cálculo, solo lo traduce a las 3 etiquetas de producto
// que pidió el dueño. Vive fuera de calculosHato.ts a propósito: agregar
// aquí una constante de negocio no requeriría tocar los 3 archivos
// protegidos por `calculosHatoParidad.test.ts` cada vez que cambie la
// definición de "horro" o "hato" a nivel de UI.
//
// ASUNCIÓN DOCUMENTADA (sin confirmar por el dueño, S4): el plan y las
// decisiones registradas no definen con precisión los límites de las 3
// categorías más allá de la frase citada arriba. Se interpreta (regla
// unificada con `hato-aggregation.ts` del servidor -- Esco y la UI deben
// dar siempre el mismo conteo):
//   - terneras -- etapa 'ternera' o 'novilla': aún no ha parido, nunca ha
//     estado en ordeño, así que no puede ser "hato (en ordeño)" ni "horro
//     (seca)".
//   - horro    -- vaca cuyo estado reproductivo derivado sea 'seca'
//     (masReciente === 'secado_real', ver `derivarEstadoReproductivo`) --
//     es decir, YA se secó y espera parto. Un animal 'proxima_a_secar'
//     (todavía en ordeño, dentro de la ventana de aviso) se queda en
//     "hato": el dueño describió horro como "secas", no "por secar".
//   - hato     -- toda otra vaca activa (servida, preñada, parida_reciente,
//     vacia_por_servir, indeterminado): sigue en ordeño.
//   - null     -- estados terminales (vendida/muerta/descartada): no
//     pertenecen a ninguna de las 3 categorías del inventario vivo.
// Si el dueño precisa un límite distinto (ej. "próxima a secar" también
// cuenta como horro, o novillas fuera de terneras), hay que tocar este
// archivo Y `categorizarAnimal` en ambas copias de `hato-aggregation.ts`.

import type { EtapaHato } from '@/types/hato';
import type { EstadoReproductivo } from '@/utils/calculosHato';

export type CategoriaHato = 'ternera' | 'hato' | 'horro';

export function clasificarCategoriaHato(
  etapa: EtapaHato,
  estadoReproductivo: EstadoReproductivo,
): CategoriaHato | null {
  if (
    estadoReproductivo === 'vendida' ||
    estadoReproductivo === 'muerta' ||
    estadoReproductivo === 'descartada'
  ) {
    return null;
  }
  if (etapa === 'ternera' || etapa === 'novilla') return 'ternera';
  if (estadoReproductivo === 'seca') return 'horro';
  return 'hato';
}

export const LABEL_CATEGORIA_HATO: Record<CategoriaHato, string> = {
  ternera: 'Terneras',
  hato: 'Hato (en ordeño)',
  horro: 'Horro (secas)',
};
