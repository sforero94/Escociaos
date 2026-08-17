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
  GanLoteRow,
  GanPotreroRow,
  GanInventarioRow,
  GanPesoHistoricoRow,
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
const lotes: GanLoteRow[] = [
  { id: 'l1', finca_id: 'f1', nombre: 'Bosque', activo: true },
  { id: 'l2', finca_id: 'f1', nombre: 'Quebradas', activo: true },
];
const potreros: GanPotreroRow[] = [
  { id: 'p1', nombre: 'Potrero 1', finca_id: 'f1', activo: true, lote_id: 'l1', etapa: 'ceba' },
  { id: 'p2', nombre: 'Potrero 2', finca_id: 'f1', activo: true, lote_id: null, etapa: null },
  { id: 'p3', nombre: 'Potrero 3', finca_id: 'f2', activo: true, lote_id: null, etapa: 'terneros' },
  { id: 'p4', nombre: 'Viejo', finca_id: 'f1', activo: false, lote_id: null, etapa: null },
];
const inventario: GanInventarioRow[] = [
  { potrero_id: 'p1', novillos: 18, toros: 3, peso_promedio_kg: '400.0' },
  { potrero_id: 'p2', novillos: 5, toros: 0, peso_promedio_kg: null },
  { potrero_id: 'p3', novillos: 10, toros: 0, peso_promedio_kg: 380 },
  { potrero_id: 'p4', novillos: 99, toros: 99, peso_promedio_kg: null }, // potrero inactivo: ignorado
];
const pesos: GanPesoHistoricoRow[] = [
  { potrero_id: 'p1', fecha: '2026-05-01', peso_promedio_kg: 380 },
  { potrero_id: 'p1', fecha: '2026-06-10', peso_promedio_kg: '410.0' }, // más reciente: gana
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
    ubicaciones, fincas, potreros, lotes, inventario, pesos, movimientos30d: movimientos, pendientes,
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

  it('desglosa por finca con lotes anidados (nuevo nivel por_lote)', () => {
    const esperanza = summary.por_finca.find((f) => f.finca === 'La Esperanza')!;
    // p1 -> lote Bosque, p2 -> Sin lote (2 grupos)
    expect(esperanza.por_lote).toHaveLength(2);
    const bosque = esperanza.por_lote.find((l) => l.lote === 'Bosque')!;
    expect(bosque.potreros).toHaveLength(1);
    expect(bosque.cabezas).toBe(21);
    const sinLote = esperanza.por_lote.find((l) => l.lote === 'Sin lote')!;
    expect(sinLote.potreros).toHaveLength(1);
    expect(summary.por_finca.find((f) => f.finca === 'Inactiva')).toBeUndefined();
  });

  it('el potrero trae etapa (bucket) y último peso desde gan_pesos_historico, NO desde gan_inventario', () => {
    const esperanza = summary.por_finca.find((f) => f.finca === 'La Esperanza')!;
    const bosque = esperanza.por_lote.find((l) => l.lote === 'Bosque')!;
    expect(bosque.potreros[0].etapa).toBe('ceba');
    // El último peso es el de la fila MÁS RECIENTE de pesos (410), no el de
    // gan_inventario.peso_promedio_kg (400, que ni siquiera se lee).
    expect(bosque.potreros[0].ultimo_peso_kg).toBe(410);
    expect(bosque.potreros[0].ultimo_peso_fecha).toBe('2026-06-10');

    const roble = summary.por_finca.find((f) => f.finca === 'El Roble')!;
    const sinLoteRoble = roble.por_lote.find((l) => l.lote === 'Sin lote')!;
    // p3 nunca tuvo una fila en gan_pesos_historico: null, nunca inventado.
    expect(sinLoteRoble.potreros[0].ultimo_peso_kg).toBeNull();
  });

  it('agrega por_etapa en total, ubicación y finca — sin_clasificar nunca se reparte', () => {
    // p1 ceba (21), p2 sin etapa (5), p3 terneros (10)
    expect(summary.total.por_etapa.ceba).toBe(21);
    expect(summary.total.por_etapa.sin_clasificar).toBe(5);
    expect(summary.total.por_etapa.terneros).toBe(10);
    const suma = Object.values(summary.total.por_etapa).reduce((s, n) => s + n, 0);
    expect(suma).toBe(summary.total.cabezas);

    const sf = summary.por_ubicacion.find((u) => u.ubicacion === 'San Francisco')!;
    expect(sf.por_etapa.ceba).toBe(21);
    expect(sf.por_etapa.sin_clasificar).toBe(5);
  });

  it('calcula variación 30 días EXCLUYENDO traslados (B-γ)', () => {
    // ajuste +22, traslado ±5 (excluido), muerte -1 => entradas 22, salidas 1
    expect(summary.variacion_30_dias).toEqual({ entradas: 22, salidas: 1, neto: 21 });
  });

  it('resume pendientes con cabezas absolutas (venta llega negativa)', () => {
    expect(summary.pendientes_confirmacion.total).toBe(2);
    expect(summary.pendientes_confirmacion.detalle[0].cabezas).toBe(4);
    expect(summary.pendientes_confirmacion.detalle[1].cabezas).toBe(12);
    expect(summary.pendientes_confirmacion.detalle[0].peso_promedio_kg).toBe(400);
  });

  it('filtra por ubicación (parcial, case-insensitive) y lo reporta', () => {
    const filtrado = buildGanadoInventorySummary({
      ubicaciones, fincas, potreros, lotes, inventario, pesos, movimientos30d: [], pendientes: [],
      filtroUbicacion: 'supata',
    });
    expect(filtrado.total.cabezas).toBe(10);
    expect(filtrado.por_finca).toHaveLength(1);
    expect(filtrado.filtro_aplicado).toContain('supata');
  });

  it('filtra por finca', () => {
    const filtrado = buildGanadoInventorySummary({
      ubicaciones, fincas, potreros, lotes, inventario, pesos, movimientos30d: [], pendientes: [],
      filtroFinca: 'esperanza',
    });
    expect(filtrado.total.cabezas).toBe(26);
  });

  it('cabezas_por_ha es null sin hectáreas', () => {
    const sinHa = buildGanadoInventorySummary({
      ubicaciones,
      fincas: [{ ...fincas[0], hectareas: 0 }],
      potreros, lotes, inventario, pesos, movimientos30d: [], pendientes: [],
    });
    expect(sinHa.total.cabezas_por_ha).toBeNull();
  });
});

