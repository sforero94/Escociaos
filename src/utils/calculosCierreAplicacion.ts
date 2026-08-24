/**
 * Lógica pura del rediseño W03 v2 (Cierre de Aplicación) — `docs/…/W03-cierre-v2.md`.
 *
 * Ninguna de estas funciones toca Supabase ni JSX: reciben datos ya cargados por
 * `cargarDatos()`/`fetchRegistrosTrabajoParaCierre` (en `CierreAplicacion.tsx` y
 * `laborCosts.ts`, ninguno de los dos tocado aquí) y devuelven derivaciones puras,
 * siguiendo la regla de CLAUDE.md de que la lógica de negocio vive en `src/utils/calculos*.ts`,
 * no inline en el componente.
 */

import { DIAS_LABORALES_MES } from '@/utils/laborCosts';
import type { RegistroTrabajoCierre } from '@/types/aplicaciones';

/**
 * Opciones de fracción de jornal — las MISMAS 4 que acepta el ENUM `fraccion_jornal` en la base
 * (verificado contra `pg_enum` el 2026-08-21), y las mismas que ofrece
 * `components/labores/EditarRegistroDialog.tsx`, que edita esa misma tabla.
 *
 * **Antes traía `1.5` y `2.0`, que la base no puede guardar.** El ENUM no tiene esas etiquetas, así
 * que elegirlas hacía fallar la escritura de `registros_trabajo` — y como la versión no
 * transaccional escribía con `await supabase...insert({...})` sin mirar `{ error }`, el fallo se
 * tragaba en silencio: el cierre decía "listo" y el registro nunca se guardaba. No es una
 * regresión del rediseño; venía así y el split solo la movió tal cual.
 *
 * Si alguna vez hay que registrar horas extra (>1 jornal), esto NO se arregla agregando la opción
 * de vuelta acá: hay que agregar la etiqueta al ENUM con su propia migración, o el mismo silencio
 * vuelve.
 */
export const FRACCION_OPTIONS = [0.25, 0.5, 0.75, 1.0] as const;

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

// ---------------------------------------------------------------------------------------------
// Payload del RPC transaccional fn_cerrar_aplicacion (migración 106) — toda la aritmética de
// costos/fechas/consolidación de insumos que antes vivía inline en `cerrarAplicacion()` vive
// acá, pura y testeada, para que el RPC no tenga que reimplementarla en SQL (un solo lenguaje
// hace el cálculo, el otro solo escribe). El RPC no recalcula nada de lo que este objeto trae.
// ---------------------------------------------------------------------------------------------

export interface MovimientoInsumoInput {
  producto_id: string;
  producto_nombre: string;
  cantidad_utilizada: number;
  costo_unitario: number;
}

export interface LoteParaCierreInput {
  lote_id: string;
  nombre: string;
  arboles: number;
}

export interface DatosFinalesCierreInput {
  fechaInicioReal: string;
  fechaFinReal: string;
  observaciones: string;
}

export interface PayloadRegistroTrabajoCierre {
  id?: string;
  tarea_id: string;
  empleado_id: string | null;
  contratista_id: string | null;
  lote_id: string;
  fecha_trabajo: string;
  /** STRING, no number — `registros_trabajo.fraccion_jornal` es un ENUM en BD, y lleva la etiqueta
   * LITERAL del ENUM (`0.25` | `0.5` | `0.75` | `1.0`), producida por `etiquetaFraccionJornal()`.
   * NO uses `.toString()`: `(1.0).toString()` da `"1"`, que el ENUM rechaza. Ver el comentario de
   * `ETIQUETAS_FRACCION_JORNAL`. */
  fraccion_jornal: string;
  costo_jornal: number;
  /** Ya calculado con la misma fórmula que `cerrarAplicacion()` usaba inline — el RPC lo inserta
   * tal cual para registros `_isNew`, sin reimplementar la fórmula en SQL. */
  valor_jornal_empleado: number;
  observaciones: string | null;
  _isNew: boolean;
  _deleted: boolean;
  _modified: boolean;
}

export interface PayloadInsumoAplicado {
  producto_id: string;
  producto_nombre: string;
  cantidad: number;
}

