// Independent P4-5 HTTP/JWT/SQL oracles. No runtime calculation defines expected values.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { validarPlan } from '../utils/esco2/registro.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { USUARIOS,type Traza } from './esco2ArnesRls.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { qaFaultClient,type QaProjection } from './esco2P3Task2QaHarness.ts';
import { HATO_QA,MILK,MILK_ORACLE,milkQaDb,milkQaSeed } from './esco2P4Task5QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await milkQaDb();},30000);
beforeEach(async()=>{await milkQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
type Fault=(t:string,r:RespuestaPostgrest)=>RespuestaPostgrest;
interface Pesaje {animal_id:string;fecha:string;estado:string;litros_usable:number|null;litros_total:number|null;litros_am:number|null;litros_pm:number|null;fuente:string|null}
interface Pesos {tipo:'pesajes_leche';estado:string;filas:Pesaje[];resumen:Array<{animal_id:string;suma_muestras:number|null;promedio_dias_pesados:number|null;cobertura:Record<string,number>}>}
interface Quincena {id:string|null;anio:number;mes:number;quincena:number;fecha_inicio:string;fecha_fin:string;fecha_inicio_registrada:string|null;fecha_fin_registrada:string|null;abierta:boolean;origen_dato:string|null;litros:number|null;estado:string;vinculo_estado:string;num_vacas_ordeno:number|null}
interface Quincenas {tipo:'litros_quincenales';estado:string;filas:Quincena[];subtotales:{medido:{litros:number|null;quincenas:number};derivado_mensual:{litros:number|null;quincenas:number}};subtotales_abiertos:{medido:{litros:number|null;quincenas:number};derivado_mensual:{litros:number|null;quincenas:number}}}
const basePeso=()=>({desde:'2026-10-01',hasta:'2026-10-05',animal_ids:[HATO_QA.main]});
const baseQ=()=>({desde:'2026-01-01',hasta:'2026-02-28'});
const overlay=(r:RespuestaPostgrest,change:(row:Record<string,unknown>)=>void):RespuestaPostgrest=>({...r,data:r.data?.map(value=>{const row={...(value as Record<string,unknown>)};change(row);return row;})??null});
async function execute(type:'pesajes_leche'|'litros_quincenales',args:Record<string,unknown>,fault?:Fault,user:string=USUARIOS.gerencia) {
  const pregunta=type==='pesajes_leche'?'Pesajes registrados de leche y cobertura del animal solicitado':'Litros quincenales de leche separados por origen en el período solicitado';
  const traza:Traza={consultas:[]};const projections:QaProjection[]=[];
  const h=dependencies(db,[{nombre:'consultar_'+type,argumentos:JSON.stringify({...args,parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:pregunta,capacidad:type,disposicion:'consultar'}]}})}],{modoCobertura:'obligatoria',ahora:()=>new Date('2026-11-06T04:30:00Z'),crearClienteUsuario:jwt=>qaFaultClient(db,jwt,traza,projections,fault)});
  const response=await manejar(request({pregunta},user),h.deps);const body=await response.json();
  return {...h,response,body,traza,projections};
}
const pesos=(body:{resultados?:unknown[]}):Pesos=>{const r=body.resultados?.find(x=>typeof x==='object'&&x!==null&&'tipo'in x&&x.tipo==='pesajes_leche');expect(r,'Substantive pesajes_leche result through mandatory real HTTP').toBeDefined();return r as Pesos;};
const quincenas=(body:{resultados?:unknown[]}):Quincenas=>{const r=body.resultados?.find(x=>typeof x==='object'&&x!==null&&'tipo'in x&&x.tipo==='litros_quincenales');expect(r,'Substantive litros_quincenales result through mandatory real HTTP').toBeDefined();return r as Quincenas;};
const oneQ=(r:Quincenas,mes:number,quincena:number)=>{const f=r.filas.find(f=>f.mes===mes&&f.quincena===quincena);expect(f).toBeDefined();return f!;};

