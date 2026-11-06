// Independent counterexamples discovered in final runtime review. Source dates are facts; future facts cannot describe current state.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { HATO_QA,hatoQaDb,hatoQaSeed } from './esco2P4Task4QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await hatoQaDb();},30000);
beforeEach(async()=>{await hatoQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
interface Result {tipo:string;filas:Array<{nombre:string;reproduccion:{estado:string;derivado:unknown}}>;}
describe('P4-4 QA refutation: current state excludes future-dated reproductive facts',()=>{
  it.each(['servicio_confirmacion','parto'])('preserves the valid ficha but withholds current derivation from future %s',async kind=>{
    if(kind==='parto')await db.query("update hato_eventos set fecha='2027-01-01' where id=$1",[HATO_QA.eventBirth]);
    else await db.query("update hato_eventos set fecha=case when id=$1 then '2027-01-01'::date else '2027-01-15'::date end where id in($1,$2)",[HATO_QA.eventService,HATO_QA.eventConfirmation]);
    const h=dependencies(db,[{nombre:'consultar_hato',argumentos:JSON.stringify({animal_ids:[HATO_QA.main]})}],{ahora:()=>new Date('2026-11-06T04:30:00Z')});
    const response=await manejar(request({pregunta:'Ficha y estado reproductivo actual de QA Lira'}),h.deps);const body=await response.json();const r=(body.resultados as Result[])?.find(r=>r.tipo==='hato');expect(r).toBeDefined();
    expect(r!.filas[0].nombre).toBe('QA Lira');expect(r!.filas[0].reproduccion.estado).toBe('no_disponible');expect(r!.filas[0].reproduccion.derivado).toBeNull();
    expect(body.respuesta).not.toMatch(/(?:preñez|abiertos|secado real)[^\n]*-\d/);
  });
});
