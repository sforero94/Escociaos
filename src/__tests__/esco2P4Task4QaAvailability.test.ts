// Additional independent contract check after runtime review: NULL, unread and no row remain distinct.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { qaFaultClient } from './esco2P3Task2QaHarness.ts';
import { HATO_QA,hatoQaDb,hatoQaSeed } from './esco2P4Task4QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await hatoQaDb();},30000);
beforeEach(async()=>{await hatoQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
interface Result {tipo:string;filas:Array<{reproduccion:{num_partos:number|null;num_partos_estado:string}}>}
const rows=(r:RespuestaPostgrest,edit:(row:Record<string,unknown>)=>void):RespuestaPostgrest=>({...r,data:r.data?.map(value=>{const row={...(value as Record<string,unknown>)};edit(row);return row;})??null});
async function query(fault:(table:string,r:RespuestaPostgrest)=>RespuestaPostgrest){
  const h=dependencies(db,[{nombre:'consultar_hato',argumentos:JSON.stringify({animal_ids:[HATO_QA.main]})}],{crearClienteUsuario:jwt=>qaFaultClient(db,jwt,{consultas:[]},[],fault),ahora:()=>new Date('2026-11-06T04:30:00Z')});
  const response=await manejar(request({pregunta:'Ficha actual y partos registrados de QA Lira'}),h.deps);const body=await response.json();const result=(body.resultados as Result[])?.find(r=>r.tipo==='hato');expect(result).toBeDefined();return {body,result:result!};
}
describe('P4-4 QA: explicit per-field availability',()=>{
  it.each([
    {mode:'value',expected:'valor',number:1},
    {mode:'null',expected:'null_registrado',number:null},
    {mode:'unread',expected:'no_leido',number:null},
    {mode:'missing',expected:'sin_fila',number:null},
    {mode:'invalid',expected:'no_calculable',number:null},
  ])('keeps num_partos $mode distinct from the other availability states',async({mode,expected,number})=>{
    const {body,result}=await query((table,r)=>{
      if(table!=='v_hato_estado_actual')return r;
      if(mode==='missing')return {...r,data:r.data?.filter(x=>(x as Record<string,unknown>).animal_id!==HATO_QA.main)??null,count:(r.count??0)-1};
      return rows(r,row=>{if(row.animal_id!==HATO_QA.main)return;if(mode==='null')row.num_partos=null;else if(mode==='unread')delete row.num_partos;else if(mode==='invalid')row.num_partos=-1;});
    });
    expect(result.filas[0].reproduccion).toMatchObject({num_partos:number,num_partos_estado:expected});
    if(mode==='null')expect(body.respuesta).toMatch(/partos[^\n]*NULL registrado/i);
    if(mode==='unread')expect(body.respuesta).toMatch(/partos[^\n]*no le[ií]do/i);
  });
  it.each([{mode:'unread',pattern:/nombre no le[ií]do/i},{mode:'null',pattern:/sin nombre registrado/i}])('renders a $mode animal name according to the source state',async({mode,pattern})=>{
    const {body}=await query((table,r)=>table==='hato_animales'?rows(r,row=>{if(row.id===HATO_QA.main){if(mode==='unread')delete row.nombre;else row.nombre=null;}}):r);
    expect(body.respuesta).toMatch(pattern);
  });
});
