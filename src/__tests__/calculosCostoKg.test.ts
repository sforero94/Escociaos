import { describe, it, expect } from 'vitest';
import {
  calcularOverheadFarm,
  asignarOverheadPorArboles,
  combinarCostosLote,
  calcularCostoKgLote,
  calcularCostoKgTodosLotes,
  calcularCostoKgFarmFallback,
  calcularCostoKgAnual,
  CATEGORIAS_OVERHEAD_EXCLUIDAS_DEFAULT,
  ANO_MIN_LOTE,
} from '@/utils/calculosCostoKg';
import type {
  CostoLoteAnual,
  InsumoLoteAnual,
  LaborLoteAnual,
  LoteInfoCosto,
} from '@/types/produccion';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function lote(overrides: Partial<LoteInfoCosto> = {}): LoteInfoCosto {
  return { id: 'l1', nombre: 'Piedra Paula', total_arboles: 1000, ...overrides };
}

function gastoRow(valor: number, categoria_nombre: string | null = 'Insumos') {
  return { valor, categoria_nombre };
}

// ---------------------------------------------------------------------------
// calcularOverheadFarm
// ---------------------------------------------------------------------------

describe('calcularOverheadFarm', () => {
  it('suma todos los gastos cuando ninguna categoría coincide con excluidas', () => {
    const gastos = [
      gastoRow(1_000_000, 'Mantenimiento'),
      gastoRow(500_000, 'Transporte'),
    ];
    expect(calcularOverheadFarm(gastos, CATEGORIAS_OVERHEAD_EXCLUIDAS_DEFAULT)).toBe(1_500_000);
  });

  it('excluye categorías en la lista (insensible a mayúsculas)', () => {
    const gastos = [
      gastoRow(2_000_000, 'Mano de Obra'),       // excluida
      gastoRow(1_000_000, 'Control de Plagas'),   // excluida
      gastoRow(500_000, 'Transporte'),            // incluida
      gastoRow(300_000, 'Alimentos y Fertilizantes'), // excluida
    ];
    expect(calcularOverheadFarm(gastos, CATEGORIAS_OVERHEAD_EXCLUIDAS_DEFAULT)).toBe(500_000);
  });

  it('acepta lista de excluidas personalizada', () => {
    const gastos = [
      gastoRow(1_000_000, 'Mano de Obra'),
      gastoRow(400_000, 'Transporte'),
    ];
    // Sin exclusiones: suma todo
    expect(calcularOverheadFarm(gastos, [])).toBe(1_400_000);
    // Con exclusión de Transporte solamente
    expect(calcularOverheadFarm(gastos, ['Transporte'])).toBe(1_000_000);
  });

  it('trata categoria_nombre null como vacío (nunca excluida)', () => {
    const gastos = [gastoRow(999, null), gastoRow(1, 'Mano de Obra')];
    expect(calcularOverheadFarm(gastos, CATEGORIAS_OVERHEAD_EXCLUIDAS_DEFAULT)).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// asignarOverheadPorArboles
// ---------------------------------------------------------------------------

describe('asignarOverheadPorArboles', () => {
  it('distribuye overhead proporcional al conteo de árboles', () => {
    const lotes = [
      lote({ id: 'l1', total_arboles: 1000 }),
      lote({ id: 'l2', total_arboles: 3000 }),
    ];
    const map = asignarOverheadPorArboles(lotes, 4_000_000);
    expect(map.get('l1')).toBeCloseTo(1_000_000);
    expect(map.get('l2')).toBeCloseTo(3_000_000);
  });

  it('excluye lotes con arboles = 0 del denominador y les asigna 0', () => {
    const lotes = [
      lote({ id: 'l1', total_arboles: 0 }),
      lote({ id: 'l2', total_arboles: 500 }),
      lote({ id: 'l3', total_arboles: 500 }),
    ];
    const map = asignarOverheadPorArboles(lotes, 2_000_000);
    // l1 no participa ni recibe overhead
    expect(map.get('l1')).toBe(0);
    // l2 y l3 reciben 50% cada uno (500/1000 del denominador real)
    expect(map.get('l2')).toBeCloseTo(1_000_000);
    expect(map.get('l3')).toBeCloseTo(1_000_000);
  });

  it('devuelve 0 para todos cuando overhead = 0', () => {
    const lotes = [lote({ id: 'l1', total_arboles: 200 })];
    const map = asignarOverheadPorArboles(lotes, 0);
    expect(map.get('l1')).toBe(0);
  });

  it('devuelve 0 para todos cuando totalArboles = 0 (todos los lotes en 0)', () => {
    const lotes = [lote({ id: 'l1', total_arboles: 0 })];
    const map = asignarOverheadPorArboles(lotes, 5_000_000);
    expect(map.get('l1')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// combinarCostosLote
// ---------------------------------------------------------------------------

describe('combinarCostosLote', () => {
  const lotes: LoteInfoCosto[] = [
    { id: 'l1', nombre: 'PP', total_arboles: 1000 },
    { id: 'l2', nombre: 'ST', total_arboles: 1000 },
  ];

  it('suma labor + insumos + overhead por lote', () => {
    const labor: LaborLoteAnual[] = [{ lote_id: 'l1', costo_labor: 500_000, jornales: 10 }];
    const insumos: InsumoLoteAnual[] = [{ lote_id: 'l1', costo_insumos: 300_000 }];
    // overhead 2M, dos lotes iguales → 1M cada uno
    const costos = combinarCostosLote(2026, lotes, labor, insumos, 2_000_000);

    const l1 = costos.find((c) => c.lote_id === 'l1')!;
    expect(l1.costo_labor).toBe(500_000);
    expect(l1.costo_insumos).toBe(300_000);
    expect(l1.costo_directo).toBe(800_000);
    expect(l1.overhead_asignado).toBe(1_000_000);
    expect(l1.costo_total).toBe(1_800_000);
  });

  it('lote sin registros de costo directo queda en 0 para directo, recibe overhead', () => {
    const costos = combinarCostosLote(2026, lotes, [], [], 2_000_000);
    const l2 = costos.find((c) => c.lote_id === 'l2')!;
    expect(l2.costo_directo).toBe(0);
    expect(l2.overhead_asignado).toBe(1_000_000);
  });
});

// ---------------------------------------------------------------------------
// calcularCostoKgLote
// ---------------------------------------------------------------------------

describe('calcularCostoKgLote', () => {
  const costoBase: CostoLoteAnual = {
    lote_id: 'l1',
    lote_nombre: 'PP',
    ano: 2026,
    arboles: 1000,
    costo_labor: 500_000,
    costo_insumos: 300_000,
    costo_directo: 800_000,
    overhead_asignado: 200_000,
    costo_total: 1_000_000,
  };

  it('calcula costo/kg y divide por cosecha proporcional a los kg', () => {
    const produccion = [
      { cosecha_tipo: 'Principal' as const, kg: 6000 },
      { cosecha_tipo: 'Traviesa' as const, kg: 4000 },
    ];
    const res = calcularCostoKgLote(costoBase, produccion);

    expect(res.kg_totales).toBe(10_000);
    expect(res.costo_kg).toBe(100); // 1_000_000 / 10_000
    // Principal: 60% del costo → 600_000
    const principal = res.por_cosecha.find((c) => c.cosecha_tipo === 'Principal')!;
    expect(principal.costo_asignado).toBe(600_000);
    expect(principal.costo_kg).toBe(100);
    // Traviesa: 40% → 400_000
    const traviesa = res.por_cosecha.find((c) => c.cosecha_tipo === 'Traviesa')!;
    expect(traviesa.costo_asignado).toBe(400_000);
  });

  it('suprime costo_kg cuando kg_totales = 0', () => {
    const res = calcularCostoKgLote(costoBase, []);
    expect(res.costo_kg).toBeNull();
    expect(res.kg_totales).toBe(0);
  });

  it('suprime costo_kg cuando arboles = 0', () => {
    const sinArboles: CostoLoteAnual = { ...costoBase, arboles: 0 };
    const res = calcularCostoKgLote(sinArboles, [
      { cosecha_tipo: 'Principal' as const, kg: 5000 },
    ]);
    expect(res.costo_kg).toBeNull();
    // costo_kg en por_cosecha también es null
    expect(res.por_cosecha[0].costo_kg).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// calcularCostoKgTodosLotes
// ---------------------------------------------------------------------------

describe('calcularCostoKgTodosLotes', () => {
  it('procesa múltiples lotes', () => {
    const costos: CostoLoteAnual[] = [
      { lote_id: 'l1', lote_nombre: 'PP', ano: 2026, arboles: 500, costo_labor: 0, costo_insumos: 0, costo_directo: 0, overhead_asignado: 0, costo_total: 500_000 },
      { lote_id: 'l2', lote_nombre: 'ST', ano: 2026, arboles: 0, costo_labor: 0, costo_insumos: 0, costo_directo: 0, overhead_asignado: 0, costo_total: 200_000 },
    ];
    const produccion = new Map([
      ['l1', [{ cosecha_tipo: 'Principal' as const, kg: 2500 }]],
      // l2 sin producción
    ]);

    const res = calcularCostoKgTodosLotes(costos, produccion);
    const l1 = res.find((r) => r.lote_id === 'l1')!;
    const l2 = res.find((r) => r.lote_id === 'l2')!;

    expect(l1.costo_kg).toBe(200); // 500_000 / 2500
    // l2: arboles=0 → null
    expect(l2.costo_kg).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// calcularCostoKgFarmFallback
// ---------------------------------------------------------------------------

describe('calcularCostoKgFarmFallback', () => {
  it('devuelve costo/kg a nivel finca', () => {
    const fb = calcularCostoKgFarmFallback(2024, 8_000_000, 40_000);
    expect(fb.costo_kg).toBe(200);
    expect(fb.es_fallback).toBe(true);
    expect(fb.ano).toBe(2024);
  });

  it('devuelve null cuando kg = 0', () => {
    const fb = calcularCostoKgFarmFallback(2024, 5_000_000, 0);
    expect(fb.costo_kg).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// calcularCostoKgAnual (orquestador)
// ---------------------------------------------------------------------------

describe('calcularCostoKgAnual', () => {
  const lotes: LoteInfoCosto[] = [
    { id: 'l1', nombre: 'PP', total_arboles: 2000 },
    { id: 'l2', nombre: 'ST', total_arboles: 2000 },
  ];
  const labor: LaborLoteAnual[] = [
    { lote_id: 'l1', costo_labor: 1_000_000, jornales: 20 },
  ];
  const insumos: InsumoLoteAnual[] = [
    { lote_id: 'l2', costo_insumos: 500_000 },
  ];
  const gastos = [
    { valor: 2_000_000, categoria_nombre: 'Transporte' },
    { valor: 1_000_000, categoria_nombre: 'Mano de Obra' }, // excluida
  ];
  const produccionMap = new Map([
    ['l1', [{ cosecha_tipo: 'Principal' as const, kg: 8000 }]],
    ['l2', [{ cosecha_tipo: 'Principal' as const, kg: 4000 }]],
  ]);

  it('devuelve fallback para años < ANO_MIN_LOTE', () => {
    const resultado = calcularCostoKgAnual(
      2025, lotes, labor, insumos, gastos, produccionMap,
    );
    expect(resultado.fallback).toBeDefined();
    expect(resultado.fallback!.es_fallback).toBe(true);
    expect(resultado.resultados).toHaveLength(0);
  });

  it(`retorna desglose por lote para años >= ${ANO_MIN_LOTE}`, () => {
    const resultado = calcularCostoKgAnual(
      ANO_MIN_LOTE, lotes, labor, insumos, gastos, produccionMap,
    );
    expect(resultado.fallback).toBeUndefined();
    expect(resultado.resultados).toHaveLength(2);
  });

  it('overhead excluye las categorías correctas', () => {
    const resultado = calcularCostoKgAnual(
      ANO_MIN_LOTE, lotes, labor, insumos, gastos, produccionMap,
    );
    // overhead_farm debe ser solo 2_000_000 (Transporte), no 3_000_000
    expect(resultado.overheadFarm.total).toBe(2_000_000);
  });

  it('categorías excluidas personalizadas se respetan', () => {
    const resultado = calcularCostoKgAnual(
      ANO_MIN_LOTE, lotes, labor, insumos, gastos, produccionMap,
      [], // sin exclusiones → overhead = 3_000_000
    );
    expect(resultado.overheadFarm.total).toBe(3_000_000);
  });

  it('lotes con arboles = 0 no reciben overhead y costo_kg es null', () => {
    const lotesConCero: LoteInfoCosto[] = [
      { id: 'l1', nombre: 'PP', total_arboles: 1000 },
      { id: 'lz', nombre: 'Zero', total_arboles: 0 },
    ];
    const produccionConZero = new Map([
      ['l1', [{ cosecha_tipo: 'Principal' as const, kg: 5000 }]],
      ['lz', [{ cosecha_tipo: 'Principal' as const, kg: 1000 }]],
    ]);
    const resultado = calcularCostoKgAnual(
      ANO_MIN_LOTE, lotesConCero, [], [], gastos, produccionConZero,
    );
    const lz = resultado.resultados.find((r) => r.lote_id === 'lz')!;
    expect(lz.costo_kg).toBeNull();
    const costoLz = resultado.costosLote.find((c) => c.lote_id === 'lz')!;
    expect(costoLz.overhead_asignado).toBe(0);
  });

  it('desglose por cosecha es proporcional a los kg', () => {
    const produccionDual = new Map([
      ['l1', [
        { cosecha_tipo: 'Principal' as const, kg: 6000 },
        { cosecha_tipo: 'Traviesa' as const, kg: 2000 },
      ]],
      ['l2', [{ cosecha_tipo: 'Principal' as const, kg: 4000 }]],
    ]);
    const resultado = calcularCostoKgAnual(
      ANO_MIN_LOTE, lotes, labor, insumos, gastos, produccionDual,
    );
    const l1 = resultado.resultados.find((r) => r.lote_id === 'l1')!;
    // Principal 75%, Traviesa 25%
    const principal = l1.por_cosecha.find((c) => c.cosecha_tipo === 'Principal')!;
    const traviesa = l1.por_cosecha.find((c) => c.cosecha_tipo === 'Traviesa')!;
    // costo/kg es igual para ambas cosechas (es la misma tasa)
    expect(principal.costo_kg).toBe(l1.costo_kg);
    expect(traviesa.costo_kg).toBe(l1.costo_kg);
    // costo_asignado proporcional
    expect(principal.costo_asignado).toBe(Math.round(l1.costo_total * 0.75));
    expect(traviesa.costo_asignado).toBe(Math.round(l1.costo_total * 0.25));
  });
});
