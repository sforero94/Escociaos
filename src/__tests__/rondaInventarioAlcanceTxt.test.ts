/**
 * Fase 3 -- Telegram, Uriel (docs/brief_tecnico_verificacion_inventario.md
 * §7.2): "El alcance completo, al abrir -- replyWithDocument con las líneas
 * de rondas_inventario_alcance de la ronda recién abierta (producto +
 * cantidad + unidad, sin precio)". Es el reemplazo literal de la hoja
 * impresa del Sheet de David (§3.4 del brief de producto) -- Uriel lo
 * scrollea sin necesitar señal.
 *
 * R-15/CA-13: NUNCA precio ni valor -- el tipo de entrada de este módulo
 * (`FilaAlcanceTxt`) directamente no tiene ninguna propiedad de precio, así
 * que no hay ninguna forma de que se cuele (mismo criterio D-T8 que
 * `preview.ts`).
 */

import { describe, it, expect } from 'vitest';
import { construirTextoAlcanceTxt, type FilaAlcanceTxt } from '@/utils/rondaInventario/alcanceTxt';

const FILAS: FilaAlcanceTxt[] = [
  { nombre: 'Silicalmag', cantidad: 100, unidad: 'Kilos' },
  { nombre: 'Martillos', cantidad: 8, unidad: 'Unidades' },
];

describe('construirTextoAlcanceTxt', () => {
  it('nunca muestra un símbolo de moneda -- R-15/CA-13', () => {
    const texto = construirTextoAlcanceTxt('2026-08-01', FILAS);
    expect(texto).not.toMatch(/\$/);
  });

  it('una línea por producto: nombre, cantidad y unidad, en ese orden', () => {
    const texto = construirTextoAlcanceTxt('2026-08-01', FILAS);
    expect(texto).toContain('Silicalmag: 100 Kilos');
    expect(texto).toContain('Martillos: 8 Unidades');
  });

  it('ordena alfabéticamente por nombre, sin importar el orden de entrada', () => {
    const texto = construirTextoAlcanceTxt('2026-08-01', FILAS);
    expect(texto.indexOf('Martillos')).toBeLessThan(texto.indexOf('Silicalmag'));
  });

  it('la cabecera incluye el período en español, no el ISO crudo', () => {
    const texto = construirTextoAlcanceTxt('2026-08-01', FILAS);
    expect(texto).toContain('agosto 2026');
    expect(texto).not.toContain('2026-08-01');
  });

  it('la cabecera dice cuántos productos trae el alcance', () => {
    const texto = construirTextoAlcanceTxt('2026-08-01', FILAS);
    expect(texto).toContain('2 producto');
  });

  it('alcance vacío no lanza, y lo dice explícito (nunca una lista silenciosamente vacía)', () => {
    const texto = construirTextoAlcanceTxt('2026-08-01', []);
    expect(texto).toContain('0 producto');
  });

  it('formatea la cantidad en formato colombiano (sin decimales si es entero)', () => {
    const texto = construirTextoAlcanceTxt('2026-08-01', [{ nombre: 'Fertilizante X', cantidad: 1234, unidad: 'Kilos' }]);
    expect(texto).toContain('Fertilizante X: 1.234 Kilos');
  });
});
