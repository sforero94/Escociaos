// P4-3 independent synthetic QA. Expectations frozen before climate runtime exists.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { validarPlan } from '../utils/esco2/registro.ts';
import { USUARIOS,type Traza } from './esco2ArnesRls.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { qaFaultClient,type QaProjection } from './esco2P3Task2QaHarness.ts';
import { CLIMA_COLUMNAS,CLIMA_ORACLE,climaQaDb,climaQaSeed } from './esco2P4Task3QaHarness.ts';

let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await climaQaDb();},30000);
beforeEach(async()=>{await climaQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});

type Fault=(table:string,response:RespuestaPostgrest)=>RespuestaPostgrest;
interface Coverage { solicitados:number;usables:number;nulos_no_usables:number;sin_fila:number;calidad_desconocida:number }
interface Variable { promedio:number|null;min:number|null;max:number|null;cobertura:Coverage }
interface Row { fecha:string;station_id:string;valores:Record<string,number|null>;estados:Record<string,string>;lluvia_confianza:string;cobertura_temporal:string;contradicciones:string[] }
interface Result { tipo:'clima';estado:string;filas:Row[];resumen:Array<{station_id:string;variables:Record<string,Variable>;lluvia:Record<string,number|null>}> }
const base=()=>({desde:'2026-10-01',hasta:'2026-10-10',station_id:'QA-A',variables:['lluvia_total_mm','temp_c_avg','humedad_pct_avg','horas_sol_duracion','radiacion_wm2_avg','energia_kwh_m2']});
function climate(body:{resultados?:unknown[]}):Result {
  const r=body.resultados?.find(x=>typeof x==='object'&&x!==null&&'tipo' in x&&x.tipo==='clima');
  expect(r,'La operación debe responder clima histórico de forma sustantiva').toBeDefined();
  return r as Result;
}
async function execute(args:Record<string,unknown>=base(),fault?:Fault,user:string=USUARIOS.gerencia,now='2026-11-05T04:30:00Z') {
  const pregunta='Historia climática observada y cobertura por variable del período solicitado';
  const traza:Traza={consultas:[]};const projections:QaProjection[]=[];
  const argumentos={...args,parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:pregunta,capacidad:'clima',disposicion:'consultar'}]}};
  const h=dependencies(db,[{nombre:'consultar_clima',argumentos:JSON.stringify(argumentos)}],{modoCobertura:'obligatoria',ahora:()=>new Date(now),crearClienteUsuario:jwt=>qaFaultClient(db,jwt,traza,projections,fault)});
  const response=await manejar(request({pregunta},user),h.deps);
  return {...h,response,body:await response.json(),traza,projections};
}
function row(r:Result,date:string) { const found=r.filas.find(f=>f.fecha===date);expect(found).toBeDefined();return found!; }
function summary(r:Result) { const found=r.resumen.find(s=>s.station_id==='QA-A');expect(found).toBeDefined();return found!; }
const overlay=(r:RespuestaPostgrest,change:(row:Record<string,unknown>)=>void):RespuestaPostgrest=>({...r,data:r.data?.map(v=>{const n={...(v as Record<string,unknown>)};change(n);return n;})??null});

