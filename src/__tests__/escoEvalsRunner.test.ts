import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { casoBase } from './escoEvalsFixtures';

const temporales: string[] = [];
afterEach(() => { for (const dir of temporales.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function preparar() {
  const dir = mkdtempSync(path.join(tmpdir(), 'esco-eval-test-'));
  temporales.push(dir);
  const golden = path.join(dir, 'golden.jsonl');
  const caso = casoBase({ original: { verdict: 'wrong', issues: [], runs: [], answer_primary: 'No pude generar una respuesta.' } });
  writeFileSync(golden, JSON.stringify(caso) + '\n');
  return { dir, golden, salida: path.join(dir, 'run') };
}

function ejecutar(f: ReturnType<typeof preparar>, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [path.resolve('node_modules/vitest/vitest.mjs'), 'run', '--config', 'evals/esco/vitest.config.ts'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 20_000,
    env: { ...process.env, EVAL_MODO: 'originales', EVAL_SIN_JUEZ: '1', EVAL_EXIGIR_JUEZ: '0', EVAL_CASOS: '', EVAL_DOMINIOS: '', EVAL_ETIQUETAS: '', EVAL_TIPOS: '', EVAL_BASE: '', EVAL_REPETICIONES: '1', EVAL_MIN_PASA: '0', EVAL_GOLDEN: f.golden, EVAL_SALIDA: f.salida, ...env },
  });
}

describe('Esco eval CLI exit status', () => {
  it('writes reports for answer failures without failing an ungated run', () => {
    const f = preparar();
    const r = ejecutar(f, {});
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const reporte = JSON.parse(readFileSync(path.join(f.salida, 'resumen.json'), 'utf8'));
    expect(reporte.resumen.falla).toBe(1);
    expect(reporte.meta.conjunto_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(reporte.meta.git_commit).toMatch(/^[a-f0-9]{40}$/);
    expect(typeof reporte.meta.git_dirty).toBe('boolean');
  });

  it('returns a failure when the pass threshold is not met, retaining reports', () => {
    const f = preparar();
    const r = ejecutar(f, { EVAL_MIN_PASA: '1' });
    expect(r.status).toBe(1);
    expect(readFileSync(path.join(f.salida, 'informe.md'), 'utf8')).toContain('1 fallan');
  });

  it.each(['plan', 'originales'])('rejects an empty selection in %s mode', (modo) => {
    const f = preparar();
    expect(ejecutar(f, { EVAL_MODO: modo, EVAL_CASOS: 'ESCO-GS-999' }).status).toBe(1);
  });

  it.each([false, true])('returns a failure for judge errors even with a deterministic failure: %s', (fallaDeterminista) => {
    const f = preparar();
    const caso = casoBase({ original: { verdict: 'right', issues: [], runs: [], answer_primary: fallaDeterminista ? 'No pude generar una respuesta.' : 'Respuesta válida' } });
    writeFileSync(f.golden, JSON.stringify(caso) + '\n');
    const r = ejecutar(f, { EVAL_SIN_JUEZ: '0', JUEZ_MODELO: 'test-only', JUEZ_API_KEY: 'test-only', JUEZ_BASE_URL: 'http://127.0.0.1:1' });
    expect(r.status).toBe(1);
    const reporte = JSON.parse(readFileSync(path.join(f.salida, 'resumen.json'), 'utf8'));
    expect(reporte.resumen.total).toBe(1);
    expect(reporte.resumen[fallaDeterminista ? 'falla' : 'inconcluso']).toBe(1);
    expect(reporte.resumen.solo_determinista).toBe(false);
  });
});
