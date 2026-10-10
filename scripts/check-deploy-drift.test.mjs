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
  evaluarVerifyJwt,
  evaluarHealth,
  urlHealth,
  comprobarHealth,
  FRASE_VERIFY_JWT,
  FRASE_HEALTH,
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

// ESCO-148: el 2026-10-07 una publicacion manual (conector, no la CLI) dejo
// `verify_jwt=true` (v271, 15:02:50Z) y antes un boot fallido. ~16 min de
// produccion caida, 3 lecturas de clima perdidas, y el detector no podia ver
// ninguno de los dos modos porque solo miraba reloj y hash.
describe('evaluarVerifyJwt (ESCO-148)', () => {
  it('falla con verify_jwt=true (el estado de v271)', () => {
    const r = evaluarVerifyJwt(true);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain(FRASE_VERIFY_JWT);
    expect(r.motivo).toContain('npx supabase functions deploy');
  });

  it('pasa solo con false literal', () => {
    expect(evaluarVerifyJwt(false).ok).toBe(true);
  });

  it('falla cerrado si la API no trae el campo', () => {
    expect(evaluarVerifyJwt(undefined).ok).toBe(false);
    expect(evaluarVerifyJwt(null).ok).toBe(false);
    expect(evaluarVerifyJwt('false').ok).toBe(false);
  });

  it('nunca se confunde con un secreto invalido', () => {
    expect(evaluarVerifyJwt(true).motivo).not.toContain(FRASE_SECRETO_INVALIDO);
  });
});

describe('datosDelDespliegue trae verify_jwt (ESCO-148)', () => {
  const fetchOriginal = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it('devuelve el verify_jwt de la metadata que ya pide', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          slug: 'make-server-1ccce916',
          updated_at: Date.UTC(2026, 9, 7, 15, 2, 50),
          verify_jwt: true,
          ezbr_sha256: '7ecfd539cbac8319fb288c31d189a0ffce673643c8ffba5caf3d1fa5439dde7c',
        },
      ],
    });
    const d = await datosDelDespliegue({ proyecto: 'p', funcion: 'make-server-1ccce916', token: 't' });
    expect(d.verifyJwt).toBe(true);
    expect(evaluarVerifyJwt(d.verifyJwt).ok).toBe(false);
  });
});

describe('evaluarHealth (ESCO-148)', () => {
  it('200 es ok', () => {
    expect(evaluarHealth({ status: 200 }).ok).toBe(true);
  });

  it('401 (gateway con verify_jwt=true) falla', () => {
    const r = evaluarHealth({ status: 401 });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain(FRASE_HEALTH);
    expect(r.motivo).toContain('401');
    expect(r.motivo).not.toContain(FRASE_SECRETO_INVALIDO);
  });

  it('5xx (worker que no arranca) falla', () => {
    expect(evaluarHealth({ status: 503 }).ok).toBe(false);
  });

  it('un error de red falla, no se trata como ok', () => {
    const r = evaluarHealth({ error: 'fetch failed' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('fetch failed');
  });
});

describe('comprobarHealth (ESCO-148)', () => {
  const fetchOriginal = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it('apunta a la ruta real de index.ts', () => {
    expect(urlHealth({ proyecto: 'ywhtjwawnkeqlwxbvgup', funcion: 'make-server-1ccce916' })).toBe(
      'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/health',
    );
    const index = readFileSync(
      fileURLToPath(
        new URL('../supabase/functions/make-server-1ccce916/index.ts', import.meta.url),
      ),
      'utf8',
    );
    expect(index).toContain('app.get("/make-server-1ccce916/health"');
  });

  it('hace el GET SIN encabezado Authorization ni apikey (anonimo)', async () => {
    let opciones;
    globalThis.fetch = async (_url, o) => {
      opciones = o;
      return { status: 200 };
    };
    const r = await comprobarHealth({ proyecto: 'p', funcion: 'make-server-1ccce916' });
    expect(r.ok).toBe(true);
    const headers = opciones?.headers ?? {};
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('apikey');
  });

  it('un fetch que lanza se reporta como fallo de health', async () => {
    globalThis.fetch = async () => {
      throw new Error('fetch failed');
    };
    const r = await comprobarHealth({ proyecto: 'p', funcion: 'make-server-1ccce916' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain(FRASE_HEALTH);
  });
});

describe('resumenFalloParaTelegram con los modos de ESCO-148', () => {
  it('nombra verify_jwt y no lo llama deriva ni secreto', () => {
    const t = resumenFalloParaTelegram(`ERROR: ${evaluarVerifyJwt(true).motivo}`);
    expect(t).toMatch(/verify_jwt/);
    expect(t).not.toMatch(/secret inválido/);
  });

  it('nombra el health caido', () => {
    const t = resumenFalloParaTelegram(`ERROR: ${evaluarHealth({ status: 503 }).motivo}`);
    expect(t).toMatch(/health/);
    expect(t).toMatch(/caído|caido/);
  });

  it('un 401 de la Management API sigue siendo secreto aunque health tambien falle', () => {
    const log = `${mensajeErrorManagementApi(401, 'Unauthorized', 'u')}`;
    expect(resumenFalloParaTelegram(log)).toMatch(/secret inválido/);
  });
});
