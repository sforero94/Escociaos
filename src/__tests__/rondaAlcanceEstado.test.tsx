import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EstadoAlcanceLabel } from '@/components/inventory/rondas/EstadoAlcanceLabel';

/**
 * R-2/R-3, CA-15/CA-16 (docs/plan_verificacion_inventario.md §7): un
 * producto FUERA del alcance declarado de una ronda se muestra como
 * "—"/"no verificado" -- nunca como conforme, nunca como 0. Un producto
 * DENTRO del alcance sin excepción es "conforme dentro del alcance
 * declarado" -- no una cifra física que nadie capturó.
 */

describe('EstadoAlcanceLabel -- R-2/R-3/CA-15/CA-16', () => {
  it('conforme: dice "conforme dentro del alcance declarado"', () => {
    const html = renderToStaticMarkup(<EstadoAlcanceLabel estado="conforme" />);
    expect(html).toContain('Conforme dentro del alcance declarado');
    expect(html).not.toContain('Contado');
  });

  it('fuera_de_alcance: dice "no verificado", lleva el guion largo, y NUNCA "0" ni "Conforme"', () => {
    const html = renderToStaticMarkup(<EstadoAlcanceLabel estado="fuera_de_alcance" />);
    expect(html).toContain('no verificado');
    expect(html).toContain('—');
    expect(html).not.toContain('Conforme');
    // No debe renderizar un cero como si fuera el valor del producto.
    expect(html).not.toMatch(/>0<\/span>/);
  });

  it('con_excepcion: un tercer texto, distinto de los otros dos', () => {
    const html = renderToStaticMarkup(<EstadoAlcanceLabel estado="con_excepcion" />);
    expect(html).toContain('excepción');
    expect(html).not.toContain('no verificado');
    expect(html).not.toContain('Conforme dentro del alcance');
  });

  it('los tres estados producen markup distinto entre sí', () => {
    const conforme = renderToStaticMarkup(<EstadoAlcanceLabel estado="conforme" />);
    const excepcion = renderToStaticMarkup(<EstadoAlcanceLabel estado="con_excepcion" />);
    const fuera = renderToStaticMarkup(<EstadoAlcanceLabel estado="fuera_de_alcance" />);
    const html = new Set([conforme, excepcion, fuera]);
    expect(html.size).toBe(3);
  });
});
