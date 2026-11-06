// Reopened P4-4 QA: preserve immutable requests for existing operational facts in human output.
// New supplemental oracles only; the previous 77 cases and six frozen files remain untouched.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { CAPACIDADES_PARTE } from '../utils/esco2/cobertura.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { qaFaultClient,type QaProjection } from './esco2P3Task2QaHarness.ts';
import { HATO_QA,hatoQaDb,hatoQaSeed } from './esco2P4Task4QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await hatoQaDb();},30000);
beforeEach(async()=>{
  await hatoQaSeed(db);
  // Only this supplemental fixture removes the deliberately hidden mother so its positive coverage is complete.
  await db.query('update hato_animales set madre_id=null where id=$1',[HATO_QA.main]);
});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
interface Result {tipo:string;estado:string;filas:Array<{reproduccion:{estado:string;derivado:{estado:string}|null;hechos?:{ultimo_parto_fecha?:string|null;ultimo_servicio_fecha?:string|null;ultima_confirmacion_prenez_fecha?:string|null;ultima_confirmacion_prenez_metodo?:string|null}}}>}
const QUESTIONS={
  parto:'¿Cuál fue la fecha del último parto registrado de QA Lira?',
  servicio:'¿Cuál fue la fecha del último servicio registrado de QA Lira?',
  metodo:'¿Qué método tiene la última confirmación de preñez registrada de QA Lira?',
} as const;
async function query(pregunta:string){
  const projections:QaProjection[]=[];
  const h=dependencies(db,[{nombre:'consultar_hato',argumentos:JSON.stringify({animal_ids:[HATO_QA.main],parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:pregunta,capacidad:'hato',disposicion:'consultar'}]}})}],{
    crearClienteUsuario:jwt=>qaFaultClient(db,jwt,{consultas:[]},projections),ahora:()=>new Date('2026-11-06T04:30:00Z'),
  });
  delete h.deps.modoCobertura; // Exercise the real mandatory server default after the climate rebase.
  const response=await manejar(request({pregunta}),h.deps);const body=await response.json();
  const result=(body.resultados as Result[])?.find(r=>r.tipo==='hato');expect(result).toBeDefined();expect(response.status).toBe(200);
  expect(body.cobertura).toMatchObject({estado:'declarada_validada',partes:[{id:'s1',capacidad:'hato',resultado_ids:['p1']}]});
  return {h,body,result:result!,projections};
}
describe('P4-4 reopened QA: recorded operational facts survive deterministic rendering',()=>{
  it('retains all closed capabilities when climate and herd integration are merged',()=>{
    expect([...CAPACIDADES_PARTE].sort()).toEqual(['labores','aplicaciones','cantidades_aplicacion','costos_aplicacion','labor_aplicacion','faltantes_aplicacion','monitoreo','conductividad','clima','hato','fuera_de_contrato'].sort());
  });
  it.each([
    {question:QUESTIONS.parto,field:'ultimo_parto_fecha',iso:'2026-07-01',label:/[úu]ltimo parto[^\n]*1 de julio de 2026/i},
    {question:QUESTIONS.servicio,field:'ultimo_servicio_fecha',iso:'2026-08-01',label:/[úu]ltimo servicio[^\n]*1 de agosto de 2026/i},
  ])('answers the unchanged operational-date request: $question',async({question,field,iso,label})=>{
    const {body,result,projections}=await query(question);
    expect(result.estado).toBe('ok');expect(body.cobertura.partes[0].disposicion).toBe('respondida');
    expect(result.filas[0].reproduccion.hechos?.[field as 'ultimo_parto_fecha'|'ultimo_servicio_fecha']).toBe(iso);
    expect(body.respuesta).toMatch(label);
    // No new history source or free text is needed: these facts were already in the fixed view projection.
    expect(projections.some(p=>p.tabla==='hato_eventos'||p.tabla==='hato_chequeo_vacas'||p.tabla==='hato_chequeos')).toBe(false);
    expect(projections.filter(p=>p.tabla==='v_hato_estado_actual').every(p=>p.columnas.includes('ultimo_parto_fecha')&&p.columnas.includes('ultimo_servicio_fecha'))).toBe(true);
    expect(body.respuesta).not.toMatch(/1901|1902/);
  });
  it.each([
    {method:'palpacion',expectedState:'preñada',label:/m[ée]todo[^\n]*palpaci[oó]n/i},
    {method:null,expectedState:'servida',label:/m[ée]todo[^\n]*(?:NULL registrado|sin m[ée]todo registrado)/i},
  ])('publishes the recorded confirmation method $method separately from a derived state',async({method,expectedState,label})=>{
    await db.query('update hato_eventos set datos=$1::jsonb where id=$2',[JSON.stringify(method===null?{}:{metodo:method}),HATO_QA.eventConfirmation]);
    const {body,result}=await query(QUESTIONS.metodo);const repro=result.filas[0].reproduccion;
    expect(repro.hechos).toMatchObject({ultima_confirmacion_prenez_fecha:'2026-08-15',ultima_confirmacion_prenez_metodo:method});
    expect(repro.derivado?.estado).toBe(expectedState);expect(body.respuesta).toMatch(label);
    if(method===null)expect(body.respuesta).not.toMatch(/palpada|confirmada por palpaci[oó]n/i);
  });
  it('retains the requested registered birth date when configuration prevents reproductive derivation',async()=>{
    await db.query("delete from hato_config where clave='meses_gestacion_default'");
    const {body,result}=await query(QUESTIONS.parto);expect(result.filas[0].reproduccion).toMatchObject({estado:'no_disponible',derivado:null,hechos:{ultimo_parto_fecha:'2026-07-01'}});
    expect(body.respuesta).toMatch(/[úu]ltimo parto[^\n]*1 de julio de 2026/i);
  });
  it('reports a registered NULL last-birth date without inventing a date from service or probable birth',async()=>{
    await db.query('delete from hato_eventos where id=$1',[HATO_QA.eventBirth]);
    const {body,result}=await query(QUESTIONS.parto);expect(result.filas[0].reproduccion.hechos?.ultimo_parto_fecha).toBeNull();
    expect(body.respuesta).toMatch(/[úu]ltimo parto[^\n]*(?:NULL registrado|sin (?:fecha |parto )?registrad)/i);
  });
});
