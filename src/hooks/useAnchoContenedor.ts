import { useEffect, useState, type RefObject } from 'react';

/**
 * Ancho real del contenedor, no el del viewport.
 *
 * El panel de Esco ocupa 50vw en desktop y 100% en móvil, así que una media
 * query sobre el viewport miente: en un portátil de 1280 px el panel mide 640 y
 * una gráfica adentro tiene el espacio de un teléfono grande. Lo que decide el
 * layout es el contenedor.
 */
export function useAnchoContenedor(ref: RefObject<HTMLElement | null>): number {
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Medición inicial: ResizeObserver también dispara al observar, pero esto
    // evita un primer frame con ancho 0 en el que la gráfica elegiría el layout
    // equivocado y parpadearía.
    setAncho(el.getBoundingClientRect().width);

    const obs = new ResizeObserver((entradas) => {
      for (const entrada of entradas) setAncho(entrada.contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);

  return ancho;
}