export interface PayloadCierreAplicacion {
  aplicacion_id: string;
  fecha_cierre: string;
  fecha_inicio_ejecucion: string;
  fecha_fin_ejecucion: string;
  dias_aplicacion: number;
  jornales_utilizados: number;
  valor_jornal: number;
  /** aplicaciones.observaciones_cierre — texto crudo de `datosFinales.observaciones`, puede ser
   * cadena vacía. Distinto de `observaciones_generales` a propósito (ver más abajo): la versión
   * no transaccional escribía cada columna con una regla distinta y esta refactorización no las
   * unifica. */
  observaciones_cierre: string;
  /** aplicaciones_cierre.observaciones_generales — `datosFinales.observaciones || null` (cadena
   * vacía se guarda como NULL, no como ''). */
  observaciones_generales: string | null;
  costo_total_insumos: number;
  costo_total_mano_obra: number;
  costo_total: number;
  costo_por_arbol: number;
  lote_aplicacion: string;
  registros_trabajo: PayloadRegistroTrabajoCierre[];
  insumos_aplicados: PayloadInsumoAplicado[];
}

/**
 * `reg.tarifa_jornal || (reg.salario ? salario mensual / DIAS_LABORALES_MES : 0)` para
 * `registros_trabajo.valor_jornal_empleado` de un registro NUEVO. El `||` se conserva literal
 * del original: es truthy-check de JS (un `tarifa_jornal` de 0 cae al fallback), no `??`.
 *
 * **El divisor NO se declara acá: se importa de `laborCosts.ts`.** Hay UN divisor del jornal en
 * todo el proyecto —22 días laborales, decisión del dueño del 2026-08-20— y este fichero fue el
 * único que se quedó con la fórmula vieja por horas semanales, cuyo divisor efectivo con las 44 h
 * de la nómina real es 23,815: subvaluaba cada jornal nuevo del cierre un 7,6 %.
 * `__tests__/jornalDivisorContract.test.ts` es la guarda que impide que vuelva a divergir.
 */
function calcularValorJornalEmpleadoNuevo(reg: RegistroTrabajoCierre): number {
  if (reg.tarifa_jornal) return reg.tarifa_jornal;
  if (reg.salario) {
    return Math.round(
      (reg.salario + (reg.prestaciones || 0) + (reg.auxilios || 0)) / DIAS_LABORALES_MES,
    );
  }
  return 0;
}

/**
 * Las 4 etiquetas EXACTAS del ENUM `fraccion_jornal` en producción (verificadas contra `pg_enum`
 * el 2026-08-21): `0.25`, `0.5`, `0.75`, **`1.0`**.
 *
 * **Por qué no se puede usar `.toString()`.** Los registros llegan a la pantalla como NÚMEROS —
 * `laborCosts.ts:244` hace `parseFloat(r.fraccion_jornal)` al cargarlos, y los registros nuevos
 * nacen con el literal `1.0` (`CierreAplicacion.tsx:124` y `:515`). En JavaScript `(1.0).toString()`
 * es `"1"`, **no** `"1.0"`, así que la fracción más común de la finca (1.068 de 2.688 filas) se
 * enviaba como `'1'`, que NO es una etiqueta válida del ENUM. Las otras tres coinciden por
 * casualidad (`"0.25"`, `"0.5"`, `"0.75"`), y esa casualidad fue justamente lo que escondió el
 * defecto.
 *
 * **Cómo se manifestaba antes de la migración 106.** La versión no transaccional escribía con
 * `await supabase.from('registros_trabajo').insert({...})` SIN desestructurar `{ error }`: el
 * rechazo del ENUM se tragaba en silencio y el cierre reportaba éxito habiendo perdido el
 * registro. Dentro del RPC ese mismo fallo aborta la transacción entera — más honesto, pero
 * igual de roto. Por eso el mapeo es explícito acá y no una coincidencia de formato.
 */
const ETIQUETAS_FRACCION_JORNAL: ReadonlyArray<{ valor: number; etiqueta: string }> = [
  { valor: 0.25, etiqueta: '0.25' },
  { valor: 0.5, etiqueta: '0.5' },
  { valor: 0.75, etiqueta: '0.75' },
  { valor: 1, etiqueta: '1.0' },
];

/**
 * Convierte la fracción numérica de la UI a la etiqueta literal del ENUM.
 *
 * Ante un valor que no es ninguna de las 4 etiquetas **lanza**, en vez de inventar un formato que
 * la base va a rechazar más adelante: el payload se arma antes de escribir nada, así que fallar acá
 * deja la aplicación intacta y con un mensaje entendible, que es exactamente lo contrario del
 * `insert` sin `{ error }` que este arreglo reemplaza.
 */
export function etiquetaFraccionJornal(valor: number): string {
  const match = ETIQUETAS_FRACCION_JORNAL.find((f) => Math.abs(f.valor - valor) < 1e-9);
  if (!match) {
    throw new Error(
      `fraccion_jornal inválida: ${valor}. Solo se aceptan ${ETIQUETAS_FRACCION_JORNAL.map((f) => f.etiqueta).join(', ')}.`,
    );
  }
  return match.etiqueta;
}

