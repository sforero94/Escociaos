import { describe, it, expect } from 'vitest';
import {
  calcularCoberturaLinea,
  cantidadEnUnidadBase,
  ordenarOpcionesAlfabeticamente,
  requerimientoDeLinea,
  type OpcionCobertura,
} from '../utils/stockAplicacion';
import {
  armarCoberturaAplicacion,
  describirFaltanteCobertura,
  type DatosCoberturaAplicacion,
} from '../utils/coberturaAplicacion';

const op = (id: string, requerimiento: number, saldo: number | null, registrado = 0): OpcionCobertura => ({
  producto_id: id,
  producto_nombre: `P-${id}`,
  requerimiento,
  saldo,
  registrado,
});

describe('ordenarOpcionesAlfabeticamente', () => {
  it('ordena en español sin distinguir mayúsculas ni tildes, sin tocar el original', () => {
    const entrada = [
      { producto_nombre: 'potenzol ph-D' },
      { producto_nombre: 'Álcali' },
      { producto_nombre: 'Acidurez' },
      { producto_nombre: 'acondicionador sys' },
    ];
    const orden = ordenarOpcionesAlfabeticamente(entrada).map((o) => o.producto_nombre);
    expect(orden).toEqual(['Acidurez', 'acondicionador sys', 'Álcali', 'potenzol ph-D']);
    expect(entrada[0].producto_nombre).toBe('potenzol ph-D');
  });
});

describe('cantidadEnUnidadBase', () => {
  it('cc y g (filas históricas) pasan a L / kg; el resto queda igual', () => {
    expect(cantidadEnUnidadBase(500, 'cc')).toBe(0.5);
    expect(cantidadEnUnidadBase(250, 'g')).toBe(0.25);
    expect(cantidadEnUnidadBase(3, 'Litros')).toBe(3);
    expect(cantidadEnUnidadBase(3, undefined)).toBe(3);
  });
});

describe('requerimientoDeLinea', () => {
  it('por caneca: canecas × dosis ÷ 1000', () => {
    expect(requerimientoDeLinea(true, { dosis_por_caneca: 250 }, { canecas: 12, arboles: { grandes: 0, medianos: 0, pequenos: 0, clonales: 0 } })).toBe(3);
  });
  it('por tamaño: Σ árboles × dosis ÷ 1000', () => {
    const base = { canecas: 0, arboles: { grandes: 100, medianos: 50, pequenos: 20, clonales: 10 } };
    expect(
      requerimientoDeLinea(false, { dosis_grandes: 100, dosis_medianos: 80, dosis_pequenos: 50, dosis_clonales: 0 }, base),
    ).toBeCloseTo((100 * 100 + 50 * 80 + 20 * 50) / 1000, 10);
  });
  it('sin dosis → 0', () => {
    expect(requerimientoDeLinea(true, {}, { canecas: 5, arboles: { grandes: 0, medianos: 0, pequenos: 0, clonales: 0 } })).toBe(0);
  });
});