describe('P4-5 QA: sampled milk weights, origin-bound fortnight liters and visible parents',()=>{
  it('validates literal usable weights and origin-separated quincenas with independent SQL/JWT',async()=>{
    const actual=await db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:USUARIOS.gerencia,role:'authenticated'})]);await tx.exec('set local role authenticated');
      const p=await tx.query('select sum(litros_total)::float8 litros,count(*)::int pesajes from hato_pesajes_leche where animal_id=$1 and ((litros_am is null)=(litros_pm is null))',[HATO_QA.main]);
      const q=await tx.query("select q.origen_dato,sum(case when q.origen_dato='medido' then i.cantidad else q.litros_total end)::float8 litros,count(*)::int quincenas from hato_produccion_quincenal q left join fin_ingresos i on i.id=q.fin_ingreso_id where q.mes in(1,2) group by q.origen_dato order by q.origen_dato");
      return {pesos:p.rows,quincenas:q.rows};
    });
    expect(actual).toEqual({pesos:[{litros:20,pesajes:3}],quincenas:[{origen_dato:'derivado_mensual',litros:100,quincenas:2},{origen_dato:'medido',litros:100,quincenas:2}]});
  });

  it('passes the real mandatory-coverage positive HTTP path for an explicit complete animal/day weight',async()=>{
    const h=await execute('pesajes_leche',{...basePeso(),hasta:'2026-10-01'});const r=pesos(h.body);
    expect(h.response.status).toBe(200);expect(r.estado).toBe('ok');expect(r.filas[0]).toMatchObject({animal_id:HATO_QA.main,litros_usable:12,litros_am:5,litros_pm:7});
    expect(h.body.cobertura).toMatchObject({estado:'declarada_validada',partes:[{capacidad:'pesajes_leche',disposicion:'respondida',resultado_ids:['p1']}]});
    expect(h.body.origen).toBe('determinista');expect(h.solicitudes).toHaveLength(1);
  });

  it('sums only complete/historical measured samples and divides by sampled usable days, preserving missingness coverage',async()=>{
    const h=await execute('pesajes_leche',basePeso());const r=pesos(h.body);
    expect(r.resumen).toHaveLength(1);expect(r.resumen[0]).toMatchObject({animal_id:HATO_QA.main,suma_muestras:20,cobertura:MILK_ORACLE.pesajes.cobertura});
    expect(r.resumen[0].promedio_dias_pesados).toBeCloseTo(20/3,10);
    expect(h.body.respuesta).toMatch(/muestras|pesajes/i);expect(h.body.respuesta).not.toMatch(/(?:litros vendidos|producci[oó]n continua)\s*:/i);
  });

  it('keeps an explicit zero, an incomplete single turn and a historical total-only day distinct',async()=>{
    const r=pesos((await execute('pesajes_leche',basePeso())).body);
    expect(r.filas.find(f=>f.fecha==='2026-10-02')).toMatchObject({estado:'completo',litros_usable:0,litros_am:0,litros_pm:0,fuente:'qa-cero'});
    expect(r.filas.find(f=>f.fecha==='2026-10-03')).toMatchObject({estado:'turno_incompleto',litros_usable:null,litros_total:3,litros_am:3,litros_pm:null});
    expect(r.filas.find(f=>f.fecha==='2026-10-04')).toMatchObject({estado:'historico_total',litros_usable:8,litros_am:null,litros_pm:null});
  });

  it('returns no observed sample and a NULL sum for an animal/date with no row, without manufacturing zero turns',async()=>{
    const r=pesos((await execute('pesajes_leche',{...basePeso(),desde:'2026-10-05'})).body);
    expect(r.resumen[0]).toMatchObject({suma_muestras:null,promedio_dias_pesados:null,cobertura:{dias_solicitados:1,dias_con_pesaje:0,dias_sin_fila:1}});
    expect(r.filas).toHaveLength(0);
  });

  it('selects an inactive animal by its ID without joining a same-name/same-chapeta active animal',async()=>{
    const h=await execute('pesajes_leche',{desde:'2026-10-01',hasta:'2026-10-01',animal_ids:[HATO_QA.twinSold]});const r=pesos(h.body);
    expect(r.filas).toHaveLength(1);expect(r.filas[0]).toMatchObject({animal_id:HATO_QA.twinSold,litros_usable:32});
    expect(r.resumen[0].suma_muestras).toBe(32);expect(h.body.respuesta).not.toMatch(/40\s*L/);
  });

  it.each([{nombres:['QA Homónima']},{chapetas:[602]},{}])('asks for an explicit unambiguous animal instead of choosing an active animal or whole herd %#',async selector=>{
    const r=pesos((await execute('pesajes_leche',{desde:'2026-10-01',hasta:'2026-10-05',...selector})).body);
    expect(r.estado).toMatch(/aclaracion|no_resuelto/);expect(r.filas).toHaveLength(0);
  });

  it('does not publish a readable weight whose animal parent is hidden',async()=>{
    const h=await execute('pesajes_leche',{...basePeso(),animal_ids:[HATO_QA.hidden]});const r=pesos(h.body);
    expect(r.estado).not.toBe('ok');expect(r.filas.filter(f=>f.litros_usable!==null)).toHaveLength(0);
    expect(h.body.respuesta).not.toMatch(/NO PUBLICAR|999/);
  });

  it.each(['hato_animales','hato_pesajes_leche'])('does not turn an unread %s source into empty animal weights',async table=>{
    const h=await execute('pesajes_leche',basePeso(),(t,r)=>t===table?{data:null,count:null,error:{message:'QA_PRIVATE_FAILURE'}}:r);const r=pesos(h.body);
    expect(r.estado).toBe('no_disponible');expect(r.resumen.filter(s=>s.suma_muestras!==null)).toHaveLength(0);expect(h.body.respuesta).not.toContain('QA_PRIVATE_FAILURE');
  });

  it.each(['litros_total','litros_am','animal_id','fuente'])('treats omitted weight %s as unread rather than registered NULL or zero',async field=>{
    const r=pesos((await execute('pesajes_leche',basePeso(),(t,r)=>t!=='hato_pesajes_leche'?r:overlay(r,row=>{delete row[field];}))).body);
    expect(r.estado).not.toBe('ok');expect(r.resumen.filter(s=>s.suma_muestras!==null)).toHaveLength(0);
  });

  it.each(['transport_id','logical_animal_day','truncated'])('rejects %s duplication/incompleteness without averaging or summing a duplicate sample',async fault=>{
    const r=pesos((await execute('pesajes_leche',basePeso(),(t,r)=>{
      if(t!=='hato_pesajes_leche'||!r.data?.length)return r;
      if(fault==='truncated')return {...r,count:(r.count??0)+1};
      const duplicate={...(r.data[0] as Record<string,unknown>),...(fault==='logical_animal_day'?{id:'a5500000-0000-4000-8000-000000000099'}:{})};
      return {...r,data:[...r.data,duplicate],count:(r.count??0)+1};
    })).body);
    expect(r.estado).not.toBe('ok');expect(r.resumen.filter(s=>s.suma_muestras!==null)).toHaveLength(0);
  });

  it('passes mandatory HTTP coverage for measured and derived quincenas, keeping origins and linked units separate',async()=>{
    const h=await execute('litros_quincenales',baseQ());const r=quincenas(h.body);
    expect(r.estado).toBe('ok');expect(r.subtotales).toEqual(MILK_ORACLE.quincenas);expect(r.filas).toHaveLength(4);
    expect(oneQ(r,1,1)).toMatchObject({origen_dato:'medido',litros:100,vinculo_estado:'visible',num_vacas_ordeno:null});
    expect(oneQ(r,1,2)).toMatchObject({origen_dato:'medido',litros:0,vinculo_estado:'visible'});
    expect(oneQ(r,2,1)).toMatchObject({origen_dato:'derivado_mensual',litros:40});expect(oneQ(r,2,2)).toMatchObject({origen_dato:'derivado_mensual',litros:60});
    expect(h.body.cobertura).toMatchObject({estado:'declarada_validada',partes:[{capacidad:'litros_quincenales',disposicion:'respondida',resultado_ids:['p1']}]});
    expect(h.body.respuesta).toMatch(/medid/i);expect(h.body.respuesta).toMatch(/derivad/i);
    expect(h.body.respuesta).not.toMatch(/L\s*\/\s*vaca|litros por vaca\s*:|\$|NO PUBLICAR|99990/);
  });

  it('does not replace deliberate NULL local measured liters with a local fallback when its linked quantity is unread',async()=>{
    const h=await execute('litros_quincenales',{desde:'2026-01-01',hasta:'2026-01-15'},(t,r)=>t==='fin_ingresos'?{data:null,count:null,error:{message:'QA_PRIVATE_FIN_FAILURE'}}:t==='hato_produccion_quincenal'?overlay(r,row=>{if(row.id===MILK.q1)row.litros_total=9876;}):r);
    const r=quincenas(h.body);expect(oneQ(r,1,1)).toMatchObject({litros:null,vinculo_estado:'no_leido'});expect(r.subtotales.medido.litros).toBeNull();expect(h.body.respuesta).not.toMatch(/9876|QA_PRIVATE_FIN_FAILURE/);
  });

  it('distinguishes a hidden linked income from an explicitly NULL quantity without treating either as zero',async()=>{
    const r=quincenas((await execute('litros_quincenales',{desde:'2026-03-01',hasta:'2026-03-31'})).body);
    expect(oneQ(r,3,1)).toMatchObject({litros:null,vinculo_estado:'no_legible'});
    expect(oneQ(r,3,2)).toMatchObject({litros:null,vinculo_estado:'null_registrado'});expect(r.subtotales.medido.litros).toBeNull();
  });

  it('retains an absent income link separately from an invisible or failed income reader',async()=>{
    const r=quincenas((await execute('litros_quincenales',{desde:'2026-01-01',hasta:'2026-01-15'},(t,r)=>t!=='hato_produccion_quincenal'?r:overlay(r,row=>{if(row.id===MILK.q1)row.fin_ingreso_id=null;}))).body);
    expect(oneQ(r,1,1)).toMatchObject({litros:null,vinculo_estado:'sin_vinculo'});
  });

  it('keeps valid derived partitions usable when their optional income quantity reader fails',async()=>{
    const r=quincenas((await execute('litros_quincenales',baseQ(),(t,r)=>t==='fin_ingresos'?{data:null,count:null,error:{message:'QA_PRIVATE_FIN_FAILURE'}}:r)).body);
    expect(r.subtotales.derivado_mensual).toEqual({litros:100,quincenas:2});expect(r.subtotales.medido.litros).toBeNull();
    expect(oneQ(r,2,1).litros).toBe(40);expect(oneQ(r,2,2).litros).toBe(60);
  });

  it('does not duplicate an income into two measured quincenas when the unique measured-link invariant is contradicted',async()=>{
    const r=quincenas((await execute('litros_quincenales',{desde:'2026-01-01',hasta:'2026-01-31'},(t,r)=>t!=='hato_produccion_quincenal'?r:overlay(r,row=>{if(row.id===MILK.q2)row.fin_ingreso_id=MILK.i1;}))).body);
    expect(r.estado).not.toBe('ok');expect(r.subtotales.medido.litros).not.toBe(200);
  });

  it('keeps a missing requested quincena as no row rather than zero production',async()=>{
    const r=quincenas((await execute('litros_quincenales',{desde:'2026-04-01',hasta:'2026-04-15'})).body);
    expect(oneQ(r,4,1)).toMatchObject({estado:'sin_fila',litros:null,abierta:false});expect(r.subtotales.medido.litros).toBeNull();expect(r.subtotales.derivado_mensual.litros).toBeNull();
  });

  it('keeps an open aligned quincena observed value separate from closed totals without clipping its canonical future end',async()=>{
    const h=await execute('litros_quincenales',{desde:'2026-11-01',hasta:'2026-11-15'});const r=quincenas(h.body);const f=oneQ(r,11,1);
    expect(f).toMatchObject({fecha_inicio:'2026-11-01',fecha_fin:'2026-11-15',abierta:true,litros:11});
    expect(r.subtotales.medido.litros).toBeNull();expect(r.subtotales_abiertos.medido).toEqual({litros:11,quincenas:1});expect(h.body.respuesta).toMatch(/abiert|incomplet/i);
  });

  it('clarifies a partial fortnight request instead of returning outside-range periods or prorating liters',async()=>{
    const r=quincenas((await execute('litros_quincenales',{desde:'2026-01-10',hasta:'2026-01-20'})).body);
    expect(r.estado).toMatch(/aclaracion|no_soportada|no_resuelto/);expect(r.filas).toHaveLength(0);
  });

  it('retains contradictory stored fortnight dates as non-calculable, preserving canonical source identity',async()=>{
    await db.query("update hato_produccion_quincenal set fecha_inicio='2026-01-02' where id=$1",[MILK.q1]);
    const r=quincenas((await execute('litros_quincenales',{desde:'2026-01-01',hasta:'2026-01-15'})).body);
    expect(oneQ(r,1,1)).toMatchObject({fecha_inicio:'2026-01-01',fecha_inicio_registrada:'2026-01-02',estado:'no_calculable',litros:null});
  });

  it.each(['hato_produccion_quincenal','fin_ingresos'])('does not publish measured totals from an unread %s reader',async table=>{
    const r=quincenas((await execute('litros_quincenales',{desde:'2026-01-01',hasta:'2026-01-15'},(t,r)=>t===table?{data:null,count:null,error:{message:'QA_FAILURE'}}:r)).body);
    expect(r.estado).not.toBe('ok');expect(r.subtotales.medido.litros).toBeNull();
  });

  it.each([['hato_produccion_quincenal','origen_dato'],['hato_produccion_quincenal','fin_ingreso_id'],['fin_ingresos','cantidad']])('does not treat omitted %s.%s as a usable zero or local fallback',async(table,field)=>{
    const r=quincenas((await execute('litros_quincenales',{desde:'2026-01-01',hasta:'2026-01-15'},(t,r)=>t!==table?r:overlay(r,row=>{delete row[field];}))).body);
    expect(r.estado).not.toBe('ok');expect(r.subtotales.medido.litros).toBeNull();
  });

  it('selects only linked income IDs and quantity, never money/customer/payment data, with the requester JWT',async()=>{
    const h=await execute('litros_quincenales',baseQ());quincenas(h.body);
    const ps=h.projections.filter(p=>p.tabla==='fin_ingresos');expect(ps.length).toBeGreaterThan(0);
    for(const p of ps)expect(p.columnas.split(',').sort()).toEqual(['cantidad','id']);
    expect(h.projections.every(p=>!p.columnas.includes('*'))).toBe(true);expect(h.traza.consultas.every(q=>q.rol==='authenticated')).toBe(true);
    expect(h.body.respuesta).not.toMatch(/NO PUBLICAR|99990|99991|\$/);
  });

  it('denies Administrator before planning or either milk source is read',async()=>{
    const h=await execute('pesajes_leche',basePeso(),undefined,USUARIOS.administrador);expect(h.response.status).toBe(403);expect(h.solicitudes).toHaveLength(0);expect(h.traza.consultas.map(q=>q.tabla)).toEqual(['usuarios']);
  });

  it.each([{desde:'2026-01-01',hasta:'2026-01-31',metrica:'litros_por_vaca'},{desde:'2026-01-01',hasta:'2026-01-31',precio:true},{desde:'2026-01-01',hasta:'2026-01-31',tabla:'fin_ingresos'}])('rejects unsupported liters-per-cow, monetary or arbitrary-table arguments %#',args=>{
    expect(()=>validarPlan([{nombre:'consultar_litros_quincenales',argumentos:JSON.stringify(args)}])).toThrow();
  });
});
