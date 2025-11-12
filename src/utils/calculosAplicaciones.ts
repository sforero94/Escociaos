// utils/calculosAplicaciones.ts
// Funciones de cálculo para aplicaciones de agroinsumos

import type {
  LoteSeleccionado,
  ProductoEnMezcla,
  CalculosPorLote,
  Mezcla,
  ItemListaCompras,
  ListaCompras,
  ProductoCatalogo
} from '../types/aplicaciones';

/**
 * CÁLCULOS PARA FUMIGACIÓN
 * Fórmulas según documento de diseño:
 * - Litros de mezcla = (# árboles × calibración L/árbol)
 * - # canecas = Litros de mezcla / Tamaño caneca
 * - Cantidad de cada producto = (# canecas × dosis por caneca) / 1000
 */
export function calcularFumigacion(
  lote: LoteSeleccionado,
  mezcla: Mezcla
): CalculosPorLote {
  const total_arboles = lote.conteo_arboles.total;
  const calibracion = lote.calibracion_litros_arbol || 0;
  const tamano_caneca = lote.tamano_caneca || 200;

  // Paso 1: Calcular litros de mezcla total
  const litros_mezcla = total_arboles * calibracion;

  // Paso 2: Calcular número de canecas
  const numero_canecas = litros_mezcla / tamano_caneca;

  // Paso 3: Calcular cantidad de cada producto
  const productos = mezcla.productos.map(producto => {
    const dosis_por_caneca = producto.dosis_por_caneca || 0;
    
    // La dosis está en cc o gramos, dividimos entre 1000 para convertir a litros o kilos
    const cantidad_necesaria = (numero_canecas * dosis_por_caneca) / 1000;

    return {
      producto_id: producto.producto_id,
      cantidad_necesaria: Math.ceil(cantidad_necesaria * 100) / 100 // Redondear a 2 decimales
    };
  });

  return {
    lote_id: lote.lote_id,
    lote_nombre: lote.nombre,
    total_arboles,
    litros_mezcla: Math.ceil(litros_mezcla * 100) / 100,
    numero_canecas: Math.ceil(numero_canecas * 100) / 100,
    productos
  };
}

/**
 * CÁLCULOS PARA FERTILIZACIÓN
 * Fórmulas según documento de diseño:
 * - Kilos por árbol según tamaño (Grande/Mediano/Clonal)
 * - Kilos totales por lote = Σ(árboles de cada tamaño × dosis correspondiente)
 * - Bultos necesarios = Kilos totales / Tamaño de bulto
 */
export function calcularFertilizacion(
  lote: LoteSeleccionado,
  mezcla: Mezcla
): CalculosPorLote {
  // Calcular kilos por cada tipo de árbol para cada producto
  let kilos_grandes_total = 0;
  let kilos_medianos_total = 0;
  let kilos_pequenos_total = 0;
  let kilos_clonales_total = 0;

  const productos = mezcla.productos.map(producto => {
    // Calcular kilos por cada tipo de árbol
    const kilos_grandes = lote.conteo_arboles.grandes * (producto.dosis_grandes || 0);
    const kilos_medianos = lote.conteo_arboles.medianos * (producto.dosis_medianos || 0);
    const kilos_pequenos = lote.conteo_arboles.pequenos * (producto.dosis_pequenos || 0);
    const kilos_clonales = lote.conteo_arboles.clonales * (producto.dosis_clonales || 0);

    // Acumular para totales
    kilos_grandes_total += kilos_grandes;
    kilos_medianos_total += kilos_medianos;
    kilos_pequenos_total += kilos_pequenos;
    kilos_clonales_total += kilos_clonales;

    // Total de kilos para este producto en este lote
    const cantidad_necesaria = kilos_grandes + kilos_medianos + kilos_pequenos + kilos_clonales;

    return {
      producto_id: producto.producto_id,
      cantidad_necesaria: Math.ceil(cantidad_necesaria * 100) / 100
    };
  });

  // Calcular total de kilos de todos los productos
  const kilos_totales = productos.reduce((sum, p) => sum + p.cantidad_necesaria, 0);

  // Calcular número de bultos (asumiendo bulto promedio de 25kg)
  // En la práctica, cada producto puede tener diferente presentación
  const numero_bultos = Math.ceil(kilos_totales / 25);

  return {
    lote_id: lote.lote_id,
    lote_nombre: lote.nombre,
    total_arboles: lote.conteo_arboles.total,
    kilos_totales: Math.ceil(kilos_totales * 100) / 100,
    numero_bultos,
    kilos_grandes: Math.ceil(kilos_grandes_total * 100) / 100,
    kilos_medianos: Math.ceil(kilos_medianos_total * 100) / 100,
    kilos_pequenos: Math.ceil(kilos_pequenos_total * 100) / 100,
    kilos_clonales: Math.ceil(kilos_clonales_total * 100) / 100,
    productos
  };
}

/**
 * CALCULAR TOTALES DE PRODUCTOS
 * Suma las cantidades necesarias de cada producto en todos los lotes
 */