describe('calcularCoberturaLinea — PRD §5 y criterios de aceptación §8', () => {
  it('fumigación de ácaro de octubre: tres correctores, 3,76 de bodega cubren el plan de 3,13 → sin aviso', () => {
    const r = calcularCoberturaLinea({
      linea_id: 'l1',
      nombre: 'Acidurez',
      unidad: 'canecas',
      unidadesPlaneadas: 10,
      opciones: [op('a', 3.13, 1.0), op('b', 3.13, 0.76), op('c', 3.13, 2.0)],
    });
    expect(r.alcanza).toBe(true);
    expect(r.faltan).toBe(0);
    expect(r.cobertura).toBeCloseTo(12.0128, 4);
    expect(r.pendientes).toBe(10);
  });

  it('el mismo plan con un solo producto sí avisa: es el falso faltante que había antes, medido por línea', () => {
    const r = calcularCoberturaLinea({
      linea_id: 'l1',
      nombre: 'Acidurez',
      unidad: 'canecas',
      unidadesPlaneadas: 10,
      opciones: [op('a', 3.13, 1.0)],
    });
    expect(r.alcanza).toBe(false);
    expect(r.cobertura).toBeCloseTo(3.1949, 4);
    expect(r.faltan).toBeCloseTo(6.8051, 4);
  });

  it('descuenta lo ya hecho: 1,60 registrados de 3,76 dejan pendientes 4,89 de 10 canecas', () => {
    const r = calcularCoberturaLinea({
      linea_id: 'l1',
      nombre: 'Acidurez',
      unidad: 'canecas',
      unidadesPlaneadas: 10,
      opciones: [op('a', 3.13, 1.0, 0), op('b', 3.13, 0.76, 0.4), op('c', 3.13, 2.0, 1.2)],
    });
    expect(r.hechas).toBeCloseTo(5.1118, 4);
    expect(r.pendientes).toBeCloseTo(4.8882, 4);
    expect(r.alcanza).toBe(true);
  });

  it('cada alternativo usa SU dosis: la equivalencia no es uno a uno', () => {
    // El principal rinde 10 canecas con 2 L; el alternativo gasta el doble (4 L) para las mismas 10.
    const r = calcularCoberturaLinea({
      linea_id: 'l1',
      nombre: 'P',
      unidad: 'canecas',
      unidadesPlaneadas: 10,
      opciones: [op('a', 2, 0), op('b', 4, 2)],
    });
    expect(r.cobertura).toBe(5);
    expect(r.alcanza).toBe(false);
    expect(r.faltan).toBe(5);
  });

  it('cobertura igual a pendientes alcanza (sin aviso en el borde); un 0,0001 menos no', () => {
    const justo = calcularCoberturaLinea({
      linea_id: 'l1', nombre: 'P', unidad: 'bultos', unidadesPlaneadas: 4, opciones: [op('a', 8, 4), op('b', 8, 4)],
    });
    expect(justo.alcanza).toBe(true);
    const corto = calcularCoberturaLinea({
      linea_id: 'l1', nombre: 'P', unidad: 'bultos', unidadesPlaneadas: 4, opciones: [op('a', 8, 3.9996), op('b', 8, 4)],
    });
    expect(corto.alcanza).toBe(false);
    expect(corto.faltan).toBe(0.0002);
  });

  it('redondea a 4 decimales: una diferencia por debajo de 0,00005 no genera aviso', () => {
    const r = calcularCoberturaLinea({
      linea_id: 'l1', nombre: 'P', unidad: 'canecas', unidadesPlaneadas: 3, opciones: [op('a', 3, 2.99994)],
    });
    expect(r.cobertura).toBe(2.9999);
    expect(r.alcanza).toBe(false);
    const r2 = calcularCoberturaLinea({
      linea_id: 'l1', nombre: 'P', unidad: 'canecas', unidadesPlaneadas: 3, opciones: [op('a', 3, 2.99996)],
    });
    expect(r2.cobertura).toBe(3);
    expect(r2.alcanza).toBe(true);
  });

  it('un saldo desconocido no cuenta como 0 en silencio: queda listado', () => {
    const r = calcularCoberturaLinea({
      linea_id: 'l1', nombre: 'P', unidad: 'canecas', unidadesPlaneadas: 10, opciones: [op('a', 3, 1), op('b', 3, null)],
    });
    expect(r.productosSinSaldo).toEqual(['P-b']);
    expect(r.alcanza).toBe(false);
  });

  it('una opción sin dosis calculable no aporta cobertura y queda listada', () => {
    const r = calcularCoberturaLinea({
      linea_id: 'l1', nombre: 'P', unidad: 'canecas', unidadesPlaneadas: 10, opciones: [op('a', 3, 3), op('b', 0, 50)],
    });
    expect(r.productosSinDosis).toEqual(['P-b']);
    expect(r.cobertura).toBe(10);
  });

  it('lo ya hecho puede superar lo planeado: pendientes 0 y alcanza', () => {
    const r = calcularCoberturaLinea({
      linea_id: 'l1', nombre: 'P', unidad: 'canecas', unidadesPlaneadas: 10, opciones: [op('a', 3, 0, 4)],
    });
    expect(r.pendientes).toBe(0);
    expect(r.alcanza).toBe(true);
  });
});

