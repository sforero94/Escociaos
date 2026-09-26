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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

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

/**
 * Segunda señal, independiente del reloj (hallazgo ESCO-66 / issue #271).
 *
 * `ezbr_sha256` es el hash que la Management API reporta para el bundle
 * publicado. Se compara contra el estado de la corrida ANTERIOR (persistido
 * en el repo), nunca contra el propio commit actual — no hay forma de derivar
 * el hash "correcto" sin re-construir el bundle, y no se inventa un
 * sustituto local.
 *
 * No tratar commit↑ + hash igual como fallo duro cuando el reloj ya dice
 * que no hay deriva. `ezbr_sha256` PUEDE no moverse aunque se publique un
 * bundle nuevo (Management API sticky: 2026-09-18, version 261→263,
 * `updated_at` avanzó, hash quedó en a9fe8807…, y el bundle nuevo sí estaba
 * vivo). Fallar ahí es el falso positivo de #271.
 *
 * El reloj sigue siendo la guarda que sí falla: si `updated_at` es anterior
 * al último commit del árbol, hay deriva de despliegue. Un republicado del
 * bundle viejo con reloj verde queda como aviso, no como exit 1.
 *
 * Un HTTP 401/403 NO entra en esta función. Es un secreto inválido o
 * expirado (`mensajeErrorManagementApi`), y no se confunde con el reloj
 * ni con este hash sticky.
 *
 * @param {{ hashActual: string, commitActual: string, estadoPrevio: { commit: string, hash: string } | null, hayDerivaReloj?: boolean }} entrada
 * @returns {{ hayDerivaPorHash: boolean, aviso: boolean, motivo: string }}
 */
export function evaluarDerivaPorHash({
  hashActual,
  commitActual,
  estadoPrevio,
  hayDerivaReloj = false,
}) {
  if (!estadoPrevio) {
    return {
      hayDerivaPorHash: false,
      aviso: false,
      motivo: 'sin estado previo, primera corrida: se siembra la línea base',
    };
  }
  const commitCambio = estadoPrevio.commit !== commitActual;
  const hashIgual = estadoPrevio.hash === hashActual;
  if (commitCambio && hashIgual) {
    // Hash sticky: la API no movió ezbr_sha256. Solo es deriva de contenido
    // cuando el reloj TAMBIÉN dice que producción está atrás del árbol.
    if (!hayDerivaReloj) {
      return {
        hayDerivaPorHash: false,
        aviso: true,
        motivo:
          `AVISO: el árbol desplegado tiene un commit nuevo (antes ${estadoPrevio.commit}, ahora ` +
          `${commitActual}) pero ezbr_sha256 no cambió (${hashActual}). ` +
          `La Management API puede devolver un hash sticky aunque el bundle sí se haya publicado; ` +
          `el reloj no marca deriva, así que no se trata como fallo de contenido`,
      };
    }
    return {
      hayDerivaPorHash: true,
      aviso: false,
      motivo:
        `el árbol desplegado tiene un commit nuevo (antes ${estadoPrevio.commit}, ahora ` +
        `${commitActual}) pero el hash del contenido publicado no cambió (${hashActual}) — ` +
        `el despliegue republicó el mismo bundle viejo`,
    };
  }
  return { hayDerivaPorHash: false, aviso: false, motivo: 'hash coherente con el commit del árbol' };
}

/**
 * Frase estable que el log y el aviso de Telegram comparten.
 * Un 401/403 es esta frase. Una deriva de reloj o de hash es
 * `DERIVA DE DESPLIEGUE`. Las dos no se mezclan.
 */
export const FRASE_SECRETO_INVALIDO = 'secret inválido/expirado';

/**
 * Clasifica un HTTP de la Management API.
 * 401 y 403 son el personal access token (`SUPABASE_ACCESS_TOKEN`):
 * inválido, revocado o expirado. No son deriva de reloj ni de hash.
 *
 * @param {number} status
 * @param {string} statusText
 * @param {string} url
 * @returns {string}
 */
export function mensajeErrorManagementApi(status, statusText, url) {
  const estado = `${status}${statusText ? ` ${statusText}` : ''}`;
  if (status === 401 || status === 403) {
    return (
      `${FRASE_SECRETO_INVALIDO}: la Management API respondió HTTP ${estado}. ` +
      `SUPABASE_ACCESS_TOKEN no autentica. No es deriva de reloj ni de hash. ` +
      `Rotar el secreto (docs/runbook_detector_deriva.md).`
    );
  }
  return `Management API respondio ${estado} en ${url}`;
}

/**
 * Una línea para el cuerpo del aviso de Telegram. Distingue autenticación
 * de deriva. No incluye el log crudo.
 *
 * @param {string} log
 * @returns {string}
 */
export function resumenFalloParaTelegram(log) {
  const texto = typeof log === 'string' ? log : '';
  if (texto.includes(FRASE_SECRETO_INVALIDO)) {
    return (
      'fallo de autenticación: secret inválido/expirado. ' +
      'No es deriva de reloj ni de hash. Rotar SUPABASE_ACCESS_TOKEN.'
    );
  }
  if (texto.includes('falta SUPABASE_ACCESS_TOKEN')) {
    return (
      'fallo de autenticación: falta SUPABASE_ACCESS_TOKEN en los secretos del repositorio. ' +
      'No es deriva de reloj ni de hash.'
    );
  }
  if (texto.includes('DERIVA DE DESPLIEGUE')) {
    return (
      'deriva de despliegue: hay código en main que no está en producción ' +
      '(reloj o contenido). No es un fallo de autenticación.'
    );
  }
  return (
    'el chequeo falló por otra causa. No es un 401/403 ni deriva clasificada. ' +
    'Revisar el log de la corrida.'
  );
}

