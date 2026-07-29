// ARCHIVO: utils/hatoProduccion.ts
// DESCRIPCIÓN: Motor puro de producción del rework del submódulo Producción
// (Hato Lechero) -- SOW 2 de `docs/plan_hato_produccion_rework.md` §4.2.
//
// Regla dura del brief (§4.1, "Dónde vive la lógica nueva"): TODA la lógica
// pura de este rework vive AQUÍ, nunca en `src/utils/calculosHato.ts`. Ese
// archivo está espejado byte-a-byte en dos árboles de servidor
// (`calculosHatoParidad.test.ts`) -- agregarle una función es deuda de
// mantenimiento en tres archivos para siempre, y ninguna función nueva de
// este rework tiene hoy un consumidor de servidor. Este módulo SÍ importa
// (nunca copia) tipos y funciones ya existentes de `calculosHato.ts`
// (`derivarEstadoReproductivo`, `EstadoActualHatoRow`, `HatoConfig`) y de
// `hatoCategorias.ts` (`clasificarCategoriaHato`) -- nunca reimplementa esa
// lógica.
//
// 100% puro: cero imports de Supabase, cero I/O, cero `Date.now()`/
// `new Date()` implícito -- toda función que depende de "hoy" recibe
// `fechaReferencia` como parámetro (mismo contrato que `calculosHato.ts`).
//
// Dos reglas del módulo que gobiernan TODO este archivo:
//   1. "Sin dato, nunca 0" -- una ventana sin pesajes, un bucket con menos
//      de 3 vacas, una vaca sin parto usable: todos devuelven `null`
//      explícito, jamás un cero fabricado ni una vaca descartada.
//   2. Trampa de unidades (riesgo R-4, Alta): los pesajes semanales son
//      LITROS POR VACA POR DÍA de pesaje; la producción quincenal es
//      LITROS ACUMULADOS DE ~15 DÍAS del camión. Este archivo NUNCA deriva
//      una unidad de la otra -- todo lo de aquí opera en "litros/día del
//      hato" (suma de los pesajes semanales, o su proyección), nunca en
//      litros/quincena. El componente que mezcle esto con el gráfico de
//      ventas quincenal (SOW 5) es responsable de mantener los dos ejes
//      separados; este motor ni siquiera tiene un tipo que represente
//      litros/quincena para que sea imposible pasarlo aquí por error.

import type {
  EstadoActualHatoRow,
  EstadoReproductivo,
  HatoConfig,
  TipoEstado,
  TipoEventoHato,
} from '@/utils/calculosHato';
import { derivarEstadoReproductivo, calcularProductividad } from '@/utils/calculosHato';
import { clasificarCategoriaHato } from '@/utils/hatoCategorias';
import type { EstadoAnimalHato, EtapaHato, HatoPesajeLeche, OrigenDatoProduccionQuincenal } from '@/types/hato';

// ============================================================================
// SOW 3 (captura) -- helpers puros del formulario quincenal y del diálogo de
// venta de animales. §6 SOW 3 del plan exige que la única lógica derivable
// de esos componentes (precio_unitario, validación de cabezas) viva aquí,
// nunca inline en el componente.
// ============================================================================

/** Fila cruda de `hato_produccion_quincenal` con el embed
 * `fin_ingreso:fin_ingresos(cantidad)` (migración 070, FK `fin_ingreso_id`)
 * -- el shape mínimo que necesita `resolverLitrosQuincenal`. Espejo (no
 * mirror byte-a-byte, archivo distinto) del mismo mecanismo del lado Esco
 * (`hato-aggregation.ts::resolverLitrosQuincenal`) -- ninguno de los dos
 * importa al otro, cruzan la frontera de despliegue. */
export interface FilaProduccionQuincenalCruda {
  litros_total: number | null;
  origen_dato: OrigenDatoProduccionQuincenal;
  /** Embed `fin_ingreso:fin_ingresos(cantidad)`. `null` si la consulta no
   * lo trajo (nunca debería pasar para una fila 'medido' real, dado que
   * `fin_ingreso_id` es NOT NULL) o si el join no encontró el ingreso. */
  fin_ingreso: { cantidad: number | null } | null;
}

/**
 * Litros reales de una quincena, sin importar `origen_dato` (migración
 * 070, `COMMENT ON COLUMN hato_produccion_quincenal.litros_total`):
 * 'medido' los lee del ingreso enlazado (`fin_ingresos.cantidad`, vía el
 * embed `fin_ingreso`) -- la columna `litros_total` es NULL a propósito
 * para esas filas. 'derivado_mensual' los lee de `litros_total` (la
 * partición del backfill, que no tiene otro lugar donde vivir). Ningún
 * consumidor del frontend debe leer `fila.litros_total` directo -- siempre
 * a través de esta función.
 */
export function resolverLitrosQuincenal(fila: FilaProduccionQuincenalCruda): number | null {
  return fila.origen_dato === 'medido' ? (fila.fin_ingreso?.cantidad ?? null) : fila.litros_total;
}

/**
 * `precio_unitario` derivado EN EL RENDER (plan §2.1, "Lo que
 * deliberadamente NO se agrega"): nunca se guarda una segunda copia, ya
 * vive calculado en `fin_ingresos.precio_unitario`. `null` sin litros
 * positivos -- nunca una división por cero disfrazada de precio.
 */
export function calcularPrecioUnitarioQuincena(
  valor: number | null | undefined,
  litrosTotal: number | null | undefined,
): number | null {
  if (valor == null || valor <= 0 || litrosTotal == null || litrosTotal <= 0) return null;
  return valor / litrosTotal;
}

/**
 * Valida `cabezas` para `VentaAnimalesHatoDialog` (decisión 6 del dueño:
 * cabezas + valor obligatorios, `fn_hato_registrar_venta_animales` exige
 * `>= 1`). Devuelve el mensaje de error, o `null` si es válido -- mismo
 * contrato de "mensaje o null" que el resto de las validaciones puras del
 * repo (p.ej. `esFechaFutura` en `hatoSalida.ts` devuelve boolean, pero
 * aquí el mensaje ya trae el texto exacto para el toast).
 */
export function validarCabezasVentaAnimales(cabezas: number | null | undefined): string | null {
  if (cabezas == null || !Number.isFinite(cabezas)) return 'Las cabezas son obligatorias';
  if (!Number.isInteger(cabezas) || cabezas < 1) return 'Las cabezas deben ser un número entero mayor o igual a 1';
  return null;
}

// ============================================================================
// SOW 5 (tablero) -- helpers puros de `KpisVentaHato.tsx`. Misma regla del
// §4.1: la única lógica derivable (clasificación por nombre de categoría,
// reconciliación de totales, promedio de productividad) vive aquí, nunca
// inline en el componente.
// ============================================================================

/** Las TRES cubetas de ingreso del Hato (decisión 7 del dueño, plan §0) más
 * un cuarto balde "otros" para cualquier categoría no reconocida -- así la
 * suma de las cuatro SIEMPRE reconcilia contra el total real de Finanzas
 * (§4.3: "el reparto de ingresos reconcilia por construcción"). Clasifica
 * por NOMBRE de categoría (ILIKE, igual que `fn_hato_guardar_quincena_venta`
 * / `fn_hato_registrar_venta_animales` del lado SQL, migración 070 -- nunca
 * un UUID hardcodeado, precedente `NEGOCIO_GANADO` en `IngresosList.tsx`). */
