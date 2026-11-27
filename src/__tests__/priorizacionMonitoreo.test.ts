import { describe, it, expect } from 'vitest';
import {
  priorizarMonitoreo,
  calcularCoberturaRonda,
  calcularLecturasPorLote,
  rondaActualPorLoteDe,
  DIAS_MAX_LECTURA_VIGENTE,
} from '@/utils/priorizacionMonitoreo';
import type {
  HistorialSublotePlaga,
  UmbralEconomico,
  PerfilEstacional,
  EventoFumigacion,
  RondaHistorica,
  SubloteEnAlcance,
} from '@/utils/priorizacionMonitoreo';

// Fecha de referencia fija para todos los tests -> resultados determinísticos.
const FECHA_REF = new Date(2026, 5, 15); // 2026-06-15

// Réplica local (sólo para construir fixtures de prueba, no reimplementa la lógica
// de producción) del cálculo de semana ISO usado por priorizacionMonitoreo.ts, para
// poder anclar perfiles estacionales a la semana "actual" sin adivinar el número.
function semanaISOParaFixture(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const diaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7);
}
const SEMANA_ACTUAL = semanaISOParaFixture(FECHA_REF);

// Todas las fixtures de este archivo usan fechas únicas por ronda -- se reutiliza
// la fecha como ronda_id (simplifica los fixtures sin perder expresividad) y la
// última fecha ('2026-06-15') como la "ronda actual" de la finca en cada test.
const RONDA_ACTUAL_ID = '2026-06-15';

function rondas(valores: Array<[string, number]>): RondaHistorica[] {
  return valores.map(([fecha, incidencia]) => ({
    fecha_monitoreo: fecha,
    ronda_id: fecha,
    incidencia,
    arboles_monitoreados: 100,
    arboles_afectados: Math.round(incidencia),
  }));
}

/** Todos los lotes de `historiales` leídos en la misma ronda (la "actual"). */
function rondaUnica(historiales: HistorialSublotePlaga[], rondaId: string = RONDA_ACTUAL_ID): Map<string, string> {
  return new Map(historiales.map((h) => [h.lote_id, rondaId]));
}

function historial(overrides: Partial<HistorialSublotePlaga> & { rondas: RondaHistorica[] }): HistorialSublotePlaga {
  return {
    sublote_id: 'sublote-1',
    lote_id: 'lote-1',
    pest_id: 'pest-x',
    pest_nombre: 'Plaga X',
    ...overrides,
  };
}