/**
 * Construye el payload jsonb de `fn_cerrar_aplicacion` (migración 106) a partir de exactamente
 * los mismos datos que `CierreAplicacion.tsx` ya tenía en estado al momento de cerrar — ninguna
 * consulta nueva, ninguna cifra calculada distinto de como la versión no transaccional la
 * calculaba. Es el único lugar donde vive esa aritmética; el RPC solo persiste lo que este
 * objeto dice, en el orden documentado en la migración 106.
 */
export function construirPayloadCierreAplicacion(params: {
  aplicacionId: string;
  registrosEditados: RegistroTrabajoCierre[];
  datosFinales: DatosFinalesCierreInput;
  lotes: LoteParaCierreInput[];
  movimientos: MovimientoInsumoInput[];
}): PayloadCierreAplicacion {
  const { aplicacionId, registrosEditados, datosFinales, lotes, movimientos } = params;

  const registrosActivos = registrosEditados.filter((r) => !r._deleted);
  const totalJornalesLabor = registrosActivos.reduce((s, r) => s + r.fraccion_jornal, 0);
  const costoManoObraReal = registrosActivos.reduce((s, r) => s + r.costo_jornal, 0);
  const valorJornalPromedio = totalJornalesLabor > 0 ? costoManoObraReal / totalJornalesLabor : 0;

  const totalArboles = lotes.reduce((sum, lote) => sum + lote.arboles, 0);
  const costoInsumos = movimientos.reduce((sum, mov) => sum + mov.cantidad_utilizada * mov.costo_unitario, 0);
  const costoTotal = costoInsumos + costoManoObraReal;
  const costoPorArbol = totalArboles > 0 ? costoTotal / totalArboles : 0;

  const fechaInicio = new Date(datosFinales.fechaInicioReal);
  const fechaFin = new Date(datosFinales.fechaFinReal);
  const diasAplicacion = Math.ceil((fechaFin.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const insumosMap = new Map<string, PayloadInsumoAplicado>();
  movimientos.forEach((mov) => {
    if (!insumosMap.has(mov.producto_id)) {
      insumosMap.set(mov.producto_id, {
        producto_id: mov.producto_id,
        producto_nombre: mov.producto_nombre,
        cantidad: 0,
      });
    }
    insumosMap.get(mov.producto_id)!.cantidad += mov.cantidad_utilizada;
  });

  return {
    aplicacion_id: aplicacionId,
    fecha_cierre: datosFinales.fechaFinReal,
    fecha_inicio_ejecucion: datosFinales.fechaInicioReal,
    fecha_fin_ejecucion: datosFinales.fechaFinReal,
    dias_aplicacion: diasAplicacion,
    jornales_utilizados: totalJornalesLabor,
    valor_jornal: Math.round(valorJornalPromedio),
    observaciones_cierre: datosFinales.observaciones,
    observaciones_generales: datosFinales.observaciones || null,
    costo_total_insumos: costoInsumos,
    costo_total_mano_obra: costoManoObraReal,
    costo_total: costoTotal,
    costo_por_arbol: costoPorArbol,
    lote_aplicacion: lotes.map((l) => l.nombre).join(', '),
    registros_trabajo: registrosEditados.map((r) => ({
      id: r.id,
      tarea_id: r.tarea_id,
      empleado_id: r.empleado_id || null,
      contratista_id: r.contratista_id || null,
      lote_id: r.lote_id,
      fecha_trabajo: r.fecha_trabajo,
      fraccion_jornal: etiquetaFraccionJornal(r.fraccion_jornal),
      costo_jornal: r.costo_jornal,
      valor_jornal_empleado: calcularValorJornalEmpleadoNuevo(r),
      observaciones: r.observaciones || null,
      _isNew: !!r._isNew,
      _deleted: !!r._deleted,
      _modified: !!r._modified,
    })),
    insumos_aplicados: Array.from(insumosMap.values()),
  };
}

// ---------------------------------------------------------------------------------------------
// Mano de obra del Reporte de Cierre — SIEMPRE en vivo (hallazgo #39, decisión de Santiago
// 2026-08-24)
// ---------------------------------------------------------------------------------------------

/**
 * Entradas de `calcularCostosVivosAplicacion`: la suma de `fraccion_jornal`/`costo_jornal` que
 * `fetchJornalesRealesPorLote(tareaId)` (`aplicacionesReales.ts`) ya trae por lote, más el
 * snapshot que `aplicaciones`/`aplicaciones_cierre` congelaron al momento del cierre.
 */
export interface CostosVivosAplicacionInput {
  jornalesVivos: number;
  costoManoObraVivo: number;
  costoTotalInsumos: number;
  totalArboles: number;
  snapshotJornales: number;
  snapshotCostoManoObra: number;
  snapshotValorJornal: number;
}

export interface CostosVivosAplicacion {
  jornalesUtilizados: number;
  costoTotalManoObra: number;
  valorJornal: number;
  costoTotalInsumos: number;
  costoTotal: number;
  costoPorArbol: number;
  arbolesPorJornal: number;
  /** `'registros_trabajo'` cuando hay al menos un jornal vivo que sumar; `'snapshot'` solo para
   * aplicaciones sin `tarea_id` vinculada o sin ningún registro capturado — el mismo caso límite
   * que `useReporteAplicacion.ts` ya trata así. Nunca cae a `'snapshot'` porque el número vivo
   * "se vea mal": la decisión del dueño es no volver a mostrar un valor congelado a propósito. */
  fuenteManoObra: 'registros_trabajo' | 'snapshot';
}

/**
 * Hallazgo #39 de la operación de mantenimiento: dos aplicaciones de enero cerraron con una
 * tarifa plana de $50.000/jornal tecleada a mano en el cierre, mientras `registros_trabajo` ya
 * tenía el costo real (y mayor) de cada jornal. El Reporte de Cierre (`DetalleAplicacion.tsx` y
 * el PDF de `generarPDFReporteCierre.ts`, vía `fetchDatosReporteCierre.ts`) leía el snapshot
 * congelado en `aplicaciones.costo_total_mano_obra` / `jornales_utilizados` / `valor_jornal` —
 * nunca recalculaba.
 *
 * Decisión del dueño (2026-08-24): la mano de obra se DERIVA EN VIVO de `registros_trabajo`,
 * igual que ya hace `calculosCostoKg.ts` para el costo/kg y que ya hacía
 * `useReporteAplicacion.ts` para la pantalla `/aplicaciones/:id/reporte` — un solo criterio en
 * todo el sistema en vez de dos formas de calcular lo mismo (el mismo patrón de defecto que el
 * hallazgo #3, dos divisores de jornal, y el #45, dos unidades en una columna). El snapshot deja
 * de participar del Reporte de Cierre salvo en el único caso en que no hay nada vivo que leer:
 * sin `tarea_id` vinculado o sin ningún `registros_trabajo` capturado (aplicaciones anteriores a
 * la vinculación automática tarea↔aplicación). `registros_trabajo.costo_jornal` en sí NO se
 * toca — sigue siendo el histórico correcto de lo que costó cada jornal al capturarlo (ver
 * `jornalDivisorContract.test.ts`); lo único que cambia es de dónde lee el Reporte de Cierre.
 *
 * `costo_total`/`costo_por_arbol`/`arboles_por_jornal` se recalculan con la misma fórmula que ya
 * usaban (`insumos + mano de obra`, `costo_total / árboles`, `árboles / jornales`) — no es una
 * regla nueva, es la misma aritmética aplicada al insumo de mano de obra correcto en vez del
 * congelado, para que las tarjetas del Reporte de Cierre no se contradigan entre sí.
 */
export function calcularCostosVivosAplicacion(input: CostosVivosAplicacionInput): CostosVivosAplicacion {
  const {
    jornalesVivos,
    costoManoObraVivo,
    costoTotalInsumos,
    totalArboles,
    snapshotJornales,
    snapshotCostoManoObra,
    snapshotValorJornal,
  } = input;

  const hayDatoVivo = jornalesVivos > 0;
  const jornalesUtilizados = hayDatoVivo ? jornalesVivos : snapshotJornales;
  const costoTotalManoObra = hayDatoVivo ? costoManoObraVivo : snapshotCostoManoObra;
  const valorJornal = hayDatoVivo ? costoManoObraVivo / jornalesVivos : snapshotValorJornal;
  const costoTotal = costoTotalInsumos + costoTotalManoObra;

  return {
    jornalesUtilizados,
    costoTotalManoObra,
    valorJornal,
    costoTotalInsumos,
    costoTotal,
    costoPorArbol: totalArboles > 0 ? costoTotal / totalArboles : 0,
    arbolesPorJornal: jornalesUtilizados > 0 ? totalArboles / jornalesUtilizados : 0,
    fuenteManoObra: hayDatoVivo ? 'registros_trabajo' : 'snapshot',
  };
}
