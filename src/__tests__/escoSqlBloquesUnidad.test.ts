import { describe, expect, it } from 'vitest';
import { construirBloque, filasTablaParaCanal } from '../utils/escoSql/bloques.ts';
import { formatearValor } from '../utils/escoSql/formato.ts';

const fuente = (filas: Record<string, unknown>[], truncado = false) => [{ filas, n_filas: filas.length, truncado }];
const tabla = { tipo: 'tabla', consulta: 1, titulo: 'Detalle', columnas: [{ columna: 'monto', etiqueta: 'Monto', formato: 'moneda' }] };

describe('bloques SQL puros', () => {
  it('proyecta solo las columnas elegidas y conserva los valores exactos, incluso null', () => {
    expect(construirBloque(tabla, fuente([{ monto: 1234567.89, privado: 'omitir' }, { monto: null, privado: 'omitir' }]))).toMatchObject({ bloque: { filas: [{ monto: 1234567.89 }, { monto: null }], total_filas: 2 } });
  });
  it('rechaza datos enviados por el modelo, consultas inválidas y columnas inexistentes', () => {
    for (const spec of [{ ...tabla, filas: [{ monto: 9 }] }, { ...tabla, consulta: 0 }, { ...tabla, consulta: 2 }, { ...tabla, columnas: [{ columna: 'otro', etiqueta: 'Otro', formato: 'numero' }] }]) {
      expect(construirBloque(spec, fuente([{ monto: 1 }]))).toHaveProperty('error');
    }
  });
  it('no convierte números de texto en números ni acepta más de sesenta puntos', () => {
    const spec = { tipo: 'grafica', consulta: 1, titulo: 'Serie', forma: 'bar', x: 'nombre', y: ['monto'], formato: 'numero' };
    expect(construirBloque(spec, fuente([{ nombre: 'A', monto: '12' }]))).toHaveProperty('error');
    expect(construirBloque(spec, fuente(Array.from({ length: 61 }, (_, i) => ({ nombre: String(i), monto: i }))))).toHaveProperty('error');
    expect(construirBloque(spec, fuente([{ nombre: 'A', monto: 12 }]))).toHaveProperty('bloque');
  });
  it('tarjeta exige una sola fila y toma el valor de esa fila', () => {
    const spec = { tipo: 'tarjeta', consulta: 1, items: [{ etiqueta: 'Monto', columna: 'monto', formato: 'moneda' }] };
    expect(construirBloque(spec, fuente([{ monto: 12 }]))).toMatchObject({ bloque: { items: [{ valor: 12 }] } });
    expect(construirBloque(spec, fuente([{ monto: 12 }, { monto: 13 }]))).toHaveProperty('error');
  });
  it('conserva cero y null; rechaza series enteramente nulas, objetos y columnas heredadas', () => {
    const spec = { tipo: 'grafica', consulta: 1, titulo: 'Serie', forma: 'bar', x: 'nombre', y: ['monto'], formato: 'numero' };
    expect(construirBloque(spec, fuente([{ nombre: 'A', monto: 0 }, { nombre: 'B', monto: null }]))).toMatchObject({ bloque: { datos: [{ nombre: 'A', monto: 0 }, { nombre: 'B', monto: null }] } });
    expect(construirBloque(spec, fuente([{ nombre: 'A', monto: null }]))).toHaveProperty('error');
    for (const filas of [[{ monto: { privado: 99 } }], [{ monto: Number.NaN }], [{ monto: Infinity }], [{ monto: 1 }, {}]]) expect(construirBloque(tabla, fuente(filas))).toHaveProperty('error');
    expect(construirBloque({ ...tabla, columnas: [{ columna: 'constructor', etiqueta: 'Otro', formato: 'texto' }] }, fuente([{ monto: 1 }]))).toHaveProperty('error');
  });
  it('conserva las filas para CSV y limita la vista por canal, avisando truncamiento', () => {
    const r = construirBloque(tabla, fuente(Array.from({ length: 80 }, (_, monto) => ({ monto })), true));
    expect(r).toMatchObject({ bloque: { truncado: true } });
    if (!('bloque' in r) || r.bloque.tipo !== 'tabla') throw new Error('sin tabla');
    expect(r.bloque.filas).toHaveLength(80);
    expect(filasTablaParaCanal(r.bloque, 'web')).toHaveLength(50);
    expect(filasTablaParaCanal(r.bloque, 'telegram')).toHaveLength(15);
  });
});

describe('formato compartido SQL', () => {
  it('usa las convenciones colombianas sin perder null ni mover fechas', () => {
    expect(formatearValor(95_000_000, 'moneda')).toBe('$95M');
    expect(formatearValor(1234.5, 'numero')).toBe('1.234,5');
    expect(formatearValor(null, 'numero')).toBe('Sin dato');
    expect(formatearValor('2026-01-01', 'fecha')).toContain('1 de enero de 2026');
    expect(formatearValor(12.5, 'porcentaje')).toBe('12,5 %');
  });
});
