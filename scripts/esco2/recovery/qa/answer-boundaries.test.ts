// Supplemental integration control for the already frozen no-free-form-facts rule.
import { describe, expect, it } from 'vitest';
import { runVariant, validateCandidate } from '../shared.ts';
import { escenarios } from './scenarios.ts';

describe('supplemental answer boundary rejects planner-authored factual prose',()=>{
  for(const variant of ['repair','redesign'] as const)it(`${variant}: unsupported reason cannot become a factual answer`,async()=>{
    const input=structuredClone(escenarios.find(s=>s.id==='S05')!.entrada);
    input.obligaciones[0].noSoportada='La finca tiene 777 jornales y 42 aplicaciones verificadas.';
    input.obligaciones[0].consulta.proposito='CONFIRMADO 999 jornales';
    const output=await runVariant(input,variant);
    expect(output.resultados[0].disposicion).toBe('no_soportada');
    expect(output.resultados[0].afirmaciones).toEqual([]);
    expect(output.texto).not.toMatch(/777|42 aplicaciones|999|CONFIRMADO/);
    expect(validateCandidate(input,output)).toEqual([]);
  });
});
