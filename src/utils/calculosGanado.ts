// Lógica pura del inventario de ganado (issue #51).
// Sin dependencias de Supabase para que sea testeable desde Vitest.

import type {
  GanMovimiento,
  InventarioPotreroRow,
  KPIsInventarioGanado,
  VariacionInventario,
} from '@/types/ganado';

/**
 * KPIs del inventario actual. Las hectáreas se cuentan una sola vez por
 * finca (las filas vienen por potrero, varias por finca).
 */
export function calcularKPIsInventario(rows: InventarioPotreroRow[]): KPIsInventarioGanado {
  let totalNovillos = 0;
  let totalToros = 0;
  const fincasVistas = new Map<string, number>(); // finca_id -> hectareas
  const ubicaciones = new Map<string, { cabezas: number; fincas: Map<string, number> }>();

  rows.forEach((r) => {
    totalNovillos += r.novillos;
    totalToros += r.toros;
    fincasVistas.set(r.finca_id, r.hectareas);

    const key = r.ubicacion || 'Sin ubicación';
    if (!ubicaciones.has(key)) {
      ubicaciones.set(key, { cabezas: 0, fincas: new Map() });
    }
    const u = ubicaciones.get(key)!;
    u.cabezas += r.novillos + r.toros;
    u.fincas.set(r.finca_id, r.hectareas);
  });

  const hectareasTotales = Array.from(fincasVistas.values()).reduce((s, h) => s + h, 0);
  const totalCabezas = totalNovillos + totalToros;

  return {
    totalCabezas,
    totalNovillos,
    totalToros,
    hectareasTotales,
    cabezasPorHa: hectareasTotales > 0 ? totalCabezas / hectareasTotales : null,
    porUbicacion: Array.from(ubicaciones.entries())
      .map(([ubicacion, u]) => {
        const ha = Array.from(u.fincas.values()).reduce((s, h) => s + h, 0);
        return {
          ubicacion,
          cabezas: u.cabezas,
          hectareas: ha,
          cabezasPorHa: ha > 0 ? u.cabezas / ha : null,
        };
      })
      .sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, 'es')),
  };
}

/**
 * Cabezas/ha de una finca: total de cabezas de sus potreros / hectáreas.
 */
export function cabezasPorHaFinca(rows: InventarioPotreroRow[], fincaId: string): number | null {
  const deFinca = rows.filter((r) => r.finca_id === fincaId);
  if (deFinca.length === 0) return null;
  const cabezas = deFinca.reduce((s, r) => s + r.novillos + r.toros, 0);
  const ha = deFinca[0].hectareas;
  return ha > 0 ? cabezas / ha : null;
}

/**
 * Variación de inventario: entradas vs salidas de movimientos confirmados
 * dentro de la ventana (los deltas vienen con signo).
 */
export function calcularVariacion(
  movimientos: Pick<GanMovimiento, 'estado' | 'fecha' | 'novillos_delta' | 'toros_delta'>[],
  fechaDesde: string
): VariacionInventario {
  let entradas = 0;
  let salidas = 0;
  movimientos.forEach((m) => {
    if (m.estado !== 'confirmado' || m.fecha < fechaDesde) return;
    const delta = m.novillos_delta + m.toros_delta;
    if (delta > 0) entradas += delta;
    else salidas += -delta;
  });
  return { entradas, salidas, neto: entradas - salidas };
}

// ---------------------------------------------------------------------------
// Reparto de cabezas entre varios potreros. Una compra/venta rara vez cae en
// un solo potrero: el lote llega repartido y sale repartido. Cada fila es un
// potrero con su propio split novillos/toros; el total es lo que tiene que
// cerrar contra la transacción de finanzas.
// ---------------------------------------------------------------------------

export interface RepartoFila {
  potrero_id: string;
  novillos: number;
  toros: number;
}

/** Filas que aportan cabezas — las vacías se ignoran, no son un error. */
export function filasConCabezas(filas: RepartoFila[]): RepartoFila[] {
  return filas.filter((f) => f.novillos + f.toros > 0);
}

