import { describe, expect, it } from 'vitest';
import { faltantes, leerConfig } from '../../evals/esco/lib/entorno';

describe('Esco eval configuration', () => {
  it('defaults to a plan that needs no credentials', () => {
    const cfg = leerConfig({});
    expect(cfg.modo).toBe('plan');
    expect(cfg.repeticiones).toBe(1);
    expect(faltantes(cfg)).toEqual([]);
  });

  it('requires an explicit opt-out to score without a judge', () => {
    expect(faltantes(leerConfig({ EVAL_MODO: 'originales' }))).toContain('JUEZ_MODELO (y JUEZ_API_KEY u OPENROUTER_API_KEY)');
    expect(faltantes(leerConfig({ EVAL_MODO: 'originales', EVAL_SIN_JUEZ: '1' }))).toEqual([]);
    expect(() => leerConfig({ EVAL_EXIGIR_JUEZ: '1', EVAL_SIN_JUEZ: '1' })).toThrow(/incompatibles/);
  });

  it('requires all live credentials even without a judge', () => {
    expect(faltantes(leerConfig({ EVAL_MODO: 'live', EVAL_SIN_JUEZ: '1' }))).toEqual([
      'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY',
    ]);
  });

  it('accepts a configured judge and normalizes trailing slashes', () => {
    const cfg = leerConfig({ EVAL_MODO: 'live', SUPABASE_URL: 'https://farm.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'test', OPENROUTER_API_KEY: 'test', JUEZ_API_KEY: '', JUEZ_MODELO: 'test-sonnet' });
    expect(faltantes(cfg)).toEqual([]);
    expect(cfg.esco.supabaseUrl).toBe('https://farm.supabase.co');
    expect(cfg.juez?.modelo).toBe('test-sonnet');
  });

  it.each(['NaN', 'Infinity', '-1', '0', '1.5', ''])('rejects invalid repetitions: %s', (value) => {
    expect(() => leerConfig({ EVAL_REPETICIONES: value })).toThrow(/EVAL_REPETICIONES/);
  });

  it('rejects invalid limits, modes, date modes and pass thresholds', () => {
    expect(() => leerConfig({ EVAL_LIMITE: '0' })).toThrow(/EVAL_LIMITE/);
    expect(() => leerConfig({ EVAL_MODO: 'typo' })).toThrow(/EVAL_MODO/);
    expect(() => leerConfig({ EVAL_FECHA: 'yesterday' })).toThrow(/EVAL_FECHA/);
    for (const value of ['-0.1', '1.1', 'NaN', '']) expect(() => leerConfig({ EVAL_MIN_PASA: value })).toThrow(/EVAL_MIN_PASA/);
    expect(leerConfig({ EVAL_MIN_PASA: '0' }).minimoPasa).toBe(0);
    expect(leerConfig({ EVAL_MIN_PASA: '1' }).minimoPasa).toBe(1);
  });

  it('rejects non-HTTP endpoints and credential-bearing URLs', () => {
    for (const url of ['file:///tmp/test', 'https://user:password@example.com', 'https://example.com?key=secret']) {
      expect(() => leerConfig({ SUPABASE_URL: url })).toThrow();
    }
  });
});
