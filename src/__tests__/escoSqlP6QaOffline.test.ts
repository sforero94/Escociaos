// Independent acceptance tests: real CLI + trusted-source loader + private synthetic files.
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
type Obj = Record<string, unknown>;
const SENTINEL = 'SYN_P6_PRIVATE_CAPTURE';
const owned: string[] = [];
afterEach(() => { for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }); });
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
function response() {
  return { motor: 'sql', texto: SENTINEL + ' prosa verificada', sugerencias: ['Ver detalle'],
    aclaracion: { pregunta: '¿Cómo agrupo?', opciones: ['Por lote', 'Por mes'] }, ms: 2,
    consultas: [{ sql: 'SELECT 0 AS control_' + SENTINEL, proposito: 'Control sintético', n_filas: 2, truncado: false, error: null, ms: 1 }, { sql: 'SELECT 0 AS cero, NULL AS ausente', proposito: 'Control sintético', n_filas: 1, truncado: false, error: null, ms: 1 }],
    bloques: [
      { tipo: 'tabla', consulta: 1, truncado: false, titulo: SENTINEL + ' tabla', columnas: [{ columna: 'nombre', etiqueta: 'Nombre', formato: 'texto' }, { columna: 'valor', etiqueta: 'Valor', formato: 'moneda' }], filas: [{ nombre: SENTINEL + ' A', valor: 0 }, { nombre: SENTINEL + ' B', valor: null }], total_filas: 2 },
      { tipo: 'tarjeta', consulta: 2, truncado: false, items: [{ columna: 'cero', etiqueta: 'Cero', formato: 'numero', valor: 0 }, { columna: 'ausente', etiqueta: 'Sin dato', formato: 'numero', valor: null }] },
    ],
  };
}
function evidence(mode = 'paired_live') {
  const captures = [];
  for (const week of [1, 2]) for (let id = 0; id < 20; id++) for (const channel of ['web', 'telegram']) {
    const r = response(), observed_at = `2020-01-${week === 1 ? '02' : '09'}T12:00:00.000Z`;
    captures.push({ week, case_id: SENTINEL + '-' + id, channel,
      context: Object.fromEntries(['actor', 'question', 'history', 'scope', 'data_cut', 'engine', 'config'].map(k => [k + '_sha256', hash(k === 'question' ? k + id : k)])),
      generation_id: SENTINEL + `-${week}-${id}-` + (mode === 'paired_live' ? channel : 'shared'), outcome: 'success', observed_at,
      metrics: { latency_scope: 'end_to_end', latency_ms: 100, cost_source: 'observed', cost_usd: 0 }, response: r,
      snapshot: { ...structuredClone(r), snapshot_at: observed_at }, format_observations: [{ block: 1, row: null, column: 'cero', display: '0' }, { block: 1, row: null, column: 'ausente', display: 'Sin dato' }],
    });
  }
  return { schema_version: 1, mode, period: { started_at: '2020-01-01T00:00:00.000Z', ended_at: '2020-01-15T00:00:00.000Z' }, captures };
}
type Input = ReturnType<typeof evidence>;
function run(input: unknown, raw = false, pathMode?: 'repo' | 'symlink-repo') {
  const directory = mkdtempSync(join(tmpdir(), 'esco-p6-qa-')); owned.push(directory);
  const filename = join(directory, SENTINEL + '.json'); writeFileSync(filename, raw ? String(input) : JSON.stringify(input));
  let inputPath = filename;
  if (pathMode === 'repo') inputPath = resolve('package.json');
  if (pathMode === 'symlink-repo') { inputPath = join(directory, 'repo-link.json'); symlinkSync(resolve('package.json'), inputPath); }
  const guard = join(directory, 'no-network.mjs');
  writeFileSync(guard, "import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';const deny=()=>{throw Error('QA_NETWORK_FORBIDDEN')};globalThis.fetch=deny;http.request=deny;https.request=deny;net.connect=deny;tls.connect=deny;globalThis.WebSocket=class{constructor(){deny()}};");
  const p = spawnSync(process.execPath, ['--import', guard, resolve('scripts/esco-sql-p6/comparar.mjs'), '--input', inputPath], { cwd: process.cwd(), env: { PATH: process.env.PATH ?? '', LANG: 'C.UTF-8' }, encoding: 'utf8', timeout: 10000, maxBuffer: 2_000_000 });
  expect(p.error).toBeUndefined(); expect(p.signal).toBeNull();
  expect(p.stdout + p.stderr).not.toContain(SENTINEL); expect(p.stdout + p.stderr).not.toContain(directory);
  expect(p.stdout + p.stderr).not.toContain('QA_NETWORK_FORBIDDEN');
  return { status: p.status, stderr: p.stderr, stdout: p.stdout, report: p.stdout ? JSON.parse(p.stdout) as Obj : null };
}
function fails(input: unknown) { const r = run(input); expect(r.status).toBe(1); expect(r.report).toMatchObject({ protocol_pass: false, p6_live_protocol_pass: false, d6_accepted: false, activation_authorized: false }); return r.report!; }
function cloneChangedPair(input: Input, fn: (r: ReturnType<typeof response>) => void) { const c = input.captures.find(c => c.week === 1 && c.channel === 'telegram')!; fn(c.response); c.snapshot = { ...structuredClone(c.response), snapshot_at: c.observed_at }; }

