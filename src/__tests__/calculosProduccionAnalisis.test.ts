import { describe, it, expect } from 'vitest';
import {
  cosechaKey,
  formatCosechaLabel,
  formatCosechaCode,
  derivarAnosMovimiento,
  derivarCosechasDisponibles,
  resolverSeleccionCosechas,
  anosCampanaDeCosechas,
  consolidarRegistrosProduccion,
  calcularKgPorArbol,
  calcularTonPorHa,
  resumirCosecha,
  compararProduccionPorLote,
  agregarCalidadPorCosecha,
  identidadFromParts,
  ordenarCosechas,
  evaluarCorteMovimiento,
  construirEvolucionSemanal,
  construirVistaEtapas,
  formatoKgEtapa,
  textoDiferenciaEtapas,
  conciliarEtapas,
  semanaIsoDeFecha,
  GAPS_PRODUCCION_ANALISIS,
  type RegistroProduccionAgregable,
} from '@/utils/calculosProduccionAnalisis';

describe('identidad y etiquetas de cosecha', () => {
  it('usa año completo en la etiqueta (Principal 2027, no Principal 27)', () => {
    expect(formatCosechaLabel(2027, 'Principal')).toBe('Principal 2027');
    expect(formatCosechaCode(2027, 'Principal')).toBe('P27');
    expect(cosechaKey('Principal', 2027)).toBe('Principal:2027');
  });

  it('ordena Principal N antes de Traviesa N antes de Principal N+1', () => {
    const ordenadas = ordenarCosechas([
      identidadFromParts('Principal', 2027),
      identidadFromParts('Traviesa', 2026),
      identidadFromParts('Principal', 2026),
    ]);
    expect(ordenadas.map((c) => c.label)).toEqual([
      'Principal 2026',
      'Traviesa 2026',
      'Principal 2027',
    ]);
  });
});

describe('años de movimiento vs campaña', () => {
  const registros = [
    { ano: 2026, cosecha_tipo: 'Principal' as const, fecha: '2025-12-02' },
    { ano: 2026, cosecha_tipo: 'Traviesa' as const, fecha: '2026-06-01' },
    { ano: 2027, cosecha_tipo: 'Principal' as const, fecha: '2026-11-02' },
  ];

  it('deriva el año desde la fecha, no desde el nombre de la campaña', () => {
    expect(derivarAnosMovimiento(registros)).toEqual([2025, 2026]);
  });

  it('no inventa un año si el registro no trae fecha', () => {
    expect(derivarAnosMovimiento([{}])).toEqual([]);
    expect(derivarAnosMovimiento([{ fecha: null }])).toEqual([]);
  });

  it('no requiere listas hardcodeadas: una cosecha nueva aparece solo por datos', () => {
    const conP28 = derivarCosechasDisponibles([
      ...registros,
      { ano: 2028, cosecha_tipo: 'Principal' as const },
    ]);
    expect(conP28.some((c) => c.label === 'Principal 2028')).toBe(true);
    expect(
      derivarAnosMovimiento([{ fecha: '2028-02-01' }]),
    ).toEqual([2028]);
  });
});

