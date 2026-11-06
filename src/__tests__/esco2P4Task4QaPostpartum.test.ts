// Independent human qualifier check requested during reopened P4-4 review.
// Shared engine state and its existing 'Vacía' label stay unchanged.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { HATO_QA,hatoQaDb,hatoQaSeed } from './esco2P4Task4QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await hatoQaDb();},30000);
beforeEach(async()=>{await hatoQaSeed(db);await db.query('update hato_animales set madre_id=null where id=$1',[HATO_QA.main]);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
interface Result {tipo:string;filas:Array<{reproduccion:{derivado:{estado:string}|null}}>}
async function query(){
  const pregunta='¿Cuál es el estado reproductivo actual de QA Lira?';
  const h=dependencies(db,[{nombre:'consultar_hato',argumentos:JSON.stringify({animal_ids:[HATO_QA.main],parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:pregunta,capacidad:'hato',disposicion:'consultar'}]}})}],{ahora:()=>new Date('2026-11-06T04:30:00Z')});
  delete h.deps.modoCobertura;
  const response=await manejar(request({pregunta}),h.deps);const body=await response.json();const result=(body.resultados as Result[])?.find(r=>r.tipo==='hato');expect(result).toBeDefined();
  expect(body.cobertura).toMatchObject({estado:'declarada_validada',partes:[{id:'s1',capacidad:'hato',disposicion:'respondida',resultado_ids:['p1']}]});return {body,result:result!};
}
describe('P4-4 QA reopened: postpartum qualifier belongs only to the shared engine postpartum state',()=>{
  it('keeps Vacía and adds a postpartum qualifier when the engine returns parida_reciente',async()=>{
    await db.query("update hato_eventos set fecha='2026-10-20' where id=$1",[HATO_QA.eventBirth]);
    const {body,result}=await query();expect(result.filas[0].reproduccion.derivado?.estado).toBe('parida_reciente');
    expect(body.respuesta).toMatch(/vac[ií]a[^\n]*(?:posparto|parida reciente)/i);
  });
  it('does not add the postpartum qualifier to vacia_por_servir after a later abortion',async()=>{
    await db.query("insert into hato_eventos values('b4400000-0000-4000-8000-000000000098',$1,'aborto','2026-10-25',null,'2026-10-25T12:00:00Z',null,null)",[HATO_QA.main]);
    const {body,result}=await query();expect(result.filas[0].reproduccion.derivado?.estado).toBe('vacia_por_servir');
    expect(body.respuesta).toMatch(/vac[ií]a/i);expect(body.respuesta).not.toMatch(/posparto|parida reciente/i);
  });
});
