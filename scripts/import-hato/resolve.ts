// ARCHIVO: scripts/import-hato/resolve.ts
// DESCRIPCIÓN: Runner de I/O de la etapa "Resolve" (plan
// docs/plan_hato_lechero_module.md §7.4, paso 3). Única capa que toca disco
// en esta etapa -- toda la lógica de negocio vive en
// `src/utils/importHato/resolver.ts` y `src/utils/importHato/reporte.ts`
// (puros, testeados con Vitest). Este archivo solo: lee el JSON intermedio
// que escribe Extract, invoca el motor puro, y escribe los dos deliverables.
//
// USO:
//   npx tsx scripts/import-hato/resolve.ts [ruta-normalizado.json]
//
// Por defecto lee `scripts/import-hato/out/normalizado.json` (el que escribe
// el runner de Extract, agente A) y escribe:
//   - scripts/import-hato/out/animales.csv
//   - scripts/import-hato/out/resolution-report.md
//
// `scripts/` NO está en el `include` de tsconfig.json (contrato
// docs/hato/s3-contrato-pipeline.md) -- no hay typecheck/lint/test aquí a
// propósito; toda la lógica que sí necesita esas redes de seguridad vive en
// `src/utils/importHato/`. Requiere un runner de TypeScript (ej. `tsx`, no
// está hoy en devDependencies -- ver el reporte del agente que escribió esto
// para la justificación de por qué no se agregó sin pedir autorización).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverIdentidadHato, animalesACsv } from '../../src/utils/importHato/resolver';
import { generarResolutionReport } from '../../src/utils/importHato/reporte';
import type { SalidaNormalizado } from '../../src/utils/importHato/tipos';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolvePath(__dirname, 'out');

function main(): void {
  const rutaEntrada = process.argv[2] ?? resolvePath(OUT_DIR, 'normalizado.json');

  if (!existsSync(rutaEntrada)) {
    console.error(`No se encontró ${rutaEntrada}.`);
    console.error('Corre primero el Extract del agente A, o pasa la ruta como argumento:');
    console.error('  npx tsx scripts/import-hato/resolve.ts <ruta-normalizado.json>');
    process.exit(1);
  }

  const crudo = readFileSync(rutaEntrada, 'utf-8');
  const entrada = JSON.parse(crudo) as SalidaNormalizado;

  // `Date.now()`/`new Date()` es aceptable AQUÍ (capa de I/O), nunca dentro
  // de `resolverIdentidadHato` -- se inyecta como parámetro (regla de
  // pureza del pipeline, ver cabecera de `resolver.ts`).
  const generadoEn = new Date().toISOString();
  const resultado = resolverIdentidadHato(entrada, generadoEn);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const rutaCsv = resolvePath(OUT_DIR, 'animales.csv');
  const rutaReporte = resolvePath(OUT_DIR, 'resolution-report.md');

  writeFileSync(rutaCsv, animalesACsv(resultado.animales), 'utf-8');
  writeFileSync(rutaReporte, generarResolutionReport(resultado), 'utf-8');

  const colisionesVigentes = resultado.colisiones.filter((c) => c.vigente).length;
  // Lo que bloquea NO es "haber una colisión vigente" sino que quede alguna
  // SIN CUBRIR por `overridesChapeta.ts`. Contar las vigentes a secas hacía
  // que el runner anunciara "Load NO puede correr" cuando el reporte, en la
  // misma corrida, decía correctamente "0 decisiones bloquean la carga".
  const sinCubrir = resultado.colisionesSinCubrir.length;

  console.log('--- Resolve: resumen ---');
  console.log(`Lecturas de chequeo procesadas: ${resultado.totales.lecturasChequeo}`);
  console.log(`Animales resueltos: ${resultado.animales.length}`);
  console.log(`Colisiones de chapeta vigentes: ${colisionesVigentes} (desempatadas provisionalmente: ${colisionesVigentes - sinCubrir})`);
  console.log(`Colisiones SIN cubrir (bloquean Load): ${sinCubrir}`);
  console.log(`Escrito: ${rutaCsv}`);
  console.log(`Escrito: ${rutaReporte}`);
  console.log('');
  if (sinCubrir > 0) {
    console.log(`Load NO puede correr: quedan ${sinCubrir} colisión(es) sin desempatar -- ver resolution-report.md sección 1.`);
  } else {
    console.log('Load puede correr: no queda ninguna colisión vigente sin desempatar.');
    console.log('Recuerda que los números 900-999 son PROVISIONALES -- ver sección 2 del reporte.');
  }
}

main();
