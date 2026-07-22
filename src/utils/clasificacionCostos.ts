// Clasificación de un gasto en costo directo vs indirecto. Lógica pura.
//
// El dato vive en la base (migración 051): `fin_categorias_gastos.tipo_costo`
// con override opcional en `fin_conceptos_gastos.tipo_costo`. Gerencia lo edita
// desde Configuración → Finanzas sin necesidad de un deploy.
//
// Clasificar mal un gasto SOLO mueve la línea entre Margen de Contribución y
// Utilidad Operativa; NUNCA cambia la Utilidad Operativa.

import type { GastoCrudo, TipoCosto } from '@/types/reportesFinancieros';

/** Lo que se asume cuando ni el concepto ni la categoría dicen nada. */
export const TIPO_COSTO_POR_DEFECTO: TipoCosto = 'indirecto';

/**
 * El concepto gana sobre la categoría; si ninguno define nada, indirecto.
 *
 * El default es indirecto a propósito: un gasto sin clasificar cae DEBAJO de
 * la línea de margen, de modo que lo no revisado nunca infla el Margen de
 * Contribución en silencio.
 */
export function resolverTipoCosto(
  gasto: Pick<GastoCrudo, 'categoria_tipo_costo' | 'concepto_tipo_costo'>
): TipoCosto {
  return gasto.concepto_tipo_costo ?? gasto.categoria_tipo_costo ?? TIPO_COSTO_POR_DEFECTO;
}

/** Un gasto entra al reporte solo si está confirmado. */
export function esConfirmado(gasto: Pick<GastoCrudo, 'estado'>): boolean {
  return gasto.estado === 'Confirmado';
}

/**
 * Gastos que no pudieron atribuirse a una categoría (el join falló o la
 * categoría fue borrada). Se reportan como advertencia en vez de aparecer
 * mudos bajo "Sin categoría".
 */
export function gastosSinCategoria(gastos: GastoCrudo[]): { cantidad: number; total: number } {
  let cantidad = 0;
  let total = 0;
  for (const g of gastos) {
    if (!g.categoria_id || !g.categoria_nombre) {
      cantidad += 1;
      total += g.valor;
    }
  }
  return { cantidad, total };
}
