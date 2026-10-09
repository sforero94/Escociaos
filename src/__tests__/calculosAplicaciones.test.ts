// Tests de caracterización de src/utils/calculosAplicaciones.ts (hallazgo ESCO-145).
//
// Este motor calcula la dosis por lote y la lista de compras de la calculadora de
// aplicaciones (trazabilidad GlobalGAP) y no tenía ningún test. Estos casos FIJAN
// el comportamiento ACTUAL, no el deseado: no cambian nada del módulo. Donde el
// comportamiento actual parece un defecto, el test lo fija igual y lo marca con
// "COMPORTAMIENTO ACTUAL, posible defecto" para que un cambio futuro sea deliberado.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  usaCanecas,
  unidadAplicacion,
  calcularFumigacion,
  calcularFertilizacion,
  calcularTotalesProductos,
  calcularTotalesGlobalesProductos,
  generarListaCompras,
  validarLoteFumigacion,
  validarProductoFumigacion,
  validarProductoFertilizacion,
} from '@/utils/calculosAplicaciones';
import type {
  LoteSeleccionado,
  Mezcla,
  ProductoEnMezcla,
  ProductoCatalogo,
  CalculosPorLote,
} from '@/types/aplicaciones';

function lote(overrides: Partial<LoteSeleccionado> = {}): LoteSeleccionado {
  return {
    lote_id: 'l1',
    nombre: 'Lote 1',
    area_hectareas: 5,
    conteo_arboles: { grandes: 0, medianos: 0, pequenos: 0, clonales: 0, total: 1000 },
    calibracion_litros_arbol: 2,
    tamano_caneca: 200,
    ...overrides,
  };
}

function producto(overrides: Partial<ProductoEnMezcla> = {}): ProductoEnMezcla {
  return {
    producto_id: 'pA',
    producto_nombre: 'Producto A',
    producto_categoria: 'Fungicida',
    producto_unidad: 'Litros',
    cantidad_total_necesaria: 0,
    ...overrides,
  };
}

function mezcla(productos: ProductoEnMezcla[], overrides: Partial<Mezcla> = {}): Mezcla {
  return { id: 'm1', nombre: 'Mezcla 1', numero_orden: 1, productos, ...overrides };
}

function catalogo(overrides: Partial<ProductoCatalogo> = {}): ProductoCatalogo {
  return {
    id: 'pA',
    nombre: 'Producto A',
    categoria: 'Fertilizante',
    grupo: 'Fertilizantes',
    unidad_medida: 'Kilos',
    estado_fisico: 'solido',
    presentacion_comercial: 'Bulto de 25kg',
    precio_presentacion: 100000,
    ultimo_precio_unitario: 4000,
    cantidad_actual: 0,
    permitido_gerencia: true,
    ...overrides,
  };
}

describe('usaCanecas / unidadAplicacion', () => {
  it('solo Fertilización usa bultos; Fumigación, Drench y cualquier otro valor usan canecas', () => {
    expect(usaCanecas('Fertilización')).toBe(false);
    expect(usaCanecas('Fumigación')).toBe(true);
    expect(usaCanecas('Drench')).toBe(true);
    expect(usaCanecas(null)).toBe(true);
    expect(usaCanecas(undefined)).toBe(true);
    expect(unidadAplicacion('Fertilización')).toBe('bultos');
    expect(unidadAplicacion('Drench')).toBe('canecas');
  });
});

