import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock Supabase ──────────────────────────────────────────────
function createChainableMock(resolvedData: unknown = { data: [], error: null }) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'in', 'gte', 'lte', 'order', 'upsert'];
  methods.forEach((method) => {
    chain[method] = vi.fn(() => chain);
  });
  Object.defineProperty(chain, 'then', {
    value: (resolve: (v: unknown) => void, reject: (v: unknown) => void) =>
      Promise.resolve(resolvedData).then(resolve, reject),
  });
  return chain;
}

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

vi.mock('../utils/supabase/client', () => ({
  getSupabase: () => mockSupabase,
}));

// Import the hook's exported utilities AFTER mocking
import {
  getQuarterRange,
  buildPresupuestoData,
} from '../components/finanzas/hooks/usePresupuestoData';

import type {
  PresupuestoRow,
  PresupuestoCategoriaRow,
  PresupuestoData,
} from '../types/finanzas';

// ── Tests ──────────────────────────────────────────────────────

describe('getQuarterRange', () => {
  it('returns correct date range for Q1', () => {
    const { desde, hasta } = getQuarterRange(2026, 1);
    expect(desde).toBe('2026-01-01');
    expect(hasta).toBe('2026-03-31');
  });

  it('returns correct date range for Q2', () => {
    const { desde, hasta } = getQuarterRange(2026, 2);
    expect(desde).toBe('2026-04-01');
    expect(hasta).toBe('2026-06-30');
  });

  it('returns correct date range for Q3', () => {
    const { desde, hasta } = getQuarterRange(2025, 3);
    expect(desde).toBe('2025-07-01');
    expect(hasta).toBe('2025-09-30');
  });

  it('returns correct date range for Q4', () => {
    const { desde, hasta } = getQuarterRange(2025, 4);
    expect(desde).toBe('2025-10-01');
    expect(hasta).toBe('2025-12-31');
  });
});

