// PL de la planilla de chequeo = promedio MEDIDO de `hato_pesajes_leche`
// (dueño, 2026-09-09). Dos reglas que no son intercambiables: ventana de 8
// semanas para promediar, vencimiento de 4 semanas para decidir si hay algo
// que imprimir.

import { describe, it, expect } from 'vitest';
import {
  plMedidoPorAnimal,
  fechaDesdeParaPL,
  VENTANA_PL_DIAS,
  VENCIMIENTO_PL_DIAS,
  type PesajeParaPL,
} from '@/utils/hato/plDesdePesajes';

const HOY = '2026-09-09';
const p = (animal_id: string, fecha: string, litros_total: number): PesajeParaPL => ({
  animal_id,
  fecha,
  litros_total,
});

describe('plMedidoPorAnimal', () => {
  it('promedia las lecturas de la ventana, con un decimal', () => {
    // Cuatro miércoles reales de agosto 2026.
    const mapa = plMedidoPorAnimal(
      [p('a', '2026-08-05', 10), p('a', '2026-08-12', 9), p('a', '2026-08-19', 9), p('a', '2026-08-26', 10.4)],
      HOY,
    );
    expect(mapa.get('a')).toBe(9.6);
  });

  it('una semana sin pesar NO entra como 0', () => {
    const conHueco = plMedidoPorAnimal([p('a', '2026-08-12', 20), p('a', '2026-08-26', 10)], HOY);
    expect(conHueco.get('a')).toBe(15);
  });

  it('deja fuera lo anterior a la ventana de 8 semanas', () => {
    // 2026-07-15 esta a 56 dias de HOY: entra justo. 2026-07-14, no.
    const dentro = plMedidoPorAnimal([p('a', '2026-07-15', 30), p('a', '2026-08-26', 10)], HOY);
    expect(dentro.get('a')).toBe(20);
    const fuera = plMedidoPorAnimal([p('a', '2026-07-14', 30), p('a', '2026-08-26', 10)], HOY);
    expect(fuera.get('a')).toBe(10);
  });

  it('sin lecturas en 4 semanas la vaca NO tiene PL, aunque tenga datos en la ventana de 8', () => {
    // Este es el caso que separa las dos reglas: la lectura cae dentro de las
    // 8 semanas y aun asi esta vencida. Son las 8 vacas secas de produccion.
    const vencida = plMedidoPorAnimal([p('seca', '2026-07-20', 18), p('seca', '2026-08-05', 15)], HOY);
    expect(vencida.has('seca')).toBe(false);
  });

  it('el limite de vencimiento son 4 semanas EXACTAS', () => {
    const justoVencida = plMedidoPorAnimal([p('a', '2026-08-12', 12)], HOY); // 28 dias
    expect(justoVencida.has('a')).toBe(false);
    const justoViva = plMedidoPorAnimal([p('a', '2026-08-13', 12)], HOY); // 27 dias
    expect(justoViva.get('a')).toBe(12);
  });

  it('nunca devuelve 0 por ausencia: la vaca sin lecturas simplemente no esta', () => {
    const mapa = plMedidoPorAnimal([p('otra', '2026-08-26', 10)], HOY);
    expect(mapa.has('sin-pesajes')).toBe(false);
    expect(mapa.get('sin-pesajes')).toBeUndefined();
  });

  it('ignora un pesaje con fecha futura', () => {
    const mapa = plMedidoPorAnimal([p('a', '2026-08-26', 10), p('a', '2026-12-01', 99)], HOY);
    expect(mapa.get('a')).toBe(10);
  });

  it('un cero MEDIDO si cuenta -- es una lectura real, no una ausencia', () => {
    const mapa = plMedidoPorAnimal([p('a', '2026-08-19', 8), p('a', '2026-08-26', 0)], HOY);
    expect(mapa.get('a')).toBe(4);
  });
});

describe('fechaDesdeParaPL', () => {
  it('corta exactamente 8 semanas atras', () => {
    expect(fechaDesdeParaPL(HOY)).toBe('2026-07-15');
  });

  it('las dos constantes son las que el dueño pidio', () => {
    expect(VENTANA_PL_DIAS).toBe(56);
    expect(VENCIMIENTO_PL_DIAS).toBe(28);
  });
});
