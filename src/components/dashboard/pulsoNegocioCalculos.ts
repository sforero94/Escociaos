// ARCHIVO: components/dashboard/pulsoNegocioCalculos.ts
// DESCRIPCIÓN: Vistas derivadas PURAS para el bloque "Pulso por negocio" del
// Tablero General (`docs/plan_dashboard_centro_control.md` §4 Bloque 3 /
// §9.2). Tres funciones, una por negocio -- ninguna hace I/O (eso vive en
// `hooks/usePulso*.ts`) y ninguna reimplementa lógica de dominio que ya
// existe:
//
//   - Hato: `fechaAnclaProduccion`/`proyectarHato`/`vejezPesajes`
//     (`@/utils/hatoProduccion.ts`) -- el "tramo medido" de `proyectarHato`
//     con `horizonteSemanas: 0` es exactamente "litros/vaca por semana de
//     pesaje real, ancladas al último pesaje", que es lo que la tarjeta
//     pinta. Las señales de revisión (vacías >90d, secado vencido) NO viven
//     aquí -- se calculan en `usePulsoHato.ts` directo contra
//     `hatoAlertasTablero.ts` (`vaciasMasDeNDias`/`derivarAlertasTablero`),
//     que este módulo no puede/debe reimplementar (instrucción explícita
//     del encargo).
//   - Aguacate: `calcularIncidencia`/`clasificarGravedad`
//     (`@/utils/calculosMonitoreo.ts`). Agrupa SIEMPRE por `ronda_id`, nunca
//     por `fecha_monitoreo` -- una ronda abarca varias fechas (contrato del
//     módulo de Monitoreo, CLAUDE.md). Filas legado sin `ronda_id` (previas
//     a Monitoreo 2.0) no pueden formar una ronda real y quedan fuera del
//     pulso -- agruparlas por día sería exactamente el error que este
//     contrato prohíbe.
//   - Ganado: `calcularKPIsInventario` (`@/utils/calculosGanado.ts`) para
//     los totales y `cabezasPorHa` (ya decide `null` cuando las hectáreas
//     están en 0 -- no se reinventa esa regla aquí); este módulo sólo suma
//     lo que falta: el desglose POR FINCA (esa función sólo agrupa por
//     ubicación).
//
// Regla dura en las tres: "sin dato es sin dato" -- ninguna función rellena
// un hueco con 0 ni con un promedio inventado. Devuelven `null` cuando no
// hay nada que mostrar, y el componente decide el `—` + su explicación.

import {
  fechaAnclaProduccion,
  proyectarHato,
  vejezPesajes,
  type PesajeLecheVaca,
  type VejezPesajes,
} from '@/utils/hatoProduccion';
import { calcularIncidencia, clasificarGravedad } from '@/utils/calculosMonitoreo';
import { calcularKPIsInventario } from '@/utils/calculosGanado';
import type { InventarioPotreroRow } from '@/types/ganado';
import { formatLongDate } from '@/utils/format';

// ============================================================================
// Hato Lechero
// ============================================================================

/** Semanas medidas hacia atrás que arma la serie del sparkline (§3.1 del
 *  plan: "un sparkline de los últimos 8 pesajes"). */
export const SEMANAS_SERIE_PULSO_HATO = 8;

export interface PulsoHatoDatos {
  /** Litros/vaca del pesaje más reciente -- `litrosTotalHoy / vacasPesadasHoy`. */
  litrosPorVacaHoy: number;
  /** Litros TOTALES del hato en el pesaje más reciente (línea de contexto:
   *  "416,5 L el 12 de agosto"). */
  litrosTotalHoy: number;
  /** Fecha del pesaje más reciente (`AAAA-MM-DD`) -- ancla vía
   *  `fechaAnclaProduccion`, nunca "hoy" literal (mismo contrato que
   *  `hatoProduccion.ts`: el hato real acumula backlog operativo). */
  fechaUltimoPesaje: string;
  /** Numerador del denominador contractual (§3.1: "27 de 34 vacas
   *  pesadas") -- cuántas vacas tienen fila en el pesaje más reciente. */
  vacasPesadasHoy: number;
  /** Denominador -- vacas activas en categoría `hato` (en ordeño), lo pasa
   *  el caller (viene de `useHatoAnimales`, este módulo no consulta la
   *  base). Una vaca sin pesar NO entra al promedio, pero SÍ cuenta aquí. */
  vacasTotalEnOrdeno: number;
  /** Litros/vaca por semana medida, en orden CRONOLÓGICO ASCENDENTE (más
   *  vieja primero, hoy al final) -- listo para `Sparkline`. Sólo semanas
   *  con dato: una semana sin pesaje (backlog) se omite, nunca se rellena
   *  con 0. */
  serieLitrosPorVaca: number[];
}

