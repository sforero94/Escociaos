import { describe, it, expect } from 'vitest';
import {
  costearVentasGanado,
  leerInventarioInicial,
  promedioPonderadoCompras,
  valorInventarioAFecha,
} from '@/utils/costoVentaGanado';
import type { TransaccionGanadoCruda } from '@/types/reportesFinancieros';

function compra(id: string, fecha: string, cabezas: number, valor: number): TransaccionGanadoCruda {
  return { id, fecha, tipo: 'compra', cantidad_cabezas: cabezas, kilos_pagados: null, valor_total: valor };
}
function venta(id: string, fecha: string, cabezas: number, valor: number): TransaccionGanadoCruda {
  return { id, fecha, tipo: 'venta', cantidad_cabezas: cabezas, kilos_pagados: null, valor_total: valor };
}

describe('promedio ponderado de compras', () => {
  it('pondera por cabezas, no por transacción', () => {
    // 10 cabezas a 1M + 90 a 2M → 1.9M, no el promedio simple de 1.5M
    const promedio = promedioPonderadoCompras([
      compra('a', '2026-01-01', 10, 10_000_000),
      compra('b', '2026-02-01', 90, 180_000_000),
    ]);
    expect(promedio).toBe(1_900_000);
  });

  it('devuelve 0 sin compras en vez de dividir por cero', () => {
    expect(promedioPonderadoCompras([venta('v', '2026-01-01', 5, 20_000_000)])).toBe(0);
  });
});

describe('costeo por promedio ponderado móvil', () => {
  it('recalcula el costo unitario con cada compra', () => {
    const resultado = costearVentasGanado(
      [
        compra('c1', '2026-01-01', 10, 20_000_000), // 2M/cabeza
        compra('c2', '2026-02-01', 10, 40_000_000), // ahora 20 cabezas por 60M → 3M/cabeza
        venta('v1', '2026-03-01', 5, 25_000_000),
      ],
      null
    );

    expect(resultado.ventas).toHaveLength(1);
    expect(resultado.ventas[0].cogs).toBe(15_000_000); // 5 × 3M
    expect(resultado.cabezasFinales).toBe(15);
    expect(resultado.valorInventarioFinal).toBe(45_000_000);
    expect(resultado.cabezasSinRespaldo).toBe(0);
  });

  it('una venta posterior usa el costo que dejó la venta anterior', () => {
    const resultado = costearVentasGanado(
      [
        compra('c1', '2026-01-01', 10, 20_000_000),
        venta('v1', '2026-02-01', 4, 12_000_000),
        compra('c2', '2026-03-01', 10, 50_000_000), // 6@2M + 10@5M = 62M / 16
        venta('v2', '2026-04-01', 8, 40_000_000),
      ],
      null
    );
    expect(resultado.ventas[0].cogs).toBe(8_000_000); // 4 × 2M
    expect(resultado.ventas[1].cogs).toBeCloseTo(8 * (62_000_000 / 16), 6);
  });

  it('la compra nunca produce un evento de costo: es inventario, no gasto', () => {
    const resultado = costearVentasGanado([compra('c1', '2026-01-01', 10, 20_000_000)], null);
    expect(resultado.ventas).toHaveLength(0);
    expect(resultado.valorInventarioFinal).toBe(20_000_000);
  });
});

describe('ventas sin inventario que las respalde', () => {
  it('costea el faltante al promedio de compras, nunca a cero', () => {
    // Es el caso real de producción: 571 cabezas compradas, 801 vendidas.
    const resultado = costearVentasGanado(
      [compra('c1', '2026-01-01', 10, 30_000_000), venta('v1', '2026-02-01', 15, 60_000_000)],
      null
    );

    // 10 respaldadas a 3M + 5 faltantes al promedio de compras (3M) = 45M
    expect(resultado.ventas[0].cogs).toBe(45_000_000);
    expect(resultado.cabezasSinRespaldo).toBe(5);
    expect(resultado.cabezasFinales).toBe(0);
  });

  it('advierte que falta el inventario inicial cuando no está cargado', () => {
    const resultado = costearVentasGanado(
      [compra('c1', '2026-01-01', 10, 30_000_000), venta('v1', '2026-02-01', 15, 60_000_000)],
      null
    );
    expect(resultado.advertencias.map((a) => a.codigo)).toContain('ganado_sin_costo_inicial');
    expect(resultado.advertencias[0].valor).toBe(5);
    expect(resultado.advertencias[0].formatoValor).toBe('unidades');
  });

  it('con inventario inicial cargado, el faltante es otro problema y otra advertencia', () => {
    const resultado = costearVentasGanado(
      [venta('v1', '2026-02-01', 15, 60_000_000)],
      { cabezas: 10, costoPorCabeza: 2_000_000 }
    );
    expect(resultado.advertencias.map((a) => a.codigo)).toContain('ganado_venta_sin_inventario');
  });

  it('el inventario inicial elimina el faltante cuando alcanza', () => {
    const conInicial = costearVentasGanado(
      [venta('v1', '2026-02-01', 15, 60_000_000)],
      { cabezas: 20, costoPorCabeza: 2_000_000 }
    );
    expect(conInicial.cabezasSinRespaldo).toBe(0);
    expect(conInicial.ventas[0].cogs).toBe(30_000_000); // 15 × 2M
    expect(conInicial.advertencias).toHaveLength(0);
  });
});

