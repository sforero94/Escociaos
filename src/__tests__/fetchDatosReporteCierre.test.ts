// ARCHIVO: __tests__/fetchDatosReporteCierre.test.ts
// DESCRIPCIÓN: hallazgo #39 de la operación de mantenimiento — el Reporte de Cierre (el PDF
// que `DetalleAplicacion.tsx` descarga vía `fetchDatosReporteCierre` +
// `generarPDFReporteCierre`) leía la mano de obra del snapshot congelado en
// `aplicaciones.costo_total_mano_obra`/`jornales_utilizados`/`valor_jornal`, escrito una sola
// vez al momento del cierre. Dos aplicaciones de enero cerraron con una tarifa plana de
// $50.000/jornal tecleada a mano, mientras `registros_trabajo` ya tenía el costo real
// (y mayor) de cada jornal — y el reporte nunca recalculaba.
//
// Este test verifica el cableado completo de `fetchDatosReporteCierre`: que la mano de obra
// del reporte sale de `registros_trabajo` (vía `fetchJornalesRealesPorLote`), no del snapshot,
// y que `costo_total`/`costo_por_arbol`/`arboles_por_jornal` se recalculan con ese valor vivo.
// La decisión de negocio (cuándo usar vivo vs. snapshot) está probada por separado en
// `calculosCierreAplicacion.test.ts` (`calcularCostosVivosAplicacion`); acá solo se prueba que
// este fichero la invoca con los datos correctos.

import { describe, it, expect, beforeEach, vi } from 'vitest';

function createChainableMock(resolvedData: any = { data: [], error: null }) {
  const chain: any = {};
  const methods = ['select', 'eq', 'in', 'single', 'maybeSingle'];
  methods.forEach((method) => {
    chain[method] = vi.fn(() => chain);
  });
  Object.defineProperty(chain, 'then', {
    value: (resolve: any, reject: any) => Promise.resolve(resolvedData).then(resolve, reject),
  });
  return chain;
}

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

vi.mock('../utils/supabase/client', () => ({
  getSupabase: () => mockSupabase,
}));

import { fetchDatosReporteCierre } from '../utils/fetchDatosReporteCierre';

/** Aplicación de enero del hallazgo: cerró con snapshot congelado a $50.000/jornal plano
 * (60 jornales × 50.000 = 3.000.000), pero registros_trabajo ya tenía el costo real de cada
 * jornal, sumando 5.300.000 sobre esos mismos 60 jornales. */
const APP_ENERO = {
  id: 'app-enero-1',
  tarea_id: 'tarea-1',
  nombre_aplicacion: 'Fumigación Lote PP — Enero',
  tipo_aplicacion: 'Fumigación',
  proposito: null,
  fecha_inicio_planeada: '2026-01-05',
  fecha_fin_planeada: '2026-01-10',
  fecha_inicio_ejecucion: '2026-01-06',
  fecha_cierre: '2026-01-12',
  observaciones_cierre: null,
  costo_total_insumos: 1_200_000,
  costo_total_mano_obra: 3_000_000, // snapshot congelado — $50.000/jornal tecleado a mano
  costo_total: 4_200_000,
  costo_por_arbol: 4_200_000 / 1000,
  jornales_utilizados: 60,
  valor_jornal: 50_000,
  aplicaciones_lotes: [{ lotes: { id: 'lote-1', nombre: 'Lote PP', total_arboles: 1000 } }],
};

const REGISTROS_TRABAJO_REALES = [
  // 60 jornales reales que suman 5.300.000 — no los 3.000.000 del snapshot.
  { lote_id: 'lote-1', fraccion_jornal: '1.0', costo_jornal: 100_000 },
  ...Array.from({ length: 59 }, () => ({ lote_id: 'lote-1', fraccion_jornal: '1.0', costo_jornal: (5_300_000 - 100_000) / 59 })),
];

function mockTablas(overrides: Record<string, any> = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'aplicaciones') return createChainableMock({ data: overrides.aplicaciones ?? APP_ENERO, error: null });
    if (table === 'aplicaciones_cierre') return createChainableMock({ data: overrides.aplicaciones_cierre ?? null, error: null });
    if (table === 'aplicaciones_mezclas') return createChainableMock({ data: overrides.aplicaciones_mezclas ?? [], error: null });
    if (table === 'aplicaciones_productos') return createChainableMock({ data: overrides.aplicaciones_productos ?? [], error: null });
    if (table === 'productos') return createChainableMock({ data: overrides.productos ?? [], error: null });
    if (table === 'movimientos_diarios') return createChainableMock({ data: overrides.movimientos_diarios ?? [], error: null });
    if (table === 'movimientos_diarios_productos') return createChainableMock({ data: overrides.movimientos_diarios_productos ?? [], error: null });
    if (table === 'registros_trabajo') return createChainableMock({ data: overrides.registros_trabajo ?? REGISTROS_TRABAJO_REALES, error: null });
    return createChainableMock();
  });
}

describe('fetchDatosReporteCierre — hallazgo #39', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lee la mano de obra en vivo de registros_trabajo, no el snapshot de $50.000/jornal', async () => {
    mockTablas();

    const reporte = await fetchDatosReporteCierre('app-enero-1');

    expect(reporte.jornales_utilizados).toBe(60);
    expect(reporte.costo_total_mano_obra).toBeCloseTo(5_300_000, 0);
    expect(reporte.costo_total_mano_obra).not.toBe(3_000_000);
    expect(reporte.valor_jornal).not.toBe(50_000);
  });

  it('recalcula costo_total y costo_por_arbol con la mano de obra viva, no con el snapshot', async () => {
    mockTablas();

    const reporte = await fetchDatosReporteCierre('app-enero-1');

    // insumos (1.200.000, sin cambios) + mano de obra viva (5.300.000) — no los 4.200.000
    // congelados que sumaban insumos + el snapshot de mano de obra.
    expect(reporte.costo_total).toBeCloseTo(1_200_000 + 5_300_000, 0);
    expect(reporte.costo_total).not.toBeCloseTo(4_200_000, 0);
    expect(reporte.costo_por_arbol).toBeCloseTo(reporte.costo_total / 1000, 6);
  });

  it('sin tarea_id vinculada (aplicación anterior a la vinculación automática), cae al snapshot', async () => {
    mockTablas({
      aplicaciones: { ...APP_ENERO, tarea_id: null },
      registros_trabajo: [], // fetchJornalesRealesPorLote no consulta sin tareaId, pero por si acaso
    });

    const reporte = await fetchDatosReporteCierre('app-enero-1');

    expect(reporte.jornales_utilizados).toBe(60);
    expect(reporte.costo_total_mano_obra).toBe(3_000_000);
    expect(reporte.valor_jornal).toBe(50_000);
  });

  it('con tarea_id pero sin registros_trabajo capturados aún, cae al snapshot (no fabrica un 0)', async () => {
    mockTablas({ registros_trabajo: [] });

    const reporte = await fetchDatosReporteCierre('app-enero-1');

    expect(reporte.jornales_utilizados).toBe(60);
    expect(reporte.costo_total_mano_obra).toBe(3_000_000);
  });
});
