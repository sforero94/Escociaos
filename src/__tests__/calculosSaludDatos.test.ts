// ARCHIVO: __tests__/calculosSaludDatos.test.ts
// DESCRIPCIÓN: Lógica PURA del bloque "Salud de los datos" del Tablero
// General (`docs/plan_dashboard_centro_control.md` §4 Bloque 6 / §9.2). Sin
// Supabase -- el I/O (los `MAX(fecha)`) vive en
// `src/components/dashboard/hooks/useSaludDatos.ts`. Casos reales de
// producción usados como fixtures: monitoreo hace 13 d, chequeo hace 38 d,
// pesaje hace 4 d, última quincena julio Q2, 3 de los últimos 10 días de
// clima con el contador de lluvia congelado.

import { describe, it, expect } from 'vitest';
import {
  diasDesde,
  clasificarPorCadencia,
  clasificarClima,
  construirSenalesSaludDatos,
  UMBRAL_MONITOREO,
  UMBRAL_CHEQUEO,
  UMBRAL_PESAJE,
  UMBRAL_QUINCENA,
} from '@/utils/calculosSaludDatos';

describe('diasDesde', () => {
  it('calcula días entre una fecha pasada y hoy', () => {
    expect(diasDesde('2026-08-03', '2026-08-16')).toBe(13);
    expect(diasDesde('2026-07-09', '2026-08-16')).toBe(38);
    expect(diasDesde('2026-08-12', '2026-08-16')).toBe(4);
  });

  it('sin fecha (nunca hubo dato), null -- nunca 0 ni Infinity', () => {
    expect(diasDesde(null, '2026-08-16')).toBeNull();
  });
});

describe('clasificarPorCadencia', () => {
  it('verde por debajo del umbral ámbar, ámbar entre los dos umbrales, rojo por encima', () => {
    expect(clasificarPorCadencia(5, 14, 28)).toBe('verde');
    expect(clasificarPorCadencia(14, 14, 28)).toBe('verde');
    expect(clasificarPorCadencia(20, 14, 28)).toBe('ambar');
    expect(clasificarPorCadencia(29, 14, 28)).toBe('rojo');
  });

  it('sin dato (null), gris -- nunca se confunde con "rojo" (rojo implica que SÍ hubo un dato, sólo viejo)', () => {
    expect(clasificarPorCadencia(null, 14, 28)).toBe('gris');
  });
});

describe('clasificarClima', () => {
  it('caso real: 7 de 10 días confiables -- ámbar (más de la mitad, no todos)', () => {
    expect(clasificarClima(7, 10)).toBe('ambar');
  });

  it('todos confiables, verde', () => {
    expect(clasificarClima(10, 10)).toBe('verde');
  });

  it('menos de la mitad confiables, rojo', () => {
    expect(clasificarClima(3, 10)).toBe('rojo');
  });

  it('sin ninguna lectura en absoluto, gris', () => {
    expect(clasificarClima(0, 0)).toBe('gris');
  });
});

