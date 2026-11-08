import { describe, it, expect } from 'vitest';
import {
  crearAlternativo,
  validarAlternativos,
  construirFilasAlternativos,
  agruparAlternativosPorLinea,
  type FilaAlternativoBD,
} from '../utils/productosAlternativos';
import type { Mezcla, ProductoAlternativo, ProductoCatalogo, ProductoEnMezcla } from '../types/aplicaciones';

const principal = (id: string, alternativos?: ProductoAlternativo[]): ProductoEnMezcla => ({
  producto_id: id,
  producto_nombre: `Producto ${id}`,
  producto_categoria: 'Fungicida',
  producto_unidad: 'Litros',
  dosis_por_caneca: 100,
  unidad_dosis: 'cc',
  cantidad_total_necesaria: 10,
  alternativos,
});

const altCaneca = (id: string, dosis = 50, unidad: 'cc' | 'gramos' = 'cc'): ProductoAlternativo => ({
  producto_id: id,
  producto_nombre: `Alt ${id}`,
  producto_categoria: 'Fungicida',
  producto_unidad: 'Litros',
  dosis_por_caneca: dosis,
  unidad_dosis: unidad,
});

const mezcla = (productos: ProductoEnMezcla[]): Mezcla => ({
  id: 'm1',
  nombre: 'Mezcla 1',
  numero_orden: 1,
  productos,
});

describe('crearAlternativo', () => {
  const catalogo = (estado: 'liquido' | 'solido'): ProductoCatalogo => ({
    id: 'p9',
    nombre: 'Cobre',
    categoria: 'Fungicida',
    grupo: 'Agroinsumos',
    unidad_medida: estado === 'liquido' ? 'Litros' : 'Kilos',
    estado_fisico: estado,
    presentacion_comercial: '1 L',
    cantidad_actual: 3,
  });

  it('en fumigación arranca con dosis por caneca vacía y la unidad según el estado físico', () => {
    expect(crearAlternativo(catalogo('liquido'), true)).toEqual({
      producto_id: 'p9',
      producto_nombre: 'Cobre',
      producto_categoria: 'Fungicida',
      producto_unidad: 'Litros',
      dosis_por_caneca: 0,
      unidad_dosis: 'cc',
    });
    expect(crearAlternativo(catalogo('solido'), true).unidad_dosis).toBe('gramos');
  });

  it('en fertilización arranca con las cuatro dosis por tamaño', () => {
    const alt = crearAlternativo(catalogo('solido'), false);
    expect(alt.dosis_por_caneca).toBeUndefined();
    expect(alt).toMatchObject({ dosis_grandes: 0, dosis_medianos: 0, dosis_pequenos: 0, dosis_clonales: 0 });
  });
});

describe('validarAlternativos', () => {
  it('líneas sin alternativos son válidas (comportamiento de siempre)', () => {
    expect(validarAlternativos([mezcla([principal('a'), principal('b')])], 'fumigacion')).toBeNull();
  });

  it('rechaza un alternativo igual al producto principal de la línea', () => {
    const error = validarAlternativos([mezcla([principal('a', [altCaneca('a')])])], 'fumigacion');
    expect(error).toMatch(/principal/i);
  });

  it('rechaza un alternativo repetido en la misma línea', () => {
    const error = validarAlternativos(
      [mezcla([principal('a', [altCaneca('x'), altCaneca('x')])])],
      'fumigacion',
    );
    expect(error).toMatch(/repetido/i);
  });

  it('acepta el mismo alternativo en dos líneas distintas', () => {
    expect(
      validarAlternativos([mezcla([principal('a', [altCaneca('x')]), principal('b', [altCaneca('x')])])], 'drench'),
    ).toBeNull();
  });

  it('rechaza un alternativo sin dosis por caneca en fumigación', () => {
    expect(validarAlternativos([mezcla([principal('a', [altCaneca('x', 0)])])], 'fumigacion')).toMatch(/dosis/i);
  });

  it('en fertilización exige al menos una dosis por tamaño mayor que 0', () => {
    const sinDosis: ProductoAlternativo = {
      ...altCaneca('x'),
      dosis_por_caneca: undefined,
      dosis_grandes: 0,
      dosis_medianos: 0,
      dosis_pequenos: 0,
      dosis_clonales: 0,
    };
    expect(validarAlternativos([mezcla([principal('a', [sinDosis])])], 'fertilizacion')).toMatch(/dosis/i);
    expect(
      validarAlternativos([mezcla([principal('a', [{ ...sinDosis, dosis_pequenos: 0.2 }])])], 'fertilizacion'),
    ).toBeNull();
  });

  it('rechaza una dosis negativa', () => {
    const negativa: ProductoAlternativo = {
      ...altCaneca('x'),
      dosis_por_caneca: undefined,
      dosis_grandes: 1,
      dosis_medianos: -1,
    };
    expect(validarAlternativos([mezcla([principal('a', [negativa])])], 'fertilizacion')).toMatch(/dosis/i);
  });
});

