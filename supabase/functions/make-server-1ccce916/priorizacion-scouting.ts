// priorizacion-scouting.ts — Deno-side port of the scout-prioritization ranking
// engine, for P2b of docs/PLAN_PRIORIZACION_MONITOREO.md (Esco/Telegram tool
// `get_pest_risk_priorizacion`).
//
// Mirrors the logic in `src/utils/priorizacionMonitoreo.ts` (frontend
// equivalent — the dashboard's ranking engine) AND the two small pure helpers
// it reuses from `src/utils/calculosMonitoreo.ts` (`calcularTendencia`,
// `clasificarGravedad`, `formatearCambio`), inlined below. This duplication is
// unavoidable: chat.tsx is a self-contained Deno bundle and cannot import
// anything outside `src/supabase/functions/server/` (the frontend module
// lives outside the function's deployment tree and would not bundle). Same
// pattern already established by `cost-aggregation.ts` for
// `src/utils/aplicacionesReales.ts`.
//
// KEEP THIS FILE IN SYNC with `src/utils/priorizacionMonitoreo.ts` and
// `src/utils/calculosMonitoreo.ts` — any change to bracket ordering, the
// Ácaro-complex pooling, the Antracnosis fruto/ramas independence, threshold
// classification, trend calc, or the "why" text construction must be applied
// to BOTH files. `src/__tests__/priorizacionScoutingParidad.test.ts` guards
// against silent drift by running identical fixtures through both and
// asserting identical ranking-relevant field values.
//
// No Deno, no fetch, no Supabase imports — pure functions over plain data,
// importable from both the Deno edge runtime (chat.tsx) and Node-based tests
// (Vitest), exactly like cost-aggregation.ts / ganado-inventario.ts.

// ============================================================================
// Inlined from src/utils/calculosMonitoreo.ts (no other deps there either)
// ============================================================================

export function clasificarGravedad(incidencia: number): { texto: string; numerica: number } {
  if (incidencia >= 30) {
    return { texto: 'Alta', numerica: 3 };
  } else if (incidencia >= 10) {
    return { texto: 'Media', numerica: 2 };
  } else {
    return { texto: 'Baja', numerica: 1 };
  }
}

export function calcularTendencia(incidencias: number[]): 'subiendo' | 'bajando' | 'estable' {
  if (incidencias.length < 2) return 'estable';

  const n = incidencias.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += incidencias[i];
    sumXY += i * incidencias[i];
    sumX2 += i * i;
  }

  const pendiente = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  if (pendiente > 2) return 'subiendo';
  if (pendiente < -2) return 'bajando';
  return 'estable';
}

export function formatearCambio(cambio: number): string {
  const signo = cambio >= 0 ? '+' : '';
  return `(${signo}${cambio.toFixed(1)}%)`;
}

// ============================================================================
// Tipos de entrada (idénticos a priorizacionMonitoreo.ts)
// ============================================================================

/** Una ronda de monitoreo histórica para un (sublote, plaga) específico. */
export interface RondaHistorica {
  fecha_monitoreo: string;
  /** FK a `rondas_monitoreo` — identifica la ronda real (una ronda puede
   * abarcar varias fechas calendario según el lote). Usado para exigir que
   * `incidenciaActual` venga de la ronda más reciente de la finca, no de
   * cualquier lectura histórica vieja. */
  ronda_id: string;
  incidencia: number;
  arboles_monitoreados?: number;
  arboles_afectados?: number;
}

/** Historial de rondas de un (sublote, plaga catalogada individual) — ya
 * agregado por el caller a partir de `monitoreos` (una fila por ronda). No
 * pre-agrupar el complejo de ácaros aquí: ese pooling lo hace este módulo. */
