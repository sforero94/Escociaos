// Additional independently frozen P4-4 invariants: strict selectors and unavailable facts.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { validarPlan } from '../utils/esco2/registro.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { qaFaultClient } from './esco2P3Task2QaHarness.ts';
import { HATO_ORACLE,HATO_QA,hatoQaDb,hatoQaSeed } from './esco2P4Task4QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await hatoQaDb();},30000);
beforeEach(async()=>{await hatoQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
interface Result {tipo:string;estado:string;filas:Array<{nombre:string;reproduccion:{estado:string;derivado:unknown;num_partos:number|null}}>;}
async function execute(fault?:(table:string,r:RespuestaPostgrest)=>RespuestaPostgrest){
  const h=dependencies(db,[{nombre:'consultar_hato',argumentos:JSON.stringify({animal_ids:[HATO_QA.main]})}],{crearClienteUsuario:jwt=>qaFaultClient(db,jwt,{consultas:[]},[],fault),ahora:()=>new Date('2026-11-06T04:30:00Z')});
  const response=await manejar(request({pregunta:'Ficha actual de QA Lira'}),h.deps);const body=await response.json();const r=(body.resultados as Result[])?.find(r=>r.tipo==='hato');expect(r).toBeDefined();return {body,result:r!};
}
const rows=(r:RespuestaPostgrest,edit:(row:Record<string,unknown>)=>void):RespuestaPostgrest=>({...r,data:r.data?.map(value=>{const row={...(value as Record<string,unknown>)};edit(row);return row;})??null});
describe('P4-4 QA supplemental: closed operation and source provenance',()=>{
  it.each([
    {animal_ids:HATO_QA.main}, {animal_ids:[null]}, {animal_ids:['']},
    {animal_ids:[HATO_QA.main],nombres:['QA Lira']},
    {animal_ids:[HATO_QA.main],chapetas:[601]},
    {nombres:['QA Lira'],chapetas:[601]},
    {nombres:[['QA Lira']]}, {nombres:['']}, {chapetas:['601']}, {chapetas:[1.5]},
    {animal_ids:[HATO_QA.main],desde:'2026-01-01',hasta:'2026-01-31'},
    {animal_ids:[HATO_QA.main],agrupar_por:['estado']},
  ])('rejects malformed, mixed or unregistered selectors before any broadening %#',args=>{
    expect(()=>validarPlan([{nombre:'consultar_hato',argumentos:JSON.stringify(args)}])).toThrow();
  });
  it.each(['fecha_nacimiento','etapa_forzada','ultima_confirmacion_prenez_metodo','ultimo_aborto_fecha','ultimo_estado_chequeo'])('distinguishes unread required reproductive field %s from a registered NULL',async field=>{
    const {result}=await execute((t,r)=>t==='v_hato_estado_actual'?rows(r,row=>{if(row.animal_id===HATO_QA.main)delete row[field];}):r);
    expect(result.filas[0].nombre).toBe('QA Lira');expect(result.filas[0].reproduccion.estado).toBe('no_disponible');expect(result.filas[0].reproduccion.derivado).toBeNull();
  });
  it('does not override animal identity or stage with a mismatching view record',async()=>{
    const {result}=await execute((t,r)=>t==='v_hato_estado_actual'?rows(r,row=>{if(row.animal_id===HATO_QA.main)row.estado='vendida';}):r);
    expect(result.filas[0].nombre).toBe('QA Lira');expect(result.filas[0].reproduccion.estado).toBe('no_disponible');expect(result.filas[0].reproduccion.derivado).toBeNull();
  });
  it('does not use a transport duplicate config key as last-wins configuration',async()=>{
    const {result}=await execute((t,r)=>t==='hato_config'&&r.data?.length?{...r,data:[...r.data,r.data[0]],count:(r.count??0)+1}:r);
    expect(result.filas[0].nombre).toBe('QA Lira');expect(result.filas[0].reproduccion.estado).toBe('no_disponible');expect(result.filas[0].reproduccion.derivado).toBeNull();
  });
  it('preserves reproductive facts when the optional bull catalog fails',async()=>{
    const {result}=await execute((t,r)=>t==='hato_toros'?{data:null,count:null,error:{message:'PRIVATE BULL ERROR'}}:r);
    expect(result.filas[0].reproduccion.derivado).toMatchObject(HATO_ORACLE.confirmed);
  });
  it('does not silently select an active animal after the selected ID was renumbered',async()=>{
    await db.query('update hato_animales set numero=777 where id=$1',[HATO_QA.main]);
    const {result}=await execute();expect(result.filas).toHaveLength(1);expect(result.filas[0].reproduccion.derivado).toMatchObject(HATO_ORACLE.confirmed);
  });
});
