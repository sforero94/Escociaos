/**
 * Test de paridad frontend ↔ edge function.
 *
 * `src/supabase/functions/server/reportes-financieros.ts` es un port a mano de
 * los motores de `src/utils/` (calculosPyG, calculosFlujoCaja, costoVentaGanado,
 * periodosReporte, clasificacionCostos). `chat.tsx` corre en Deno y no puede
 * importar a través de la frontera del árbol de despliegue — mismo caso que
 * `priorizacionScoutingParidad.test.ts`.
 *
 * Este test es el seguro contra la deriva silenciosa: alimenta AMBAS
 * implementaciones con los mismos datos y exige que los totales coincidan.
 * Si alguien toca la lógica de un lado sin el otro, esto falla.
 *
 * Lo que se compara: los NÚMEROS (totales, períodos, COGS, flujo). La forma de
 * la salida difiere a propósito — el frontend produce un array plano de líneas
 * para la tabla/PDF; el edge produce un resumen compacto para el LLM.
 */

import { describe, it, expect } from 'vitest';

// Frontend
import { construirPyG } from '@/utils/calculosPyG';
import { construirFlujoCaja } from '@/utils/calculosFlujoCaja';
import { construirPeriodos as construirPeriodosFrontend, DESFASE_ANIO_PRINCIPAL as DESFASE_FRONT } from '@/utils/periodosReporte';
import { costearVentasGanado as costearFrontend } from '@/utils/costoVentaGanado';
import { resolverTipoCosto as resolverFrontend } from '@/utils/clasificacionCostos';
import type { DatosCrudosReportes, VistaReporte } from '@/types/reportesFinancieros';

// Edge (Deno-side port)
import {
  construirResumenPyG,
  construirResumenFlujoCaja,
  construirPeriodos as construirPeriodosEdge,
  costearVentasGanado as costearEdge,
  resolverTipoCosto as resolverEdge,
  DESFASE_ANIO_PRINCIPAL as DESFASE_EDGE,
  type DatosReportes,
} from '../supabase/functions/server/reportes-financieros';

// ── Fixture compartido ──────────────────────────────────────────────────────

const ID_AGUA = 'n-agua';
const ID_GANA = 'n-gana';
const ID_HATO = 'n-hato';
const ID_OFI = 'n-ofi';

const NEGOCIOS = [
  { id: ID_AGUA, nombre: 'Aguacate Hass' },
  { id: ID_GANA, nombre: 'Ganado' },
  { id: ID_HATO, nombre: 'Hato Lechero' },
  { id: ID_OFI, nombre: 'Oficina Central' },
];

const INGRESOS = [
  { id: 'i1', fecha: '2026-02-10', negocio_id: ID_AGUA, valor: 40_000_000, categoria_id: 'ci1', categoria_nombre: 'Exportación', cosecha: 'Traviesa 2026', cantidad: 12_000 },
  { id: 'i2', fecha: '2026-05-20', negocio_id: ID_AGUA, valor: 28_857_500, categoria_id: 'ci2', categoria_nombre: 'Nacional', cosecha: 'Traviesa 2026', cantidad: 9_081 },
  { id: 'i3', fecha: '2025-11-20', negocio_id: ID_AGUA, valor: 15_574_000, categoria_id: 'ci1', categoria_nombre: 'Exportación', cosecha: 'Principal 2026', cantidad: 5_200 },
  { id: 'i4', fecha: '2026-01-15', negocio_id: ID_HATO, valor: 24_760_243, categoria_id: 'ci3', categoria_nombre: 'Venta Leche', cosecha: null, cantidad: 18_500 },
  { id: 'i5', fecha: '2026-04-15', negocio_id: ID_HATO, valor: 19_182_460, categoria_id: 'ci4', categoria_nombre: 'Venta de Terneros', cosecha: null, cantidad: 7 },
  { id: 'i6', fecha: '2026-03-01', negocio_id: ID_OFI, valor: 1_000_955, categoria_id: 'ci5', categoria_nombre: 'Otros Ingresos', cosecha: null, cantidad: null },
];

