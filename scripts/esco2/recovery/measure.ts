// Reproducible offline microbenchmark. No provider calls or independent new scenarios.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { executeRepairNative, executeRepair } from './repair.ts';
import { executeRedesign } from './redesign.ts';
import { runBaseline } from './baseline.ts';
import { escenarios } from './qa/scenarios.ts';
import type { Variante } from './contracts.ts';
const WARMUPS = 10;
const REPEATS = 100;
const bytes = (x: unknown) => Buffer.byteLength(JSON.stringify(x));
const percentile = (xs: number[], p: number) => {
    const ordered = [...xs].sort((a, b) => a - b);
    const position = (ordered.length - 1) * p;
    const low = Math.floor(position);
    return ordered[low] + (ordered[Math.ceil(position)] - ordered[low]) * (position - low);
};
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = (async () => { networkCalls++; throw new Error('NETWORK_FORBIDDEN_IN_OFFLINE_MEASUREMENT'); }) as typeof fetch;
const rows: {
    variant: Variante;
    scenario: string;
    class: string;
    samplesMs: number[];
    p50Ms: number;
    p90Ms: number;
    inputBytes: number;
    nativeEvidenceBytes: number | null;
    publicationTextBytes: number;
    normalizedQAPayloadBytes: number;
    truthfulStatement: string;
}[] = [];
try {
    for (const variant of ['baseline', 'repair', 'redesign'] as const) {
        for (const scenario of escenarios) {
            const e = scenario.entrada;
            const category = scenario.esperado.every(x => x.disposicion === 'respondida') ? 'fully_substantive' : scenario.id === 'S13' ? 'partial' : 'unknown_or_clarification';
            const execute = async () => {
                if (variant === 'baseline')
                    return runBaseline(e);
                if (variant === 'repair')
                    return executeRepairNative(e);
                return executeRedesign(e);
            };
            for (let i = 0; i < WARMUPS; i++)
                await execute();
            const samplesMs: number[] = [];
            for (let i = 0; i < REPEATS; i++) {
                const start = performance.now();
                await execute();
                samplesMs.push(performance.now() - start);
            }
            const out = variant === 'baseline' ? await runBaseline(e) : variant === 'repair' ? executeRepair(e) : executeRedesign(e);
            const native = variant === 'repair' ? executeRepairNative(e).natives : variant === 'redesign' ? out.resultados : null;
            rows.push({ variant, scenario: scenario.id, class: category, samplesMs, p50Ms: percentile(samplesMs, 0.5), p90Ms: percentile(samplesMs, 0.9), inputBytes: bytes(e), nativeEvidenceBytes: native === null ? null : bytes(native), publicationTextBytes: Buffer.byteLength(out.texto), normalizedQAPayloadBytes: bytes(out), truthfulStatement: variant === 'repair' ? 'Timed native legacy-result renderer; QA claim normalization excluded.' : variant === 'redesign' ? 'Timed shared calculation, required claim projection and claim renderer.' : 'Timed unmodified core with scripted planner and deterministic fallback; async overhead and legacy source reads retained.' });
        }
    }
}
finally {
    globalThis.fetch = originalFetch;
}
if (networkCalls !== 0)
    throw new Error('Unexpected network call');
const files = ['shared.ts', 'baseline.ts', 'repair.ts', 'redesign.ts', 'measure.ts'].map(name => {
    const path = `scripts/esco2/recovery/${name}`;
    const content = readFileSync(path, 'utf8');
    return { path, sha256: createHash('sha256').update(content).digest('hex'), physicalLines: content.split('\n').length - 1, nonblankLines: content.split('\n').filter(x => x.trim()).length, bytes: Buffer.byteLength(content) };
});
const summary = (['baseline', 'repair', 'redesign'] as const).flatMap(variant => ['all', 'fully_substantive', 'partial', 'unknown_or_clarification'].map(category => {
    const selected = rows.filter(r => r.variant === variant && (category === 'all' || r.class === category));
    const timings = selected.flatMap(r => r.samplesMs);
    const avg = (ns: number[]) => ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
    return { variant, class: category, independentScenarios: selected.length, repeatedTimingSamples: timings.length, p50Ms: percentile(timings, 0.5), p90Ms: percentile(timings, 0.9), meanNativeEvidenceBytes: avg(selected.flatMap(r => r.nativeEvidenceBytes === null ? [] : [r.nativeEvidenceBytes])), meanPublicationTextBytes: avg(selected.map(r => r.publicationTextBytes)), meanNormalizedQAPayloadBytes: avg(selected.map(r => r.normalizedQAPayloadBytes)) };
}));
const report = { generatedAt: new Date().toISOString(), warmupsPerScenario: WARMUPS, repeatsPerScenario: REPEATS, networkCalls, providerCostUsd: 0, notes: ['16 independent frozen scenarios; repetitions measure deterministic local timing only.', '11 fully substantive scenarios; S13 partial is separate. Empty verified sets count as substantive.', 'Native A is ResultadoParte plus semantic sidecar; B is typed claim evidence. Both share repaired arithmetic/source gates.', 'Common normalized QA output is not A runtime evidence and is reported separately.', 'This is not model accuracy, provider latency, production RLS, live-source completeness, or acceptance.'], files, sharedSpecialCases: ['unread/null/verified-empty distinctions', 'stable IDs across duplicate display labels', 'scheduled-start cohort with explicit assignment proof', 'work cohort clipped to Bogotá date', 'ranking metric, tie and omitted-population qualifiers', 'D30 whole-task estimates and missing-count qualification', 'disjoint group reconciliation and coherent-snapshot gate', 'typed pending clarification owner/option matching', 'closed legacy query validation and unknown identity rejection'], summary, rows };
writeFileSync('scripts/esco2/recovery/qa/measurements.json', JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({ summary, networkCalls, measurementFile: 'scripts/esco2/recovery/qa/measurements.json' }) + '\n');
