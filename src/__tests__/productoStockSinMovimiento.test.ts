// ARCHIVO: __tests__/productoStockSinMovimiento.test.ts
// DESCRIPCIÓN: `productos.cantidad_actual` es SALDO DE INVENTARIO. Solo puede
// cambiar junto con la fila de `movimientos_inventario` que lo explica.
//
// `ProductForm` en modo EDICIÓN mandaba `{ ...formData }` completo al UPDATE.
// Como `cantidad_actual` es un campo más del formulario, el saldo viajaba con
// el resto y se sobrescribía SIN movimiento: una mutación de stock sin rastro.
//
// El defecto era invisible a un grep. Los cuatro escritores legítimos
// (`NuevoMovimientoModal`, `NewPurchase`, `PurchaseHistory`, `CierreAplicacion`)
// escriben `cantidad_actual:` de forma explícita y todos insertan su movimiento;
// este escribía el mismo campo montado en un spread, sin nombrarlo nunca.
//
// Evidencia en producción (2026-08-10): 5 productos activos tienen desfase
// entre `cantidad_actual` y la suma de sus `movimientos_inventario` Y su
// `updated_at` es POSTERIOR al último movimiento -- el orden que deja este bug.
// El peor es Sulcamag: un único movimiento de +8.000, `cantidad_actual = 16`,
// `updated_at` 9 días después del movimiento. -7.984 sin una sola fila que lo
// explique.
//
// El camino correcto para corregir un saldo ya existe: `NuevoMovimientoModal`
// con `tipo = 'Ajuste'`, que inserta en `movimientos_inventario` ANTES de tocar
// `productos` (NuevoMovimientoModal.tsx:133 -> :150).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepararDatosProducto } from '@/components/inventory/ProductForm';

/** Formulario mínimo: solo los campos que este contrato mira. El helper
 * recibe el ProductData completo en producción, pero es agnóstico al resto. */
const formulario = {
  nombre: 'Naturboro',
  categoria: 'Fertilizante',
  cantidad_actual: 999,
  stock_minimo: 5,
  precio_unitario: 1200,
  registro_ica: '',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixture parcial a propósito
} as any;

describe('prepararDatosProducto — el saldo de inventario no viaja en un UPDATE', () => {
  it('en EDICIÓN elimina cantidad_actual del payload', () => {
    const datos = prepararDatosProducto(formulario, true);

    // Este es el assert que fallaba: antes del arreglo `cantidad_actual` salía
    // en el objeto con el valor del input y se escribía en `productos`.
    expect('cantidad_actual' in datos).toBe(false);
  });

  it('en EDICIÓN sí deja pasar el resto de los campos del producto', () => {
    const datos = prepararDatosProducto(formulario, true);

    expect(datos.nombre).toBe('Naturboro');
    expect(datos.categoria).toBe('Fertilizante');
    expect(datos.stock_minimo).toBe(5);
    expect(datos.precio_unitario).toBe(1200);
  });

  it('en CREACIÓN sí incluye cantidad_actual: es el saldo de apertura', () => {
    const datos = prepararDatosProducto(formulario, false);

    expect(datos.cantidad_actual).toBe(999);
    expect(datos.activo).toBe(true);
  });

  it('convierte los strings vacíos a null, no a 0 -- "sin dato" no es "cero"', () => {
    const datos = prepararDatosProducto(formulario, true);

    expect(datos.registro_ica).toBeNull();
  });

  it('no marca `activo` en EDICIÓN -- reactivaría un producto dado de baja', () => {
    const datos = prepararDatosProducto(formulario, true);

    expect('activo' in datos).toBe(false);
  });
});

// ============================================================================
// Guard estático: nadie más puede escribir el saldo sin dejar movimiento.
//
// El helper de arriba cierra ProductForm, pero el patrón que lo causó -- mandar
// un objeto de formulario entero a `productos` -- puede repetirse en cualquier
// pantalla nueva. Los escritores legítimos están enumerados; cualquier archivo
// que escriba `cantidad_actual` a `productos` sin insertar en
// `movimientos_inventario` en el mismo archivo rompe el contrato.
// ============================================================================

/** Archivos autorizados a mover el saldo, cada uno con su movimiento al lado. */
const ESCRITORES_AUTORIZADOS = [
  'src/components/inventory/NuevoMovimientoModal.tsx',
  'src/components/inventory/NewPurchase.tsx',
  'src/components/inventory/PurchaseHistory.tsx',
  'src/components/aplicaciones/CierreAplicacion.tsx',
];

describe('guard: todo escritor de productos.cantidad_actual inserta su movimiento', () => {
  it.each(ESCRITORES_AUTORIZADOS)('%s inserta en movimientos_inventario', (archivo) => {
    const fuente = readFileSync(join(process.cwd(), archivo), 'utf-8');

    expect(/cantidad_actual\s*:/.test(fuente), `${archivo} ya no escribe el saldo`).toBe(true);
    expect(
      fuente.includes("from('movimientos_inventario')"),
      `${archivo} escribe productos.cantidad_actual pero ya no toca movimientos_inventario. ` +
        'Un saldo que cambia sin movimiento es stock sin trazabilidad.',
    ).toBe(true);
  });

  it('ProductForm NO escribe el saldo: lo borra del payload en edición', () => {
    const fuente = readFileSync(
      join(process.cwd(), 'src/components/inventory/ProductForm.tsx'),
      'utf-8',
    );

    expect(
      fuente.includes('delete datos.cantidad_actual'),
      'ProductForm volvió a mandar cantidad_actual en el UPDATE. Eso sobrescribe el ' +
        'saldo de inventario sin dejar fila en movimientos_inventario. Para corregir un ' +
        "saldo está NuevoMovimientoModal con tipo 'Ajuste'.",
    ).toBe(true);
  });
});
