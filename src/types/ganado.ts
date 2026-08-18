// Tipos del módulo de inventario de ganado (issue #51)
// Jerarquía: Ubicación → Finca (hectáreas) → Lote → Potrero → Inventario
//
// v2 (docs/plan_ganado_inventario_v2_implementacion.md §6.1): agrega el
// nivel "lote" (tabla gan_lotes) y "etapa" productiva del potrero, y
// rediseña el log de movimientos para traslados N→M (migración 097) con
// agrupación por grupo_id / transaccion_ganado_id (migración 098, §3.3).

export type TipoMovimientoGanado =
  | 'compra'
  | 'venta'
  | 'muerte'
  | 'traslado_entrada'
  | 'traslado_salida'
  | 'ajuste';

export type EstadoMovimientoGanado = 'pendiente' | 'confirmado' | 'descartado';

/** Etapa productiva del potrero — dominio cerrado, definido por el dueño. */
export type EtapaProductiva = 'terneros' | 'levante' | 'ceba' | 'repele';

/**
 * Bucket de presentación. `sin_clasificar` NUNCA se persiste — en la base
 * `gan_potreros.etapa` es NULL (migración 098). El bucket solo existe en
 * esta capa para que la UI tenga dónde sumar las cabezas sin etapa, nunca
 * repartidas entre las otras (A-2 del brief del CPO).
 */
export type EtapaBucket = EtapaProductiva | 'sin_clasificar';

export const ORDEN_ETAPAS: EtapaBucket[] = ['terneros', 'levante', 'ceba', 'repele', 'sin_clasificar'];

export const ETIQUETA_ETAPA: Record<EtapaBucket, string> = {
  terneros: 'Terneros',
  levante: 'Levante',
  ceba: 'Ceba',
  repele: 'Repele',
  sin_clasificar: 'Sin clasificar',
};

export interface GanUbicacion {
  id: string;
  nombre: string;
}

export interface GanFinca {
  id: string;
  nombre: string;
  ubicacion_id: string | null;
  hectareas: number;
  activa: boolean;
}

/** Nivel "lote" entre finca y potrero — tabla `gan_lotes` (migración 098). */
export interface GanLote {
  id: string;
  finca_id: string;
  nombre: string;
  activo: boolean;
}

export interface GanPotrero {
  id: string;
  nombre: string;
  finca_id: string;
  activo: boolean;
  /** NULL = potrero sin lote asignado (nunca un centinela). */
  lote_id: string | null;
  /** NULL = sin clasificar. Nunca un centinela, nunca un DEFAULT. */
  etapa: EtapaProductiva | null;
}

export interface GanInventario {
  id: string;
  potrero_id: string;
  novillos: number;
  toros: number;
  /**
   * Peso del ÚLTIMO movimiento que trajo peso (COALESCE en
   * `fn_aplicar_movimiento_ganado`, migración 045) — NO un promedio de los
   * animales del potrero. La UI lee el último peso (y su fecha) de
   * `gan_pesos_historico`, no de esta columna (§3.4 del plan).
   */
  peso_promedio_kg: number | null;
  updated_at: string;
}

export interface GanMovimiento {
  id: string;
  tipo: TipoMovimientoGanado;
  estado: EstadoMovimientoGanado;
  fecha: string;
  potrero_origen_id: string | null;
  potrero_destino_id: string | null;
  novillos_delta: number;
  toros_delta: number;
  peso_promedio_kg: number | null;
  transaccion_ganado_id: string | null;
  notas: string | null;
  created_at: string;
  created_by: string | null;
  /**
   * Agrupa varias filas que son UN solo hecho: traslado N→M o conteo
   * físico/carga inicial. NULL = fila suelta. Una compra/venta repartida
   * NO usa esta columna — agrupa por `transaccion_ganado_id` (§3.3).
   */
  grupo_id: string | null;
}

// Fila desnormalizada del inventario actual (potrero + lote + finca + ubicación)
export interface InventarioPotreroRow {
  potrero_id: string;
  potrero: string;
  finca_id: string;
  finca: string;
  ubicacion_id: string | null;
  ubicacion: string;
  hectareas: number;
  lote_id: string | null;
  /** Nombre del lote, o null si el potrero no tiene lote asignado. */
  lote: string | null;
  /** NULL = sin clasificar (bucket `sin_clasificar` en la UI). */
  etapa: EtapaProductiva | null;
  novillos: number;
  toros: number;
  /** Último peso registrado en `gan_pesos_historico` para este potrero. */
  ultimo_peso_kg: number | null;
  /** Fecha de ese último peso. `null` si nunca se registró uno (A-4). */
  ultimo_peso_fecha: string | null;
  updated_at: string | null;
}