/**
 * Litros/vaca del pesaje más reciente + serie de las últimas
 * `SEMANAS_SERIE_PULSO_HATO` semanas medidas, reusando el "tramo medido" de
 * `proyectarHato` (con `horizonteSemanas: 0` para no calcular ninguna
 * proyección hacia adelante -- lo único que consume la tarjeta es lo ya
 * ocurrido). `null` sin ningún pesaje -- nunca "0 L/vaca".
 */
export function calcularPulsoHato(
  pesajes: PesajeLecheVaca[],
  vacasTotalEnOrdeno: number,
  hoy: string,
): PulsoHatoDatos | null {
  if (pesajes.length === 0) return null;

  const fechaUltimoPesaje = fechaAnclaProduccion(pesajes, hoy);
  const semanas = proyectarHato({
    pesajes,
    // `partos`/`estadosReproductivos`/`curvaHato` sólo los usa el tramo
    // PROYECTADO de `proyectarHato` (semanas 1..horizonteSemanas) -- con
    // `horizonteSemanas: 0` ese tramo nunca se ejecuta, así que aquí van
    // vacíos a propósito (no hace falta traer partos/curva sólo para
    // descartarlos).
    partos: new Map(),
    estadosReproductivos: [],
    curvaHato: [],
    fechaReferencia: fechaUltimoPesaje,
    horizonteSemanas: 0,
    ventanaMedidaSemanas: SEMANAS_SERIE_PULSO_HATO,
  });

  const medidas = semanas.filter((s) => s.tipo === 'medido');
  const ultima = medidas[medidas.length - 1];
  // Defensivo: por construcción (fechaUltimoPesaje = MAX(fecha) de pesajes),
  // la última semana medida SIEMPRE incluye al menos esa fila -- pero nunca
  // se divide sin comprobar primero.
  if (!ultima || ultima.litrosDia === null || ultima.vacasBase.length === 0) return null;

  const serieLitrosPorVaca: number[] = [];
  for (const semana of medidas) {
    if (semana.litrosDia === null || semana.vacasBase.length === 0) continue; // sin pesaje esa semana -- se omite, nunca 0
    serieLitrosPorVaca.push(semana.litrosDia / semana.vacasBase.length);
  }

  return {
    litrosPorVacaHoy: ultima.litrosDia / ultima.vacasBase.length,
    litrosTotalHoy: ultima.litrosDia,
    fechaUltimoPesaje,
    vacasPesadasHoy: ultima.vacasBase.length,
    vacasTotalEnOrdeno,
    serieLitrosPorVaca,
  };
}

/**
 * `true` cuando el numerador ("vacas realmente pesadas") es MAYOR que el
 * denominador que se le pasó como "vacas activas en ordeño" -- una cifra
 * imposible (p. ej. "27 de 26 vacas pesadas": no se puede haber pesado más
 * vacas de las que existen) que sólo puede pasar si el denominador se
 * derivó mal. `PulsoHatoCardView` usa esto para dejar de pintar la línea
 * del denominador entera en vez de mostrar un número que no puede ser
 * cierto -- "sin dato es sin dato" aplicado a un dato roto, no sólo a uno
 * ausente. Es la clase entera del defecto, no una comprobación puntual: se
 * mantiene aparte de `calcularPulsoHato` para poder testearla en aislado y
 * para que el componente la aplique SIEMPRE, incluso si el origen del
 * denominador cambia en el futuro.
 */
export function denominadorHatoInvalido(
  datos: Pick<PulsoHatoDatos, 'vacasPesadasHoy' | 'vacasTotalEnOrdeno'>,
): boolean {
  return datos.vacasPesadasHoy > datos.vacasTotalEnOrdeno;
}

