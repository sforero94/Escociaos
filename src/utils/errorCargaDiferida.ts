// ARCHIVO: utils/errorCargaDiferida.ts
// DESCRIPCIÓN: distinguir "la página quedó vieja" de un error de verdad.
//
// La aplicación carga en diferido casi todo lo pesado: las ~55 rutas por
// `React.lazy` y las librerías de exportación (`jspdf`, `jspdf-autotable`,
// `xlsx`, `html2canvas`) por `import()` dentro del handler. Cada una de esas
// cargas es una petición HTTP a un archivo con hash en el nombre.
//
// EL MODO DE FALLO QUE ESTO ATRAPA. Vercel publica cada despliegue con hashes
// nuevos y retira los viejos. Una pestaña abierta desde antes del despliegue
// sigue con el manifiesto anterior en memoria, así que al abrir una ruta nueva
// o al exportar pide un archivo que ya no existe. **Y `vercel.json` reescribe
// `/(.*)` a `/index.html`**, así que el servidor no responde 404: responde el
// HTML de la aplicación con `Content-Type: text/html`. Por eso el navegador no
// dice "no encontrado" sino que se queja del tipo MIME -- un mensaje que no se
// parece en nada a lo que en realidad pasó, y que llega al usuario como "no
// puedo generar la planilla" o como una pantalla en blanco.
//
// No es un error de datos, ni de permisos, ni de la exportación. Se arregla
// recargando, y nada más. Reconocerlo es lo único que hace falta para que el
// mensaje sea accionable.
//
// Módulo PURO, sin dependencias: lo usan tanto los handlers de exportación
// como `RouteErrorBoundary`, que es un componente de clase.

/** Cada navegador redacta este fallo a su manera, y ninguno lo llama por su
 * nombre. Se cubren las redacciones reales, no una inventada:
 *
 * - Chrome/Edge: `Failed to fetch dynamically imported module: <url>`
 * - Firefox: `error loading dynamically imported module`
 * - Safari: `Importing a module script failed.`
 * - Los tres, cuando la reescritura SPA devuelve `index.html` en vez de un
 *   404: `Failed to load module script: Expected a JavaScript module script
 *   but the server responded with a MIME type of "text/html"`.
 * - Vite, al precargar la hoja de estilos de un chunk: `Unable to preload CSS`
 * - Bundlers con nomenclatura de webpack, por si alguna dependencia la trae:
 *   `ChunkLoadError` / `Loading chunk 42 failed`
 *
 * NO se busca `Failed to fetch` a secas: ese es el error genérico de `fetch`
 * y lo produce cualquier consulta caída a Supabase. Confundirlo con esto le
 * diría al usuario que recargue cuando el problema es la red o la base --
 * mandarlo a hacer algo que no arregla nada es peor que un mensaje neutro. */
const PATRONES_CARGA_DIFERIDA: readonly RegExp[] = [
  /dynamically imported module/i,
  /Importing a module script failed/i,
  /Failed to load module script/i,
  /Expected a JavaScript module script/i,
  /Unable to preload CSS/i,
  /ChunkLoadError/i,
  /Loading chunk \S+ failed/i,
];

/** Texto con el que comparar: `message` y `name` del error, o su
 * representación si no es un `Error`. Nunca lanza -- se la llama desde un
 * `catch` y desde `getDerivedStateFromError`, dos sitios donde fallar sería
 * cambiar un error por otro peor. */
export function textoDeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === 'string') return err;
  try {
    return String(err);
  } catch {
    return '';
  }
}

/** `true` cuando el fallo es un chunk que ya no existe en el servidor. */
export function esFalloDeCargaDiferida(err: unknown): boolean {
  const texto = textoDeError(err);
  return PATRONES_CARGA_DIFERIDA.some((patron) => patron.test(texto));
}

/** Lo que se le dice al usuario cuando la página quedó vieja. Una sola
 * redacción en todo el repositorio: es la misma causa en la ruta y en la
 * exportación, y dos textos distintos para un mismo hecho hacen que el mismo
 * reporte llegue dos veces como si fueran dos problemas. */
export const MENSAJE_PAGINA_DESACTUALIZADA =
  'La aplicación se actualizó y esta pestaña quedó con la versión anterior. Recárgala (Ctrl+Shift+R) e inténtalo de nuevo.';

/**
 * Mensaje para el `catch` de una exportación. `quePasaba` describe la acción
 * en curso ("No se pudo generar el PDF de la planilla"); el resultado es esa
 * frase más la causa.
 *
 * Ante un error que NO es de carga diferida se devuelve el mensaje REAL, no
 * un texto fijo. Un `catch {}` pelado con una frase genérica -- que es como
 * estaban casi todas las exportaciones -- vuelve indistinguibles todos los
 * modos de fallo, y el diagnóstico arranca de cero cada vez.
 */
export function mensajeErrorCargaDiferida(err: unknown, quePasaba: string): string {
  if (esFalloDeCargaDiferida(err)) return `${quePasaba}: ${MENSAJE_PAGINA_DESACTUALIZADA}`;
  const detalle = err instanceof Error ? err.message : String(err);
  return detalle ? `${quePasaba}: ${detalle}` : `${quePasaba}.`;
}