describe('priorizarMonitoreo', () => {
  it('Tier A sobre el umbral + tendencia subiendo queda en el primer lugar', () => {
    const historiales: HistorialSublotePlaga[] = [
      historial({
        sublote_id: 'sub-thrips',
        lote_id: 'lote-1',
        pest_id: 'pest-thrips',
        pest_nombre: 'Thrips',
        // subiendo: pendiente > 2; última ronda 15% supera el umbral de 10%
        rondas: rondas([
          ['2026-05-01', 5],
          ['2026-05-15', 8],
          ['2026-06-01', 12],
          ['2026-06-15', 15],
        ]),
      }),
      // Un Tier B cualquiera de relleno, para confirmar que el Tier A queda arriba.
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
    ];
    const umbrales: UmbralEconomico[] = [
      { pest_id: 'pest-thrips', grupo_key: null, umbral_pct: 10, source_label: 'Cartama' },
    ];

    const resultado = priorizarMonitoreo({
      historiales,
      umbrales,
      perfilesEstacionales: [],
      ultimasFumigaciones: [],
      fechaReferencia: FECHA_REF,
      rondaActualPorLote: rondaUnica(historiales),
    });

    expect(resultado[0].pest_id).toBe('pest-thrips');
    expect(resultado[0].tier).toBe('A');
    expect(resultado[0].estadoUmbral).toBe('over');
    expect(resultado[0].tendencia).toBe('subiendo');
    expect(resultado[0].bracket).toBe(0);
    expect(resultado[0].why).toMatch(/umbral económico/);
  });

  it('regla de orden dura: Tier A "over" (incluso bajando) queda por encima de Tier A "under" en fuerte subida y de Tier B "High" en subida', () => {
    const historiales: HistorialSublotePlaga[] = [
      // Tier A OVER pero con tendencia BAJANDO -- debe seguir ganando por construcción.
      historial({
        sublote_id: 'sub-marceno',
        pest_id: 'pest-marceno',
        pest_nombre: 'Cucarron marceño',
        rondas: rondas([
          ['2026-05-01', 40],
          ['2026-05-15', 35],
          ['2026-06-01', 30],
          ['2026-06-15', 25], // 25% sigue >= umbral 10%
        ]),
      }),
      // Tier A UNDER con tendencia fuertemente subiendo -- NO debe superar al anterior.
      historial({
        sublote_id: 'sub-phyto',
        pest_id: 'pest-phyto',
        pest_nombre: 'Phytophtora',
        rondas: rondas([
          ['2026-05-01', 5],
          ['2026-05-15', 10],
          ['2026-06-01', 20],
          ['2026-06-15', 35], // umbral 50% -> 35 < 40 (margen 0.8) => "under"
        ]),
      }),
      // Tier B con perfil estacional "High" y tendencia subiendo -- tampoco debe superar.
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
    ];
    const umbrales: UmbralEconomico[] = [
      { pest_id: 'pest-marceno', grupo_key: null, umbral_pct: 10, source_label: 'Cartama' },
      { pest_id: 'pest-phyto', grupo_key: null, umbral_pct: 50, source_label: 'Cartama' },
      // pest-mosca: sin fila -> Tier B
    ];
    const perfilesEstacionales: PerfilEstacional[] = [
      { pest_id: 'pest-mosca', lote_id: null, week_of_year: SEMANA_ACTUAL, historical_tier: 'High', n_years_observed: 2 },
    ];

    const resultado = priorizarMonitoreo({
      historiales,
      umbrales,
      perfilesEstacionales,
      ultimasFumigaciones: [],
      fechaReferencia: FECHA_REF,
      rondaActualPorLote: rondaUnica(historiales),
    });

    // Confirmamos primero que las condiciones de fondo son las esperadas.
    const marceno = resultado.find((e) => e.pest_id === 'pest-marceno')!;
    const phyto = resultado.find((e) => e.pest_id === 'pest-phyto')!;
    const mosca = resultado.find((e) => e.pest_id === 'pest-mosca')!;
    expect(marceno.estadoUmbral).toBe('over');
    expect(marceno.tendencia).toBe('bajando');
    expect(phyto.estadoUmbral).toBe('under');
    expect(phyto.tendencia).toBe('subiendo');
    expect(mosca.tier).toBe('B');
    expect(mosca.temporadaAlta).toBe(true);
    expect(mosca.tendencia).toBe('subiendo');

    // La regla dura: "over" gana pase lo que pase con tendencia/estacionalidad.
    expect(resultado[0].pest_id).toBe('pest-marceno');
    expect(resultado.findIndex((e) => e.pest_id === 'pest-marceno')).toBeLessThan(
      resultado.findIndex((e) => e.pest_id === 'pest-phyto')
    );
    expect(resultado.findIndex((e) => e.pest_id === 'pest-marceno')).toBeLessThan(
      resultado.findIndex((e) => e.pest_id === 'pest-mosca')
    );
  });

  it('Tier B "Alta" (tercil histórico propio) supera a Tier A "under" -- un umbral Cartama no alcanzado no debe opacar una incidencia realmente severa sin umbral validado', () => {
    // Regresión: una verificación independiente detectó que Thrips al 0.1% (Tier A,
    // "under" del 1% de Cartama) rankeaba por encima de Mosca del ovario al 90%
    // (Tier B, "Alta" según su propio tercil histórico) -- agronómicamente absurdo.
    // bracketDe() ya no trata "under" como superior en bloque a todo Tier B.
    const historiales: HistorialSublotePlaga[] = [
      historial({
        sublote_id: 'sub-thrips',
        pest_id: 'pest-thrips',
        pest_nombre: 'Thrips',
        rondas: rondas([
          ['2026-05-01', 0.1],
          ['2026-05-15', 0.1],
          ['2026-06-01', 0.1],
          ['2026-06-15', 0.1], // umbral Cartama 1% -> muy por debajo, "under"
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
          ['2026-06-15', 90], // sin umbral Cartama -> Tier B; 90% es "Alta" por cualquier tercil razonable
        ]),
      }),
    ];
    const umbrales: UmbralEconomico[] = [
      { pest_id: 'pest-thrips', grupo_key: null, umbral_pct: 1, source_label: 'Cartama' },
      // pest-mosca2: sin fila -> Tier B
    ];

    const resultado = priorizarMonitoreo({
      historiales,
      umbrales,
      perfilesEstacionales: [],
      ultimasFumigaciones: [],
      fechaReferencia: FECHA_REF,
      rondaActualPorLote: rondaUnica(historiales),
    });

    const thrips = resultado.find((e) => e.pest_id === 'pest-thrips')!;
    const mosca2 = resultado.find((e) => e.pest_id === 'pest-mosca2')!;
    expect(thrips.tier).toBe('A');
    expect(thrips.estadoUmbral).toBe('under');
    expect(mosca2.tier).toBe('B');
    expect(mosca2.gravedad?.texto).toBe('Alta');

    // Mosca (Tier B "Alta", 90%) debe rankear por encima de Thrips (Tier A "under", 0.1%).
    expect(resultado.findIndex((e) => e.pest_id === 'pest-mosca2')).toBeLessThan(
      resultado.findIndex((e) => e.pest_id === 'pest-thrips')
    );
  });

  it('complejo de ácaros: pool por MAX de la ronda, aunque la mayoría de los miembros esté bajo 33%', () => {
    // Tres miembros se mantienen bajos en ambas rondas; uno solo (H-acaro Cristalino)
    // sube a 34% en la ronda más reciente. Si el pooling tomara un promedio (o
    // comparara sólo un miembro "representativo") en vez del MAX del grupo esa
    // ronda, este caso NO quedaría marcado "over". Se verifica que: (a) las 4 filas
    // catalogadas se colapsan en UNA sola entrada de salida (no 4 líneas
    // independientes gatilladas a 33%), y (b) esa entrada única sí queda "over"
    // tomando el máximo real observado esa ronda.
    const historiales: HistorialSublotePlaga[] = [
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
          ['2026-06-15', 34], // el único que cruza 33% esta ronda
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
    ];
    const umbrales: UmbralEconomico[] = [
      { pest_id: 'pest-acaro', grupo_key: 'acaro_complex', umbral_pct: 33, source_label: 'Cartama' },
      { pest_id: 'pest-acaro-cristalino', grupo_key: 'acaro_complex', umbral_pct: 33, source_label: 'Cartama' },
      { pest_id: 'pest-huevos-acaro', grupo_key: 'acaro_complex', umbral_pct: 33, source_label: 'Cartama' },
      { pest_id: 'pest-h-acaro-cristalino', grupo_key: 'acaro_complex', umbral_pct: 33, source_label: 'Cartama' },
    ];

    const resultado = priorizarMonitoreo({
      historiales,
      umbrales,
      perfilesEstacionales: [],
      ultimasFumigaciones: [],
      fechaReferencia: FECHA_REF,
      rondaActualPorLote: rondaUnica(historiales),
    });

    const entradasAcaro = resultado.filter((e) => e.grupo_key === 'acaro_complex');
    expect(entradasAcaro).toHaveLength(1);
    expect(entradasAcaro[0].incidenciaActual).toBe(34);
    expect(entradasAcaro[0].estadoUmbral).toBe('over');
    expect(entradasAcaro[0].pest_nombre).toBe('Acaros (insecto y huevos)');
  });

  it('Antracnosis fruto y Antracnosis ramas NO se agrupan: dos entradas independientes, cada una gatillada a su propio 10%', () => {
    const historiales: HistorialSublotePlaga[] = [
      historial({
        sublote_id: 'sub-antracnosis',
        pest_id: 'pest-antracnosis-fruto',
        pest_nombre: 'Antracnosis fruto',
        rondas: rondas([
          ['2026-06-01', 8],
          ['2026-06-15', 12], // over su propio 10%
        ]),
      }),
      historial({
        sublote_id: 'sub-antracnosis',
        pest_id: 'pest-antracnosis-ramas',
        pest_nombre: 'Antracnosis ramas',
        rondas: rondas([
          ['2026-06-01', 3],
          ['2026-06-15', 4], // under su propio 10%
        ]),
      }),
    ];
    const umbrales: UmbralEconomico[] = [
      { pest_id: 'pest-antracnosis-fruto', grupo_key: null, umbral_pct: 10, source_label: 'Cartama' },
      { pest_id: 'pest-antracnosis-ramas', grupo_key: null, umbral_pct: 10, source_label: 'Cartama' },
    ];

    const resultado = priorizarMonitoreo({
      historiales,
      umbrales,
      perfilesEstacionales: [],
      ultimasFumigaciones: [],
      fechaReferencia: FECHA_REF,
      rondaActualPorLote: rondaUnica(historiales),
    });

    expect(resultado).toHaveLength(2);
    const fruto = resultado.find((e) => e.pest_id === 'pest-antracnosis-fruto')!;
    const ramas = resultado.find((e) => e.pest_id === 'pest-antracnosis-ramas')!;
    expect(fruto.grupo_key).toBeNull();
    expect(ramas.grupo_key).toBeNull();
    expect(fruto.estadoUmbral).toBe('over');
    expect(ramas.estadoUmbral).toBe('under');
  });

  it('un (sublote, plaga) con sólo 1 ronda histórica se incluye sin tendencia (dato individual = monitoreo más reciente), sin crashear', () => {
    const historiales: HistorialSublotePlaga[] = [
      historial({
        sublote_id: 'sub-nueva',
        pest_id: 'pest-nueva',
        pest_nombre: 'Plaga nueva',
        rondas: rondas([['2026-06-15', 20]]),
      }),
      // Una segunda con historia suficiente, para confirmar que el resto del
      // pipeline sigue funcionando (no es un caso de "todo vacío").
      historial({
        sublote_id: 'sub-normal',
        pest_id: 'pest-normal',
        pest_nombre: 'Plaga normal',
        rondas: rondas([
          ['2026-06-01', 5],
          ['2026-06-15', 6],
        ]),
      }),
    ];

    expect(() =>
      priorizarMonitoreo({
        historiales,
        umbrales: [],
        perfilesEstacionales: [],
        ultimasFumigaciones: [],
        fechaReferencia: FECHA_REF,
        rondaActualPorLote: rondaUnica(historiales),
      })
    ).not.toThrow();

    const resultado = priorizarMonitoreo({
      historiales,
      umbrales: [],
      perfilesEstacionales: [],
      ultimasFumigaciones: [],
      fechaReferencia: FECHA_REF,
      rondaActualPorLote: rondaUnica(historiales),
    });

    const nueva = resultado.find((e) => e.pest_id === 'pest-nueva');
    expect(nueva).toBeDefined();
    expect(nueva!.numRondas).toBe(1);
    expect(nueva!.incidenciaActual).toBe(20);
    expect(nueva!.incidenciaAnterior).toBe(20); // sin ronda previa: no se inventa un cambio
    expect(nueva!.cambio).toBe(0);
    expect(nueva!.tendencia).toBe('estable');
    expect(nueva!.why).toMatch(/primera lectura registrada/);
    expect(resultado.some((e) => e.pest_id === 'pest-normal')).toBe(true);
  });

  it('plaga sin fila en pest_umbral_economico y sin ningún dato en pest_seasonal_profile produce una entrada Tier B válida, sin crashear', () => {
    const historiales: HistorialSublotePlaga[] = [
      historial({
        sublote_id: 'sub-cladosporium',
        pest_id: 'pest-cladosporium',
        pest_nombre: 'Cladosporium',
        rondas: rondas([
          ['2026-06-01', 4],
          ['2026-06-15', 5],
        ]),
      }),
    ];

    const resultado = priorizarMonitoreo({
      historiales,
      umbrales: [], // sin ninguna fila de umbral económico
      perfilesEstacionales: [], // sin ningún perfil estacional
      ultimasFumigaciones: [],
      fechaReferencia: FECHA_REF,
      rondaActualPorLote: rondaUnica(historiales),
    });

    expect(resultado).toHaveLength(1);
    const entrada = resultado[0];
    expect(entrada.tier).toBe('B');
    expect(entrada.estadoUmbral).toBeUndefined();
    expect(entrada.gravedad).toBeDefined();
    expect(entrada.temporadaAlta).toBe(false);
    expect(entrada.historicalTier).toBeUndefined();
    expect(entrada.diasDesdeUltimaFumigacion).toBeNull();
    expect(entrada.why).toMatch(/sin umbral económico validado/);
    expect(entrada.why).toContain('Cladosporium');
  });

  it('perfil estacional: prioriza el perfil específico del lote sobre el perfil general de finca (fallback lote -> finca)', () => {
    const historiales: HistorialSublotePlaga[] = [
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
    ];
    const perfilesEstacionales: PerfilEstacional[] = [
      // Perfil general de finca dice "Low" para esta semana...
      { pest_id: 'pest-monalonion', lote_id: null, week_of_year: SEMANA_ACTUAL, historical_tier: 'Low', n_years_observed: 3 },
      // ...pero hay un perfil específico de este lote que dice "High" -> debe ganar.
      { pest_id: 'pest-monalonion', lote_id: 'lote-especial', week_of_year: SEMANA_ACTUAL, historical_tier: 'High', n_years_observed: 1 },
    ];

    const resultado = priorizarMonitoreo({
      historiales,
      umbrales: [],
      perfilesEstacionales,
      ultimasFumigaciones: [],
      fechaReferencia: FECHA_REF,
      rondaActualPorLote: rondaUnica(historiales),
    });

    expect(resultado[0].historicalTier).toBe('High');
    expect(resultado[0].temporadaAlta).toBe(true);
  });

  it('días desde la última fumigación es null cuando no hay datos de fumigación (nunca se asume 0)', () => {
    const historiales: HistorialSublotePlaga[] = [
      historial({
        sublote_id: 'sub-1',
        lote_id: 'lote-sin-fumigar',
        pest_id: 'pest-x',
        rondas: rondas([
          ['2026-06-01', 5],
          ['2026-06-15', 6],
        ]),
      }),
    ];
    const ultimasFumigaciones: EventoFumigacion[] = [{ lote_id: 'otro-lote', fecha: '2026-06-10' }];

    const resultado = priorizarMonitoreo({
      historiales,
      umbrales: [],
      perfilesEstacionales: [],
      ultimasFumigaciones,
      fechaReferencia: FECHA_REF,
      rondaActualPorLote: rondaUnica(historiales),
    });

    expect(resultado[0].diasDesdeUltimaFumigacion).toBeNull();
  });

  it('calcula correctamente los días desde la última fumigación cuando sí hay datos para el lote', () => {
    const historiales: HistorialSublotePlaga[] = [
      historial({
        sublote_id: 'sub-1',
        lote_id: 'lote-fumigado',
        pest_id: 'pest-x',
        rondas: rondas([
          ['2026-06-01', 5],
          ['2026-06-15', 6],
        ]),
      }),
    ];
    const ultimasFumigaciones: EventoFumigacion[] = [
      { lote_id: 'lote-fumigado', fecha: '2026-06-05' },
      { lote_id: 'lote-fumigado', fecha: '2026-06-10' }, // la más reciente
    ];

    const resultado = priorizarMonitoreo({
      historiales,
      umbrales: [],
      perfilesEstacionales: [],
      ultimasFumigaciones,
      fechaReferencia: FECHA_REF,
      rondaActualPorLote: rondaUnica(historiales),
    });

    expect(resultado[0].diasDesdeUltimaFumigacion).toBe(5);
  });
});