const GASTOS_BASE = [
  { id: 'g1', fecha: '2026-02-15', negocio_id: ID_AGUA, valor: 225_619_144, estado: 'Confirmado', categoria_id: 'cg1', categoria_nombre: 'Mano de Obra y Asistencia Técnica', categoria_tipo_costo: 'directo' as const, concepto_tipo_costo: null },
  { id: 'g2', fecha: '2026-05-15', negocio_id: ID_AGUA, valor: 104_426_886, estado: 'Confirmado', categoria_id: 'cg2', categoria_nombre: 'Alimentos y Fertilizantes', categoria_tipo_costo: 'directo' as const, concepto_tipo_costo: null },
  { id: 'g3', fecha: '2026-03-15', negocio_id: ID_AGUA, valor: 19_473_935, estado: 'Confirmado', categoria_id: 'cg3', categoria_nombre: 'Gastos Generales', categoria_tipo_costo: 'indirecto' as const, concepto_tipo_costo: null },
  // Override de concepto: la categoría dice indirecto, el concepto manda directo.
  { id: 'g4', fecha: '2026-06-10', negocio_id: ID_AGUA, valor: 7_000_000, estado: 'Confirmado', categoria_id: 'cg4', categoria_nombre: 'Equipos y Herramientas', categoria_tipo_costo: 'indirecto' as const, concepto_tipo_costo: 'directo' as const },
  // Pendiente: debe quedar fuera en ambos motores.
  { id: 'g5', fecha: '2026-02-20', negocio_id: ID_AGUA, valor: 9_999_999, estado: 'Pendiente', categoria_id: 'cg1', categoria_nombre: 'Mano de Obra y Asistencia Técnica', categoria_tipo_costo: 'directo' as const, concepto_tipo_costo: null },
  // Segundo semestre 2025 → alimenta la cosecha Principal 2026.
  { id: 'g6', fecha: '2025-09-15', negocio_id: ID_AGUA, valor: 30_000_000, estado: 'Confirmado', categoria_id: 'cg1', categoria_nombre: 'Mano de Obra y Asistencia Técnica', categoria_tipo_costo: 'directo' as const, concepto_tipo_costo: null },
  { id: 'g7', fecha: '2026-02-16', negocio_id: ID_HATO, valor: 53_100_543, estado: 'Confirmado', categoria_id: 'cg2', categoria_nombre: 'Alimentos y Fertilizantes', categoria_tipo_costo: 'directo' as const, concepto_tipo_costo: null },
  { id: 'g8', fecha: '2026-07-16', negocio_id: ID_HATO, valor: 14_458_057, estado: 'Confirmado', categoria_id: 'cg3', categoria_nombre: 'Gastos Generales', categoria_tipo_costo: 'indirecto' as const, concepto_tipo_costo: null },
  { id: 'g9', fecha: '2026-01-20', negocio_id: ID_GANA, valor: 30_856_781, estado: 'Confirmado', categoria_id: 'cg1', categoria_nombre: 'Mano de Obra y Asistencia Técnica', categoria_tipo_costo: 'directo' as const, concepto_tipo_costo: null },
  { id: 'g10', fecha: '2026-02-20', negocio_id: ID_OFI, valor: 192_141_343, estado: 'Confirmado', categoria_id: 'cg3', categoria_nombre: 'Gastos Generales', categoria_tipo_costo: 'indirecto' as const, concepto_tipo_costo: null },
];

// 571 compradas / 801 vendidas en producción → se replica el faltante.
const GANADO = [
  { id: 't1', fecha: '2026-01-10', tipo: 'compra' as const, cantidad_cabezas: 20, kilos_pagados: 8_000, valor_total: 60_000_000 },
  { id: 't2', fecha: '2026-02-14', tipo: 'venta' as const, cantidad_cabezas: 10, kilos_pagados: 5_000, valor_total: 50_000_000 },
  { id: 't3', fecha: '2026-04-10', tipo: 'compra' as const, cantidad_cabezas: 15, kilos_pagados: 6_500, valor_total: 83_320_000 },
  { id: 't4', fecha: '2026-08-05', tipo: 'venta' as const, cantidad_cabezas: 40, kilos_pagados: 19_000, valor_total: 205_407_650 },
];

const PARAMETROS = [{ clave: 'saldo_inicial_caja', anio: null, valor: 12_000_000 }];