export function totalCabezasReparto(filas: RepartoFila[]): number {
  return filas.reduce((s, f) => s + f.novillos + f.toros, 0);
}

export function totalNovillosReparto(filas: RepartoFila[]): number {
  return filas.reduce((s, f) => s + f.novillos, 0);
}

export function totalTorosReparto(filas: RepartoFila[]): number {
  return filas.reduce((s, f) => s + f.toros, 0);
}

/**
 * Validación común a cualquier reparto: enteros no negativos, potrero
 * seleccionado en toda fila con cabezas, sin potreros repetidos y al menos
 * una fila con cabezas. No mira totales — eso lo hace cada validador.
 */
function validarFilasReparto(filas: RepartoFila[], etiqueta: string): string | null {
  const conCabezas = filasConCabezas(filas);
  if (conCabezas.length === 0) return `Ingresa al menos una cabeza en ${etiqueta}`;
  for (const f of filas) {
    if (!Number.isInteger(f.novillos) || !Number.isInteger(f.toros) || f.novillos < 0 || f.toros < 0) {
      return 'Novillos y toros deben ser enteros no negativos';
    }
  }
  if (conCabezas.some((f) => !f.potrero_id)) {
    return `Selecciona el potrero de cada fila con cabezas en ${etiqueta}`;
  }
  const ids = conCabezas.map((f) => f.potrero_id);
  if (new Set(ids).size !== ids.length) return `Hay un potrero repetido en ${etiqueta}`;
  return null;
}

/**
 * Valida el reparto al confirmar un movimiento pendiente de compra/venta.
 * El total debe igualar exactamente las cabezas de la transacción original.
 */
export function validarRepartoConfirmacion(
  filas: RepartoFila[],
  cabezasTransaccion: number
): string | null {
  const base = validarFilasReparto(filas, 'el reparto');
  if (base) return base;
  const total = totalCabezasReparto(filasConCabezas(filas));
  if (total !== cabezasTransaccion) {
    return `La suma debe ser ${cabezasTransaccion} cabezas (hay ${total})`;
  }
  return null;
}

/**
 * Valida que cada potrero de origen tenga las cabezas que se le quieren
 * sacar. El CHECK de gan_inventario es la red de seguridad real; esto
 * evita que el usuario descubra el problema como un error de base.
 */
export function validarExistencias(
  filas: RepartoFila[],
  inventarioPorPotrero: Record<string, { novillos: number; toros: number }>,
  nombrePotrero: (potreroId: string) => string
): string | null {
  for (const f of filasConCabezas(filas)) {
    const inv = inventarioPorPotrero[f.potrero_id] || { novillos: 0, toros: 0 };
    if (f.novillos > inv.novillos) {
      return `${nombrePotrero(f.potrero_id)} tiene ${inv.novillos} novillos y estás sacando ${f.novillos}`;
    }
    if (f.toros > inv.toros) {
      return `${nombrePotrero(f.potrero_id)} tiene ${inv.toros} toros y estás sacando ${f.toros}`;
    }
  }
  return null;
}

export interface TrasladoMultiParams {
  fecha: string;
  origenes: RepartoFila[];
  destinos: RepartoFila[];
  pesoPromedioKg?: number | null;
  notas?: string | null;
}

/**
 * Valida un traslado repartido: los totales de novillos y de toros deben
 * coincidir por separado entre ambos lados (no se puede sacar novillos y
 * meter toros), y un mismo potrero no puede estar en los dos lados.
 */
export function validarTrasladoMulti(params: TrasladoMultiParams): string | null {
  const errorOrigen = validarFilasReparto(params.origenes, 'el origen');
  if (errorOrigen) return errorOrigen;
  const errorDestino = validarFilasReparto(params.destinos, 'el destino');
  if (errorDestino) return errorDestino;

  const origenes = filasConCabezas(params.origenes);
  const destinos = filasConCabezas(params.destinos);

  const idsOrigen = new Set(origenes.map((f) => f.potrero_id));
  if (destinos.some((f) => idsOrigen.has(f.potrero_id))) {
    return 'Un mismo potrero no puede ser origen y destino del traslado';
  }

  const novillosOrigen = totalNovillosReparto(origenes);
  const novillosDestino = totalNovillosReparto(destinos);
  const torosOrigen = totalTorosReparto(origenes);
  const torosDestino = totalTorosReparto(destinos);

  if (novillosOrigen !== novillosDestino) {
    return `Salen ${novillosOrigen} novillos y entran ${novillosDestino}`;
  }
  if (torosOrigen !== torosDestino) {
    return `Salen ${torosOrigen} toros y entran ${torosDestino}`;
  }
  return null;
}