// ============================================================================
// ESCO-184 — estado actual POR LOTE. Cada lote se lee en su ronda más
// reciente con lectura en ese lote. Si esa lectura tiene más de
// DIAS_MAX_LECTURA_VIGENTE (14) días, el lote queda "no revisado desde
// <fecha>", nunca 0%. Una ronda que visitó media finca ya no deja la otra
// mitad sin estado.
// ============================================================================

/** Lectura de un sublote en una ronda con nombre explícito (ronda_id != fecha). */
function lectura(fecha: string, rondaId: string | null, incidencia = 5): RondaHistorica {
  return {
    fecha_monitoreo: fecha,
    ronda_id: rondaId as string,
    incidencia,
    arboles_monitoreados: 100,
    arboles_afectados: incidencia,
  };
}

// Réplica de la finca el 2026-11-26: R35 (13-nov) leyó Piedra Paula y Salto;
// R34 (3-nov) leyó Australia y La Vega.
function historialesNoviembre(): HistorialSublotePlaga[] {
  return [
    historial({ lote_id: 'pp', lote_nombre: 'Piedra Paula', sublote_id: 'pp-1', rondas: [lectura('2026-10-30', 'R33'), lectura('2026-11-13', 'R35', 9)] }),
    historial({ lote_id: 'salto', lote_nombre: 'Salto de Tequendama', sublote_id: 'salto-1', rondas: [lectura('2026-11-12', 'R35', 7)] }),
    historial({ lote_id: 'aus', lote_nombre: 'Australia', sublote_id: 'aus-1', rondas: [lectura('2026-10-20', 'R33'), lectura('2026-11-03', 'R34', 12)] }),
    historial({ lote_id: 'vega', lote_nombre: 'La Vega', sublote_id: 'vega-1', rondas: [lectura('2026-11-03', 'R34', 4)] }),
  ];
}

