import { describe, it, expect } from 'vitest';
import { priorizarMonitoreo } from '@/utils/priorizacionMonitoreo';
import type {
  HistorialSublotePlaga,
  UmbralEconomico,
  PerfilEstacional,
  EventoFumigacion,
  RondaHistorica,
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
      rondaActualId: RONDA_ACTUAL_ID,
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
      rondaActualId: RONDA_ACTUAL_ID,
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
      rondaActualId: RONDA_ACTUAL_ID,
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
      rondaActualId: RONDA_ACTUAL_ID,
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
      rondaActualId: RONDA_ACTUAL_ID,
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
        rondaActualId: RONDA_ACTUAL_ID,
      })
    ).not.toThrow();

    const resultado = priorizarMonitoreo({
      historiales,
      umbrales: [],
      perfilesEstacionales: [],
      ultimasFumigaciones: [],
      fechaReferencia: FECHA_REF,
      rondaActualId: RONDA_ACTUAL_ID,
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
      rondaActualId: RONDA_ACTUAL_ID,
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
      rondaActualId: RONDA_ACTUAL_ID,
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
      rondaActualId: RONDA_ACTUAL_ID,
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
      rondaActualId: RONDA_ACTUAL_ID,
    });

    expect(resultado[0].diasDesdeUltimaFumigacion).toBe(5);
  });
});