// Las filas del traslado se envían tal cual al RPC
// fn_ganado_registrar_traslado_multi (migración 097), que construye ahí las
// N salidas y las M entradas en una sola transacción. La construcción vive
// solo en el RPC para no tener dos implementaciones del mismo reparto.

/**
 * Cabezas absolutas de un movimiento pendiente (el trigger precarga el
 * total con signo en novillos_delta).
 */
export function cabezasDePendiente(m: Pick<GanMovimiento, 'novillos_delta' | 'toros_delta'>): number {
  return Math.abs(m.novillos_delta + m.toros_delta);
}

export interface AjusteMasivoFila {
  potrero_id: string;
  novillosActual: number;
  torosActual: number;
  novillosNuevo: number;
  torosNuevo: number;
}

/**
 * Genera movimientos de tipo `ajuste` solo para las filas que cambiaron.
 */
export function construirAjustesMasivos(
  filas: AjusteMasivoFila[],
  fecha: string,
  nota: string
): {
  tipo: 'ajuste';
  fecha: string;
  potrero_destino_id: string;
  novillos_delta: number;
  toros_delta: number;
  notas: string;
}[] {
  return filas
    .filter((f) => f.novillosNuevo !== f.novillosActual || f.torosNuevo !== f.torosActual)
    .map((f) => ({
      tipo: 'ajuste' as const,
      fecha,
      potrero_destino_id: f.potrero_id,
      novillos_delta: f.novillosNuevo - f.novillosActual,
      toros_delta: f.torosNuevo - f.torosActual,
      notas: nota,
    }));
}

// ---------------------------------------------------------------------------
// Carga de inventario inicial por finca: las cabezas entran como `ajuste`
// al potrero "General" de cada finca (creado automáticamente si no existe).
// ---------------------------------------------------------------------------

export interface CargaInicialFila {
  finca_id: string;
  novillos: number;
  toros: number;
}

/**
 * Valida la carga inicial: nota obligatoria, enteros no negativos y al
 * menos una finca con cabezas.
 */
export function validarCargaInicial(filas: CargaInicialFila[], nota: string): string | null {
  if (!nota.trim()) return 'La nota de la carga inicial es obligatoria';
  for (const f of filas) {
    if (!Number.isInteger(f.novillos) || !Number.isInteger(f.toros) || f.novillos < 0 || f.toros < 0) {
      return 'Novillos y toros deben ser enteros no negativos';
    }
  }
  if (!filas.some((f) => f.novillos > 0 || f.toros > 0)) {
    return 'Ingresa al menos una cabeza en alguna finca';
  }
  return null;
}

/**
 * Convierte las filas por finca en movimientos `ajuste` confirmados sobre
 * el potrero asignado a cada finca (mapa finca_id → potrero_id). Las
 * fincas en 0 se omiten.
 */
export function construirMovimientosCargaInicial(
  filas: CargaInicialFila[],
  potreroPorFinca: Record<string, string>,
  fecha: string,
  nota: string
): {
  tipo: 'ajuste';
  estado: 'confirmado';
  fecha: string;
  potrero_destino_id: string;
  novillos_delta: number;
  toros_delta: number;
  notas: string;
}[] {
  return filas
    .filter((f) => (f.novillos > 0 || f.toros > 0) && potreroPorFinca[f.finca_id])
    .map((f) => ({
      tipo: 'ajuste' as const,
      estado: 'confirmado' as const,
      fecha,
      potrero_destino_id: potreroPorFinca[f.finca_id],
      novillos_delta: f.novillos,
      toros_delta: f.toros,
      notas: nota,
    }));
}
