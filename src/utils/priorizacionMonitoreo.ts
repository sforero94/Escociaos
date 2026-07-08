// ARCHIVO: utils/priorizacionMonitoreo.ts
// DESCRIPCIÓN: Motor de priorización de monitoreo (scout prioritization) — P1 de
// docs/PLAN_PRIORIZACION_MONITOREO.md.
//
// Módulo PURO: no importa el cliente de Supabase ni nada de React/Deno/navegador.
// Recibe estructuras de datos ya obtenidas (por un hook/caller separado) y devuelve
// una lista priorizada. Esto es intencional (ver §5 del diseño): permite que P2b
// (herramienta de Esco/Telegram) reutilice exactamente esta misma lógica desde una
// edge function sin reimplementarla.
//
// Reutiliza `calcularTendencia` y `formatearCambio` de calculosMonitoreo.ts — no
// reimplementa la detección de tendencia.

import { calcularTendencia, clasificarGravedad, formatearCambio } from './calculosMonitoreo';

// ============================================================================
// Tipos de entrada
// ============================================================================

/** Una ronda de monitoreo histórica para un (sublote, plaga) específico. */
export interface RondaHistorica {
  /** Fecha ISO (yyyy-mm-dd) de la ronda de monitoreo. */
  fecha_monitoreo: string;
  /** FK a `rondas_monitoreo` — identifica la ronda real (una ronda puede
   * abarcar varias fechas calendario según el lote). Usado para exigir que
   * `incidenciaActual` venga de la ronda más reciente de la finca, no de
   * cualquier lectura histórica vieja. */
  ronda_id: string;
  /** Incidencia de esa ronda, en porcentaje (0-100), no fracción 0-1. */
  incidencia: number;
  arboles_monitoreados?: number;
  arboles_afectados?: number;
}

/** Historial de rondas de un (sublote, plaga catalogada individual) — ya agregado
 * por el caller a partir de `monitoreos` (una fila por ronda). No pre-agrupar el
 * complejo de ácaros aquí: ese pooling lo hace este módulo internamente. */
export interface HistorialSublotePlaga {
  sublote_id: string;
  sublote_nombre?: string;
  lote_id: string;
  lote_nombre?: string;
  /** id real de `plagas_enfermedades_catalogo` — plaga individual, no agrupada. */
  pest_id: string;
  pest_nombre?: string;
  /** Rondas históricas; no es necesario que vengan ordenadas, este módulo ordena. */
  rondas: RondaHistorica[];
}

/** Fila de `pest_umbral_economico`. */
export interface UmbralEconomico {
  pest_id: string;
  grupo_key: string | null;
  umbral_pct: number;
  source_label: string;
}

/** Fila de `pest_seasonal_profile`. `lote_id` NULL = perfil general de la finca. */
export interface PerfilEstacional {
  pest_id: string;
  lote_id: string | null;
  week_of_year: number;
  historical_tier: 'Low' | 'Med' | 'High';
  n_years_observed: number;
}

/** Un evento de fumigación/aplicación real ejecutado en un lote (de
 * `movimientos_diarios` / `aplicaciones_lotes`). Sólo se necesita el lote y la fecha
 * — este módulo calcula la más reciente por lote. */
export interface EventoFumigacion {
  lote_id: string;
  fecha: string;
}

export interface PriorizacionInput {
  historiales: HistorialSublotePlaga[];
  umbrales: UmbralEconomico[];
  perfilesEstacionales: PerfilEstacional[];
  /** Eventos de fumigación reales; puede venir vacío si no hay datos (el campo de
   * contexto correspondiente será `null`, nunca se asume "recién fumigado"). */
  ultimasFumigaciones: EventoFumigacion[];
  /** id de `rondas_monitoreo` más reciente de la finca (la última ronda, sin
   * importar si ya cerró). Una serie (sublote, plaga) SIN lectura en esta
   * ronda se excluye por completo del resultado -- mostrar la última lectura
   * disponible sin importar su antigüedad generaría alertas sobre datos
   * viejos (ver caso real: Cucarron marceño en La Vega mostrando un 43% de
   * hace 3 meses como si fuera el estado actual). */
  rondaActualId: string;
  /** Fecha de referencia para calcular la semana ISO actual y "días desde la última
   * fumigación". Por defecto `new Date()` — inyectable para tests determinísticos. */
  fechaReferencia?: Date;
}