describe('QA P6 — protocolo offline de capturas, privacidad y límites de aceptación', () => {
  it('analiza80capturasv1 sin certificar protocolo vivo sin recibos ni conceder D6/autorización', () => {
    const r = run(evidence()); expect(r.status, r.stderr).toBe(0);
    expect(r.report).toMatchObject({ protocol_pass: true, p6_live_protocol_pass: false, d6_accepted: false, activation_authorized: false, visual_manual_review_required: true, counts: { captures: 80, complete_pairs: 40, comparable_pairs: 40, parity_pairs: 40, independent_generation_pairs: 40, valid_contract_and_snapshot: 80 }, cost: { total: 0, observed_count: 80, unknown_count: 0 }, latency: { p95_ms: { web: 100, telegram: 100 } } });
  });
  it('acepta replay coherente pero no lo convierte en paridad de generación independiente', () => {
    const r = run(evidence('shared_response_replay')); expect(r.status).toBe(0); expect(r.report).toMatchObject({ protocol_pass: true, p6_live_protocol_pass: false, counts: { shared_generation_pairs: 40, independent_generation_pairs: 0 }, d6_accepted: false, activation_authorized: false });
  });
  it.each(['missing', 'duplicate', 'different-set', 'not-two-weeks', 'future', 'outside-week'] as const)('no acepta cobertura falsa: %s', mode => {
    const e = evidence();
    if (mode === 'missing') e.captures.pop();
    if (mode === 'duplicate') e.captures.push(structuredClone(e.captures[0]));
    if (mode === 'different-set') for (const c of e.captures) if (c.week === 2) c.case_id += '-changed';
    if (mode === 'not-two-weeks') e.period.ended_at = '2020-01-14T00:00:00.000Z';
    if (mode === 'future') { e.period.started_at = '2099-01-01T00:00:00.000Z'; e.period.ended_at = '2099-01-15T00:00:00.000Z'; }
    if (mode === 'outside-week') e.captures[0].observed_at = '2020-01-09T00:00:00.000Z';
    fails(e);
  });
  it.each(['actor', 'question', 'history', 'scope', 'data_cut', 'engine', 'config'])('no compara contextos distintos: %s', field => {
    const e = evidence(); e.captures[1].context[field + '_sha256'] = hash('different-' + field); fails(e);
  });
  it('detecta sustitución de preguntas entre semanas pese a mantener case_id y pares iguales', () => {
    const e = evidence(); for (const c of e.captures) if (c.week === 2) c.context.question_sha256 = hash('changed-question-' + c.case_id); fails(e);
  });
  it.each(['live-shared', 'replay-independent'] as const)('identifica procedencia de generaciones: %s', mode => {
    const e = evidence(mode === 'live-shared' ? 'paired_live' : 'shared_response_replay');
    for (let i = 0; i < e.captures.length; i += 2) e.captures[i + 1].generation_id = mode === 'live-shared' ? e.captures[i].generation_id : e.captures[i].generation_id + '-other'; fails(e);
  });
  it.each(['text', 'row-order', 'column-order', 'null-to-zero', 'null-to-empty', 'format-unit', 'suggestion', 'clarification', 'truncation'] as const)('preserva diferencias semánticas en la paridad: %s', mode => {
    const e = evidence(); cloneChangedPair(e, r => {
      if (mode === 'text') r.texto += ' cambió';
      if (mode === 'row-order') r.bloques[0].filas!.reverse();
      if (mode === 'column-order') r.bloques[0].columnas!.reverse();
      if (mode === 'null-to-zero') r.bloques[0].filas![1].valor = 0;
      if (mode === 'null-to-empty') Object.assign(r.bloques[0].filas![1], { valor: '' });
      if (mode === 'format-unit') r.bloques[0].columnas![1].formato = 'kg';
      if (mode === 'suggestion') r.sugerencias = ['Ver tendencia'];
      if (mode === 'clarification') r.aclaracion.opciones.reverse();
      if (mode === 'truncation') { r.bloques[0].truncado = true; r.consultas[0].truncado = true; Object.assign(r.bloques[0], { aviso: 'Consulta truncada: estos datos no son el conjunto completo.' }); }
    }); const report = fails(e); expect(report).toMatchObject({ counts: { valid_contract_and_snapshot: 80, parity_pairs: 39 }, issues: { parity_mismatch: 1 } });
  });
  it('la igualdad no depende del orden de claves de un objeto ni de tiempos de consulta', () => {
    const e = evidence(); for (const c of e.captures) if (c.channel === 'telegram') { c.response.ms = 987; c.snapshot.ms = 12; c.response.consultas[0].ms = 15; c.snapshot.consultas[0].ms = 26; c.response.bloques[0].filas![0] = { valor: 0, nombre: SENTINEL + ' A' }; }
    expect(run(e).status).toBe(0);
  });
  it.each(['response-snapshot', 'missing-row', 'missing-cell', 'query-count', 'no-format', 'wrong-format', 'error', 'unknown'] as const)('no certifica snapshots o evidencia incompletos: %s', mode => {
    const e = evidence(); const c = e.captures[0];
    if (mode === 'response-snapshot') c.snapshot.texto = 'Texto distinto';
    if (mode === 'missing-row') { c.response.bloques[0].filas!.pop(); c.snapshot.bloques[0].filas!.pop(); e.captures[1] = { ...structuredClone(c), channel: 'telegram', generation_id: c.generation_id + '-tg' }; }
    if (mode === 'missing-cell') { delete (c.response.bloques[0].filas![1] as Obj).valor; delete (c.snapshot.bloques[0].filas![1] as Obj).valor; }
    if (mode === 'query-count') { c.response.consultas[1].n_filas = 7; c.snapshot.consultas[1].n_filas = 7; }
    if (mode === 'no-format') c.format_observations = [];
    if (mode === 'wrong-format') c.format_observations[0].display = 'Sin dato';
    if (mode === 'error') c.outcome = 'error';
    if (mode === 'unknown') c.outcome = 'unknown';
    fails(e);
  });
  it.each(['unknown-cost', 'unknown-latency', 'engine-latency', 'unobserved-cost', 'negative', 'overflow'] as const)('no transforma métricas desconocidas o inválidas en aceptación: %s', mode => {
    const e = evidence();
    if (mode === 'unknown-cost') for (const c of e.captures) Object.assign(c.metrics, { cost_source: 'unknown', cost_usd: null });
    if (mode === 'unknown-latency') Object.assign(e.captures[0].metrics, { latency_ms: null });
    if (mode === 'engine-latency') e.captures[0].metrics.latency_scope = 'engine';
    if (mode === 'unobserved-cost') e.captures[0].metrics.cost_source = 'unknown';
    if (mode === 'negative') e.captures[0].metrics.latency_ms = -1;
    if (mode === 'overflow') for (const c of e.captures) c.metrics.cost_usd = Number.MAX_VALUE;
    const r = fails(e); if (mode === 'unknown-cost') expect(r.cost).toMatchObject({ total: null, observed_subtotal: null, unknown_count: 80 });
  });
  it('p95 usa nearest-rank y rechaza igualdad con25s', () => {
    const e = evidence(); for (let i = 0; i < e.captures.length; i++) if (e.captures[i].channel === 'web' && i < 10) e.captures[i].metrics.latency_ms = 25000;
    const r = fails(e); expect(r.latency).toMatchObject({ p95_ms: { web: 25000, telegram: 100 } });
  });
  it.each(['mode-array', 'channel-array', 'bad-json'] as const)('rechaza esquema malformado sin exponer contenido: %s', mode => {
    const e = evidence(); if (mode === 'bad-json') { const r = run('{"secret":"' + SENTINEL, true); expect(r.status).toBe(2); return; }
    if (mode === 'mode-array') (e as unknown as Obj).mode = ['paired_live'];
    if (mode === 'channel-array') (e.captures[0] as unknown as Obj).channel = ['web'];
    fails(e);
  });
});