describe('calcularLecturasPorLote / rondaActualPorLoteDe', () => {
  it('el umbral por defecto es 14 días', () => {
    expect(DIAS_MAX_LECTURA_VIGENTE).toBe(14);
  });

  it('N=14 al 2026-11-26: los lotes de R35 quedan vigentes y los de R34 "no revisado desde 2026-11-03"', () => {
    const ref = new Date(2026, 10, 26);
    const lecturas = calcularLecturasPorLote(historialesNoviembre(), ref);

    expect(lecturas.get('pp')).toMatchObject({ ronda_id: 'R35', fechaLectura: '2026-11-13', vigente: true, diasDesdeLectura: 13 });
    expect(lecturas.get('salto')).toMatchObject({ ronda_id: 'R35', fechaLectura: '2026-11-12', vigente: true });
    expect(lecturas.get('aus')).toMatchObject({ ronda_id: 'R34', fechaLectura: '2026-11-03', vigente: false, diasDesdeLectura: 23 });
    expect(lecturas.get('vega')).toMatchObject({ ronda_id: 'R34', fechaLectura: '2026-11-03', vigente: false });

    const mapa = rondaActualPorLoteDe(historialesNoviembre(), ref);
    expect([...mapa.entries()].sort()).toEqual([['pp', 'R35'], ['salto', 'R35']]);
  });

  it('N=21 al 2026-11-19: las dos rondas están vigentes, cada lote con la suya', () => {
    const ref = new Date(2026, 10, 19);
    const mapa = rondaActualPorLoteDe(historialesNoviembre(), ref, 21);
    expect(Object.fromEntries(mapa)).toEqual({ pp: 'R35', salto: 'R35', aus: 'R34', vega: 'R34' });
  });

  it('una lectura sin ronda (ronda_id null) nunca define la ronda de un lote', () => {
    const ref = new Date(2026, 10, 26);
    const hist = [
      historial({ lote_id: 'x', sublote_id: 'x-1', rondas: [lectura('2026-10-01', 'R30'), lectura('2026-11-25', null, 40)] }),
    ];
    const l = calcularLecturasPorLote(hist, ref).get('x')!;
    expect(l.ronda_id).toBe('R30');
    expect(l.fechaLectura).toBe('2026-10-01');
    expect(l.vigente).toBe(false);
  });

  it('un lote que sólo tiene lecturas sin ronda queda sin ronda y sin fecha', () => {
    const ref = new Date(2026, 10, 26);
    const hist = [historial({ lote_id: 'y', sublote_id: 'y-1', rondas: [lectura('2026-11-25', null)] })];
    expect(calcularLecturasPorLote(hist, ref).get('y')).toMatchObject({ ronda_id: null, fechaLectura: null, vigente: false, diasDesdeLectura: null });
    expect(rondaActualPorLoteDe(hist, ref).size).toBe(0);
  });
});

