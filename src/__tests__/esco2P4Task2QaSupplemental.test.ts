// Additional independent CE invariants; original frozen harness/oracles remain unchanged.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { validarPlan } from '../utils/esco2/registro.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { dependencies,forbidNetwork,ID,request } from './esco2P2Harness.ts';
import { qaFaultClient } from './esco2P3Task2QaHarness.ts';
import { CE_ORACLE,CE_QA,ceQaDb,ceQaSeed } from './esco2P4Task2QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await ceQaDb();},30000);
beforeEach(async()=>{await ceQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
interface Row {id:string;valor_ce:number|null;ph:number|null;num_arboles:number|null;distribucion:unknown;estado:string;ronda_estado:string;motivos:string[]}
interface Result {tipo:string;estado:string;filas:Row[]}
const base=()=>({desde:'2026-10-02',hasta:'2026-10-02',lote_ids:[ID.l1]});
async function query(args:Record<string,unknown>=base(),change?:(row:Record<string,unknown>)=>void) {
  const h=dependencies(db,[{nombre:'consultar_conductividad',argumentos:JSON.stringify(args)}],{crearClienteUsuario:jwt=>qaFaultClient(db,jwt,{consultas:[]},[],(table,r:RespuestaPostgrest)=>table!=='mon_conductividad'||!change?r:{...r,data:r.data?.map(x=>{const row={...(x as Record<string,unknown>)};change(row);return row;})??null})});
  const response=await manejar(request({pregunta:'Conductividad eléctrica registrada en QA CE Norte el 2 de octubre de 2026'}),h.deps);const body=await response.json();
  const r=(body.resultados as Result[])?.find(r=>r.tipo==='conductividad');expect(r).toBeDefined();return {h,body,result:r!};
}
describe('P4-2 QA supplemental: independent field states and closed selectors',()=>{
  it.each([null,undefined,'NaN',-0.1])('keeps individual measurements separate from invalid saved CE %s',async value=>{
    const {result,body}=await query(base(),row=>{if(row.id===CE_QA.first){if(value===undefined)delete row.valor_ce;else row.valor_ce=value;}});
    expect(result.estado).not.toBe('ok');expect(result.filas.every(r=>r.valor_ce!==0)).toBe(true);expect(body.respuesta).not.toMatch(/NaN|Infinity/);
  });
  it.each(['ph','num_arboles'])('preserves usable CE when optional %s is recorded NULL',async field=>{
    const {result}=await query(base(),row=>{if(row.id===CE_QA.first)row[field]=null;});
    const row=result.filas[0];expect(row.valor_ce).toBe(7.25);expect(row.distribucion).toEqual(CE_ORACLE.first);expect(row[field as 'ph'|'num_arboles']).toBeNull();
  });
  it.each(['ph','num_arboles'])('preserves usable CE while making an unread optional %s explicit',async field=>{
    const {result}=await query(base(),row=>{if(row.id===CE_QA.first)delete row[field];});
    const row=result.filas[0];expect(row.valor_ce).toBe(7.25);expect(row.distribucion).toEqual(CE_ORACLE.first);expect(row[field as 'ph'|'num_arboles']).toBeNull();expect(row.estado).not.toBe('ok');
  });
  it('keeps a real visible round distinct from an unread round link while retaining CE',async()=>{
    const {result}=await query(base(),row=>{if(row.id===CE_QA.first)delete row.ronda_id;});
    expect(result.filas[0]).toMatchObject({ronda_estado:'no_leido',valor_ce:7.25,distribucion:CE_ORACLE.first});
  });
  it('resolves an exact selected lot name and retains its label without requesting grouping',async()=>{
    const {result,body}=await query({desde:'2026-10-02',hasta:'2026-10-02',lotes:['QA CE Norte']});
    expect(result.filas).toHaveLength(1);expect(result.filas[0].id).toBe(CE_QA.first);expect(body.respuesta).toContain('QA CE Norte');
  });
  it('does not choose between identical visible lot names by activity or first match',async()=>{
    await db.query("update lotes set nombre='QA CE Norte' where id=$1",[ID.l2]);
    const {result}=await query({desde:'2026-10-02',hasta:'2026-10-02',lotes:['QA CE Norte']});expect(result.estado).not.toBe('ok');expect(result.filas).toEqual([]);
  });
  it.each([
    {desde:['2026-10-02'],hasta:'2026-10-02'},
    {desde:'2026-10-02',hasta:['2026-10-02']},
    {desde:'2026-02-30',hasta:'2026-03-01'},
    {desde:'2026-10-03',hasta:'2026-10-02'},
    {desde:'2026-10-02'},
    {desde:'2026-10-02',hasta:'2026-10-02',lote_ids:ID.l1},
    {desde:'2026-10-02',hasta:'2026-10-02',lote_ids:[ID.l1],lotes:['QA CE Norte']},
    {desde:'2026-10-02',hasta:'2026-10-02',lotes:['']},
    {desde:'2026-10-02',hasta:'2026-10-02',ronda_ids:[CE_QA.visibleRound]},
    {desde:'2026-10-02',hasta:'2026-10-02',agrupar_por:['lote']},
  ])('rejects malformed or unregistered CE selectors before broadening the population %#',args=>{
    expect(()=>validarPlan([{nombre:'consultar_conductividad',argumentos:JSON.stringify(args)}])).toThrow();
  });
});