describe('buildPresupuestoData', () => {
  const cat1Id = 'cat-1';
  const cat2Id = 'cat-2';
  const con1Id = 'con-1';
  const con2Id = 'con-2';
  const con3Id = 'con-3'; // actuals only, no budget

  const budgets = [
    {
      id: 'p-1',
      concepto_id: con1Id,
      categoria_id: cat1Id,
      monto_anual: 200_000_000,
      is_principal: true,
      fin_categorias_gastos: { nombre: 'CONTROL_PLAGAS' },
      fin_conceptos_gastos: { nombre: 'Insecticidas' },
    },
    {
      id: 'p-2',
      concepto_id: con2Id,
      categoria_id: cat1Id,
      monto_anual: 40_000_000,
      is_principal: false,
      fin_categorias_gastos: { nombre: 'CONTROL_PLAGAS' },
      fin_conceptos_gastos: { nombre: 'Fungicidas' },
    },
  ];

  // Actual gastos for selected Q (aggregated by concepto)
  const actualsQ = [
    { concepto_id: con1Id, categoria_id: cat1Id, total: 30_000_000 },
    { concepto_id: con3Id, categoria_id: cat2Id, total: 5_000_000 }, // no budget
  ];

  // Same Q last year
  const actualsQAnterior = [
    { concepto_id: con1Id, categoria_id: cat1Id, total: 25_000_000 },
  ];

  // Full last year
  const actualsAnioAnterior = [
    { concepto_id: con1Id, categoria_id: cat1Id, total: 100_000_000 },
    { concepto_id: con3Id, categoria_id: cat2Id, total: 20_000_000 },
  ];

  // concepto_id → categoria name mapping for unbudgeted items
  const conceptoCatalog = [
    { id: con3Id, categoria_id: cat2Id, nombre: 'Otros Gastos', fin_categorias_gastos: { nombre: 'OTROS' } },
  ];

  let result: PresupuestoData;

  beforeEach(() => {
    result = buildPresupuestoData(
      budgets,
      actualsQ,
      actualsQAnterior,
      actualsAnioAnterior,
      conceptoCatalog,
    );
  });

  it('creates a category for each unique categoria', () => {
    expect(result.categorias).toHaveLength(2);
    const names = result.categorias.map((c) => c.categoria_nombre);
    expect(names).toContain('CONTROL_PLAGAS');
    expect(names).toContain('OTROS');
  });

  it('includes budgeted conceptos even with zero actuals', () => {
    const cp = result.categorias.find((c) => c.categoria_nombre === 'CONTROL_PLAGAS')!;
    expect(cp.conceptos).toHaveLength(2);
    const fungicidas = cp.conceptos.find((r) => r.concepto_nombre === 'Fungicidas')!;
    expect(fungicidas.monto_anual).toBe(40_000_000);
    expect(fungicidas.actual_q).toBe(0);
  });

  it('includes unbudgeted conceptos that have actuals', () => {
    const otros = result.categorias.find((c) => c.categoria_nombre === 'OTROS')!;
    expect(otros.conceptos).toHaveLength(1);
    const row = otros.conceptos[0];
    expect(row.concepto_nombre).toBe('Otros Gastos');
    expect(row.monto_anual).toBe(0);
    expect(row.actual_q).toBe(5_000_000);
  });

  it('computes monto_trimestral as monto_anual / 4', () => {
    const cp = result.categorias.find((c) => c.categoria_nombre === 'CONTROL_PLAGAS')!;
    const insecticidas = cp.conceptos.find((r) => r.concepto_nombre === 'Insecticidas')!;
    expect(insecticidas.monto_trimestral).toBe(50_000_000);
  });

  it('computes ejecucion_vs_q as actual / trimestral', () => {
    const cp = result.categorias.find((c) => c.categoria_nombre === 'CONTROL_PLAGAS')!;
    const insecticidas = cp.conceptos.find((r) => r.concepto_nombre === 'Insecticidas')!;
    // 30M / 50M = 0.6 → 60%
    expect(insecticidas.ejecucion_vs_q).toBe(60);
  });

  it('returns null ejecucion when budget is zero', () => {
    const otros = result.categorias.find((c) => c.categoria_nombre === 'OTROS')!;
    expect(otros.conceptos[0].ejecucion_vs_q).toBeNull();
  });

  it('computes variacion_yoy correctly', () => {
    const cp = result.categorias.find((c) => c.categoria_nombre === 'CONTROL_PLAGAS')!;
    const insecticidas = cp.conceptos.find((r) => r.concepto_nombre === 'Insecticidas')!;
    // (30M - 25M) / 25M = 0.2 → 20%
    expect(insecticidas.variacion_yoy).toBe(20);
  });

  it('returns null variacion when Q anterior is zero', () => {
    const cp = result.categorias.find((c) => c.categoria_nombre === 'CONTROL_PLAGAS')!;
    const fungicidas = cp.conceptos.find((r) => r.concepto_nombre === 'Fungicidas')!;
    expect(fungicidas.variacion_yoy).toBeNull();
  });

  it('aggregates category totals from its conceptos', () => {
    const cp = result.categorias.find((c) => c.categoria_nombre === 'CONTROL_PLAGAS')!;
    expect(cp.monto_anual).toBe(240_000_000); // 200M + 40M
    expect(cp.monto_trimestral).toBe(60_000_000);
    expect(cp.actual_q).toBe(30_000_000);
  });

  it('computes grand totals across all categories', () => {
    expect(result.totals.monto_anual).toBe(240_000_000);
    expect(result.totals.actual_q).toBe(35_000_000); // 30M + 5M
    expect(result.totals.actual_q_anterior).toBe(25_000_000);
    expect(result.totals.actual_anio_anterior).toBe(120_000_000); // 100M + 20M
  });

  it('computes pct_presupuesto correctly', () => {
    const cp = result.categorias.find((c) => c.categoria_nombre === 'CONTROL_PLAGAS')!;
    const insecticidas = cp.conceptos.find((r) => r.concepto_nombre === 'Insecticidas')!;
    // 200M / 240M total budget * 100 = 83.33
    expect(insecticidas.pct_presupuesto).toBeCloseTo(83.33, 0);
  });

  it('computes pct_actual correctly', () => {
    const cp = result.categorias.find((c) => c.categoria_nombre === 'CONTROL_PLAGAS')!;
    const insecticidas = cp.conceptos.find((r) => r.concepto_nombre === 'Insecticidas')!;
    // 30M / 35M total actuals * 100 = 85.71
    expect(insecticidas.pct_actual).toBeCloseTo(85.71, 0);
  });

  it('marks is_principal from budget data', () => {
    const cp = result.categorias.find((c) => c.categoria_nombre === 'CONTROL_PLAGAS')!;
    const insecticidas = cp.conceptos.find((r) => r.concepto_nombre === 'Insecticidas')!;
    const fungicidas = cp.conceptos.find((r) => r.concepto_nombre === 'Fungicidas')!;
    expect(insecticidas.is_principal).toBe(true);
    expect(fungicidas.is_principal).toBe(false);
  });

  it('sorts principal conceptos first within a category', () => {
    const cp = result.categorias.find((c) => c.categoria_nombre === 'CONTROL_PLAGAS')!;
    expect(cp.conceptos[0].is_principal).toBe(true);
  });
});
