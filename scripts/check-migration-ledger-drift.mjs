#!/usr/bin/env node
// Detecta nombres del ledger de Supabase (`schema_migrations`) que no tienen
// fichero en `src/sql/migrations/`. ESCO-112: `limpieza_chequeo_prueba_qa_2020_01_15`
// corrio el 2026-09-16 y no dejo archivo -- cada agente que reconcilia el
// ledger contra el repo lo vuelve a descubrir.
//
// La logica pura vive aca y se prueba en check-migration-ledger-drift.test.mjs.
// Comparar contra produccion exige una consulta read-only; este script solo
// hace el diff. Quien tenga el conector corre:
//   SELECT name FROM supabase_migrations.schema_migrations
// y alimenta la lista.
//
// Uso:
//   node scripts/check-migration-ledger-drift.mjs
//     -> imprime los slugs de los ficheros numerados (para cotejar a mano)
//   node scripts/check-migration-ledger-drift.mjs --ledger names.txt
//     -> un nombre de ledger por linea; sale 1 si alguno no tiene archivo.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR_MIGRACIONES_POR_DEFECTO = 'src/sql/migrations';

/**
 * `157_limpieza_chequeo_prueba_qa.sql` -> `limpieza_chequeo_prueba_qa`
 * `147_fn_ronda_resolver_con_captura_cantidad_confirmada.sql`
 *   -> `147_fn_ronda_resolver_con_captura_cantidad_confirmada` (full)
 * y el slug sin prefijo.
 * @param {string} filename
 */
export function slugDeArchivoMigracion(filename) {
  const base = filename.replace(/\.sql$/i, '');
  const sinNumero = base.replace(/^\d{3}_/, '');
  return { full: base, slug: sinNumero };
}

/**
 * Un fichero `NNN_slug.sql` cubre un `name` del ledger si el name es el
 * fichero completo, el slug, o el slug como prefijo (el ledger a veces
 * agrega un sufijo: `limpieza_chequeo_prueba_qa_2020_01_15`).
 * @param {string} filename
 * @param {string} ledgerName
 */
export function archivoCubreNombreLedger(filename, ledgerName) {
  if (!ledgerName) return false;
  const { full, slug } = slugDeArchivoMigracion(filename);
  return (
    ledgerName === full ||
    ledgerName === slug ||
    ledgerName.startsWith(`${slug}_`) ||
    ledgerName.startsWith(`${full}_`)
  );
}

/**
 * Nombres del ledger que no tienen ningun fichero numerado que los cubra.
 * @param {string[]} ledgerNames
 * @param {string[]} filenames
 */
export function nombresLedgerSinArchivo(ledgerNames, filenames) {
  const numerados = filenames.filter((f) => /^\d{3}_.*\.sql$/i.test(f));
  return ledgerNames.filter(
    (n) => n && !numerados.some((f) => archivoCubreNombreLedger(f, n)),
  );
}

/**
 * Nombres del ledger que DEBEN tener un archivo de registro. Son los que
 * ya corrieron en produccion sin fichero y se reconstruyeron despues
 * (patron 067 / 079 / 108 / 157). Si falta uno, ESCO-112 se repite.
 */
export const LEDGER_CON_ARCHIVO_DE_REGISTRO = [
  'hato_registrar_salida',
  'drop_compra_a_gasto_trigger',
  'ganado_revertir_duplicado_carga_inicial',
  'limpieza_chequeo_prueba_qa_2020_01_15',
];

export function listarArchivosMigracion(dir = DIR_MIGRACIONES_POR_DEFECTO) {
  return readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/i.test(f)).sort();
}

function main() {
  const dir = process.env.MIGRATIONS_DIR || DIR_MIGRACIONES_POR_DEFECTO;
  const archivos = listarArchivosMigracion(dir);
  const idx = process.argv.indexOf('--ledger');
  if (idx === -1) {
    console.log(`ficheros numerados en ${dir}: ${archivos.length}`);
    const huerfanosRegistro = nombresLedgerSinArchivo(
      LEDGER_CON_ARCHIVO_DE_REGISTRO,
      archivos,
    );
    if (huerfanosRegistro.length) {
      console.error(
        `FALTA archivo de registro para: ${huerfanosRegistro.join(', ')}`,
      );
      process.exit(1);
    }
    console.log('OK: los nombres de registro conocidos tienen fichero.');
    return;
  }
  const ruta = process.argv[idx + 1];
  if (!ruta) {
    console.error('Uso: node scripts/check-migration-ledger-drift.mjs --ledger names.txt');
    process.exit(1);
  }
  const names = readFileSync(ruta, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const huerfanos = nombresLedgerSinArchivo(names, archivos);
  if (huerfanos.length) {
    console.error(`LEDGER SIN ARCHIVO (${huerfanos.length}):`);
    for (const n of huerfanos) console.error(`  ${n}`);
    process.exit(1);
  }
  console.log(`OK: ${names.length} nombres del ledger cubiertos por ${archivos.length} ficheros.`);
}

const esteModulo = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === esteModulo) {
  main();
}