describe('resolverSeleccionCosechas', () => {
  const disponibles = derivarCosechasDisponibles([
    { ano: 2026, cosecha_tipo: 'Principal' },
    { ano: 2026, cosecha_tipo: 'Traviesa' },
    { ano: 2027, cosecha_tipo: 'Principal' },
  ]);

  it('sin filtro de año agrupa por cosecha (vista una = la más reciente)', () => {
    const res = resolverSeleccionCosechas(disponibles, {
      vista: 'una',
      cosecha_keys: [],
    });
    expect(res.estado).toBe('ok');
    if (res.estado === 'ok') {
      expect(res.cosechas).toHaveLength(1);
      expect(res.cosechas[0].label).toBe('Principal 2027');
    }
  });

  it('vista varias sin keys expone todas las cosechas (no un bucket de año)', () => {
    const res = resolverSeleccionCosechas(disponibles, {
      vista: 'varias',
      cosecha_keys: [],
    });
    expect(res.estado).toBe('ok');
    if (res.estado === 'ok') {
      expect(res.cosechas.map((c) => c.label)).toEqual([
        'Principal 2026',
        'Traviesa 2026',
        'Principal 2027',
      ]);
    }
  });

  it('vista varias permite multiselección explícita por identidad de cosecha', () => {
    const res = resolverSeleccionCosechas(disponibles, {
      vista: 'varias',
      cosecha_keys: ['Principal:2027', 'Principal:2026'],
    });
    expect(res.estado).toBe('ok');
    if (res.estado === 'ok') {
      expect(res.cosechas.map((c) => c.label)).toEqual([
        'Principal 2026',
        'Principal 2027',
      ]);
    }
  });

  it('mantiene la cosecha elegida aunque el año del nombre sea otro', () => {
    const res = resolverSeleccionCosechas(disponibles, {
      vista: 'varias',
      cosecha_keys: ['Principal:2027'],
    });
    expect(res.estado).toBe('ok');
    if (res.estado === 'ok') {
      expect(res.cosechas.map((c) => c.label)).toEqual(['Principal 2027']);
    }
  });

  it('una cosecha que no está en los datos se declara y no se sustituye', () => {
    const res = resolverSeleccionCosechas(disponibles, {
      vista: 'varias',
      cosecha_keys: ['Traviesa:2030'],
    });
    expect(res.estado).toBe('incompatible');
    if (res.estado === 'incompatible') {
      expect(res.cosechas).toHaveLength(0);
      expect(res.mensaje).toMatch(/no está en los registros/i);
      expect(res.sugeridas.map((c) => c.label)).toContain('Principal 2027');
    }
  });

  it('estado vacío cuando no hay cosechas registradas', () => {
    const res = resolverSeleccionCosechas([], {
      vista: 'varias',
      cosecha_keys: ['Principal:2027'],
    });
    expect(res.estado).toBe('vacio');
  });

  it('anosCampanaDeCosechas no confunde movimiento con campaña', () => {
    expect(
      anosCampanaDeCosechas([
        identidadFromParts('Principal', 2027),
        identidadFromParts('Traviesa', 2026),
      ]),
    ).toEqual([2026, 2027]);
  });
});

describe('proyectarInicial (cosecha-first)', () => {
  it('parte de la cosecha más reciente sin filtro de año calendario', async () => {
    const { proyectarInicial } = await import(
      '@/components/produccion/utils/proyectarFiltrosInicial'
    );
    const { FILTROS_PRODUCCION_DEFAULT } = await import('@/types/produccion');
    const disponibles = derivarCosechasDisponibles([
      { ano: 2026, cosecha_tipo: 'Principal' },
      { ano: 2027, cosecha_tipo: 'Principal' },
    ]);
    const init = proyectarInicial(FILTROS_PRODUCCION_DEFAULT, {
      cosechas: disponibles,
      anos_movimiento: [2025, 2026, 2027],
    });
    expect(init.anos_movimiento).toEqual([]);
    expect(init.cosecha_keys).toEqual(['Principal:2027']);
    expect(init.anos).toEqual([2027]);
  });
});

