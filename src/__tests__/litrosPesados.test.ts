import { describe, expect, it } from 'vitest';
import { proyeccionVacasCongeladas, type PesajeLecheVaca } from '@/utils/hatoProduccion';
import {
  DIAS_PERIODO_LITROS,
  MAX_VACAS_COMPARADAS,
  alternarVacaSeleccionada,
  cambioContraPeriodoAnterior,
  filasGraficoVacas,
  largoInclusivo,
  offsetSemanaDesdeAncla,
  periodoAnteriorIgual,
  rangoPeriodoLitrosPesados,
  resumirLitrosPesados,
  serieHato,
  totalLitrosMedidos,
  totalMedidoVacas,
  turnoIncompleto,
  type PeriodoLitrosFijo,
  type PesajeLitros,
} from '@/utils/hato/litrosPesados';

const ANCLA = '2026-10-15';

function pesaje(parcial: Partial<PesajeLitros> & Pick<PesajeLitros, 'animal_id' | 'fecha' | 'litros_total'>): PesajeLitros {
  return { litros_am: 1, litros_pm: 1, ...parcial };
}

describe('ventana de litros pesados', () => {
  const fijos = Object.keys(DIAS_PERIODO_LITROS) as PeriodoLitrosFijo[];

  it.each(fijos)('%s termina en el ancla y el período anterior tiene el mismo largo', (periodo) => {
    const rango = rangoPeriodoLitrosPesados(periodo, ANCLA);
    expect(rango).not.toBeNull();
    if (!rango) return;
    expect(rango.hasta).toBe(ANCLA);
    expect(largoInclusivo(rango)).toBe(DIAS_PERIODO_LITROS[periodo]);
    const anterior = periodoAnteriorIgual(rango);
    expect(largoInclusivo(anterior)).toBe(largoInclusivo(rango));
    expect(anterior.hasta < rango.desde).toBe(true);
    expect(anterior.desde <= anterior.hasta).toBe(true);
  });

  it('quincena de 15 días: del 1 al 15 de octubre, anterior del 16 al 30 de septiembre', () => {
    const rango = rangoPeriodoLitrosPesados('quincena', ANCLA);
    expect(rango).toEqual({ desde: '2026-10-01', hasta: '2026-10-15' });
    expect(periodoAnteriorIgual(rango!)).toEqual({ desde: '2026-09-16', hasta: '2026-09-30' });
  });

  it('personalizado respeta desde/hasta y rechaza un rango invertido', () => {
    expect(rangoPeriodoLitrosPesados('personalizado', ANCLA, { desde: '2026-03-01', hasta: '2026-03-20' })).toEqual({
      desde: '2026-03-01',
      hasta: '2026-03-20',
    });
    expect(largoInclusivo(periodoAnteriorIgual({ desde: '2026-03-01', hasta: '2026-03-20' }))).toBe(20);
    expect(rangoPeriodoLitrosPesados('personalizado', ANCLA, { desde: '2026-03-20', hasta: '2026-03-01' })).toBeNull();
    expect(rangoPeriodoLitrosPesados('personalizado', ANCLA, { desde: '', hasta: '2026-03-01' })).toBeNull();
  });
});

describe('agregación por vaca y por fecha', () => {
  const pesajes: PesajeLitros[] = [
    pesaje({ animal_id: 'a', fecha: '2026-10-01', litros_total: 10, litros_am: 6, litros_pm: 4 }),
    pesaje({ animal_id: 'b', fecha: '2026-10-01', litros_total: 8, litros_am: 8, litros_pm: null }),
    pesaje({ animal_id: 'a', fecha: '2026-10-08', litros_total: 12, litros_am: 7, litros_pm: 5 }),
    pesaje({ animal_id: 'c', fecha: '2026-10-08', litros_total: 9, litros_am: null, litros_pm: null }),
    pesaje({ animal_id: 'a', fecha: '2026-09-01', litros_total: 99, litros_am: 50, litros_pm: 49 }),
  ];

  it('un punto por fecha, el turno incompleto fuera, la jornada histórica dentro', () => {
    const resumen = resumirLitrosPesados(pesajes, { desde: '2026-10-01', hasta: '2026-10-15' });
    expect(resumen.puntos.map((p) => p.fecha)).toEqual(['2026-10-01', '2026-10-08']);
    expect(resumen.puntos[0].litros).toBe(10);
    expect(resumen.puntos[0].vacas).toEqual(['a']);
    expect(resumen.puntos[1].litros).toBe(21);
    expect(resumen.puntos[1].vacas.sort()).toEqual(['a', 'c']);
    expect(resumen.totalLitros).toBe(31);
    expect(resumen.vacasPesadas).toBe(2);
    expect(resumen.nPesajes).toBe(3);
    expect(resumen.litrosPorVaca).toBeCloseTo(31 / 3, 10);
    expect(resumen.nIncompletos).toBe(1);
  });

  it('dos filas de la misma vaca el mismo día se promedian, no se suman', () => {
    const resumen = resumirLitrosPesados(
      [
        pesaje({ animal_id: 'a', fecha: '2026-10-01', litros_total: 10 }),
        pesaje({ animal_id: 'a', fecha: '2026-10-01', litros_total: 20 }),
      ],
      { desde: '2026-10-01', hasta: '2026-10-01' },
    );
    expect(resumen.totalLitros).toBe(15);
    expect(resumen.nPesajes).toBe(1);
    expect(resumen.vacasPesadas).toBe(1);
  });

  it('sin pesajes completos el total es null, no 0', () => {
    const resumen = resumirLitrosPesados(
      [pesaje({ animal_id: 'b', fecha: '2026-10-01', litros_total: 8, litros_am: 8, litros_pm: null })],
      { desde: '2026-10-01', hasta: '2026-10-15' },
    );
    expect(resumen.totalLitros).toBeNull();
    expect(resumen.litrosPorVaca).toBeNull();
    expect(resumen.nIncompletos).toBe(1);
  });
});

