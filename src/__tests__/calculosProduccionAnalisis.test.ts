import { describe, it, expect } from 'vitest';
import {
  cosechaKey,
  formatCosechaLabel,
  formatCosechaCode,
  derivarAnosMovimiento,
  derivarCosechasDisponibles,
  cosechasAsociadasAAnoMovimiento,
  cosechasCompatiblesConAnos,
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
  GAPS_PRODUCCION_ANALISIS,
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
    { ano: 2026, cosecha_tipo: 'Principal' as const },
    { ano: 2026, cosecha_tipo: 'Traviesa' as const },
    { ano: 2027, cosecha_tipo: 'Principal' as const },
  ];

  it('deriva años de movimiento incluyendo N-1 para Principal', () => {
    expect(derivarAnosMovimiento(registros)).toEqual([2025, 2026, 2027]);
  });

  it('asocia Principal 2027 al año de movimiento 2026', () => {
    const asociadas = cosechasAsociadasAAnoMovimiento(2026).map((c) => c.label);
    expect(asociadas).toEqual(['Principal 2026', 'Traviesa 2026', 'Principal 2027']);
  });

  it('filtra cosechas disponibles compatibles con 2026 sin excluir Principal 2027', () => {
    const disponibles = derivarCosechasDisponibles(registros);
    const compatibles = cosechasCompatiblesConAnos(disponibles, [2026]);
    expect(compatibles.map((c) => c.label)).toEqual([
      'Principal 2026',
      'Traviesa 2026',
      'Principal 2027',
    ]);
  });

  it('no requiere listas hardcodeadas: un año nuevo aparece solo por datos', () => {
    const conP28 = derivarCosechasDisponibles([
      ...registros,
      { ano: 2028, cosecha_tipo: 'Principal' as const },
    ]);
    expect(conP28.some((c) => c.label === 'Principal 2028')).toBe(true);
    expect(derivarAnosMovimiento([{ ano: 2028, cosecha_tipo: 'Principal' }])).toEqual([
      2027, 2028,
    ]);
  });
});

describe('resolverSeleccionCosechas', () => {
  const disponibles = derivarCosechasDisponibles([
    { ano: 2026, cosecha_tipo: 'Principal' },
    { ano: 2026, cosecha_tipo: 'Traviesa' },
    { ano: 2027, cosecha_tipo: 'Principal' },
  ]);

  it('vista una toma una sola cosecha (la más reciente compatible)', () => {
    const res = resolverSeleccionCosechas(disponibles, {
      vista: 'una',
      anos_movimiento: [2026],
      cosecha_keys: [],
    });
    expect(res.estado).toBe('ok');
    if (res.estado === 'ok') {
      expect(res.cosechas).toHaveLength(1);
      expect(res.cosechas[0].label).toBe('Principal 2027');
    }
  });

  it('vista varias permite multiselección explícita', () => {
    const res = resolverSeleccionCosechas(disponibles, {
      vista: 'varias',
      anos_movimiento: [2026],
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

  it('reporta incompatibilidad en vez de ocultar en silencio', () => {
    // 2027 admite Principal 2027; Traviesa 2026 no es compatible con ese año.
    const res = resolverSeleccionCosechas(disponibles, {
      vista: 'varias',
      anos_movimiento: [2027],
      cosecha_keys: ['Traviesa:2026'],
    });
    expect(res.estado).toBe('incompatible');
    if (res.estado === 'incompatible') {
      expect(res.cosechas).toHaveLength(0);
      expect(res.mensaje).toMatch(/no corresponde/i);
      expect(res.sugeridas.map((c) => c.label)).toContain('Principal 2027');
    }
  });

  it('estado vacío cuando el año no tiene cosechas en datos', () => {
    const res = resolverSeleccionCosechas(disponibles, {
      vista: 'varias',
      anos_movimiento: [2024],
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
    expect(GAPS_PRODUCCION_ANALISIS.entrada_semanal).toMatch(/semanal/i);
    expect(GAPS_PRODUCCION_ANALISIS.despachos).toMatch(/despacho/i);
    expect(GAPS_PRODUCCION_ANALISIS.produccion_proxy).toMatch(/kg_totales/i);
  });
});
