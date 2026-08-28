/**
 * Fase 3 -- Telegram, Uriel (docs/brief_tecnico_verificacion_inventario.md
 * §7.2): "El alcance completo, al abrir -- replyWithDocument con las líneas
 * de rondas_inventario_alcance de la ronda recién abierta (producto +
 * cantidad + unidad, sin precio)". Es el reemplazo literal de la hoja
 * impresa del Sheet de David (§3.4 del brief de producto) -- Uriel lo
 * scrollea sin necesitar señal.
 *
 * Formato Markdown en tabla, agrupado por categoría -- pedido de Santiago
 * probando en vivo en producción (2026-08-28).
 *
 * R-15/CA-13: NUNCA precio ni valor -- el tipo de entrada de este módulo
 * (`FilaAlcanceMd`) directamente no tiene ninguna propiedad de precio, así
 * que no hay ninguna forma de que se cuele (mismo criterio D-T8 que
 * `preview.ts`).
 */

import { describe, it, expect } from 'vitest';
import { construirAlcanceMd, type FilaAlcanceMd } from '@/utils/rondaInventario/alcanceTxt';

const FILAS: FilaAlcanceMd[] = [
  { categoria: 'Enmienda', nombre: 'Silicalmag', cantidad: 100, unidad: 'Kilos' },
  { categoria: 'Herramienta', nombre: 'Martillos', cantidad: 8, unidad: 'Unidades' },
];

describe('construirAlcanceMd', () => {
  it('nunca muestra un símbolo de moneda -- R-15/CA-13', () => {
    const texto = construirAlcanceMd('2026-08-01', FILAS);
    expect(texto).not.toMatch(/\$/);
  });

  it('una fila de tabla por producto: categoría, insumo, cantidad y unidad, en ese orden', () => {
    const texto = construirAlcanceMd('2026-08-01', FILAS);
    expect(texto).toContain('| Enmienda | Silicalmag | 100 | Kilos |');
    expect(texto).toContain('| Herramienta | Martillos | 8 | Unidades |');
  });

  it('es una tabla Markdown válida: cabecera + fila separadora', () => {
    const texto = construirAlcanceMd('2026-08-01', FILAS);
    expect(texto).toContain('| Categoría | Insumo | Cantidad en sistema | Unidad |');
    expect(texto).toContain('|---|---|---|---|');
  });

  it('agrupa por categoría según el orden de zonas de la bodega (fertilizantes antes que herramienta)', () => {
    const filas: FilaAlcanceMd[] = [
      { categoria: 'Herramienta', nombre: 'Azadón', cantidad: 5, unidad: 'Unidades' },
      { categoria: 'Fertilizante', nombre: 'Urea', cantidad: 50, unidad: 'Kilos' },
      { categoria: 'Fungicida', nombre: 'Antracol', cantidad: 3, unidad: 'Kilos' },
    ];
    const texto = construirAlcanceMd('2026-08-01', filas);
    expect(texto.indexOf('Urea')).toBeLessThan(texto.indexOf('Antracol'));
    expect(texto.indexOf('Antracol')).toBeLessThan(texto.indexOf('Azadón'));
  });

  it('dentro de la misma categoría, ordena alfabéticamente por nombre', () => {
    const filas: FilaAlcanceMd[] = [
      { categoria: 'Herramienta', nombre: 'Silicalmag', cantidad: 100, unidad: 'Kilos' },
      { categoria: 'Herramienta', nombre: 'Martillos', cantidad: 8, unidad: 'Unidades' },
    ];
    const texto = construirAlcanceMd('2026-08-01', filas);
    expect(texto.indexOf('Martillos')).toBeLessThan(texto.indexOf('Silicalmag'));
  });

  it('una categoría fuera de la lista conocida no se pierde -- cae al final', () => {
    const filas: FilaAlcanceMd[] = [
      { categoria: 'Herramienta', nombre: 'Azadón', cantidad: 5, unidad: 'Unidades' },
      { categoria: 'CategoriaInventada', nombre: 'Cosa Rara', cantidad: 1, unidad: 'Unidades' },
    ];
    const texto = construirAlcanceMd('2026-08-01', filas);
    expect(texto).toContain('Cosa Rara');
    expect(texto.indexOf('Azadón')).toBeLessThan(texto.indexOf('Cosa Rara'));
  });

  it('la cabecera incluye el período en español, no el ISO crudo', () => {
    const texto = construirAlcanceMd('2026-08-01', FILAS);
    expect(texto).toContain('agosto 2026');
    expect(texto).not.toContain('2026-08-01');
  });

  it('la cabecera dice cuántos productos trae el alcance', () => {
    const texto = construirAlcanceMd('2026-08-01', FILAS);
    expect(texto).toContain('2 producto');
  });

  it('alcance vacío no lanza, y lo dice explícito (nunca una lista silenciosamente vacía)', () => {
    const texto = construirAlcanceMd('2026-08-01', []);
    expect(texto).toContain('0 producto');
  });

  it('formatea la cantidad en formato colombiano (sin decimales si es entero)', () => {
    const texto = construirAlcanceMd('2026-08-01', [{ categoria: 'Fertilizante', nombre: 'Fertilizante X', cantidad: 1234, unidad: 'Kilos' }]);
    expect(texto).toContain('| Fertilizante | Fertilizante X | 1.234 | Kilos |');
  });
});
