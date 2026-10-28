// Dedicated entrypoint: mock is free; real mode calls only the model provider.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { correrCaso, instalarGuardas } from './lib/ejecutor';
import { casoDeEscenario, crearAdaptadorFixtures, hashFixture, modeloControl, validarPaquete, type PaqueteFixtures } from './lib/fixtures';

const pack = JSON.parse(readFileSync('evals/esco/fixtures/synthetic-v1.json', 'utf8')) as PaqueteFixtures;
validarPaquete(pack);
const mode = process.env.EVAL_FROZEN_MODEL ?? 'mock';
if (!['mock', 'real'].includes(mode)) throw new Error('EVAL_FROZEN_MODEL: use mock or real');
const ids = (process.env.EVAL_CASOS ?? '').split(',').filter(Boolean);
if (ids.some(id => !pack.scenarios.some(s => s.id === id))) throw new Error('Unknown synthetic scenario');
const selected = pack.scenarios.filter(s => !ids.length || ids.includes(s.id));
const salida = process.env.EVAL_SALIDA;
if (!salida) throw new Error('Frozen replay requires an explicit EVAL_SALIDA');
if (mode === 'real' && !process.env.OPENROUTER_API_KEY) throw new Error('Real frozen replay requires OPENROUTER_API_KEY');

describe(`Esco frozen synthetic (${mode})`, () => {
  for (const s of selected) it(s.id + ' ' + s.title, async () => {
    const errores: string[] = [];
    if (mode === 'mock') vi.stubEnv('OPENROUTER_API_KEY', 'synthetic');
    const requests: { model: string; system_prompt_sha256: string; tools_sha256: string }[] = [];
    const transport = mode === 'real' ? globalThis.fetch.bind(globalThis) : modeloControl(s);
    // Capture before guard installation; no DB credentials are needed or read.
    const g = instalarGuardas({ supabaseUrl: 'https://fixture.supabase.co', verboso: false, replay: {
      errores, fixtures: crearAdaptadorFixtures(pack, errores),
      modelo: async (input, init) => {
        const body = JSON.parse(String(init?.body)) as { model: string; messages: { role: string; content: unknown }[]; tools: unknown };
        requests.push({ model: body.model, system_prompt_sha256: hashFixture(body.messages.filter(m => m.role === 'system')), tools_sha256: hashFixture(body.tools ?? null) });
        return transport(input, init);
      },
      lectura: async () => { throw new Error('No HTTP read fixtures in tool replay'); },
    } });
    try {
      const corrida = await correrCaso(casoDeEscenario(s), s.turns[0].question, true, { fijarHora: true, guardas: g });
      const hashSource = (file: string) => hashFixture(readFileSync(file, 'utf8'));
      const meta = {
        modo: 'frozen', model_transport: mode, model: mode === 'real' ? requests[0]?.model : 'scripted-control/v1',
        judge: null, quality_measured: false, schema: pack.schema, source: pack.source,
        reference_version: pack.reference_version, rubric_version: pack.rubric_version, review_status: pack.review_status,
        scenario_sha256: pack.hashes[s.id], pack_sha256: hashFixture(pack),
        chat_sha256: hashSource('src/supabase/functions/server/chat.tsx'),
        consulta_source_sha256: hashSource('src/supabase/functions/server/esco-consultas.ts'),
        requests,
        git_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        git_dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
      };
      mkdirSync(salida!, { recursive: true });
      writeFileSync(path.join(salida!, `${s.id}.json`), JSON.stringify({ meta, corrida, errores }, null, 2));
      expect(corrida.modo).toBe('frozen');
      expect(corrida.error, JSON.stringify(errores)).toBeUndefined();
      expect(corrida.escriturasBloqueadas).toEqual([]);
      expect(corrida.turnos).toHaveLength(s.turns.length);
      if (mode === 'mock') expect(corrida.turnos.map(t => t.respuesta)).toEqual(s.turns.map(t => t.control_answer));
    } finally { g.restaurar(); if (mode === 'mock') vi.unstubAllEnvs(); }
  });
});
