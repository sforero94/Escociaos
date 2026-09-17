/**
 * `renderizarAccion` -- el renderizador del motor de acciones recomendadas
 * (§4.4 de `docs/brief_tecnico_motor_acciones.md`).
 *
 * Sustituye las ranuras `{clave}` de una `AccionValidada` por
 * `hecho.valores[campo].render` y devuelve, junto con la frase, los rangos
 * exactos de la frase que vinieron de una sustitución (`tramos_sustituidos`).
 *
 * Ese campo no es adorno: es la evidencia MECÁNICA de R-2. Con él, "ningún
 * dígito visible tiene origen en el modelo" deja de ser una promesa y se
 * vuelve una aserción comprobable -- es literalmente lo que explota el test
 * de propiedad de `accionesAntiInvento.test.ts` (§4.5, bloque 1): se borran
 * de la frase los tramos que este renderizador sustituyó, y lo que queda no
 * puede contener un dígito, un numeral en letra ni una fecha en letra.
 *
 * `evidencia` sale de `hecho.texto` -- el texto que ya produjo el data
 * layer -- NUNCA del texto del modelo.
 *
 * Función PURA: sin red, sin Supabase, sin LLM. Nunca lanza: si una acción
 * ya validada trajera igual una ranura sin resolver (no debería, pero este
 * módulo no confía ciegamente en su llamador), deja el token `{crudo}`
 * visible en la frase y NO lo cuenta como sustituido -- así el test de
 * propiedad lo detecta en vez de esconderlo.
 *
 * Espejado byte-idéntico en
 * `src/supabase/functions/server/acciones-render.ts` y
 * `supabase/functions/make-server-1ccce916/acciones-render.ts`, guardado por
 * `accionesRenderParidad.test.ts`.
 */

import type { AccionValidada } from './accionesValidador';
import type { PaqueteAcciones } from './accionesTipos';

export interface AccionRenderizada {
  frase: string; // ranuras ya sustituidas por hecho.valores[campo].render
  evidencia: string[]; // hecho.texto, en el orden de hecho_ids -- DEL DATA LAYER
  boton: { etiqueta: string; ruta: string }; // del catálogo de destinos
  /** Rangos [inicio,fin) de `frase` que provienen de sustitución. */
  tramos_sustituidos: Array<[number, number]>;
}

const REGEX_RANURA = /\{([^{}]+)\}/g;

export function renderizarAccion(accion: AccionValidada, paquete: PaqueteAcciones): AccionRenderizada {
  const hechosById = new Map(paquete.hechos.map((h) => [h.id, h] as const));
  // Por (id, negocio), no por id solo: `fin.presupuesto` (§3.3 ter) es el
  // mismo destino_id compartido por las tres tarjetas -- ver la nota
  // homóloga en accionesValidador.ts.
  const destino = paquete.destinos.find((d) => d.id === accion.destino_id && d.negocio === accion.negocio);

  let frase = '';
  let cursor = 0;
  const tramos: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  const regex = new RegExp(REGEX_RANURA);

  while ((m = regex.exec(accion.plantilla)) !== null) {
    const [completo, token] = m;
    // Texto literal antes de esta ranura, tal cual está en la plantilla.
    frase += accion.plantilla.slice(cursor, m.index);
    cursor = m.index + completo.length;

    const ref = accion.ranuras[token];
    const hecho = ref ? hechosById.get(ref.hecho_id) : undefined;
    const valor = hecho ? hecho.valores[ref.campo] : undefined;

    const inicio = frase.length;
    if (valor) {
      frase += valor.render;
      tramos.push([inicio, frase.length]);
    } else {
      // No debería pasar sobre una AccionValidada (el validador ya exigió
      // que toda ranura resuelva) -- si pasa igual, se deja visible y SIN
      // marcar como sustituido, nunca se lanza.
      frase += completo;
    }
  }
  frase += accion.plantilla.slice(cursor);

  const evidencia = accion.hecho_ids
    .map((id) => hechosById.get(id)?.texto)
    .filter((texto): texto is string => typeof texto === 'string');

  return {
    frase,
    evidencia,
    boton: destino
      ? { etiqueta: destino.etiqueta_boton, ruta: destino.ruta }
      : { etiqueta: '', ruta: '' },
    tramos_sustituidos: tramos,
  };
}