describe('agregaciones honestas', () => {
  it('consolida sublotes sin doble conteo cuando existe nivel lote', () => {
    const out = consolidarRegistrosProduccion([
      {
        lote_id: 'l1',
        sublote_id: null,
        ano: 2027,
        cosecha_tipo: 'Principal',
        kg_totales: 1000,
        arboles_registrados: 100,
      },
      {
        lote_id: 'l1',
        sublote_id: 's1',
        ano: 2027,
        cosecha_tipo: 'Principal',
        kg_totales: 400,
        arboles_registrados: 40,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kg_totales).toBe(1000);
  });

  it('suma sublotes cuando no hay nivel lote', () => {
    const out = consolidarRegistrosProduccion([
      {
        lote_id: 'l1',
        sublote_id: 's1',
        ano: 2027,
        cosecha_tipo: 'Principal',
        kg_totales: 400,
        arboles_registrados: 40,
      },
      {
        lote_id: 'l1',
        sublote_id: 's2',
        ano: 2027,
        cosecha_tipo: 'Principal',
        kg_totales: 600,
        arboles_registrados: 60,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kg_totales).toBe(1000);
    expect(out[0].arboles_registrados).toBe(100);
  });

  it('kg/árbol y t/ha son null sin denominador (nunca cero inventado)', () => {
    expect(calcularKgPorArbol(1000, null)).toBeNull();
    expect(calcularKgPorArbol(1000, 0)).toBeNull();
    expect(calcularKgPorArbol(1000, 100)).toBe(10);
    expect(calcularTonPorHa(2000, null)).toBeNull();
    expect(calcularTonPorHa(2000, 0)).toBeNull();
    expect(calcularTonPorHa(2000, 2)).toBe(1);
  });

  it('resumen no inventa rendimiento sin árboles/área', () => {
    const resumen = resumirCosecha(
      [
        {
          lote_id: 'l1',
          lote_nombre: 'La Vega',
          ano: 2027,
          cosecha_tipo: 'Principal',
          kg_totales: 8000,
          arboles_registrados: null,
          area_hectareas: null,
        },
      ],
      identidadFromParts('Principal', 2027),
    );
    expect(resumen.produccion_kg).toBe(8000);
    expect(resumen.kg_por_arbol).toBeNull();
    expect(resumen.ton_por_ha).toBeNull();
    expect(resumen.rendimientos_parciales).toBe(true);
  });

  it('comparación por lote marca null cuando falta una campaña (no prolonga con ceros)', () => {
    const rows = compararProduccionPorLote(
      [
        {
          lote_id: 'l1',
          lote_nombre: 'Australia',
          ano: 2027,
          cosecha_tipo: 'Principal',
          kg_totales: 5000,
          arboles_registrados: 500,
          area_hectareas: 10,
        },
        {
          lote_id: 'l2',
          lote_nombre: 'La Vega',
          ano: 2026,
          cosecha_tipo: 'Principal',
          kg_totales: 7600,
          arboles_registrados: 700,
          area_hectareas: 12,
        },
      ],
      [
        identidadFromParts('Principal', 2026),
        identidadFromParts('Principal', 2027),
      ],
    );
    const au = rows.find((r) => r.lote_nombre === 'Australia')!;
    expect(au.por_cosecha['Principal:2027']).toBe(5000);
    expect(au.por_cosecha['Principal:2026']).toBeNull();
  });

  it('calidad usa denominador explícito y no inventa % sobre sin desglose', () => {
    const puntos = agregarCalidadPorCosecha(
      [
        {
          lote_id: 'l1',
          ano: 2027,
          cosecha_tipo: 'Principal',
          kg_totales: 1000,
          arboles_registrados: 100,
          kg_exportacion: 600,
          kg_nacional: 400,
        },
        {
          lote_id: 'l2',
          ano: 2027,
          cosecha_tipo: 'Principal',
          kg_totales: 500,
          arboles_registrados: 50,
          kg_exportacion: null,
          kg_nacional: null,
        },
      ],
      [identidadFromParts('Principal', 2027)],
    );
    expect(puntos[0].kg_con_desglose).toBe(1000);
    expect(puntos[0].kg_sin_desglose).toBe(500);
    expect(puntos[0].pct_exportacion).toBe(60);
    expect(puntos[0].pct_nacional).toBe(40);
  });
});

describe('gaps documentados', () => {
  it('declara los límites de schema sin simular datos', () => {
    expect(GAPS_PRODUCCION_ANALISIS.entrada_semanal).toMatch(/semanal|fecha/i);
    expect(GAPS_PRODUCCION_ANALISIS.despachos).toMatch(/despacho|merma/i);
    expect(GAPS_PRODUCCION_ANALISIS.produccion_proxy).toMatch(/kg_totales/i);
    expect(GAPS_PRODUCCION_ANALISIS.principal_2027).toMatch(/Principal 2027/);
  });
});

function fila(parcial: Partial<RegistroProduccionAgregable> & Pick<RegistroProduccionAgregable, 'ano' | 'cosecha_tipo' | 'lote_id' | 'kg_totales'>): RegistroProduccionAgregable {
  return {
    arboles_registrados: 100,
    ...parcial,
  };
}

describe('corte por fecha de movimiento', () => {
  const p27 = identidadFromParts('Principal', 2027);
  const p26 = identidadFromParts('Principal', 2026);
  const registros = [
    fila({ lote_id: 'a', ano: 2027, cosecha_tipo: 'Principal', kg_totales: 1000, fecha: '2026-11-02' }),
    fila({ lote_id: 'a', ano: 2027, cosecha_tipo: 'Principal', kg_totales: 500, fecha: '2027-01-15' }),
    fila({ lote_id: 'b', ano: 2026, cosecha_tipo: 'Principal', kg_totales: 800, fecha: '2026-02-01' }),
  ];

  it('los registros de 2026 de Principal 2027 aparecen al filtrar 2026', () => {
    const corte = evaluarCorteMovimiento(registros, [p27], [2026]);
    expect(corte.estado).toBe('aplicado');
    expect(corte.registros).toHaveLength(1);
    expect(corte.registros[0].kg_totales).toBe(1000);
    expect(corte.corte).toBe('2026-11-02');
    expect(corte.registros.some((r) => r.ano === 2026)).toBe(false);
  });

  it('el mismo año de movimiento conserva las dos identidades por separado', () => {
    const corte = evaluarCorteMovimiento(registros, [p26, p27], [2026]);
    expect(corte.estado).toBe('aplicado');
    const claves = corte.registros.map((r) => `${r.cosecha_tipo}:${r.ano}`);
    expect(claves).toContain('Principal:2026');
    expect(claves).toContain('Principal:2027');
    expect(corte.registros.reduce((s, r) => s + r.kg_totales, 0)).toBe(1800);
  });

  it('una selección incompatible se nombra y no se sustituye por otra campaña', () => {
    const corte = evaluarCorteMovimiento(registros, [p27], [2024]);
    expect(corte.estado).toBe('incompatible');
    expect(corte.registros).toHaveLength(0);
    expect(corte.mensaje).toMatch(/Principal 2027/);
    expect(corte.mensaje).toMatch(/2024/);
  });

  it('sin fecha muestra la cosecha completa y lo dice', () => {
    const sinFecha = [
      fila({ lote_id: 'a', ano: 2027, cosecha_tipo: 'Principal', kg_totales: 4000 }),
    ];
    const corte = evaluarCorteMovimiento(sinFecha, [p27], [2026]);
    expect(corte.estado).toBe('sin_fecha');
    expect(corte.registros).toHaveLength(1);
    expect(corte.registros[0].kg_totales).toBe(4000);
    expect(corte.mensaje).toMatch(/no los recorta/i);
  });

  it('si una de varias campañas no cae en el año, se nombra y no se rellena', () => {
    const corte = evaluarCorteMovimiento(
      [
        fila({ lote_id: 'a', ano: 2026, cosecha_tipo: 'Principal', kg_totales: 800, fecha: '2025-12-02' }),
        fila({ lote_id: 'a', ano: 2027, cosecha_tipo: 'Principal', kg_totales: 1000, fecha: '2026-11-02' }),
      ],
      [p26, p27],
      [2026],
    );
    expect(corte.estado).toBe('aplicado');
    expect(corte.registros.map((r) => r.ano)).toEqual([2027]);
    expect(corte.mensaje).toMatch(/Principal 2026/);
    expect(corte.mensaje).toMatch(/no se rellena con cero/i);
  });

  it('el acumulado del filtro 2026 no incluye el tramo de 2027', () => {
    const corte = evaluarCorteMovimiento(registros, [p27], [2026]);
    const evolucion = construirEvolucionSemanal(corte.registros, [p27], 'desde_inicio');
    expect(evolucion.estado).toBe('ok');
    const serie = evolucion.series[0];
    expect(serie.corte).toBe('2026-11-02');
    const ultimo = serie.puntos[serie.puntos.length - 1];
    expect(ultimo.acumulado).toBe(1000);
    expect(serie.puntos.some((p) => p.kg === 500)).toBe(false);
  });
});

describe('evolución semanal', () => {
  it('conoce la semana ISO de una fecha fija', () => {
    expect(semanaIsoDeFecha('2026-01-01')).toMatchObject({ year: 2026, week: 1 });
    expect(semanaIsoDeFecha('2025-12-29')).toMatchObject({ year: 2026, week: 1 });
  });

  it('no rellena con cero un hueco ni una semana posterior al corte', () => {
    const cosecha = identidadFromParts('Principal', 2027);
    const evolucion = construirEvolucionSemanal(
      [
        fila({ lote_id: 'a', ano: 2027, cosecha_tipo: 'Principal', kg_totales: 100, fecha: '2026-11-02' }),
        fila({ lote_id: 'a', ano: 2027, cosecha_tipo: 'Principal', kg_totales: 40, fecha: '2026-11-16' }),
      ],
      [cosecha],
      'desde_inicio',
    );
    const puntos = evolucion.series[0].puntos;
    expect(puntos.map((p) => p.kg)).toEqual([100, null, 40]);
    expect(puntos.map((p) => p.acumulado)).toEqual([100, 100, 140]);
    expect(puntos).toHaveLength(3);
    expect(puntos.every((p) => p.kg !== 0)).toBe(true);
  });

  it('alinea por semana desde el inicio y no equipara un tramo corto con uno largo', () => {
    const corta = identidadFromParts('Principal', 2027);
    const larga = identidadFromParts('Principal', 2026);
    const evolucion = construirEvolucionSemanal(
      [
        fila({ lote_id: 'a', ano: 2027, cosecha_tipo: 'Principal', kg_totales: 10, fecha: '2026-11-02' }),
        fila({ lote_id: 'a', ano: 2026, cosecha_tipo: 'Principal', kg_totales: 20, fecha: '2025-11-03' }),
        fila({ lote_id: 'a', ano: 2026, cosecha_tipo: 'Principal', kg_totales: 30, fecha: '2025-11-24' }),
      ],
      [larga, corta],
      'desde_inicio',
    );
    expect(evolucion.comparable_totales).toBe(false);
    expect(evolucion.avance_comun).toBe(1);
    const serieCorta = evolucion.series.find((s) => s.cosecha.key === corta.key)!;
    const serieLarga = evolucion.series.find((s) => s.cosecha.key === larga.key)!;
    expect(serieCorta.puntos).toHaveLength(1);
    expect(serieLarga.puntos.length).toBeGreaterThan(serieCorta.puntos.length);
    expect(serieCorta.puntos.every((p) => p.semana_desde_inicio === 1 || p.kg !== 0)).toBe(true);
    expect(serieCorta.estado).toBe('no_registrado');
    expect(evolucion.motivo).toMatch(/no equivale/i);
  });

  it('en eje calendario una campaña no arranca con ceros antes de su fecha', () => {
    const cosecha = identidadFromParts('Traviesa', 2026);
    const evolucion = construirEvolucionSemanal(
      [
        fila({ lote_id: 'a', ano: 2026, cosecha_tipo: 'Traviesa', kg_totales: 70, fecha: '2026-06-01' }),
      ],
      [cosecha],
      'calendario',
    );
    expect(evolucion.series[0].puntos).toHaveLength(1);
    expect(evolucion.series[0].inicio).toBe('2026-06-01');
    expect(evolucion.mensaje).toMatch(/calendario/i);
  });
});

describe('denominadores y conciliación', () => {
  it('t/ha de la cosecha es null si un lote con kilo no tiene área', () => {
    const resumen = resumirCosecha(
      [
        fila({
          lote_id: 'l1',
          lote_nombre: 'Australia',
          ano: 2027,
          cosecha_tipo: 'Principal',
          kg_totales: 5000,
          arboles_registrados: 500,
          area_hectareas: 10,
        }),
        fila({
          lote_id: 'l2',
          lote_nombre: 'La Vega',
          ano: 2027,
          cosecha_tipo: 'Principal',
          kg_totales: 2000,
          arboles_registrados: 200,
          area_hectareas: null,
        }),
      ],
      identidadFromParts('Principal', 2027),
    );
    expect(resumen.produccion_kg).toBe(7000);
    expect(resumen.kg_por_arbol).toBeCloseTo(10);
    expect(resumen.ton_por_ha).toBeNull();
    expect(resumen.rendimientos_parciales).toBe(true);
  });

  it('la diferencia solo existe cuando las dos etapas existen y no es merma', () => {
    const soloEntrada = conciliarEtapas(16000, null, null);
    expect(soloEntrada.diferencia_entrada_clasificacion_kg).toBeNull();
    expect(soloEntrada.diferencia_sin_despacho_kg).toBeNull();
    expect(soloEntrada.es_merma).toBe(false);
    expect(soloEntrada.nota).toMatch(/no es merma/i);

    const completa = conciliarEtapas(16000, 15200, 14400);
    expect(completa.diferencia_entrada_clasificacion_kg).toBe(800);
    expect(completa.diferencia_sin_despacho_kg).toBe(800);
    expect(completa.es_merma).toBe(false);
    expect(completa.entrada_kg).not.toBe(
      (completa.clasificado_kg ?? 0) + (completa.despachado_kg ?? 0),
    );
    expect(completa.nota).toMatch(/canastas × 20 kg/);
  });
});

describe('etapas por lote', () => {
  const p27 = identidadFromParts('Principal', 2027);
  const p26 = identidadFromParts('Principal', 2026);
  const entradas = [
    { cosechaKey: p27.key, lote_id: 'pp', kg: 2057.95 },
    { cosechaKey: p27.key, lote_id: 'st', kg: 584.4 },
    { cosechaKey: p27.key, lote_id: 'au', kg: 5358.32 },
    { cosechaKey: p27.key, lote_id: 'lv', kg: 8202.61 },
  ];
  const etapas = [
    { ano: 2027, cosecha_tipo: 'Principal' as const, lote_id: 'pp', etapa: 'clasificado' as const, kg: 1992, fecha_corte: '2026-10-23' },
    { ano: 2027, cosecha_tipo: 'Principal' as const, lote_id: 'st', etapa: 'clasificado' as const, kg: 588, fecha_corte: '2026-10-23' },
    { ano: 2027, cosecha_tipo: 'Principal' as const, lote_id: 'au', etapa: 'clasificado' as const, kg: 5362, fecha_corte: '2026-10-23' },
    { ano: 2027, cosecha_tipo: 'Principal' as const, lote_id: 'lv', etapa: 'clasificado' as const, kg: 8178, fecha_corte: '2026-10-23' },
    { ano: 2027, cosecha_tipo: 'Principal' as const, lote_id: 'pp', etapa: 'despachado' as const, kg: 1932, fecha_corte: '2026-10-27' },
    { ano: 2027, cosecha_tipo: 'Principal' as const, lote_id: 'st', etapa: 'despachado' as const, kg: 588, fecha_corte: '2026-10-27' },
    { ano: 2027, cosecha_tipo: 'Principal' as const, lote_id: 'au', etapa: 'despachado' as const, kg: 5342, fecha_corte: '2026-10-27' },
    { ano: 2027, cosecha_tipo: 'Principal' as const, lote_id: 'lv', etapa: 'despachado' as const, kg: 8178, fecha_corte: '2026-10-27' },
  ];

  it('llena clasificado y despachado y conserva el corte de cada etapa', () => {
    const vista = construirVistaEtapas(etapas, [p27], entradas);
    const cosecha = vista.porCosecha[0];
    expect(cosecha.clasificado.kg).toBe(16120);
    expect(cosecha.despachado.kg).toBe(16040);
    expect(cosecha.clasificado.fechas_corte).toEqual(['2026-10-23']);
    expect(cosecha.despachado.fechas_corte).toEqual(['2026-10-27']);
    expect(cosecha.diferencia_entrada_clasificacion_kg).toBeCloseTo(83.28, 2);
    expect(cosecha.diferencia_sin_despacho_kg).toBe(80);
    expect(cosecha.clasificado.kg! + cosecha.despachado.kg!).not.toBe(
      entradas.reduce((s, e) => s + (e.kg ?? 0), 0),
    );
    const pp = vista.porLote.find((l) => l.lote_id === 'pp')!;
    expect(pp.clasificado_kg).toBe(1992);
    expect(pp.despachado_kg).toBe(1932);
    expect(pp.fecha_clasificado).toBe('2026-10-23');
    expect(pp.fecha_despachado).toBe('2026-10-27');
    expect(textoDiferenciaEtapas(pp.diferencia_entrada_clasificacion_kg, pp.diferencia_sin_despacho_kg)).toMatch(
      /entrada y clasificado/,
    );
  });

  it('una cosecha sin filas queda en Sin dato y no rellena con cero', () => {
    const vista = construirVistaEtapas(etapas, [p26, p27], [
      ...entradas,
      { cosechaKey: p26.key, lote_id: 'pp', kg: 4200 },
    ]);
    const vieja = vista.porCosecha.find((c) => c.cosecha.key === p26.key)!;
    expect(vieja.clasificado.kg).toBeNull();
    expect(vieja.despachado.kg).toBeNull();
    expect(vieja.diferencia_entrada_clasificacion_kg).toBeNull();
    expect(formatoKgEtapa(vieja.clasificado.kg)).toBe('Sin dato');
    const ppVieja = vista.porLote.find((l) => l.cosechaKey === p26.key && l.lote_id === 'pp')!;
    expect(ppVieja.clasificado_kg).toBeNull();
    expect(ppVieja.despachado_kg).toBeNull();
  });

  it('un lote sin etapa no se cuenta como cero y los cortes distintos se ven', () => {
    const vista = construirVistaEtapas(
      [
        { ano: 2027, cosecha_tipo: 'Principal', lote_id: 'pp', etapa: 'clasificado', kg: 100, fecha_corte: '2026-10-23' },
        { ano: 2027, cosecha_tipo: 'Principal', lote_id: 'au', etapa: 'clasificado', kg: 50, fecha_corte: '2026-10-27' },
        { ano: 2027, cosecha_tipo: 'Principal', lote_id: 'pp', etapa: 'despachado', kg: 90, fecha_corte: '2026-10-27' },
      ],
      [p27],
      [
        { cosechaKey: p27.key, lote_id: 'pp', kg: 120 },
        { cosechaKey: p27.key, lote_id: 'au', kg: 80 },
        { cosechaKey: p27.key, lote_id: 'lv', kg: 40 },
      ],
    );
    const cosecha = vista.porCosecha[0];
    expect(cosecha.clasificado.kg).toBe(150);
    expect(cosecha.clasificado.fechas_corte).toEqual(['2026-10-23', '2026-10-27']);
    expect(cosecha.despachado.kg).toBe(90);
    const lv = vista.porLote.find((l) => l.lote_id === 'lv')!;
    expect(lv.clasificado_kg).toBeNull();
    expect(lv.despachado_kg).toBeNull();
    expect(lv.diferencia_entrada_clasificacion_kg).toBeNull();
    const au = vista.porLote.find((l) => l.lote_id === 'au')!;
    expect(au.fecha_clasificado).toBe('2026-10-27');
    expect(au.despachado_kg).toBeNull();
    expect(au.diferencia_sin_despacho_kg).toBeNull();
  });
});