describe('construirSenalesSaludDatos', () => {
  const base = {
    hoy: '2026-08-16',
    hasAguacate: true,
    hasHato: true,
    fechaUltimoMonitoreo: '2026-08-03',
    fechaUltimoChequeo: '2026-07-09',
    fechaUltimoPesaje: '2026-08-12',
    ultimaQuincena: { anio: 2026, mes: 7, quincena: 2 as const },
    climaConfiables: 7,
    climaTotal: 10,
  };

  it('caso real completo: cinco señales con las edades exactas del plan', () => {
    const senales = construirSenalesSaludDatos(base);
    const porClave = Object.fromEntries(senales.map((s) => [s.clave, s]));

    expect(porClave.monitoreo.detalle).toBe('13 d');
    expect(porClave.chequeo.detalle).toBe('38 d');
    expect(porClave.pesaje.detalle).toBe('4 d');
    expect(porClave.quincena.detalle).toBe('julio Q2');
    expect(porClave.clima.detalle).toBe('7 de 10 días confiables');
  });

  it('el orden es siempre: monitoreo, chequeo, pesaje, quincena, clima', () => {
    const senales = construirSenalesSaludDatos(base);
    expect(senales.map((s) => s.clave)).toEqual(['monitoreo', 'chequeo', 'pesaje', 'quincena', 'clima']);
  });

  it('clasifica el nivel de cada señal con sus propios umbrales -- caso real, todo fresco salvo el clima', () => {
    const senales = construirSenalesSaludDatos(base);
    const porClave = Object.fromEntries(senales.map((s) => [s.clave, s]));
    expect(porClave.monitoreo.nivel).toBe('verde'); // 13 <= 14
    expect(porClave.chequeo.nivel).toBe('verde'); // 38 <= 60 (bajo el mínimo intervalo real observado, 63 d)
    expect(porClave.pesaje.nivel).toBe('verde'); // 4 <= 7
    expect(porClave.quincena.nivel).toBe('verde'); // fin de julio Q2 (31-jul) a 16-ago = 16 d <= 20
    expect(porClave.clima.nivel).toBe('ambar'); // 7 de 10 confiables
  });

  it('chequeo pasado el umbral rojo (75 d, el mismo punto en que el plan lo escala a "Requiere tu decisión")', () => {
    const senales = construirSenalesSaludDatos({ ...base, fechaUltimoChequeo: '2026-06-01' }); // 76 días
    const chequeo = senales.find((s) => s.clave === 'chequeo')!;
    expect(chequeo.nivel).toBe('rojo');
  });

  it('umbrales documentados: monitoreo 14/28, chequeo 60/75, pesaje 7/21, quincena 20/35', () => {
    expect(UMBRAL_MONITOREO).toEqual({ ambar: 14, rojo: 28 });
    expect(UMBRAL_CHEQUEO).toEqual({ ambar: 60, rojo: 75 });
    expect(UMBRAL_PESAJE).toEqual({ ambar: 7, rojo: 21 });
    expect(UMBRAL_QUINCENA).toEqual({ ambar: 20, rojo: 35 });
  });

  it('sin módulo aguacate, no aparecen monitoreo ni clima -- ni se piden sus fechas', () => {
    const senales = construirSenalesSaludDatos({ ...base, hasAguacate: false });
    expect(senales.map((s) => s.clave)).toEqual(['chequeo', 'pesaje', 'quincena']);
  });

  it('sin módulo hato_lechero, no aparecen chequeo/pesaje/quincena', () => {
    const senales = construirSenalesSaludDatos({ ...base, hasHato: false });
    expect(senales.map((s) => s.clave)).toEqual(['monitoreo', 'clima']);
  });

  it('sin ningún módulo, arreglo vacío', () => {
    expect(construirSenalesSaludDatos({ ...base, hasAguacate: false, hasHato: false })).toEqual([]);
  });

  it('una tabla sin filas nunca ("nunca hubo dato") se declara "nunca", nivel gris -- nunca "NaN d"', () => {
    const senales = construirSenalesSaludDatos({
      ...base,
      fechaUltimoMonitoreo: null,
      fechaUltimoChequeo: null,
      fechaUltimoPesaje: null,
      ultimaQuincena: null,
      climaConfiables: null,
      climaTotal: null,
    });
    const porClave = Object.fromEntries(senales.map((s) => [s.clave, s]));
    expect(porClave.monitoreo).toMatchObject({ detalle: 'nunca', nivel: 'gris' });
    expect(porClave.chequeo).toMatchObject({ detalle: 'nunca', nivel: 'gris' });
    expect(porClave.pesaje).toMatchObject({ detalle: 'nunca', nivel: 'gris' });
    expect(porClave.quincena).toMatchObject({ detalle: 'nunca', nivel: 'gris' });
    expect(porClave.clima).toMatchObject({ nivel: 'gris' });
  });
});
