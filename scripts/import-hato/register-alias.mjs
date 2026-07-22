// ARCHIVO: scripts/import-hato/register-alias.mjs
// DESCRIPCIÓN: Registra `alias-hooks.mjs` como hook de resolución de módulos
// antes de que se resuelva ningún import de los runners. Node 24 ejecuta
// `.ts` directo (type stripping nativo), así que lo ÚNICO que falta para
// correr `scripts/import-hato/*.ts` con `node` plano es entender el alias
// `@/` -> `src/`, que es lo que hace el hook.
//
// USO:
//   node --import ./scripts/import-hato/register-alias.mjs scripts/import-hato/extract.ts
//
// No agrega ninguna dependencia: `node:module` es stdlib.

import { register } from 'node:module';

// `import.meta.url` YA es una URL `file://` -- pasarla por `pathToFileURL()`
// la vuelve a prefijar y Node busca una ruta con el esquema embebido dentro.
register('./alias-hooks.mjs', import.meta.url);
