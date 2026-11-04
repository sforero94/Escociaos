// Integration experiment: frozen table oracle -> actual candidate boundary -> answer.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SalidaExperimento, Variante } from '../contracts.ts';
import { runVariant, validateCandidate } from '../shared.ts';
import { escenarios, controlesExtra } from './scenarios.ts';
import { juzgar, mutaciones, textoEspecificado } from './oracle.ts';

const outputs = new Map<string, SalidaExperimento>();
const rows: Record<string, unknown>[] = [];
const mutationRows: Record<string, unknown>[] = [];
const variants: Variante[] = ['baseline', 'repair', 'redesign'];
const implementationFiles = ['shared.ts','baseline.ts','repair.ts','redesign.ts'];
const hashes = () => Object.fromEntries(implementationFiles.map(file => [file, createHash('sha256').update(readFileSync(`scripts/esco2/recovery/${file}`)).digest('hex')]));
let implementationBefore: Record<string,string>;
const runId = new Date().toISOString().replace(/[:.]/g,'-');
beforeAll(() => {
  implementationBefore = hashes();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('NETWORK_FORBIDDEN_IN_OFFLINE_EXPERIMENT'); }));
  const frozen = JSON.parse(readFileSync('scripts/esco2/recovery/qa/freeze.json', 'utf8')) as { files: Record<string, string> };
  for (const [file, expected] of Object.entries(frozen.files)) expect(createHash('sha256').update(readFileSync(file)).digest('hex'), `Frozen ${file}`).toBe(expected);
});
afterAll(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  const implementationAfter = hashes();
  expect(implementationAfter, 'candidate files changed during execution').toEqual(implementationBefore);
  const report = { runId, implementationBefore, implementationAfter, stage: 'A/B', independentScenarios: escenarios.length, extraControls: controlesExtra.length, networkCalls: 0, paidCalls: 0, rows, mutationRows };
  mkdirSync('scripts/esco2/recovery/qa/iterations', {recursive:true});
  writeFileSync(`scripts/esco2/recovery/qa/iterations/${runId}.json`, JSON.stringify(report,null,2)+'\n');
  writeFileSync('scripts/esco2/recovery/qa/results.json', JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ scenarioSummary: variants.map(v => ({ variant: v, passes: rows.filter(r => r.variant === v && !r.extraControl && r.passes).length, total: rows.filter(r => r.variant === v && !r.extraControl).length, extraControls: rows.filter(r=>r.variant===v && r.extraControl).map(r=>({scenario:r.scenario,passes:r.passes})), critical: rows.filter(r => r.variant === v && !r.extraControl && r.critical).length })), mutationSummary: variants.map(v => ({ variant: v, runtimeDetected: v==='baseline'?'N/A: no semantic validator':mutationRows.filter(r => r.variant === v && r.runtimeDetected).length, oracleDetected: mutationRows.filter(r => r.variant === v && r.oracleDetected).length, positiveAccepted: mutationRows.filter(r => r.variant === v && r.positiveAccepted).length })) }) + '\n');
});

describe('P1 stage A: frozen approved intentions through execution', () => {
  for (const variant of variants) for (const scenario of [...escenarios, ...controlesExtra]) {
    it(`${variant} ${scenario.id}: ${scenario.criterio}`, async () => {
      const start = performance.now();
      const actual = await runVariant(structuredClone(scenario.entrada), variant);
      const elapsedMs = performance.now() - start;
      outputs.set(`${variant}:${scenario.id}`, actual);
      const judgement = juzgar(scenario, actual);
      rows.push({ variant, scenario: scenario.id, family: scenario.familia, passes: judgement.pasa, critical: judgement.critico, errors: judgement.errores, elapsedMs, inputBytes: Buffer.byteLength(JSON.stringify(scenario.entrada)), outputBytes: Buffer.byteLength(JSON.stringify(actual)), substantive: actual.resultados.some(r => r.afirmaciones.some(c => c.estado === 'conocido')), extraControl: scenario.id.startsWith('X') });
      if (variant !== 'baseline') expect(judgement.errores, `${variant}/${scenario.id}`).toEqual([]);
    });
  }
});

describe('P1 stage B: candidate boundary mutation protection distinct from oracle sensitivity', () => {
  for (const variant of variants) for (const mutation of mutaciones) {
    it(`${variant} ${mutation.nombre}`, async () => {
      const scenario = escenarios.find(s => s.id === mutation.escenarioId)!;
      // Controls originate at the real candidate boundary, never in oracle arithmetic.
      const positive = outputs.get(`${variant}:${scenario.id}`) ?? await runVariant(structuredClone(scenario.entrada), variant);
      const positiveAccepted = validateCandidate(scenario.entrada, positive).length === 0;
      const mutated = structuredClone(positive);
      let applicable = true;
      try { mutation.cambiar(mutated); } catch { applicable = false; }
      // Keep rendered text consistent so semantic mutations cannot be caught only by stale prose.
      if (variant !== 'baseline') mutated.texto = textoEspecificado(mutated);
      const runtimeDetected = variant==='baseline' ? null : applicable && validateCandidate(scenario.entrada, mutated).length > 0;
      const oracleDetected = applicable && !juzgar(scenario, mutated).pasa;
      mutationRows.push({ variant, mutation: mutation.nombre, scenario: scenario.id, applicable, positiveAccepted, runtimeDetected, oracleDetected });
      if (variant !== 'baseline') { expect(applicable).toBe(true); expect(positiveAccepted).toBe(true); expect(runtimeDetected).toBe(true); expect(oracleDetected).toBe(true); }
    });
  }
  for (const variant of ['repair', 'redesign'] as const) it(`${variant}: correct claims plus modified factual prose fails`, async () => {
    const scenario = escenarios.find(s => s.id === 'S09')!;
    const positive = outputs.get(`${variant}:${scenario.id}`)!;
    const wrong = structuredClone(positive); wrong.texto += '\nParcela A tiene 777 jornales.';
    expect(validateCandidate(scenario.entrada, wrong).length).toBeGreaterThan(0);
    expect(juzgar(scenario, wrong).errores).toContain('untrusted_factual_text');
  });
});