// Movimiento con nombres de potrero/finca/lote/etapa resueltos para el log,
// más el contexto de valor $ de la transacción de finanzas cuando aplica
// (compra/venta) — condicional por rol en el hook, nunca fabricado (R-4).
export interface MovimientoConContexto extends GanMovimiento {
  potrero_origen: string | null;
  finca_origen: string | null;
  lote_origen: string | null;
  etapa_origen: EtapaProductiva | null;
  potrero_destino: string | null;
  finca_destino: string | null;
  lote_destino: string | null;
  etapa_destino: EtapaProductiva | null;
  /** Solo presente cuando el rol del usuario puede ver plata (B-2/R-4). */
  valor_total: number | null;
  kilos_pagados: number | null;
  cabezas_transaccion: number | null;
}

export type ResumenEtapas = Record<EtapaBucket, number>;

export interface KPIsInventarioGanado {
  totalCabezas: number;
  totalNovillos: number;
  totalToros: number;
  hectareasTotales: number;
  cabezasPorHa: number | null;
  porUbicacion: {
    ubicacion: string;
    cabezas: number;
    hectareas: number;
    cabezasPorHa: number | null;
  }[];
  /** Σ buckets = totalCabezas. Los potreros sin etapa van a `sin_clasificar`. */
  porEtapa: ResumenEtapas;
  /** Potreros activos (de finca activa) sin etapa asignada, y sus cabezas. */
  potrerosSinEtapa: { potreros: number; cabezas: number };
  /** Cabezas que viven en potreros de finca INACTIVA — no cuentan en el total (§7.1). */
  cabezasFueraDeFincaActiva: number;
}

export interface VariacionInventario {
  entradas: number;
  salidas: number;
  neto: number;
}

// ---------------------------------------------------------------------------
// Árbol de inventario: ubicación → finca → lote → potrero, con totales por
// nivel (§6.2 `construirArbolInventario`). `cabezasPorHa` solo existe en
// finca y ubicación (decisión 7 del CPO: hectáreas solo por finca) — no se
// declara en lote/potrero para que no termine mostrando un heredado falso.
// ---------------------------------------------------------------------------

export interface NodoPotrero {
  potrero_id: string;
  potrero: string;
  lote: string | null;
  etapa: EtapaProductiva | null;
  novillos: number;
  toros: number;
  cabezas: number;
  ultimoPesoKg: number | null;
  ultimoPesoFecha: string | null;
}

export interface NodoLote {
  /** `null` = nodo "Sin lote" (potreros sin `lote_id`). */
  lote_id: string | null;
  lote: string;
  cabezas: number;
  novillos: number;
  toros: number;
  porEtapa: ResumenEtapas;
  potreros: NodoPotrero[];
}

export interface NodoFinca {
  finca_id: string;
  finca: string;
  hectareas: number;
  cabezas: number;
  novillos: number;
  toros: number;
  cabezasPorHa: number | null;
  porEtapa: ResumenEtapas;
  lotes: NodoLote[];
}

export interface NodoUbicacion {
  ubicacion_id: string | null;
  ubicacion: string;
  cabezas: number;
  hectareas: number;
  cabezasPorHa: number | null;
  porEtapa: ResumenEtapas;
  fincas: NodoFinca[];
}

// ---------------------------------------------------------------------------
// Log agrupado (§3.3 / §6.1): unión discriminada con una variante por cada
// forma de agrupamiento, para que el renderizador nunca pueda leer un saldo
// que no existe. `saldoOrigen`/`saldoDestino` (1→1) desaparecieron — el
// saldo vive en cada punta (`PuntaMovimiento`), que es donde el dato existe
// de verdad en un traslado N→M.
// ---------------------------------------------------------------------------

/** Una punta de un evento repartido: el potrero, sus cabezas y su saldo posterior. */
export interface PuntaMovimiento {
  movimiento_id: string;
  potrero_id: string;
  potrero: string;
  lote: string | null;
  finca: string;
  /** SIEMPRE positivos (R-8) — la dirección vive en la clase del evento. */
  novillos: number;
  toros: number;
  /** `null` = no calculable (Σdeltas ≠ snapshot del potrero) → la UI renderiza `—`. */
  saldo: number | null;
}

export type MovimientoAgrupado =
  | { clase: 'simple'; movimiento: MovimientoConContexto; saldo: number | null }
  | {
      clase: 'traslado';
      grupo_id: string;
      fecha: string;
      /** N orígenes y M destinos, ambos ≥ 1. */
      origenes: PuntaMovimiento[];
      destinos: PuntaMovimiento[];
      cabezas: number;
      notas: string | null;
    }
  | {
      clase: 'compra_venta';
      /** Se discrimina por `transaccion_ganado_id`, NO por `grupo_id` (§3.3). */
      transaccion_ganado_id: string;
      tipo: 'compra' | 'venta';
      fecha: string;
      puntas: PuntaMovimiento[];
      cabezas: number;
      valor_total: number | null;
      kilos_pagados: number | null;
    }
  | {
      clase: 'conteo_fisico';
      grupo_id: string;
      fecha: string;
      miembros: MovimientoConContexto[];
      puntas: PuntaMovimiento[];
      potrerosAfectados: number;
      deltaNeto: number;
      notas: string | null;
    };