describe('renderMovimientosRecientes — filas sueltas (sin agrupar)', () => {
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

describe('renderMovimientosRecientes — agrupamiento (§3.3, mismo contrato que la UI)', () => {
  it('traslado N→M con grupo_id que cierra por categoría -> UNA fila "traslado"', () => {
    const movs: GanMovimientoRow[] = [
      { tipo: 'traslado_salida', fecha: '2026-08-01', novillos_delta: -5, toros_delta: 0, potrero_origen_id: 'p1', grupo_id: 'g1' },
      { tipo: 'traslado_entrada', fecha: '2026-08-01', novillos_delta: 5, toros_delta: 0, potrero_destino_id: 'p2', grupo_id: 'g1' },
    ];
    const rows = renderMovimientosRecientes(movs, potreros, fincas);
    expect(rows).toHaveLength(1);
    expect(rows[0].tipo).toBe('traslado');
    expect(rows[0].grupo_id).toBe('g1');
    expect(rows[0].origenes).toHaveLength(1);
    expect(rows[0].destinos).toHaveLength(1);
    expect(rows[0].cabezas).toBe(5);
  });

  it('un grupo que no cierra por categoría -> sueltas, no se inventa el agrupamiento', () => {
    const movs: GanMovimientoRow[] = [
      { tipo: 'traslado_salida', fecha: '2026-08-01', novillos_delta: -10, toros_delta: 0, potrero_origen_id: 'p1', grupo_id: 'g2' },
      { tipo: 'traslado_entrada', fecha: '2026-08-01', novillos_delta: 8, toros_delta: 0, potrero_destino_id: 'p2', grupo_id: 'g2' },
    ];
    const rows = renderMovimientosRecientes(movs, potreros, fincas);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tipo === 'traslado_salida' || r.tipo === 'traslado_entrada')).toBe(true);
  });

  it('conteo físico (N ajustes con el mismo grupo_id) -> UNA fila "conteo_fisico"', () => {
    const movs: GanMovimientoRow[] = [
      { tipo: 'ajuste', fecha: '2026-08-15', novillos_delta: 19, toros_delta: 0, potrero_destino_id: 'p1', grupo_id: 'conteo-1' },
      { tipo: 'ajuste', fecha: '2026-08-15', novillos_delta: -13, toros_delta: 0, potrero_destino_id: 'p2', grupo_id: 'conteo-1' },
    ];
    const rows = renderMovimientosRecientes(movs, potreros, fincas);
    expect(rows).toHaveLength(1);
    expect(rows[0].tipo).toBe('conteo_fisico');
    expect(rows[0].potreros_involucrados).toBe(2);
  });

  it('fixture real del 17-ago: compra de 24 repartida en 13 + 11 -> UNA fila "compra", no dos', () => {
    const movs: GanMovimientoRow[] = [
      { tipo: 'compra', fecha: '2026-08-17', novillos_delta: 13, toros_delta: 0, potrero_destino_id: 'p1', transaccion_ganado_id: 'tx1' },
      { tipo: 'compra', fecha: '2026-08-17', novillos_delta: 11, toros_delta: 0, potrero_destino_id: 'p2', transaccion_ganado_id: 'tx1' },
    ];
    const rows = renderMovimientosRecientes(movs, potreros, fincas);
    expect(rows).toHaveLength(1);
    expect(rows[0].tipo).toBe('compra');
    expect(rows[0].transaccion_ganado_id).toBe('tx1');
    expect(rows[0].cabezas).toBe(24);
    expect(rows[0].destinos).toHaveLength(2);
  });

  it('transaccion_ganado_id NULL o de un solo miembro -> suelta', () => {
    const movs: GanMovimientoRow[] = [
      { tipo: 'compra', fecha: '2026-08-17', novillos_delta: 5, toros_delta: 0, potrero_destino_id: 'p1', transaccion_ganado_id: null },
    ];
    const rows = renderMovimientosRecientes(movs, potreros, fincas);
    expect(rows).toHaveLength(1);
    expect(rows[0].tipo).toBe('compra');
    expect(rows[0].transaccion_ganado_id).toBeUndefined();
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

describe('paridad byte a byte entre los dos árboles de ganado-inventario.ts', () => {
  it('src/supabase/functions/server/ y supabase/functions/make-server-1ccce916/ son copias idénticas', () => {
    const a = readFileSync(resolve(__dirname, '../supabase/functions/server/ganado-inventario.ts'), 'utf-8');
    const b = readFileSync(resolve(__dirname, '../../supabase/functions/make-server-1ccce916/ganado-inventario.ts'), 'utf-8');
    expect(a).toBe(b);
  });
});
