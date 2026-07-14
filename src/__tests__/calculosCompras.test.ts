import { describe, it, expect } from 'vitest';
import { calcularPrecioAutoFillBulto, calcularTotalesCompra } from '@/utils/calculosCompras';

describe('calcularPrecioAutoFillBulto', () => {
  it('usa precio_por_presentacion cuando está disponible', () => {
    const precio = calcularPrecioAutoFillBulto({
      precio_por_presentacion: 191400,
      precio_unitario: 3828,
      presentacion_kg_l: 50,
    });
    expect(precio).toBe(191400);
  });

  it('cae a precio_unitario × presentacion_kg_l cuando falta precio_por_presentacion', () => {
    const precio = calcularPrecioAutoFillBulto({
      precio_por_presentacion: null,
      precio_unitario: 3828,
      presentacion_kg_l: 50,
    });
    expect(precio).toBe(191400);
  });

  it('regresión: nunca usa precio_unitario ($/kg) directo como precio por bulto en presentaciones > 1', () => {
    // Caso real que causó el bug: fertilizante en bultos de 50kg con precio_unitario = $/kg
    const producto = {
      precio_por_presentacion: null,
      precio_unitario: 3719.64,
      presentacion_kg_l: 50,
    };
    const precio = calcularPrecioAutoFillBulto(producto);
    expect(precio).not.toBe(producto.precio_unitario);
    expect(precio).toBe(185982);
  });

  it('presentación de 1 (ej. productos líquidos por litro) no distorsiona el precio', () => {
    const precio = calcularPrecioAutoFillBulto({
      precio_por_presentacion: null,
      precio_unitario: 43795,
      presentacion_kg_l: 1,
    });
    expect(precio).toBe(43795);
  });

  it('retorna 0 sin datos de precio', () => {
    const precio = calcularPrecioAutoFillBulto({
      precio_por_presentacion: null,
      precio_unitario: null,
      presentacion_kg_l: 50,
    });
    expect(precio).toBe(0);
  });
});

describe('calcularTotalesCompra', () => {
  it('calcula cantidad total, costo total y precio unitario real', () => {
    const totales = calcularTotalesCompra(38, 191400, 50);
    expect(totales.cantidadTotal).toBe(1900);
    expect(totales.costoTotal).toBe(7273200);
    expect(totales.precioUnitarioReal).toBeCloseTo(3828, 2);
  });

  it('retorna ceros cuando algún input es inválido', () => {
    expect(calcularTotalesCompra(0, 191400, 50)).toEqual({
      cantidadTotal: 0,
      costoTotal: 0,
      precioUnitarioReal: 0,
    });
    expect(calcularTotalesCompra(38, 0, 50)).toEqual({
      cantidadTotal: 0,
      costoTotal: 0,
      precioUnitarioReal: 0,
    });
    expect(calcularTotalesCompra(38, 191400, 0)).toEqual({
      cantidadTotal: 0,
      costoTotal: 0,
      precioUnitarioReal: 0,
    });
  });
});
