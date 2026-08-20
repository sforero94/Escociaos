import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guarda: el estado que se guarda NO es el que se muestra.
 *
 * `aplicaciones.estado` guarda `Calculada`, pero la UI viene diciendo **"Planificada"** desde
 * siempre — `AplicacionesList.tsx` lo traduce con su `ESTADO_LABELS`, el `<select>` de filtro usa
 * esa etiqueta y el KPI dice "Planificadas". La primera versión de `EstadoAplicacionBadge`
 * renderizaba `{estado}` crudo; al cablearla a las 5 pantallas habría cambiado esa palabra en
 * silencio, sin migración, sin error de tipos y sin que ningún test existente lo notara.
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

  it('la traducción del componente coincide con la que ya usa AplicacionesList', () => {
    const lista = readFileSync(LISTA, 'utf8');
    // AplicacionesList es la fuente histórica de la etiqueta: si alguien la cambia allá,
    // este test obliga a cambiarla también en el componente compartido (o al revés).
    const listaTraduce = new RegExp(
      `['"]${TRADUCCION_OBLIGATORIA.guardado}['"]\\s*:\\s*['"]${TRADUCCION_OBLIGATORIA.visible}['"]`,
    ).test(lista);
    const badgeTraduce = new RegExp(
      `${TRADUCCION_OBLIGATORIA.guardado}\\s*:\\s*['"]${TRADUCCION_OBLIGATORIA.visible}['"]`,
    ).test(badge);

    expect(
      listaTraduce && badgeTraduce,
      'AplicacionesList y EstadoAplicacionBadge deben coincidir en la etiqueta visible. ' +
        `Lista traduce: ${listaTraduce}. Badge traduce: ${badgeTraduce}.`,
    ).toBe(true);
  });
});