describe('calcularFumigacion', () => {
  it('caso típico: 1.000 árboles × 2 L/árbol en canecas de 200 L', () => {
    const r = calcularFumigacion(
      lote(),
      mezcla([
        producto({ producto_id: 'pA', dosis_por_caneca: 250 }),
        producto({ producto_id: 'pB', dosis_por_caneca: 0.5 }),
      ]),
    );
    expect(r).toEqual({
      lote_id: 'l1',
      lote_nombre: 'Lote 1',
      total_arboles: 1000,
      litros_mezcla: 2000,
      numero_canecas: 10,
      productos: [
        { producto_id: 'pA', cantidad_necesaria: 2.5 },
        // 10 × 0,5 / 1000 = 0,005 → redondeo hacia ARRIBA a 2 decimales = 0,01
        { producto_id: 'pB', cantidad_necesaria: 0.01 },
      ],
    });
  });

  it('el producto se calcula con las canecas SIN redondear; las canecas mostradas se redondean hacia arriba', () => {
    const r = calcularFumigacion(
      lote({ conteo_arboles: { grandes: 0, medianos: 0, pequenos: 0, clonales: 0, total: 333 }, calibracion_litros_arbol: 1.5 }),
      mezcla([producto({ dosis_por_caneca: 100 })]),
    );
    expect(r.litros_mezcla).toBe(499.5);
    expect(r.numero_canecas).toBe(2.5); // 2,4975 → 2,5
    expect(r.productos[0].cantidad_necesaria).toBe(0.25); // 2,4975 × 100 / 1000 = 0,24975 → 0,25
  });

  it('sin calibración da 0 litros y 0 canecas; sin tamaño de caneca usa 200 L', () => {
    const sinCalibracion = calcularFumigacion(
      lote({ calibracion_litros_arbol: undefined }),
      mezcla([producto({ dosis_por_caneca: 250 })]),
    );
    expect(sinCalibracion.litros_mezcla).toBe(0);
    expect(sinCalibracion.numero_canecas).toBe(0);
    expect(sinCalibracion.productos[0].cantidad_necesaria).toBe(0);

    const sinCaneca = calcularFumigacion(lote({ tamano_caneca: undefined }), mezcla([producto({ dosis_por_caneca: 250 })]));
    expect(sinCaneca.numero_canecas).toBe(10);
  });

  it('un producto sin dosis_por_caneca aporta 0', () => {
    const r = calcularFumigacion(lote(), mezcla([producto({ dosis_por_caneca: undefined })]));
    expect(r.productos[0].cantidad_necesaria).toBe(0);
  });

  it('COMPORTAMIENTO ACTUAL, posible defecto: Math.ceil sobre ruido de coma flotante suma 0,01', () => {
    // 2.200 L / 200 = 11 canecas × 100 cc / 1000 = 1,1 L exactos. Pero 1,1 × 100 en coma
    // flotante es 110,00000000000001, y Math.ceil lo sube a 111 → 1,11 L.
    const r = calcularFumigacion(
      lote({ conteo_arboles: { grandes: 0, medianos: 0, pequenos: 0, clonales: 0, total: 1100 } }),
      mezcla([producto({ dosis_por_caneca: 100 })]),
    );
    expect(r.numero_canecas).toBe(11);
    expect(r.productos[0].cantidad_necesaria).toBe(1.11);
  });
});

