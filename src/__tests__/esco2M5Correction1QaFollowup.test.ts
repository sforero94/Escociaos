// Independent synthetic follow-up/retry cases: no model calls or campaign text.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { ClienteLLM,SolicitudLLM } from '../utils/esco2/llm.ts';
import type { LlamadaHerramienta } from '../utils/esco2/registro.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { CORRECTION_QA as C,correctionQaDb,correctionQaSeed } from './esco2M5Correction1QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await correctionQaDb();},30000);
beforeEach(async()=>{await correctionQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
const previous=`Temperatura de ${C.station} desde 2025-02-01 hasta 2025-02-03`;
const current='Repite la temperatura, pero ahora desde 2025-02-02 hasta 2025-02-03';
function call(text:string,desde:string,hasta:string,extra:Record<string,unknown>={},variable='temp_c_avg'):LlamadaHerramienta {
  return {nombre:'consultar_clima',argumentos:JSON.stringify({desde,hasta,station_id:C.station,variables:[variable],...extra,parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:text,capacidad:'clima',disposicion:'consultar'}]}})};
}
async function execute(sequence:LlamadaHerramienta[][],question=current,history=previous) {
  const recorded:SolicitudLLM[]=[];
  const llm:ClienteLLM={async completar(input){recorded.push(structuredClone(input));const calls=sequence[Math.min(recorded.length-1,sequence.length-1)];return {texto:'',llamadas:structuredClone(calls),uso:{entrada:1,salida:1,razonamiento:0,costoUsd:0},ms:0,modelo:input.modelo,finishReason:'stop'};}};
  const h=dependencies(db,[],{modoCobertura:'obligatoria',crearLLM:()=>llm});
  const response=await manejar(request({pregunta:question,historial:[{rol:'user',texto:history},{rol:'assistant',texto:'Respuesta anterior sintética de un intervalo mayor.'}]}),h.deps);
  return {response,body:await response.json(),recorded};
}
function climate(body:{resultados?:Array<{tipo:string;alcance:{desde:string;hasta:string};resumen:Array<{variables:Record<string,{promedio:number|null;cobertura:{solicitados:number;usables:number}}>}>}>}) {return body.resultados?.find(r=>r.tipo==='clima');}

describe('M5 correction1 QA: current follow-up obligations survive invalid-plan retry',()=>{
  it('proves the invented old/new interval means are distinct through independent SQL',async()=>{
    const old=await db.query<{promedio:number;dias:number}>('select avg(temp_c_avg)::float8 promedio,count(*)::int dias from clima_resumen_diario where station_id=$1',[C.station]);
    const narrowed=await db.query<{promedio:number;dias:number}>("select avg(temp_c_avg)::float8 promedio,count(*)::int dias from clima_resumen_diario where station_id=$1 and fecha between '2025-02-02' and '2025-02-03'",[C.station]);
    expect(old.rows[0]).toMatchObject({dias:3});expect(old.rows[0].promedio).toBeCloseTo(52/3,10);expect(narrowed.rows).toEqual([{promedio:24,dias:2}]);
  });

  it('rejects a retry whose inventory and dates revert entirely to the previous user question',async()=>{
    const invalid=call(current,'2025-02-02','2025-02-03',{unregistered_argument:true});
    const stale=call(previous,'2025-02-01','2025-02-03');const h=await execute([[invalid],[stale]]);
    expect(h.response.status).toBe(200);expect(h.recorded).toHaveLength(2);
    expect(climate(h.body),'An old interval must never become a substantive answer to this new interval').toBeUndefined();
    expect(h.body.origen).toMatch(/error_plan|aclaracion/);
  });

  it('does not let a current literal inventory disguise a retry with the previous explicit interval',async()=>{
    const invalid=call(current,'2025-02-02','2025-02-03',{unregistered_argument:true});
    const wrongDates=call(current,'2025-02-01','2025-02-03');const h=await execute([[invalid],[wrongDates]]);
    expect(climate(h.body)).toBeUndefined();expect(h.body.origen).toMatch(/error_plan|aclaracion/);
  });

  it('accepts the corrected current inventory and exact narrowed interval after a structural retry',async()=>{
    const invalid=call(current,'2025-02-02','2025-02-03',{unregistered_argument:true});
    const h=await execute([[invalid],[call(current,'2025-02-02','2025-02-03')]]);const r=climate(h.body);
    expect(h.response.status).toBe(200);expect(h.recorded).toHaveLength(2);expect(h.body.origen).toBe('determinista');
    expect(r).toMatchObject({alcance:{desde:'2025-02-02',hasta:'2025-02-03'},resumen:[{variables:{temp_c_avg:{promedio:24,cobertura:{solicitados:2,usables:2}}}}]});
    expect(h.body.cobertura.partes[0]).toMatchObject({texto:current,capacidad:'clima',disposicion:'respondida'});
  });

  it('still lets an elliptical current question inherit its interval and station from history',async()=>{
    const question='¿Y la humedad registrada?';
    const h=await execute([[call(question,'2025-02-01','2025-02-03',{},'humedad_pct_avg')]],question);
    expect(h.body.origen).toBe('determinista');expect(climate(h.body)?.resumen[0].variables.humedad_pct_avg).toMatchObject({promedio:50,cobertura:{usables:3}});
    expect(h.body.cobertura.partes[0].texto).toBe(question);expect(h.recorded).toHaveLength(1);
  });

  it('cannot authorize an old-only inventory even without a first malformed attempt',async()=>{
    const stale=call(previous,'2025-02-01','2025-02-03');const h=await execute([[stale],[stale]]);
    expect(climate(h.body)).toBeUndefined();expect(h.body.origen).toMatch(/error_plan|aclaracion/);
  });
});