describe('priorizarMonitoreo con ronda por lote', () => {
  it('un lote con lectura vencida no entra al ranking; los vigentes sí, cada uno con su fecha de lectura', () => {
    const ref = new Date(2026, 10, 26);
    const historiales = historialesNoviembre();
    const resultado = priorizarMonitoreo({
      historiales,
      umbrales: [],
      perfilesEstacionales: [],
      ultimasFumigaciones: [],
      fechaReferencia: ref,
      rondaActualPorLote: rondaActualPorLoteDe(historiales, ref),
    });
    expect(resultado.map((e) => e.lote_id).sort()).toEqual(['pp', 'salto']);
    expect(resultado.find((e) => e.lote_id === 'pp')!.fechaLectura).toBe('2026-11-13');
    expect(resultado.find((e) => e.lote_id === 'salto')!.fechaLectura).toBe('2026-11-12');
  });

  it('con N=21 entran los cuatro lotes: una ronda de media finca ya no deja fuera la otra mitad', () => {
    const ref = new Date(2026, 10, 19);
    const historiales = historialesNoviembre();
    const resultado = priorizarMonitoreo({
      historiales,
      umbrales: [],
      perfilesEstacionales: [],
      ultimasFumigaciones: [],
      fechaReferencia: ref,
      rondaActualPorLote: rondaActualPorLoteDe(historiales, ref, 21),
    });
    expect(resultado.map((e) => e.lote_id).sort()).toEqual(['aus', 'pp', 'salto', 'vega']);
    expect(resultado.find((e) => e.lote_id === 'aus')!.incidenciaActual).toBe(12);
  });
});

