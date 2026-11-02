import { describe, expect, it } from 'vitest';
import { auditarPaginas, coberturaDesdePrueba } from '@/utils/escoCobertura';
import type { PopulationProof } from '@/utils/escoEvidencia';

describe('trusted reader page diagnostics', () => {
  it('exposes stable page counts and unique membership without claiming an atomic snapshot', () => {
    expect(auditarPaginas([{ offset: 0, requested: 2, identities: ['a', 'b'], count: 3 }, { offset: 2, requested: 2, identities: ['c'], count: 3 }]))
      .toMatchObject({ complete: true, rowsRead: 3, expectedRows: 3, identityUnique: true, consistency: 'stable_count_pages', atomicSnapshot: false });
  });
  it('accepts exact single zero count, but does not infer completeness from short response', () => {
    expect(auditarPaginas([{ offset: 0, requested: 200, identities: [], count: 0 }])).toMatchObject({ complete: true, consistency: 'single_read' });
    expect(auditarPaginas([{ offset: 0, requested: 200, identities: ['a'], count: null }])).toMatchObject({ complete: false, consistency: 'not_attested' });
  });
  it.each([
    { pages: [{ offset: 0, requested: 2, identities: ['a', 'a'], count: 2 }], reason: 'duplicate_identity' },
    { pages: [{ offset: 0, requested: 1, identities: ['a'], count: 2 }, { offset: 1, requested: 1, identities: ['a'], count: 2 }], reason: 'duplicate_identity' },
    { pages: [{ offset: 0, requested: 1, identities: ['a'], count: 2 }, { offset: 1, requested: 1, identities: ['b'], count: 3 }], reason: 'unstable_count' },
    { pages: [{ offset: 0, requested: 1, identities: ['a'], count: null }, { offset: 1, requested: 1, identities: ['b'], count: 2 }], reason: 'missing_count' },
    { pages: [{ offset: 0, requested: 200, identities: ['a'], count: 5 }], reason: 'incomplete_population' },
    { pages: [{ offset: 1, requested: 1, identities: ['a'], count: 1 }], reason: 'incomplete_population' },
    { pages: [{ offset: 0, requested: 1, identities: ['a', 'b'], count: 2 }], reason: 'incomplete_population' },
    { pages: [{ offset: 0, requested: 1, identities: [''], count: 1 }], reason: 'invalid_value' },
  ])('guards $reason', ({ pages, reason }) => {
    const result = auditarPaginas(pages);
    expect(result.complete).toBe(false); expect(result.reasons).toContain(reason);
  });
  it('rejects caps and retains no-snapshot limitation even for same count with replaced data', () => {
    expect(auditarPaginas([{ offset: 0, requested: 2, identities: ['a', 'b'], count: 2 }], 1).reasons).toContain('budget_exceeded');
    expect(auditarPaginas([{ offset: 0, requested: 1, identities: ['replacement-a'], count: 2 }, { offset: 1, requested: 1, identities: ['replacement-b'], count: 2 }]).atomicSnapshot).toBe(false);
  });
  it('copies external population state; complete values cannot make partial population complete', () => {
    const proof: PopulationProof = { populationId: 'p', scopeId: 's', tool: 'get_climate_data', fields: ['fecha'], capturedAt: '2026-01-01T00:00:00Z', population: 'partial', rowsRead: 1, expectedRows: 3, identityUnique: true, consistency: 'not_attested' };
    expect(coberturaDesdePrueba(proof, 0)).toMatchObject({ population: 'partial', values: 'complete', expectedRows: 3 });
    expect(() => coberturaDesdePrueba({ ...proof, population: 'complete' }, 0)).toThrow();
  });
});
