import { describe, it, expect } from 'vitest';
import {
  construirFilaLinea,
  opcionesDeLinea,
  seleccionarOpcionLinea,
  validarSeleccionLineas,
  type LineaPlanMovimiento,
  type OpcionProductoLinea,
} from '../utils/lineasMovimientoDiario';

const o = (id: string, nombre: string, saldo: number | null = 1, unidad = 'Litros'): OpcionProductoLinea => ({
  producto_id: id,
  producto_nombre: nombre,
  producto_categoria: 'Coadyuvante',
  producto_unidad: unidad,
  saldo,
});

const lineaConAlternativos: LineaPlanMovimiento = {
  linea_id: 'L1',
  principal: o('p', 'Potenzol ph-D', 2),
  alternativos: [o('a', 'Acidurez', 1), o('c', 'Acondicionador sys', 0.76)],
};
const lineaSimple: LineaPlanMovimiento = { linea_id: 'L2', principal: o('x', 'Cobre'), alternativos: [] };

describe('opcionesDeLinea', () => {
  it('lista principal y alternativos en orden alfabético, sin marcar ni priorizar ninguno', () => {
    expect(opcionesDeLinea(lineaConAlternativos).map((x) => x.producto_nombre)).toEqual([
      'Acidurez',
      'Acondicionador sys',
      'Potenzol ph-D',
    ]);
  });
  it('cada opción trae su saldo', () => {
    expect(opcionesDeLinea(lineaConAlternativos).map((x) => x.saldo)).toEqual([1, 0.76, 2]);
  });
  it('un alternativo repetido (o igual al principal) no duplica la opción', () => {
    const l = { ...lineaConAlternativos, alternativos: [o('p', 'Potenzol ph-D'), o('a', 'Acidurez')] };
    expect(opcionesDeLinea(l)).toHaveLength(2);
  });
  it('sin alternativos devuelve solo el principal', () => {
    expect(opcionesDeLinea(lineaSimple)).toHaveLength(1);
  });
});

describe('construirFilaLinea', () => {
  it('línea sin alternativos: fila fija con el principal, igual que antes (sin selector)', () => {
    const fila = construirFilaLinea(lineaSimple, []);
    expect(fila).toMatchObject({ linea_id: 'L2', producto_id: 'x', producto_nombre: 'Cobre', cantidad_utilizada: '' });
    expect(fila.opciones).toBeUndefined();
  });

  it('línea con alternativos: NADA preseleccionado — David escoge', () => {
    const fila = construirFilaLinea(lineaConAlternativos, []);
    expect(fila.producto_id).toBe('');
    expect(fila.opciones).toHaveLength(3);
    expect(fila.linea_nombre).toBe('Potenzol ph-D');
  });

  it('conserva la cantidad y el producto ya escogidos al recalcular (cambio de lote)', () => {
    const previa = seleccionarOpcionLinea({ ...construirFilaLinea(lineaConAlternativos, []), cantidad_utilizada: '0.4' }, 'c');
    const fila = construirFilaLinea(lineaConAlternativos, [previa]);
    expect(fila.producto_id).toBe('c');
    expect(fila.cantidad_utilizada).toBe('0.4');
  });

  it('un borrador viejo (sin linea_id) conserva la cantidad por producto_id', () => {
    const vieja = {
      producto_id: 'x', producto_nombre: 'Cobre', producto_categoria: 'F', unidad_producto: 'Litros', cantidad_utilizada: '3',
    };
    expect(construirFilaLinea(lineaSimple, [vieja]).cantidad_utilizada).toBe('3');
  });

  it('si el producto previo ya no es opción de la línea, queda sin escoger', () => {
    const previa = { ...construirFilaLinea(lineaConAlternativos, []), producto_id: 'zzz', cantidad_utilizada: '1' };
    expect(construirFilaLinea(lineaConAlternativos, [previa]).producto_id).toBe('');
  });
});

describe('seleccionarOpcionLinea', () => {
  it('cambia producto, categoría, unidad y presentación a los de la opción escogida', () => {
    const base = construirFilaLinea(
      { ...lineaConAlternativos, alternativos: [{ ...o('a', 'Acidurez', 1, 'Kilos'), presentacion_kg_l: 25 }, o('c', 'Z')] },
      [],
    );
    const fila = seleccionarOpcionLinea(base, 'a');
    expect(fila).toMatchObject({ producto_id: 'a', producto_nombre: 'Acidurez', unidad_producto: 'Kilos', presentacion_kg_l: 25 });
  });
  it('un id que no es opción no cambia la fila', () => {
    const base = construirFilaLinea(lineaConAlternativos, []);
    expect(seleccionarOpcionLinea(base, 'nope')).toBe(base);
  });
});

describe('validarSeleccionLineas — un producto por línea', () => {
  it('sin errores cuando cada línea tiene un producto escogido', () => {
    const a = seleccionarOpcionLinea(construirFilaLinea(lineaConAlternativos, []), 'a');
    expect(validarSeleccionLineas([a, construirFilaLinea(lineaSimple, [])])).toBeNull();
  });
  it('rechaza una línea con alternativos sin producto escogido', () => {
    expect(validarSeleccionLineas([construirFilaLinea(lineaConAlternativos, [])])).toMatch(/Escoge el producto de la línea Potenzol ph-D/);
  });
  it('rechaza dos productos de la misma línea en el mismo movimiento', () => {
    const a = seleccionarOpcionLinea(construirFilaLinea(lineaConAlternativos, []), 'a');
    const c = seleccionarOpcionLinea(construirFilaLinea(lineaConAlternativos, []), 'c');
    expect(validarSeleccionLineas([a, c])).toMatch(/solo admite un producto por línea/);
  });
  it('rechaza un producto que no es opción de su línea', () => {
    const fila = { ...construirFilaLinea(lineaConAlternativos, []), producto_id: 'otro', producto_nombre: 'Otro' };
    expect(validarSeleccionLineas([fila])).toMatch(/no es una opción/);
  });
  it('filas sin linea_id (borradores viejos) no se tocan', () => {
    const vieja = { producto_id: 'x', producto_nombre: 'Cobre', producto_categoria: 'F', unidad_producto: 'Litros', cantidad_utilizada: '3' };
    expect(validarSeleccionLineas([vieja, vieja])).toBeNull();
  });
});
