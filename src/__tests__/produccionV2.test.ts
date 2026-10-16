import { describe, expect, it } from 'vitest';
import {
  agregarVacas,
  borradorQuincenaConDatos,
  cargasAMedias,
  etiquetaDiaPesaje,
  filasCompararVacas,
  filasHistorialSubidas,
  fotoDeQuincena,
  inicioMesesAtras,
  pendientesCarga,
  rangoAnteriorProduccion,
  rangoPeriodoProduccion,
  rankingVacasPeriodo,
  resumirPesadoPeriodo,
  resumirVentasPeriodo,
  semanasPesajeDelMes,
  topYBottom,
  ultimasQuincenasCerradas,
  variacionContraAnterior,
  type QuincenaVenta,
} from '@/utils/hato/produccionV2';

describe('rangoPeriodoProduccion — último período cerrado; año = enero a hoy', () => {
  it('quincena: antes del 16 es la 2ª del mes anterior', () => {
    expect(rangoPeriodoProduccion('quincena', '2026-10-10')).toEqual({ desde: '2026-09-16', hasta: '2026-09-30' });
  });
  it('quincena: desde el 16 es la 1ª del mes', () => {
    expect(rangoPeriodoProduccion('quincena', '2026-10-16')).toEqual({ desde: '2026-10-01', hasta: '2026-10-15' });
  });
  it('mes: el mes anterior completo, cruza el año', () => {
    expect(rangoPeriodoProduccion('mes', '2026-01-05')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
  });
  it('trimestre: el trimestre calendario anterior', () => {
    expect(rangoPeriodoProduccion('trimestre', '2026-10-16')).toEqual({ desde: '2026-07-01', hasta: '2026-09-30' });
    expect(rangoPeriodoProduccion('trimestre', '2026-02-01')).toEqual({ desde: '2025-10-01', hasta: '2025-12-31' });
  });
  it('año: 1 de enero a hoy, nunca 12 meses', () => {
    expect(rangoPeriodoProduccion('anio', '2026-10-16')).toEqual({ desde: '2026-01-01', hasta: '2026-10-16' });
  });
});

describe('rangoAnteriorProduccion', () => {
  it('quincena 1 → 2ª del mes anterior; quincena 2 → 1ª del mismo mes', () => {
    expect(rangoAnteriorProduccion('quincena', { desde: '2026-10-01', hasta: '2026-10-15' })).toEqual({ desde: '2026-09-16', hasta: '2026-09-30' });
    expect(rangoAnteriorProduccion('quincena', { desde: '2026-09-16', hasta: '2026-09-30' })).toEqual({ desde: '2026-09-01', hasta: '2026-09-15' });
  });
  it('trimestre cruza el año', () => {
    expect(rangoAnteriorProduccion('trimestre', { desde: '2026-01-01', hasta: '2026-03-31' })).toEqual({ desde: '2025-10-01', hasta: '2025-12-31' });
  });
  it('año: mismo tramo del año pasado; el 29 de febrero cae al 28', () => {
    expect(rangoAnteriorProduccion('anio', { desde: '2028-01-01', hasta: '2028-02-29' })).toEqual({ desde: '2027-01-01', hasta: '2027-02-28' });
  });
});

describe('variacionContraAnterior', () => {
  it('sin anterior o anterior en 0 no hay variación', () => {
    expect(variacionContraAnterior(10, null).variacion).toBeNull();
    expect(variacionContraAnterior(10, 0).variacion).toBeNull();
    expect(variacionContraAnterior(null, 10).variacion).toBeNull();
  });
  it('calcula la variación relativa', () => {
    expect(variacionContraAnterior(110, 100).variacion).toBeCloseTo(0.1);
  });
});

const q = (anio: number, mes: number, quincena: 1 | 2, litros: number | null, vacas: number | null): QuincenaVenta => ({
  anio,
  mes,
  quincena,
  fecha_inicio: null,
  fecha_fin: null,
  litros_total: litros,
  num_vacas_ordeno: vacas,
});

describe('resumirVentasPeriodo — dato real', () => {
  const rango = { desde: '2026-09-01', hasta: '2026-09-30' };
  it('suma litros y litros por vaca solo de las quincenas del rango', () => {
    const r = resumirVentasPeriodo([q(2026, 9, 1, 6000, 30), q(2026, 9, 2, 6000, 20), q(2026, 8, 2, 9999, 10)], null, rango);
    expect(r.litrosVendidos).toBe(12000);
    expect(r.litrosPorVaca).toBe(200 + 300);
    expect(r.barras.map((b) => b.etiqueta)).toEqual(['1ª sep', '2ª sep']);
  });
  it('una quincena sin vacas deja el L/vaca en null, nunca una suma parcial', () => {
    const r = resumirVentasPeriodo([q(2026, 9, 1, 6000, 30), q(2026, 9, 2, 6000, null)], null, rango);
    expect(r.litrosVendidos).toBe(12000);
    expect(r.litrosPorVaca).toBeNull();
    expect(r.quincenasSinVacas).toBe(1);
  });
  it('sin datos es null, nunca 0', () => {
    const r = resumirVentasPeriodo([q(2026, 9, 1, null, null)], null, rango);
    expect(r.litrosVendidos).toBeNull();
    expect(r.litrosPorVaca).toBeNull();
    expect(r.ingreso).toBeNull();
    expect(r.barras.every((b) => b.litros == null)).toBe(true);
  });
  it('ingreso y reparto filtrados por fecha', () => {
    const r = resumirVentasPeriodo([], [
      { categoriaNombre: 'Venta de Leche', valor: 1000, cantidad: 10, fecha: '2026-09-15' },
      { categoriaNombre: 'Venta de terneros', valor: 500, cantidad: 1, fecha: '2026-09-20' },
      { categoriaNombre: 'Venta de Leche', valor: 7000, cantidad: 10, fecha: '2026-08-15' },
    ], rango);
    expect(r.ingreso).toBe(1500);
    expect(r.reparto?.leche.valor).toBe(1000);
    expect(r.reparto?.terneros.valor).toBe(500);
  });
});

describe('producción pesada — aproximado', () => {
  const pesajes = [
    { animal_id: 'a', fecha: '2026-09-02', litros_total: 20, litros_am: 10, litros_pm: 10 },
    { animal_id: 'b', fecha: '2026-09-02', litros_total: 10, litros_am: 5, litros_pm: 5 },
    { animal_id: 'a', fecha: '2026-09-09', litros_total: 18, litros_am: 9, litros_pm: 9 },
    // Turno incompleto: no entra.
    { animal_id: 'b', fecha: '2026-09-09', litros_total: 4, litros_am: 4, litros_pm: null },
  ];
  const rango = { desde: '2026-09-01', hasta: '2026-09-30' };

  it('litros del hato al día = promedio de las fechas de pesaje', () => {
    const r = resumirPesadoPeriodo(pesajes, rango);
    expect(r.nPesajes).toBe(2);
    expect(r.litrosHatoDia).toBe((30 + 18) / 2);
    expect(r.litrosPorVaca).toBe(48 / 3);
    expect(r.vacasPesadas).toBe(2);
    // Línea por vaca: litros del día ÷ vacas pesadas ese día.
    expect(r.barras.map((b) => b.litrosPorVaca)).toEqual([15, 18]);
  });

  it('ranking con semanas desde el último parto ANTERIOR al último pesaje', () => {
    const partos = new Map([['a', ['2026-07-01', '2026-10-01']]]);
    const r = rankingVacasPeriodo(pesajes, rango, partos);
    expect(r.map((v) => v.animalId)).toEqual(['a', 'b']);
    expect(r[0].litros).toBe(19);
    // 2026-07-01 → 2026-09-09 = 70 días = 10 semanas. El parto de octubre no cuenta.
    expect(r[0].semanasDesdeParto).toBe(10);
    expect(r[1].semanasDesdeParto).toBeNull();
  });

  it('top y bottom nunca repiten vaca', () => {
    const ranking = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => ({ animalId: id, litros: 10 - i, semanasDesdeParto: null }));
    const { top, bottom } = topYBottom(ranking);
    expect(top.map((v) => v.animalId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(bottom.map((v) => v.animalId)).toEqual(['g', 'f']);
  });

  it('comparar vacas: una fecha sin pesaje no tiene clave (hueco, nunca 0)', () => {
    const filas = filasCompararVacas(pesajes, ['a', 'b'], rango);
    expect(filas).toEqual([
      { fecha: '2026-09-02', a: 20, b: 10 },
      { fecha: '2026-09-09', a: 18 },
    ]);
  });

  it('agregarVacas respeta el máximo y no repite', () => {
    expect(agregarVacas(['a'], ['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });
});

describe('Cargas', () => {
  it('ultimasQuincenasCerradas', () => {
    expect(ultimasQuincenasCerradas('2026-10-16')).toEqual([
      { anio: 2026, mes: 10, quincena: 1 },
      { anio: 2026, mes: 9, quincena: 2 },
    ]);
  });

  it('semanasPesajeDelMes marca cargado / falta / próximo y la fuente dominante', () => {
    const semanas = semanasPesajeDelMes(
      ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'],
      [
        { animal_id: 'a', fecha: '2026-10-01', fuente: 'telegram' },
        { animal_id: 'b', fecha: '2026-10-01', fuente: 'telegram' },
        { animal_id: 'c', fecha: '2026-10-01', fuente: 'foto' },
        { animal_id: 'a', fecha: '2026-10-08', fuente: 'web' },
      ],
      '2026-10-16',
    );
    expect(semanas.map((s) => s.estado)).toEqual(['cargado', 'cargado', 'falta', 'proximo']);
    expect(semanas[0]).toMatchObject({ nVacas: 3, fuente: 'telegram' });
  });

  it('pendientesCarga: quincena sin liquidación y miércoles pasado sin pesaje', () => {
    const p = pendientesCarga({
      hoy: '2026-10-16',
      quincenasCargadas: [{ anio: 2026, mes: 9, quincena: 2, num_vacas_ordeno: 30 }],
      fechasPesajeMesActual: ['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28'],
      fechasPesajeMesAnterior: ['2026-09-30'],
      fechasConPesaje: new Set(['2026-10-07']),
    });
    expect(p.map((x) => x.texto)).toEqual(['Liquidación · 1ª quincena oct', 'Pesaje · mié 14 oct']);
  });

  it('etiquetaDiaPesaje', () => {
    expect(etiquetaDiaPesaje('2026-10-07')).toBe('Mié 7 oct');
  });

  it('fotoDeQuincena liga la foto más cercana antes del guardado, dentro de 36 h', () => {
    const fotos = [
      { capturaId: 'vieja', bucket: 'b', ruta: 'r1', creadoEn: '2026-09-01T10:00:00Z' },
      { capturaId: 'buena', bucket: 'b', ruta: 'r2', creadoEn: '2026-09-20T10:00:00Z' },
      { capturaId: 'despues', bucket: 'b', ruta: 'r3', creadoEn: '2026-09-20T12:00:00Z' },
    ];
    expect(fotoDeQuincena('2026-09-20T11:00:00Z', fotos)?.capturaId).toBe('buena');
    expect(fotoDeQuincena('2026-09-10T11:00:00Z', fotos)).toBeNull();
    expect(fotoDeQuincena(null, fotos)).toBeNull();
  });

  it('filasHistorialSubidas mezcla quincenas y pesajes, de la más nueva a la más vieja', () => {
    const filas = filasHistorialSubidas({
      quincenas: [{ ...q(2026, 9, 2, 6000, 30), id: 'q1', updated_at: null, valor: 9_000_000 }],
      pesajes: [
        { animal_id: 'a', fecha: '2026-10-07', litros_total: 20, fuente: 'telegram' },
        { animal_id: 'b', fecha: '2026-10-07', litros_total: 10, fuente: 'telegram' },
        { animal_id: 'a', fecha: '2026-06-01', litros_total: 10 },
      ],
      fotosLiquidacion: [],
      fotoPesajePorFecha: new Map(),
      desde: '2026-08-01',
    });
    expect(filas.map((f) => [f.tipo, f.etiqueta, f.litros])).toEqual([
      ['pesaje', 'Pesaje mié 7', 30],
      ['quincena', '2ª quincena', 6000],
    ]);
    expect(filas[0].fuente).toBe('telegram');
  });

  it('inicioMesesAtras', () => {
    expect(inicioMesesAtras('2026-02-16', 3)).toBe('2025-12-01');
  });

  it('pendientesCarga: quincena guardada sin número de vacas pide completarlo', () => {
    const p = pendientesCarga({
      hoy: '2026-10-16',
      quincenasCargadas: [
        { anio: 2026, mes: 10, quincena: 1, num_vacas_ordeno: null },
        { anio: 2026, mes: 9, quincena: 2, num_vacas_ordeno: 26 },
        { anio: 2026, mes: 9, quincena: 1, num_vacas_ordeno: null },
      ],
      fechasPesajeMesActual: [],
      fechasPesajeMesAnterior: [],
      fechasConPesaje: new Set(),
    });
    expect(p.map((x) => [x.tipo, x.texto])).toEqual([
      ['vacas', 'Vacas en ordeño · 1ª quincena oct'],
      ['vacas', 'Vacas en ordeño · 1ª quincena sep'],
    ]);
  });

  it('pendientesCarga: la 3ª quincena sin liquidación ya no se pide', () => {
    const p = pendientesCarga({
      hoy: '2026-10-16',
      quincenasCargadas: [
        { anio: 2026, mes: 10, quincena: 1, num_vacas_ordeno: 20 },
        { anio: 2026, mes: 9, quincena: 2, num_vacas_ordeno: 20 },
      ],
      fechasPesajeMesActual: [],
      fechasPesajeMesAnterior: [],
      fechasConPesaje: new Set(),
    });
    expect(p).toEqual([]);
  });

  it('cargasAMedias: foto de liquidación sin quincena guardada después', () => {
    const foto = (id: string, creadoEn: string) => ({ capturaId: id, bucket: 'b', ruta: id, creadoEn });
    const p = cargasAMedias({
      hoy: '2026-10-16',
      fotosLiquidacion: [
        foto('guardada', '2026-10-01T10:00:00Z'),
        foto('martha', '2026-10-15T20:00:00Z'),
        foto('vieja', '2026-08-01T10:00:00Z'),
      ],
      guardadosQuincena: ['2026-10-01T10:30:00Z', null],
      pesajesSinFilas: [],
    });
    expect(p.map((x) => [x.tipo, x.clave])).toEqual([['liquidacion_a_medias', 'martha']]);
    expect(p[0].foto?.capturaId).toBe('martha');
  });

  it('cargasAMedias: un guardado ANTERIOR a la foto no la cierra', () => {
    const p = cargasAMedias({
      hoy: '2026-10-16',
      fotosLiquidacion: [{ capturaId: 'x', bucket: 'b', ruta: 'r', creadoEn: '2026-10-15T20:00:00Z' }],
      guardadosQuincena: ['2026-10-15T19:00:00Z'],
      pesajesSinFilas: [],
    });
    expect(p).toHaveLength(1);
  });

  it('cargasAMedias: planilla de pesaje sin litros lleva su mes', () => {
    const p = cargasAMedias({
      hoy: '2026-10-16',
      fotosLiquidacion: [],
      guardadosQuincena: [],
      pesajesSinFilas: [{ capturaId: 'p', bucket: 'b', ruta: 'r', creadoEn: '2026-10-08T15:00:00Z', anio: 2026, mes: 10 }],
    });
    expect(p[0]).toMatchObject({ tipo: 'pesaje_a_medias', anio: 2026, mes: 10 });
    expect(p[0].texto).toContain('oct');
  });

  it('borradorQuincenaConDatos: sin datos no guarda borrador; con vacas o litros sí', () => {
    const base = {
      anio: 2026, mes: 10, quincena: 1 as const, litrosTotal: undefined, litrosPomar: undefined,
      numVacasOrdeno: undefined, notas: '  ', fechaIngreso: '2026-10-16', valorBruto: undefined,
      regionId: '', medioPagoId: '', compradorId: '',
    };
    expect(borradorQuincenaConDatos(base)).toBeNull();
    expect(borradorQuincenaConDatos({ ...base, litrosTotal: 5000 })).toMatchObject({ litrosTotal: 5000, numVacasOrdeno: null });
    expect(borradorQuincenaConDatos({ ...base, numVacasOrdeno: 26 })?.numVacasOrdeno).toBe(26);
  });
});
