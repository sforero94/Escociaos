// Independent P4-2 QA; semantic oracles frozen before runtime implementation.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { USUARIOS,type Traza } from './esco2ArnesRls.ts';
import { dependencies,forbidNetwork,ID,request } from './esco2P2Harness.ts';
import { qaFaultClient,type QaProjection } from './esco2P3Task2QaHarness.ts';
import { CE_ORACLE,CE_QA,ceQaDb,ceQaSeed } from './esco2P4Task2QaHarness.ts';

let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await ceQaDb();},30000);
beforeEach(async()=>{await ceQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
type Fault=(table:string,response:RespuestaPostgrest)=>RespuestaPostgrest;
interface QaRow {
  id:string;lote_id:string;lote:string;fecha_monitoreo:string;valor_ce:number|null;ph:number|null;
  distribucion:typeof CE_ORACLE.first|null;num_arboles:number|null;ronda_id:string|null;
  ronda_estado:string;estado:string;motivos:string[];
}
interface QaResult {tipo:'conductividad';estado:string;filas:QaRow[];excluidos:{padre_no_visible:number;incompatibles:number}}
const args=()=>({desde:'2026-10-02',hasta:'2026-10-02',lote_ids:[ID.l1]});
async function execute(parameters:Record<string,unknown>=args(),fault?:Fault,user:string=USUARIOS.gerencia,mandatory=false) {
  const traza:Traza={consultas:[]};const projections:QaProjection[]=[];
  const pregunta='Conductividad eléctrica del suelo de QA CE Norte el 2 de octubre de 2026';
  const input=mandatory?{...parameters,parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:pregunta,capacidad:'conductividad',disposicion:'consultar'}]}}:parameters;
  const h=dependencies(db,[{nombre:'consultar_conductividad',argumentos:JSON.stringify(input)}],{crearClienteUsuario:jwt=>qaFaultClient(db,jwt,traza,projections,fault),...(mandatory?{modoCobertura:'obligatoria' as const}:{})});
  // Omit the harness's legacy override to exercise the real server default when mandatory.
  if(mandatory)delete h.deps.modoCobertura;
  const response=await manejar(request({pregunta},user),h.deps);const body=await response.json();
  return {...h,response,body,traza,projections};
}
function result(body:{resultados?:unknown[]}):QaResult {
  const r=body.resultados?.find(x=>typeof x==='object'&&x!==null&&'tipo'in x&&x.tipo==='conductividad');
  expect(r,'A substantive CE result must cross the real HTTP handler').toBeDefined();return r as QaResult;
}
async function setJson(value:unknown) {await db.query('update mon_conductividad set lecturas=$1::jsonb where id=$2',[JSON.stringify(value),CE_QA.first]);}
function overlay(response:RespuestaPostgrest,modify:(row:Record<string,unknown>)=>void):RespuestaPostgrest {
  return {...response,data:response.data?.map(x=>{const row={...(x as Record<string,unknown>)};modify(row);return row;})??null};
}
describe('P4-2 independent QA: HTTP, fixed SQL/JWT/RLS, CE arithmetic and coverage',()=>{
  it('checks independently in SQL that NULL sides and explicit zero yield four tree means and saved CE remains distinct',async()=>{
    const sql=await db.query<{n:number;saved:string;per_tree:string}>(`with source as(select valor_ce,lecturas from mon_conductividad where id=$1), tree as(select valor_ce,(coalesce((j->>'alta')::numeric,0)+coalesce((j->>'baja')::numeric,0))/((case when j->>'alta' is null then 0 else 1 end)+(case when j->>'baja' is null then 0 else 1 end)) v from source cross join lateral jsonb_array_elements(lecturas) j where j->>'alta' is not null or j->>'baja' is not null) select count(*)::int n,min(valor_ce)::text saved,round(avg(v),2)::text per_tree from tree`,[CE_QA.first]);
    expect(sql.rows).toEqual([{n:4,saved:'7.25',per_tree:'0.88'}]);
  });
  it('matches the literal per-tree oracle while preserving saved average, pH, and declared tree count',async()=>{
    const h=await execute();const r=result(h.body);expect(r.estado).toBe('ok');expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({id:CE_QA.first,valor_ce:7.25,ph:6.4,num_arboles:99,distribucion:CE_ORACLE.first});
    expect(h.body.respuesta).toMatch(/dS\/m/);expect(h.body.respuesta).toMatch(/pH/);expect(h.body.respuesta).toMatch(/guardad/i);
    expect(h.body.respuesta).not.toMatch(/apli(?:que|car)|fertili[cz]|riegu|dosis|se recomienda/i);
    expect(h.solicitudes).toHaveLength(1);expect(h.body.origen).toBe('determinista');
  });
  it('responds with mandatory coverage using the real server default, without the historical bypass',async()=>{
    const h=await execute(args(),undefined,USUARIOS.gerencia,true);
    expect(h.response.status).toBe(200);expect(result(h.body).estado).toBe('ok');
    expect(result(h.body).filas[0].distribucion).toEqual(CE_ORACLE.first);
    expect(h.body.cobertura).toMatchObject({estado:'declarada_validada',partes:[{id:'s1',capacidad:'conductividad',disposicion:'respondida',resultado_ids:['p1']}]});
  });
  it('selects by inclusive operational dates and emits records separately without a global mean of saved means',async()=>{
    const h=await execute({desde:'2026-10-02',hasta:'2026-10-03'});const r=result(h.body);
    expect(r.filas.map(f=>f.id).sort()).toEqual([CE_QA.first,CE_QA.second].sort());
    expect(r.filas.find(f=>f.id===CE_QA.second)).toMatchObject({valor_ce:0,ph:null,distribucion:CE_ORACLE.second,ronda_estado:'visible'});
    expect(h.body.respuesta).not.toMatch(/987[.,]65|NO PUBLICAR|promedio global|promedio de todas las mediciones/i);
  });
  it('does not infer a round from an identical or nearby date',async()=>{
    const row=result((await execute()).body).filas[0];expect(row).toMatchObject({ronda_id:null,ronda_estado:'sin_vinculo'});
  });
  it('retains usable CE with a real but RLS-hidden round, without leaking the round label',async()=>{
    await db.query('update mon_conductividad set ronda_id=$1 where id=$2',[CE_QA.hiddenRound,CE_QA.first]);
    const h=await execute();const row=result(h.body).filas[0];expect(row.ronda_estado).toBe('no_legible');expect(row.valor_ce).toBe(7.25);expect(row.distribucion).toEqual(CE_ORACLE.first);expect(h.body.respuesta).not.toContain('NO PUBLICAR');
  });
  it('keeps valid CE when the optional round catalog is unread',async()=>{
    const h=await execute(args(),(table,r)=>table==='rondas_monitoreo'?{data:null,count:null,error:{message:'PRIVATE ROUND ERROR'}}:r);
    const row=result(h.body).filas[0];expect(row.valor_ce).toBe(7.25);expect(row.distribucion).toEqual(CE_ORACLE.first);expect(h.body.respuesta).not.toContain('PRIVATE ROUND ERROR');
  });
  it.each([null,[],[{arbol:1,alta:null,baja:null}]].map(value=>[value]))('does not turn an empty individual population %# into zero distribution or a soil classification',async value=>{
    await setJson(value);const row=result((await execute()).body).filas[0];expect(row.valor_ce).toBe(7.25);expect(row.distribucion).toBeNull();expect(row.estado).not.toBe('ok');
  });
  it.each([
    {},'malformed',42,[null],[{arbol:1,alta:'1',baja:0}],[{arbol:1,alta:-1,baja:0}],
    [{arbol:1,alta:1}],[{alta:1,baja:1}],[{arbol:0,alta:1,baja:1}],
    [{arbol:1,alta:1,baja:null},{arbol:1,alta:2,baja:null}],
  ].map(value=>[value]))('retains saved CE but withholds a distribution for malformed or repeated-tree JSON %#',async value=>{
    await setJson(value);const h=await execute();const row=result(h.body).filas[0];expect(row.valor_ce).toBe(7.25);expect(row.distribucion).toBeNull();expect(row.estado).not.toBe('ok');expect(h.body.respuesta).not.toMatch(/NaN|Infinity/);
  });
  it.each([[0.49,100,0,0],[0.5,0,100,0],[1.5,0,100,0],[1.51,0,0,100]])('respects module CE boundary %s dS/m',async(value,bajo,rango,alto)=>{
    await setJson([{arbol:1,alta:value,baja:null}]);const row=result((await execute()).body).filas[0];expect(row.distribucion).toMatchObject({pctBajo:bajo,pctEnRango:rango,pctAlto:alto,totalArboles:1,promedio:value});
  });
  it('distinguishes a missing record after a complete read from explicit saved CE zero',async()=>{
    const missing=result((await execute({...args(),lote_ids:[ID.l3]})).body);expect(missing.estado).toBe('vacio_verificado');expect(missing.filas).toEqual([]);
    const zero=result((await execute({desde:'2026-10-03',hasta:'2026-10-03',lote_ids:[ID.l2]})).body).filas[0];expect(zero.valor_ce).toBe(0);expect(zero.distribucion).toEqual(CE_ORACLE.second);
  });
  it('does not expose a readable CE child through an invisible lot parent',async()=>{
    const h=await execute({...args(),lote_ids:[CE_QA.hiddenLot]});const r=result(h.body);expect(r.estado).not.toBe('ok');expect(r.filas).toEqual([]);expect(h.body.respuesta).not.toMatch(/987[.,]65|NO PUBLICAR/);
  });
  it.each(['mon_conductividad','lotes'])('does not certify a failed %s reader as empty or zero',async table=>{
    const h=await execute(args(),(t,r)=>t===table?{data:null,count:null,error:{message:'PRIVATE CE ERROR'}}:r);const r=result(h.body);expect(r.estado).not.toMatch(/^(ok|vacio_verificado)$/);expect(r.filas.filter(f=>f.estado==='ok')).toEqual([]);expect(h.body.respuesta).not.toContain('PRIVATE CE ERROR');
  });
  it.each(['duplicate','truncated','missing_field'])('fails closed on %s transport',async mode=>{
    const h=await execute(args(),(t,r)=>{
      if(t!=='mon_conductividad')return r;
      if(mode==='duplicate'&&r.data?.length)return {...r,data:[...r.data,r.data[0]],count:(r.count??0)+1};
      if(mode==='truncated')return {...r,count:(r.count??0)+1};
      return overlay(r,row=>{delete row.valor_ce;});
    });const r=result(h.body);expect(r.estado).not.toMatch(/^(ok|vacio_verificado)$/);expect(r.filas.filter(f=>f.estado==='ok')).toEqual([]);
  });
  it('rejects a missing date selector with clarification instead of guessing a round or reading all history',async()=>{
    const h=await execute({lote_ids:[ID.l1]});const r=result(h.body);expect(r.estado).toBe('aclaracion');expect(r.filas).toEqual([]);
  });
  it('uses explicit CE projections under requester JWT/RLS and no unrelated domain sources',async()=>{
    const h=await execute();expect(result(h.body).filas[0].distribucion).toEqual(CE_ORACLE.first);
    const ce=h.projections.filter(p=>p.tabla==='mon_conductividad');expect(ce.length).toBeGreaterThan(0);
    expect(ce.every(p=>p.columnas.split(',').sort().join(',')===['id','lote_id','ronda_id','fecha_monitoreo','valor_ce','lecturas','num_arboles','ph'].sort().join(',')&&p.count==='exact')).toBe(true);
    expect(h.projections.every(p=>!p.columnas.includes('*'))).toBe(true);expect(h.traza.consultas.every(t=>t.rol==='authenticated')).toBe(true);
    expect(h.traza.consultas.some(t=>/^(monitoreos|clima_|hato_|logs_auditoria)/.test(t.tabla))).toBe(false);
    expect(h.body.respuesta).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4000-8000-[0-9a-f]{12}/i);
  });
  it('retains the Gerencia gate before model planning or domain reads',async()=>{
    const h=await execute(args(),undefined,USUARIOS.administrador);expect(h.response.status).toBe(403);expect(h.solicitudes).toHaveLength(0);expect(h.traza.consultas.every(t=>t.tabla==='usuarios')).toBe(true);
  });
});
