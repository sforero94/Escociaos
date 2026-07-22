// ARCHIVO: scripts/import-hato/alias-hooks.mjs
// DESCRIPCIÓN: Hook de resolución de módulos ESM (Node `node:module`
// `register()` API) que traduce el alias `@/` -> `<repo>/src/` en tiempo de
// ejecución. Necesario SOLO para correr los runners de `scripts/import-hato/`
// con `node` directo: Vite/Vitest ya resuelven `@/` vía `vite.config.ts`
// (`resolve.alias`), pero un `node script.ts` plano no sabe qué es `@/`.
//
// Por qué esto y no una dependencia nueva (`tsx`, `ts-node`,
// `tsconfig-paths`): Node 24 (instalado en este entorno) ejecuta `.ts`
// directo con "type stripping" nativo -- lo único que falta es la
// resolución de alias, y eso es ~25 líneas de `node:module`/`node:url`/
// `node:fs`, ya en la stdlib. Añadir una dependencia solo para esto no se
// justifica (regla de CLAUDE.md: "Dependencies need justification").
//
// USO: no se invoca a mano. `register-alias.mjs` lo registra vía
// `node:module` `register()` antes de que se resuelva ningún import de los
// runners -- ver ese archivo.

import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const SRC_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../src');

const EXTENSIONES_CANDIDATAS = ['.ts', '.tsx', '/index.ts'];

function primerArchivoQueExiste(base) {
  for (const ext of ['', ...EXTENSIONES_CANDIDATAS]) {
    const candidato = base + ext;
    if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) return candidato;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // 1. Alias `@/` -> `src/`.
  if (specifier.startsWith('@/')) {
    const hallado = primerArchivoQueExiste(path.join(SRC_DIR, specifier.slice(2)));
    if (hallado) return nextResolve(pathToFileURL(hallado).href, context);
  }

  // 2. Imports relativos SIN extensión (`./grilla`, `../tipos`). El código de
  //    `src/` los escribe así porque Vite/Vitest los resuelven solos; Node ESM
  //    en cambio exige la extensión explícita. Sin esto, el hook resolvía el
  //    punto de entrada pero fallaba en el primer import interno.
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier)) {
    const padre = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : null;
    if (padre) {
      const hallado = primerArchivoQueExiste(path.resolve(padre, specifier));
      if (hallado) return nextResolve(pathToFileURL(hallado).href, context);
    }
  }

  return nextResolve(specifier, context);
}