export type CubetaVentaHato = 'leche' | 'terneros' | 'descarte' | 'otros';

/** `categoriaNombre` sin `lower()` -- esta función lo hace internamente,
 * el caller pasa el nombre tal como llega de `fin_categorias_ingresos`. */
export function clasificarIngresoHato(categoriaNombre: string): CubetaVentaHato {
  const nombre = categoriaNombre.toLowerCase();
  if (nombre.includes('leche')) return 'leche';
  if (nombre.includes('ternero')) return 'terneros';
  if (nombre.includes('descarte')) return 'descarte';
  return 'otros';
}

/** Fila mínima de `fin_ingresos` (+ categoría embebida) que necesita
 * `repartoVentasHato`. `cantidad` es la columna de `fin_ingresos` -- SOLO
 * tiene semántica de litros para la cubeta `leche` (migración 042 la
 * puebla en litros para Hato Lechero); para terneros/descarte es cabezas u
 * otra unidad, así que nunca se suma fuera de esa cubeta. */
export interface IngresoHatoParaReparto {
  categoriaNombre: string;
  valor: number;
  cantidad: number | null;
  /** Fecha del ingreso (`fin_ingresos.fecha`) -- necesaria para
   * `filtrarIngresosPorPeriodo` (toggle quincena/mes/trimestre de
   * `KpisVentaHato.tsx`). No participa en la clasificación por cubeta. */
  fecha: string;
}

export interface DetalleCubetaVentaHato {
  valor: number;
  /** Litros SOLO para la cubeta `leche`; `null` en las demás -- no es que
   * sean 0 litros, es que la pregunta no aplica (terneros/descarte no se
   * venden por litro). */
  litros: number | null;
}

export interface RepartoVentasHato {
  leche: DetalleCubetaVentaHato;
  terneros: DetalleCubetaVentaHato;
  descarte: DetalleCubetaVentaHato;
  otros: DetalleCubetaVentaHato;
  /** Suma de las 4 cubetas -- por construcción, igual a `sum(ing.valor)`. */
  total: number;
}

/**
 * Clasifica y suma una lista de `fin_ingresos` del negocio Hato Lechero en
 * las 4 cubetas (decisión 14 del dueño: "reparto de ingresos leche /
 * terneros / descarte"). Un arreglo vacío devuelve las 4 cubetas en 0 con
 * `total=0` -- el componente decide el estado "sin ventas todavía", esta
 * función nunca inventa una cubeta.
 */
export function repartoVentasHato(ingresos: IngresoHatoParaReparto[]): RepartoVentasHato {
  const cubetas: Record<CubetaVentaHato, DetalleCubetaVentaHato> = {
    leche: { valor: 0, litros: 0 },
    terneros: { valor: 0, litros: null },
    descarte: { valor: 0, litros: null },
    otros: { valor: 0, litros: null },
  };
  let total = 0;

  for (const ingreso of ingresos) {
    const cubeta = clasificarIngresoHato(ingreso.categoriaNombre);
    cubetas[cubeta].valor += ingreso.valor;
    total += ingreso.valor;
    if (cubeta === 'leche' && ingreso.cantidad != null) {
      cubetas.leche.litros = (cubetas.leche.litros ?? 0) + ingreso.cantidad;
    }
  }

  // Ningún ingreso de leche trajo `cantidad` (o no hubo ninguno) -- `null`
  // explícito, nunca un `0` que se lea como "se vendieron 0 litros".
  if (cubetas.leche.litros === 0) cubetas.leche.litros = null;

  return { ...cubetas, total };
}

/**
 * Promedio simple de productividad (`calcularProductividad`, calculosHato.ts)
 * sobre un historial de quincenas -- KPI "L/vaca promedio" de
 * `KpisVentaHato.tsx`. Ignora las quincenas sin `litros_total` o sin
 * `num_vacas_ordeno` (nunca las cuenta como 0); `null` si ninguna quincena
 * del historial tiene ambos datos.
 */
