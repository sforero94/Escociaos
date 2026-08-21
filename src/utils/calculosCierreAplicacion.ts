/**
 * Lógica pura del rediseño W03 v2 (Cierre de Aplicación) — `docs/…/W03-cierre-v2.md`.
 *
 * Ninguna de estas funciones toca Supabase ni JSX: reciben datos ya cargados por
 * `cargarDatos()`/`fetchRegistrosTrabajoParaCierre` (en `CierreAplicacion.tsx` y
 * `laborCosts.ts`, ninguno de los dos tocado aquí) y devuelven derivaciones puras,
 * siguiendo la regla de CLAUDE.md de que la lógica de negocio vive en `src/utils/calculos*.ts`,
 * no inline en el componente.
 */

import type { RegistroTrabajoCierre } from '@/types/aplicaciones';

/** Opciones de fracción de jornal — sin cambios respecto a la pantalla original, solo movida
 * aquí para que el `Select` de la tabla y el del formulario "Agregar registro" (dos archivos
 * distintos tras el split) compartan una única fuente. */
export const FRACCION_OPTIONS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0] as const;

// ---------------------------------------------------------------------------------------------
// Insumos — desviación planeado vs. aplicado
// ---------------------------------------------------------------------------------------------

export interface InsumoInput {
  nombre: string;
  unidad: string;
  planeado: number;
  aplicado: number;
}

export interface InsumoConDesviacion extends InsumoInput {
  diferencia: number;
  /** Mismo criterio que el módulo ya usaba antes de v2: no se cambia. */
  esCritico: boolean;
}

/**
 * `planeado === 0` nunca es "crítico" — regla heredada intacta de la pantalla original
 * (`CierreAplicacion.tsx` antes de este rediseño). Cambiarla sería una decisión de negocio,
 * no de superficie, y está fuera del alcance de W03 v2.
 */
export function calcularDesviacionInsumo(
  insumo: Pick<InsumoInput, 'planeado' | 'aplicado'>,
): { diferencia: number; esCritico: boolean } {
  const diferencia = insumo.aplicado - insumo.planeado;
  const esCritico = insumo.planeado > 0 && Math.abs(diferencia / insumo.planeado) > 0.15;
  return { diferencia, esCritico };
}

export function calcularInsumosConDesviacion(insumos: InsumoInput[]): InsumoConDesviacion[] {
  return insumos.map((insumo) => ({ ...insumo, ...calcularDesviacionInsumo(insumo) }));
}

// ---------------------------------------------------------------------------------------------
// Fechas de ejecución real — deriva Fecha Inicio/Fin Real de los registros reales
// ---------------------------------------------------------------------------------------------

export type FuenteFechasEjecucion = 'registros' | 'movimientos' | 'combinado' | 'ninguna';

export interface FechasEjecucionReal {
  fechaInicio: string | null;
  fechaFin: string | null;
  fuente: FuenteFechasEjecucion;
}

/**
 * Reemplaza la lógica ad hoc que antes vivía inline en `cargarDatos()`: Fecha Fin caía en
 * `obtenerFechaHoy()` (el día en que se hace el papeleo, no el día en que terminó el trabajo) y
 * Fecha Inicio solo se corregía si el campo estaba vacío, así que casi siempre se quedaba en la
 * fecha PLANEADA. Acá se deriva siempre, de forma simétrica, de la unión de
 * `registros_trabajo.fecha_trabajo` y `movimientos_diarios.fecha_movimiento` (recomendación de
 * W03-cierre-v2.md §8.1 cuando no hay una opinión más fuerte: unión — nunca angosta lo que el
 * usuario ya capturó).
 *
 * Nota de verificación (no de este código, del reporte de implementación): en producción 14 de
 * 15 aplicaciones cerradas ya coinciden exactamente con el último movimiento — esto es una
 * mejora de robustez hacia adelante, no una corrección de datos corruptos.
 */
export function derivarFechasEjecucionReal(
  fechasRegistros: Array<string | null | undefined>,
  fechasMovimientos: Array<string | null | undefined>,
): FechasEjecucionReal {
  const registrosValidas = fechasRegistros.filter((f): f is string => !!f).sort();
  const movimientosValidas = fechasMovimientos.filter((f): f is string => !!f).sort();
  const todas = [...registrosValidas, ...movimientosValidas].sort();

  if (todas.length === 0) {
    return { fechaInicio: null, fechaFin: null, fuente: 'ninguna' };
  }

  const fuente: FuenteFechasEjecucion =
    registrosValidas.length > 0 && movimientosValidas.length > 0
      ? 'combinado'
      : registrosValidas.length > 0
        ? 'registros'
        : 'movimientos';

  return {
    fechaInicio: todas[0],
    fechaFin: todas[todas.length - 1],
    fuente,
  };
}

// ---------------------------------------------------------------------------------------------
// Agrupación de registros por lote y KPIs de labor — antes recalculados inline en cada render
// ---------------------------------------------------------------------------------------------

export interface RegistroPorLote {
  lote_nombre: string;
  registros: Array<RegistroTrabajoCierre & { _index: number }>;
}

/** Agrupa los registros ACTIVOS (no marcados `_deleted`) por `lote_id`, preservando el índice
 * original de `registrosEditados` para que editar/eliminar por fila siga funcionando igual. */
