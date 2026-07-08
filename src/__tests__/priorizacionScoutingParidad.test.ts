/**
 * Cross-consistency test — P2b of docs/PLAN_PRIORIZACION_MONITOREO.md.
 *
 * `src/supabase/functions/server/priorizacion-scouting.ts` is a hand-maintained
 * Deno-side port of `src/utils/priorizacionMonitoreo.ts` (chat.tsx cannot import
 * across the deployment-tree boundary — see that file's header comment). This
 * test is the safeguard against silent drift between the two copies: it feeds
 * BOTH implementations the exact same fixtures (adapted from
 * `priorizacionMonitoreo.test.ts`) and asserts the ranking-relevant fields are
 * identical — same order, same tier/estado/bracket/incidencia/tendencia values.
 * `why` text is allowed to differ trivially in wording (it doesn't today, but
 * the design doc explicitly permits it), everything else must match exactly.
 */

import { describe, it, expect } from 'vitest';
import { priorizarMonitoreo as priorizarFrontend } from '@/utils/priorizacionMonitoreo';
import type {
  HistorialSublotePlaga as HistorialFrontend,
  UmbralEconomico as UmbralFrontend,
  PerfilEstacional as PerfilFrontend,
  EventoFumigacion as EventoFrontend,
  RondaHistorica as RondaFrontend,
} from '@/utils/priorizacionMonitoreo';
import { priorizarMonitoreo as priorizarEdge } from '../supabase/functions/server/priorizacion-scouting';
import type {
  HistorialSublotePlaga as HistorialEdge,
  UmbralEconomico as UmbralEdge,
  PerfilEstacional as PerfilEdge,
  EventoFumigacion as EventoEdge,
  RondaHistorica as RondaEdge,
} from '../supabase/functions/server/priorizacion-scouting';

// Fecha de referencia fija (misma que priorizacionMonitoreo.test.ts) para
// resultados determinísticos en ambas implementaciones.
const FECHA_REF = new Date(2026, 5, 15); // 2026-06-15

function semanaISOParaFixture(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const diaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7);
}
const SEMANA_ACTUAL = semanaISOParaFixture(FECHA_REF);

function rondas(valores: Array<[string, number]>): RondaFrontend[] & RondaEdge[] {
  return valores.map(([fecha, incidencia]) => ({
    fecha_monitoreo: fecha,
    incidencia,
    arboles_monitoreados: 100,
    arboles_afectados: Math.round(incidencia),
  })) as RondaFrontend[] & RondaEdge[];
}

function historial(
  overrides: Partial<HistorialFrontend> & { rondas: RondaFrontend[] },
): HistorialFrontend & HistorialEdge {
  return {
    sublote_id: 'sublote-1',
    lote_id: 'lote-1',
    pest_id: 'pest-x',
    pest_nombre: 'Plaga X',
    ...overrides,
  } as HistorialFrontend & HistorialEdge;
}

/** Campos que determinan el ranking y el "tono" de cada entrada — deben ser
 * idénticos entre las dos implementaciones. `why` se excluye a propósito (el
 * diseño permite diferencias triviales de redacción; en la práctica hoy son
 * idénticas, pero no forzamos ese acoplamiento aquí). */
function pickRankingFields(entries: Array<Record<string, unknown>>) {
  return entries.map((e) => ({
    sublote_id: e.sublote_id,
    lote_id: e.lote_id,
    pest_id: e.pest_id,
    pest_nombre: e.pest_nombre,
    grupo_key: e.grupo_key,
    tier: e.tier,
    estadoUmbral: e.estadoUmbral,
    umbralPct: e.umbralPct,
    umbralSourceLabel: e.umbralSourceLabel,
    gravedad: e.gravedad,
    incidenciaActual: e.incidenciaActual,
    incidenciaAnterior: e.incidenciaAnterior,
    cambio: e.cambio,
    cambioFormateado: e.cambioFormateado,
    tendencia: e.tendencia,
    temporadaAlta: e.temporadaAlta,
    historicalTier: e.historicalTier,
    weekOfYear: e.weekOfYear,
    diasDesdeUltimaFumigacion: e.diasDesdeUltimaFumigacion,
    numRondas: e.numRondas,
    bracket: e.bracket,
  }));
}