// ============================================================================
// Tipos de salida
// ============================================================================

export type TierPriorizacion = 'A' | 'B';
export type EstadoUmbral = 'over' | 'approaching' | 'under';
export type Tendencia = 'subiendo' | 'bajando' | 'estable';

export interface PriorizacionEntry {
  sublote_id: string;
  sublote_nombre?: string;
  lote_id: string;
  lote_nombre?: string;

  /** id catalogado representativo. Para el complejo de ácaros: el id de la plaga
   * que aportó el valor máximo en la ronda más reciente (para trazabilidad), no un
   * id sintético. */
  pest_id: string;
  pest_nombre: string;
  /** No-null sólo para líneas pooled (hoy únicamente 'acaro_complex'). */
  grupo_key: string | null;

  tier: TierPriorizacion;
  /** Sólo Tier A. */
  estadoUmbral?: EstadoUmbral;
  umbralPct?: number;
  umbralSourceLabel?: string;
  /** Sólo Tier B — clasificación estadística fija (`clasificarGravedad`). */
  gravedad?: { texto: 'Baja' | 'Media' | 'Alta'; numerica: 1 | 2 | 3 };

  incidenciaActual: number;
  incidenciaAnterior: number;
  /** Cambio porcentual relativo entre la penúltima y la última ronda (mismo criterio
   * usado por insightsAutomaticos.ts). */
  cambio: number;
  /** Texto formateado de `cambio`, vía `formatearCambio` (reutilizado, no reimplementado). */
  cambioFormateado: string;
  tendencia: Tendencia;

  /** true si `historical_tier` del perfil estacional vigente es 'High' para la
   * semana ISO actual. */
  temporadaAlta: boolean;
  historicalTier?: 'Low' | 'Med' | 'High';
  weekOfYear: number;

  /** Contexto, NO parte del score: null si no hay dato de fumigación para ese lote
   * (nunca se asume 0 = "recién fumigado"). */
  diasDesdeUltimaFumigacion: number | null;

  numRondas: number;

  /** Explicación de una línea en español, indicando explícitamente qué lógica la
   * produjo (umbral económico vs. tercil estadístico) — requisito explícito del
   * diseño (§6) para que nada se muestre con más autoridad de la que tiene. */
  why: string;

  /** Posición del "bracket" de prioridad usado para el ordenamiento (0 = el más
   * alto). Expuesto para tests/depuración, no para mostrar al usuario. */
  bracket: number;
}

// ============================================================================
// Constantes / decisiones documentadas
// ============================================================================

/** Margen para el estado "approaching": 80% del umbral económico. Elegido porque
 * dado que Cartama valida sólo el punto de cruce exacto (no un rango), un margen
 * simétrico y redondo (80%) da al equipo de monitoreo una ventana de aviso previa
 * razonable sin inventar un segundo número "validado" que no existe. Ajustable si
 * el equipo de campo lo encuentra demasiado sensible/insensible tras uso real. */
const MARGEN_APROXIMANDOSE = 0.8;

/** Cuántas rondas recientes (como máximo) se usan para `calcularTendencia`. */
const VENTANA_TENDENCIA = 4;

const NOMBRES_GRUPO: Record<string, string> = {
  acaro_complex: 'Acaros (insecto y huevos)',
};

// ============================================================================
// Utilidades internas
// ============================================================================

function ordenarPorFecha(a: RondaHistorica, b: RondaHistorica): number {
  return a.fecha_monitoreo.localeCompare(b.fecha_monitoreo);
}

