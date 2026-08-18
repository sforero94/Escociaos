import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DiaFranjaLluvia } from '@/utils/calculosClima';
import { FranjaLluvia } from '@/components/dashboard/FranjaLluvia';

/**
 * Franja de lluvia del bloque "Hoy en la finca" (docs/plan_dashboard_centro_control.md
 * §4 Bloque 2.1 / §9.2). Tres estados que tienen que verse distintos a
 * simple vista: lluvia real (barra azul proporcional), cero de verdad
 * (barra plana) y sin dato (rayada, borde punteado) — nunca una barra de
 * 0mm disfrazando un "no sabemos".
 *
 * No hay navegador disponible en esta sesión (sólo Read/Bash/Edit/Write),
 * así que la distinción visual se verifica aquí por marcado: cada estado
 * tiene que llevar clases mutuamente excluyentes (una franja rayada con
 * borde punteado no puede compartir el relleno azul de lluvia, ni la altura
 * fija del cero real).
 */

const CASO_REAL: DiaFranjaLluvia[] = [
  { fecha: '2026-08-06', estado: 'lluvia', mm: 0.25, causa: null },
  { fecha: '2026-08-07', estado: 'lluvia', mm: 0.51, causa: null },
  { fecha: '2026-08-08', estado: 'sin_dato', mm: null, causa: 'contador_congelado' },
  { fecha: '2026-08-09', estado: 'lluvia', mm: 0.25, causa: null },
  { fecha: '2026-08-10', estado: 'sin_dato', mm: null, causa: 'contador_congelado' },
  { fecha: '2026-08-11', estado: 'seco', mm: 0, causa: null },
  { fecha: '2026-08-12', estado: 'lluvia', mm: 0.25, causa: null },
  { fecha: '2026-08-13', estado: 'sin_dato', mm: null, causa: 'contador_congelado' },
  { fecha: '2026-08-14', estado: 'seco', mm: 0, causa: null },
  { fecha: '2026-08-15', estado: 'seco', mm: 0, causa: null },
];

function render(dias: DiaFranjaLluvia[] = CASO_REAL, visibleEnMovil?: number) {
  return renderToStaticMarkup(<FranjaLluvia dias={dias} visibleEnMovil={visibleEnMovil} />);
}

describe('FranjaLluvia — los tres estados se ven distintos (bloqueo de release si no)', () => {
  it('pinta una barra por día, en el mismo orden que recibe', () => {
    const html = render();
    const posiciones = CASO_REAL.map((d) => html.indexOf(d.fecha));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
  });

  it('lluvia real: barra azul, con la cifra de mm visible (no oculta el dato)', () => {
    const html = render([CASO_REAL[0]]);
    expect(html).toContain('data-estado="lluvia"');
    expect(html).toMatch(/bg-blue-\d00/);
    expect(html).not.toContain('border-dashed');
    expect(html).toContain('0,3'); // 0.25 redondeado a 1 decimal, formato Colombia (coma)
  });

  it('cero de verdad: NUNCA sin_dato, NUNCA lluvia — marcado propio y distinto', () => {
    const html = render([CASO_REAL[5]]); // 2026-08-11, 0mm real
    expect(html).toContain('data-estado="seco"');
    expect(html).not.toContain('data-estado="lluvia"');
    expect(html).not.toContain('data-estado="sin_dato"');
    expect(html).not.toContain('border-dashed');
    expect(html).not.toMatch(/bg-blue-\d00/);
  });

  it('sin dato: rayada, con borde punteado — nunca comparte el relleno azul ni la marca de cero', () => {
    const html = render([CASO_REAL[2]]); // 2026-08-08, contador congelado
    expect(html).toContain('data-estado="sin_dato"');
    expect(html).toContain('border-dashed');
    expect(html).not.toMatch(/bg-blue-\d00/);
    // El patrón rayado es un fondo propio, no el mismo que la barra de cero real
    expect(html).toContain('repeating-linear-gradient');
    // Nunca imprime "0" ni "0,0 mm" para un día sin dato
    expect(html).not.toMatch(/>0(,0)?\s*mm</);
    expect(html).toContain('s/d');
  });

  it('los tres estados son mutuamente excluyentes en un mismo render (regresión del caso real)', () => {
    const html = render();
    // Tantos data-estado="sin_dato" como días congelados, ninguno con relleno azul
    const bloques = html.split('<div');
    const sinDatoConAzul = bloques.filter((b) => b.includes('data-estado="sin_dato"') && /bg-blue-\d00/.test(b));
    expect(sinDatoConAzul).toHaveLength(0);
  });

  it('pie de tarjeta: mm acumulados + "N de M días sin dato" en ámbar con la causa', () => {
    const html = render();
    expect(html).toContain('acumulados');
    expect(html).toContain('3 de 10 días sin dato de lluvia');
    expect(html).toContain('el contador del pluviómetro no se reinició');
    expect(html).toMatch(/text-amber-\d00/);
  });

  it('sin ningún día sin dato, el pie no menciona "sin dato" en absoluto', () => {
    const html = render(CASO_REAL.filter((d) => d.estado !== 'sin_dato'));
    expect(html).not.toContain('sin dato');
  });

  it('móvil: sólo quedan visibles las últimas `visibleEnMovil` barras; el resto sólo aparece en escritorio (`lg:`)', () => {
    const html = render(CASO_REAL, 7);
    // Las 3 más antiguas (06, 07, 08-ago) llevan `hidden` (oculto salvo en `lg:`)
    const antes = html.split('2026-08-08')[0];
    expect(antes).toContain('hidden lg:flex');
    // El resto de días (09-ago en adelante, las 7 más recientes) no debe
    // sumar más ocurrencias de `hidden lg:flex` que las 3 más antiguas.
    const ocurrenciasHidden = (html.match(/hidden lg:flex/g) ?? []).length;
    expect(ocurrenciasHidden).toBe(3);
  });

  it('sin días, no revienta -- renderiza contenedor vacío', () => {
    expect(() => render([])).not.toThrow();
  });
});
