import { describe, it, expect } from 'vitest';
import {
  evaluarDeriva,
  parsearUpdatedAt,
  evaluarDerivaPorHash,
  rutaEstadoDriftPorHash,
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

describe('rutaEstadoDriftPorHash', () => {
  it('produce una ruta distinta por funcion, para no mezclar estados', () => {
    expect(rutaEstadoDriftPorHash('make-server-1ccce916')).not.toBe(
      rutaEstadoDriftPorHash('otra-funcion'),
    );
  });
});