/** Número de semana ISO-8601 (1-53) para una fecha dada. */
function semanaISO(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const diaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7);
}

function calcularCambioRelativo(actual: number, anterior: number): number {
  if (anterior === 0) {
    return actual === 0 ? 0 : 100;
  }
  return ((actual - anterior) / anterior) * 100;
}

function clasificarEstadoUmbral(incidencia: number, umbralPct: number): EstadoUmbral {
  if (incidencia >= umbralPct) return 'over';
  if (incidencia >= umbralPct * MARGEN_APROXIMANDOSE) return 'approaching';
  return 'under';
}

function buscarPerfilEstacional(
  perfiles: PerfilEstacional[],
  pestId: string,
  loteId: string,
  week: number
): PerfilEstacional | undefined {
  // Preferencia: perfil específico del lote si existe (recomputación futura,
  // ver migración 047); si no, cae al perfil general de finca (lote_id NULL).
  // Este es el fallback lote -> sublote/finca explícitamente requerido por P1.
  const especifico = perfiles.find(
    (p) => p.pest_id === pestId && p.lote_id === loteId && p.week_of_year === week
  );
  if (especifico) return especifico;
  return perfiles.find(
    (p) => p.pest_id === pestId && p.lote_id === null && p.week_of_year === week
  );
}

function diasDesdeUltimaFumigacionPara(
  eventos: EventoFumigacion[],
  loteId: string,
  referencia: Date
): number | null {
  const fechas = eventos
    .filter((e) => e.lote_id === loteId)
    .map((e) => new Date(e.fecha).getTime())
    .filter((t) => !Number.isNaN(t));
  if (fechas.length === 0) return null;
  const masReciente = Math.max(...fechas);
  return Math.floor((referencia.getTime() - masReciente) / 86400000);
}

function rangoTendencia(t: Tendencia): number {
  if (t === 'subiendo') return 0;
  if (t === 'estable') return 1;
  return 2; // bajando
}

// ============================================================================
// Construcción de series (individuales + pooled) a partir del historial crudo
// ============================================================================

interface SerieBase {
  sublote_id: string;
  sublote_nombre?: string;
  lote_id: string;
  lote_nombre?: string;
  pest_id: string;
  pest_nombre: string;
  grupo_key: string | null;
  rondas: RondaHistorica[];
}