interface Scenario {
  nombre: string;
  historiales: Array<HistorialFrontend & HistorialEdge>;
  umbrales: Array<UmbralFrontend & UmbralEdge>;
  perfilesEstacionales: Array<PerfilFrontend & PerfilEdge>;
  ultimasFumigaciones: Array<EventoFrontend & EventoEdge>;
}

const escenarios: Scenario[] = [
  {
    nombre: 'Tier A sobre umbral + subiendo vs Tier B de relleno',
    historiales: [
      historial({
        sublote_id: 'sub-thrips',
        lote_id: 'lote-1',
        pest_id: 'pest-thrips',
        pest_nombre: 'Thrips',
        rondas: rondas([
          ['2026-05-01', 5],
          ['2026-05-15', 8],
          ['2026-06-01', 12],
          ['2026-06-15', 15],
        ]),
      }),
      historial({
        sublote_id: 'sub-b',
        lote_id: 'lote-1',
        pest_id: 'pest-mosca',
        pest_nombre: 'Mosca del ovario',
        rondas: rondas([
          ['2026-06-01', 5],
          ['2026-06-15', 6],
        ]),
      }),
    ],
    umbrales: [{ pest_id: 'pest-thrips', grupo_key: null, umbral_pct: 10, source_label: 'Cartama' }],
    perfilesEstacionales: [],
    ultimasFumigaciones: [],
  },
  {
    nombre: 'regla de orden dura: over (bajando) > under (subiendo) > Tier B High (subiendo)',
    historiales: [
      historial({
        sublote_id: 'sub-marceno',
        pest_id: 'pest-marceno',
        pest_nombre: 'Cucarron marceño',
        rondas: rondas([
          ['2026-05-01', 40],
          ['2026-05-15', 35],
          ['2026-06-01', 30],
          ['2026-06-15', 25],
        ]),
      }),
      historial({
        sublote_id: 'sub-phyto',
        pest_id: 'pest-phyto',
        pest_nombre: 'Phytophtora',
        rondas: rondas([
          ['2026-05-01', 5],
          ['2026-05-15', 10],
          ['2026-06-01', 20],
          ['2026-06-15', 35],
        ]),
      }),
      historial({
        sublote_id: 'sub-mosca',
        pest_id: 'pest-mosca',
        pest_nombre: 'Mosca del ovario',
        rondas: rondas([
          ['2026-05-01', 5],
          ['2026-05-15', 10],
          ['2026-06-01', 20],
          ['2026-06-15', 35],
        ]),
      }),
    ],
    umbrales: [
      { pest_id: 'pest-marceno', grupo_key: null, umbral_pct: 10, source_label: 'Cartama' },
      { pest_id: 'pest-phyto', grupo_key: null, umbral_pct: 50, source_label: 'Cartama' },
    ],
    perfilesEstacionales: [
      { pest_id: 'pest-mosca', lote_id: null, week_of_year: SEMANA_ACTUAL, historical_tier: 'High', n_years_observed: 2 },
    ],
    ultimasFumigaciones: [],
  },
  {
    nombre: 'Tier B Alta supera a Tier A under (regresión Thrips 0.1% vs Mosca 90%)',
    historiales: [
      historial({
        sublote_id: 'sub-thrips',
        pest_id: 'pest-thrips',
        pest_nombre: 'Thrips',
        rondas: rondas([
          ['2026-05-01', 0.1],
          ['2026-05-15', 0.1],
          ['2026-06-01', 0.1],
          ['2026-06-15', 0.1],
        ]),
      }),
      historial({
        sublote_id: 'sub-mosca2',
        pest_id: 'pest-mosca2',
        pest_nombre: 'Mosca del ovario',
        rondas: rondas([
          ['2026-05-01', 85],
          ['2026-05-15', 88],
          ['2026-06-01', 90],
          ['2026-06-15', 90],
        ]),
      }),
    ],
    umbrales: [{ pest_id: 'pest-thrips', grupo_key: null, umbral_pct: 1, source_label: 'Cartama' }],
    perfilesEstacionales: [],
    ultimasFumigaciones: [],
  },
  {
    nombre: 'complejo de ácaros: pooling por MAX de la ronda (4 filas -> 1 entrada)',
    historiales: [
      historial({
        sublote_id: 'sub-acaro',
        pest_id: 'pest-acaro',
        pest_nombre: 'Ácaro',
        rondas: rondas([
          ['2026-06-01', 10],
          ['2026-06-15', 12],
        ]),
      }),
      historial({
        sublote_id: 'sub-acaro',
        pest_id: 'pest-acaro-cristalino',
        pest_nombre: 'Ácaro Cristalino',
        rondas: rondas([
          ['2026-06-01', 8],
          ['2026-06-15', 34],
        ]),
      }),
      historial({
        sublote_id: 'sub-acaro',
        pest_id: 'pest-huevos-acaro',
        pest_nombre: 'Huevos de acaro',
        rondas: rondas([
          ['2026-06-01', 5],
          ['2026-06-15', 10],
        ]),
      }),
      historial({
        sublote_id: 'sub-acaro',
        pest_id: 'pest-h-acaro-cristalino',
        pest_nombre: 'H-acaro  Cristalino',
        rondas: rondas([
          ['2026-06-01', 6],
          ['2026-06-15', 11],
        ]),
      }),
    ],
    umbrales: [
      { pest_id: 'pest-acaro', grupo_key: 'acaro_complex', umbral_pct: 33, source_label: 'Cartama' },
      { pest_id: 'pest-acaro-cristalino', grupo_key: 'acaro_complex', umbral_pct: 33, source_label: 'Cartama' },
      { pest_id: 'pest-huevos-acaro', grupo_key: 'acaro_complex', umbral_pct: 33, source_label: 'Cartama' },
      { pest_id: 'pest-h-acaro-cristalino', grupo_key: 'acaro_complex', umbral_pct: 33, source_label: 'Cartama' },
    ],
    perfilesEstacionales: [],
    ultimasFumigaciones: [],
  },
  {
    nombre: 'Antracnosis fruto/ramas independientes (no pooled)',
    historiales: [
      historial({
        sublote_id: 'sub-antracnosis',
        pest_id: 'pest-antracnosis-fruto',
        pest_nombre: 'Antracnosis fruto',
        rondas: rondas([
          ['2026-06-01', 8],
          ['2026-06-15', 12],
        ]),
      }),
      historial({
        sublote_id: 'sub-antracnosis',
        pest_id: 'pest-antracnosis-ramas',
        pest_nombre: 'Antracnosis ramas',
        rondas: rondas([
          ['2026-06-01', 3],
          ['2026-06-15', 4],
        ]),
      }),
    ],
    umbrales: [
      { pest_id: 'pest-antracnosis-fruto', grupo_key: null, umbral_pct: 10, source_label: 'Cartama' },
      { pest_id: 'pest-antracnosis-ramas', grupo_key: null, umbral_pct: 10, source_label: 'Cartama' },
    ],
    perfilesEstacionales: [],
    ultimasFumigaciones: [],
  },
  {
    nombre: 'historia insuficiente se excluye en ambas implementaciones',
    historiales: [
      historial({
        sublote_id: 'sub-nueva',
        pest_id: 'pest-nueva',
        pest_nombre: 'Plaga nueva',
        rondas: rondas([['2026-06-15', 20]]),
      }),
      historial({
        sublote_id: 'sub-normal',
        pest_id: 'pest-normal',
        pest_nombre: 'Plaga normal',
        rondas: rondas([
          ['2026-06-01', 5],
          ['2026-06-15', 6],
        ]),
      }),
    ],
    umbrales: [],
    perfilesEstacionales: [],
    ultimasFumigaciones: [],
  },
  {
    nombre: 'perfil estacional: fallback lote -> finca (perfil especifico de lote gana)',
    historiales: [
      historial({
        sublote_id: 'sub-1',
        lote_id: 'lote-especial',
        pest_id: 'pest-monalonion',
        pest_nombre: 'Monalonion',
        rondas: rondas([
          ['2026-06-01', 5],
          ['2026-06-15', 6],
        ]),
      }),
    ],
    umbrales: [],
    perfilesEstacionales: [
      { pest_id: 'pest-monalonion', lote_id: null, week_of_year: SEMANA_ACTUAL, historical_tier: 'Low', n_years_observed: 3 },
      { pest_id: 'pest-monalonion', lote_id: 'lote-especial', week_of_year: SEMANA_ACTUAL, historical_tier: 'High', n_years_observed: 1 },
    ],
    ultimasFumigaciones: [],
  },
  {
    nombre: 'dias desde ultima fumigacion: null cuando no hay datos, calculado cuando si',
    historiales: [
      historial({
        sublote_id: 'sub-1',
        lote_id: 'lote-fumigado',
        pest_id: 'pest-x',
        rondas: rondas([
          ['2026-06-01', 5],
          ['2026-06-15', 6],
        ]),
      }),
    ],
    umbrales: [],
    perfilesEstacionales: [],
    ultimasFumigaciones: [
      { lote_id: 'lote-fumigado', fecha: '2026-06-05' },
      { lote_id: 'lote-fumigado', fecha: '2026-06-10' },
    ],
  },
];

