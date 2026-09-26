import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  evaluarDeriva,
  parsearUpdatedAt,
  evaluarDerivaPorHash,
  rutaEstadoDriftPorHash,
  mensajeErrorManagementApi,
  resumenFalloParaTelegram,
  FRASE_SECRETO_INVALIDO,
  datosDelDespliegue,
} from './check-deploy-drift.mjs';

// El caso real: `updated_at` de la Management API llega en epoch MILISEGUNDOS.
const DESPLIEGUE_2026_08_18_MS = 1787016998919; // 2026-08-18T01:36:38.919Z

describe('parsearUpdatedAt', () => {
  it('interpreta epoch milisegundos', () => {
    expect(parsearUpdatedAt(DESPLIEGUE_2026_08_18_MS).toISOString()).toBe(
      '2026-08-18T01:36:38.919Z',
    );
  });

  it('acepta el mismo valor como string', () => {
    expect(parsearUpdatedAt(String(DESPLIEGUE_2026_08_18_MS)).getTime()).toBe(
      DESPLIEGUE_2026_08_18_MS,
    );
  });

  it('revienta ante epoch SEGUNDOS en vez de devolver una fecha de 1970', () => {
    // Este es el modo de fallo silencioso: 1970 es anterior a cualquier commit,
    // asi que el chequeo diria "sin deriva" para siempre.
    expect(() => parsearUpdatedAt(Math.floor(DESPLIEGUE_2026_08_18_MS / 1000))).toThrow(
      /fuera de rango/,
    );
  });

  it('revienta ante un valor que no es numero', () => {
    expect(() => parsearUpdatedAt(null)).toThrow(/no es un numero/);
    expect(() => parsearUpdatedAt('2026-08-18T01:36:38Z')).toThrow(/no es un numero/);
  });
});

describe('evaluarDeriva', () => {
  it('detecta deriva cuando el commit es posterior al despliegue', () => {
    // El fallo real: ESCO-1 se mezclo el 2026-08-20 y el despliegue vivo era del 18.
    const r = evaluarDeriva({
      desplegadoEnMs: DESPLIEGUE_2026_08_18_MS,
      commitISO: '2026-08-20T13:03:24-05:00',
    });
    expect(r.hayDeriva).toBe(true);
    expect(r.horasDeDeriva).toBeGreaterThan(40);
  });

  it('no reporta deriva cuando el despliegue es posterior al commit', () => {
    const r = evaluarDeriva({
      desplegadoEnMs: Date.UTC(2026, 7, 24, 15, 52, 43),
      commitISO: '2026-08-24T11:24:59+00:00',
    });
    expect(r.hayDeriva).toBe(false);
    expect(r.horasDeDeriva).toBeLessThan(0);
  });

  it('no reporta deriva cuando coinciden exactamente', () => {
    const instante = Date.UTC(2026, 7, 24, 12, 0, 0);
    const r = evaluarDeriva({
      desplegadoEnMs: instante,
      commitISO: new Date(instante).toISOString(),
    });
    expect(r.hayDeriva).toBe(false);
  });

  it('revienta ante una fecha de commit invalida en vez de asumir que no hay deriva', () => {
    // git log sin commits devuelve cadena vacia; eso no puede leerse como "todo bien".
    expect(() =>
      evaluarDeriva({ desplegadoEnMs: DESPLIEGUE_2026_08_18_MS, commitISO: '' }),
    ).toThrow(/fecha de commit invalida/);
  });
});

describe('evaluarDerivaPorHash', () => {
  it('siembra la linea base cuando no hay estado previo, sin marcar deriva', () => {
    const r = evaluarDerivaPorHash({ hashActual: 'abc', commitActual: 'c1', estadoPrevio: null });
    expect(r.hayDerivaPorHash).toBe(false);
    expect(r.aviso).toBe(false);
  });

  it('NO marca deriva si el commit no cambio, aunque el hash sea el mismo (nada nuevo que desplegar)', () => {
    const r = evaluarDerivaPorHash({
      hashActual: 'abc',
      commitActual: 'c1',
      estadoPrevio: { commit: 'c1', hash: 'abc' },
    });
    expect(r.hayDerivaPorHash).toBe(false);
    expect(r.aviso).toBe(false);
  });

  it('NO marca deriva si el commit cambio Y el hash tambien cambio (se desplego el contenido nuevo)', () => {
    const r = evaluarDerivaPorHash({
      hashActual: 'def',
      commitActual: 'c2',
      estadoPrevio: { commit: 'c1', hash: 'abc' },
    });
    expect(r.hayDerivaPorHash).toBe(false);
    expect(r.aviso).toBe(false);
  });

  // Issue #271: ezbr_sha256 sticky con reloj OK no es fallo de contenido.
  // Caso real 2026-09-18: version 261→263, updated_at avanzó, hash a9fe8807…
  // no se movió, y el bundle nuevo sí estaba vivo (/acciones/tick → 404).
  it('NO marca deriva si el commit cambio, el hash no se movio y el reloj esta OK (hash sticky)', () => {
    const r = evaluarDerivaPorHash({
      hashActual: 'abc',
      commitActual: 'c2',
      estadoPrevio: { commit: 'c1', hash: 'abc' },
      hayDerivaReloj: false,
    });
    expect(r.hayDerivaPorHash).toBe(false);
    expect(r.aviso).toBe(true);
    expect(r.motivo).toMatch(/sticky/);
    expect(r.motivo).toMatch(/AVISO/);
  });

  it('el default (sin hayDerivaReloj) trata el hash sticky como aviso, no como fallo', () => {
    const r = evaluarDerivaPorHash({
      hashActual: 'abc',
      commitActual: 'c2',
      estadoPrevio: { commit: 'c1', hash: 'abc' },
    });
    expect(r.hayDerivaPorHash).toBe(false);
    expect(r.aviso).toBe(true);
  });

  it('MARCA deriva de contenido si el hash no se movio Y el reloj tambien marca deriva', () => {
    const r = evaluarDerivaPorHash({
      hashActual: 'abc',
      commitActual: 'c2',
      estadoPrevio: { commit: 'c1', hash: 'abc' },
      hayDerivaReloj: true,
    });
    expect(r.hayDerivaPorHash).toBe(true);
    expect(r.aviso).toBe(false);
    expect(r.motivo).toMatch(/republic/);
  });
});

