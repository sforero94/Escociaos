import { describe, it, expect, vi } from 'vitest';
import { eliminarCompraConReversion } from '@/components/inventory/PurchaseHistory';

/**
 * Cubre el finding #28: eliminar una compra restaba stock sin dejar rastro en
 * `movimientos_inventario` -- dos errores tragados en silencio:
 *   1. Un `.delete().eq('compra_id', ...)` contra una tabla que no tiene esa columna.
 *   2. Un `.insert()` con `tipo_movimiento: 'Salida'`, que no es una etiqueta válida
 *      del ENUM (`Entrada` | `Salida por Aplicación` | `Salida Otros` | `Ajuste`).
 *
 * Estos tests no usan @testing-library/react (no está instalado en este repo, ver
 * `accionesRecomendadasComponentes.test.tsx`) -- `eliminarCompraConReversion` recibe
 * el cliente de Supabase por parámetro, así que se prueba directamente sin renderizar
 * el componente, con un stub construido a mano por tabla (mismo espíritu que el
 * `createChainableMock` de `aplicacionesReales.test.ts`).
 */

type PurchaseFixture = Parameters<typeof eliminarCompraConReversion>[1];

function crearCompra(overrides: Partial<PurchaseFixture> = {}): PurchaseFixture {
  return {
    id: 'compra-1',
    fecha_compra: '2026-08-01',
    proveedor: 'Agroinsumos S.A.',
    numero_factura: 'F-001',
    producto_id: 'prod-1',
    cantidad: 20,
    unidad: 'Kilos',
    numero_lote_producto: null,
    fecha_vencimiento: null,
    costo_unitario: 5000,
    costo_total: 100000,
    link_factura: null,
    usuario_registro: 'consuelo@escocia.co',
    created_at: '2026-08-01T10:00:00Z',
    ...overrides,
  };
}

interface StubOptions {
  cantidadActualProducto?: number;
  productoFetchError?: { message: string } | null;
  movimientoInsertError?: { message: string } | null;
  productoUpdateError?: { message: string } | null;
  compraDeleteError?: { message: string } | null;
  rpcError?: { message: string } | null;
  /** Compra anterior del mismo producto que sobrevive al borrado (null = no hay ninguna). */
  compraAnterior?: { costo_unitario: number } | null;
  compraAnteriorError?: { message: string } | null;
}