describe('P4-3 QA: real HTTP, mandatory coverage, independent daily SQL/JWT source',()=>{
  it('validates the frozen usable rainfall and sensor denominator oracle with independent SQL/RLS',async()=>{
    const actual=await db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:USUARIOS.gerencia,role:'authenticated'})]);
      await tx.exec('set local role authenticated');
      return tx.query(`select count(*)::int filas,count(temp_c_avg)::int temperaturas,avg(temp_c_avg)::float8 temp_promedio,count(humedad_pct_avg)::int humedades,avg(humedad_pct_avg)::float8 humedad_promedio,sum(lluvia_total_mm) filter(where lluvia_confianza in ('ok','reconstruido') and cobertura_hueco_max_min<=45)::float8 subtotal,sum(lluvia_total_mm) filter(where lluvia_confianza='cobertura_parcial')::float8 cota,count(*) filter(where lluvia_total_mm is not null and lluvia_confianza<>'contador_congelado')::int lluvia_usable from clima_resumen_diario where station_id='QA-A' and fecha between '2026-10-01' and '2026-10-10'`);
    });
    expect(actual.rows).toEqual([{filas:9,temperaturas:8,temp_promedio:45,humedades:7,humedad_promedio:450/7,subtotal:5,cota:5,lluvia_usable:5}]);
  });

  it('answers supported climate history through mandatory coverage and retains denominators per variable',async()=>{
    const h=await execute();expect(h.response.status).toBe(200);
    const r=climate(h.body);const s=summary(r);
    expect(s.lluvia).toMatchObject(CLIMA_ORACLE.lluvia);
    expect(s.variables.lluvia_total_mm.cobertura).toEqual(CLIMA_ORACLE.lluviaCobertura);
    expect(s.variables.temp_c_avg).toMatchObject(CLIMA_ORACLE.temperatura);
    expect(s.variables.humedad_pct_avg.cobertura).toEqual(CLIMA_ORACLE.humedad.cobertura);
    expect(s.variables.humedad_pct_avg.promedio).toBeCloseTo(CLIMA_ORACLE.humedad.promedio,8);
    expect(h.body.cobertura).toMatchObject({estado:'declarada_validada',partes:[{id:'s1',capacidad:'clima',disposicion:'respondida',resultado_ids:['p1']}]});
    expect(h.body.origen).toBe('determinista');expect(h.solicitudes).toHaveLength(1);
    expect(h.body.respuesta).toMatch(/observacion|observaci[oó]n/i);
    expect(h.body.respuesta).toMatch(/cobertura/i);
  });

  it('discards a frozen raw counter without replacing it from event rainfall',async()=>{
    const h=await execute({...base(),desde:'2026-10-02',hasta:'2026-10-02'});const f=row(climate(h.body),'2026-10-02');
    expect(f.lluvia_confianza).toBe('contador_congelado');expect(f.valores.lluvia_total_mm).toBeNull();expect(f.estados.lluvia_total_mm).toBe('no_usable');
    expect(summary(climate(h.body)).variables.lluvia_total_mm.cobertura).toMatchObject({usables:0,nulos_no_usables:1,sin_fila:0});
    expect(h.body.respuesta).not.toMatch(/90\s*mm|888\s*mm/);
  });

  it('treats a 2026-10-04 lower bound of 0 as sin dato, never a dry day (CLAUDE.md 122)',async()=>{
    const h=await execute({...base(),desde:'2026-10-04',hasta:'2026-10-04'});const r=climate(h.body);const f=row(r,'2026-10-04');
    expect(f.valores.lluvia_total_mm).toBeNull();expect(f.lluvia_confianza).toBe('cobertura_parcial');expect(f.estados.lluvia_total_mm).toBe('no_usable');
    expect(summary(r).lluvia).toMatchObject({cota_inferior_medida:null,dias_cota_inferior:0,dias_sin_dato:1});
    expect(h.body.respuesta).toMatch(/sin dato usable de lluvia: 2026-10-04/);expect(h.body.respuesta).not.toMatch(/d[ií]a seco|no llovi[oó]|sin lluvia\b/i);
  });

  it.each([['2026-10-03',5]])('keeps %s rainfall %s as a measured lower bound',async(date,value)=>{
    const h=await execute({...base(),desde:date,hasta:date});const r=climate(h.body);const f=row(r,date);
    expect(f.valores.lluvia_total_mm).toBe(value);expect(f.lluvia_confianza).toBe('cobertura_parcial');
    expect(summary(r).lluvia).toMatchObject({cota_inferior_medida:value,dias_cota_inferior:1,dias_completos:0});
    expect(h.body.respuesta).toMatch(/cota|al menos/i);expect(h.body.respuesta).not.toMatch(/d[ií]a seco|no llovi[oó]|sin lluvia/i);
  });

  it('preserves NULL partial rainfall even when its event accumulator contains a number',async()=>{
    const r=climate((await execute({...base(),desde:'2026-10-05',hasta:'2026-10-05'})).body);
    expect(row(r,'2026-10-05').valores.lluvia_total_mm).toBeNull();
    expect(summary(r).lluvia).toMatchObject({dias_cota_inferior:0,dias_sin_dato:1});
  });

  it('retains reconstructed provenance without redetecting a counter defect from adjacent days',async()=>{
    const r=climate((await execute()).body);const f=row(r,'2026-10-06');
    expect(f.lluvia_confianza).toBe('reconstruido');expect(f.valores.lluvia_total_mm).toBe(3);
    expect(f.estados.lluvia_total_mm).toBe('usable');
  });

  it('distinguishes an absent calendar day from a row whose sensor alone is NULL',async()=>{
    const r=climate((await execute()).body);const s=summary(r);const f=row(r,'2026-10-02');
    expect(f.valores.temp_c_avg).toBeNull();expect(f.valores.humedad_pct_avg).toBe(60);
    expect(s.variables.temp_c_avg.cobertura).toMatchObject({nulos_no_usables:1,sin_fila:1});
    expect(s.variables.humedad_pct_avg.cobertura).toMatchObject({nulos_no_usables:2,sin_fila:1});
    for(const v of Object.values(s.variables))expect(v.cobertura.usables+v.cobertura.nulos_no_usables+v.cobertura.sin_fila).toBe(10);
  });

  it('accepts 48 complete samples while 288 truncated samples do not prove temporal coverage',async()=>{
    const r=climate((await execute()).body);
    expect(row(r,'2026-10-01')).toMatchObject({cobertura_temporal:'completa',valores:{horas_sol_duracion:4}});
    expect(row(r,'2026-10-03')).toMatchObject({cobertura_temporal:'parcial',valores:{horas_sol_duracion:null}});
    expect(row(r,'2026-10-10')).toMatchObject({cobertura_temporal:'completa',valores:{horas_sol_duracion:0}});
  });

  it('keeps imported one-reading history with unknown gap as observations and does not declare it complete',async()=>{
    const r=climate((await execute()).body);const f=row(r,'2026-10-08');
    expect(f.cobertura_temporal).toBe('desconocida');expect(f.valores.temp_c_avg).toBe(60);
    expect(summary(r).variables.temp_c_avg.cobertura.calidad_desconocida).toBe(1);
    expect(f.valores.energia_kwh_m2).toBeNull();
  });

  it('retains contradictory duration and excludes it from usable sunshine hours',async()=>{
    const r=climate((await execute()).body);const f=row(r,'2026-10-09');
    expect(f.contradicciones).toContain('horas_sol_duracion_con_hueco_temporal');
    expect(f.valores.horas_sol_duracion).toBeNull();expect(f.estados.horas_sol_duracion).toBe('no_usable');
    expect(summary(r).variables.horas_sol_duracion.cobertura).toMatchObject({usables:4,nulos_no_usables:5,sin_fila:1});
  });

  it('keeps daily energy distinct from sunshine duration and withholds truncated daily energy',async()=>{
    const r=climate((await execute()).body);const f=row(r,'2026-10-01');
    expect(f.valores.energia_kwh_m2).toBe(2.4);expect(f.valores.horas_sol_duracion).toBe(4);
    expect(row(r,'2026-10-03').valores.radiacion_wm2_avg).toBe(200);
    expect(row(r,'2026-10-03').valores.energia_kwh_m2).toBeNull();
  });

  it('asks for a station when daily histories overlap instead of summing or preferring a station',async()=>{
    await db.exec("insert into clima_resumen_diario(fecha,station_id,temp_c_avg,lluvia_confianza,lecturas_count,cobertura_hueco_max_min) values('2026-10-01','QA-B',999,'ok',288,5)");
    const args:Record<string,unknown>={...base()};delete args.station_id;
    const h=await execute(args);const r=climate(h.body);
    expect(r.estado).not.toBe('ok');expect(r.resumen).toHaveLength(0);
    expect(h.body.respuesta).toMatch(/estaci[oó]n/i);
    const chosen=climate((await execute({...base(),desde:'2026-10-01',hasta:'2026-10-01'})).body);
    expect(row(chosen,'2026-10-01').valores.temp_c_avg).toBe(10);
  });

  it.each([['2026-11-05T04:59:59Z','2026-11-04',1],['2026-11-05T05:00:00Z','2026-11-05',2]])('cuts DATE history at injected Bogotá midnight %s',async(now,today,days)=>{
    await db.exec("insert into clima_resumen_diario(fecha,station_id,temp_c_avg,lluvia_confianza,lecturas_count,cobertura_hueco_max_min) values('2026-11-04','QA-A',11,'ok',48,30),('2026-11-05','QA-A',99,'ok',48,30)");
    const h=await execute({...base(),desde:'2026-11-04',hasta:'2026-11-05'},undefined,USUARIOS.gerencia,now);
    const r=climate(h.body);expect(h.body.hoy).toBe(today);
    expect(r.filas.every(f=>f.fecha<=today)).toBe(true);expect(summary(r).variables.temp_c_avg.cobertura.solicitados).toBe(days);
  });

  it.each(['temp_c_avg','lluvia_confianza','cobertura_hueco_max_min','station_id'])('treats an omitted required %s transport field as unread, never as SQL NULL',async(column)=>{
    const h=await execute(base(),(table,response)=>table!=='clima_resumen_diario'?response:overlay(response,r=>{delete r[column];}));
    const r=climate(h.body);expect(r.estado).not.toBe('ok');expect(r.resumen).toHaveLength(0);
  });

  it.each(['failed','truncated','duplicate','missing_count'])('fails closed for a %s daily transport without claiming verified empty',async(kind)=>{
    const h=await execute(base(),(table,response)=>{
      if(table!=='clima_resumen_diario')return response;
      if(kind==='failed')return {data:null,count:null,error:{message:'QA_PRIVATE_ERROR'}};
      if(kind==='truncated')return {...response,count:(response.count??0)+1};
      if(kind==='missing_count')return {...response,count:null};
      return {...response,data:[...(response.data??[]),response.data![0]],count:(response.count??0)+1};
    });
    const r=climate(h.body);expect(r.estado).not.toBe('ok');expect(r.resumen).toHaveLength(0);
    expect(h.body.respuesta).not.toContain('QA_PRIVATE_ERROR');
  });

  it('uses only the fixed daily projection, exact count and requesting JWT without raw/live/RPC fallback',async()=>{
    const h=await execute();expect(summary(climate(h.body)).variables.temp_c_avg.promedio).toBe(45);
    const ps=h.projections.filter(p=>p.tabla==='clima_resumen_diario');expect(ps.length).toBeGreaterThan(0);
    for(const p of ps){expect(p.columnas.split(',').sort()).toEqual([...CLIMA_COLUMNAS].sort());expect(p.count).toBe('exact');}
    expect(h.traza.consultas.every(q=>q.rol==='authenticated')).toBe(true);
    expect(h.traza.consultas.some(q=>q.tabla==='clima_lecturas')).toBe(false);
    expect(h.projections.every(p=>!p.columnas.includes('*'))).toBe(true);
  });

  it('refuses Administrator before planning or climate reads',async()=>{
    const h=await execute(base(),undefined,USUARIOS.administrador);expect(h.response.status).toBe(403);
    expect(h.solicitudes).toHaveLength(0);expect(h.traza.consultas.every(q=>q.tabla==='usuarios')).toBe(true);
  });

  it.each([{desde:'2026-02-30',hasta:'2026-10-10'},{desde:'2026-10-10',hasta:'2026-10-01'},{...base(),station_id:['QA-A']},{...base(),variables:['ph']},{...base(),tabla:'clima_lecturas'}])('rejects malformed or out-of-contract fixed-tool arguments %#',args=>{
    expect(()=>validarPlan([{nombre:'consultar_clima',argumentos:JSON.stringify(args)}])).toThrow();
  });
});
