// ARCHIVO: utils/supabase/respuestaEdgeFunction.ts
// DESCRIPCIÓN: Lectura segura del cuerpo de una respuesta `fetch()` contra
// una edge function de Supabase. Los ~6 hooks de `components/hato/hooks/`
// hacían `await res.json()` a ciegas: cuando el servidor responde algo que
// NO es JSON (una ruta 404 sin desplegar devuelve el texto plano por
// defecto de Hono, `"404 Not Found"`; un proxy caído puede devolver HTML),
// `JSON.parse` revienta con un `SyntaxError` cuyo mensaje ("Unexpected
// non-whitespace character after JSON at position 4...") terminaba en
// pantalla, en rojo, delante de Martha -- jerga de parser que no dice nada
// accionable.
//
// Este helper separa las dos preguntas que el código anterior mezclaba:
// "¿el cuerpo es JSON parseable?" (aquí) y "¿la operación fue exitosa?"
// (sigue en cada hook, sin cambios -- ese camino ya funciona bien: un 401
// con `{ error: '...' }` ya llega legible hoy).
//
// Nunca lanza `SyntaxError` -- ver `leerCuerpoEdgeFunction`.

/** Cuerpo parseado con éxito -- puede ser un éxito o un error de negocio
 * (`{ success: false, error: '...' }`); ese segundo caso lo sigue
 * distinguiendo cada hook, como hoy. */
export interface CuerpoEdgeFunctionOk<T> {
  ok: true;
  body: T;
}

/** El cuerpo no se pudo interpretar como JSON -- `mensaje` ya es texto en
 * español, accionable, listo para `toast`/`setError`, sin rastro del
 * `SyntaxError` original. */
export interface CuerpoEdgeFunctionNoJson {
  ok: false;
  mensaje: string;
}

export type ResultadoCuerpoEdgeFunction<T> = CuerpoEdgeFunctionOk<T> | CuerpoEdgeFunctionNoJson;

/**
 * Arma el mensaje que ve el usuario cuando el cuerpo de la respuesta no es
 * JSON. Nunca menciona "JSON"/"parser"/"SyntaxError" -- describe la causa
 * probable en términos que Martha puede actuar, y siempre incluye el status
 * HTTP para que soporte tenga algo concreto que buscar en los logs.
 */
function mensajeCuerpoNoJson(status: number, textoBruto: string): string {
  if (status === 404) {
    return (
      `El servidor no reconoce esta operación (error ${status}) -- probablemente la función ` +
      `no está desplegada o cambió de dirección. Avisa a soporte antes de reintentar.`
    );
  }
  if (status >= 500) {
    return `El servidor tuvo un error interno (${status}) y no devolvió una respuesta válida. Avisa a soporte.`;
  }
  if (!textoBruto.trim()) {
    return `El servidor respondió vacío (error ${status}). Avisa a soporte.`;
  }
  return `El servidor respondió algo inesperado (error ${status}) y no en el formato que la app espera. Avisa a soporte.`;
}

/**
 * Lee el `body` de `res` como texto primero y SOLO ENTONCES intenta
 * `JSON.parse` -- nunca `res.json()` directo, que es lo que dejaba escapar
 * el `SyntaxError` crudo hacia la UI.
 *
 * - Cuerpo JSON válido (vacío incluido no cuenta como JSON -- ver abajo):
 *   `{ ok: true, body }`. El llamador sigue decidiendo éxito/error de
 *   negocio exactamente como antes (`!res.ok || !body?.success`).
 * - Cuerpo NO JSON (texto plano, HTML, vacío): `{ ok: false, mensaje }`,
 *   listo para `throw new Error(mensaje)` sin ningún `SyntaxError` de por
 *   medio.
 */
export async function leerCuerpoEdgeFunction<T = unknown>(res: Response): Promise<ResultadoCuerpoEdgeFunction<T>> {
  const textoBruto = await res.text();

  if (!textoBruto.trim()) {
    return { ok: false, mensaje: mensajeCuerpoNoJson(res.status, textoBruto) };
  }

  try {
    return { ok: true, body: JSON.parse(textoBruto) as T };
  } catch {
    return { ok: false, mensaje: mensajeCuerpoNoJson(res.status, textoBruto) };
  }
}
