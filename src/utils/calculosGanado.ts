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

export interface TrasladoParams {
  fecha: string;
  potreroOrigenId: string;
  potreroDestinoId: string;
  novillos: number;
  toros: number;
  pesoPromedioKg?: number | null;
  notas?: string | null;
}

/**
 * Un traslado son dos movimientos: salida en origen (deltas negativos)
 * y entrada en destino (deltas positivos).
 */
export function construirMovimientosTraslado(params: TrasladoParams): {
  tipo: 'traslado_salida' | 'traslado_entrada';
  fecha: string;
  potrero_origen_id: string | null;
  potrero_destino_id: string | null;
  novillos_delta: number;
  toros_delta: number;
  peso_promedio_kg: number | null;
  notas: string | null;
}[] {
  const notas = params.notas || null;
  const peso = params.pesoPromedioKg ?? null;
  return [
    {
      tipo: 'traslado_salida',
      fecha: params.fecha,
      potrero_origen_id: params.potreroOrigenId,
      potrero_destino_id: null,
      novillos_delta: -params.novillos,
      toros_delta: -params.toros,
      peso_promedio_kg: null,
      notas,
    },
    {
      tipo: 'traslado_entrada',
      fecha: params.fecha,
      potrero_origen_id: null,
      potrero_destino_id: params.potreroDestinoId,
      novillos_delta: params.novillos,
      toros_delta: params.toros,
      peso_promedio_kg: peso,
      notas,
    },
  ];
}

/**
 * Valida el split novillos/toros al confirmar un movimiento pendiente.
 * La suma debe igualar las cabezas de la transacción original.
 */
export function validarSplitConfirmacion(
  novillos: number,
  toros: number,
  cabezasTransaccion: number
): string | null {
  if (!Number.isInteger(novillos) || !Number.isInteger(toros) || novillos < 0 || toros < 0) {
    return 'Novillos y toros deben ser enteros no negativos';
  }
  if (novillos + toros !== cabezasTransaccion) {
    return `La suma debe ser ${cabezasTransaccion} cabezas (hay ${novillos + toros})`;
  }
  return null;
}

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