describe('el costeo es path-dependent', () => {
  it('truncar el histórico cambia el costo de venta', () => {
    const serieCompleta = [
      compra('c1', '2025-01-01', 10, 10_000_000), // 1M/cabeza
      compra('c2', '2026-01-01', 10, 30_000_000), // mezcla a 2M/cabeza
      venta('v1', '2026-06-01', 5, 15_000_000),
    ];

    const completo = costearVentasGanado(serieCompleta, null);
    const truncado = costearVentasGanado(serieCompleta.slice(1), null);

    expect(completo.ventas[0].cogs).toBe(10_000_000); // 5 × 2M
    expect(truncado.ventas[0].cogs).toBe(15_000_000); // 5 × 3M — distinto
    expect(completo.ventas[0].cogs).not.toBe(truncado.ventas[0].cogs);
  });

  it('el orden es determinista aunque las transacciones lleguen desordenadas', () => {
    const desordenadas = [
      venta('v1', '2026-03-01', 5, 15_000_000),
      compra('c1', '2026-01-01', 10, 20_000_000),
    ];
    const resultado = costearVentasGanado(desordenadas, null);
    expect(resultado.ventas[0].cogs).toBe(10_000_000); // la compra se aplicó primero
    expect(resultado.cabezasSinRespaldo).toBe(0);
  });
});

describe('valorización del inventario a una fecha de corte', () => {
  const transacciones = [
    compra('c1', '2026-01-15', 10, 20_000_000),
    venta('v1', '2026-05-10', 4, 16_000_000),
    compra('c2', '2026-08-01', 6, 18_000_000),
  ];

  it('devuelve el estado tras el último movimiento anterior al corte', () => {
    const resultado = costearVentasGanado(transacciones, null);
    expect(valorInventarioAFecha(resultado, '2026-03-31', null)).toEqual({
      cabezas: 10,
      valor: 20_000_000,
    });
    expect(valorInventarioAFecha(resultado, '2026-06-30', null)).toEqual({
      cabezas: 6,
      valor: 12_000_000,
    });
  });

  it('antes del primer movimiento devuelve el inventario inicial', () => {
    const resultado = costearVentasGanado(transacciones, { cabezas: 3, costoPorCabeza: 1_000_000 });
    expect(valorInventarioAFecha(resultado, '2025-12-31', { cabezas: 3, costoPorCabeza: 1_000_000 })).toEqual({
      cabezas: 3,
      valor: 3_000_000,
    });
  });
});

describe('lectura del inventario inicial desde parámetros', () => {
  it('requiere ambos valores: uno solo se trata como no configurado', () => {
    expect(leerInventarioInicial([{ clave: 'cabezas_inventario_inicial', valor: 100 }])).toBeNull();
    expect(leerInventarioInicial([{ clave: 'costo_cabeza_inventario_inicial', valor: 2_000_000 }])).toBeNull();
  });

  it('lee el par completo', () => {
    expect(
      leerInventarioInicial([
        { clave: 'cabezas_inventario_inicial', valor: 100 },
        { clave: 'costo_cabeza_inventario_inicial', valor: 2_000_000 },
        { clave: 'saldo_inicial_caja', valor: 5_000_000 },
      ])
    ).toEqual({ cabezas: 100, costoPorCabeza: 2_000_000 });
  });

  it('cero cabezas es no configurado, no un inventario vacío', () => {
    expect(
      leerInventarioInicial([
        { clave: 'cabezas_inventario_inicial', valor: 0 },
        { clave: 'costo_cabeza_inventario_inicial', valor: 2_000_000 },
      ])
    ).toBeNull();
  });
});