/**
 * Ruta del fichero de estado para una función, dentro del repo (se comparte
 * entre corridas vía commit del propio workflow — nunca vía cache de
 * Actions, que puede vencer o purgarse sin avisar).
 * @param {string} funcion
 */
export function rutaEstadoDriftPorHash(funcion) {
  return path.join('scripts', 'deploy-drift-state', `${funcion}.json`);
}

/** @param {string} ruta */
function leerEstadoPrevio(ruta) {
  if (!existsSync(ruta)) return null;
  try {
    const contenido = JSON.parse(readFileSync(ruta, 'utf8'));
    if (typeof contenido?.commit === 'string' && typeof contenido?.hash === 'string') {
      return contenido;
    }
  } catch {
    // Fichero corrupto o con forma vieja: se trata como "sin estado previo"
    // en vez de reventar el chequeo por un problema del propio chequeo.
  }
  return null;
}

/**
 * @param {string} ruta
 * @param {{ commit: string, hash: string }} estado
 */
function escribirEstadoActual(ruta, estado) {
  mkdirSync(path.dirname(ruta), { recursive: true });
  writeFileSync(ruta, `${JSON.stringify(estado, null, 2)}\n`);
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
 * Un solo llamado a la Management API trae las dos señales: `updated_at`
 * (reloj) y `ezbr_sha256` (contenido realmente publicado).
 * @param {{ proyecto: string, funcion: string, token: string }} opciones
 * @returns {Promise<{ updatedAt: number|string, hash: string }>}
 */
export async function datosDelDespliegue({ proyecto, funcion, token }) {
  const url = `https://api.supabase.com/v1/projects/${proyecto}/functions`;
  const respuesta = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) {
    // Antes de leer el cuerpo y antes de escribir el estado de hash.
    // Un 401 no debe reescribir scripts/deploy-drift-state/.
    throw new Error(mensajeErrorManagementApi(respuesta.status, respuesta.statusText, url));
  }
  const funciones = await respuesta.json();
  const encontrada = Array.isArray(funciones)
    ? funciones.find((f) => f?.slug === funcion)
    : undefined;
  if (!encontrada) {
    throw new Error(`la edge function "${funcion}" no existe en el proyecto ${proyecto}`);
  }
  if (typeof encontrada.ezbr_sha256 !== 'string' || !encontrada.ezbr_sha256) {
    throw new Error(
      `la edge function "${funcion}" no trajo ezbr_sha256 en la respuesta de la Management API`,
    );
  }
  return { updatedAt: encontrada.updated_at, hash: encontrada.ezbr_sha256 };
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

  const { updatedAt, hash } = await datosDelDespliegue({ proyecto, funcion, token });
  const commitISO = fechaUltimoCommit(ruta);
  const commitSha = execFileSync('git', ['log', '-1', '--format=%H', '--', ruta], {
    encoding: 'utf8',
  }).trim();
  const { hayDeriva, desplegado, commit, horasDeDeriva } = evaluarDeriva({
    desplegadoEnMs: updatedAt,
    commitISO,
  });

  const rutaEstado = rutaEstadoDriftPorHash(funcion);
  const estadoPrevio = leerEstadoPrevio(rutaEstado);
  const { hayDerivaPorHash, aviso, motivo } = evaluarDerivaPorHash({
    hashActual: hash,
    commitActual: commitSha,
    estadoPrevio,
    hayDerivaReloj: hayDeriva,
  });
  escribirEstadoActual(rutaEstado, { commit: commitSha, hash });

  console.log(`edge function : ${funcion} (proyecto ${proyecto})`);
  console.log(`desplegada    : ${desplegado.toISOString()}`);
  console.log(`ultimo commit : ${commit.toISOString()}  (${ruta})`);
  console.log(`hash publicado: ${hash}`);
  console.log(`chequeo hash  : ${motivo}`);

  if (!hayDeriva && !hayDerivaPorHash) {
    if (aviso) {
      console.warn(`\n${motivo}.`);
    }
    console.log('\nOK: sin deriva de reloj y sin deriva de contenido.');
    return;
  }

  if (hayDeriva) {
    console.error(
      `\nDERIVA DE DESPLIEGUE (reloj): hay codigo en main desde hace ${horasDeDeriva} h que no ` +
        `esta en produccion.\nDesplegar con:  npx supabase functions deploy ${funcion}`,
    );
  }
  if (hayDerivaPorHash) {
    console.error(`\nDERIVA DE DESPLIEGUE (contenido): ${motivo}.\nDesplegar de nuevo, y verificar que el hash cambie.`);
  }
  process.exit(1);
}

// Solo corre si se invoca como programa; importarlo desde el test no ejecuta nada.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  // El workflow lo usa para armar el aviso. No llama a la Management API
  // y no exige SUPABASE_ACCESS_TOKEN.
  if (process.argv[2] === '--resumen-aviso') {
    const rutaLog = process.argv[3];
    const texto = rutaLog && existsSync(rutaLog) ? readFileSync(rutaLog, 'utf8') : '';
    process.stdout.write(resumenFalloParaTelegram(texto));
  } else {
    main().catch((error) => {
      console.error(`ERROR: ${error.message}`);
      process.exit(1);
    });
  }
}
