// Validaciones y cálculos para movimientos diarios
import type {
  MovimientoDiario,
  ResumenMovimientosDiarios,
  AlertaMovimientoDiario,
  ProductoEnMezcla
} from '../types/aplicaciones';

/**
 * Calcula el resumen de movimientos diarios por producto
 * comparando con las cantidades planeadas
 */
export function calcularResumenMovimientos(
  movimientos: MovimientoDiario[],
  productosPlaneados: ProductoEnMezcla[]
): ResumenMovimientosDiarios[] {
  // Agrupar movimientos por producto
  const movimientosPorProducto = new Map<string, number>();

  movimientos.forEach(mov => {
    const totalActual = movimientosPorProducto.get(mov.producto_id) || 0;
    movimientosPorProducto.set(mov.producto_id, totalActual + mov.cantidad_utilizada);
  });

  // Calcular resumen para cada producto planeado
  const resumen: ResumenMovimientosDiarios[] = productosPlaneados.map(producto => {
    const totalUtilizado = movimientosPorProducto.get(producto.producto_id) || 0;
    const diferencia = producto.cantidad_total_necesaria - totalUtilizado;
    const porcentajeUsado = producto.cantidad_total_necesaria > 0
      ? (totalUtilizado / producto.cantidad_total_necesaria) * 100
      : 0;
    const excedePlaneado = totalUtilizado > producto.cantidad_total_necesaria;

    return {
      producto_id: producto.producto_id,
      producto_nombre: producto.producto_nombre,
      total_utilizado: totalUtilizado,
      cantidad_planeada: producto.cantidad_total_necesaria,
      diferencia,
      porcentaje_usado: porcentajeUsado,
      excede_planeado: excedePlaneado,
    };
  });

  return resumen;
}

/**
 * Genera alertas basadas en el resumen de movimientos
 */
export function generarAlertas(
  resumen: ResumenMovimientosDiarios[]
): AlertaMovimientoDiario[] {
  const alertas: AlertaMovimientoDiario[] = [];

  resumen.forEach(producto => {
    // Alerta si se excede lo planeado
    if (producto.excede_planeado) {
      alertas.push({
        tipo: 'error',
        producto_nombre: producto.producto_nombre,
        mensaje: `Se ha excedido lo planeado en ${Math.abs(producto.diferencia).toFixed(2)} unidades`,
        porcentaje_usado: producto.porcentaje_usado,
      });
    }
    // Alerta si se ha usado más del 90%
    else if (producto.porcentaje_usado >= 90 && producto.porcentaje_usado < 100) {
      alertas.push({
        tipo: 'warning',
        producto_nombre: producto.producto_nombre,
        mensaje: `Se ha utilizado el ${producto.porcentaje_usado.toFixed(0)}% de lo planeado`,
        porcentaje_usado: producto.porcentaje_usado,
      });
    }
    // Info si está entre 75% y 90%
    else if (producto.porcentaje_usado >= 75 && producto.porcentaje_usado < 90) {
      alertas.push({
        tipo: 'info',
        producto_nombre: producto.producto_nombre,
        mensaje: `Llevas el ${producto.porcentaje_usado.toFixed(0)}% de lo planeado`,
        porcentaje_usado: producto.porcentaje_usado,
      });
    }
  });

  return alertas;
}

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
 * Agrupa movimientos por fecha
 */
export function agruparMovimientosPorFecha(
  movimientos: MovimientoDiario[]
): Map<string, MovimientoDiario[]> {
  const grupos = new Map<string, MovimientoDiario[]>();

  movimientos.forEach(mov => {
    const fecha = mov.fecha_movimiento;
    const grupo = grupos.get(fecha) || [];
    grupo.push(mov);
    grupos.set(fecha, grupo);
  });

  return grupos;
}

/**
 * Agrupa movimientos por lote
 */
export function agruparMovimientosPorLote(
  movimientos: MovimientoDiario[]
): Map<string, MovimientoDiario[]> {
  const grupos = new Map<string, MovimientoDiario[]>();

  movimientos.forEach(mov => {
    const loteId = mov.lote_id;
    const grupo = grupos.get(loteId) || [];
    grupo.push(mov);
    grupos.set(loteId, grupo);
  });

  return grupos;
}

/**
 * Calcula estadísticas generales de movimientos
 */