describe('calcularFertilizacion', () => {
  const conteo = { grandes: 100, medianos: 50, pequenos: 20, clonales: 10, total: 180 };

  it('caso típico: dosis en gramos por tamaño de árbol → kilos y bultos de mezcla de 50 kg', () => {
    const r = calcularFertilizacion(
      lote({ conteo_arboles: conteo }),
      mezcla([
        producto({ producto_id: 'pA', producto_unidad: 'Kilos', dosis_grandes: 500, dosis_medianos: 300, dosis_pequenos: 100, dosis_clonales: 200 }),
        producto({ producto_id: 'pB', producto_unidad: 'Kilos', dosis_grandes: 200 }),
      ]),
    );
    expect(r).toEqual({
      lote_id: 'l1',
      lote_nombre: 'Lote 1',
      total_arboles: 180,
      kilos_totales: 89,
      numero_bultos: 2, // 89 / 50 = 1,78 → medio bulto hacia arriba = 2
      kilos_grandes: 70,
      kilos_medianos: 15,
      kilos_pequenos: 2,
      kilos_clonales: 2,
      productos: [
        { producto_id: 'pA', cantidad_necesaria: 69 },
        { producto_id: 'pB', cantidad_necesaria: 20 },
      ],
    });
  });

  it('los bultos redondean a MEDIOS bultos hacia arriba', () => {
    const exacto = calcularFertilizacion(
      lote({ conteo_arboles: { grandes: 1000, medianos: 0, pequenos: 0, clonales: 0, total: 1000 } }),
      mezcla([producto({ dosis_grandes: 1000 })]),
    );
    expect(exacto.kilos_totales).toBe(1000);
    expect(exacto.numero_bultos).toBe(20);

    const unKiloMas = calcularFertilizacion(
      lote({ conteo_arboles: { grandes: 1001, medianos: 0, pequenos: 0, clonales: 0, total: 1001 } }),
      mezcla([producto({ dosis_grandes: 1000 })]),
    );
    expect(unKiloMas.kilos_totales).toBe(1001);
    expect(unKiloMas.numero_bultos).toBe(20.5);
  });

  it('ignora la calibración y el tamaño de caneca, y no devuelve campos de fumigación', () => {
    const r = calcularFertilizacion(lote({ conteo_arboles: conteo }), mezcla([producto({ dosis_grandes: 500 })]));
    expect(r.litros_mezcla).toBeUndefined();
    expect(r.numero_canecas).toBeUndefined();
  });

  it('COMPORTAMIENTO ACTUAL: kilos_totales suma productos en Litros y en Kilos como una sola cifra', () => {
    const r = calcularFertilizacion(
      lote({ conteo_arboles: { grandes: 100, medianos: 0, pequenos: 0, clonales: 0, total: 100 } }),
      mezcla([
        producto({ producto_id: 'pS', producto_unidad: 'Kilos', dosis_grandes: 500 }),
        producto({ producto_id: 'pL', producto_unidad: 'Litros', dosis_grandes: 100 }),
      ]),
    );
    expect(r.kilos_totales).toBe(60); // 50 kg + 10 L
    expect(r.numero_bultos).toBe(1.5);
  });
});

describe('calcularTotalesProductos', () => {
  const calculos: CalculosPorLote[] = [
    { lote_id: 'l1', lote_nombre: 'Lote 1', total_arboles: 1000, productos: [{ producto_id: 'pA', cantidad_necesaria: 2.5 }, { producto_id: 'pB', cantidad_necesaria: 0.01 }] },
    { lote_id: 'l2', lote_nombre: 'Lote 2', total_arboles: 500, productos: [{ producto_id: 'pA', cantidad_necesaria: 1.25 }, { producto_id: 'pX', cantidad_necesaria: 9 }] },
  ];

  it('suma por producto todos los lotes; ignora productos que no están en ninguna mezcla', () => {
    const mezclas = [
      mezcla([producto({ producto_id: 'pA', dosis_por_caneca: 250, cantidad_total_necesaria: 99 }), producto({ producto_id: 'pB' })]),
      mezcla([producto({ producto_id: 'pC' })], { id: 'm2' }),
    ];
    const r = calcularTotalesProductos(calculos, mezclas);
    expect(r.map(p => [p.producto_id, p.cantidad_total_necesaria])).toEqual([
      ['pA', 3.75],
      ['pB', 0.01],
      ['pC', 0], // en una mezcla pero sin cálculo → 0
    ]);
    // Conserva el resto de campos del producto de la mezcla
    expect(r[0].dosis_por_caneca).toBe(250);
    // No muta la mezcla de entrada
    expect(mezclas[0].productos[0].cantidad_total_necesaria).toBe(99);
  });

  it('COMPORTAMIENTO ACTUAL, posible defecto: 0,1 + 0,2 se reporta 0,31 por el ceil sobre coma flotante', () => {
    const r = calcularTotalesProductos(
      [
        { lote_id: 'l1', lote_nombre: 'L1', total_arboles: 1, productos: [{ producto_id: 'pA', cantidad_necesaria: 0.1 }] },
        { lote_id: 'l2', lote_nombre: 'L2', total_arboles: 1, productos: [{ producto_id: 'pA', cantidad_necesaria: 0.2 }] },
      ],
      [mezcla([producto({ producto_id: 'pA' })])],
    );
    expect(r[0].cantidad_total_necesaria).toBe(0.31);
  });
});

