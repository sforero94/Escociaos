/**
 * Hallazgo ESCO-77: la única copia de producción de la lógica anti-invención
 * de Informes de visita vive en un TERCER árbol de edge function
 * (`supabase/functions/informes-visita-proponer/index.ts`, standalone,
 * desplegado independiente de `make-server-1ccce916`) que ningún test de
 * paridad vigilaba — `informesVisitaParidadSnippets.test.ts` solo compara los
 * dos árboles de `make-server`.
 *
 * El propio encabezado del standalone dice "GENERATED COPY ... If this test
 * fails, edit the frontend originals and recopy" — pero ese test no existía.
 * Este lo cierra: compara, función por función, el cuerpo INLINE del
 * standalone contra `src/supabase/functions/server/informes-visita-snippets.ts`
 * (que ya está parity-testeado contra el frontend por el test hermano), en
 * vez de importar el standalone como módulo -- tiene un `Deno.serve(...)` de
 * nivel superior que revienta bajo Node/Vitest.
 *
 * NO se retira el árbol standalone en este cambio: el frontend
 * (`clienteProponer.ts`) sigue llamándolo porque la ruta gemela de
 * `make-server-1ccce916` (agregada en 3b3ffd3, closes ESCO-77 opción b) no
 * está desplegada todavía -- verificado en vivo el 2026-09-13, la ruta
 * responde 404 en el bundle publicado. Repuntar el frontend antes de ese
 * despliegue rompería la funcionalidad en producción. Retirar el standalone
 * es la opción (b) del hallazgo y queda para cuando ese despliegue exista;
 * mientras tanto, esta guarda (opción a) es la que evita que las reglas
 * diverjan en silencio.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '../..');
const STANDALONE = readFileSync(
  resolve(RAIZ, 'supabase/functions/informes-visita-proponer/index.ts'),
  'utf-8',
);
const CANONICO = readFileSync(
  resolve(RAIZ, 'src/supabase/functions/server/informes-visita-snippets.ts'),
  'utf-8',
);

/**
 * Extrae el cuerpo fuente de una función nombrada (`function nombre(...) { ... }`,
 * con o sin `export`), contando llaves para hallar el cierre real -- no sirve
 * un regex no-goloso porque estas funciones contienen objetos y regex con
 * llaves propias. Lanza si no la encuentra: un texto vacío pasaría cualquier
 * comparación en silencio, que es justo el fallo que esta guarda existe para
 * impedir.
 */
function extraerFuncion(contenido: string, nombre: string): string {
  const patron = new RegExp(`(?:export\\s+)?function\\s+${nombre}\\s*\\(`);
  const m = patron.exec(contenido);
  if (!m) throw new Error(`No se encontró la función "${nombre}" en el archivo.`);
  const inicioLlave = contenido.indexOf('{', m.index);
  if (inicioLlave === -1) throw new Error(`"${nombre}": no se encontró "{" de apertura.`);
  let profundidad = 0;
  for (let i = inicioLlave; i < contenido.length; i++) {
    if (contenido[i] === '{') profundidad++;
    else if (contenido[i] === '}') {
      profundidad--;
      if (profundidad === 0) return contenido.slice(m.index, i + 1);
    }
  }
  throw new Error(`"${nombre}": no se encontró el "}" de cierre.`);
}

// Las funciones que deciden qué se acepta como snippet real -- el contrato
// "nunca inventes un insumo, dosis, carencia, lote o cifra que no esté en el
// texto" vive exactamente acá. Más las de cabecera/fecha, que alimentan la
// misma respuesta. Deliberadamente NO se compara `Deno.serve(...)` ni el
// manejo HTTP: eso es infraestructura de cada árbol, no la regla de negocio.
const FUNCIONES_A_VIGILAR = [
  'parsearFechaInforme',
  'extraerPrimeraFechaDelTexto',
  'extraerCabecera',
  'fusionarCabecera',
  'normalizarParaCita',
  'citaEstaEnTexto',
  'insumoEstaEnSnippet',
  'construirPromptSnippets',
  'esquemaJsonSnippets',
  'parsearRespuestaSnippets',
];

describe('paridad: informes-visita-proponer standalone ⇄ árbol canónico', () => {
  it.each(FUNCIONES_A_VIGILAR)('%s es idéntica en las dos copias', (nombre) => {
    const a = extraerFuncion(STANDALONE, nombre);
    const b = extraerFuncion(CANONICO, nombre);
    expect(a).toBe(b);
  });

  it('el standalone sigue declarando que es una copia generada', () => {
    // Si alguna vez se retira ese encabezado sin retirar también el árbol,
    // esta guarda deja de tener a quién avisar -- se prefiere que falle acá
    // en vez de quedar diciendo una mentira sobre un archivo que ya cambió.
    expect(STANDALONE).toMatch(/GENERATED COPY/);
  });
});
