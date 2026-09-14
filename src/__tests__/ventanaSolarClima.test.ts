import { describe, it, expect } from 'vitest';
import type { LecturaClimaAgregada } from '@/types/clima';
import { calcularAmanecerAtardecer, formatearHoraFraccion } from '@/utils/amanecerAtardecer';
import {
  acumularTiempoSol,
  elegirDiaVentana,
  parsearHoraKey,
  recortarVentanaDiurna,
} from '@/utils/ventanaSolarClima';

function punto(fecha: string, tiempo: number | null, energia: number | null = 0.1): LecturaClimaAgregada {
  return {
    fecha,
    temp_c_promedio: null,
    temp_c_max: null,
    temp_c_min: null,
    humedad_pct_promedio: null,
    viento_kmh_promedio: null,
    rafaga_kmh_max: null,
    lluvia_diaria_mm: null,
    radiacion_wm2_promedio: null,
    energia_kwh_m2: energia,
    tiempo_sol_horas: tiempo,
  };
}

function horasDelDia(dia: string, desde: number, hasta: number, duracion: number | null = 0.5): LecturaClimaAgregada[] {
  const out: LecturaClimaAgregada[] = [];
  for (let h = desde; h <= hasta; h++) {
    out.push(punto(`${dia} ${String(h).padStart(2, '0')}:00`, duracion));
  }
  return out;
}

describe('calcularAmanecerAtardecer at Aguadas', () => {
  it('equinox (2026-09-14) is about 06:00 / 18:00 Bogotá', () => {
    const v = calcularAmanecerAtardecer('2026-09-14');
    expect(v.amanecerHora).toBeGreaterThan(5.5);
    expect(v.amanecerHora).toBeLessThan(6.5);
    expect(v.atardecerHora).toBeGreaterThan(17.5);
    expect(v.atardecerHora).toBeLessThan(18.5);
    expect(v.amanecerLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(v.atardecerLabel).toMatch(/^\d{2}:\d{2}$/);
  });

  it('June solstice is a longer day than December solstice', () => {
    const jun = calcularAmanecerAtardecer('2026-06-21');
    const dic = calcularAmanecerAtardecer('2026-12-21');
    const durJun = jun.atardecerHora - jun.amanecerHora;
    const durDic = dic.atardecerHora - dic.amanecerHora;
    expect(durJun).toBeGreaterThan(durDic);
    expect(durJun).toBeGreaterThan(12);
    expect(durDic).toBeLessThan(12);
  });

  it('formatearHoraFraccion rounds 5.87 to 05:52', () => {
    expect(formatearHoraFraccion(5.87)).toBe('05:52');
  });
});

describe('recortarVentanaDiurna', () => {
  const ventana = { amanecerHora: 5.87, atardecerHora: 18.07 };

  it('clips 00–23 down to the hours that contain sunrise and sunset', () => {
    const puntos = horasDelDia('2026-09-14', 0, 23);
    const recorte = recortarVentanaDiurna(puntos, ventana);
    expect(recorte.fecha).toBe('2026-09-14');
    expect(recorte.horaInicio).toBe(5);
    expect(recorte.horaFin).toBe(18);
    expect(recorte.puntos[0].fecha).toBe('2026-09-14 05:00');
    expect(recorte.puntos[recorte.puntos.length - 1].fecha).toBe('2026-09-14 18:00');
    expect(recorte.subtitulo).toContain('05:52');
    expect(recorte.subtitulo).toContain('18:04');
  });

  it('intersects with the closest hours that actually have readings', () => {
    const puntos = horasDelDia('2026-09-14', 14, 21);
    const recorte = recortarVentanaDiurna(puntos, ventana);
    expect(recorte.horaInicio).toBe(14);
    expect(recorte.horaFin).toBe(18);
    expect(recorte.puntos.map((p) => p.fecha)).toEqual([
      '2026-09-14 14:00',
      '2026-09-14 15:00',
      '2026-09-14 16:00',
      '2026-09-14 17:00',
      '2026-09-14 18:00',
    ]);
  });

  it('uses yesterday when today has not reached sunrise yet', () => {
    const puntos = [
      ...horasDelDia('2026-09-13', 4, 23, 0.4),
      ...horasDelDia('2026-09-14', 0, 4, 0),
    ];
    const recorte = recortarVentanaDiurna(puntos, ventana);
    expect(recorte.fecha).toBe('2026-09-13');
    expect(recorte.horaInicio).toBe(5);
    expect(recorte.horaFin).toBe(18);
  });

  it('does not mutate the input', () => {
    const puntos = horasDelDia('2026-09-14', 0, 10);
    const copia = puntos.map((p) => ({ ...p }));
    recortarVentanaDiurna(puntos, ventana);
    expect(puntos).toEqual(copia);
  });
});

describe('acumularTiempoSol', () => {
  it('sums hour by hour and treats null as 0', () => {
    const puntos = [
      punto('2026-09-14 06:00', 0.5),
      punto('2026-09-14 07:00', null),
      punto('2026-09-14 08:00', 1.0),
      punto('2026-09-14 09:00', 0),
    ];
    const acc = acumularTiempoSol(puntos);
    expect(acc.map((p) => p.tiempo_sol_horas)).toEqual([0.5, 0.5, 1.5, 1.5]);
    expect(puntos[2].tiempo_sol_horas).toBe(1.0);
  });
});

describe('parsearHoraKey / elegirDiaVentana', () => {
  it('parses Bogotá hour keys', () => {
    expect(parsearHoraKey('2026-09-14 06:00')).toEqual({ dia: '2026-09-14', hora: 6 });
    expect(parsearHoraKey('2026-09-14')).toBeNull();
  });

  it('picks the last day once it has reached sunrise', () => {
    const puntos = [
      ...horasDelDia('2026-09-13', 20, 23),
      ...horasDelDia('2026-09-14', 0, 10),
    ];
    const dia = elegirDiaVentana(puntos, () => ({ amanecerHora: 5.87 }));
    expect(dia).toBe('2026-09-14');
  });
});
