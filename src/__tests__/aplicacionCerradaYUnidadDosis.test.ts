// ESCO-188: una aplicación cerrada no se edita desde la app, y la dosis de un producto
// medido en Unidades se cuenta en unidades, no en gramos.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { aplicacionEsEditable, MENSAJE_APLICACION_CERRADA } from '@/utils/aplicacionCerrada';
import {
  cantidadPorDosisCaneca,
  leerUnidadDosis,
  rotuloUnidadDosis,
  unidadDosisParaProducto,
} from '@/utils/unidadDosis';

describe('aplicacionEsEditable', () => {
  it('solo bloquea la aplicación cerrada', () => {
    expect(aplicacionEsEditable('Cerrada')).toBe(false);
    expect(aplicacionEsEditable('Calculada')).toBe(true);
    expect(aplicacionEsEditable('En ejecución')).toBe(true);
    expect(aplicacionEsEditable(null)).toBe(true);
    expect(aplicacionEsEditable(undefined)).toBe(true);
  });

  it('el mensaje dice a quién acudir y no ofrece reabrir', () => {
    expect(MENSAJE_APLICACION_CERRADA).toContain('Santiago');
    expect(MENSAJE_APLICACION_CERRADA.toLowerCase()).not.toContain('reabrir');
  });
});

describe('unidadDosisParaProducto', () => {
  it('Unidades → unidades, líquido → cc, el resto → gramos', () => {
    expect(unidadDosisParaProducto({ unidad_medida: 'Unidades', estado_fisico: 'solido' })).toBe('unidades');
    expect(unidadDosisParaProducto({ unidad_medida: 'Unidades', estado_fisico: 'liquido' })).toBe('unidades');
    expect(unidadDosisParaProducto({ unidad_medida: 'Litros', estado_fisico: 'liquido' })).toBe('cc');
    expect(unidadDosisParaProducto({ unidad_medida: 'Kilos', estado_fisico: 'solido' })).toBe('gramos');
    expect(unidadDosisParaProducto({ unidad_medida: 'Kilos' })).toBe('gramos');
  });
});

describe('cantidadPorDosisCaneca', () => {
  it('unidades no se divide; cc y gramos se pasan a L/kg', () => {
    expect(cantidadPorDosisCaneca(10, 0.8, 'unidades')).toBe(8);
    expect(cantidadPorDosisCaneca(10, 800, 'gramos')).toBe(8);
    expect(cantidadPorDosisCaneca(10, 800, 'cc')).toBe(8);
  });

  it('una unidad vacía o desconocida conserva la regla vieja (÷ 1.000)', () => {
    expect(cantidadPorDosisCaneca(10, 800, null)).toBe(8);
    expect(cantidadPorDosisCaneca(10, 800, undefined)).toBe(8);
    expect(cantidadPorDosisCaneca(10, 800, 'otra')).toBe(8);
  });
});

describe('rotuloUnidadDosis y leerUnidadDosis', () => {
  it('rótulo corto para la pantalla', () => {
    expect(rotuloUnidadDosis('cc')).toBe('cc');
    expect(rotuloUnidadDosis('gramos')).toBe('g');
    expect(rotuloUnidadDosis('unidades')).toBe('und');
  });

  it('solo acepta los tres valores conocidos', () => {
    expect(leerUnidadDosis('unidades')).toBe('unidades');
    expect(leerUnidadDosis('cc')).toBe('cc');
    expect(leerUnidadDosis('gramos')).toBe('gramos');
    expect(leerUnidadDosis('kg')).toBeUndefined();
    expect(leerUnidadDosis(null)).toBeUndefined();
  });
});

describe('guarda estática: la calculadora rechaza guardar una aplicación cerrada', () => {
  const fuente = readFileSync(
    resolve(__dirname, '../components/aplicaciones/CalculadoraAplicaciones.tsx'),
    'utf8',
  );

  it('lee el estado de la base y corta antes del primer UPDATE', () => {
    const lectura = fuente.indexOf(".select('codigo_aplicacion, estado')");
    const corte = fuente.indexOf('throw new Error(MENSAJE_APLICACION_CERRADA)');
    const update = fuente.indexOf(".from('aplicaciones').update(");
    expect(lectura).toBeGreaterThan(-1);
    expect(corte).toBeGreaterThan(lectura);
    expect(update).toBeGreaterThan(corte);
  });

  it('no abre el editor de una aplicación cerrada', () => {
    expect(fuente).toContain('modoEdicion && !aplicacionEsEditable(estadoAplicacionActual)');
  });
});
