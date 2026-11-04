// Positive reproductions of known unchanged-baseline defects. Passing these tests
// confirms the defect is present; these are not acceptance criteria for the candidates.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { responderTurno } from '../../../../src/utils/esco2/nucleo.ts';
import type { ClienteLLM } from '../../../../src/utils/esco2/llm.ts';
import { runVariant } from '../shared.ts';
import { escenarios } from './scenarios.ts';

const evidence: Record<string, unknown>[]=[];
const config={nombre:'offline-probe',planificador:{modelo:'offline',esfuerzo:'none' as const},compositor:{modelo:'offline',esfuerzo:'none' as const},compositorReforzado:{modelo:'offline',esfuerzo:'none' as const}};
beforeAll(()=>vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('NETWORK_FORBIDDEN');})));
afterAll(()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();writeFileSync('scripts/esco2/recovery/qa/baseline-diagnostics.json',JSON.stringify({label:'Known unchanged-baseline defect reproductions; passing is not acceptance',evidence},null,2)+'\n');});

describe('unchanged baseline defect reproductions outside frozen16 denominator',()=>{
  it('unique task without work plus unread applications becomes falsely absent through actual memory adapter/orchestration',async()=>{
    const input=structuredClone(escenarios.find(s=>s.id==='S01')!.entrada);
    input.obligaciones[0].tareaIds=['t3'];
    const query={...input.obligaciones[0].consulta,tareas:['Riego'],agrupar_por:['tarea' as const],incluir_estado_tarea:true};
    const llm:ClienteLLM={async completar(request){if(!request.herramientas)throw new Error('offline fallback');return {texto:'',llamadas:[{nombre:'consultar_labores',argumentos:JSON.stringify(query)}],uso:{entrada:0,salida:0,razonamiento:0,costoUsd:0},ms:0,modelo:request.modelo,finishReason:'stop'};}};
    const result=await responderTurno({pregunta:'Aplicación asociada de Riego',historial:[],hoy:input.hoyBogota,datos:input.datos,llm,config});
    expect(result.resultados[0].filas.find(r=>r.grupo.tarea==='Riego')!.aplicacion).toBeNull();
    expect(result.respuesta).toContain('sin aplicación asociada');
    for(const variant of ['repair','redesign'] as const){const fixed=await runVariant(input,variant);expect(fixed.resultados[0].disposicion).toBe('fuente_no_disponible');expect(fixed.resultados[0].afirmaciones[0]).toMatchObject({estado:'no_disponible',valor:null});}
    evidence.push({mechanism:'unread-to-false-absence',baselineOrigin:result.origen,baselineAssertion:'sin aplicación asociada',candidateBehavior:'unknown/source unavailable'});
  });
  it('actual baseline composer publishes swapped metric/entity magnitudes and a number supported only by the question',async()=>{
    const input=structuredClone(escenarios.find(s=>s.id==='S09')!.entrada);
    input.datos.tareas.find(t=>t.id==='t1')!.nombre='Poda A';input.datos.tareas.find(t=>t.id==='t2')!.nombre='Poda B';
    const wrong='Poda A: 8 jornales y 2 de costo. Poda B: 2 jornales y 8 de costo. Total: 10 jornales y 10 de costo. Además son 777 jornales.';
    const llm:ClienteLLM={async completar(request){return {texto:request.herramientas?'':wrong,llamadas:request.herramientas?[{nombre:'consultar_labores',argumentos:JSON.stringify(input.obligaciones[0].consulta)}]:[],uso:{entrada:0,salida:0,razonamiento:0,costoUsd:0},ms:0,modelo:request.modelo,finishReason:'stop'};}};
    const result=await responderTurno({pregunta:input.pregunta,historial:[],hoy:input.hoyBogota,datos:input.datos,llm,config});
    expect(result.resultados[0].filas.find(r=>r.grupo.tarea==='Poda A')!.jornales).toBe(2);
    expect(result.resultados[0].filas.find(r=>r.grupo.tarea==='Poda B')!.jornales).toBe(8);
    expect(result.origen).toBe('compositor');expect(result.respuesta).toBe(wrong);
    evidence.push({mechanism:'actual composer guard accepts wrong claim binding and question-only777',baselineOrigin:result.origen,correctT1Jornales:2,assertedT1Jornales:8,correctT2Jornales:8,assertedT2Jornales:2});
  });
});