describe('calcularCoberturaRonda (por lote)', () => {
  function subloteEnAlcance(overrides: Partial<SubloteEnAlcance> & { sublote_id: string }): SubloteEnAlcance {
    return { lote_id: 'lote-1', lote_nombre: 'Lote 1', ...overrides };
  }

  it('un sublote con lectura (de cualquier plaga) en la ronda vigente de su lote cuenta como revisado', () => {
    const cobertura = calcularCoberturaRonda(
      [subloteEnAlcance({ sublote_id: 'sub-1', sublote_nombre: 'Sublote 1' })],
      [historial({ sublote_id: 'sub-1', rondas: rondas([['2026-06-01', 5], ['2026-06-15', 6]]) })],
      FECHA_REF
    );
    expect(cobertura.diasMaxLectura).toBe(14);
    expect(cobertura.totalEnAlcance).toBe(1);
    expect(cobertura.revisados).toBe(1);
    expect(cobertura.noRevisados).toEqual([]);
    expect(cobertura.lotes).toEqual([
      { lote_id: 'lote-1', lote_nombre: 'Lote 1', ronda_id: '2026-06-15', fechaLectura: '2026-06-15', vigente: true, diasDesdeLectura: 0 },
    ]);
  });

  it('un lote sin ningún historial: sus sublotes quedan "sin lectura vigente", sin ningún campo de incidencia', () => {
    const cobertura = calcularCoberturaRonda(
      [subloteEnAlcance({ sublote_id: 'sub-nunca', sublote_nombre: 'Sublote Fantasma' })],
      [],
      FECHA_REF
    );
    expect(cobertura.revisados).toBe(0);
    expect(cobertura.noRevisados).toEqual([
      {
        sublote_id: 'sub-nunca',
        sublote_nombre: 'Sublote Fantasma',
        lote_id: 'lote-1',
        lote_nombre: 'Lote 1',
        motivo: 'lote_sin_lectura_vigente',
        ultimaLectura: null,
      },
    ]);
    expect(cobertura.lotes[0]).toMatchObject({ ronda_id: null, fechaLectura: null, vigente: false, diasDesdeLectura: null });
    expect(cobertura.noRevisados[0]).not.toHaveProperty('incidenciaActual');
  });

  it('regla dura: un lote cuya lectura más reciente tiene más de 14 días queda "no revisado desde <fecha>", nunca revisado', () => {
    const cobertura = calcularCoberturaRonda(
      [subloteEnAlcance({ sublote_id: 'sub-viejo' })],
      [historial({ sublote_id: 'sub-viejo', rondas: rondas([['2026-05-01', 40], ['2026-05-15', 35]]) })],
      FECHA_REF
    );
    expect(cobertura.revisados).toBe(0);
    expect(cobertura.noRevisados[0]).toMatchObject({ motivo: 'lote_sin_lectura_vigente', ultimaLectura: '2026-05-15' });
    expect(cobertura.lotes[0]).toMatchObject({ fechaLectura: '2026-05-15', vigente: false, diasDesdeLectura: 31 });
  });

  it('un sublote sin lectura en la ronda vigente de su lote (el lote sí se leyó) se marca aparte', () => {
    const cobertura = calcularCoberturaRonda(
      [
        subloteEnAlcance({ sublote_id: 'sub-a' }),
        subloteEnAlcance({ sublote_id: 'sub-b' }),
        subloteEnAlcance({ sublote_id: 'sub-c' }),
      ],
      [
        historial({ sublote_id: 'sub-a', pest_id: 'pest-x', rondas: rondas([['2026-06-15', 6]]) }),
        historial({ sublote_id: 'sub-b', pest_id: 'pest-y', rondas: rondas([['2026-06-01', 4]]) }),
      ],
      FECHA_REF
    );
    expect(cobertura.totalEnAlcance).toBe(3);
    expect(cobertura.revisados).toBe(1);
    const porId = Object.fromEntries(cobertura.noRevisados.map((s) => [s.sublote_id, s]));
    expect(porId['sub-b']).toMatchObject({ motivo: 'sin_lectura_en_ronda_del_lote', ultimaLectura: '2026-06-01' });
    expect(porId['sub-c']).toMatchObject({ motivo: 'sin_lectura_en_ronda_del_lote', ultimaLectura: null });
  });

  it('un sublote fuera de alcance (lote que ya no produce) no aparece ni en revisados ni en noRevisados', () => {
    const cobertura = calcularCoberturaRonda(
      [subloteEnAlcance({ sublote_id: 'sub-activo' })],
      [
        historial({ sublote_id: 'sub-activo', rondas: rondas([['2026-06-15', 6]]) }),
        historial({ sublote_id: 'sub-inactivo', lote_id: 'lote-inactivo', rondas: rondas([['2026-06-15', 90]]) }),
      ],
      FECHA_REF
    );
    expect(cobertura.totalEnAlcance).toBe(1);
    expect(cobertura.revisados).toBe(1);
    expect(cobertura.noRevisados).toEqual([]);
    expect(cobertura.lotes.map((l) => l.lote_id)).toEqual(['lote-1']);
  });

  it('noviembre 2026, N=14: 2 lotes vigentes y 2 "no revisado desde 2026-11-03"; cuenta por lote, no por ronda global', () => {
    const sublotes: SubloteEnAlcance[] = [
      { sublote_id: 'pp-1', lote_id: 'pp', lote_nombre: 'Piedra Paula' },
      { sublote_id: 'salto-1', lote_id: 'salto', lote_nombre: 'Salto de Tequendama' },
      { sublote_id: 'aus-1', lote_id: 'aus', lote_nombre: 'Australia' },
      { sublote_id: 'vega-1', lote_id: 'vega', lote_nombre: 'La Vega' },
    ];
    const cobertura = calcularCoberturaRonda(sublotes, historialesNoviembre(), new Date(2026, 10, 26));
    expect(cobertura.revisados).toBe(2);
    expect(cobertura.noRevisados.map((s) => [s.sublote_id, s.motivo, s.ultimaLectura])).toEqual([
      ['aus-1', 'lote_sin_lectura_vigente', '2026-11-03'],
      ['vega-1', 'lote_sin_lectura_vigente', '2026-11-03'],
    ]);
    expect(cobertura.lotes.map((l) => [l.lote_nombre, l.fechaLectura, l.vigente])).toEqual([
      ['Piedra Paula', '2026-11-13', true],
      ['Salto de Tequendama', '2026-11-12', true],
      ['Australia', '2026-11-03', false],
      ['La Vega', '2026-11-03', false],
    ]);
  });
});