describe('calcularTotalesGlobalesProductos', () => {
  it('suma un producto repetido en varias mezclas y conserva los campos de la primera aparición', () => {
    const m1 = mezcla([
      producto({ producto_id: 'pA', producto_nombre: 'A (m1)', cantidad_total_necesaria: 3.75 }),
      producto({ producto_id: 'pB', cantidad_total_necesaria: 2 }),
    ]);
    const m2 = mezcla([producto({ producto_id: 'pA', producto_nombre: 'A (m2)', cantidad_total_necesaria: 1.25 })], { id: 'm2' });
    const r = calcularTotalesGlobalesProductos([m1, m2]);
    expect(r.map(p => [p.producto_id, p.producto_nombre, p.cantidad_total_necesaria])).toEqual([
      ['pA', 'A (m1)', 5],
      ['pB', 'Producto A', 2],
    ]);
    // No muta las mezclas de entrada
    expect(m1.productos[0].cantidad_total_necesaria).toBe(3.75);
  });

  it('sin mezclas devuelve lista vacía', () => {
    expect(calcularTotalesGlobalesProductos([])).toEqual([]);
  });
});

describe('generarListaCompras', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cruza necesidad con inventario, calcula unidades comerciales, costo y alertas', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const necesarios = [
      producto({ producto_id: 'pA', producto_nombre: 'Urea', producto_unidad: 'Kilos', cantidad_total_necesaria: 150 }),
      producto({ producto_id: 'pB', producto_nombre: 'Con stock', cantidad_total_necesaria: 3 }),
      producto({ producto_id: 'pC', producto_nombre: 'Sin precio', cantidad_total_necesaria: 7.5 }),
      producto({ producto_id: 'pD', producto_nombre: 'Fantasma', cantidad_total_necesaria: 1 }),
    ];
    const inventario = [
      catalogo({ id: 'pA', cantidad_actual: 0, presentacion_comercial: 'Bulto de 25kg', precio_presentacion: 100000 }),
      catalogo({ id: 'pB', cantidad_actual: 10, presentacion_comercial: 'Tarro de 1L', precio_presentacion: 50000 }),
      catalogo({ id: 'pC', cantidad_actual: 2.5, presentacion_comercial: 'Galón 3.785 L', precio_presentacion: 0, ultimo_precio_unitario: undefined }),
    ];
    const r = generarListaCompras(necesarios, inventario);

    // pD no está en inventario → se omite con un aviso en consola
    expect(warn).toHaveBeenCalledTimes(1);
    expect(r.items.map(i => i.producto_id)).toEqual(['pA', 'pB', 'pC']);

    const [a, b, c] = r.items;
    expect(a).toMatchObject({
      inventario_actual: 0,
      cantidad_necesaria: 150,
      cantidad_faltante: 150,
      unidades_a_comprar: 6,
      precio_presentacion: 100000,
      costo_estimado: 600000,
      // COMPORTAMIENTO ACTUAL: 'sin_stock' existe en el tipo pero nunca se asigna;
      // un producto sin existencias solo cuenta en productos_sin_stock.
      alerta: 'normal',
      unidad: 'Kilos',
      permitido_gerencia: true,
    });
    expect(b).toMatchObject({ cantidad_faltante: 0, unidades_a_comprar: 0, costo_estimado: 0, alerta: 'normal' });
    expect(c).toMatchObject({
      cantidad_faltante: 5,
      unidades_a_comprar: 2, // 5 / 3,785 = 1,32 → 2 galones
      costo_estimado: 0,
      ultimo_precio_unitario: 0,
      alerta: 'sin_precio',
    });

    expect(r.costo_total_estimado).toBe(600000);
    expect(r.productos_sin_precio).toBe(1);
    expect(r.productos_sin_stock).toBe(1);
  });

  it('marca sin_precio aunque no haya nada que comprar', () => {
    const r = generarListaCompras(
      [producto({ cantidad_total_necesaria: 1 })],
      [catalogo({ cantidad_actual: 10, precio_presentacion: undefined })],
    );
    expect(r.items[0].unidades_a_comprar).toBe(0);
    expect(r.items[0].alerta).toBe('sin_precio');
    expect(r.productos_sin_precio).toBe(1);
  });

  it('una presentación sin número se trata como unidad de 1', () => {
    const r = generarListaCompras(
      [producto({ cantidad_total_necesaria: 3.2 })],
      [catalogo({ presentacion_comercial: 'Caneca', precio_presentacion: 1000 })],
    );
    expect(r.items[0].unidades_a_comprar).toBe(4);
    expect(r.costo_total_estimado).toBe(4000);
  });

  it('costo_total_estimado se redondea hacia arriba al entero', () => {
    const r = generarListaCompras(
      [producto({ cantidad_total_necesaria: 1 })],
      [catalogo({ presentacion_comercial: 'Tarro de 1L', precio_presentacion: 1234.2 })],
    );
    expect(r.items[0].costo_estimado).toBe(1234.2);
    expect(r.costo_total_estimado).toBe(1235);
  });

  it('COMPORTAMIENTO ACTUAL, posible defecto: la coma decimal colombiana corta la presentación', () => {
    // "Tarro 1,5 L" se lee como 1 (el regex solo acepta punto decimal), así que se
    // compran 3 tarros para 3 L faltantes en vez de 2.
    const r = generarListaCompras(
      [producto({ cantidad_total_necesaria: 3 })],
      [catalogo({ presentacion_comercial: 'Tarro 1,5 L', precio_presentacion: 10000 })],
    );
    expect(r.items[0].unidades_a_comprar).toBe(3);
    expect(r.costo_total_estimado).toBe(30000);
  });

  it('COMPORTAMIENTO ACTUAL, posible defecto: una presentación de "0" da unidades infinitas', () => {
    const r = generarListaCompras(
      [producto({ cantidad_total_necesaria: 3 })],
      [catalogo({ presentacion_comercial: 'Bulto 0 kg', precio_presentacion: 10000 })],
    );
    expect(r.items[0].unidades_a_comprar).toBe(Infinity);
    expect(r.costo_total_estimado).toBe(Infinity);
  });
});

describe('validadores', () => {
  it('validarLoteFumigacion exige calibración > 0 y tamaño de caneca', () => {
    expect(validarLoteFumigacion(lote())).toBeNull();
    expect(validarLoteFumigacion(lote({ calibracion_litros_arbol: 0 }))).toBe('El lote Lote 1 necesita calibración (L/árbol)');
    expect(validarLoteFumigacion(lote({ tamano_caneca: undefined }))).toBe('El lote Lote 1 necesita tamaño de caneca');
  });

  it('validarProductoFumigacion exige dosis por caneca > 0', () => {
    expect(validarProductoFumigacion(producto({ dosis_por_caneca: 1 }))).toBeNull();
    expect(validarProductoFumigacion(producto({ dosis_por_caneca: 0 }))).toBe('Producto A necesita dosis por caneca');
  });

  it('validarProductoFertilizacion exige al menos una dosis por tipo de árbol', () => {
    expect(validarProductoFertilizacion(producto({ dosis_clonales: 5 }))).toBeNull();
    expect(validarProductoFertilizacion(producto())).toBe('Producto A necesita al menos una dosis por tipo de árbol');
  });
});