function construirSeries(
  historiales: HistorialSublotePlaga[],
  umbralPorPest: Map<string, UmbralEconomico>
): SerieBase[] {
  const series: SerieBase[] = [];
  // key = `${sublote_id}|${grupo_key}`
  const gruposPooled = new Map<string, HistorialSublotePlaga[]>();

  for (const hist of historiales) {
    const umbral = umbralPorPest.get(hist.pest_id);
    const grupoKey = umbral?.grupo_key ?? null;

    if (grupoKey) {
      const key = `${hist.sublote_id}|${grupoKey}`;
      const arr = gruposPooled.get(key) ?? [];
      arr.push(hist);
      gruposPooled.set(key, arr);
      continue;
    }

    series.push({
      sublote_id: hist.sublote_id,
      sublote_nombre: hist.sublote_nombre,
      lote_id: hist.lote_id,
      lote_nombre: hist.lote_nombre,
      pest_id: hist.pest_id,
      pest_nombre: hist.pest_nombre ?? hist.pest_id,
      grupo_key: null,
      rondas: [...hist.rondas].sort(ordenarPorFecha),
    });
  }

  for (const [key, miembros] of gruposPooled) {
    const grupoKey = key.split('|')[1];
    // Para cada RONDA (no fecha calendario -- una ronda puede abarcar varias
    // fechas según el lote), tomar el MAX de incidencia entre los miembros del
    // grupo observados esa ronda específica (no comparar cada uno por separado).
    const porRonda = new Map<
      string,
      { incidencia: number; fecha_monitoreo: string; pest_id: string; pest_nombre?: string; arboles_monitoreados?: number; arboles_afectados?: number }
    >();

    for (const hist of miembros) {
      for (const ronda of hist.rondas) {
        const existente = porRonda.get(ronda.ronda_id);
        if (!existente || ronda.incidencia > existente.incidencia) {
          porRonda.set(ronda.ronda_id, {
            incidencia: ronda.incidencia,
            fecha_monitoreo: ronda.fecha_monitoreo,
            pest_id: hist.pest_id,
            pest_nombre: hist.pest_nombre,
            arboles_monitoreados: ronda.arboles_monitoreados,
            arboles_afectados: ronda.arboles_afectados,
          });
        }
      }
    }

    const rondaIdsOrdenados = [...porRonda.entries()]
      .sort((a, b) => a[1].fecha_monitoreo.localeCompare(b[1].fecha_monitoreo))
      .map(([rondaId]) => rondaId);
    const rondas: RondaHistorica[] = rondaIdsOrdenados.map((rondaId) => {
      const v = porRonda.get(rondaId)!;
      return {
        fecha_monitoreo: v.fecha_monitoreo,
        ronda_id: rondaId,
        incidencia: v.incidencia,
        arboles_monitoreados: v.arboles_monitoreados,
        arboles_afectados: v.arboles_afectados,
      };
    });

    const ultimaRondaId = rondaIdsOrdenados[rondaIdsOrdenados.length - 1];
    const contribuyenteUltimo = ultimaRondaId ? porRonda.get(ultimaRondaId) : undefined;
    const primero = miembros[0];

    series.push({
      sublote_id: primero.sublote_id,
      sublote_nombre: primero.sublote_nombre,
      lote_id: primero.lote_id,
      lote_nombre: primero.lote_nombre,
      pest_id: contribuyenteUltimo?.pest_id ?? primero.pest_id,
      pest_nombre: NOMBRES_GRUPO[grupoKey] ?? `Grupo ${grupoKey}`,
      grupo_key: grupoKey,
      rondas,
    });
  }

  return series;
}

// ============================================================================
// Construcción del texto "why"
// ============================================================================

function construirWhy(params: {
  tier: TierPriorizacion;
  pestNombre: string;
  incidenciaActual: number;
  tendencia: Tendencia;
  temporadaAlta: boolean;
  primeraLectura: boolean;
  estadoUmbral?: EstadoUmbral;
  umbralPct?: number;
  sourceLabel?: string;
  gravedad?: { texto: string };
}): string {
  const { tier, pestNombre, incidenciaActual, tendencia, temporadaAlta, primeraLectura } = params;
  const sufijoEstacion = temporadaAlta ? ', en temporada alta histórica' : '';
  const incidenciaTxt = `${incidenciaActual.toFixed(0)}%`;
  // Con una sola ronda no hay ronda anterior con qué comparar -- no decir
  // "estable" como si hubiera una tendencia observada cuando en realidad es la
  // primera lectura de este (sublote, plaga).
  const tendenciaTxt = primeraLectura ? 'primera lectura registrada, aún sin tendencia' : tendencia;

  if (tier === 'A') {
    const umbralTxt = `${params.umbralPct}%`;
    const fuente = params.sourceLabel ?? 'Cartama';
    if (params.estadoUmbral === 'over') {
      return `${incidenciaTxt} ≥ umbral económico ${fuente} de ${pestNombre} (${umbralTxt}), ${tendenciaTxt}${sufijoEstacion}`;
    }
    if (params.estadoUmbral === 'approaching') {
      return `${incidenciaTxt} se acerca al umbral económico ${fuente} de ${pestNombre} (${umbralTxt}), ${tendenciaTxt}${sufijoEstacion}`;
    }
    return `${incidenciaTxt} por debajo del umbral económico ${fuente} de ${pestNombre} (${umbralTxt}), ${tendenciaTxt}${sufijoEstacion}`;
  }

  const gravedadTxt = params.gravedad?.texto ?? 'Baja';
  return `Gravedad ${gravedadTxt} (${incidenciaTxt}) para ${pestNombre}, sin umbral económico validado, ${tendenciaTxt}${sufijoEstacion}`;
}

