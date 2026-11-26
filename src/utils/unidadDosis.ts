import type { UnidadDosis } from '../types/aplicaciones.ts'; // explicit extension: bundled with Deno via calculosAplicaciones

/**
 * Unidad de dosis por caneca de un producto nuevo en la mezcla (ESCO-188).
 *
 * Un producto que se inventaría en Unidades (por ejemplo, sobres o tabletas) se dosifica
 * en unidades por caneca. Antes caía en "gramos" y la cantidad se dividía entre 1000:
 * para llegar a 32 unidades había que escribir 800 "gramos" por caneca, y la dosis
 * guardada cambió tres veces (0,8 → 8 → 800) en dos aplicaciones de noviembre de 2026.
 */
export function unidadDosisParaProducto(producto: {
  unidad_medida?: string | null;
  estado_fisico?: string | null;
}): UnidadDosis {
  if (producto.unidad_medida === 'Unidades') return 'unidades';
  return producto.estado_fisico === 'liquido' ? 'cc' : 'gramos';
}

/**
 * Cantidad en la unidad de inventario para una dosis por caneca. cc y gramos se dividen
 * entre 1000 (a litros o kilos). Unidades se cuentan tal cual. Una línea sin unidad
 * guardada conserva la regla de siempre (÷1000), para no cambiar planes viejos.
 */
export function cantidadPorDosisCaneca(
  numeroCanecas: number,
  dosisPorCaneca: number,
  unidad: string | null | undefined,
): number {
  const total = numeroCanecas * dosisPorCaneca;
  return unidad === 'unidades' ? total : total / 1000;
}

/** Rótulo corto de la unidad junto al campo de dosis. */
export function rotuloUnidadDosis(unidad: string | null | undefined): string {
  if (unidad === 'cc') return 'cc';
  if (unidad === 'unidades') return 'und';
  return 'g';
}

/** Lee una unidad guardada en la base; descarta valores desconocidos. */
export function leerUnidadDosis(valor: string | null | undefined): UnidadDosis | undefined {
  return valor === 'cc' || valor === 'gramos' || valor === 'unidades' ? valor : undefined;
}
