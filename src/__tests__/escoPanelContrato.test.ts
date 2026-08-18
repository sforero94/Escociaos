import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Guardas estructurales del panel de Esco (fases 2 y 3 del facelift,
 * `docs/plan_esco_facelift.md`).
 *
 * El repo no tiene entorno DOM en las pruebas — el estilo de la casa son
 * pruebas puras y guardas sobre el código fuente, como `dialogScrollContract`
 * y `climaTablaCorrectaGuard`. Estas cuidan los contratos que se rompen callados:
 * un `data-role` que se traga la traza y la mete en el PDF, un `overflow` que
 * vuelve a estrangular las gráficas, un panel que deja de ser un diálogo.
 */

const SRC = resolve(__dirname, '..');
const leer = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

/**
 * Quita comentarios antes de afirmar sobre el código.
 *
 * Sin esto, un comentario que documenta lo que se eliminó — «antes se movía
 * `document.body.style.position`» — hace fallar la guarda que prohíbe
 * justamente eso. Una guarda que no distingue código de prosa castiga
 * escribir buenos comentarios.
 */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const panel = sinComentarios(leer('components/chat/ChatPanel.tsx'));
const mensaje = sinComentarios(leer('components/chat/ChatMessage.tsx'));
const grafica = sinComentarios(leer('components/chat/ChatChart.tsx'));
const servicio = sinComentarios(leer('utils/chatService.ts'));

describe('El panel es un diálogo de verdad (punto 07)', () => {
  it('usa el Sheet de Radix, no divs fijos a mano', () => {
    expect(panel).toContain('<Sheet ');
    expect(panel).toContain('SheetContent');
  });

  /**
   * Regresión: el panel era `position: fixed` a mano y bloqueaba el scroll
   * moviendo `document.body.style.position` a `fixed` y restaurando el scrollY.
   * Además de frágil, dejaba el panel sin Escape ni trampa de foco — contra la
   * regla del CLAUDE.md «Modals/popups: always use the Dialog component».
   */
  it('no manipula el body para bloquear el scroll', () => {
    expect(panel).not.toContain('document.body.style.position');
    expect(panel).not.toContain('document.body.style.overflow');
  });

  it('declara un título accesible, que Radix exige', () => {
    expect(panel).toContain('SheetTitle');
  });
});

describe('La respuesta es un documento, no una burbuja (puntos 02 y 03)', () => {
  it('la respuesta del asistente no va dentro de una burbuja gris', () => {
    // La burbuja del usuario sí sobrevive; la del asistente era el problema.
    const vistaAsistente = mensaje.slice(mensaje.indexOf('return (\n    <div className="flex gap-2">'));
    expect(vistaAsistente).not.toContain('bg-muted');
    expect(vistaAsistente).not.toContain("maxWidth: '85%'");
  });

  it('el contenedor de la respuesta puede encogerse para que la gráfica no lo desborde', () => {
    expect(mensaje).toContain('min-w-0');
  });
});

describe('Las gráficas se adaptan al contenedor (punto 03)', () => {
  it('mide el contenedor, no el viewport', () => {
    // El panel ocupa 50vw en escritorio: una media query sobre el viewport
    // miente sobre el espacio que la gráfica tiene de verdad.
    expect(grafica).toContain('useAnchoContenedor');
    expect(grafica).not.toContain('window.innerWidth');
  });

  it('gira a barras horizontales cuando no hay ancho', () => {
    expect(grafica).toContain('barrasHorizontales');
    expect(grafica).toContain("layout={barrasHorizontales ? 'vertical' : 'horizontal'}");
  });

  /**
   * Regresión: recharts no re-deriva los ejes cuando `layout` cambia sobre una
   * instancia viva. Sin `key` la gráfica se quedaba vertical al angostarse — se
   * veía como si el umbral no funcionara.
   */
  it('remonta la gráfica al cambiar de orientación', () => {
    const barChart = grafica.slice(grafica.indexOf('<BarChart'));
    expect(barChart.slice(0, 300)).toContain('key={barrasHorizontales');
  });

  it('nunca muestra la llave cruda del JSON como nombre de serie', () => {
    expect(grafica).toContain('LLAVES_GENERICAS');
    // «value» y «total» son las que el modelo emite cuando no hay nombre real.
    expect(grafica).toMatch(/LLAVES_GENERICAS[\s\S]{0,200}'value'/);
    expect(grafica).toMatch(/LLAVES_GENERICAS[\s\S]{0,200}'total'/);
  });
});

