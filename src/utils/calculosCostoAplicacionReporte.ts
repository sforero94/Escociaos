// Costo REAL de una aplicación, como lo calcula el reporte de aplicación (useReporteAplicacion.ts).
//
// Es la única definición: el reporte la usa y la vista v_esco_aplicaciones (migración 193) la replica en
// SQL; una prueba (escoSqlMigracion193.test.ts) compara las dos sobre los mismos datos. Si cambia una
// regla aquí, la vista tiene que cambiar en la misma migración.
//
// Reglas (todas heredadas del reporte, no inventadas):
//  - Insumos: Σ cantidad_utilizada × precio_unitario ACTUAL del producto (0 si no hay precio), solo de
//    movimientos que tienen lote. NO usa aplicaciones.costo_total_insumos (valor guardado al cerrar).
//  - Mano de obra: si los registros de trabajo de la tarea (con lote) suman jornales > 0, Σ costo_jornal
//    de esos registros (un costo NULL cuenta 0); si no, jornales de respaldo × valor_jornal.
//  - Total = insumos + mano de obra.

export interface RegistroTrabajoCosto {
  lote_id: string | null;
  fraccion_jornal: number | string | null;
  costo_jornal: number | string | null;
}

export interface MovimientoCosto {
  id: string;
  lote_id: string | null;
}

export interface ProductoMovimientoCosto {
  movimiento_diario_id: string;
  cantidad_utilizada: number | string | null;
  /** Precio actual del producto; null/undefined cuenta como 0. */
  precio_unitario: number | string | null | undefined;
}

export interface EntradaCostoAplicacionReal {
  registros: RegistroTrabajoCosto[];
  movimientos: MovimientoCosto[];
  productosMovimiento: ProductoMovimientoCosto[];
  /** aplicaciones.jornales_utilizados: solo se usa si no hay registros de trabajo. */
  jornalesRespaldo: number;
  valorJornal: number;
}

export interface CostoAplicacionReal {
  costoInsumos: number;
  costoManoObra: number;
  costoTotal: number;
  jornales: number;
}

export function calcularCostoAplicacionReal(entrada: EntradaCostoAplicacionReal): CostoAplicacionReal {
  let jornalesRegistros = 0;
  let costoRegistros = 0;
  for (const r of entrada.registros) {
    if (!r.lote_id) continue;
    jornalesRegistros += Number(r.fraccion_jornal) || 0;
    costoRegistros += Number(r.costo_jornal) || 0;
  }

  const jornales = jornalesRegistros > 0 ? jornalesRegistros : entrada.jornalesRespaldo;
  const costoManoObra = jornalesRegistros > 0 ? costoRegistros : entrada.jornalesRespaldo * entrada.valorJornal;

  const lotePorMovimiento = new Map(entrada.movimientos.map((m) => [m.id, m.lote_id]));
  let costoInsumos = 0;
  for (const p of entrada.productosMovimiento) {
    if (!lotePorMovimiento.get(p.movimiento_diario_id)) continue;
    costoInsumos += Number(p.cantidad_utilizada || 0) * Number(p.precio_unitario || 0);
  }

  return { costoInsumos, costoManoObra, costoTotal: costoManoObra + costoInsumos, jornales };
}
