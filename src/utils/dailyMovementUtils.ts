// Validaciones y cálculos para movimientos diarios

import type {
  MovimientoDiario,
  ProductoEnMezcla
} from '../types/aplicaciones';

/**
 * Valida si un nuevo movimiento excedería lo planeado
 */
export function validarNuevoMovimiento(
  productoId: string,
  cantidadNueva: number,
  movimientosExistentes: MovimientoDiario[],
  productosPlaneados: ProductoEnMezcla[]
): { valido: boolean; mensaje?: string; porcentaje?: number } {
  // Buscar el producto planeado
  const productoPlaneado = productosPlaneados.find(p => p.producto_id === productoId);

  if (!productoPlaneado) {
    return {
      valido: false,
      mensaje: 'Producto no encontrado en la planificación',
    };
  }

  // Calcular total ya utilizado
  const totalUtilizado = movimientosExistentes
    .filter(m => m.producto_id === productoId)
    .reduce((sum, m) => sum + m.cantidad_utilizada, 0);

  // Calcular nuevo total
  const nuevoTotal = totalUtilizado + cantidadNueva;
  const porcentaje = (nuevoTotal / productoPlaneado.cantidad_total_necesaria) * 100;

  // Validar si excede
  if (nuevoTotal > productoPlaneado.cantidad_total_necesaria) {
    const exceso = nuevoTotal - productoPlaneado.cantidad_total_necesaria;
    return {
      valido: false,
      mensaje: `Esta cantidad excedería lo planeado en ${exceso.toFixed(2)} ${productoPlaneado.producto_unidad}`,
      porcentaje,
    };
  }

  return { valido: true, porcentaje };
}

/**
 * Valida los datos del formulario de movimiento
 */
export function validarFormularioMovimiento(datos: {
  fechaMovimiento: string;
  loteId: string;
  productoId: string;
  cantidadUtilizada: string;
  responsable: string;
  notas: string;
  numeroCanecasUtilizadas?: string;
  esFumigacion?: boolean;
  tieneCanecasPlaneadas?: boolean;
}): { valido: boolean; mensaje?: string } {
  if (!datos.fechaMovimiento) {
    return { valido: false, mensaje: 'Debes seleccionar una fecha' };
  }

  if (!datos.loteId) {
    return { valido: false, mensaje: 'Debes seleccionar un lote' };
  }

  if (!datos.productoId) {
    return { valido: false, mensaje: 'Debes seleccionar un producto' };
  }

  if (!datos.cantidadUtilizada || parseFloat(datos.cantidadUtilizada) <= 0) {
    return { valido: false, mensaje: 'Debes ingresar una cantidad válida mayor a 0' };
  }

  // Validar canecas si es fumigación con canecas planeadas
  if (datos.esFumigacion && datos.tieneCanecasPlaneadas) {
    if (!datos.numeroCanecasUtilizadas || parseInt(datos.numeroCanecasUtilizadas) <= 0) {
      return { valido: false, mensaje: 'Debes ingresar el número de canecas utilizadas' };
    }
  }

  if (!datos.responsable || datos.responsable.trim() === '') {
    return { valido: false, mensaje: 'Debes ingresar el nombre del responsable' };
  }

  return { valido: true };
}

/**
 * Exporta movimientos diarios a formato CSV
 */
export function exportarMovimientosACSV(
  movimientos: MovimientoDiario[],
  nombreAplicacion: string
): string {
  // Verificar si hay movimientos con datos de canecas
  const tieneCanecas = movimientos.some(m => m.numero_canecas_utilizadas !== undefined);

  // Headers del CSV
  const headers = [
    'Fecha',
    'Lote',
    'Producto',
    'Categoría',
    'Cantidad',
    'Unidad',
    ...(tieneCanecas ? ['Canecas Utilizadas', 'Canecas Planeadas'] : []),
    'Responsable',
    'Notas',
    'Fecha Registro'
  ].join(',');

  // Convertir movimientos a filas CSV
  const filas = movimientos.map(m => [
    m.fecha_movimiento,
    `"${m.lote_nombre}"`,
    `"${m.producto_nombre}"`,
    `"${m.producto_categoria}"`,
    m.cantidad_utilizada,
    m.producto_unidad,
    ...(tieneCanecas ? [
      m.numero_canecas_utilizadas || '',
      m.numero_canecas_planeadas || ''
    ] : []),
    `"${m.responsable}"`,
    `"${m.notas || ''}"`,
    m.creado_en ? new Date(m.creado_en).toLocaleString('es-CO') : ''
  ].join(','));

  // Combinar headers y filas
  return [headers, ...filas].join('\n');
}

/**
 * Descarga un string como archivo CSV
 */
export function descargarCSV(contenido: string, nombreArchivo: string): void {
  // Crear blob con BOM para UTF-8
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + contenido], { type: 'text/csv;charset=utf-8;' });
  
  // Crear URL del blob
  const url = URL.createObjectURL(blob);
  
  // Crear elemento <a> temporal
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo;
  
  // Simular click
  document.body.appendChild(link);
  link.click();
  
  // Limpiar
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}