/** Reexport de conveniencia -- los hooks/tarjetas de este bloque calculan la
 *  vejez del pesaje por separado de `calcularPulsoHato` (§ cabecera:
 *  `vejezPesajes` sabe manejar el caso "sin ningún pesaje" con su propio
 *  nivel `critico`, así que se llama directo en vez de duplicar esa rama
 *  aquí sólo para envolverla). */
export type { VejezPesajes };
export { vejezPesajes };

// ============================================================================
// Aguacate Hass
// ============================================================================

/** Tope de plagas visibles en la tarjeta: la principal (dato grande) + las
 *  siguientes con barra (§3.2 del plan, ejemplo real: huevos de ácaro +
 *  ácaro + monalonion = 3). */
export const PLAGAS_VISIBLES_PULSO_AGUACATE = 3;

/** Fila mínima de `monitoreos` (+ nombre de plaga ya resuelto por el join)
 *  que necesita este módulo. */
export interface FilaMonitoreoPulso {
  ronda_id: string | null;
  fecha_monitoreo: string;
  arboles_monitoreados: number | null;
  arboles_afectados: number | null;
  plaga_nombre: string | null;
}

export interface PlagaPulsoAguacate {
  nombre: string;
  incidencia: number;
  arbolesAfectados: number;
  arbolesMonitoreados: number;
  /** Puntos porcentuales vs. la ronda anterior. `null` cuando la plaga no
   *  tenía lectura en la ronda anterior -- nunca se asume 0 (misma regla
   *  que el resto del módulo de Monitoreo: ausencia de fila ≠ 0%). */
  deltaPp: number | null;
  gravedad: { texto: string; numerica: number };
}

export interface PulsoAguacateDatos {
  rondaId: string;
  /** Fecha MÁS RECIENTE dentro de la ronda -- una ronda abarca varias
   *  fechas de monitoreo. */
  fechaRonda: string;
  /** Ordenadas de mayor a menor incidencia. */
  plagas: PlagaPulsoAguacate[];
}

interface AcumuladoPlaga {
  afectados: number;
  monitoreados: number;
}

function incidenciaPorPlaga(filas: FilaMonitoreoPulso[]): Map<string, AcumuladoPlaga> {
  const acumulado = new Map<string, AcumuladoPlaga>();
  for (const f of filas) {
    if (!f.plaga_nombre) continue;
    const entry = acumulado.get(f.plaga_nombre) ?? { afectados: 0, monitoreados: 0 };
    entry.afectados += f.arboles_afectados ?? 0;
    entry.monitoreados += f.arboles_monitoreados ?? 0;
    acumulado.set(f.plaga_nombre, entry);
  }
  return acumulado;
}

/**
 * Plaga de mayor incidencia de la ronda más reciente + las siguientes,
 * agrupando SIEMPRE por `ronda_id` (nunca por `fecha_monitoreo` -- una
 * ronda abarca varias fechas). `null` sin ninguna ronda real en las filas
 * recibidas (incluye el caso "todas las filas son legado sin `ronda_id`").
 */
export function calcularPulsoAguacate(filas: FilaMonitoreoPulso[]): PulsoAguacateDatos | null {
  const conRonda = filas.filter((f): f is FilaMonitoreoPulso & { ronda_id: string } => f.ronda_id != null);
  if (conRonda.length === 0) return null;

  const grupos = new Map<string, { fechaMax: string; filas: FilaMonitoreoPulso[] }>();
  for (const f of conRonda) {
    const entry = grupos.get(f.ronda_id) ?? { fechaMax: f.fecha_monitoreo, filas: [] };
    if (f.fecha_monitoreo > entry.fechaMax) entry.fechaMax = f.fecha_monitoreo;
    entry.filas.push(f);
    grupos.set(f.ronda_id, entry);
  }

  const ordenados = [...grupos.entries()].sort((a, b) => b[1].fechaMax.localeCompare(a[1].fechaMax));
  const [rondaId, actual] = ordenados[0];
  const anterior = ordenados[1]?.[1] ?? null;

  const actualPorPlaga = incidenciaPorPlaga(actual.filas);
  const anteriorPorPlaga = anterior ? incidenciaPorPlaga(anterior.filas) : new Map<string, AcumuladoPlaga>();

  const plagas: PlagaPulsoAguacate[] = [...actualPorPlaga.entries()]
    .map(([nombre, { afectados, monitoreados }]) => {
      const incidencia = calcularIncidencia(afectados, monitoreados);
      const prev = anteriorPorPlaga.get(nombre);
      const incidenciaPrev = prev ? calcularIncidencia(prev.afectados, prev.monitoreados) : null;
      return {
        nombre,
        incidencia,
        arbolesAfectados: afectados,
        arbolesMonitoreados: monitoreados,
        deltaPp: incidenciaPrev !== null ? incidencia - incidenciaPrev : null,
        gravedad: clasificarGravedad(incidencia),
      };
    })
    .sort((a, b) => b.incidencia - a.incidencia);

  return { rondaId, fechaRonda: actual.fechaMax, plagas };
}

