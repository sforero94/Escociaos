import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guarda: el estado que se guarda NO es el que se muestra.
 *
 * `aplicaciones.estado` guarda `Calculada`, pero la UI viene diciendo **"Planificada"** desde
 * siempre. Antes de W00, `AplicacionesList.tsx` traducía con su propio `ESTADO_LABELS`; la
 * primera versión de `EstadoAplicacionBadge` renderizaba `{estado}` crudo, y cablearla a las 5
 * pantallas habría cambiado esa palabra en silencio, sin migración, sin error de tipos y sin que
 * ningún test existente lo notara.
 *
 * W00 (implementación) eliminó el `ESTADO_LABELS` local de `AplicacionesList.tsx` — la Lista ya
 * no tiene su propio mapa, delega el badge por completo en `EstadoAplicacionBadge`. Con eso
 * dejó de haber DOS mapas que puedan desincronizarse; solo queda uno, y ese es el que las otras
 * tres pruebas de este archivo ya vigilan. Lo único que `AplicacionesList.tsx` sigue necesitando
 * decidir por su cuenta es el texto visible de su `ToggleGroup` de filtro (no puede importar la
 * etiqueta del Badge porque el filtro también tiene una opción "Todos" que el Badge no conoce) —
 * eso es lo que las dos pruebas de abajo verifican, en vez de exigir un segundo mapa idéntico.
 *
 * Esta guarda es estática a propósito: el defecto no es de comportamiento (el componente
 * "funciona" igual), es de contrato con la usuaria, y solo se ve leyendo qué texto sale a pantalla.
 */

const RAIZ = join(__dirname, '..');
const BADGE = join(RAIZ, 'components/aplicaciones/shared/EstadoAplicacionBadge.tsx');
const LISTA = join(RAIZ, 'components/aplicaciones/AplicacionesList.tsx');

/** Único par estado-guardado → etiqueta-visible que puede divergir. El resto es identidad. */
const TRADUCCION_OBLIGATORIA = { guardado: 'Calculada', visible: 'Planificada' } as const;

describe('EstadoAplicacionBadge — etiquetas visibles', () => {
  const badge = readFileSync(BADGE, 'utf8');

  it('traduce el estado guardado a la etiqueta que ve la usuaria, no lo imprime crudo', () => {
    expect(
      badge.includes(`'${TRADUCCION_OBLIGATORIA.visible}'`),
      `EstadoAplicacionBadge debe mostrar "${TRADUCCION_OBLIGATORIA.visible}" cuando el estado ` +
        `guardado es "${TRADUCCION_OBLIGATORIA.guardado}". Si imprime el valor crudo, la pantalla ` +
        `empieza a decir una palabra distinta a la que la gente lleva meses leyendo.`,
    ).toBe(true);
  });

  it('no renderiza {estado} directamente dentro del Badge', () => {
    const renderizaCrudo = /<Badge[^>]*>\s*\{\s*estado\s*\}/s.test(badge);
    expect(
      renderizaCrudo,
      'El Badge debe renderizar la etiqueta traducida, no `{estado}`.',
    ).toBe(false);
  });

  it('sigue mostrando — cuando no hay estado, nunca un estado inventado', () => {
    expect(badge).toMatch(/if\s*\(!estado\)/);
    expect(badge).toContain('—');
  });

  it('AplicacionesList delega el badge de estado en el componente compartido, no en un mapa propio', () => {
    const lista = readFileSync(LISTA, 'utf8');
    expect(
      lista.includes('EstadoAplicacionBadge'),
      'AplicacionesList.tsx debe importar y usar <EstadoAplicacionBadge> en vez de reimplementar ' +
        'su propio mapa estado→etiqueta (eso es exactamente lo que este módulo tenía antes y lo ' +
        'que causaba que las pantallas se desincronizaran).',
    ).toBe(true);
  });

  it('el ToggleGroup de filtro de AplicacionesList sigue mostrando la misma etiqueta visible ("Planificada")', () => {
    const lista = readFileSync(LISTA, 'utf8');
    // El filtro no puede delegar la etiqueta en el Badge (tiene una opción "Todos" que el Badge
    // no modela), así que la sigue escribiendo literal como texto de un <ToggleGroupItem> — esta
    // prueba es la que impide que ese texto se quede diciendo el valor crudo "Calculada".
    const filtroDiceLaEtiquetaVisible = new RegExp(`>\\s*${TRADUCCION_OBLIGATORIA.visible}\\s*<`).test(lista);

    expect(
      filtroDiceLaEtiquetaVisible,
      `El filtro de estado en AplicacionesList.tsx debe mostrar "${TRADUCCION_OBLIGATORIA.visible}" ` +
        `como opción visible para el estado guardado "${TRADUCCION_OBLIGATORIA.guardado}".`,
    ).toBe(true);
  });
});
