/** Unrounded accumulation shared by the calculator and D37; callers validate availability/units. */
export function acumularProductosMezclas<T extends { producto_id: string; cantidad_total_necesaria: number }>(mezclas: { productos: T[] }[]): T[] {
  const productosMap = new Map<string, T>();
  mezclas.forEach(mezcla => {
    mezcla.productos.forEach(producto => {
      const existing = productosMap.get(producto.producto_id);
      if (existing) existing.cantidad_total_necesaria += producto.cantidad_total_necesaria;
      else productosMap.set(producto.producto_id, { ...producto, cantidad_total_necesaria: producto.cantidad_total_necesaria });
    });
  });
  return Array.from(productosMap.values());
}
/** Existing purchasing arithmetic, without catalog or presentation defaults. */
export function calcularFaltanteProducto(necesario: number, disponible: number): number { return Math.max(0, necesario - disponible); }