const datosFrontend: DatosCrudosReportes = {
  anio: 2026,
  negocios: NEGOCIOS,
  ingresos: INGRESOS,
  gastos: GASTOS_BASE.map((g) => ({
    ...g,
    concepto_id: `${g.categoria_id}-c`,
    concepto_nombre: `${g.categoria_nombre} (detalle)`,
  })),
  ganado: GANADO,
  parametros: PARAMETROS.map((p) => ({ ...p, negocio_id: null })),
  truncado: false,
};

const datosEdge: DatosReportes = {
  anio: 2026,
  negocios: NEGOCIOS,
  ingresos: INGRESOS,
  gastos: GASTOS_BASE,
  ganado: GANADO,
  parametros: PARAMETROS,
};

const VISTAS: VistaReporte[] = ['global', 'aguacate', 'ganado', 'hato'];

// ── Constantes y funciones elementales ──────────────────────────────────────

describe('constantes compartidas', () => {
  it('el desfase de la cosecha Principal es el mismo en ambos lados', () => {
    expect(DESFASE_EDGE).toBe(DESFASE_FRONT);
  });

  it('los períodos se construyen igual', () => {
    for (const modo of ['trimestres', 'cosecha'] as const) {
      const front = construirPeriodosFrontend(2026, modo);
      const edge = construirPeriodosEdge(2026, modo);
      expect(edge.map((p) => p.key)).toEqual(front.map((p) => p.key));
      expect(edge.map((p) => p.egresos)).toEqual(front.map((p) => p.egresos));
      expect(edge.map((p) => p.ingresos)).toEqual(front.map((p) => p.ingresos));
    }
  });

  it('la resolución directo/indirecto es idéntica', () => {
    const casos = [
      { categoria_tipo_costo: 'directo' as const, concepto_tipo_costo: null },
      { categoria_tipo_costo: 'indirecto' as const, concepto_tipo_costo: 'directo' as const },
      { categoria_tipo_costo: null, concepto_tipo_costo: null },
      { categoria_tipo_costo: 'directo' as const, concepto_tipo_costo: 'indirecto' as const },
    ];
    for (const c of casos) {
      expect(resolverEdge(c)).toBe(resolverFrontend(c));
    }
  });
});

describe('costeo del ganado', () => {
  it('produce el mismo costo de venta, cabeza a cabeza', () => {
    for (const inicial of [null, { cabezas: 30, costoPorCabeza: 2_500_000 }]) {
      const front = costearFrontend(GANADO, inicial);
      const edge = costearEdge(GANADO, inicial);

      expect(edge.ventas.map((v) => v.cogs)).toEqual(front.ventas.map((v) => v.cogs));
      expect(edge.cabezasFinales).toBe(front.cabezasFinales);
      expect(edge.valorInventarioFinal).toBe(front.valorInventarioFinal);
      expect(edge.cabezasSinRespaldo).toBe(front.cabezasSinRespaldo);
      expect(edge.promedioCompras).toBe(front.promedioCompras);
      // Ambos advierten cuando faltan cabezas, aunque el texto difiera.
      expect(edge.advertencias.length).toBe(front.advertencias.length);
    }
  });
});

// ── P&G ─────────────────────────────────────────────────────────────────────