describe('cambio contra el período anterior', () => {
  it('compara totales del mismo largo', () => {
    const actual = resumirLitrosPesados(
      [pesaje({ animal_id: 'a', fecha: '2026-10-08', litros_total: 30 })],
      { desde: '2026-10-01', hasta: '2026-10-15' },
    );
    const anterior = resumirLitrosPesados(
      [pesaje({ animal_id: 'a', fecha: '2026-09-24', litros_total: 20 })],
      periodoAnteriorIgual({ desde: '2026-10-01', hasta: '2026-10-15' }),
    );
    const cambio = cambioContraPeriodoAnterior(actual.totalLitros, anterior.totalLitros);
    expect(cambio.variacion).toBeCloseTo(0.5, 10);
    expect(cambio.diferencia).toBe(10);
  });

  it('sin pesajes anteriores no fabrica un porcentaje', () => {
    expect(cambioContraPeriodoAnterior(30, null)).toEqual({ variacion: null, diferencia: null });
    expect(cambioContraPeriodoAnterior(null, 20)).toEqual({ variacion: null, diferencia: null });
  });

  it('anterior en 0 no divide', () => {
    expect(cambioContraPeriodoAnterior(10, 0)).toEqual({ variacion: null, diferencia: 10 });
  });
});

describe('la proyección no entra en el total', () => {
  const medidos: PesajeLecheVaca[] = [
    { animal_id: 'a', fecha: '2026-09-24', litros_total: 10, litros_am: 5, litros_pm: 5 },
    { animal_id: 'a', fecha: '2026-10-01', litros_total: 12, litros_am: 6, litros_pm: 6 },
    { animal_id: 'a', fecha: '2026-10-08', litros_total: 14, litros_am: 7, litros_pm: 7 },
    { animal_id: 'a', fecha: '2026-10-15', litros_total: 16, litros_am: 8, litros_pm: 8 },
  ];

  it('serieHato suma solo lo medido', () => {
    const rango = { desde: '2026-09-01', hasta: '2026-10-15' };
    const resumen = resumirLitrosPesados(medidos, rango);
    const proyecciones = proyeccionVacasCongeladas({
      pesajes: medidos,
      fechaReferencia: '2026-10-15',
      semanasTendencia: 4,
    });
    const serie = serieHato(resumen, proyecciones, '2026-10-15', true);
    expect(serie.filter((p) => p.tipo === 'proyectado')).toHaveLength(2);
    expect(serie.filter((p) => p.tipo === 'proyectado').every((p) => (p.litros ?? 0) > 0)).toBe(true);
    expect(totalLitrosMedidos(serie)).toBe(resumen.totalLitros);
    const proyectado = serie.filter((p) => p.tipo === 'proyectado').reduce((acc, p) => acc + (p.litros ?? 0), 0);
    expect(totalLitrosMedidos(serie)).not.toBeCloseTo((resumen.totalLitros ?? 0) + proyectado, 5);
  });

  it('por vaca: la línea punteada y su semilla no se suman', () => {
    const rango = { desde: '2026-09-01', hasta: '2026-10-15' };
    const proyecciones = proyeccionVacasCongeladas({
      pesajes: medidos,
      fechaReferencia: '2026-10-15',
      semanasTendencia: 4,
    });
    const filas = filasGraficoVacas(medidos, ['a', 'ausente'], rango, proyecciones, '2026-10-15', true);
    const proyectadas = filas.filter((f) => f.tipo === 'proyectado');
    expect(proyectadas).toHaveLength(2);
    expect(proyectadas.every((f) => f.proyectados.a != null && f.proyectados.ausente == null)).toBe(true);
    const medida = filas.find((f) => f.fecha === '2026-10-15');
    expect(medida?.proyectados.a).toBe(medida?.medidos.a);
    expect(totalMedidoVacas(filas)).toBe(resumirLitrosPesados(medidos, rango).totalLitros);
  });

  it('un turno incompleto no alimenta la proyección', () => {
    const soloTarde: PesajeLitros = {
      animal_id: 'b',
      fecha: '2026-10-15',
      litros_total: 40,
      litros_am: null,
      litros_pm: 40,
    };
    expect(turnoIncompleto(soloTarde)).toBe(true);
    const pesajes = [...medidos, soloTarde];
    const completos = pesajes.filter((p) => !turnoIncompleto(p));
    const proyecciones = proyeccionVacasCongeladas({
      pesajes: completos,
      fechaReferencia: '2026-10-15',
      semanasTendencia: 4,
    });
    expect(proyecciones.map((v) => v.animalId)).toEqual(['a']);
  });
});

describe('detalle y tope de vacas', () => {
  it('la fecha del ancla abre la semana 0 y la de hace 7 días la semana −1', () => {
    expect(offsetSemanaDesdeAncla(ANCLA, ANCLA)).toBe(0);
    expect(offsetSemanaDesdeAncla(ANCLA, '2026-10-08')).toBe(-1);
    expect(offsetSemanaDesdeAncla(ANCLA, '2026-10-09')).toBe(0);
  });

  it('no pasa de 8 vacas y sí permite quitar', () => {
    let seleccion: string[] = [];
    for (let i = 0; i < 10; i++) seleccion = alternarVacaSeleccionada(seleccion, `v${i}`);
    expect(seleccion).toHaveLength(MAX_VACAS_COMPARADAS);
    expect(seleccion).not.toContain('v8');
    expect(alternarVacaSeleccionada(seleccion, 'v0')).not.toContain('v0');
  });
});
