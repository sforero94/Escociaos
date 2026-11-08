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

// ============================================================================
// COBERTURA DE UNA LÍNEA CON PRODUCTOS ALTERNATIVOS (ESCO-171, PRD §5)
// ============================================================================
//
// Una línea del plan puede completarse con el principal o con cualquiera de sus alternativos
// (cada uno con su dosis). El stock por producto da falsos faltantes (el plan repite 3,13 bajo
// cada uno de tres correctores de pH y la bodega tiene 3,76 entre los tres), así que la línea se
// mide en UNIDADES de aplicación (canecas o bultos de mezcla):
//
//   unidades que cubre un producto = saldo ÷ dosis por unidad
//   cobertura de la línea          = Σ unidades de principal + alternativos
//   unidades ya hechas             = Σ (registrado de cada producto ÷ su dosis)
//   unidades pendientes            = planeadas − hechas
//   aviso si cobertura < pendientes            (todo a 4 decimales)
//
// «Dosis por unidad» se expresa como `requerimiento ÷ unidades planeadas`, donde `requerimiento`
// es lo que ese producto necesitaría (en L o kg) para cubrir TODA la línea. Así la misma fórmula
// vale para fumigación/drench (por caneca) y fertilización (por tamaño de árbol), y para convertir
// cc/g a L/kg no hay nada que hacer aparte. NO es un ranking ni una sugerencia: solo avisa.

/** Orden alfabético en español, sin distinguir mayúsculas ni tildes. El formulario NO sugiere ni
 * prioriza un producto (decisión de Santiago, 2026-11-02): David escoge a criterio. */
export function ordenarOpcionesAlfabeticamente<T extends { producto_nombre: string }>(opciones: readonly T[]): T[] {
  return [...opciones].sort((a, b) =>
    a.producto_nombre.localeCompare(b.producto_nombre, 'es', { sensitivity: 'base' }),
  );
}

/** Convierte lo registrado a la unidad base (L / kg). `movimientos_diarios_productos` ya guarda en
 * L/kg; 'cc' y 'g' solo existen en filas históricas (misma regla que `CierreAplicacion`). */
export function cantidadEnUnidadBase(cantidad: number, unidad: string | null | undefined): number {
  return unidad === 'cc' || unidad === 'g' ? cantidad / 1000 : cantidad;
}

export interface DosisProducto {
  dosis_por_caneca?: number | null;
  dosis_grandes?: number | null;
  dosis_medianos?: number | null;
  dosis_pequenos?: number | null;
  dosis_clonales?: number | null;
}

export interface BaseCalculoLinea {
  /** Σ canecas planeadas de los lotes de la mezcla (fumigación / drench). */
  canecas: number;
  /** Σ árboles por tamaño de los lotes de la mezcla (fertilización). */
  arboles: { grandes: number; medianos: number; pequenos: number; clonales: number };
}

/**
 * Cantidad (L o kg) que un producto necesitaría para cubrir TODA la línea con su dosis.
 * Mismas fórmulas que `calcularFumigacion` / `calcularFertilizacion` (dosis en cc/g → ÷1000),
 * pero sin el redondeo por lote: aquí solo se usa para repartir la cobertura.
 */
export function requerimientoDeLinea(
  porCaneca: boolean,
  dosis: DosisProducto,
  base: BaseCalculoLinea,
): number {
  if (porCaneca) {
    return ((dosis.dosis_por_caneca ?? 0) * base.canecas) / 1000;
  }
  return (
    ((dosis.dosis_grandes ?? 0) * base.arboles.grandes +
      (dosis.dosis_medianos ?? 0) * base.arboles.medianos +
      (dosis.dosis_pequenos ?? 0) * base.arboles.pequenos +
      (dosis.dosis_clonales ?? 0) * base.arboles.clonales) /
    1000
  );
}

export interface OpcionCobertura {
  producto_id: string;
  producto_nombre: string;
  /** L / kg que este producto necesitaría para cubrir toda la línea. <= 0 = sin dosis: no cuenta. */
  requerimiento: number;
  /** `productos.cantidad_actual`; null = sin dato (nunca se trata como 0 en silencio). */
  saldo: number | null;
  /** Ya registrado en movimientos diarios, en L / kg. */
  registrado: number;
}

export interface LineaCoberturaInput {
  linea_id: string;
  unidad: 'canecas' | 'bultos';
  /** Unidades (canecas o bultos de mezcla) planeadas para la línea. */
  unidadesPlaneadas: number;
  /** El principal y sus alternativos. El orden no importa para el cálculo. */
  opciones: OpcionCobertura[];
  /** Nombre con el que se rotula la línea en el aviso (el principal del plan). */
  nombre: string;
}

export interface ResultadoCoberturaLinea {
  linea_id: string;
  nombre: string;
  unidad: 'canecas' | 'bultos';
  planeadas: number;
  hechas: number;
  pendientes: number;
  cobertura: number;
  /** pendientes − cobertura cuando no alcanza; 0 si alcanza. */
  faltan: number;
  alcanza: boolean;
  /** Productos de la línea sin saldo conocido: no aportan cobertura y el aviso debe decirlo. */
  productosSinSaldo: string[];
  /** Productos sin dosis calculable: su stock y su consumo no se pueden convertir a unidades. */
  productosSinDosis: string[];
}

export function calcularCoberturaLinea(linea: LineaCoberturaInput): ResultadoCoberturaLinea {
  const planeadas = redondear4(linea.unidadesPlaneadas);
  let hechasCruda = 0;
  let coberturaCruda = 0;
  const productosSinSaldo: string[] = [];
  const productosSinDosis: string[] = [];

  for (const op of linea.opciones) {
    if (!(op.requerimiento > 0) || !(linea.unidadesPlaneadas > 0)) {
      productosSinDosis.push(op.producto_nombre);
      continue;
    }
    const unidadesPorKgL = linea.unidadesPlaneadas / op.requerimiento;
    hechasCruda += op.registrado * unidadesPorKgL;
    if (op.saldo === null || Number.isNaN(op.saldo)) {
      productosSinSaldo.push(op.producto_nombre);
    } else {
      coberturaCruda += Math.max(0, op.saldo) * unidadesPorKgL;
    }
  }

  const hechas = redondear4(hechasCruda);
  const pendientes = redondear4(Math.max(0, planeadas - hechas));
  const cobertura = redondear4(coberturaCruda);
  const alcanza = cobertura >= pendientes;

  return {
    linea_id: linea.linea_id,
    nombre: linea.nombre,
    unidad: linea.unidad,
    planeadas,
    hechas,
    pendientes,
    cobertura,
    faltan: alcanza ? 0 : redondear4(pendientes - cobertura),
    alcanza,
    productosSinSaldo,
    productosSinDosis,
  };
}
