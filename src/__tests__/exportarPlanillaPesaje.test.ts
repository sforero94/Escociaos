// ARCHIVO: __tests__/exportarPlanillaPesaje.test.ts
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md`, punto 1 -- los
// helpers puros compartidos entre el exportador PDF y (en el futuro) un
// posible reporte. Ver `exportarPlanillaPesajePDF.test.ts` para el documento
// real.

import { describe, it, expect } from 'vitest';
import { ordenarRosterPesaje, type AnimalPlanillaPesaje } from '@/utils/hato/exportarPlanillaPesaje';

describe('ordenarRosterPesaje', () => {
  it('nunca muta el arreglo de entrada', () => {
    const animales: AnimalPlanillaPesaje[] = [{ id: '1', nombre: 'B' }, { id: '2', nombre: 'A' }];
    const copia = [...animales];
    ordenarRosterPesaje(animales);
    expect(animales).toEqual(copia);
  });

  it('roster vacío -> arreglo vacío', () => {
    expect(ordenarRosterPesaje([])).toEqual([]);
  });
});
