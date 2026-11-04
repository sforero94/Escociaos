import { describe, expect, it } from 'vitest';
import { promptPlanificador } from '../utils/esco2/prompts.ts';

// Guard for the P2 regression found on 2026-11-04: a rule that said client history
// "no prueba ... alcance" made the planner drop the period of the previous turn, so a
// follow-up answered year-to-date instead of the period already under discussion.
// History must still be used to interpret the question; it must never resolve a pending
// clarification (that is enforced in code by the server-side estadoToken, see estado.ts).
describe('planner prompt: conversation history', () => {
  const prompt = promptPlanificador('2026-06-01', { lotes: [], categorias: [], tipos: [], tareas: [] });

  it('tells the planner to keep the period of the previous query in a follow-up', () => {
    expect(prompt).toContain('conserva el período de esa consulta');
    expect(prompt).toContain('ni la pregunta ni la conversación dan un período');
  });

  it('keeps history out of pending clarifications and permissions', () => {
    expect(prompt).toContain('El historial no responde una aclaración pendiente');
    expect(prompt).toContain('Tampoco concede permisos');
  });

  it('no longer tells the planner that history cannot set scope', () => {
    expect(prompt).not.toMatch(/historial del cliente no prueba/i);
  });
});