export function agruparRegistrosPorLote(
  registrosEditados: RegistroTrabajoCierre[],
): Map<string, RegistroPorLote> {
  const porLote = new Map<string, RegistroPorLote>();
  registrosEditados.forEach((r, index) => {
    if (r._deleted) return;
    const key = r.lote_id;
    if (!porLote.has(key)) {
      porLote.set(key, { lote_nombre: r.lote_nombre, registros: [] });
    }
    porLote.get(key)!.registros.push({ ...r, _index: index });
  });
  return porLote;
}

export interface KPIsLabores {
  totalJornales: number;
  costoManoObra: number;
  trabajadoresUnicos: number;
  diasTrabajados: number;
}

export function calcularKPIsLabores(registrosActivos: RegistroTrabajoCierre[]): KPIsLabores {
  return {
    totalJornales: registrosActivos.reduce((s, r) => s + r.fraccion_jornal, 0),
    costoManoObra: registrosActivos.reduce((s, r) => s + r.costo_jornal, 0),
    trabajadoresUnicos: new Set(registrosActivos.map((r) => r.empleado_id || r.contratista_id)).size,
    diasTrabajados: new Set(registrosActivos.map((r) => r.fecha_trabajo)).size,
  };
}

/**
 * Une una lista de textos con coma, "y" antes del último — el formato de la lista de insumos
 * del `AlertDialog` de confirmación ("Producto A, Producto B y Producto C"). Copia exacta que el
 * dueño aprobó en v1 (`W03-cierre.md` §3), sin cambios en v2.
 */
export function formatearListaConY(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------------------------
// Panel "Atención requerida" — 3 señales que el sistema ya calculaba pero dejaba enterradas
// ---------------------------------------------------------------------------------------------

export interface LoteInput {
  lote_id: string;
  nombre: string;
}

export interface RegistroConLote {
  lote_id: string;
  lote_nombre: string;
  trabajador_nombre: string;
  costo_jornal: number;
}

export interface InsumoCriticoExcepcion {
  nombre: string;
  diferencia: number;
  unidad: string;
}

export interface RegistroSinTarifaExcepcion {
  lote_id: string;
  lote_nombre: string;
  trabajador_nombre: string;
}

export interface LoteSinLaborExcepcion {
  lote_id: string;
  nombre: string;
}

export interface ExcepcionesCierre {
  insumosCriticos: InsumoCriticoExcepcion[];
  registrosSinTarifa: RegistroSinTarifaExcepcion[];
  lotesSinLabor: LoteSinLaborExcepcion[];
}

/**
 * Las 3 señales de `W03-cierre-v2.md` §1.1 — ninguna requiere un fetch nuevo, las 3 se derivan
 * de datos que `cargarDatos()` ya trae hoy:
 *
 * 1. Insumo con desviación crítica (>15%, mismo criterio que `calcularDesviacionInsumo`).
 * 2. Registro de labor con `costo_jornal === 0` (falta tarifa asignada al trabajador).
 * 3. Lote de la aplicación sin NINGÚN jornal registrado — antes invisible por omisión: si un
 *    lote no tiene registros simplemente no aparece en `agruparRegistrosPorLote`.
 *
 * Dos guardas explícitas (riesgo #8 del documento de diseño), ambas para no inventar una
 * excepción a partir de la ausencia de datos:
 * - `tieneTarea === false` → NO se calcula `lotesSinLabor`. Sin tarea vinculada no hay
 *   registros_trabajo por diseño (aplicaciones anteriores a la vinculación automática), y esa
 *   ausencia ya tiene su propio aviso separado en la pantalla — repetirla lote por lote sería
 *   ruido, no señal.
 * - `lotes.length === 0` → NO se calcula `lotesSinLabor`. Si el fetch de lotes falló o llegó
 *   vacío, todos los lotes se verían "sin labor" por falta de catálogo, no porque de verdad
 *   falten jornales.
 */
export function calcularExcepcionesCierre(
  insumos: InsumoInput[],
  registrosActivos: RegistroConLote[],
  lotes: LoteInput[],
  tieneTarea: boolean,
): ExcepcionesCierre {
  const insumosCriticos: InsumoCriticoExcepcion[] = calcularInsumosConDesviacion(insumos)
    .filter((i) => i.esCritico)
    .map((i) => ({ nombre: i.nombre, diferencia: i.diferencia, unidad: i.unidad }));

  const registrosSinTarifa: RegistroSinTarifaExcepcion[] = registrosActivos
    .filter((r) => r.costo_jornal === 0)
    .map((r) => ({ lote_id: r.lote_id, lote_nombre: r.lote_nombre, trabajador_nombre: r.trabajador_nombre }));

  let lotesSinLabor: LoteSinLaborExcepcion[] = [];
  if (tieneTarea && lotes.length > 0) {
    const loteIdsConRegistro = new Set(registrosActivos.map((r) => r.lote_id));
    lotesSinLabor = lotes
      .filter((l) => !loteIdsConRegistro.has(l.lote_id))
      .map((l) => ({ lote_id: l.lote_id, nombre: l.nombre }));
  }

  return { insumosCriticos, registrosSinTarifa, lotesSinLabor };
}