// ============================================================================
// Bracket de prioridad (regla de orden dura, §6)
// ============================================================================

// Bracket order, per docs/PLAN_PRIORIZACION_MONITOREO.md section 6: ONLY Tier A `over`
// is guaranteed to outrank every Tier B entry ("an owner-validated economic breach is a
// stronger claim than any statistical percentile"). Tier A `approaching` still leads
// (it's closing in on a real, Cartama-validated number), but Tier A `under` -- comfortably
// below even the early-warning margin -- must NOT blanket-outrank Tier B `Alta` (this
// pest's own top historical tercile). An earlier version of this function put ALL Tier A
// states ahead of ALL Tier B states, which let e.g. Thrips at 0.1% (Tier A, `under`) rank
// above Mosca del ovario at 90% (Tier B, `Alta`) -- an independent verifier caught this by
// running the scenario directly against the export, not just reading the code. Fixed by
// interleaving `under` behind Tier B `Alta`.
function bracketDe(entry: {
  tier: TierPriorizacion;
  estadoUmbral?: EstadoUmbral;
  gravedad?: { numerica: 1 | 2 | 3 };
}): number {
  if (entry.tier === 'A') {
    if (entry.estadoUmbral === 'over') return 0;
    if (entry.estadoUmbral === 'approaching') return 1;
    // 'under' falls through to the interleaved ranking below (bracket 3).
  } else {
    const numerica = entry.gravedad?.numerica ?? 1;
    if (numerica === 3) return 2; // Tier B Alta
    if (numerica === 2) return 4; // Tier B Media
    return 5; // Tier B Baja
  }
  return 3; // Tier A 'under'
}

// ============================================================================
// Función principal
// ============================================================================

/**
 * Motor de priorización de monitoreo. Puro: no hace llamadas a Supabase ni a
 * ninguna API — toda la data ya debe venir cargada por el caller.
 *
 * Regla de orden dura (§6 del diseño): cualquier entrada Tier A con
 * estadoUmbral='over' queda por encima de TODAS las entradas Tier B y de
 * cualquier otra entrada Tier A no-'over', sin importar tendencia/estacionalidad.
 * Dentro de cada bracket subsiguiente se ordena por tendencia (subiendo primero)
 * y luego por refuerzo estacional (temporada alta primero).
 */
