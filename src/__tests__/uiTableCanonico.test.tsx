import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

/**
 * `src/components/ui/table.tsx` es el recurso tabla compartido (docs/sistema-visual.md §3-ter).
 * Este archivo prueba las DOS piezas de comportamiento que el primitivo tenía que ganar para
 * servir a los dos usos reales de la app -- lista y matriz -- antes de migrar ningún consumidor:
 *
 *  1. `sticky` en `TableHead`/`TableCell`: la columna que identifica la fila en una tabla-matriz
 *     (mapa de calor, presupuesto) se congela en scroll horizontal (Patrón A, excepción declarada).
 *  2. `striped` en `TableBody`: el cebreado alterno de una tabla-lista es mecánico (CSS
 *     `nth-child`), no aritmética `i % 2` repetida a mano en cada uno de los 46 consumidores.
 *
 * No usa @testing-library/react (no está instalado en el repo y ningún componente de `ui/` tiene
 * tests de render hoy -- ver `dialogRawSizingGuard.test.ts` para el patrón equivalente de guarda
 * estática). `renderToStaticMarkup` alcanza: solo hace falta el HTML resultante, sin DOM ni
 * interacción.
 */

describe('ui/table.tsx — aspecto canónico', () => {
  it('Table envuelve en el contenedor canónico (esquinas redondeadas, borde y fondo neutros, recorte de esquinas)', () => {
    const html = renderToStaticMarkup(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(html).toContain('rounded-xl');
    expect(html).toContain('border-gray-200');
    expect(html).toContain('bg-white');
    expect(html).toContain('overflow-hidden');
    // El scroll horizontal vive en un envoltorio interno, no en el mismo nodo que recorta las
    // esquinas -- si fuera el mismo nodo, `overflow-x-auto` sin `overflow-hidden` explícito
    // dejaría fugar el fondo del thead por fuera del radio en algunos navegadores.
    expect(html).toContain('overflow-x-auto');
  });

  it('la <table> respeta la escala tipográfica de "cuerpo" (16px móvil / 14px escritorio, docs/sistema-visual.md §1)', () => {
    const html = renderToStaticMarkup(
      <Table>
        <TableBody />
      </Table>,
    );
    expect(html).toContain('text-base');
    expect(html).toContain('sm:text-sm');
  });

  it('TableHead SIN "sticky" no lleva position sticky ni left-0', () => {
    const html = renderToStaticMarkup(
      <table>
        <thead>
          <tr>
            <TableHead>Vaca</TableHead>
          </tr>
        </thead>
      </table>,
    );
    expect(html).not.toMatch(/class="[^"]*\bsticky\b/);
    expect(html).not.toMatch(/class="[^"]*\bleft-0\b/);
  });

  it('TableHead CON "sticky" congela la columna (position sticky, left-0, fondo opaco propio)', () => {
    const html = renderToStaticMarkup(
      <table>
        <thead>
          <tr>
            <TableHead sticky>Vaca</TableHead>
          </tr>
        </thead>
      </table>,
    );
    expect(html).toMatch(/class="[^"]*\bsticky\b/);
    expect(html).toMatch(/class="[^"]*\bleft-0\b/);
    // Sin fondo propio, el contenido que sigue haciendo scroll por debajo se transparenta a
    // través de la celda congelada (mismo problema que resuelve `.col-etiqueta` en globals.css).
    expect(html).toMatch(/class="[^"]*\bbg-/);
  });

  it('TableCell SIN "sticky" no lleva position sticky', () => {
    const html = renderToStaticMarkup(
      <table>
        <tbody>
          <tr>
            <TableCell>1</TableCell>
          </tr>
        </tbody>
      </table>,
    );
    expect(html).not.toMatch(/class="[^"]*\bsticky\b/);
  });

  it('TableCell CON "sticky" congela la columna con fondo propio', () => {
    const html = renderToStaticMarkup(
      <table>
        <tbody>
          <tr>
            <TableCell sticky>1</TableCell>
          </tr>
        </tbody>
      </table>,
    );
    expect(html).toMatch(/class="[^"]*\bsticky\b/);
    expect(html).toMatch(/class="[^"]*\bleft-0\b/);
    expect(html).toMatch(/class="[^"]*\bbg-/);
  });

  it('TableBody SIN "striped" no agrega cebreado', () => {
    const html = renderToStaticMarkup(
      <table>
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </table>,
    );
    expect(html).not.toContain('nth-child(even)');
  });

  it('TableBody CON "striped" agrega cebreado vía nth-child (nunca aritmética por fila)', () => {
    const html = renderToStaticMarkup(
      <table>
        <TableBody striped>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </table>,
    );
    expect(html).toContain('nth-child(even)');
  });

  it('el encabezado es tenue (bg-gray-50) — no un color de marca ni un degradado (queja original del dueño)', () => {
    const html = renderToStaticMarkup(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vaca</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
    expect(html).toContain('bg-gray-50');
    expect(html).not.toContain('bg-gradient');
    expect(html).not.toContain('bg-green-600');
    expect(html).not.toContain('bg-primary');
  });
});
