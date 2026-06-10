import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildGanadoInventorySummary,
  renderMovimientosRecientes,
} from '../supabase/functions/server/ganado-inventario';
import type {
  GanUbicacionRow,
  GanFincaRow,
  GanPotreroRow,
  GanInventarioRow,
  GanMovimientoRow,
} from '../supabase/functions/server/ganado-inventario';

const ubicaciones: GanUbicacionRow[] = [
  { id: 'u1', nombre: 'San Francisco' },
  { id: 'u2', nombre: 'Supata' },
];
const fincas: GanFincaRow[] = [
  { id: 'f1', nombre: 'La Esperanza', ubicacion_id: 'u1', hectareas: '10', activa: true },
  { id: 'f2', nombre: 'El Roble', ubicacion_id: 'u2', hectareas: 5, activa: true },
  { id: 'f3', nombre: 'Inactiva', ubicacion_id: 'u1', hectareas: 99, activa: false },
];
const potreros: GanPotreroRow[] = [
  { id: 'p1', nombre: 'Potrero 1', finca_id: 'f1', activo: true },
  { id: 'p2', nombre: 'Potrero 2', finca_id: 'f1', activo: true },
  { id: 'p3', nombre: 'Potrero 3', finca_id: 'f2', activo: true },
  { id: 'p4', nombre: 'Viejo', finca_id: 'f1', activo: false },
];
const inventario: GanInventarioRow[] = [
  { potrero_id: 'p1', novillos: 18, toros: 3, peso_promedio_kg: '400.0' },
  { potrero_id: 'p2', novillos: 5, toros: 0, peso_promedio_kg: null },
  { potrero_id: 'p3', novillos: 10, toros: 0, peso_promedio_kg: 380 },
  { potrero_id: 'p4', novillos: 99, toros: 99, peso_promedio_kg: null }, // potrero inactivo: ignorado
];
const movimientos: GanMovimientoRow[] = [
  { tipo: 'ajuste', fecha: '2026-06-01', novillos_delta: 20, toros_delta: 2 },
  { tipo: 'traslado_salida', fecha: '2026-06-05', novillos_delta: -5, toros_delta: 0, potrero_origen_id: 'p1' },
  { tipo: 'traslado_entrada', fecha: '2026-06-05', novillos_delta: 5, toros_delta: 0, potrero_destino_id: 'p2' },
  { tipo: 'muerte', fecha: '2026-06-08', novillos_delta: -1, toros_delta: 0, potrero_origen_id: 'p3', notas: 'accidente' },
];
const pendientes: GanMovimientoRow[] = [
  { id: 'm9', tipo: 'compra', fecha: '2026-06-09', novillos_delta: 4, toros_delta: 0, peso_promedio_kg: '400.0', notas: 'Generado desde transacción de finanzas' },
  { id: 'm10', tipo: 'venta', fecha: '2026-06-10', novillos_delta: -12, toros_delta: 0 },
];

describe('buildGanadoInventorySummary', () => {
  const summary = buildGanadoInventorySummary({
    ubicaciones, fincas, potreros, inventario, movimientos30d: movimientos, pendientes,
  });

  it('totaliza solo potreros activos de fincas activas', () => {
    expect(summary.total.novillos).toBe(33);
    expect(summary.total.toros).toBe(3);
    expect(summary.total.cabezas).toBe(36);
    expect(summary.total.hectareas).toBe(15);
    expect(summary.total.cabezas_por_ha).toBeCloseTo(2.4);
  });

  it('agrupa por ubicación con cabezas/ha', () => {
    const sf = summary.por_ubicacion.find((u) => u.ubicacion === 'San Francisco')!;
    expect(sf.cabezas).toBe(26);
    expect(sf.cabezas_por_ha).toBeCloseTo(2.6);
    const su = summary.por_ubicacion.find((u) => u.ubicacion === 'Supata')!;
    expect(su.cabezas).toBe(10);
    expect(su.cabezas_por_ha).toBeCloseTo(2);
  });

  it('desglosa por finca con potreros y peso promedio numérico', () => {
    const esperanza = summary.por_finca.find((f) => f.finca === 'La Esperanza')!;
    expect(esperanza.potreros).toHaveLength(2);
    expect(esperanza.potreros[0].peso_promedio_kg).toBe(400);
    expect(summary.por_finca.find((f) => f.finca === 'Inactiva')).toBeUndefined();
  });

  it('calcula variación 30 días con deltas firmados', () => {
    expect(summary.variacion_30_dias).toEqual({ entradas: 27, salidas: 6, neto: 21 });
  });

  it('resume pendientes con cabezas absolutas (venta llega negativa)', () => {
    expect(summary.pendientes_confirmacion.total).toBe(2);
    expect(summary.pendientes_confirmacion.detalle[0].cabezas).toBe(4);
    expect(summary.pendientes_confirmacion.detalle[1].cabezas).toBe(12);
    expect(summary.pendientes_confirmacion.detalle[0].peso_promedio_kg).toBe(400);
  });

  it('filtra por ubicación (parcial, case-insensitive) y lo reporta', () => {
    const filtrado = buildGanadoInventorySummary({
      ubicaciones, fincas, potreros, inventario, movimientos30d: [], pendientes: [],
      filtroUbicacion: 'supata',
    });
    expect(filtrado.total.cabezas).toBe(10);
    expect(filtrado.por_finca).toHaveLength(1);
    expect(filtrado.filtro_aplicado).toContain('supata');
  });

  it('filtra por finca', () => {
    const filtrado = buildGanadoInventorySummary({
      ubicaciones, fincas, potreros, inventario, movimientos30d: [], pendientes: [],
      filtroFinca: 'esperanza',
    });
    expect(filtrado.total.cabezas).toBe(26);
  });

  it('cabezas_por_ha es null sin hectáreas', () => {
    const sinHa = buildGanadoInventorySummary({
      ubicaciones,
      fincas: [{ ...fincas[0], hectareas: 0 }],
      potreros, inventario, movimientos30d: [], pendientes: [],
    });
    expect(sinHa.total.cabezas_por_ha).toBeNull();
  });
});

describe('renderMovimientosRecientes', () => {
  it('resuelve potrero y finca por destino u origen', () => {
    const rows = renderMovimientosRecientes(movimientos, potreros, fincas);
    const salida = rows.find((r) => r.tipo === 'traslado_salida')!;
    expect(salida.potrero).toBe('Potrero 1');
    expect(salida.finca).toBe('La Esperanza');
    const entrada = rows.find((r) => r.tipo === 'traslado_entrada')!;
    expect(entrada.potrero).toBe('Potrero 2');
    const ajuste = rows.find((r) => r.tipo === 'ajuste')!;
    expect(ajuste.potrero).toBeNull();
  });

  it('respeta el límite', () => {
    expect(renderMovimientosRecientes(movimientos, potreros, fincas, 2)).toHaveLength(2);
  });
});

describe('integración en chat.tsx (ambas copias)', () => {
  for (const copia of ['../supabase/functions/server/chat.tsx', '../../supabase/functions/make-server-1ccce916/chat.tsx']) {
    const source = readFileSync(resolve(__dirname, copia), 'utf-8');
    it(`${copia} registra el tool get_ganado_inventory`, () => {
      expect(source).toContain("name: 'get_ganado_inventory'");
      expect(source).toContain("case 'get_ganado_inventory'");
      expect(source).toContain('buildGanadoInventorySummary');
      expect(source).toContain('get_ganado_inventory'); // mención en el system prompt
    });
  }
});
