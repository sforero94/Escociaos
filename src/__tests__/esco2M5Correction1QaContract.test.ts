// Positive executor/coverage controls. These scripted plans DO NOT certify LLM
// interpretation of free text; semantic success belongs to the paid blind cycle.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { LlamadaHerramienta } from '../utils/esco2/registro.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { CORRECTION_QA as C,correctionQaDb,correctionQaSeed } from './esco2M5Correction1QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await correctionQaDb();},30000);
beforeEach(async()=>{await correctionQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
async function execute(question:string,calls:LlamadaHerramienta[]) {
  const h=dependencies(db,calls,{modoCobertura:'obligatoria'});const response=await manejar(request({pregunta:question}),h.deps);const body=await response.json();
  expect(response.status).toBe(200);expect(body.origen).toBe('determinista');expect(h.solicitudes).toHaveLength(1);return body;
}
const pesoArgs={desde:'2025-03-01',hasta:'2025-03-02',animal_ids:[C.animal]};

describe('M5 correction1 QA: supported response constraints and native CE distribution',()=>{
  it.each(['mantén el PM ausente como NULL','omite extrapolaciones a días no medidos'])('supports the weight-response constraint %j without falsely excluding that request',async restriction=>{
    const question=`Pesajes de ${C.animalName} desde 2025-03-01 hasta 2025-03-02; ${restriction}`;
    const body=await execute(question,[{nombre:'consultar_pesajes_leche',argumentos:JSON.stringify({...pesoArgs,parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:question,capacidad:'pesajes_leche',disposicion:'consultar'}]}})}]);
    const r=body.resultados[0];expect(r.tipo).toBe('pesajes_leche');expect(r.resumen[0].suma_muestras).toBe(6);
    expect(r.filas.find((f:{fecha:string})=>f.fecha==='2025-03-02')).toMatchObject({litros_pm:null,litros_usable:null,estado:'turno_incompleto'});
    expect(r.filas).toHaveLength(2);expect(body.cobertura.partes[0].disposicion).toBe('fuente_no_disponible');
    expect(body.cobertura.partes.some((p:{disposicion:string})=>p.disposicion==='fuera_de_contrato')).toBe(false);
  });

  it('answers native CE tree-distribution figures while keeping the request in the supported capability',async()=>{
    const question=`Conductividad de ${C.lotName} el 2025-04-07: muestra promedio guardado y distribución por árbol`;
    const body=await execute(question,[{nombre:'consultar_conductividad',argumentos:JSON.stringify({desde:'2025-04-07',hasta:'2025-04-07',lote_ids:[C.lot],parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:question,capacidad:'conductividad',disposicion:'consultar'}]}})}]);
    expect(body.resultados[0]).toMatchObject({tipo:'conductividad',filas:[{valor_ce:4.6,distribucion:{pctBajo:50,pctEnRango:50,pctAlto:0,totalArboles:2,promedio:0.8}}]});
    expect(body.cobertura.partes[0].capacidad).toBe('conductividad');expect(body.cobertura.partes[0].disposicion).not.toBe('fuera_de_contrato');
    expect(body.respuesta).toMatch(/50\s*%/);expect(body.respuesta).toMatch(/guardad|registrad/i);
  });

  it('preserves a genuine unsupported forecast alongside a valid non-projection constraint',async()=>{
    const supported=`Pesajes de ${C.animalName} desde 2025-03-01 hasta 2025-03-02, sin extrapolar`;
    const unsupported='además pronostica la producción de la próxima estación';const question=supported+'; '+unsupported;
    const body=await execute(question,[{nombre:'consultar_pesajes_leche',argumentos:JSON.stringify({...pesoArgs,parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:supported,capacidad:'pesajes_leche',disposicion:'consultar'},{id:'s2',texto:unsupported,capacidad:'fuera_de_contrato',disposicion:'fuera_de_contrato'}]}})}]);
    expect(body.resultados[0].resumen[0].suma_muestras).toBe(6);
    expect(body.cobertura.partes.map((p:{disposicion:string})=>p.disposicion)).toEqual(['fuente_no_disponible','fuera_de_contrato']);
    expect(body.cobertura.partes[1].resultado_ids).toEqual([]);
  });

  it('retains the established permission for one broad literal quote to contain both supported and excluded obligations',async()=>{
    const question=`Pesajes de ${C.animalName} desde 2025-03-01 hasta 2025-03-02 y pronostica el siguiente trimestre`;
    const body=await execute(question,[{nombre:'consultar_pesajes_leche',argumentos:JSON.stringify({...pesoArgs,parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:question,capacidad:'pesajes_leche',disposicion:'consultar'},{id:'s2',texto:question,capacidad:'fuera_de_contrato',disposicion:'fuera_de_contrato'}]}})}]);
    expect(body.resultados[0].resumen[0].suma_muestras).toBe(6);expect(body.cobertura.partes[1].disposicion).toBe('fuera_de_contrato');
  });

  it('accepts two point-date operations linked to one current comparison request without forcing a continuous interval',async()=>{
    const question=`Compara la temperatura de ${C.station} del 2025-02-01 con la del 2025-02-03`;
    const calls=['2025-02-01','2025-02-03'].map((date,i)=>({nombre:'consultar_clima',argumentos:JSON.stringify({desde:date,hasta:date,station_id:C.station,variables:['temp_c_avg'],parte_ids:['s1'],...(i===0?{cobertura:{version:1,partes:[{id:'s1',texto:question,capacidad:'clima',disposicion:'consultar'}]}}:{})})}));
    const body=await execute(question,calls);expect(body.resultados).toHaveLength(2);
    expect(body.resultados.map((r:{alcance:{desde:string;hasta:string}})=>r.alcance)).toMatchObject([{desde:'2025-02-01',hasta:'2025-02-01'},{desde:'2025-02-03',hasta:'2025-02-03'}]);
    expect(body.resultados.map((r:{resumen:Array<{variables:{temp_c_avg:{promedio:number}}}>})=>r.resumen[0].variables.temp_c_avg.promedio)).toEqual([4,40]);
    expect(body.cobertura.partes[0]).toMatchObject({disposicion:'respondida',resultado_ids:['p1','p2']});
  });
});