describe('P&G — paridad de totales', () => {
  for (const vista of VISTAS) {
    it(`vista ${vista} (trimestres)`, () => {
      const periodos = construirPeriodosFrontend(2026, 'trimestres');
      const front = construirPyG(datosFrontend, periodos, { vista, modo: 'trimestres' });
      const edge = construirResumenPyG(datosEdge, construirPeriodosEdge(2026, 'trimestres'), vista, 'trimestres');

      expect(edge.totales.ingresos).toEqual(front.totales.ingresos);
      expect(edge.totales.costos_directos).toEqual(front.totales.costos_directos);
      expect(edge.totales.margen_contribucion).toEqual(front.totales.margen_contribucion);
      expect(edge.totales.gastos_indirectos).toEqual(front.totales.gastos_indirectos);
      expect(edge.totales.utilidad_operativa).toEqual(front.totales.utilidad_operativa);
      expect(edge.totales.margen_contribucion_pct).toEqual(front.totales.margen_contribucion_pct);
      expect(edge.totales.utilidad_operativa_pct).toEqual(front.totales.utilidad_operativa_pct);
    });
  }

  it('aguacate por cosecha', () => {
    const periodos = construirPeriodosFrontend(2026, 'cosecha');
    const front = construirPyG(datosFrontend, periodos, { vista: 'aguacate', modo: 'cosecha' });
    const edge = construirResumenPyG(datosEdge, construirPeriodosEdge(2026, 'cosecha'), 'aguacate', 'cosecha');

    expect(edge.totales.ingresos).toEqual(front.totales.ingresos);
    expect(edge.totales.costos_directos).toEqual(front.totales.costos_directos);
    expect(edge.totales.utilidad_operativa).toEqual(front.totales.utilidad_operativa);
  });

  it('las líneas de detalle coinciden en etiqueta y valor', () => {
    const periodos = construirPeriodosFrontend(2026, 'trimestres');
    const front = construirPyG(datosFrontend, periodos, { vista: 'global', modo: 'trimestres' });
    const edge = construirResumenPyG(datosEdge, construirPeriodosEdge(2026, 'trimestres'), 'global', 'trimestres');

    // El frontend expande categoría → concepto; el edge solo llega a categoría.
    const frontCategorias = front.lineas
      .filter((l) => l.nivel === 1 && l.id.startsWith('dir_'))
      .map((l) => ({ etiqueta: l.etiqueta, valores: l.valores }));
    // Sin redondear en ninguno de los dos lados: el COGS del ganado da valores
    // fraccionarios legítimos y ambos motores deben producir el mismo bit.
    const edgeCategorias = edge.costos_directos_por_categoria.map((l) => ({
      etiqueta: l.etiqueta,
      valores: l.valores,
    }));

    expect(edgeCategorias.map((c) => c.etiqueta).sort()).toEqual(
      frontCategorias.map((c) => c.etiqueta).sort()
    );
    for (const cat of edgeCategorias) {
      const par = frontCategorias.find((c) => c.etiqueta === cat.etiqueta)!;
      expect(cat.valores).toEqual(par.valores);
    }
  });

  it('los indicadores unitarios coinciden', () => {
    for (const vista of ['aguacate', 'hato', 'ganado'] as VistaReporte[]) {
      const periodos = construirPeriodosFrontend(2026, 'trimestres');
      const front = construirPyG(datosFrontend, periodos, { vista, modo: 'trimestres' });
      const edge = construirResumenPyG(datosEdge, construirPeriodosEdge(2026, 'trimestres'), vista, 'trimestres');

      for (const ind of edge.indicadores) {
        const par = front.lineas.find((l) => l.etiqueta === ind.etiqueta);
        expect(par, `falta el indicador «${ind.etiqueta}» en el frontend (vista ${vista})`).toBeDefined();
        expect(ind.valores).toEqual(par!.valores);
      }
    }
  });
});

// ── Flujo de caja ───────────────────────────────────────────────────────────

describe('Flujo de caja — paridad', () => {
  for (const vista of VISTAS) {
    it(`vista ${vista}`, () => {
      const front = construirFlujoCaja(datosFrontend, vista);
      const edge = construirResumenFlujoCaja(datosEdge, vista);

      expect(edge.entradas.map(Math.round)).toEqual(front.totales.entradas);
      expect(edge.salidas.map(Math.round)).toEqual(front.totales.salidas);
      expect(edge.flujo_neto.map(Math.round)).toEqual(front.totales.flujo_neto);
      expect(edge.flujo_acumulado.map(Math.round)).toEqual(front.totales.flujo_acumulado);
      expect(edge.saldo_inicial).toBe(front.saldo_inicial);
      expect(edge.saldo_inicial_es_supuesto).toBe(front.saldo_inicial_es_supuesto);
    });
  }

  it('la compra de ganado sale en el flujo pero no en el P&G, en ambos motores', () => {
    const edgeFlujo = construirResumenFlujoCaja(datosEdge, 'ganado');
    const edgePyG = construirResumenPyG(datosEdge, construirPeriodosEdge(2026, 'trimestres'), 'ganado', 'trimestres');

    const compra = edgeFlujo.salidas_por_linea.find((l) =>
      l.etiqueta.startsWith('Compra de ganado')
    );
    expect(compra).toBeDefined();
    expect(compra!.valores.reduce((s, v) => s + v, 0)).toBe(143_320_000);

    // Ese monto no puede aparecer en ninguna línea de costo del P&G.
    const costosPyG = edgePyG.costos_directos_por_categoria.flatMap((l) => l.valores);
    expect(costosPyG).not.toContain(143_320_000);
  });
});