describe('El informe exportado no se contamina', () => {
  /**
   * `handleExport` captura el nodo `[data-role="assistant"]` con html2canvas.
   * Si la traza o la barra de acciones quedaran dentro, saldrían impresas en el
   * PDF que ve el dueño.
   */
  it('data-role envuelve solo la respuesta', () => {
    const bloque = panel.slice(panel.indexOf('<div data-role={msg.role}>'));
    const cierre = bloque.indexOf('</div>');
    const contenido = bloque.slice(0, cierre);
    expect(contenido).toContain('ChatMessageView');
    expect(contenido).not.toContain('EscoTraza');
    expect(contenido).not.toContain('ChatMessageAcciones');
  });
});

describe('Se puede detener y reintentar (punto 06)', () => {
  it('el envío acepta una señal de cancelación', () => {
    expect(servicio).toContain('signal?: AbortSignal');
    expect(servicio).toMatch(/body: JSON\.stringify\([\s\S]{0,400}?\),\s*\n\s*signal,/);
  });

  it('el panel crea un AbortController por turno', () => {
    expect(panel).toContain('new AbortController()');
    expect(panel).toContain('abortRef.current?.abort()');
  });

  it('detener no se reporta como error', () => {
    expect(panel).toContain("err.name === 'AbortError'");
  });

  it('ofrece copiar y reintentar', () => {
    expect(mensaje).toContain('Copiar');
    expect(mensaje).toContain('Reintentar');
  });
});

describe('La traza sobrevive a recargar (punto 05)', () => {
  it('lee la metadata que el servidor ya persistía', () => {
    expect(panel).toContain('tool_interactions');
  });

  it('prefiere la traza en vivo, que sí trae duraciones', () => {
    const fn = panel.slice(panel.indexOf('function trazaDeMensaje'));
    const cuerpo = fn.slice(0, fn.indexOf('\n}'));
    expect(cuerpo.indexOf('metadata?.traza')).toBeLessThan(cuerpo.indexOf('tool_interactions'));
  });
});

describe('«Guarda esto» escribe de verdad (punto 04)', () => {
  it('inserta en esco_memorias desde la sesión del navegador', () => {
    expect(servicio).toContain('esco_memorias');
    expect(servicio).toContain("source_channel: 'web'");
  });

  it('respeta el CHECK de 1000 caracteres de la migración 041', () => {
    expect(servicio).toContain('slice(0, 1000)');
  });

  /**
   * Al reabrir una conversación vieja la propuesta sigue en la metadata: sin
   * esta comprobación la tarjeta la volvería a ofrecer y aceptarla duplicaría
   * la fila.
   */
  it('no vuelve a ofrecer una memoria ya guardada', () => {
    expect(servicio).toContain('memoriaYaGuardada');
    expect(leer('components/chat/EscoMemoriaAprobacion.tsx')).toContain('memoriaYaGuardada');
  });
});

describe('Los primitivos adoptados están endurecidos', () => {
  const archivos = [
    'components/chat/EscoTraza.tsx',
    'components/chat/EscoMemoriaAprobacion.tsx',
    'components/chat/ChatMessage.tsx',
    'components/chat/ChatEmptyState.tsx',
  ];

  /**
   * Medido sobre los 19 primitivos de Beautiful UI: `focus-visible` aparece en
   * 1 archivo y 5 matan el `outline` sin reponer nada. Escocia OS se opera con
   * teclado desde escritorio; lo que se adopta se endurece al entrar.
   */
  it('todo control interactivo propio tiene anillo de foco', () => {
    for (const f of archivos) {
      const src = leer(f);
      if (!src.includes('<button')) continue;
      expect(src, `${f} sin focus-visible`).toContain('focus-visible:ring');
    }
  });

  it('ningún archivo apaga el outline sin reponer nada', () => {
    for (const f of archivos) {
      const src = leer(f);
      if (src.includes('focus-visible:outline-none')) {
        expect(src, `${f} apaga el outline sin anillo`).toContain('focus-visible:ring');
      }
    }
  });
});