/**
 * El job sale 1 cuando reloj O contenido marcan deriva — la misma
 * combinacion que `main()` usa para process.exit(1).
 * @param {{ hayDeriva: boolean, hayDerivaPorHash: boolean }} senales
 */
function elJobFallaria({ hayDeriva, hayDerivaPorHash }) {
  return hayDeriva || hayDerivaPorHash;
}

describe('combinacion reloj + hash (contrato de exit 1, issue #271)', () => {
  const HASH_STICKY = 'a9fe8807f8471cda71c46a086c10644f2e4a40c279c779712b3dba97c5517580';

  it('hash sticky + reloj OK: el job NO falla (falso positivo del 2026-09-18)', () => {
    // Despliegue ~2026-09-18 17:34Z, ultimo commit del arbol anterior a eso.
    const reloj = evaluarDeriva({
      desplegadoEnMs: Date.UTC(2026, 8, 18, 17, 34, 0),
      commitISO: '2026-09-18T16:00:00.000Z',
    });
    expect(reloj.hayDeriva).toBe(false);

    const contenido = evaluarDerivaPorHash({
      hashActual: HASH_STICKY,
      commitActual: '083856864fc8e59b8038ad7af8e1b279affa8552',
      estadoPrevio: {
        commit: 'a4f3ce6000000000000000000000000000000000',
        hash: HASH_STICKY,
      },
      hayDerivaReloj: reloj.hayDeriva,
    });
    expect(contenido.hayDerivaPorHash).toBe(false);
    expect(contenido.aviso).toBe(true);
    expect(elJobFallaria({ hayDeriva: reloj.hayDeriva, hayDerivaPorHash: contenido.hayDerivaPorHash })).toBe(
      false,
    );
  });

  it('deriva de reloj sigue haciendo fallar el job aunque el hash no se mueva', () => {
    // Arbol en main posterior a updated_at de produccion: sigue siendo exit 1.
    const reloj = evaluarDeriva({
      desplegadoEnMs: Date.UTC(2026, 8, 18, 12, 0, 0),
      commitISO: '2026-09-18T17:00:00.000Z',
    });
    expect(reloj.hayDeriva).toBe(true);

    const contenido = evaluarDerivaPorHash({
      hashActual: HASH_STICKY,
      commitActual: '083856864fc8e59b8038ad7af8e1b279affa8552',
      estadoPrevio: {
        commit: 'a4f3ce6000000000000000000000000000000000',
        hash: HASH_STICKY,
      },
      hayDerivaReloj: reloj.hayDeriva,
    });
    expect(contenido.hayDerivaPorHash).toBe(true);
    expect(elJobFallaria({ hayDeriva: reloj.hayDeriva, hayDerivaPorHash: contenido.hayDerivaPorHash })).toBe(
      true,
    );
  });

  it('deriva de reloj hace fallar el job aunque el hash del contenido haya cambiado', () => {
    const reloj = evaluarDeriva({
      desplegadoEnMs: DESPLIEGUE_2026_08_18_MS,
      commitISO: '2026-08-20T13:03:24-05:00',
    });
    expect(reloj.hayDeriva).toBe(true);

    const contenido = evaluarDerivaPorHash({
      hashActual: 'nuevo',
      commitActual: 'c2',
      estadoPrevio: { commit: 'c1', hash: 'viejo' },
      hayDerivaReloj: reloj.hayDeriva,
    });
    expect(contenido.hayDerivaPorHash).toBe(false);
    expect(elJobFallaria({ hayDeriva: reloj.hayDeriva, hayDerivaPorHash: contenido.hayDerivaPorHash })).toBe(
      true,
    );
  });
});