export function calcularEstadisticas(movimientos: MovimientoDiario[]) {
  const totalMovimientos = movimientos.length;
  const fechasUnicas = new Set(movimientos.map(m => m.fecha_movimiento)).size;
  const lotesUnicos = new Set(movimientos.map(m => m.lote_id)).size;
  const productosUnicos = new Set(movimientos.map(m => m.producto_id)).size;
  const responsablesUnicos = new Set(movimientos.map(m => m.responsable)).size;

  const fechaInicio = movimientos.length > 0
    ? new Date(Math.min(...movimientos.map(m => new Date(m.fecha_movimiento).getTime())))
    : null;

  const fechaFin = movimientos.length > 0
    ? new Date(Math.max(...movimientos.map(m => new Date(m.fecha_movimiento).getTime())))
    : null;

  const diasTranscurridos = fechaInicio && fechaFin
    ? Math.ceil((fechaFin.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;

  return {
    totalMovimientos,
    fechasUnicas,
    lotesUnicos,
    productosUnicos,
    responsablesUnicos,
    fechaInicio,
    fechaFin,
    diasTranscurridos,
    promedioMovimientosPorDia: diasTranscurridos > 0 ? totalMovimientos / diasTranscurridos : 0,
  };
}

/**
 * Valida si la fecha del movimiento está dentro del rango válido
 */
export function validarFechaMovimiento(
  fechaMovimiento: string,
  fechaInicioAplicacion: string,
  fechaCierreAplicacion?: string
): { valido: boolean; mensaje?: string } {
  const fecha = new Date(fechaMovimiento);
  const fechaInicio = new Date(fechaInicioAplicacion);
  const hoy = new Date();

  // No puede ser anterior a la fecha de inicio
  if (fecha < fechaInicio) {
    return {
      valido: false,
      mensaje: 'La fecha no puede ser anterior al inicio de la aplicación',
    };
  }

  // No puede ser futura
  if (fecha > hoy) {
    return {
      valido: false,
      mensaje: 'La fecha no puede ser futura',
    };
  }

  // Si la aplicación está cerrada, no puede ser posterior al cierre
  if (fechaCierreAplicacion) {
    const fechaCierre = new Date(fechaCierreAplicacion);
    if (fecha > fechaCierre) {
      return {
        valido: false,
        mensaje: 'La fecha no puede ser posterior al cierre de la aplicación',
      };
    }
  }

  return { valido: true };
}

/**
 * Exporta datos de movimientos a formato CSV
 */
export function exportarMovimientosACSV(movimientos: MovimientoDiario[]): string {
  const headers = [
    'Fecha',
    'Lote',
    'Producto',
    'Cantidad',
    'Unidad',
    'Responsable',
    'Notas'
  ];

  const rows = movimientos.map(mov => [
    mov.fecha_movimiento,
    mov.lote_nombre,
    mov.producto_nombre,
    mov.cantidad_utilizada.toString(),
    mov.producto_unidad,
    mov.responsable,
    mov.notas || ''
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csv;
}

/**
 * Genera un reporte de texto de los movimientos
 */
export function generarReporteTexto(
  movimientos: MovimientoDiario[],
  resumen: ResumenMovimientosDiarios[]
): string {
  const stats = calcularEstadisticas(movimientos);

  let reporte = '=== REPORTE DE MOVIMIENTOS DIARIOS ===\n\n';

  reporte += `Total de movimientos: ${stats.totalMovimientos}\n`;
  reporte += `Días registrados: ${stats.fechasUnicas}\n`;
  reporte += `Lotes trabajados: ${stats.lotesUnicos}\n`;
  reporte += `Productos utilizados: ${stats.productosUnicos}\n`;
  reporte += `Responsables: ${stats.responsablesUnicos}\n\n`;

  if (stats.fechaInicio && stats.fechaFin) {
    reporte += `Período: ${stats.fechaInicio.toLocaleDateString('es-CO')} - ${stats.fechaFin.toLocaleDateString('es-CO')}\n`;
    reporte += `Duración: ${stats.diasTranscurridos} días\n\n`;
  }

  reporte += '=== RESUMEN POR PRODUCTO ===\n\n';

  resumen.forEach(prod => {
    reporte += `${prod.producto_nombre}:\n`;
    reporte += `  - Planeado: ${prod.cantidad_planeada.toFixed(2)}\n`;
    reporte += `  - Utilizado: ${prod.total_utilizado.toFixed(2)}\n`;
    reporte += `  - Diferencia: ${prod.diferencia.toFixed(2)}\n`;
    reporte += `  - Porcentaje: ${prod.porcentaje_usado.toFixed(1)}%\n`;
    reporte += `  - Estado: ${prod.excede_planeado ? '⚠️ EXCEDIDO' : '✓ Normal'}\n\n`;
  });

  return reporte;
}
