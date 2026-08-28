import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesenlaceBadge } from '@/components/inventory/rondas/DesenlaceBadge';
import { ResumenDesenlacesChips } from '@/components/inventory/rondas/ResumenDesenlacesChips';
import { calcularResumenDesenlaces } from '@/utils/rondaInventarioUi';

/**
 * CA-10 (docs/plan_verificacion_inventario.md §7, brief técnico §12
 * "Componente"): los tres desenlaces terminales de una excepción --
 * `cerrada_sin_ajuste`, `resuelta_con_captura`, y el trío
 * `ajuste_aprobado`/`ajuste_aplicado`/`ajuste_desestimado` -- tienen que
 * renderizarse visualmente distintos y NUNCA fundirse en ningún resumen ni
 * agrupación. Este es el test de componente que el brief de la tarea exige
 * explícitamente para ese contrato.
 */

describe('DesenlaceBadge -- los tres desenlaces terminales se renderizan distintos (CA-10)', () => {
  it('cerrada_sin_ajuste, resuelta_con_captura y ajuste_aplicado producen HTML distinto entre sí', () => {
    const htmlSinAjuste = renderToStaticMarkup(<DesenlaceBadge estado="cerrada_sin_ajuste" />);
    const htmlCaptura = renderToStaticMarkup(<DesenlaceBadge estado="resuelta_con_captura" />);
    const htmlAjuste = renderToStaticMarkup(<DesenlaceBadge estado="ajuste_aplicado" />);

    expect(htmlSinAjuste).not.toBe(htmlCaptura);
    expect(htmlSinAjuste).not.toBe(htmlAjuste);
    expect(htmlCaptura).not.toBe(htmlAjuste);
  });

  it('cada uno de los tres lleva su propia etiqueta de texto -- ninguno dice "ajuste" para los otros dos', () => {
    const htmlSinAjuste = renderToStaticMarkup(<DesenlaceBadge estado="cerrada_sin_ajuste" />);
    const htmlCaptura = renderToStaticMarkup(<DesenlaceBadge estado="resuelta_con_captura" />);
    const htmlAjusteAprobado = renderToStaticMarkup(<DesenlaceBadge estado="ajuste_aprobado" />);
    const htmlAjusteAplicado = renderToStaticMarkup(<DesenlaceBadge estado="ajuste_aplicado" />);
    const htmlAjusteDesestimado = renderToStaticMarkup(<DesenlaceBadge estado="ajuste_desestimado" />);

    expect(htmlSinAjuste).toContain('Cerrada sin ajuste');
    expect(htmlSinAjuste).not.toContain('captura');
    expect(htmlSinAjuste).not.toContain('Ajuste');

    expect(htmlCaptura).toContain('Resuelta con captura');
    expect(htmlCaptura).not.toContain('Ajuste');

    // Dentro de la familia "ajuste", los tres sub-estados TAMBIÉN son
    // distinguibles -- "aprobado pendiente" no es "aplicado" ni "desestimado".
    expect(htmlAjusteAprobado).toContain('pendiente de aplicar');
    expect(htmlAjusteAplicado).toContain('Ajuste aplicado');
    expect(htmlAjusteAplicado).not.toContain('pendiente de aplicar');
    expect(htmlAjusteAplicado).not.toContain('desestimado');
    expect(htmlAjusteDesestimado).toContain('Ajuste desestimado');
    expect(htmlAjusteDesestimado).not.toContain('aplicado');
  });

  it('los tres NUNCA comparten la misma clase de color de badge', () => {
    const claseDe = (html: string) => html.match(/class="([^"]*)"/)?.[1] ?? '';
    const claseSinAjuste = claseDe(renderToStaticMarkup(<DesenlaceBadge estado="cerrada_sin_ajuste" />));
    const claseCaptura = claseDe(renderToStaticMarkup(<DesenlaceBadge estado="resuelta_con_captura" />));
    const claseAjuste = claseDe(renderToStaticMarkup(<DesenlaceBadge estado="ajuste_aplicado" />));

    const clases = new Set([claseSinAjuste, claseCaptura, claseAjuste]);
    expect(clases.size).toBe(3);
  });
});

describe('ResumenDesenlacesChips -- el resumen agregado nunca funde las tres familias (CA-10)', () => {
  it('una ronda con los tres desenlaces muestra tres chips con conteos independientes, nunca un total combinado', () => {
    const resumen = calcularResumenDesenlaces([
      { estado: 'cerrada_sin_ajuste' },
      { estado: 'cerrada_sin_ajuste' },
      { estado: 'resuelta_con_captura' },
      { estado: 'ajuste_aplicado' },
      { estado: 'ajuste_desestimado' },
    ]);
    const html = renderToStaticMarkup(<ResumenDesenlacesChips resumen={resumen} />);

    // Cada familia aparece con SU número, no un total de 5 en ningún chip.
    expect(html).toContain('>2<');
    expect(html).toContain('cerradas sin ajuste');
    expect(html).toContain('>1<');
    expect(html).toContain('resueltas con captura');
    expect(html).toContain('ajuste aplicado');
    expect(html).toContain('ajuste desestimado');

    // El resumen NUNCA debe imprimir un bucket genérico "ajuste: 2" que
    // esconda si esos dos ajustes fueron aplicados o desestimados.
    expect(html).not.toMatch(/>2<\/span>\s*<span>ajuste</);
  });

  it('lista vacía: todos los chips en 0, ninguno se omite (honesto, no oculta la ausencia de dato)', () => {
    const resumen = calcularResumenDesenlaces([]);
    const html = renderToStaticMarkup(<ResumenDesenlacesChips resumen={resumen} />);
    expect(html).toContain('cerradas sin ajuste');
    expect(html).toContain('resueltas con captura');
    expect(html).toContain('ajuste aplicado');
    expect(html).toContain('ajuste desestimado');
  });
});