export function promedioProductividadQuincenal(
  historial: Array<{ litros_total: number | null; num_vacas_ordeno: number | null }>,
): number | null {
  const valores = historial
    .map((h) => calcularProductividad(h.litros_total, h.num_vacas_ordeno))
    .filter((v): v is number => v !== null);
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

// ============================================================================
// Dialog de detalle de quincena (owner feedback, click en barra de
// `GraficoLitrosQuincenal`) + toggle quincena/mes/trimestre de "Ventas del
// Hato" (`KpisVentaHato.tsx`).
// ============================================================================

/** Shape mínimo del `fin_ingreso` embebido que necesita `detalleQuincenaVenta`
 * -- deliberadamente NO importa `FinIngresoEmbedQuincena` de
 * `useProduccionHato.ts` (ese tipo no está exportado, y el motor puro no
 * debe depender de un tipo de hook). */
export interface FinIngresoParaDetalleQuincena {
  valor: number;
  cantidad: number | null;
}

export interface DetalleQuincenaVentaInput {
  /** YA resuelto vía `resolverLitrosQuincenal` -- nunca `litros_total`
   * crudo (una fila `medido` lo trae en `null` a propósito). */
  litrosTotal: number | null;
  numVacasOrdeno: number | null;
  origenDato: OrigenDatoProduccionQuincenal;
  finIngreso: FinIngresoParaDetalleQuincena | null;
}

export interface DetalleQuincenaVenta {
  litrosTotal: number | null;
  /** `medido`: el valor real del ingreso enlazado 1:1. `derivado_mensual`:
   * estimado proporcional a la participación de esta quincena en los
   * litros del mes (`finIngreso.cantidad` es el total mensual) -- MISMA
   * convención de reparto 15/N que ya fijó `litros_total` en el backfill
   * (§5.2 del plan), nunca almacenada, siempre derivada en el render (igual
   * que `precio_unitario` en el resto del módulo). `null` sin litros
   * resueltos o sin la `cantidad` mensual con la que prorratear -- nunca un
   * valor fabricado de la nada. */
  valor: number | null;
  precioPromedio: number | null;
  /** `null` sin `num_vacas_ordeno` para esta quincena -- nunca 0. */
  lVacaPromedio: number | null;
}

/**
 * Detalle de UNA quincena para el diálogo que abre al hacer clic en una
 * barra de `GraficoLitrosQuincenal` (owner feedback, este rework):
 * total litros, valor, precio promedio (valor ÷ litros) y L/vaca promedio
 * cuando hay conteo de vacas -- `—` en cada caso ausente, la UI decide el
 * render, esta función solo calcula.
 */
export function detalleQuincenaVenta(input: DetalleQuincenaVentaInput): DetalleQuincenaVenta {
  const { litrosTotal, numVacasOrdeno, origenDato, finIngreso } = input;

  let valor: number | null = null;
  if (finIngreso) {
    if (origenDato === 'medido') {
      valor = finIngreso.valor;
    } else if (litrosTotal != null && finIngreso.cantidad != null && finIngreso.cantidad > 0) {
      valor = finIngreso.valor * (litrosTotal / finIngreso.cantidad);
    }
  }

  return {
    litrosTotal,
    valor,
    precioPromedio: calcularPrecioUnitarioQuincena(valor, litrosTotal),
    lVacaPromedio: calcularProductividad(litrosTotal, numVacasOrdeno),
  };
}

/** Las 4 ventanas del toggle "Ventas del Hato" (owner feedback: "add a
 * quincena, mes, trimestre toggle", más YTD agregado después -- ver
 * `rangoPeriodoVentaHato`). Mismo patrón que `VentanaRanking` de
 * `RankingVacas.tsx`, pero con "quincena" (el grano real de este dato) en
 * vez de "semana" -- el pesaje semanal y la venta quincenal son ejes
 * distintos, ver la cabecera de este archivo. */
export type PeriodoVentaHato = 'quincena' | 'mes' | 'trimestre' | 'ytd';

/** Las 3 ventanas RODANTES (todo excepto `ytd`, que es calendario-ancla,
 * nunca rodante -- ver `rangoPeriodoVentaHato`). */
type PeriodoVentaHatoRodante = Exclude<PeriodoVentaHato, 'ytd'>;

const DIAS_POR_PERIODO_VENTA: Record<PeriodoVentaHatoRodante, number> = {
  quincena: 15,
  mes: 30,
  trimestre: 90,
};

export function diasPeriodoVentaHato(periodo: PeriodoVentaHatoRodante): number {
  return DIAS_POR_PERIODO_VENTA[periodo];
}

/** Subconjunto de `HatoProduccionQuincenal` que necesita el filtro de
 * periodo -- cualquier fila con al menos una fecha sirve, el tipo real del
 * caller trae más campos. */
export interface FilaConFechasQuincena {
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

export interface RangoPeriodoVentaHato {
  /** Primer día INCLUIDO en la ventana. */
  desde: string;
  /** Último día INCLUIDO en la ventana -- siempre `fechaReferencia`. */
  hasta: string;
}

/**
 * Ventana [desde, hasta] de un periodo del toggle quincena/mes/trimestre/YTD
 * -- fuente ÚNICA de la que salen TANTO `filtrarHistorialPorPeriodo`/
 * `filtrarIngresosPorPeriodo` COMO el texto "gate de fechas" que
 * `KpisVentaHato.tsx` muestra bajo el toggle (owner feedback: "add a small
 * text below with the date gates applied"). Un solo cómputo para las dos
 * cosas -- si vivieran por separado podrían divergir y el texto mentiría
 * sobre lo que el filtro realmente aplicó.
 *
 * BUG de producción (owner, hallado a ojo, 2026-07-2x): el límite inferior
 * de las 3 ventanas RODANTES era INCLUSIVO (`fecha >= fechaReferencia - N`).
 * Con facturas de leche fechadas fin-de-mes, `fechaReferencia - 30` cae
 * EXACTAMENTE un mes atrás -- así que "Mes" sumaba DOS facturas mensuales
 * completas (jun + may) en vez de una. El límite inferior es ahora
 * EXCLUSIVO: `desde` es un día DESPUÉS de `fechaReferencia - N`, así que una
 * fila fechada exactamente N días antes del ancla queda fuera, y una
 * fechada N-1 días antes queda dentro (`src/__tests__/hatoProduccion.test.ts`,
 * casos con los valores reales de producción).
 *
 * `ytd` NO es una ventana rodante -- es CALENDARIO-ANCLA: `desde` es
 * SIEMPRE el 1 de enero del año de `fechaReferencia` (el ancla del dato
 * REAL más reciente, nunca "hoy" literal -- mismo criterio que
 * `fechaAnclaProduccion`/`fechaAnclaVentasHato`), INCLUSIVO, sin el
 * desplazamiento `+1 día` de arriba -- ese desplazamiento corrige un
 * artefacto de las ventanas de longitud fija (una fila fechada exactamente
 * N días atrás), y el 1 de enero es una frontera calendario real, no un
 * artefacto. Su duración varía entre 1 y 365 días según qué tan avanzado
 * esté el año del ancla.
 */
export function rangoPeriodoVentaHato(periodo: PeriodoVentaHato, fechaReferencia: string): RangoPeriodoVentaHato {
  if (periodo === 'ytd') {
    const { anio } = parsearIso(fechaReferencia);
    return { desde: `${anio}-01-01`, hasta: fechaReferencia };
  }
  const limiteInferior = sumarDias(fechaReferencia, -diasPeriodoVentaHato(periodo));
  return { desde: sumarDias(limiteInferior, 1), hasta: fechaReferencia };
}

/**
 * Filtra un historial de quincenas a la ventana rodante de
 * `rangoPeriodoVentaHato` (toggle quincena/mes/trimestre). Usa `fecha_fin`,
 * o `fecha_inicio` cuando `fecha_fin` es `null`; una fila sin NINGUNA de
 * las dos se excluye -- nunca se incluye por defecto una fila sin fecha.
 */
export function filtrarHistorialPorPeriodo<T extends FilaConFechasQuincena>(
  historial: readonly T[],
  periodo: PeriodoVentaHato,
  fechaReferencia: string,
): T[] {
  const { desde, hasta } = rangoPeriodoVentaHato(periodo, fechaReferencia);
  return historial.filter((h) => {
    const fecha = h.fecha_fin ?? h.fecha_inicio;
    return fecha != null && fecha >= desde && fecha <= hasta;
  });
}

/** Igual que `filtrarHistorialPorPeriodo`, pero para `fin_ingresos`
 * (fecha única, siempre presente -- NOT NULL en esa tabla). */
export function filtrarIngresosPorPeriodo<T extends { fecha: string }>(
  ingresos: readonly T[],
  periodo: PeriodoVentaHato,
  fechaReferencia: string,
): T[] {
  const { desde, hasta } = rangoPeriodoVentaHato(periodo, fechaReferencia);
  return ingresos.filter((i) => i.fecha >= desde && i.fecha <= hasta);
}

/**
 * Ancla temporal del bloque "Ventas del Hato" -- mismo criterio que
 * `fechaAnclaProduccion` (pesaje semanal): las ventanas de periodo se
 * anclan al dato REAL más reciente (entre las quincenas cargadas y los
 * ingresos del reparto), nunca a "hoy" literal, para no dejar el bloque en
 * `—` cuando la captura tiene backlog. Sin ningún dato: devuelve `hoy` tal
 * cual.
 */
export function fechaAnclaVentasHato(
  historialQuincenal: readonly FilaConFechasQuincena[],
  ingresos: readonly { fecha: string }[],
  hoy: string,
): string {
  const fechas = [
    ...historialQuincenal
      .map((h) => h.fecha_fin ?? h.fecha_inicio)
      .filter((f): f is string => f != null),
    ...ingresos.map((i) => i.fecha),
  ];
  return maxFecha(fechas) ?? hoy;
}

// ============================================================================
// Utilidades de fecha (privadas -- réplica mínima, deliberadamente NO
// importada de `calculosHato.ts`: esas funciones no están exportadas, y
// duplicar 15 líneas de aritmética de fechas es más barato que abrir ese
// archivo protegido por paridad a exportar utilidades internas que no
// necesita ningún consumidor de servidor).
// ============================================================================

function parsearIso(fechaIso: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  return { anio, mes, dia };
}

/** Diferencia en días (hasta - desde). Las fechas ISO `yyyy-mm-dd` también
 * se pueden comparar como texto -- se usa esa propiedad en varios puntos de
 * este archivo (mismo truco que `calculosHato.ts`). */
function diferenciaDias(desde: string, hasta: string): number {
  const a = parsearIso(desde);
  const b = parsearIso(hasta);
  const ta = Date.UTC(a.anio, a.mes - 1, a.dia);
  const tb = Date.UTC(b.anio, b.mes - 1, b.dia);
  return Math.round((tb - ta) / 86400000);
}

/** Suma (o resta, con `dias` negativo) días calendario a una fecha ISO. */
function sumarDias(fechaIso: string, dias: number): string {
  const { anio, mes, dia } = parsearIso(fechaIso);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function maxFecha(fechas: string[]): string | null {
  return fechas.length === 0 ? null : fechas.reduce((max, f) => (f > max ? f : max));
}

// ============================================================================
// Ordenamiento genérico -- "una vaca sin dato no es una rezagada" (decisión
// 10): las `null` van SIEMPRE al final, sin importar la dirección pedida.
// ============================================================================

export type DireccionOrden = 'asc' | 'desc';

/**
 * Ordena `filas` por el valor numérico que devuelva `obtenerValor`, con las
 * `null` siempre al final -- en ascendente Y en descendente. Reutilizado por
 * el ranking por vaca (decisión 12, columnas `actual`/`potencial`
 * ordenables) y por cualquier otra tabla ordenable del tablero.
 */
export function ordenarConNulosAlFinal<T>(
  filas: readonly T[],
  obtenerValor: (fila: T) => number | null,
  direccion: DireccionOrden,
): T[] {
  const conValor: T[] = [];
  const sinValor: T[] = [];
  for (const fila of filas) {
    (obtenerValor(fila) === null ? sinValor : conValor).push(fila);
  }
  conValor.sort((a, b) => {
    const va = obtenerValor(a) as number;
    const vb = obtenerValor(b) as number;
    return direccion === 'asc' ? va - vb : vb - va;
  });
  return [...conValor, ...sinValor];
}

/** Ventanas de ranking (decisión 12) expresadas en semanas, para poder
 * reusar `rendimientoPorVaca` con distinto `ventanaSemanas` en vez de tener
 * un cálculo de ranking separado. `mes`/`trimestre` son aproximaciones en
 * semanas completas (4 y 13) -- no hace falta más precisión para una
 * ventana móvil de promedio. `ytd` no cabe en este patrón (no es un número
 * fijo de semanas) -- ver `ventanaDiasRanking`. */
export type VentanaRanking = 'semana' | 'mes' | 'trimestre' | 'ytd';

/** Las 3 ventanas de ranking expresables en semanas completas (todo excepto
 * `ytd`). */
type VentanaRankingSemanal = Exclude<VentanaRanking, 'ytd'>;

const SEMANAS_POR_VENTANA_RANKING: Record<VentanaRankingSemanal, number> = {
  semana: 1,
  mes: 4,
  trimestre: 13,
};

export function ventanaSemanasDe(ventana: VentanaRankingSemanal): number {
  return SEMANAS_POR_VENTANA_RANKING[ventana];
}

/**
 * Ventana del ranking en DÍAS, lista para pasar como `ventanaDias` a
 * `rendimientoPorVaca` -- para `semana`/`mes`/`trimestre` es simplemente
 * `ventanaSemanasDe(ventana) * 7` (igual que antes de agregar YTD). Para
 * `ytd` no hay un conteo fijo de semanas: la ventana es CALENDARIO, desde
 * el 1 de enero del año del ANCLA (`fechaReferencia` -- el pesaje más
 * reciente, nunca "hoy" literal, mismo criterio que `fechaAnclaProduccion`)
 * hasta el ancla.
 */
export function ventanaDiasRanking(ventana: VentanaRanking, fechaReferencia: string): number {
  if (ventana === 'ytd') {
    const { anio } = parsearIso(fechaReferencia);
    return diferenciaDias(`${anio}-01-01`, fechaReferencia);
  }
  return ventanaSemanasDe(ventana) * 7;
}

// ============================================================================
// a) Rendimiento por vaca (decisión 10) -- §4.2a
// ============================================================================

/** Subconjunto de `hato_pesajes_leche` (migración 054/061) que este motor
 * consume -- litros/vaca/día de pesaje, NUNCA litros/quincena (ver cabecera
 * de este archivo, trampa de unidades R-4). */
export type PesajeLecheVaca = Pick<HatoPesajeLeche, 'animal_id' | 'fecha' | 'litros_total'>;

export interface OpcionesRendimientoVaca {
  /** Ventana móvil en semanas para el promedio "actual". Default 4
   * (decisión 10: "promedio móvil de pesajes recientes"). Ignorada cuando
   * `ventanaDias` viene informado. */
  ventanaSemanas?: number;
  /** Ventana móvil en DÍAS -- toma precedencia sobre `ventanaSemanas`
   * cuando ambas vienen informadas. Único caso de uso hoy: YTD del ranking
   * por vaca (`ventanaDiasRanking`), cuya duración varía entre 1 y 365
   * días según el ancla -- no cabe en el patrón de "N semanas completas"
   * del resto de ventanas. */
  ventanaDias?: number;
}

export interface RendimientoVaca {
  animalId: string;
  /** Promedio de litros/día sobre los pesajes presentes en la ventana móvil
   * (por defecto 4 semanas). Promedio SOBRE LAS FILAS PRESENTES -- una
   * semana sin pesar no cuenta como 0. Cero filas en la ventana -> `null`,
   * nunca 0. */
  actual: number | null;
  /** Pico de litros/día desde el último parto (pico de la lactancia
   * actual). Sin parto usable, pico sobre TODO el historial de la vaca
   * (`lactanciaConocida=false` para que la UI lo rotule). `null` solo si la
   * vaca no tiene ningún pesaje utilizable. */
  potencial: number | null;
  /** Semanas transcurridas desde el último parto, evaluadas en
   * `fechaReferencia` (no en el pesaje más reciente). `null` sin parto
   * usable. */
  semanasDesdeParto: number | null;
  /** Cantidad de pesajes que cayeron dentro de la ventana móvil usada para
   * `actual` -- soporta el tooltip "N pesajes en las últimas M semanas". */
  nPesajesVentana: number;
  /** `false` cuando la vaca no tiene fecha de parto usable -- sigue
   * visible en el ranking (nunca se excluye), pero `potencial` es sobre
   * todo el historial, no sobre "la lactancia actual" (decisión 11). */
  lactanciaConocida: boolean;
}

const VENTANA_ACTUAL_SEMANAS_DEFAULT = 4;

/**
 * Rendimiento actual/potencial por vaca (decisión 10). Solo devuelve filas
 * para vacas que aparecen en `pesajes` -- una vaca que JAMÁS ha sido pesada
 * no tiene ninguna fila que promediar; el tablero la representa por otro
 * lado (vejez de dato / lista de animales), no aquí. Nunca mira al futuro:
 * cualquier pesaje con `fecha > fechaReferencia` se ignora por completo.
 */
export function rendimientoPorVaca(
  pesajes: PesajeLecheVaca[],
  partosPorAnimal: Map<string, string>,
  fechaReferencia: string,
  opciones: OpcionesRendimientoVaca = {},
): RendimientoVaca[] {
  const ventanaDias = opciones.ventanaDias ?? (opciones.ventanaSemanas ?? VENTANA_ACTUAL_SEMANAS_DEFAULT) * 7;

  const porAnimal = new Map<string, PesajeLecheVaca[]>();
  for (const p of pesajes) {
    if (p.fecha > fechaReferencia) continue;
    if (!porAnimal.has(p.animal_id)) porAnimal.set(p.animal_id, []);
    porAnimal.get(p.animal_id)!.push(p);
  }

  const resultado: RendimientoVaca[] = [];
  for (const [animalId, pesajesVaca] of porAnimal) {
    const fechaParto = partosPorAnimal.get(animalId);
    const lactanciaConocida = fechaParto != null && fechaParto <= fechaReferencia;

    const pesajesVentana = pesajesVaca.filter((p) => diferenciaDias(p.fecha, fechaReferencia) < ventanaDias);
    const actual =
      pesajesVentana.length === 0
        ? null
        : pesajesVentana.reduce((acc, p) => acc + p.litros_total, 0) / pesajesVentana.length;

    const pesajesLactancia = lactanciaConocida
      ? pesajesVaca.filter((p) => p.fecha >= (fechaParto as string))
      : pesajesVaca;
    const potencial =
      pesajesLactancia.length === 0 ? null : Math.max(...pesajesLactancia.map((p) => p.litros_total));

    resultado.push({
      animalId,
      actual,
      potencial,
      semanasDesdeParto: lactanciaConocida ? semanasDesdeParto(fechaReferencia, fechaParto as string) : null,
      nPesajesVentana: pesajesVentana.length,
      lactanciaConocida,
    });
  }
  return resultado;
}

// ============================================================================
// b) Curva de lactancia (decisión 11) -- §4.2b
// ============================================================================

/** Semanas transcurridas desde `fechaParto` hasta `fechaPesaje`
 * (`floor(dias/7)`). Puede ser negativo si `fechaPesaje` es anterior al
 * parto -- los callers de este archivo lo filtran (un pesaje pre-parto no
 * pertenece a la lactancia que ese parto abrió). */
export function semanasDesdeParto(fechaPesaje: string, fechaParto: string): number {
  return Math.floor(diferenciaDias(fechaParto, fechaPesaje) / 7);
}

export interface PuntoCurvaVaca {
  semana: number;
  litros: number;
}

/**
 * Curva de UNA vaca: un punto por pesaje, en semanas desde su último parto.
 * Pesajes anteriores al parto (dato de una lactancia anterior, o un parto
 * mal fechado) se excluyen -- nunca se grafica una semana negativa.
 */
export function curvaVaca(pesajesVaca: PesajeLecheVaca[], fechaUltimoParto: string): PuntoCurvaVaca[] {
  return pesajesVaca
    .map((p) => ({ semana: semanasDesdeParto(p.fecha, fechaUltimoParto), litros: p.litros_total }))
    .filter((punto) => punto.semana >= 0)
    .sort((a, b) => a.semana - b.semana);
}

export interface PuntoCurvaHato {
  semana: number;
  /** `null` cuando el bucket tiene menos de `MINIMO_VACAS_BUCKET` vacas --
   * muestra insuficiente, nunca un promedio de una sola vaca. */
  litros: number | null;
  nVacas: number;
}

/** Umbral de muestra mínima por bucket de la curva del hato (§4.2b). */
export const MINIMO_VACAS_BUCKET_CURVA = 3;

/**
 * Curva del HATO: promedio de litros/día por semana-desde-parto, agregando
 * todas las vacas con parto conocido. Una vaca sin fecha de parto usable
 * (no está en `partos`) queda EXCLUIDA aquí -- decisión 11 exige que siga
 * visible en otras vistas (ver `rendimientoPorVaca`, que nunca la
 * descarta), pero nunca se le imputa una fecha de parto para poder
 * incluirla: eso contaminaría el promedio del hato con una alineación
 * inventada (mismo error de clase que el contador de lluvia congelado,
 * migración 068).
 */
export function curvaLactanciaHato(pesajes: PesajeLecheVaca[], partos: Map<string, string>): PuntoCurvaHato[] {
  const porSemana = new Map<number, { litros: number[]; animales: Set<string> }>();
  for (const p of pesajes) {
    const fechaParto = partos.get(p.animal_id);
    if (!fechaParto) continue; // sin parto usable -- excluida de la curva del hato
    const semana = semanasDesdeParto(p.fecha, fechaParto);
    if (semana < 0) continue;
    if (!porSemana.has(semana)) porSemana.set(semana, { litros: [], animales: new Set() });
    const bucket = porSemana.get(semana)!;
    bucket.litros.push(p.litros_total);
    bucket.animales.add(p.animal_id);
  }
  return [...porSemana.entries()]
    .map(([semana, { litros, animales }]) => ({
      semana,
      nVacas: animales.size,
      litros: animales.size < MINIMO_VACAS_BUCKET_CURVA ? null : litros.reduce((a, b) => a + b, 0) / litros.length,
    }))
    .sort((a, b) => a.semana - b.semana);
}

// ============================================================================
// c) Pronóstico bottom-up (decisión 13) -- §4.2c
// ============================================================================

export interface VejezPesajes {
  ultimaFecha: string | null;
  semanas: number | null;
  nivel: 'ok' | 'atrasado' | 'critico';
}

/**
 * Vejez del dato de pesaje semanal (decisión 17): `ok` <= 1 semana,
 * `atrasado` 2-3, `critico` >= 4. Sin ningún pesaje registrado nunca (caso
 * de arranque, no el backlog operativo) se reporta `critico` con
 * `ultimaFecha`/`semanas` en `null` -- no hay fecha que mostrar, y "sin
 * ningún dato" es al menos tan grave como 4 semanas de backlog.
 */
export function vejezPesajes(pesajes: PesajeLecheVaca[], fechaReferencia: string): VejezPesajes {
  if (pesajes.length === 0) {
    return { ultimaFecha: null, semanas: null, nivel: 'critico' };
  }
  const ultimaFecha = maxFecha(pesajes.map((p) => p.fecha)) as string;
  const semanas = Math.floor(diferenciaDias(ultimaFecha, fechaReferencia) / 7);
  const nivel: VejezPesajes['nivel'] = semanas <= 1 ? 'ok' : semanas <= 3 ? 'atrasado' : 'critico';
  return { ultimaFecha, semanas, nivel };
}

/**
 * Ancla las VENTANAS de cálculo del tracker (`proyectarHato`, tramo
 * medido) y del ranking (`rendimientoPorVaca`) al pesaje MÁS RECIENTE en
 * vez de a "hoy" literal (QA fix, `docs/hato/qa-produccion-rework.md`
 * FIX 3). El hato real acumula backlog operativo (última fila registrada
 * 2026-06-24, con la vista corriendo el 2026-07-28 -- 34 días de brecha):
 * anclar a "hoy" deja las 4 semanas medidas del tracker y la ventana de 28
 * días del ranking completamente vacías, aunque 31 vacas tengan pesajes
 * recientes respecto A ESE ÚLTIMO PESAJE.
 *
 * El chip de vejez (`vejezPesajes`) NUNCA debe recibir esta fecha como su
 * `fechaReferencia` -- su trabajo es precisamente comparar el último
 * pesaje contra "hoy" real para comunicar la brecha; anclarlo a sí mismo
 * lo dejaría siempre en `nivel: 'ok'`.
 *
 * Sin ningún pesaje: devuelve `hoy` tal cual -- no hay otra ancla posible
 * (arranque real del módulo, no backlog; `vejezPesajes` ya cubre ese caso
 * por separado con `nivel: 'critico'`).
 */
export function fechaAnclaProduccion(pesajes: PesajeLecheVaca[], hoy: string): string {
  return maxFecha(pesajes.map((p) => p.fecha)) ?? hoy;
}

/** Estado reproductivo de UNA vaca, ya derivado por el caller vía
 * `derivarEstadoReproductivo` (calculosHato.ts) -- este motor NO recalcula
 * fechas de parto/secado, solo las consume (§4.2c: "Las dos fechas ya las
 * produce el motor existente; no se recalculan aquí"). */
export interface EstadoReproductivoProyeccion {
  animalId: string;
  /** `true` si la vaca está en ordeño (categoría `hato`, ver
   * `hatoCategorias.ts`) en `fechaReferencia` -- decide si entra como "vaca
   * base" del pronóstico. */
  enOrdeno: boolean;
  fechaProbableParto: string | null;
  fechaSecar: string | null;
}

export interface ProyectarHatoInput {
  pesajes: PesajeLecheVaca[];
  /** animalId -> fecha del último parto conocido. */
  partos: Map<string, string>;
  estadosReproductivos: EstadoReproductivoProyeccion[];
  curvaHato: PuntoCurvaHato[];
  fechaReferencia: string;
  /** Semanas hacia adelante a proyectar (decisión 13: 2). */
  horizonteSemanas: number;
  /** Semanas medidas hacia atrás que acompañan el pronóstico en la misma
   * serie (decisión 13: "tendencia de las últimas 4 semanas + pronóstico
   * de las próximas 2"). No es parte del objeto de entrada tal como lo
   * enumera literalmente el brief §4.2c -- se agrega aquí como opcional con
   * el default que la decisión pide, documentado como decisión de
   * implementación. */
  ventanaMedidaSemanas?: number;
}

export interface SemanaProyeccion {
  /** Offset en semanas respecto a `fechaReferencia`: negativo/cero =
   * semana medida ya transcurrida (0 = la semana que incluye
   * `fechaReferencia`), positivo = semana proyectada hacia adelante. */
  semana: number;
  /** Litros/día TOTALES DEL HATO para esa semana (NUNCA litros/quincena,
   * ver cabecera del archivo). `null` cuando es una semana medida sin
   * ningún pesaje (backlog, riesgo R-7) o una semana proyectada sin
   * ninguna vaca con base suficiente para proyectar -- nunca 0. */
  litrosDia: number | null;
  tipo: 'medido' | 'proyectado';
  /** Vacas en ordeño que forman la base del pronóstico (constantes a lo
   * largo del horizonte, salvo las que entran/salen). Vacío en semanas
   * medidas. */
  vacasBase: string[];
  /** Vacas cuyo `fecha_probable_parto` cae exactamente en esta semana. */
  vacasEntran: string[];
  /** Vacas cuyo `fecha_secar` cae exactamente en esta semana -- dejan de
   * contribuir desde esta semana en adelante. */
  vacasSalen: string[];
  /** Vacas proyectadas PLANAS (al nivel `actual`, sin escalar por la curva
   * del hato) porque a `curvaHato` le faltó alguno de los dos buckets que
   * hacían falta para calcular la forma -- nunca se extrapola con una
   * forma que no se conoce. */
  planas: string[];
}

/** Semanas desde `fechaReferencia` hasta `fecha` (puede ser negativo si
 * `fecha` es anterior), redondeadas hacia arriba en magnitud -- usada para
 * decidir en qué semana del horizonte cae una entrada/salida. */
function semanaDesdeReferencia(fechaReferencia: string, fecha: string): number {
  return Math.ceil(diferenciaDias(fechaReferencia, fecha) / 7);
}

/**
 * Pronóstico bottom-up de litros/día del hato (decisión 13): cada vaca en
 * ordeño se proyecta sobre su propia curva de lactancia (escalada a su
 * nivel actual), se suman las que van a parir dentro del horizonte y se
 * restan (dejan de contribuir) las que van a secarse. Nunca es una línea
 * de tendencia a nivel de hato.
 */
export function proyectarHato(input: ProyectarHatoInput): SemanaProyeccion[] {
  const {
    pesajes,
    partos,
    estadosReproductivos,
    curvaHato,
    fechaReferencia,
    horizonteSemanas,
    ventanaMedidaSemanas = 4,
  } = input;

  const mapaCurva = new Map(curvaHato.map((p) => [p.semana, p]));
  const rendimientos = new Map(rendimientoPorVaca(pesajes, partos, fechaReferencia).map((r) => [r.animalId, r]));

  const resultado: SemanaProyeccion[] = [];

  // --- Semanas medidas: -( ventanaMedidaSemanas - 1 ) .. 0 -------------------
  for (let i = ventanaMedidaSemanas - 1; i >= 0; i--) {
    const inicio = sumarDias(fechaReferencia, -(i * 7 + 6));
    const fin = sumarDias(fechaReferencia, -(i * 7));
    const pesajesSemana = pesajes.filter((p) => p.fecha >= inicio && p.fecha <= fin);
    const litrosDia =
      pesajesSemana.length === 0 ? null : pesajesSemana.reduce((acc, p) => acc + p.litros_total, 0);
    resultado.push({
      semana: -i,
      litrosDia,
      tipo: 'medido',
      vacasBase: [...new Set(pesajesSemana.map((p) => p.animal_id))],
      vacasEntran: [],
      vacasSalen: [],
      planas: [],
    });
  }

  // --- Semanas proyectadas: 1 .. horizonteSemanas -----------------------------
  const vacasBase = estadosReproductivos.filter((e) => e.enOrdeno);
  const idsVacasBase = new Set(vacasBase.map((v) => v.animalId));

  for (let k = 1; k <= horizonteSemanas; k++) {
    let litrosDia = 0;
    let huboContribucion = false;
    const planas: string[] = [];
    const entranSemana: string[] = [];
    const salenSemana: string[] = [];

    for (const vaca of vacasBase) {
      if (vaca.fechaSecar) {
        const semanaSalida = semanaDesdeReferencia(fechaReferencia, vaca.fechaSecar);
        if (semanaSalida <= k) {
          if (semanaSalida === k) salenSemana.push(vaca.animalId);
          continue; // ya seca en o antes de esta semana -- no contribuye
        }
      }

      const nivel = rendimientos.get(vaca.animalId)?.actual ?? null;
      if (nivel === null) continue; // sin pesajes recientes -- no hay base desde la cual proyectar

      const fechaParto = partos.get(vaca.animalId);
      const semanaBase = fechaParto ? semanasDesdeParto(fechaReferencia, fechaParto) : null;
      const bucketBase = semanaBase !== null ? mapaCurva.get(semanaBase) : undefined;
      const bucketFuturo = semanaBase !== null ? mapaCurva.get(semanaBase + k) : undefined;
      const forma =
        bucketBase && bucketFuturo && bucketBase.litros !== null && bucketFuturo.litros !== null && bucketBase.litros > 0
          ? bucketFuturo.litros / bucketBase.litros
          : null;

      if (forma === null) planas.push(vaca.animalId);
      litrosDia += forma !== null ? nivel * forma : nivel;
      huboContribucion = true;
    }

    for (const vaca of estadosReproductivos) {
      if (idsVacasBase.has(vaca.animalId)) continue; // ya evaluada arriba
      if (!vaca.fechaProbableParto) continue;
      const semanaEntrada = semanaDesdeReferencia(fechaReferencia, vaca.fechaProbableParto);
      if (semanaEntrada > k || semanaEntrada < 1) continue; // aún no entra, o ya entró antes de este horizonte
      if (semanaEntrada === k) entranSemana.push(vaca.animalId);

      const semanasEnLactancia = k - semanaEntrada;
      const bucket = mapaCurva.get(semanasEnLactancia);
      if (bucket && bucket.litros !== null) {
        litrosDia += bucket.litros;
        huboContribucion = true;
      } else {
        planas.push(vaca.animalId); // sin curva de referencia para su semana de lactancia -- no se suma nada
      }
    }

    resultado.push({
      semana: k,
      litrosDia: huboContribucion ? litrosDia : null,
      tipo: 'proyectado',
      vacasBase: vacasBase.map((v) => v.animalId),
      vacasEntran: entranSemana,
      vacasSalen: salenSemana,
      planas,
    });
  }

  return resultado;
}

/**
 * Rango [mín, máx] de vacas pesadas entre las semanas MEDIDAS de una
 * proyección (QA fix, `docs/hato/qa-produccion-rework.md` FIX 4, §5.2
 * "COBERTURA DE PESAJE INCOMPLETA"): la línea `medido` del tracker es una
 * SUMA cruda del hato, consistente en unidades (litros/día), pero con un
 * denominador que se mueve -- 20 vacas pesadas en marzo, 28 en junio 2026,
 * así que ~34% del salto de la serie es más vacas pesadas, no más leche
 * por vaca. Esta función no normaliza nada (`proyectarHato` sigue
 * plotteando el total del hato -- es una pregunta de hato, no por vaca);
 * solo declara la cobertura para que el caller decida mostrarla cuando
 * varía (sub-label visible, nunca solo en el tooltip).
 *
 * Cuenta SOLO semanas con dato (`litrosDia !== null`) -- una semana en
 * blanco (backlog) no tiene vacas que contar, no es un 0 vacas. `null` si
 * ninguna semana medida tiene dato.
 */
export function rangoVacasMedidas(semanas: SemanaProyeccion[]): { min: number; max: number } | null {
  const conteos = semanas
    .filter((s) => s.tipo === 'medido' && s.litrosDia !== null)
    .map((s) => s.vacasBase.length);
  if (conteos.length === 0) return null;
  return { min: Math.min(...conteos), max: Math.max(...conteos) };
}

// ============================================================================
// e) Reconstrucción de estado a una fecha pasada (decisión 16) -- §4.2e
// ============================================================================

/** Subconjunto de `hato_animales` que necesita la reconstrucción histórica. */
export interface AnimalHistorico {
  id: string;
  etapa: EtapaHato;
  raza: string | null;
  estado: EstadoAnimalHato;
  fecha_estado: string | null;
}

/** Subconjunto de `hato_eventos` que necesita la reconstrucción histórica. */
export interface EventoHistorico {
  animal_id: string;
  tipo: TipoEventoHato;
  fecha: string;
}

/** Fila de `hato_chequeo_vacas` YA UNIDA a la fecha de su `hato_chequeos`
 * (responsabilidad del caller -- este motor no tiene acceso a la base para
 * hacer ese join). `estado` es la columna normalizada de la migración 062
 * (`TipoEstado`), no el `estado_raw`. */
export interface ChequeoVacaHistorico {
  animal_id: string;
  fecha: string;
  estado: TipoEstado | null;
}

/**
 * Fila reconstruida con el mismo shape que `EstadoActualHatoRow`
 * (`calculosHato.ts`), extendida con lo que la reconstrucción histórica
 * necesita y que la vista `v_hato_estado_actual` nunca tuvo que cargar:
 * identidad del animal y la cobertura del dato de entrada/salida usada
 * para decidir si seguía presente en `fechaCorte`.
 */
export interface FilaEstadoHistorico extends EstadoActualHatoRow {
  animalId: string;
  /** `true` si, según la evidencia disponible, el animal seguía en el hato
   * en `fechaCorte`. Un animal con `cobertura==='sin_fecha'` NUNCA es
   * `presente`: no hay evidencia con la que afirmarlo. */
  presente: boolean;
  /** `'sin_fecha'` es el caso de riesgo R-2, en sus DOS direcciones:
   *  - Salida: un animal con `estado` terminal (ej. `vendida`) sin evento
   *    de salida NI `fecha_estado` -- 91 animales así en el hato real.
   *  - Entrada: un animal `activa` sin NINGÚN evento ni fila de chequeo
   *    -- `fecha_estado` solo se puebla al SALIR del hato (columna vacía
   *    en el 100% de los animales `activa` reales), así que nunca puede
   *    fechar una ENTRADA; sin al menos un evento o chequeo que lo
   *    respalde no hay forma de saber desde cuándo estaba en el hato.
   * En ambos casos: contarlo "presente" en cualquier corte inflaría (o
   * desinflaría) cada periodo histórico por igual; por eso se excluye del
   * conteo (ver `contarVacasEnOrdenoAFecha`) y se reporta aparte. */
  cobertura: 'con_fecha' | 'sin_fecha';
}

const TIPOS_EVENTO_SALIDA: ReadonlySet<TipoEventoHato> = new Set(['venta', 'muerte']);

/** Fecha del registro MÁS ANTIGUO (evento o chequeo, sin filtrar por
 * `fechaCorte`) que menciona a este animal -- la única evidencia disponible
 * de "desde cuándo lo hemos visto". `null` si no hay ningún registro en
 * absoluto (ej. una ficha recién creada, sin historial todavía). */
function primeraEvidencia(eventosAnimalTodos: EventoHistorico[], chequeosAnimalTodos: ChequeoVacaHistorico[]): string | null {
  const fechas = [...eventosAnimalTodos.map((e) => e.fecha), ...chequeosAnimalTodos.map((c) => c.fecha)];
  return fechas.length === 0 ? null : fechas.reduce((min, f) => (f < min ? f : min));
}

/**
 * Reconstruye, para cada animal, el mismo shape que expone
 * `v_hato_estado_actual` PERO evaluado en `fechaCorte` en vez de "hoy" --
 * esa vista es de estado ACTUAL, no sirve para un corte histórico (§4.2e).
 * Filtra eventos y chequeos a `fecha <= fechaCorte` y decide si el animal
 * ya había salido del hato (o si TODAVÍA no había entrado) para esa fecha:
 *
 * Lado de SALIDA:
 *   1. Si hay un evento `venta`/`muerte` con `fecha <= fechaCorte`: esa es
 *      la fecha de salida (fuente más confiable, es un hecho registrado).
 *   2. Si no hay evento pero el `estado` ACTUAL del animal es terminal:
 *      - `fecha_estado <= fechaCorte`: la transición ya había ocurrido.
 *      - `fecha_estado > fechaCorte`: la transición fue DESPUÉS del corte
 *        -- en `fechaCorte` el animal seguía activo.
 *      - `fecha_estado` nulo: no hay forma de saberlo -- `cobertura:
 *        'sin_fecha'` (el caso de los 91 animales `vendida` sin evento).
 *   3. `estado === 'activa'`: nunca salió (por el lado de salida).
 *
 * Lado de ENTRADA (simétrico -- riesgo R-2 también corre en esta
 * dirección: `fecha_estado` fecha SALIDAS, nunca entradas, y en la
 * práctica es una columna vacía en el 100% de los animales `activa`
 * reales, así que no sirve de nada aquí): solo se evalúa cuando el lado de
 * salida no descartó ya al animal, para no perder cobertura donde ya se
 * tenía.
 *   - Si hay al menos un evento o chequeo (`primeraEvidencia`) y
 *     `fechaCorte` es ANTERIOR a esa primera evidencia: sabemos que
 *     todavía no había aparecido en el hato -- `presente=false`, pero
 *     `cobertura` se mantiene `'con_fecha'` (es un "no" informado, no una
 *     laguna).
 *   - Si NO hay ningún evento ni chequeo en toda la vida del animal: no
 *     hay ninguna evidencia con la que afirmar ni desmentir su presencia
 *     en ningún corte histórico -- `cobertura: 'sin_fecha'`.
 *
 * Nunca se inventa una fecha de entrada o salida. Nunca se descarta un
 * animal sin marcar por qué.
 */
export function reconstruirEstadoAFecha(
  animales: AnimalHistorico[],
  eventos: EventoHistorico[],
  chequeoVacas: ChequeoVacaHistorico[],
  fechaCorte: string,
): FilaEstadoHistorico[] {
  return animales.map((animal) => {
    const eventosAnimalTodos = eventos.filter((e) => e.animal_id === animal.id);
    const chequeosAnimalTodos = chequeoVacas.filter((c) => c.animal_id === animal.id);

    const eventosAnimal = eventosAnimalTodos.filter((e) => e.fecha <= fechaCorte);
    const eventoSalida = eventosAnimal
      .filter((e) => TIPOS_EVENTO_SALIDA.has(e.tipo))
      .sort((a, b) => (a.fecha > b.fecha ? -1 : 1))[0]; // más reciente primero

    let cobertura: FilaEstadoHistorico['cobertura'] = 'con_fecha';
    let fechaSalidaConocida: string | null = null;

    if (eventoSalida) {
      fechaSalidaConocida = eventoSalida.fecha; // ya <= fechaCorte por el filtro de arriba
    } else if (animal.estado !== 'activa') {
      if (animal.fecha_estado && animal.fecha_estado <= fechaCorte) {
        fechaSalidaConocida = animal.fecha_estado;
      } else if (!animal.fecha_estado) {
        cobertura = 'sin_fecha'; // riesgo R-2 (salida): sin evento NI fecha_estado
      }
      // Si `fecha_estado > fechaCorte`: la salida fue después del corte,
      // el animal seguía activo -- fechaSalidaConocida queda en null.
    }
    // `estado === 'activa'`: nunca salió, fechaSalidaConocida queda null.

    let presente = cobertura === 'con_fecha' && fechaSalidaConocida === null;

    // Lado de entrada: solo tiene sentido evaluarlo cuando el lado de
    // salida no había excluido ya al animal -- si ya sabemos que no está
    // presente (o que no hay cobertura), preguntarse "¿había entrado
    // todavía?" no cambia nada y solo arriesgaría degradar cobertura que
    // el lado de salida sí pudo afirmar.
    if (presente) {
      const primeraFecha = primeraEvidencia(eventosAnimalTodos, chequeosAnimalTodos);
      if (primeraFecha === null) {
        cobertura = 'sin_fecha'; // riesgo R-2 (entrada): sin NINGÚN registro
        presente = false;
      } else if (fechaCorte < primeraFecha) {
        presente = false; // sabemos que todavía no había aparecido -- 'con_fecha' se mantiene
      }
    }

    const chequeosAnimal = chequeosAnimalTodos
      .filter((c) => c.fecha <= fechaCorte)
      .sort((a, b) => (a.fecha > b.fecha ? -1 : 1)); // más reciente primero
    const ultimoChequeo = chequeosAnimal[0];

    const partos = eventosAnimal.filter((e) => e.tipo === 'parto');
    const estadoEnCorte: EstadoActualHatoRow['estado'] = presente ? 'activa' : animal.estado;

    const fila: FilaEstadoHistorico = {
      animalId: animal.id,
      etapa: animal.etapa,
      raza: animal.raza,
      estado: estadoEnCorte,
      num_partos: partos.length,
      ultimo_chequeo_fecha: ultimoChequeo?.fecha ?? null,
      ultimo_servicio_fecha: maxFecha(eventosAnimal.filter((e) => e.tipo === 'servicio').map((e) => e.fecha)),
      ultimo_parto_fecha: maxFecha(partos.map((e) => e.fecha)),
      ultimo_secado_real_fecha: maxFecha(eventosAnimal.filter((e) => e.tipo === 'secado_real').map((e) => e.fecha)),
      ultima_confirmacion_prenez_fecha: maxFecha(
        eventosAnimal.filter((e) => e.tipo === 'confirmacion_prenez').map((e) => e.fecha),
      ),
      ultimo_evento_fecha: maxFecha(eventosAnimal.map((e) => e.fecha)),
      ultimo_estado_chequeo: ultimoChequeo?.estado ?? null,
      presente,
      cobertura,
    };
    return fila;
  });
}

export interface ResultadoConteoOrdeno {
  /** Cantidad de animales `presente` en `fechaCorte` clasificados en
   * categoría `hato` (en ordeño) vía `clasificarCategoriaHato` sobre el
   * estado reproductivo derivado con `derivarEstadoReproductivo`. Nunca
   * incluye animales con `cobertura==='sin_fecha'`. */
  conteo: number;
  /** Fecha del chequeo más reciente (<= fechaCorte) entre TODAS las filas
   * -- el ancla real que sostiene la reconstrucción (bimestral, escasa).
   * `null` si ningún animal tiene chequeo antes de `fechaCorte`. */
  anclaChequeo: string | null;
  cobertura: { conFecha: number; sinFecha: number };
}

/**
 * Cuenta cuántos animales estaban "en ordeño" (categoría `hato`, la MISMA
 * definición que usa el resto del módulo y `hato-aggregation.ts` de Esco --
 * §4.2e: "no se inventa un criterio nuevo") en `fechaCorte`, a partir de
 * las filas que produjo `reconstruirEstadoAFecha`. Devuelve también la
 * cobertura del dato de salida, para que el caller (el backfill, SOW 4)
 * decida si el periodo tiene evidencia suficiente o debe escribir `null`.
 */
export function contarVacasEnOrdenoAFecha(
  filas: FilaEstadoHistorico[],
  config: HatoConfig,
  fechaCorte: string,
): ResultadoConteoOrdeno {
  const conFecha = filas.filter((f) => f.cobertura === 'con_fecha').length;
  const sinFecha = filas.filter((f) => f.cobertura === 'sin_fecha').length;

  let anclaChequeo: string | null = null;
  let conteo = 0;
  for (const fila of filas) {
    if (fila.ultimo_chequeo_fecha && (anclaChequeo === null || fila.ultimo_chequeo_fecha > anclaChequeo)) {
      anclaChequeo = fila.ultimo_chequeo_fecha;
    }
    if (!fila.presente) continue;
    const derivado: EstadoReproductivo = derivarEstadoReproductivo(fila, config, fechaCorte).estado;
    const categoria = clasificarCategoriaHato(fila.etapa, derivado);
    if (categoria === 'hato') conteo += 1;
  }

  return { conteo, anclaChequeo, cobertura: { conFecha, sinFecha } };
}
