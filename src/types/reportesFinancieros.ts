// Tipos del módulo de Reportes Financieros (/finanzas/reportes).
//
// Archivo aparte de `finanzas.ts` a propósito: aquel ya mezcla catálogos,
// formularios, dashboard y presupuesto.
//
// Principio de diseño: las líneas de un reporte son un ARRAY PLANO ORDENADO
// con `nivel` + `padre_id`, no un árbol anidado. La tabla, el PDF y el Excel
// recorren exactamente lo mismo sin reimplementar el layout cada uno.
//
// Convención de signos: `valores` y `meses` son SIEMPRE positivos. El signo lo
// lleva `esResta` / `signo`. Ningún consumidor debe inferir el signo del valor
// (así se evita el clásico `-$-500` entre pantalla y PDF).

/** Vista del reporte. `global` incluye todos los negocios, también los que no tienen vista propia. */
export type VistaReporte = 'global' | 'aguacate' | 'ganado' | 'hato';

/** Eje de columnas del P&G. `cosecha` solo aplica a aguacate. */
export type ModoReporte = 'trimestres' | 'cosecha';

export type TipoCosto = 'directo' | 'indirecto';

// ── Períodos ────────────────────────────────────────────────────────────────

/**
 * Ventana de selección de ingresos. Puede ser ASIMÉTRICA respecto a la de
 * egresos: en modo cosecha los ingresos se eligen por la etiqueta
 * `fin_ingresos.cosecha` y los egresos por rango de fechas del semestre.
 */
export interface VentanaIngresos {
  modo: 'fecha' | 'cosecha';
  /** modo 'fecha' — 'YYYY-MM-DD' */
  desde?: string;
  hasta?: string;
  /** modo 'cosecha' — p.ej. 'Traviesa 2026' */
  etiqueta?: string;
}

export interface PeriodoDef {
  /** Estable y único dentro del reporte: 'Q1' | 'Q1-Q2' | 'Principal 2026' */
  key: string;
  /** Encabezado de columna */
  label: string;
  egresos: { desde: string; hasta: string };
  ingresos: VentanaIngresos;
  /** Qué se sumó exactamente. La UI lo muestra bajo el encabezado para que el dueño lo audite en pantalla, no en el código. */
  descripcion: string;
}

// ── Advertencias ────────────────────────────────────────────────────────────

export type CodigoAdvertencia =
  | 'gastos_pendientes'
  | 'gastos_sin_categoria'
  | 'ganado_sin_costo_inicial'
  | 'ganado_venta_sin_inventario'
  | 'ganado_posible_duplicado'
  | 'cosecha_sin_etiqueta'
  | 'datos_truncados';

export interface AdvertenciaReporte {
  codigo: CodigoAdvertencia;
  severidad: 'info' | 'warning';
  mensaje: string;
  /** Monto o cantidad afectada, cuando aplica. */
  valor?: number;
  /**
   * 'moneda' (defecto) → la UI anexa el monto al final del mensaje.
   * 'unidades'         → el dato ya está narrado dentro de `mensaje`; la UI NO
   *                      lo repite, pero queda disponible para PDF y tests.
   */
  formatoValor?: 'moneda' | 'unidades';
}

// ── Líneas del P&G ──────────────────────────────────────────────────────────

export type TipoLineaPyG =
  | 'seccion'    // encabezado de bloque (INGRESOS, COSTOS DIRECTOS…)
  | 'detalle'    // categoría o concepto
  | 'subtotal'   // Total Ingresos, Total Costos Directos…
  | 'resultado'  // Margen de Contribución, Utilidad Operativa
  | 'indicador'; // kilos, precio promedio, costo por kilo — no suma

export interface OrigenLinea {
  fuente: 'fin_ingresos' | 'fin_gastos' | 'fin_transacciones_ganado' | 'derivado';
  categoria_id?: string;
  concepto_id?: string;
  negocio_id?: string;
}

export interface LineaPyG {
  id: string;
  padre_id?: string;
  nivel: 0 | 1 | 2;
  tipo: TipoLineaPyG;
  etiqueta: string;
  /** `valores[i]` corresponde a `periodos[i]`. SIEMPRE la misma longitud que `ReportePyG.periodos`. */
  valores: number[];
  /**
   * Celdas sin dato calculable — se pintan «—», no «0».
   * Es la diferencia entre "el margen fue 0%" y "no hubo ingresos, así que no
   * hay porcentaje". Misma longitud que `valores` cuando está presente.
   */
  sinDato?: boolean[];
  /** true → se pinta restando. El valor en sí es siempre positivo. */
  esResta: boolean;
  formato: 'moneda' | 'porcentaje' | 'unidades';
  origen?: OrigenLinea;
}

