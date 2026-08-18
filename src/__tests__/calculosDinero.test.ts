// ARCHIVO: __tests__/calculosDinero.test.ts
// DESCRIPCIÓN: Lógica PURA del bloque "Dinero" del Centro de Control
// (`docs/plan_dashboard_centro_control.md` §4 Bloque 5 / §9.2). Sin
// Supabase -- el I/O vive en `useDinero.ts`, que sólo llama a estas
// funciones. Casos reales de producción usados como fixtures: agosto 2026
// $66.529.769 confirmado, julio $144.838.926, gasto del año Aguacate
// $524,9M / Oficina Central $359,7M, agosto SIN ningún ingreso registrado.

import { describe, it, expect } from 'vitest';
import {
  agregarGastoDinero,
  calcularVariacionGasto,
  calcularEjecucionPresupuesto,
  topNegocios,
  quincenasFaltantes,
  rangoValorQuincenas,
  etiquetaQuincena,
  nombreMes,
  type FilaGastoDinero,
} from '@/utils/calculosDinero';

describe('nombreMes', () => {
  it('mapea 1-12 a los nombres en español', () => {
    expect(nombreMes(1)).toBe('enero');
    expect(nombreMes(8)).toBe('agosto');
    expect(nombreMes(12)).toBe('diciembre');
  });
});

describe('agregarGastoDinero', () => {
  const filas: FilaGastoDinero[] = [
    { valor: 66_529_769, fecha: '2026-08-15', negocioNombre: 'Aguacate Hass' },
    { valor: 144_838_926, fecha: '2026-07-20', negocioNombre: 'Aguacate Hass' },
    { valor: 300_000_000, fecha: '2026-03-01', negocioNombre: 'Aguacate Hass' },
    { valor: 359_700_000, fecha: '2026-02-10', negocioNombre: 'Oficina Central' },
  ];

  it('separa gasto del mes actual, del mes anterior, y el acumulado del año', () => {
    const r = agregarGastoDinero(filas, '2026-08-17');
    expect(r.gastoMesActual).toBe(66_529_769);
    expect(r.gastoMesAnterior).toBe(144_838_926);
    expect(r.gastoAcumuladoAnio).toBe(66_529_769 + 144_838_926 + 300_000_000 + 359_700_000);
  });

  it('agrupa el acumulado del año por negocio', () => {
    const r = agregarGastoDinero(filas, '2026-08-17');
    const aguacate = r.porNegocioAnio.find((n) => n.nombre === 'Aguacate Hass');
    const oficina = r.porNegocioAnio.find((n) => n.nombre === 'Oficina Central');
    expect(aguacate?.total).toBe(66_529_769 + 144_838_926 + 300_000_000);
    expect(oficina?.total).toBe(359_700_000);
  });

  it('una fila sin negocio resuelto (RLS/embed vacío) se agrupa bajo "Sin negocio", nunca se pierde', () => {
    const r = agregarGastoDinero(
      [{ valor: 1000, fecha: '2026-08-01', negocioNombre: null }],
      '2026-08-17',
    );
    expect(r.porNegocioAnio).toEqual([{ nombre: 'Sin negocio', total: 1000 }]);
  });

  it('enero: el mes anterior (diciembre) cae en el año calendario previo y se sigue contando', () => {
    const filasEnero: FilaGastoDinero[] = [
      { valor: 10_000_000, fecha: '2026-01-10', negocioNombre: 'Aguacate Hass' },
      { valor: 8_000_000, fecha: '2025-12-20', negocioNombre: 'Aguacate Hass' },
    ];
    const r = agregarGastoDinero(filasEnero, '2026-01-15');
    expect(r.gastoMesActual).toBe(10_000_000);
    expect(r.gastoMesAnterior).toBe(8_000_000);
    // El acumulado del año 2026 NO incluye el gasto de diciembre 2025.
    expect(r.gastoAcumuladoAnio).toBe(10_000_000);
  });

  it('sin filas, todo en cero -- nunca undefined ni NaN', () => {
    const r = agregarGastoDinero([], '2026-08-17');
    expect(r).toEqual({ gastoMesActual: 0, gastoMesAnterior: 0, gastoAcumuladoAnio: 0, porNegocioAnio: [] });
  });
});

describe('calcularVariacionGasto', () => {
  it('caso real: agosto 66,5M contra julio 144,8M -- una baja del 54%, favorable (verde)', () => {
    const v = calcularVariacionGasto(66_529_769, 144_838_926);
    expect(v).not.toBeNull();
    expect(v!.pct).toBe(-54);
    expect(v!.favorable).toBe(true);
  });

  it('un aumento de gasto es DESFAVORABLE (rojo) -- semántica opuesta a un KPI normal', () => {
    const v = calcularVariacionGasto(150, 100);
    expect(v!.pct).toBe(50);
    expect(v!.favorable).toBe(false);
  });

  it('sin gasto el mes anterior, no hay variación calculable -- null, nunca 0% ni Infinity', () => {
    expect(calcularVariacionGasto(100, 0)).toBeNull();
  });
});