describe('Paridad frontend <-> edge function (priorizacion-scouting.ts)', () => {
  for (const escenario of escenarios) {
    it(`produce el mismo ranking para: ${escenario.nombre}`, () => {
      const inputFrontend = {
        historiales: escenario.historiales as HistorialFrontend[],
        umbrales: escenario.umbrales as UmbralFrontend[],
        perfilesEstacionales: escenario.perfilesEstacionales as PerfilFrontend[],
        ultimasFumigaciones: escenario.ultimasFumigaciones as EventoFrontend[],
        fechaReferencia: FECHA_REF,
      };
      const inputEdge = {
        historiales: escenario.historiales as HistorialEdge[],
        umbrales: escenario.umbrales as UmbralEdge[],
        perfilesEstacionales: escenario.perfilesEstacionales as PerfilEdge[],
        ultimasFumigaciones: escenario.ultimasFumigaciones as EventoEdge[],
        fechaReferencia: FECHA_REF,
      };

      const resultadoFrontend = priorizarFrontend(inputFrontend);
      const resultadoEdge = priorizarEdge(inputEdge);

      // Mismo numero de entradas, mismo orden de pest_id (el orden ES el
      // resultado de la regla de bracket -- si difiere, hay drift real).
      expect(resultadoEdge.map((e) => e.pest_id)).toEqual(resultadoFrontend.map((e) => e.pest_id));
      expect(resultadoEdge.map((e) => e.sublote_id)).toEqual(resultadoFrontend.map((e) => e.sublote_id));

      // Mismos valores de campo por campo (todo lo que maneja el ranking o se
      // muestra con autoridad al usuario), en el mismo orden.
      expect(pickRankingFields(resultadoEdge as unknown as Array<Record<string, unknown>>)).toEqual(
        pickRankingFields(resultadoFrontend as unknown as Array<Record<string, unknown>>),
      );
    });
  }

  it('ambas implementaciones producen exactamente el mismo texto "why" en la practica (no solo los campos que lo alimentan)', () => {
    // El diseño permite diferencias triviales de redaccion entre las dos
    // copias, pero como este port fue copiado literalmente, verificamos que
    // hoy son ademas byte-identicas -- si alguien edita una sin la otra, esta
    // aserción (mas estricta que lo minimo exigido) lo detecta de inmediato.
    for (const escenario of escenarios) {
      const resultadoFrontend = priorizarFrontend({
        historiales: escenario.historiales as HistorialFrontend[],
        umbrales: escenario.umbrales as UmbralFrontend[],
        perfilesEstacionales: escenario.perfilesEstacionales as PerfilFrontend[],
        ultimasFumigaciones: escenario.ultimasFumigaciones as EventoFrontend[],
        fechaReferencia: FECHA_REF,
      });
      const resultadoEdge = priorizarEdge({
        historiales: escenario.historiales as HistorialEdge[],
        umbrales: escenario.umbrales as UmbralEdge[],
        perfilesEstacionales: escenario.perfilesEstacionales as PerfilEdge[],
        ultimasFumigaciones: escenario.ultimasFumigaciones as EventoEdge[],
        fechaReferencia: FECHA_REF,
      });
      expect(resultadoEdge.map((e) => e.why)).toEqual(resultadoFrontend.map((e) => e.why));
    }
  });
});
