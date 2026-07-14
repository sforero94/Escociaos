export interface ProductoParaAutoFill {
  precio_por_presentacion: number | null;
  precio_unitario: number | null;
  presentacion_kg_l: number | null;
}

export interface TotalesCompra {
  cantidadTotal: number;
  costoTotal: number;
  precioUnitarioReal: number;
}

// precio_unitario es $/kg-L (derivado en ProductForm de precio_por_presentacion / presentacion_kg_l); nunca usarlo directo como precio por bulto
export function calcularPrecioAutoFillBulto(producto: ProductoParaAutoFill): number {
  if (producto.precio_por_presentacion && producto.precio_por_presentacion > 0) {
    return producto.precio_por_presentacion;
  }

  const presentacion = producto.presentacion_kg_l || 1;
  return (producto.precio_unitario || 0) * presentacion;
}

export function calcularTotalesCompra(
  cantidadBultos: number,
  precioPorBulto: number,
  presentacionCantidad: number
): TotalesCompra {
  if (cantidadBultos <= 0 || precioPorBulto <= 0 || presentacionCantidad <= 0) {
    return { cantidadTotal: 0, costoTotal: 0, precioUnitarioReal: 0 };
  }

  const cantidadTotal = cantidadBultos * presentacionCantidad;
  const costoTotal = cantidadBultos * precioPorBulto;
  const precioUnitarioReal = costoTotal / cantidadTotal;

  return { cantidadTotal, costoTotal, precioUnitarioReal };
}