describe('calcularEjecucionPresupuesto', () => {
  it('calcula el % ejecutado contra el presupuesto acumulado al trimestre', () => {
    // Presupuesto anual 400M, Q3 -> acumulado 300M; gastado 66,5M+144,8M+300M = ~511M (usamos un caso simple)
    const r = calcularEjecucionPresupuesto(150_000_000, 400_000_000, 2); // Q2 -> acumulado 200M
    expect(r).not.toBeNull();
    expect(r!.presupuestoAcumuladoQ).toBe(200_000_000);
    expect(r!.pct).toBe(75);
    expect(r!.sobrePresupuesto).toBe(false);
  });

  it('marca sobrePresupuesto cuando el gasto acumulado supera el 100%', () => {
    const r = calcularEjecucionPresupuesto(250_000_000, 400_000_000, 2);
    expect(r!.pct).toBe(125);
    expect(r!.sobrePresupuesto).toBe(true);
  });

  it('sin presupuesto cargado (0 o sin filas), null -- NUNCA una barra al 0%', () => {
    expect(calcularEjecucionPresupuesto(100, 0, 3)).toBeNull();
  });
});

describe('topNegocios', () => {
  it('devuelve los N de mayor gasto, ordenados descendente', () => {
    const lista = [
      { nombre: 'Ganado', total: 10 },
      { nombre: 'Aguacate Hass', total: 524_900_000 },
      { nombre: 'Oficina Central', total: 359_700_000 },
      { nombre: 'Hato Lechero', total: 50 },
    ];
    expect(topNegocios(lista, 2)).toEqual([
      { nombre: 'Aguacate Hass', total: 524_900_000 },
      { nombre: 'Oficina Central', total: 359_700_000 },
    ]);
  });

  it('no muta el arreglo original', () => {
    const lista = [{ nombre: 'A', total: 1 }, { nombre: 'B', total: 2 }];
    const copia = [...lista];
    topNegocios(lista, 1);
    expect(lista).toEqual(copia);
  });
});

describe('etiquetaQuincena', () => {
  it('"julio Q2" para {anio:2026, mes:7, quincena:2}', () => {
    expect(etiquetaQuincena({ anio: 2026, mes: 7, quincena: 2 })).toBe('julio Q2');
  });
});

describe('quincenasFaltantes', () => {
  it('caso real: última registrada julio Q2, hoy 17 de agosto -- agosto Q1 (cerrada) falta', () => {
    const faltantes = quincenasFaltantes({ anio: 2026, mes: 7, quincena: 2 }, '2026-08-17');
    expect(faltantes).toEqual([{ anio: 2026, mes: 8, quincena: 1 }]);
  });

  it('al día: si la última registrada YA es la quincena cerrada más reciente, no falta ninguna', () => {
    // Hoy 2026-08-17 -> quincena abierta es agosto Q2; la cerrada más reciente es agosto Q1.
    const faltantes = quincenasFaltantes({ anio: 2026, mes: 8, quincena: 1 }, '2026-08-17');
    expect(faltantes).toEqual([]);
  });

  it('varias quincenas atrás: enumera TODAS las cerradas desde la última registrada, en orden cronológico', () => {
    const faltantes = quincenasFaltantes({ anio: 2026, mes: 6, quincena: 2 }, '2026-09-20');
    expect(faltantes).toEqual([
      { anio: 2026, mes: 7, quincena: 1 },
      { anio: 2026, mes: 7, quincena: 2 },
      { anio: 2026, mes: 8, quincena: 1 },
      { anio: 2026, mes: 8, quincena: 2 },
      { anio: 2026, mes: 9, quincena: 1 },
    ]);
  });

  it('nunca se registró ninguna quincena: lista vacía -- el llamador distingue este caso con `ultimaRegistrada === null`, no lo confunde con "al día"', () => {
    expect(quincenasFaltantes(null, '2026-08-17')).toEqual([]);
  });

  it('respeta el techo de la ventana -- nunca crece sin límite si el dato está muy atrasado', () => {
    const faltantes = quincenasFaltantes({ anio: 2020, mes: 1, quincena: 1 }, '2026-08-17', 5);
    expect(faltantes).toHaveLength(5);
  });
});

describe('rangoValorQuincenas', () => {
  it('caso real: entre ~$11M y ~$27M', () => {
    expect(rangoValorQuincenas([11_608_790, 27_000_000, 15_000_000])).toEqual({
      min: 11_608_790,
      max: 27_000_000,
    });
  });

  it('sin valores, null -- nunca un rango inventado', () => {
    expect(rangoValorQuincenas([])).toBeNull();
  });

  it('un único valor: min y max son el mismo número', () => {
    expect(rangoValorQuincenas([20_000_000])).toEqual({ min: 20_000_000, max: 20_000_000 });
  });
});