describe('armarCoberturaAplicacion', () => {
  const base = (): DatosCoberturaAplicacion => ({
    tipoAplicacion: 'Fumigación',
    lineas: [
      { id: 'L1', mezcla_id: 'M1', producto_id: 'acid', producto_nombre: 'Acidurez', cantidad_total_necesaria: 3.13, dosis_por_caneca: 313 },
      { id: 'L2', mezcla_id: 'M1', producto_id: 'sin', producto_nombre: 'Sin alternativos', cantidad_total_necesaria: 1, dosis_por_caneca: 100 },
    ],
    alternativos: [
      { aplicacion_producto_id: 'L1', producto_id: 'acon', producto_nombre: 'Acondicionador sys', dosis_por_caneca: 313 },
      { aplicacion_producto_id: 'L1', producto_id: 'pot', producto_nombre: 'Potenzol ph-D', dosis_por_caneca: 313 },
    ],
    calculos: [{ mezcla_id: 'M1', lote_id: 'lote1', numero_canecas: 10, numero_bultos: null }],
    arbolesPorLote: [],
    saldos: new Map([['acid', 1], ['acon', 0.76], ['pot', 2], ['sin', 0]]),
    consumos: [],
  });

  it('solo reporta las líneas con alternativos; una línea sin alternativos se comporta como hoy', () => {
    const r = armarCoberturaAplicacion(base());
    expect(r.lineas.map((l) => l.linea_id)).toEqual(['L1']);
    expect([...r.idsLineasConAlternativos]).toEqual(['L1']);
    // principal + alternativos de L1; el producto de la línea sin alternativos NO entra.
    expect([...r.productosEnLineasConAlternativos].sort()).toEqual(['acid', 'acon', 'pot']);
    expect(r.lineas[0].alcanza).toBe(true);
    expect(r.lineas[0].planeadas).toBe(10);
  });

  it('sin alternativos en toda la aplicación: resultado vacío', () => {
    const d = base();
    d.alternativos = [];
    expect(armarCoberturaAplicacion(d)).toEqual({
      lineas: [],
      idsLineasConAlternativos: new Set(),
      productosEnLineasConAlternativos: new Set(),
    });
  });

  it('descuenta lo registrado sumando principal y alternativos de la línea (en L/kg ya convertidos)', () => {
    const d = base();
    d.consumos = [
      { lote_id: 'lote1', producto_id: 'acon', cantidad_base: 0.4 },
      { lote_id: 'lote1', producto_id: 'pot', cantidad_base: 1.2 },
    ];
    const l = armarCoberturaAplicacion(d).lineas[0];
    expect(l.hechas).toBeCloseTo(5.1118, 4);
  });

  it('atribuye lo registrado a la mezcla del lote: el mismo producto en otra mezcla no se cuenta', () => {
    const d = base();
    d.calculos = [
      { mezcla_id: 'M1', lote_id: 'lote1', numero_canecas: 10, numero_bultos: null },
      { mezcla_id: 'M2', lote_id: 'lote2', numero_canecas: 5, numero_bultos: null },
    ];
    d.lineas.push({ id: 'L3', mezcla_id: 'M2', producto_id: 'acid', producto_nombre: 'Acidurez', cantidad_total_necesaria: 1, dosis_por_caneca: 200 });
    d.consumos = [{ lote_id: 'lote2', producto_id: 'acid', cantidad_base: 1 }];
    const l1 = armarCoberturaAplicacion(d).lineas.find((l) => l.linea_id === 'L1')!;
    expect(l1.hechas).toBe(0);
  });

  it('con una sola mezcla, un cálculo con mezcla_id NULL se atribuye a ella (aplicaciones viejas)', () => {
    const d = base();
    d.calculos = [{ mezcla_id: null, lote_id: 'lote1', numero_canecas: 10, numero_bultos: null }];
    expect(armarCoberturaAplicacion(d).lineas[0].planeadas).toBe(10);
  });

  it('con 2+ mezclas, un cálculo sin mezcla_id no se adivina: sin plan para la línea → no hay aviso inventado', () => {
    const d = base();
    d.lineas.push({ id: 'L3', mezcla_id: 'M2', producto_id: 'x', producto_nombre: 'X', cantidad_total_necesaria: 1, dosis_por_caneca: 1 });
    d.calculos = [{ mezcla_id: null, lote_id: 'lote1', numero_canecas: 10, numero_bultos: null }];
    const r = armarCoberturaAplicacion(d);
    expect(r.lineas).toEqual([]);
    expect(r.idsLineasConAlternativos.has('L1')).toBe(true);
  });

  it('fertilización: planeado en bultos y requerimiento del alternativo por tamaño de árbol', () => {
    const r = armarCoberturaAplicacion({
      tipoAplicacion: 'Fertilización',
      lineas: [{ id: 'L1', mezcla_id: 'M1', producto_id: 'urea', producto_nombre: 'Urea', cantidad_total_necesaria: 100, dosis_grandes: 100, dosis_medianos: 0, dosis_pequenos: 0, dosis_clonales: 0 }],
      alternativos: [{ aplicacion_producto_id: 'L1', producto_id: 'nitr', producto_nombre: 'Nitrato', dosis_grandes: 200 }],
      calculos: [{ mezcla_id: 'M1', lote_id: 'lote1', numero_canecas: null, numero_bultos: 20 }],
      arbolesPorLote: [{ lote_id: 'lote1', arboles_grandes: 1000, arboles_medianos: 0, arboles_pequenos: 0, arboles_clonales: 0 }],
      saldos: new Map([['urea', 50], ['nitr', 100]]),
      consumos: [],
    });
    const l = r.lineas[0];
    expect(l.unidad).toBe('bultos');
    // urea cubre 50/100 = 10 bultos; nitrato necesita 1000×200/1000 = 200 kg → 100/200 = 10 bultos.
    expect(l.cobertura).toBe(20);
    expect(l.alcanza).toBe(true);
  });

  it('describirFaltanteCobertura usa una sola redacción e incluye los productos sin saldo', () => {
    const texto = describirFaltanteCobertura(
      {
        linea_id: 'L1', nombre: 'Acidurez', unidad: 'canecas', planeadas: 10, hechas: 0, pendientes: 10,
        cobertura: 6.5, faltan: 3.5, alcanza: false, productosSinSaldo: ['Potenzol ph-D'], productosSinDosis: [],
      },
      (n) => String(n),
    );
    expect(texto).toBe(
      'Acidurez (y sus alternativos): quedan por hacer 10 canecas y la bodega cubre 6.5; faltan 3.5 canecas. Sin saldo conocido: Potenzol ph-D.',
    );
  });
});