describe('construirFilasAlternativos', () => {
  it('usa el id NUEVO de la línea reinsertada, emparejado por producto principal', () => {
    const productos = [principal('a', [altCaneca('x', 40), altCaneca('y', 60, 'gramos')]), principal('b')];
    // El orden de lo devuelto no tiene por qué coincidir con el enviado.
    const insertadas = [
      { id: 'linea-nueva-b', producto_id: 'b' },
      { id: 'linea-nueva-a', producto_id: 'a' },
    ];
    expect(construirFilasAlternativos(productos, insertadas, 'fumigacion')).toEqual([
      {
        aplicacion_producto_id: 'linea-nueva-a',
        producto_id: 'x',
        dosis_por_caneca: 40,
        unidad_dosis: 'cc',
        dosis_grandes: null,
        dosis_medianos: null,
        dosis_pequenos: null,
        dosis_clonales: null,
      },
      {
        aplicacion_producto_id: 'linea-nueva-a',
        producto_id: 'y',
        dosis_por_caneca: 60,
        unidad_dosis: 'gramos',
        dosis_grandes: null,
        dosis_medianos: null,
        dosis_pequenos: null,
        dosis_clonales: null,
      },
    ]);
  });

  it('sin alternativos no produce filas', () => {
    expect(
      construirFilasAlternativos([principal('a')], [{ id: 'l1', producto_id: 'a' }], 'fumigacion'),
    ).toEqual([]);
  });

  it('en fertilización escribe NULL (no 0) en los tamaños sin dosis, por el CHECK dosis > 0', () => {
    const alt: ProductoAlternativo = {
      ...altCaneca('x'),
      dosis_por_caneca: 999,
      unidad_dosis: 'cc',
      dosis_grandes: 0.5,
      dosis_medianos: 0,
      dosis_pequenos: undefined,
      dosis_clonales: 0.1,
    };
    expect(
      construirFilasAlternativos([principal('a', [alt])], [{ id: 'l1', producto_id: 'a' }], 'fertilizacion'),
    ).toEqual([
      {
        aplicacion_producto_id: 'l1',
        producto_id: 'x',
        dosis_por_caneca: null,
        unidad_dosis: null,
        dosis_grandes: 0.5,
        dosis_medianos: null,
        dosis_pequenos: null,
        dosis_clonales: 0.1,
      },
    ]);
  });

  it('lanza si la línea con alternativos no volvió del INSERT (nunca escribe sobre otra línea)', () => {
    expect(() =>
      construirFilasAlternativos([principal('a', [altCaneca('x')])], [{ id: 'l1', producto_id: 'zzz' }], 'fumigacion'),
    ).toThrow(/alternativos/i);
  });
});

describe('agruparAlternativosPorLinea', () => {
  it('rehidrata los alternativos por id de línea con nombre y unidad del catálogo', () => {
    const filas: FilaAlternativoBD[] = [
      {
        aplicacion_producto_id: 'l1',
        producto_id: 'x',
        dosis_por_caneca: 40,
        unidad_dosis: 'cc',
        dosis_grandes: null,
        dosis_medianos: null,
        dosis_pequenos: null,
        dosis_clonales: null,
        productos: { nombre: 'Cobre', categoria: 'Fungicida', unidad_medida: 'Litros' },
      },
      {
        aplicacion_producto_id: 'l2',
        producto_id: 'y',
        dosis_por_caneca: null,
        unidad_dosis: null,
        dosis_grandes: 0.5,
        dosis_medianos: null,
        dosis_pequenos: 0.2,
        dosis_clonales: null,
        productos: { nombre: 'Cal', categoria: 'Enmienda', unidad_medida: 'Kilos' },
      },
    ];
    const mapa = agruparAlternativosPorLinea(filas);
    expect(mapa.get('l1')).toEqual([
      {
        producto_id: 'x',
        producto_nombre: 'Cobre',
        producto_categoria: 'Fungicida',
        producto_unidad: 'Litros',
        dosis_por_caneca: 40,
        unidad_dosis: 'cc',
        dosis_grandes: undefined,
        dosis_medianos: undefined,
        dosis_pequenos: undefined,
        dosis_clonales: undefined,
      },
    ]);
    expect(mapa.get('l2')?.[0]).toMatchObject({
      producto_nombre: 'Cal',
      dosis_grandes: 0.5,
      dosis_pequenos: 0.2,
      dosis_medianos: undefined,
    });
    expect(mapa.get('l3')).toBeUndefined();
  });

  it('ida y vuelta: lo que se guarda se rehidrata igual', () => {
    const alt = altCaneca('x', 40);
    const [fila] = construirFilasAlternativos([principal('a', [alt])], [{ id: 'l1', producto_id: 'a' }], 'drench');
    const mapa = agruparAlternativosPorLinea([
      { ...fila, productos: { nombre: alt.producto_nombre, categoria: alt.producto_categoria, unidad_medida: 'Litros' } },
    ]);
    expect(mapa.get('l1')?.[0]).toMatchObject(alt);
  });
});
