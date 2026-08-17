import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AccionCard } from '@/components/dashboard/AccionCard';
import type { AccionParaMostrar } from '@/types/acciones';

/**
 * Guardas de aspecto/estado del bloque "Acciones recomendadas" (Fase 4).
 * No usa @testing-library/react (no está instalado, ver `uiTableCanonico.test.tsx`
 * para el precedente) -- `renderToStaticMarkup` alcanza para verificar clases
 * y contenido; ningún test de aquí depende de interacción real.
 */

const SRC = join(__dirname, '..');

function fuente(ruta: string): string {
  return readFileSync(join(SRC, ruta), 'utf-8');
}

/** El código sin líneas de comentario -- para que un JSDoc que EXPLICA una
 *  regla (y por tanto nombra la palabra que la regla prohíbe) no dispare un
 *  falso positivo del propio guard que la documenta. */
function codigoSinComentarios(ruta: string): string {
  return fuente(ruta)
    .split('\n')
    .filter((linea) => {
      const t = linea.trim();
      return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/**');
    })
    .join('\n');
}

const accionEjemplo: AccionParaMostrar = {
  id: 'a1',
  clave: 'hato_lechero.vacias_90d',
  negocio: 'hato_lechero',
  frase: 'Revisar las 11 vacas vacías con más de 90 días',
  evidencia: [
    '11 de 65 vacas llevan 90 días o más vacías — v_hato_estado_actual, hoy',
    'Último chequeo veterinario 9 de julio, hace 38 días — hato_chequeos',
  ],
  boton: { etiqueta: 'Ver las vacías', ruta: '/hato-lechero/hato?filtro=vacias_90d' },
};

describe('AccionCard — aspecto (§9.2 del plan del tablero)', () => {
  it('con acciones: pinta la frase, la evidencia y el botón primario con la etiqueta del catálogo', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AccionCard negocio="hato_lechero" etiqueta="Hato Lechero" acciones={[accionEjemplo]} onDescartar={() => {}} />
      </MemoryRouter>,
    );
    expect(html).toContain('Revisar las 11 vacas vacías con más de 90 días');
    expect(html).toContain('vacas llevan');
    expect(html).toContain('Ver las vacías');
    expect(html).toContain('No es útil');
  });

  it('vacío honesto: la tarjeta se conserva con una línea que declara el vacío, nunca un genérico', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AccionCard negocio="hato_lechero" etiqueta="Hato Lechero" acciones={[]} onDescartar={() => {}} />
      </MemoryRouter>,
    );
    expect(html).toContain('Hato Lechero');
    expect(html).toContain('Sin acciones recomendadas para el hato hoy.');
    // Prohibido rellenar con genéricos tipo "seguir monitoreando".
    expect(html).not.toContain('seguir monitoreando');
  });

  it('nunca pinta la frase con dangerouslySetInnerHTML -- el texto va como children de React (auto-escapado)', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AccionCard
          negocio="hato_lechero"
          etiqueta="Hato Lechero"
          acciones={[{ ...accionEjemplo, frase: '<script>alert(1)</script>' }]}
          onDescartar={() => {}}
        />
      </MemoryRouter>,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('sin punto de color de prioridad, sin borde de alerta, sin fondo teñido -- ese lenguaje es del bloque 1', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AccionCard negocio="hato_lechero" etiqueta="Hato Lechero" acciones={[accionEjemplo]} onDescartar={() => {}} />
      </MemoryRouter>,
    );
    // El contenedor de la tarjeta -- no toda la marca renderizada, que
    // incluye las clases propias del primitivo `Button` compartido
    // (`aria-invalid:border-destructive` es un affordance de accesibilidad
    // presente en TODOS los botones de la app, no un color de alerta de
    // este bloque).
    const contenedor = html.match(/^<div class="([^"]*)"/)?.[1] ?? '';
    expect(contenedor).not.toMatch(/warning/);
    expect(contenedor).not.toMatch(/(border|bg)-(red|destructive)/);
    // Ningún punto/badge de color de prioridad (el patrón que sí usa el
    // bloque 1, ver `AlertList.tsx`: `rounded-full bg-red-500` etc.).
    expect(html).not.toMatch(/rounded-full bg-(red|yellow|green)-\d/);
  });
});

describe('AccionCard/AccionesRecomendadas — guardas estructurales (molde esco-evals.test.ts)', () => {
  it('AccionCard.tsx no usa dangerouslySetInnerHTML ni un renderizador de markdown', () => {
    const src = codigoSinComentarios('components/dashboard/AccionCard.tsx');
    expect(src).not.toMatch(/dangerouslySetInnerHTML/);
    expect(src).not.toMatch(/ReactMarkdown|marked\(/);
  });

  it('AccionesRecomendadas.tsx no usa dangerouslySetInnerHTML ni un renderizador de markdown', () => {
    const src = codigoSinComentarios('components/dashboard/AccionesRecomendadas.tsx');
    expect(src).not.toMatch(/dangerouslySetInnerHTML/);
    expect(src).not.toMatch(/ReactMarkdown|marked\(/);
  });

  it('AccionCard.tsx nunca usa las clases de alerta del bloque 1 (border-warning/bg-warning) en su propio JSX', () => {
    // Sólo el código de la tarjeta, no los comentarios que EXPLICAN la regla
    // (que sí mencionan la palabra "prioridad" al citar el contraste con el
    // bloque 1) -- se descartan las líneas de comentario antes de buscar.
    const src = codigoSinComentarios('components/dashboard/AccionCard.tsx');
    expect(src).not.toMatch(/border-warning/);
    expect(src).not.toMatch(/bg-warning/);
  });

  it('useAccionesRecomendadas.ts descarta escribiendo en acciones_silencios, nunca en la fila de la acción', () => {
    const src = fuente('components/dashboard/hooks/useAccionesRecomendadas.ts');
    expect(src).toContain("from('acciones_silencios')");
    // El único UPDATE sobre acciones_recomendadas debe ser el de `caducada_at`
    // (§6.4) -- nunca un `estado='descartada'` en esa tabla.
    const actualizacionesAccionesRecomendadas = src.match(/from\('acciones_recomendadas'\)\s*\n?\s*\.update\(\{[^}]*\}/g) ?? [];
    for (const bloque of actualizacionesAccionesRecomendadas) {
      expect(bloque).toContain('caducada_at');
    }
  });
});