describe('mensajeErrorManagementApi (issue #293)', () => {
  const url = 'https://api.supabase.com/v1/projects/ywhtjwawnkeqlwxbvgup/functions';

  it('401 es secreto invalido o expirado, y no habla de deriva', () => {
    const mensaje = mensajeErrorManagementApi(401, 'Unauthorized', url);
    expect(mensaje).toContain(FRASE_SECRETO_INVALIDO);
    expect(mensaje).toMatch(/401/);
    expect(mensaje).toMatch(/No es deriva de reloj ni de hash/);
    expect(mensaje).not.toMatch(/DERIVA DE DESPLIEGUE/);
  });

  it('403 usa la misma clase que 401', () => {
    const mensaje = mensajeErrorManagementApi(403, 'Forbidden', url);
    expect(mensaje).toContain(FRASE_SECRETO_INVALIDO);
    expect(mensaje).toMatch(/403/);
    expect(mensaje).not.toMatch(/DERIVA DE DESPLIEGUE/);
  });

  it('500 sigue siendo un fallo de la API, no un secreto', () => {
    const mensaje = mensajeErrorManagementApi(500, 'Internal Server Error', url);
    expect(mensaje).not.toContain(FRASE_SECRETO_INVALIDO);
    expect(mensaje).toMatch(/500/);
    expect(mensaje).toContain(url);
  });

  it('el resumen de Telegram distingue 401 de deriva de reloj', () => {
    const logAuth = `ERROR: ${mensajeErrorManagementApi(401, 'Unauthorized', url)}`;
    const avisoAuth = resumenFalloParaTelegram(logAuth);
    expect(avisoAuth).toMatch(/fallo de autenticación/);
    expect(avisoAuth).toContain(FRASE_SECRETO_INVALIDO);
    expect(avisoAuth).toMatch(/No es deriva de reloj ni de hash/);

    const logDeriva =
      'DERIVA DE DESPLIEGUE (reloj): hay codigo en main desde hace 42 h que no esta en produccion.';
    const avisoDeriva = resumenFalloParaTelegram(logDeriva);
    expect(avisoDeriva).toMatch(/deriva de despliegue/);
    expect(avisoDeriva).toMatch(/No es un fallo de autenticación/);
    expect(avisoDeriva).not.toContain(FRASE_SECRETO_INVALIDO);
    expect(avisoAuth).not.toBe(avisoDeriva);
  });

  it('un 500 y un log vacio no se disfrazan de deriva ni de secreto', () => {
    const log = `ERROR: ${mensajeErrorManagementApi(502, 'Bad Gateway', url)}`;
    expect(resumenFalloParaTelegram(log)).toMatch(/otra causa/);
    expect(resumenFalloParaTelegram('')).toMatch(/otra causa/);
    expect(resumenFalloParaTelegram(null)).toMatch(/otra causa/);
  });

  it('un secreto ausente tampoco se llama deriva', () => {
    const aviso = resumenFalloParaTelegram(
      'ERROR: falta SUPABASE_ACCESS_TOKEN (personal access token de Supabase).',
    );
    expect(aviso).toMatch(/falta SUPABASE_ACCESS_TOKEN/);
    expect(aviso).toMatch(/No es deriva/);
    expect(aviso).not.toContain(FRASE_SECRETO_INVALIDO);
  });
});

describe('datosDelDespliegue ante 401/403', () => {
  const fetchOriginal = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it('un 401 lanza la frase de secreto y no lee el cuerpo', async () => {
    let leyoCuerpo = false;
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => {
        leyoCuerpo = true;
        return [];
      },
    });
    await expect(
      datosDelDespliegue({ proyecto: 'p', funcion: 'make-server-1ccce916', token: 'sbp_test' }),
    ).rejects.toThrow(new RegExp(FRASE_SECRETO_INVALIDO));
    expect(leyoCuerpo).toBe(false);
  });

  it('un 403 lanza la misma frase', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => [],
    });
    await expect(
      datosDelDespliegue({ proyecto: 'p', funcion: 'make-server-1ccce916', token: 'sbp_test' }),
    ).rejects.toThrow(new RegExp(`${FRASE_SECRETO_INVALIDO}[\\s\\S]*403`));
  });
});

describe('workflow de aviso (issue #293)', () => {
  const yml = readFileSync(
    fileURLToPath(new URL('../.github/workflows/deteccion-deriva-despliegue.yml', import.meta.url)),
    'utf8',
  );

  it('nombra los secretos de Telegram y no avisa en silencio si faltan', () => {
    expect(yml).toContain('secrets.TELEGRAM_BOT_TOKEN');
    expect(yml).toContain('secrets.TELEGRAM_CHAT_ID');
    expect(yml).toContain('secrets.SUPABASE_ACCESS_TOKEN');
    expect(yml).toContain('--resumen-aviso');
    expect(yml).toMatch(/::warning::/);
    expect(yml).toContain('ESCO-78');
    expect(yml).toMatch(/no se pudo avisar/);
  });
});

describe('rutaEstadoDriftPorHash', () => {
  it('produce una ruta distinta por funcion, para no mezclar estados', () => {
    expect(rutaEstadoDriftPorHash('make-server-1ccce916')).not.toBe(
      rutaEstadoDriftPorHash('otra-funcion'),
    );
  });
});
