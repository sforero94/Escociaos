/**
 * Stock de insumos frente a una aplicación — lógica pura (ESCO-165).
 *
 * Hoy cubre la verificación ANTES de cerrar: `fn_cerrar_aplicacion` (migración 106) aborta el
 * cierre entero con un RAISE si cualquier producto quedaría en negativo, y el usuario solo veía el
 * texto crudo del error de Postgres. Este módulo compara el consumo registrado contra el saldo
 * de `productos.cantidad_actual` para que la pantalla bloquee el cierre con una lista legible y
 * NO llame al RPC. El RPC sigue siendo la garantía; esto es solo el mensaje entendible.
 */

/** Mismo redondeo que `construirPayloadCierreAplicacion` aplica a `insumos_aplicados`: la suma en
 * coma flotante de muchos consumos chicos da 59,599999999999994 o 59,60000000000001 según el
 * orden de las filas, y la comparación tiene que hacerse sobre el mismo número que viaja al RPC. */
function redondear4(valor: number): number {
  return Math.round(valor * 1e4) / 1e4;
}

export interface ConsumoMovimientoInput {
  producto_id: string;
  producto_nombre: string;
  /** Ya en la unidad base del producto (kg / L), como lo arma `CierreAplicacion`. */
  cantidad_utilizada: number;
}

export interface ConsumoRegistradoProducto {
  producto_id: string;
  producto_nombre: string;
  /** Suma de los consumos del producto, redondeada a 4 decimales. */
  cantidad: number;
}

export interface FaltanteStockCierre {
  producto_id: string;
  producto_nombre: string;
  registrado: number;
  /** `productos.cantidad_actual`; null = no se pudo leer el saldo (sin dato, nunca 0). */
  saldo: number | null;
}

/** Consolida los consumos por producto, en el orden en que aparece cada producto. */
export function consolidarConsumoRegistrado(movimientos: ConsumoMovimientoInput[]): ConsumoRegistradoProducto[] {
  const porProducto = new Map<string, ConsumoRegistradoProducto>();
  for (const mov of movimientos) {
    const actual = porProducto.get(mov.producto_id);
    if (actual) {
      actual.cantidad += mov.cantidad_utilizada;
    } else {
      porProducto.set(mov.producto_id, {
        producto_id: mov.producto_id,
        producto_nombre: mov.producto_nombre,
        cantidad: mov.cantidad_utilizada,
      });
    }
  }
  return Array.from(porProducto.values()).map((c) => ({ ...c, cantidad: redondear4(c.cantidad) }));
}

/**
 * Productos cuyo consumo registrado supera el saldo actual. Lista vacía = el cierre puede seguir.
 * Un producto sin saldo conocido (ausente de `saldos`) entra como faltante con `saldo: null`: el
 * RPC tampoco podría descontarlo, y es mejor bloquear con un motivo visible que dejarlo abortar.
 */
export function calcularFaltantesCierre(
  consumo: ConsumoRegistradoProducto[],
  saldos: ReadonlyMap<string, number | null>,
): FaltanteStockCierre[] {
  const faltantes: FaltanteStockCierre[] = [];
  for (const c of consumo) {
    const registrado = redondear4(c.cantidad);
    if (registrado <= 0) continue;
    const saldoCrudo = saldos.get(c.producto_id);
    const saldo = saldoCrudo === undefined || saldoCrudo === null || Number.isNaN(saldoCrudo) ? null : redondear4(saldoCrudo);
    if (saldo === null || registrado > saldo) {
      faltantes.push({ producto_id: c.producto_id, producto_nombre: c.producto_nombre, registrado, saldo });
    }
  }
  return faltantes;
}
