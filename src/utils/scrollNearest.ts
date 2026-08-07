// ARCHIVO: utils/scrollNearest.ts
// DESCRIPCIÓN: Cálculo puro para mantener un elemento activo visible dentro
// de un contenedor con scroll -- mismo criterio "nearest" que
// `Element.scrollIntoView({ block: 'nearest' })`, pero devuelto como el
// `scrollTop` a aplicar (o `null` si ya está visible) en vez de tocar el DOM
// directamente. Así el llamador decide cuándo aplicar el ajuste y la lógica
// se prueba con números planos, sin jsdom (este repo no lo tiene configurado
// -- ver src/__tests__/, todos los tests son de lógica pura).
//
// Origen: sidebar de Layout.tsx (docs/plan_tailwind_pipeline.md, fase F2 #1).
// Al encenderse el compilador de Tailwind los ítems del nav pasaron de ~31px
// a 44-48px reales; con varios grupos abiertos el contenido del nav puede
// medir más que su contenedor, y sin esto el ítem activo queda parcialmente
// tapado por el bloque de perfil. El nav ya tenía `overflow-y: auto`, pero
// nada movía el scroll hacia el ítem activo.

/** Medidas de un contenedor con scroll, en coordenadas de viewport. */
export interface RectoConScroll {
  /** Borde superior del contenedor (`getBoundingClientRect().top`). */
  top: number;
  /** Alto visible del contenedor (`getBoundingClientRect().height`). */
  height: number;
  /** Scroll vertical actual del contenedor (`element.scrollTop`). */
  scrollTop: number;
}

/** Medidas de un elemento, en coordenadas de viewport. */
export interface RectoSimple {
  /** Borde superior del elemento (`getBoundingClientRect().top`). */
  top: number;
  /** Alto del elemento (`getBoundingClientRect().height`). */
  height: number;
}

/**
 * Devuelve el nuevo `scrollTop` que deja `elemento` completamente visible
 * dentro de `contenedor`, o `null` si ya lo está (no hay nada que ajustar).
 *
 * Si el elemento queda arriba del área visible, sube justo hasta que su
 * borde superior calce con el del contenedor; si queda abajo, baja justo
 * hasta que su borde inferior calce. Nunca lo centra ("nearest", no
 * "center") -- así un solo ítem activo no reordena visualmente el resto del
 * menú más de lo necesario.
 */
export function calcularScrollNearest(
  contenedor: RectoConScroll,
  elemento: RectoSimple,
): number | null {
  const elTop = elemento.top - contenedor.top + contenedor.scrollTop;
  const elBottom = elTop + elemento.height;
  const vistaTop = contenedor.scrollTop;
  const vistaBottom = vistaTop + contenedor.height;

  if (elTop < vistaTop) return elTop;
  if (elBottom > vistaBottom) return elBottom - contenedor.height;
  return null;
}