export function priorizarMonitoreo(input: PriorizacionInput): PriorizacionEntry[] {
  const referencia = input.fechaReferencia ?? new Date();
  const weekOfYear = semanaISO(referencia);

  const umbralPorPest = new Map<string, UmbralEconomico>();
  for (const u of input.umbrales) umbralPorPest.set(u.pest_id, u);

  const series = construirSeries(input.historiales, umbralPorPest);

  const entries: PriorizacionEntry[] = [];

  for (const serie of series) {
    if (serie.rondas.length === 0) continue; // sin ningún registro: nada que priorizar

    const rondasOrdenadas = serie.rondas; // ya vienen ordenadas por construirSeries

    // Sólo se prioriza si hay una lectura de la ronda más reciente de la finca.
    // Mostrar la última lectura disponible sin importar su antigüedad generaría
    // alertas sobre datos viejos (caso real: Cucarron marceño en La Vega con un
    // 43% de hace 3 meses mostrado como si fuera el estado actual, disparando
    // una alerta y potencialmente una aplicación sobre un dato obsoleto).
    const idxActual = rondasOrdenadas.findIndex((r) => r.ronda_id === input.rondaActualId);
    if (idxActual === -1) continue; // sin lectura de la ronda actual: nada "actual" que priorizar

    const ultima = rondasOrdenadas[idxActual];
    // Dato individual = monitoreo más reciente: con una sola ronda igual se
    // muestra (evaluada contra el umbral), sólo que sin ronda anterior con qué
    // comparar tendencia -- no se excluye del todo como antes.
    const primeraLectura = idxActual === 0;
    const penultima = primeraLectura ? null : rondasOrdenadas[idxActual - 1];

    const incidenciaActual = ultima.incidencia;
    const incidenciaAnterior = primeraLectura ? incidenciaActual : penultima!.incidencia;
    const cambio = primeraLectura ? 0 : calcularCambioRelativo(incidenciaActual, incidenciaAnterior);

    const ventana = rondasOrdenadas.slice(0, idxActual + 1).slice(-VENTANA_TENDENCIA).map((r) => r.incidencia);
    const tendencia = calcularTendencia(ventana); // ya devuelve 'estable' si ventana.length < 2

    const perfil = buscarPerfilEstacional(input.perfilesEstacionales, serie.pest_id, serie.lote_id, weekOfYear);
    const temporadaAlta = perfil?.historical_tier === 'High';

    const diasDesdeUltimaFumigacion = diasDesdeUltimaFumigacionPara(
      input.ultimasFumigaciones,
      serie.lote_id,
      referencia
    );

    // Para el complejo pooled, el umbral es el del grupo (idéntico en las 4 filas
    // seed); para una plaga independiente Tier A, el de su propia fila.
    const umbral = serie.grupo_key
      ? input.umbrales.find((u) => u.grupo_key === serie.grupo_key)
      : umbralPorPest.get(serie.pest_id);

    const tier: TierPriorizacion = umbral ? 'A' : 'B';

    let estadoUmbral: EstadoUmbral | undefined;
    let gravedad: { texto: 'Baja' | 'Media' | 'Alta'; numerica: 1 | 2 | 3 } | undefined;

    if (tier === 'A' && umbral) {
      estadoUmbral = clasificarEstadoUmbral(incidenciaActual, umbral.umbral_pct);
    } else {
      const g = clasificarGravedad(incidenciaActual);
      gravedad = { texto: g.texto as 'Baja' | 'Media' | 'Alta', numerica: g.numerica as 1 | 2 | 3 };
    }

    const why = construirWhy({
      tier,
      pestNombre: serie.pest_nombre,
      incidenciaActual,
      tendencia,
      temporadaAlta,
      primeraLectura,
      estadoUmbral,
      umbralPct: umbral?.umbral_pct,
      sourceLabel: umbral?.source_label,
      gravedad,
    });

    const bracket = bracketDe({ tier, estadoUmbral, gravedad });

    entries.push({
      sublote_id: serie.sublote_id,
      sublote_nombre: serie.sublote_nombre,
      lote_id: serie.lote_id,
      lote_nombre: serie.lote_nombre,
      pest_id: serie.pest_id,
      pest_nombre: serie.pest_nombre,
      grupo_key: serie.grupo_key,
      tier,
      estadoUmbral,
      umbralPct: umbral?.umbral_pct,
      umbralSourceLabel: umbral?.source_label,
      gravedad,
      incidenciaActual,
      incidenciaAnterior,
      cambio,
      cambioFormateado: formatearCambio(cambio),
      tendencia,
      temporadaAlta,
      historicalTier: perfil?.historical_tier,
      weekOfYear,
      diasDesdeUltimaFumigacion,
      numRondas: idxActual + 1,
      why,
      bracket,
    });
  }

  entries.sort((a, b) => {
    if (a.bracket !== b.bracket) return a.bracket - b.bracket;
    const tendA = rangoTendencia(a.tendencia);
    const tendB = rangoTendencia(b.tendencia);
    if (tendA !== tendB) return tendA - tendB;
    const estA = a.temporadaAlta ? 0 : 1;
    const estB = b.temporadaAlta ? 0 : 1;
    if (estA !== estB) return estA - estB;
    // Desempate final determinístico: mayor incidencia actual primero.
    return b.incidenciaActual - a.incidenciaActual;
  });

  return entries;
}
