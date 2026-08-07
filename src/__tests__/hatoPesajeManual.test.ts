// ARCHIVO: __tests__/hatoPesajeManual.test.ts
// DESCRIPCIÓN: UI rework de Producción (2026-08-06) -- `pesajeManual.ts`
// arma el diff EN BLANCO del modo "Ingresar a mano" de la tarjeta "Pesaje
// de leche" (tercera opción del desplegable `Registrar`, decisión del
// dueño: reutilizar `RevisionPesajeFoto` en vez de una segunda UI).
//
// Lo que este test protege:
//   1. Una fila por vaca activa, TODAS las celdas en blanco (litros null),
//      nunca `ilegible` (no hubo ningún modelo que "dudara").
//   2. Solo las semanas con fecha real ese mes generan celdas (mismo
//      contrato que `construirDiffPesaje`, reutilizado sin tocarlo).
//   3. Sin animales -> diff vacío, nunca un error.

import { describe, it, expect } from 'vitest';
import { construirDiffPesajeManual, type AnimalPesajeManual } from '@/utils/hato/pesajeManual';
import { SEMANAS_PESAJE, type SemanaPesaje } from '@/utils/importHato/ocrPesaje';

const ANIMALES: AnimalPesajeManual[] = [
  { id: 'uuid-alina', nombre: 'ALINA' },
  { id: 'uuid-gallega', nombre: 'GALLEGA' },
];

function fechasCompletas(): Record<SemanaPesaje, string | null> {
  return { 1: '2026-08-05', 2: '2026-08-12', 3: '2026-08-19', 4: '2026-08-26', 5: null };
}

describe('construirDiffPesajeManual', () => {
  it('arma una fila en blanco por (vaca, semana con fecha real) -- litros null, no marcada no confiable', () => {
    const diff = construirDiffPesajeManual(ANIMALES, fechasCompletas());

    // 2 vacas x 4 semanas con fecha real (la 5ª es null ese mes) = 8 celdas.
    expect(diff).toHaveLength(8);
    for (const celda of diff) {
      expect(celda.litrosAm).toBeNull();
      expect(celda.litrosPm).toBeNull();
      expect(celda.litrosTotal).toBeNull();
      expect(celda.noConfiable).toBe(false);
      expect(celda.soloUnOrdeno).toBe(false);
    }
  });

  it('nunca genera una celda para una semana sin ocurrencia real ese mes', () => {
    const diff = construirDiffPesajeManual(ANIMALES, fechasCompletas());
    expect(diff.some((c) => c.semana === 5)).toBe(false);
  });

  it('preserva el nombre y el id del animal en cada celda', () => {
    const diff = construirDiffPesajeManual(ANIMALES, fechasCompletas());
    const deAlina = diff.filter((c) => c.animalId === 'uuid-alina');
    expect(deAlina.length).toBeGreaterThan(0);
    expect(deAlina.every((c) => c.nombre === 'ALINA')).toBe(true);
  });

  it('sin animales activos, el diff queda vacío -- nunca un error', () => {
    expect(construirDiffPesajeManual([], fechasCompletas())).toEqual([]);
  });

  it('sin ninguna semana con fecha real, el diff queda vacío', () => {
    const sinFechas: Record<SemanaPesaje, string | null> = { 1: null, 2: null, 3: null, 4: null, 5: null };
    expect(construirDiffPesajeManual(ANIMALES, sinFechas)).toEqual([]);
  });

  it('cubre exactamente las semanas declaradas en SEMANAS_PESAJE', () => {
    const diff = construirDiffPesajeManual(ANIMALES, fechasCompletas());
    const semanasVistas = new Set(diff.map((c) => c.semana));
    for (const s of semanasVistas) expect(SEMANAS_PESAJE).toContain(s);
  });
});