export function calcularTotalesProductos(
  calculos: CalculosPorLote[],
  mezclas: Mezcla[]
): ProductoEnMezcla[] {
  // Crear mapa de productos únicos
  const productosMap = new Map<string, ProductoEnMezcla>();

  // Obtener todos los productos de las mezclas
  mezclas.forEach(mezcla => {
    mezcla.productos.forEach(producto => {
      if (!productosMap.has(producto.producto_id)) {
        productosMap.set(producto.producto_id, {
          ...producto,
          cantidad_total_necesaria: 0
        });
      }
    });
  });

  // Sumar cantidades de cada lote
  calculos.forEach(calculo => {
    calculo.productos.forEach(item => {
      const producto = productosMap.get(item.producto_id);
      if (producto) {
        producto.cantidad_total_necesaria += item.cantidad_necesaria;
      }
    });
  });

  // Redondear totales
  productosMap.forEach(producto => {
    producto.cantidad_total_necesaria = Math.ceil(producto.cantidad_total_necesaria * 100) / 100;
  });

  return Array.from(productosMap.values());
}

/**
 * GENERAR LISTA DE COMPRAS
 * Cruza cantidades necesarias con inventario disponible
 * Fórmula: Cantidad a comprar = Max(0, Necesario - Disponible)
 */
export function generarListaCompras(
  productosNecesarios: ProductoEnMezcla[],
  inventario: ProductoCatalogo[]
): ListaCompras {
  const items: ItemListaCompras[] = [];
  let costo_total = 0;
  let productos_sin_precio = 0;
  let productos_sin_stock = 0;

  productosNecesarios.forEach(productoNecesario => {
    // Buscar producto en inventario
    const productoInventario = inventario.find(p => p.id === productoNecesario.producto_id);

    if (!productoInventario) {
      console.warn(`Producto ${productoNecesario.producto_nombre} no encontrado en inventario`);
      return;
    }

    const inventario_actual = productoInventario.cantidad_actual || 0;
    const cantidad_necesaria = productoNecesario.cantidad_total_necesaria;
    const cantidad_faltante = Math.max(0, cantidad_necesaria - inventario_actual);

    // Calcular unidades a comprar según presentación
    // Ejemplo: si falta 150kg y el bulto es de 25kg, comprar 6 bultos
    const presentacion_size = extraerTamanoPresentacion(productoInventario.presentacion_comercial);
    const unidades_a_comprar = cantidad_faltante > 0 
      ? Math.ceil(cantidad_faltante / presentacion_size) 
      : 0;

    // Calcular costo
    const precio_unitario = productoInventario.ultimo_precio_unitario || 0;
    const costo_estimado = unidades_a_comprar * presentacion_size * precio_unitario;

    // Determinar alerta
    let alerta: 'sin_precio' | 'sin_stock' | 'normal' = 'normal';
    if (!precio_unitario || precio_unitario === 0) {
      alerta = 'sin_precio';
      productos_sin_precio++;
    }
    if (inventario_actual === 0 && cantidad_faltante > 0) {
      productos_sin_stock++;
    }

    costo_total += costo_estimado;

    items.push({
      producto_id: productoNecesario.producto_id,
      producto_nombre: productoNecesario.producto_nombre,
      producto_categoria: productoNecesario.producto_categoria,
      unidad: productoNecesario.producto_unidad,
      inventario_actual,
      cantidad_necesaria,
      cantidad_faltante,
      presentacion_comercial: productoInventario.presentacion_comercial,
      unidades_a_comprar,
      ultimo_precio_unitario: precio_unitario,
      costo_estimado,
      alerta
    });
  });

  return {
    items,
    costo_total_estimado: Math.ceil(costo_total),
    productos_sin_precio,
    productos_sin_stock
  };
}

/**
 * Extrae el tamaño numérico de una presentación comercial
 * Ejemplos: "Bulto de 25kg" -> 25, "Tarro de 1L" -> 1, "Bolsa 50kg" -> 50
 */
function extraerTamanoPresentacion(presentacion: string): number {
  const match = presentacion.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 1;
}

/**
 * FORMATEAR MONEDA (PESOS COLOMBIANOS)
 */
export function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(valor);
}

/**
 * FORMATEAR NÚMERO CON SEPARADOR DE MILES
 */
export function formatearNumero(valor: number, decimales: number = 2): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  }).format(valor);
}

/**
 * VALIDAR CONFIGURACIÓN DE LOTE PARA FUMIGACIÓN
 */
export function validarLoteFumigacion(lote: LoteSeleccionado): string | null {
  if (!lote.calibracion_litros_arbol || lote.calibracion_litros_arbol <= 0) {
    return `El lote ${lote.nombre} necesita calibración (L/árbol)`;
  }
  if (!lote.tamano_caneca) {
    return `El lote ${lote.nombre} necesita tamaño de caneca`;
  }
  return null;
}

/**
 * VALIDAR PRODUCTO EN MEZCLA DE FUMIGACIÓN
 */
export function validarProductoFumigacion(producto: ProductoEnMezcla): string | null {
  if (!producto.dosis_por_caneca || producto.dosis_por_caneca <= 0) {
    return `${producto.producto_nombre} necesita dosis por caneca`;
  }
  return null;
}

/**
 * VALIDAR PRODUCTO EN MEZCLA DE FERTILIZACIÓN
 */
export function validarProductoFertilizacion(producto: ProductoEnMezcla): string | null {
  const tiene_dosis = producto.dosis_grandes || producto.dosis_medianos || 
                     producto.dosis_pequenos || producto.dosis_clonales;
  
  if (!tiene_dosis) {
    return `${producto.producto_nombre} necesita al menos una dosis por tipo de árbol`;
  }
  return null;
}