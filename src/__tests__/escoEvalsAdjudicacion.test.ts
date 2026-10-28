import { describe, it, expect } from 'vitest';
import { aplicarAdjudicacion } from '../utils/escoEvals/adjudicacion';
import { casoBase } from './escoEvalsFixtures';

describe('owner adjudication view', () => {
  it('keeps uploaded labels immutable and distinguishes partial from incorrect', () => {
    const original = casoBase({ id: 'ESCO-GS-001', human_review: { verdict: 'correcta', verdict_raw: 'Correcto' } });
    expect(aplicarAdjudicacion(original).human_review.verdict).toBe('parcial');
    expect(original.human_review.verdict).toBe('correcta');
  });
  it('removes incompatible current inventory from historical purchase evaluation', () => {
    const original = casoBase({ id: 'ESCO-GS-039', must: ['purchase', 'inventory'], reference: {
      type: 'sql', sql: 'select purchase; select inventory;', frozen_result: { 'ultima_compra_al_2026-08-16': { value: 1 }, inventario_hoy: { value: 2 } }, frozen_on: '2026-10-22', replayable_as_of: false,
    } });
    const view = aplicarAdjudicacion(original);
    expect(view.reference.frozen_result).not.toHaveProperty('inventario_hoy');
    expect(view.reference.sql).not.toContain('inventory');
    expect(view.must).toEqual(['purchase']);
    expect(original.must).toHaveLength(2);
  });
  it('keeps warnings and acknowledgements separate from hard failures', () => {
    expect(aplicarAdjudicacion(casoBase({ id: 'ESCO-GS-042' })).expected_behavior.note).toContain('advertencia');
    expect(aplicarAdjudicacion(casoBase({ id: 'ESCO-GS-054' })).must_not.join(' ')).not.toContain('Entendido');
    expect(aplicarAdjudicacion(casoBase({ id: 'ESCO-GS-056' }))).toEqual(casoBase({ id: 'ESCO-GS-056' }));
  });
});