export interface HistorialSublotePlaga {
  sublote_id: string;
  sublote_nombre?: string;
  lote_id: string;
  lote_nombre?: string;
  pest_id: string;
  pest_nombre?: string;
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

/** Un evento de fumigación/aplicación real ejecutado en un lote. */
export interface EventoFumigacion {
  lote_id: string;
  fecha: string;
}

export interface PriorizacionInput {
  historiales: HistorialSublotePlaga[];
  umbrales: UmbralEconomico[];
  perfilesEstacionales: PerfilEstacional[];
  ultimasFumigaciones: EventoFumigacion[];
  /** id de `rondas_monitoreo` más reciente de la finca. Una serie (sublote,
   * plaga) SIN lectura en esta ronda se excluye por completo del resultado --
   * mostrar la última lectura disponible sin importar su antigüedad generaría
   * alertas sobre datos viejos. */
  rondaActualId: string;
  /** Fecha de referencia para semana ISO / días desde fumigación. Default `new Date()`. */
  fechaReferencia?: Date;
}

// ============================================================================
// Tipos de salida (idénticos a priorizacionMonitoreo.ts)
// ============================================================================

export type TierPriorizacion = 'A' | 'B';
export type EstadoUmbral = 'over' | 'approaching' | 'under';
export type Tendencia = 'subiendo' | 'bajando' | 'estable';

export interface PriorizacionEntry {
  sublote_id: string;
  sublote_nombre?: string;
  lote_id: string;
  lote_nombre?: string;

  pest_id: string;
  pest_nombre: string;
  grupo_key: string | null;

  tier: TierPriorizacion;
  estadoUmbral?: EstadoUmbral;
  umbralPct?: number;
  umbralSourceLabel?: string;
  gravedad?: { texto: 'Baja' | 'Media' | 'Alta'; numerica: 1 | 2 | 3 };

  incidenciaActual: number;
  incidenciaAnterior: number;
  cambio: number;
  cambioFormateado: string;
  tendencia: Tendencia;

  temporadaAlta: boolean;
  historicalTier?: 'Low' | 'Med' | 'High';
  weekOfYear: number;

  diasDesdeUltimaFumigacion: number | null;

  numRondas: number;

  why: string;

  bracket: number;
}

// ============================================================================
// Constantes / decisiones documentadas (idénticas a priorizacionMonitoreo.ts)
// ============================================================================

const MARGEN_APROXIMANDOSE = 0.8;
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
    // grupo observados esa ronda específica.
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
// Bracket de prioridad (regla de orden dura, §6 del diseño)
// ============================================================================

// Bracket order, per docs/PLAN_PRIORIZACION_MONITOREO.md section 6: ONLY Tier A
// `over` is guaranteed to outrank every Tier B entry. Tier A `approaching`
// still leads, but Tier A `under` must NOT blanket-outrank Tier B `Alta` — see
// the identical comment/regression note in priorizacionMonitoreo.ts for the
// full rationale (an independent verifier caught this with a direct scenario).
function bracketDe(entry: {
  tier: TierPriorizacion;
  estadoUmbral?: EstadoUmbral;
  gravedad?: { numerica: 1 | 2 | 3 };
}): number {
  if (entry.tier === 'A') {
    if (entry.estadoUmbral === 'over') return 0;
    if (entry.estadoUmbral === 'approaching') return 1;
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
 * Motor de priorización de monitoreo — port de `priorizarMonitoreo` en
 * `src/utils/priorizacionMonitoreo.ts`. Puro: no hace llamadas a Supabase ni a
 * ninguna API — toda la data ya debe venir cargada por el caller
 * (`execPestPriorizacion` en chat.tsx).
 *
 * Regla de orden dura (§6 del diseño): cualquier entrada Tier A con
 * estadoUmbral='over' queda por encima de TODAS las entradas Tier B y de
 * cualquier otra entrada Tier A no-'over', sin importar tendencia/estacionalidad.
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

    const rondasOrdenadas = serie.rondas;

    // Sólo se prioriza si hay una lectura de la ronda más reciente de la finca.
    // Mostrar la última lectura disponible sin importar su antigüedad generaría
    // alertas sobre datos viejos (caso real: Cucarron marceño en La Vega con un
    // 43% de hace 3 meses mostrado como si fuera el estado actual).
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
    return b.incidenciaActual - a.incidenciaActual;
  });

  return entries;
}