describe('QA P6 — monitorización agregada y fechas verificables', () => {
  it('cuenta intentos SQL recuperados sin confundirlos con turnos fallidos ni exponer errores', () => {
    const e = evidence();
    for (const c of e.captures) {
      const attempt = { sql: 'SELECT 0 AS ' + SENTINEL, proposito: SENTINEL, n_filas: null, truncado: false, error: SENTINEL, ms: 1 };
      c.response.consultas.push(attempt as unknown as typeof c.response.consultas[number]);
      c.snapshot.consultas.push(structuredClone(attempt) as unknown as typeof c.snapshot.consultas[number]);
    }
    const r = run(e); expect(r.status).toBe(0);
    expect(r.report).toMatchObject({ protocol_pass: true, counts: { errors: 0, sql_trace_captures: 80, sql_query_attempts: 240, sql_query_errors: 80 } });
  });
  it.each(['period', 'snapshot'] as const)('rechaza fechas de calendario inexistentes en %s', kind => {
    const e = evidence();
    if (kind === 'period') { e.period = { started_at: '2020-02-30T00:00:00.000Z', ended_at: '2020-03-15T00:00:00.000Z' }; for (const c of e.captures) { c.observed_at = `2020-03-${c.week === 1 ? '02' : '09'}T12:00:00.000Z`; c.snapshot.snapshot_at = c.observed_at; } }
    if (kind === 'snapshot') e.captures[0].snapshot.snapshot_at = '2020-02-30T00:00:00.000Z';
    fails(e);
  });
  it('p95 se calcula por canal sin esconder tres turnos lentos de Telegram entre los de web', () => {
    const e = evidence(); for (const c of e.captures.filter(c => c.channel === 'telegram').slice(0, 3)) c.metrics.latency_ms = 25000;
    const r = fails(e); expect(r.latency).toMatchObject({ p95_ms: { web: 100, telegram: 25000 } });
  });
  it('p95 permite un único outlier entre40observaciones sin usar el máximo como percentil', () => {
    const e = evidence(); e.captures[0].metrics.latency_ms = 25000;
    const r = run(e); expect(r.status).toBe(0); expect(r.report!.latency).toMatchObject({ p95_ms: { web: 100, telegram: 100 } });
  });
  it.each(['repo', 'symlink-repo'] as const)('rechaza archivos públicos del repo por ruta %s antes de tratarlos como capturas privadas', pathMode => {
    const r = run({}, false, pathMode); expect(r.status).toBe(2); expect(r.stdout).toBe(''); expect(r.stderr).toContain('P6_INPUT_REJECTED');
  });
});