// ============================================================================
// Ganado de ceba
// ============================================================================

export interface FincaPulsoGanado {
  finca: string;
  cabezas: number;
  hectareas: number;
}

export interface PulsoGanadoDatos {
  totalCabezas: number;
  totalNovillos: number;
  totalToros: number;
  /** Ordenadas de mayor a menor cabezas -- listo para las barras
   *  horizontales del §3.3 del plan. */
  porFinca: FincaPulsoGanado[];
  /** `null` cuando las hectáreas capturadas suman 0 -- mismo criterio de
   *  `calcularKPIsInventario` (`@/utils/calculosGanado.ts`), reutilizado
   *  tal cual, nunca recalculado aquí. */
  cabezasPorHa: number | null;
  /** `MAX(gan_inventario.updated_at)` entre todos los potreros -- `null`
   *  cuando ningún potrero tiene fecha (nunca una fecha inventada). */
  ultimaActualizacion: string | null;
}

/**
 * Totales de cabezas/novillos/toros (vía `calcularKPIsInventario`, nunca
 * reimplementado) + el desglose POR FINCA que esa función no trae (ella
 * agrupa por ubicación). `null` sin ninguna fila de inventario.
 */
export function calcularPulsoGanado(rows: InventarioPotreroRow[]): PulsoGanadoDatos | null {
  if (rows.length === 0) return null;

  const kpis = calcularKPIsInventario(rows);

  const porFincaMap = new Map<string, FincaPulsoGanado>();
  let ultimaActualizacion: string | null = null;
  for (const r of rows) {
    const entry = porFincaMap.get(r.finca_id) ?? { finca: r.finca, cabezas: 0, hectareas: r.hectareas };
    entry.cabezas += r.novillos + r.toros;
    porFincaMap.set(r.finca_id, entry);
    if (r.updated_at && (ultimaActualizacion === null || r.updated_at > ultimaActualizacion)) {
      ultimaActualizacion = r.updated_at;
    }
  }

  const porFinca = [...porFincaMap.values()].sort((a, b) => b.cabezas - a.cabezas);

  return {
    totalCabezas: kpis.totalCabezas,
    totalNovillos: kpis.totalNovillos,
    totalToros: kpis.totalToros,
    porFinca,
    cabezasPorHa: kpis.cabezasPorHa,
    ultimaActualizacion,
  };
}

// ============================================================================
// Formato compartido por las tres tarjetas
// ============================================================================

/** "12 de agosto" -- mismo `formatLongDate` (ya blindado contra el
 *  desplazamiento UTC de un `AAAA-MM-DD` puro, `@/utils/format.ts`), sin el
 *  año: el mockup del pulso nunca lo muestra ("416,5 L el 12 de agosto",
 *  "Ronda del 3 de agosto"), y las tres tarjetas son siempre del año en
 *  curso. No hay una función de formato con esta forma en `format.ts`
 *  todavía -- se compone aquí en vez de reimplementar el parseo de fecha. */
export function formatearFechaSinAnio(fechaISO: string): string {
  return formatLongDate(fechaISO).replace(/ de \d{4}$/, '');
}

/** "hoy" / "hace 1 día" / "hace N días" -- a diferencia de
 *  `formatRelativeTime` (`@/utils/format.ts`), nunca redondea a semanas: el
 *  pulso necesita el conteo exacto de días para comparar contra un umbral
 *  ("Ronda del 3 de agosto · hace 13 días", ámbar pasados 14). */
export function formatearDiasTranscurridos(dias: number): string {
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'hace 1 día';
  return `hace ${dias} días`;
}
