import { describe, it, expect } from 'vitest';
import { evaluarDeriva, parsearUpdatedAt } from './check-deploy-drift.mjs';

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