function caseWithoutBlocks(e: Input) {
  const selected = e.captures.filter(c => c.case_id === SENTINEL + '-0');
  for (const c of selected) { c.response.bloques = []; c.response.consultas = []; c.snapshot = { ...structuredClone(c.response), snapshot_at: c.observed_at }; c.format_observations = []; }
  return selected;
}
describe('QA P6 — formato sin bloques: no aplicable no equivale a observación inventada', () => {
  it('acepta[] explícito sin bloques válidos y cuenta N/A sin fabricar observaciones', () => {
    const e = evidence('shared_response_replay'); caseWithoutBlocks(e);
    const r = run(e); expect(r.status).toBe(0);
    expect(r.report).toMatchObject({ protocol_pass: true, p6_live_protocol_pass: false, d6_accepted: false, activation_authorized: false, visual_manual_review_required: true, counts: { valid_contract_and_snapshot: 80, parity_pairs: 40, format_not_applicable_captures: 4, format_observed_captures: 76, format_checks: 152 } });
  });
  it('la ausencia del campo de observaciones no se convierte en vacío verificado', () => {
    const e = evidence(); const selected = caseWithoutBlocks(e); delete (selected[0] as unknown as Obj).format_observations; fails(e);
  });
  it('rechaza observaciones fabricadas que apuntan a un bloque inexistente', () => {
    const e = evidence(); const selected = caseWithoutBlocks(e); selected[0].format_observations = [{ block: 0, row: null, column: 'cero', display: '0' }];
    const r = fails(e); expect(r.issues).toMatchObject({ format_mismatch: 1 });
  });
});


describe('QA P6 — freeze global del candidato de dossemanas', () => {
  it.each(['engine', 'config'])('detecta cambio conjunto de %s aunque los cuarenta pares coincidan', field => {
    const e = evidence(); for (const c of e.captures) if (c.week === 2) c.context[field + '_sha256'] = hash('changed-functional-' + field);
    const r = fails(e); expect(r).toMatchObject({ counts: { valid_contract_and_snapshot: 80, comparable_pairs: 40, parity_pairs: 40 }, d6_accepted: false, activation_authorized: false });
  });
});