export interface ReportePyG {
  version: 2;
  modo: ModoReporte;
  vista: VistaReporte;
  vista_nombre: string;
  anio: number;
  periodos: PeriodoDef[];
  lineas: LineaPyG[];
  /** Atajo para KPIs y export. Cada array tiene la longitud de `periodos`. */
  totales: {
    ingresos: number[];
    costos_directos: number[];
    margen_contribucion: number[];
    gastos_indirectos: number[];
    utilidad_operativa: number[];
    /** null cuando no hay ingresos — nunca 0% por división por cero. */
    margen_contribucion_pct: (number | null)[];
    utilidad_operativa_pct: (number | null)[];
  };
  advertencias: AdvertenciaReporte[];
}

// ── Flujo de caja ───────────────────────────────────────────────────────────

export type TipoLineaFlujo = 'seccion' | 'detalle' | 'subtotal' | 'resultado';

export interface LineaFlujo {
  id: string;
  padre_id?: string;
  nivel: 0 | 1;
  tipo: TipoLineaFlujo;
  etiqueta: string;
  /** SIEMPRE 12 posiciones; índice 0 = enero. */
  meses: number[];
  total: number;
  signo: 'entrada' | 'salida' | 'neto';
  origen?: OrigenLinea;
}

export interface ReporteFlujoCaja {
  version: 1;
  vista: VistaReporte;
  vista_nombre: string;
  anio: number;
  meses_label: string[];
  lineas: LineaFlujo[];
  totales: {
    entradas: number[];
    salidas: number[];
    flujo_neto: number[];
    /** saldo_inicial + suma prefija de flujo_neto */
    flujo_acumulado: number[];
  };
  saldo_inicial: number;
  /** true → la fila se rotula "Flujo acumulado del período", no "Saldo de caja". */
  saldo_inicial_es_supuesto: boolean;
  advertencias: AdvertenciaReporte[];
}

// ── Entrada del motor (lo que produce el hook de fetching) ──────────────────

export interface NegocioCrudo {
  id: string;
  nombre: string;
}

export interface IngresoCrudo {
  id: string;
  fecha: string;
  negocio_id: string;
  valor: number;
  categoria_id: string | null;
  categoria_nombre: string | null;
  cosecha: string | null;
  cantidad: number | null;
}

export interface GastoCrudo {
  id: string;
  fecha: string;
  negocio_id: string;
  valor: number;
  estado: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
  categoria_tipo_costo: TipoCosto | null;
  concepto_id: string | null;
  concepto_nombre: string | null;
  concepto_tipo_costo: TipoCosto | null;
}

export interface TransaccionGanadoCruda {
  id: string;
  fecha: string;
  tipo: 'compra' | 'venta';
  cantidad_cabezas: number;
  kilos_pagados: number | null;
  valor_total: number;
}

export interface ParametroFinanciero {
  clave: string;
  anio: number | null;
  negocio_id: string | null;
  valor: number;
}

export interface DatosCrudosReportes {
  anio: number;
  negocios: NegocioCrudo[];
  ingresos: IngresoCrudo[];
  gastos: GastoCrudo[];
  /** Histórico COMPLETO, no solo el año: el costo promedio móvil depende de la serie entera. */
  ganado: TransaccionGanadoCruda[];
  parametros: ParametroFinanciero[];
  /** true si alguna consulta llegó al tope de páginas y se cortó. */
  truncado: boolean;
}

// ── Nombres canónicos de los negocios con vista propia ──────────────────────
// Deben coincidir con `fin_negocios.nombre` en producción.

export const NEGOCIO_AGUACATE = 'Aguacate Hass';
export const NEGOCIO_GANADO = 'Ganado';
export const NEGOCIO_HATO = 'Hato Lechero';

export const VISTAS: { key: VistaReporte; label: string; negocio?: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'aguacate', label: 'Aguacate Hass', negocio: NEGOCIO_AGUACATE },
  { key: 'ganado', label: 'Ganado', negocio: NEGOCIO_GANADO },
  { key: 'hato', label: 'Hato Lechero', negocio: NEGOCIO_HATO },
];
