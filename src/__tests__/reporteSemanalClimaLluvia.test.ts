import { describe, it, expect, vi } from 'vitest';

// fetchDatosReporteSemanal importa el cliente de Supabase en el módulo; el
// bloque de clima que probamos aquí es puro, así que basta con un stub.
vi.mock('@/utils/supabase/client', () => ({
  getSupabase: () => ({}),
}));
vi.mock('../utils/supabase/client', () => ({
  getSupabase: () => ({}),
}));

import { construirDatosClimaSemanal } from '@/utils/fetchDatosReporteSemanal';

// Fila de clima_resumen_diario tal como la devuelve el select del reporte.
function dia(overrides: Record<string, unknown> & { fecha: string }) {
  return {
    temp_c_min: 13,
    temp_c_max: 25,
    temp_c_avg: 18,
    humedad_pct_avg: 76,
    lluvia_total_mm: 0,
    lluvia_confianza: 'ok',
    radiacion_wm2_max: 1000,
    radiacion_wm2_avg: 200,
    ...overrides,
  };
}

// Regresión del bug reportado el 2026-07-27: la semana S30 mostraba 38.4mm
// porque el 21/07 repetía el acumulado del 20/07 (contador congelado). La
// vista en vivo ya lo descartaba; el reporte semanal no.
describe('construirDatosClimaSemanal — lluvia con contador congelado', () => {
  const semanaS30 = [
    dia({ fecha: '2026-07-20', lluvia_total_mm: 15.75, lluvia_confianza: 'ok' }),
    dia({ fecha: '2026-07-21', lluvia_total_mm: 15.75, lluvia_confianza: 'contador_congelado' }),
    dia({ fecha: '2026-07-22', lluvia_total_mm: 1.0, lluvia_confianza: 'ok' }),
    dia({ fecha: '2026-07-23', lluvia_total_mm: 5.9, lluvia_confianza: 'ok' }),
    dia({ fecha: '2026-07-24', lluvia_total_mm: 0, lluvia_confianza: 'ok' }),
    dia({ fecha: '2026-07-25', lluvia_total_mm: 0, lluvia_confianza: 'ok' }),
    dia({ fecha: '2026-07-26', lluvia_total_mm: 0, lluvia_confianza: 'contador_congelado' }),
  ];

  it('excluye del total los días marcados contador_congelado', () => {
    const clima = construirDatosClimaSemanal(semanaS30, [])!;
    // 15.75 + 1.0 + 5.9 = 22.65, redondeado a 1 decimal por toFixed → 22.6.
    // Antes del fix el total era 38.4mm: contaba dos veces el 15.75 del 20/07.
    expect(clima.lluviaTotal).toBe(22.6);
    expect(clima.diasSinDatoLluvia).toBe(2);
  });

  it('marca el día no confiable como sin dato (null), nunca 0', () => {
    const clima = construirDatosClimaSemanal(semanaS30, [])!;
    const congelado = clima.diario.find(d => d.fecha === '2026-07-21')!;
    expect(congelado.lluviaMm).toBeNull();
    // Un día genuinamente seco sí es 0 — la distinción es el punto.
    expect(clima.diario.find(d => d.fecha === '2026-07-24')!.lluviaMm).toBe(0);
  });

  it('no altera una semana sin días congelados', () => {
    const limpia = semanaS30.map(d => ({ ...d, lluvia_confianza: 'ok' }));
    const clima = construirDatosClimaSemanal(limpia, [])!;
    expect(clima.lluviaTotal).toBe(38.4);
    expect(clima.diasSinDatoLluvia).toBe(0);
  });

  it('deja lluviaTotal en null si ningún día de la semana es confiable', () => {
    const todaCongelada = semanaS30.map(d => ({ ...d, lluvia_confianza: 'contador_congelado' }));
    const clima = construirDatosClimaSemanal(todaCongelada, [])!;
    expect(clima.lluviaTotal).toBeNull();
    expect(clima.diasSinDatoLluvia).toBe(7);
  });

  it('trata la fila sin señal de confianza (backfill en vivo) como confiable', () => {
    const sinCampo = [
      { ...dia({ fecha: '2026-07-20', lluvia_total_mm: 4 }), lluvia_confianza: undefined },
    ];
    const clima = construirDatosClimaSemanal(sinCampo, [])!;
    expect(clima.lluviaTotal).toBe(4);
    expect(clima.diario[0].lluviaMm).toBe(4);
  });
});

describe('construirDatosClimaSemanal — promedio histórico de 4 semanas', () => {
  // 28 días previos: 2mm cada uno = 14mm/semana.
  const historicoLimpio = Array.from({ length: 28 }, (_, i) => {
    const d = new Date('2026-06-22T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return dia({ fecha: d.toISOString().slice(0, 10), lluvia_total_mm: 2 });
  });

  it('promedia por día con dato y escala a la semana', () => {
    const clima = construirDatosClimaSemanal([dia({ fecha: '2026-07-20' })], historicoLimpio)!;
    expect(clima.historico!.lluviaPromSemanal).toBe(14);
  });

  it('no castiga el promedio cuando hay días descartados por contador congelado', () => {
    // Cuatro días congelados: si se dividiera por 4 semanas fijas el promedio
    // caería a 12mm y la semana actual parecería más lluviosa de lo que es.
    const conCongelados = historicoLimpio.map((d, i) =>
      i < 4 ? { ...d, lluvia_confianza: 'contador_congelado' } : d
    );
    const clima = construirDatosClimaSemanal([dia({ fecha: '2026-07-20' })], conCongelados)!;
    expect(clima.historico!.lluviaPromSemanal).toBe(14);
  });

  it('deja el promedio histórico en null si no hay ningún día confiable', () => {
    const todoCongelado = historicoLimpio.map(d => ({ ...d, lluvia_confianza: 'contador_congelado' }));
    const clima = construirDatosClimaSemanal([dia({ fecha: '2026-07-20' })], todoCongelado)!;
    expect(clima.historico!.lluviaPromSemanal).toBeNull();
  });
});
