// Independent invoker-view adversary: SQL visibility, not administrative reads.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { HATO_QA,hatoQaDb,hatoQaSeed } from './esco2P4Task4QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await hatoQaDb();},30000);
beforeEach(async()=>{await hatoQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
interface Result {tipo:string;filas:Array<{animal_id:string;reproduccion:{derivado:{estado:string;fecha_secar:string|null;fecha_probable_parto:string|null;alertas:{rechequeo_due:boolean}}|null}}>}
async function query(){
  const h=dependencies(db,[{nombre:'consultar_hato',argumentos:JSON.stringify({animal_ids:[HATO_QA.main]})}],{ahora:()=>new Date('2026-11-06T04:30:00Z')});
  const response=await manejar(request({pregunta:'Ficha y reproducción actual de QA Lira'}),h.deps);const body=await response.json();const r=(body.resultados as Result[])?.find(r=>r.tipo==='hato');expect(r).toBeDefined();return {h,body,result:r!};
}
describe('P4-4 QA: real invoker-view dependencies preserve requester visibility',()=>{
  it('does not project dates from a service hidden by event RLS even when palpation remains visible',async()=>{
    await db.exec(`create policy qa_hide_service on hato_eventos as restrictive for select to authenticated using(id <> '${HATO_QA.eventService}');`);
    try{const {result}=await query();expect(result.filas[0].reproduccion.derivado).toMatchObject({estado:'preñada',fecha_secar:null,fecha_probable_parto:null});}
    finally{await db.exec('drop policy qa_hide_service on hato_eventos;');}
  });
  it('respects chequeo-header RLS through the view instead of treating a readable child as a readable parent',async()=>{
    await db.query("update hato_chequeos set fecha='2026-08-01' where id=$1",[HATO_QA.check]);
    const visible=await query();expect(visible.result.filas[0].reproduccion.derivado?.alertas.rechequeo_due).toBe(true);
    await db.exec('create policy qa_hide_check on hato_chequeos as restrictive for select to authenticated using(false);');
    try{const {result}=await query();expect(result.filas[0].reproduccion.derivado?.alertas.rechequeo_due).toBe(false);expect(result.filas[0].reproduccion.derivado?.estado).toBe('preñada');}
    finally{await db.exec('drop policy qa_hide_check on hato_chequeos;');}
  });
});
