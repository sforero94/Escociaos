import { describe, it, expect } from 'vitest';
import {
  DESTARE_CHIPS_KG_CABEZA,
  calcularDestareTotalKg,
  calcularPesoNetoKg,
  calcularValorVentaDesdeNeto,
  calcularPesosVentaGanado,
  errorDestareVenta,
  errorPotreroOrigenVenta,
} from '@/utils/calculosVentaGanado';
import type { RepartoFila } from '@/utils/calculosGanado';

function fila(overrides: Partial<RepartoFila> = {}): RepartoFila {
  return { potrero_id: '', novillos: 0, toros: 0, ...overrides };
}

describe('destare: chips 10 y 15, sin default forzado', () => {
  it('expone exactamente los chips 10 y 15', () => {
    expect([...DESTARE_CHIPS_KG_CABEZA]).toEqual([10, 15]);
  });
});

describe('calcularDestareTotalKg', () => {
  it('10 kg/cabeza × 20 cabezas = 200 kg', () => {
    expect(calcularDestareTotalKg(10, 20)).toBe(200);
  });

  it('15 kg/cabeza × 8 cabezas = 120 kg', () => {
    expect(calcularDestareTotalKg(15, 8)).toBe(120);
  });

  it('otro valor (12) × N también se calcula', () => {
    expect(calcularDestareTotalKg(12, 10)).toBe(120);
  });
});

describe('calcularPesoNetoKg (kilos_pagados)', () => {
  it('peso total − destare = neto pagado', () => {
    expect(calcularPesoNetoKg(5000, 200)).toBe(4800);
  });

  it('sin destare el neto es el peso total', () => {
    expect(calcularPesoNetoKg(5000, 0)).toBe(5000);
  });
});

describe('calcularValorVentaDesdeNeto', () => {
  it('neto × precio, redondeado a pesos enteros', () => {
    expect(calcularValorVentaDesdeNeto(4800, 12000)).toBe(57_600_000);
  });

  it('redondea el producto, no deja centavos', () => {
    expect(calcularValorVentaDesdeNeto(100.4, 10.5)).toBe(1054);
  });
});

describe('calcularPesosVentaGanado', () => {
  it('arma destare total, neto y valor desde báscula + chip 10', () => {
    expect(
      calcularPesosVentaGanado({
        pesoTotalKg: 5000,
        destareKgCabeza: 10,
        cantidadCabezas: 20,
        precioKilo: 12000,
      })
    ).toEqual({ destareTotalKg: 200, pesoNetoKg: 4800, valorCalculado: 57_600_000 });
  });

  it('destare vacío no inventa 10 ni 15: merma 0 y neto = total', () => {
    expect(
      calcularPesosVentaGanado({
        pesoTotalKg: 3000,
        destareKgCabeza: null,
        cantidadCabezas: 10,
        precioKilo: 8000,
      })
    ).toEqual({ destareTotalKg: 0, pesoNetoKg: 3000, valorCalculado: 24_000_000 });
  });

  it('sin peso total no fabrica neto ni valor', () => {
    expect(
      calcularPesosVentaGanado({
        pesoTotalKg: null,
        destareKgCabeza: 10,
        cantidadCabezas: 10,
        precioKilo: 8000,
      })
    ).toEqual({ destareTotalKg: 100, pesoNetoKg: null, valorCalculado: null });
  });
});

describe('errorDestareVenta', () => {
  it('acepta destare vacío', () => {
    expect(
      errorDestareVenta({
        pesoTotalKg: 1000,
        destareKgCabeza: null,
        cantidadCabezas: 10,
        precioKilo: null,
      })
    ).toBeNull();
  });

  it('rechaza destare negativo', () => {
    expect(
      errorDestareVenta({
        pesoTotalKg: 1000,
        destareKgCabeza: -1,
        cantidadCabezas: 10,
        precioKilo: null,
      })
    ).toMatch(/negativo/i);
  });

  it('rechaza destare mayor que el peso total', () => {
    expect(
      errorDestareVenta({
        pesoTotalKg: 100,
        destareKgCabeza: 15,
        cantidadCabezas: 10,
        precioKilo: null,
      })
    ).toMatch(/superar el peso total/i);
  });

  it('exige peso total si hay destare', () => {
    expect(
      errorDestareVenta({
        pesoTotalKg: null,
        destareKgCabeza: 10,
        cantidadCabezas: 5,
        precioKilo: null,
      })
    ).toMatch(/peso total/i);
  });
});

describe('errorPotreroOrigenVenta', () => {
  const cabezas = 12;

  it('bloquea una venta de ceba nueva sin potrero', () => {
    expect(
      errorPotreroOrigenVenta({
        tipo: 'venta',
        esHato: false,
        esEdicion: false,
        filas: [fila({ novillos: cabezas })],
        cantidadCabezas: cabezas,
      })
    ).toBe('El potrero de origen es requerido para una venta');
  });

  it('acepta venta de ceba con potrero y cabezas que cierran', () => {
    expect(
      errorPotreroOrigenVenta({
        tipo: 'venta',
        esHato: false,
        esEdicion: false,
        filas: [fila({ potrero_id: 'p1', novillos: 8, toros: 4 })],
        cantidadCabezas: cabezas,
      })
    ).toBeNull();
  });

  it('no exige potrero en una compra', () => {
    expect(
      errorPotreroOrigenVenta({
        tipo: 'compra',
        esHato: false,
        esEdicion: false,
        filas: [fila()],
        cantidadCabezas: cabezas,
      })
    ).toBeNull();
  });

  it('no exige potrero al editar (el movimiento ya existe)', () => {
    expect(
      errorPotreroOrigenVenta({
        tipo: 'venta',
        esHato: false,
        esEdicion: true,
        filas: [fila()],
        cantidadCabezas: cabezas,
      })
    ).toBeNull();
  });

  it('no exige potrero en una venta del hato lechero', () => {
    expect(
      errorPotreroOrigenVenta({
        tipo: 'venta',
        esHato: true,
        esEdicion: false,
        filas: [fila()],
        cantidadCabezas: 1,
      })
    ).toBeNull();
  });

  it('exige que el reparto sume exactamente las cabezas', () => {
    expect(
      errorPotreroOrigenVenta({
        tipo: 'venta',
        esHato: false,
        esEdicion: false,
        filas: [fila({ potrero_id: 'p1', novillos: 5 })],
        cantidadCabezas: cabezas,
      })
    ).toMatch(/12 cabezas/);
  });
});