/** Registro de llamadas por tabla/método, en el orden real en que ocurrieron. */
function crearSupabaseStub(options: StubOptions = {}) {
  const orden: string[] = [];

  const productosMock = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({
            data: { cantidad_actual: options.cantidadActualProducto ?? 100 },
            error: options.productoFetchError ?? null,
          }),
        ),
      })),
    })),
    update: vi.fn((payload: Record<string, unknown>) => {
      orden.push('productos.update');
      return {
        eq: vi.fn(() => Promise.resolve({ error: options.productoUpdateError ?? null })),
        _payload: payload,
      };
    }),
  };

  const movimientosMock = {
    insert: vi.fn((payload: Record<string, unknown>) => {
      orden.push('movimientos_inventario.insert');
      return Promise.resolve({ error: options.movimientoInsertError ?? null, _payload: payload });
    }),
    delete: vi.fn(() => {
      orden.push('movimientos_inventario.delete');
      return { eq: vi.fn(() => Promise.resolve({ error: null })) };
    }),
  };

  // Cadena de la consulta a la compra anterior:
  //   .select().eq().neq().order().order().limit().maybeSingle()
  const compraAnteriorFiltros = {
    eq: vi.fn(() => compraAnteriorFiltros),
    neq: vi.fn(() => compraAnteriorFiltros),
    order: vi.fn(() => compraAnteriorFiltros),
    limit: vi.fn(() => compraAnteriorFiltros),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: options.compraAnterior ?? null,
        error: options.compraAnteriorError ?? null,
      }),
    ),
  };

  const comprasMock = {
    select: vi.fn(() => {
      orden.push('compras.select');
      return compraAnteriorFiltros;
    }),
    delete: vi.fn(() => {
      orden.push('compras.delete');
      return { eq: vi.fn(() => Promise.resolve({ error: options.compraDeleteError ?? null })) };
    }),
  };

  const rpc = vi.fn(() => {
    orden.push('rpc.fn_cleanup_compra_dependencies');
    return Promise.resolve({ error: options.rpcError ?? null });
  });

  const storageRemove = vi.fn(() => Promise.resolve({ error: null }));

  const from = vi.fn((table: string) => {
    if (table === 'productos') return productosMock;
    if (table === 'movimientos_inventario') return movimientosMock;
    if (table === 'compras') return comprasMock;
    throw new Error(`Tabla no mockeada en el stub: ${table}`);
  });

  return {
    from,
    rpc,
    storage: { from: vi.fn(() => ({ remove: storageRemove })) },
    // Expuestos para inspeccionar llamadas desde los tests
    _spies: { productosMock, movimientosMock, comprasMock, compraAnteriorFiltros, rpc, storageRemove },
    _orden: orden,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('eliminarCompraConReversion', () => {
  it('camino feliz: escribe el ajuste en el ledger ANTES de tocar el stock, con una etiqueta válida del ENUM', async () => {
    const supabase = crearSupabaseStub({ cantidadActualProducto: 100 });
    const compra = crearCompra({ cantidad: 20 });

    await eliminarCompraConReversion(supabase, compra, 'consuelo@escocia.co');

    // El ledger se escribe antes que el stock -- si el ledger falla, el stock nunca se toca.
    expect(supabase._orden.indexOf('movimientos_inventario.insert')).toBeLessThan(
      supabase._orden.indexOf('productos.update'),
    );

    const [payloadMovimiento] = supabase._spies.movimientosMock.insert.mock.calls[0];
    expect(payloadMovimiento.tipo_movimiento).toBe('Salida Otros');
    expect(payloadMovimiento.tipo_movimiento).not.toBe('Salida'); // etiqueta inválida del ENUM
    expect(payloadMovimiento.cantidad).toBe(20);
    expect(payloadMovimiento.saldo_anterior).toBe(100);
    expect(payloadMovimiento.saldo_nuevo).toBe(80);

    const [payloadProducto] = supabase._spies.productosMock.update.mock.calls[0];
    expect(payloadProducto.cantidad_actual).toBe(80);

    // Nunca se borra por compra_id -- movimientos_inventario no tiene esa columna.
    expect(supabase._spies.movimientosMock.delete).not.toHaveBeenCalled();

    expect(supabase._spies.comprasMock.delete).toHaveBeenCalledTimes(1);
  });

  it('si falla el insert del ledger (p.ej. etiqueta inválida), aborta y deja el stock intacto', async () => {
    const supabase = crearSupabaseStub({
      cantidadActualProducto: 100,
      movimientoInsertError: { message: 'invalid input value for enum tipo_movimiento: "Salida"' },
    });
    const compra = crearCompra({ cantidad: 20 });

    await expect(eliminarCompraConReversion(supabase, compra, 'consuelo@escocia.co')).rejects.toThrow(
      /movimiento de ajuste/i,
    );

    expect(supabase._spies.productosMock.update).not.toHaveBeenCalled();
    expect(supabase._spies.comprasMock.delete).not.toHaveBeenCalled();
  });

  it('no permite dejar el inventario en negativo, y no escribe nada si el guard dispara', async () => {
    const supabase = crearSupabaseStub({ cantidadActualProducto: 10 });
    const compra = crearCompra({ cantidad: 20 }); // 10 - 20 = -10

    await expect(eliminarCompraConReversion(supabase, compra, 'consuelo@escocia.co')).rejects.toThrow(
      /inventario negativo/i,
    );

    expect(supabase._spies.movimientosMock.insert).not.toHaveBeenCalled();
    expect(supabase._spies.productosMock.update).not.toHaveBeenCalled();
    expect(supabase._spies.comprasMock.delete).not.toHaveBeenCalled();
  });

  it('si falla la actualización de stock después del ledger, aborta antes de borrar la compra', async () => {
    const supabase = crearSupabaseStub({
      cantidadActualProducto: 100,
      productoUpdateError: { message: 'timeout' },
    });
    const compra = crearCompra({ cantidad: 20 });

    await expect(eliminarCompraConReversion(supabase, compra, 'consuelo@escocia.co')).rejects.toThrow(
      /actualizar inventario/i,
    );

    expect(supabase._spies.comprasMock.delete).not.toHaveBeenCalled();
  });

  /**
   * Finding #50: `NewPurchase.tsx` escribe `cantidad_actual` Y `precio_unitario` en un
   * mismo UPDATE, pero la reversión sólo devolvía la cantidad. Resultado: el producto se
   * quedaba con el precio de la compra borrada para siempre y sin rastro en el ledger —
   * y `productos.precio_unitario` alimenta el costo de insumos de costo/kg por lote
   * (`calculosCostoKg.ts`) y el KPI de valor de inventario.
   *
   * Caso probado en producción (2026-07-24): Sulcamag quedó con `precio_unitario` 669,96
   * —el de la factura 4379, cargada contra el producto equivocado y luego revertida—
   * mientras `cantidad_actual` sí volvió a 16,00.
   */
  describe('reversión de precio_unitario (finding #50)', () => {
    it('restaura el precio de la compra anterior del mismo producto, en el MISMO update que la cantidad', async () => {
      const supabase = crearSupabaseStub({
        cantidadActualProducto: 100,
        compraAnterior: { costo_unitario: 4200 },
      });
      const compra = crearCompra({ cantidad: 20, costo_unitario: 5000 });

      await eliminarCompraConReversion(supabase, compra, 'consuelo@escocia.co');

      expect(supabase._spies.productosMock.update).toHaveBeenCalledTimes(1);
      const [payloadProducto] = supabase._spies.productosMock.update.mock.calls[0];
      expect(payloadProducto.cantidad_actual).toBe(80);
      expect(payloadProducto.precio_unitario).toBe(4200);
      // Jamás se conserva el precio de la compra que se está borrando.
      expect(payloadProducto.precio_unitario).not.toBe(5000);
    });

    it('sin compra anterior deja precio_unitario en NULL — nunca conserva el de la compra borrada', async () => {
      const supabase = crearSupabaseStub({
        cantidadActualProducto: 100,
        compraAnterior: null,
      });
      const compra = crearCompra({ cantidad: 20, costo_unitario: 669.96 });

      await eliminarCompraConReversion(supabase, compra, 'consuelo@escocia.co');

      const [payloadProducto] = supabase._spies.productosMock.update.mock.calls[0];
      expect(payloadProducto).toHaveProperty('precio_unitario');
      expect(payloadProducto.precio_unitario).toBeNull();
    });

    it('excluye la compra que se está borrando y toma la más reciente que queda', async () => {
      const supabase = crearSupabaseStub({
        cantidadActualProducto: 100,
        compraAnterior: { costo_unitario: 4200 },
      });
      const compra = crearCompra({ id: 'compra-1', producto_id: 'prod-1', cantidad: 20 });

      await eliminarCompraConReversion(supabase, compra, 'consuelo@escocia.co');

      const filtros = supabase._spies.compraAnteriorFiltros;
      expect(filtros.eq).toHaveBeenCalledWith('producto_id', 'prod-1');
      expect(filtros.neq).toHaveBeenCalledWith('id', 'compra-1');
      expect(filtros.order).toHaveBeenCalledWith('fecha_compra', { ascending: false });
      expect(filtros.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(filtros.limit).toHaveBeenCalledWith(1);
    });

    it('si la lectura de la compra anterior falla, aborta ANTES de escribir el ledger y el stock', async () => {
      const supabase = crearSupabaseStub({
        cantidadActualProducto: 100,
        compraAnteriorError: { message: 'timeout' },
      });
      const compra = crearCompra({ cantidad: 20 });

      await expect(
        eliminarCompraConReversion(supabase, compra, 'consuelo@escocia.co'),
      ).rejects.toThrow(/compra anterior/i);

      expect(supabase._spies.movimientosMock.insert).not.toHaveBeenCalled();
      expect(supabase._spies.productosMock.update).not.toHaveBeenCalled();
      expect(supabase._spies.comprasMock.delete).not.toHaveBeenCalled();
    });

    it('la compra anterior se lee antes de escribir nada', async () => {
      const supabase = crearSupabaseStub({
        cantidadActualProducto: 100,
        compraAnterior: { costo_unitario: 4200 },
      });

      await eliminarCompraConReversion(supabase, crearCompra({ cantidad: 20 }), null);

      expect(supabase._orden).toContain('compras.select');
      expect(supabase._orden.indexOf('compras.select')).toBeLessThan(
        supabase._orden.indexOf('movimientos_inventario.insert'),
      );
    });
  });

  it('la limpieza de gasto pendiente y de la factura son no bloqueantes: un error ahí no impide eliminar la compra', async () => {
    const supabase = crearSupabaseStub({
      cantidadActualProducto: 100,
      rpcError: { message: 'no permitido' },
    });
    const compra = crearCompra({ cantidad: 20, link_factura: 'facturas/f-001.pdf' });

    await expect(eliminarCompraConReversion(supabase, compra, 'consuelo@escocia.co')).resolves.toBeUndefined();

    expect(supabase._spies.comprasMock.delete).toHaveBeenCalledTimes(1);
  });
});
