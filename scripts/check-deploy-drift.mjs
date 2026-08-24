#!/usr/bin/env node
// Detecta DERIVA DE DESPLIEGUE de la edge function: codigo mezclado a `main`
// que nunca llego a produccion.
//
// Por que existe: el arreglo de seguridad ESCO-1 se mezclo el 2026-08-20 y se
// dio por cerrado. Cuatro dias despues seguia sin desplegarse, con cinco rutas
// de escritura abiertas anonimamente en internet. "Mezclado" no es prueba de
// que este desplegado, y hasta hoy nada lo comprobaba.
//
// El chequeo: comparar el `updated_at` del despliegue vivo contra la fecha del
// ultimo commit que toca el arbol desplegado. Si el commit es POSTERIOR al
// despliegue, hay deriva.
//
// Uso:
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/check-deploy-drift.mjs
//
// Salida: 0 = sin deriva. 1 = hay deriva, o no se pudo comprobar.

import { execFileSync } from 'node:child_process';

// --- Configuracion (todo sobreescribible por entorno) ---------------------
export const PROYECTO_POR_DEFECTO = 'ywhtjwawnkeqlwxbvgup';
export const FUNCION_POR_DEFECTO = 'make-server-1ccce916';
export const RUTA_DESPLEGADA_POR_DEFECTO = 'supabase/functions/make-server-1ccce916';

// -------------------------------------------------------------------------
// Logica pura (probada en check-deploy-drift.test.mjs)
// -------------------------------------------------------------------------

/**
 * `updated_at` de la Management API viene en EPOCH MILISEGUNDOS
 * (ej. 1787016998919 -> 2026-08-18T01:36:38Z). Tratarlo como segundos da 1970
 * y el chequeo diria "sin deriva" para siempre: es el modo de fallo silencioso
 * que hay que evitar, asi que se valida el rango en vez de confiar.
 * @param {unknown} valor
 * @returns {Date}
 */
export function parsearUpdatedAt(valor) {
  const ms = typeof valor === 'string' ? Number(valor) : valor;
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw new Error(`updated_at no es un numero: ${JSON.stringify(valor)}`);
  }
  // Un despliegue plausible cae entre 2020 y 2100. Un valor en segundos
  // (~1.8e9) queda por debajo del piso y revienta aqui, en vez de mentir.
  const PISO_MS = Date.UTC(2020, 0, 1);
  const TECHO_MS = Date.UTC(2100, 0, 1);
  if (ms < PISO_MS || ms > TECHO_MS) {
    throw new Error(
      `updated_at fuera de rango: ${ms}. Se esperan epoch MILISEGUNDOS ` +
        `(${PISO_MS}..${TECHO_MS}); un valor en segundos cae aca.`,
    );
  }
  return new Date(ms);
}

/**
 * @param {{ desplegadoEnMs: number|string, commitISO: string }} entrada
 * @returns {{ hayDeriva: boolean, desplegado: Date, commit: Date, horasDeDeriva: number }}
 */
export function evaluarDeriva({ desplegadoEnMs, commitISO }) {
  const desplegado = parsearUpdatedAt(desplegadoEnMs);
  const commit = new Date(commitISO);
  if (Number.isNaN(commit.getTime())) {
    throw new Error(`fecha de commit invalida: ${JSON.stringify(commitISO)}`);
  }
  const diffMs = commit.getTime() - desplegado.getTime();
  return {
    hayDeriva: diffMs > 0,
    desplegado,
    commit,
    horasDeDeriva: Math.round((diffMs / 3_600_000) * 10) / 10,
  };
}

// -------------------------------------------------------------------------
// Entrada/salida
// -------------------------------------------------------------------------

/**
 * Fecha del ultimo commit que toca el arbol desplegado.
 *
 * Se usa `%cI` (committer date) y no `%aI` (author date) a proposito: la fecha
 * de autor es cuando se ESCRIBIO el commit, que puede ser dias anterior a
 * cuando aterrizo en `main`. Usarla solo puede ESCONDER deriva, nunca
 * inventarla, y esconder deriva es el defecto que este chequeo persigue.
 *
 * @param {string} ruta
 */
export function fechaUltimoCommit(ruta) {
  const salida = execFileSync('git', ['log', '-1', '--format=%cI', '--', ruta], {
    encoding: 'utf8',
  }).trim();
  if (!salida) {
    throw new Error(
      `git log no devolvio ningun commit para "${ruta}". En GitHub Actions esto ` +
        `casi siempre significa checkout superficial: hace falta fetch-depth: 0.`,
    );
  }
  return salida;
}

/**
 * @param {{ proyecto: string, funcion: string, token: string }} opciones
 */
export async function updatedAtDelDespliegue({ proyecto, funcion, token }) {
  const url = `https://api.supabase.com/v1/projects/${proyecto}/functions`;
  const respuesta = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) {
    throw new Error(
      `Management API respondio ${respuesta.status} ${respuesta.statusText} en ${url}`,
    );
  }
  const funciones = await respuesta.json();
  const encontrada = Array.isArray(funciones)
    ? funciones.find((f) => f?.slug === funcion)
    : undefined;
  if (!encontrada) {
    throw new Error(`la edge function "${funcion}" no existe en el proyecto ${proyecto}`);
  }
  return encontrada.updated_at;
}

async function main() {
  const proyecto = process.env.SUPABASE_PROJECT_REF || PROYECTO_POR_DEFECTO;
  const funcion = process.env.EDGE_FUNCTION_SLUG || FUNCION_POR_DEFECTO;
  const ruta = process.env.EDGE_FUNCTION_PATH || RUTA_DESPLEGADA_POR_DEFECTO;
  const token = process.env.SUPABASE_ACCESS_TOKEN;

  // Falla cerrado, igual que CLIMA_SYNC_SECRET en la edge function: un
  // detector que no hace nada cuando le falta configuracion es exactamente el
  // "se dio por cerrado" que este chequeo existe para impedir.
  if (!token) {
    console.error(
      'ERROR: falta SUPABASE_ACCESS_TOKEN (personal access token de Supabase).\n' +
        'En GitHub Actions se configura como secreto del repositorio.',
    );
    process.exit(1);
  }

  const updatedAt = await updatedAtDelDespliegue({ proyecto, funcion, token });
  const commitISO = fechaUltimoCommit(ruta);
  const { hayDeriva, desplegado, commit, horasDeDeriva } = evaluarDeriva({
    desplegadoEnMs: updatedAt,
    commitISO,
  });

  console.log(`edge function : ${funcion} (proyecto ${proyecto})`);
  console.log(`desplegada    : ${desplegado.toISOString()}`);
  console.log(`ultimo commit : ${commit.toISOString()}  (${ruta})`);

  if (!hayDeriva) {
    console.log('\nOK: el despliegue vivo es posterior al ultimo commit del arbol desplegado.');
    return;
  }

  console.error(
    `\nDERIVA DE DESPLIEGUE: hay codigo en main desde hace ${horasDeDeriva} h que no esta ` +
      `en produccion.\nDesplegar con:  npx supabase functions deploy ${funcion}`,
  );
  process.exit(1);
}

// Solo corre si se invoca como programa; importarlo desde el test no ejecuta nada.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
