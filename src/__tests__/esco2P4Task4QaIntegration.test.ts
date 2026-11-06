// P4-4 independent QA. Literal expectations precede runtime; real HTTP -> SQL/JWT/RLS.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { USUARIOS,type Traza } from './esco2ArnesRls.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { qaFaultClient,type QaProjection } from './esco2P3Task2QaHarness.ts';
import { HATO_ORACLE,HATO_QA,hatoQaDb,hatoQaSeed } from './esco2P4Task4QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await hatoQaDb();},30000);
beforeEach(async()=>{await hatoQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
type Fault=(table:string,response:RespuestaPostgrest)=>RespuestaPostgrest;
interface Parent {estado:string;nombre?:string|null;numero?:number|null}
interface Derived {estado:string;fecha_secar:string|null;fecha_probable_parto:string|null;dias_abiertos:number|null;tiempo_prenez_dias:number|null;tiempo_secada_dias:number|null;senal_revision:{tipo:string;fecha:string}|null;vacia_es_problema:boolean|null}
interface Row {animal_id:string;nombre:string|null;numero:number|null;ficha:Record<string,unknown>&{parentescos:{madre:Parent;padre:Parent;padre_toro:Parent}};reproduccion:{estado:string;num_partos:number|null;derivado:Derived|null;categoria:string|null;categoria_origen:string|null;subetapa_ternera:string|null};estado:string}
interface Result {tipo:'hato';estado:string;fecha_referencia:string;filas:Row[]}
const base=()=>({animal_ids:[HATO_QA.main]});
const overlay=(r:RespuestaPostgrest,change:(row:Record<string,unknown>)=>void):RespuestaPostgrest=>({...r,data:r.data?.map(value=>{const row={...(value as Record<string,unknown>)};change(row);return row;})??null});
async function execute(args:Record<string,unknown>=base(),fault?:Fault,user:string=USUARIOS.gerencia,mandatory=false){
  const traza:Traza={consultas:[]};const projections:QaProjection[]=[];
  const pregunta=mandatory?'Ficha y estado reproductivo actual de QA Bebé':'Ficha y estado reproductivo actual de QA Lira';
  const parameters=mandatory?{...args,parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:pregunta,capacidad:'hato',disposicion:'consultar'}]}}:args;
  const h=dependencies(db,[{nombre:'consultar_hato',argumentos:JSON.stringify(parameters)}],{crearClienteUsuario:jwt=>qaFaultClient(db,jwt,traza,projections,fault),ahora:()=>new Date('2026-11-06T04:30:00Z')});
  if(mandatory)delete h.deps.modoCobertura;
  const response=await manejar(request({pregunta},user),h.deps);const body=await response.json();return {...h,response,body,traza,projections};
}
function result(body:{resultados?:unknown[]}):Result{
  const r=body.resultados?.find(x=>typeof x==='object'&&x!==null&&'tipo'in x&&x.tipo==='hato');expect(r,'P4-4 must answer a substantive herd result through the real HTTP handler').toBeDefined();return r as Result;
}
async function method(value:string|null){await db.query('update hato_eventos set datos=$1::jsonb where id=$2',[JSON.stringify(value===null?{}:{metodo:value}),HATO_QA.eventConfirmation]);}
async function addEvent(tipo:string,fecha:string){await db.query("insert into hato_eventos values('b4400000-0000-4000-8000-000000000099',$1,$2,$3,null,'2026-11-05T00:00:00Z',null,null)",[HATO_QA.main,tipo,fecha]);}
function expectUnavailable(row:Row){expect(row.nombre).toBe('QA Lira');expect(row.ficha).toBeDefined();expect(row.reproduccion.estado).toBe('no_disponible');expect(row.reproduccion.derivado).toBeNull();}

describe('P4-4 QA: identity, independent reproductive facts and requester visibility',()=>{
  it('checks the invented source under JWT/RLS, including a hidden mother and explicit view count',async()=>{
    const oracle=await db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:USUARIOS.gerencia,role:'authenticated'})]);await tx.exec('set local role authenticated');
      return tx.query<{nombre:string;numero:number;num_partos:number;madre:string|null}>(`select a.nombre,a.numero,v.num_partos,m.nombre madre from hato_animales a join v_hato_estado_actual v on v.animal_id=a.id left join hato_animales m on m.id=a.madre_id where a.id=$1`,[HATO_QA.main]);
    });expect(oracle.rows).toEqual([{nombre:'QA Lira',numero:601,num_partos:1,madre:null}]);
  });
  it('derives from complete view facts and synthetic live config, preserving probable dates and days with their meaning',async()=>{
    const h=await execute();const r=result(h.body);expect(r.fecha_referencia).toBe(HATO_ORACLE.today);expect(r.filas).toHaveLength(1);const row=r.filas[0];
    expect(row).toMatchObject({animal_id:HATO_QA.main,nombre:'QA Lira',numero:601,reproduccion:{estado:'ok',num_partos:1,categoria:'hato',derivado:HATO_ORACLE.confirmed}});
    expect(h.body.respuesta).toMatch(/probable|previst|estimad/i);expect(h.body.respuesta).not.toMatch(/1901|1902|apli(?:que|car)|se recomienda|dosis/i);expect(h.body.origen).toBe('determinista');expect(h.solicitudes).toHaveLength(1);
  });
  it('accepts a supported request with mandatory coverage under the real server default',async()=>{
    const h=await execute({animal_ids:[HATO_QA.calf]},undefined,USUARIOS.gerencia,true);const r=result(h.body);expect(h.response.status).toBe(200);expect(r.estado).toBe('ok');
    expect(r.filas[0]).toMatchObject({animal_id:HATO_QA.calf,reproduccion:{estado:'ok',num_partos:0,categoria:'ternera',subetapa_ternera:'leche',derivado:{estado:'cria'}}});
    expect(h.body.cobertura).toMatchObject({estado:'declarada_validada',partes:[{id:'s1',capacidad:'hato',disposicion:'respondida',resultado_ids:['p1']}]});
  });
  it.each([null,'presuncion'])('never upgrades confirmation method %s into veterinary palpation',async value=>{
    await method(value);const h=await execute();expect(result(h.body).filas[0].reproduccion.derivado).toMatchObject(HATO_ORACLE.presumed);expect(h.body.respuesta).not.toMatch(/palpada|confirmada por palpaci[oó]n/i);
  });
  it('preserves a later abortion as an open cow plus a separate review signal, removing stale probable dates',async()=>{
    await addEvent('aborto','2026-10-20');const h=await execute();expect(result(h.body).filas[0].reproduccion.derivado).toMatchObject(HATO_ORACLE.aborted);expect(h.body.respuesta).toMatch(/abort/i);
  });
  it('keeps an unclassified later event as indeterminate plus review, without claiming pregnancy',async()=>{
    await addEvent('celo','2026-10-20');expect(result((await execute()).body).filas[0].reproduccion.derivado).toMatchObject({estado:'indeterminado',fecha_secar:null,fecha_probable_parto:null,senal_revision:{tipo:'evento_posterior',fecha:'2026-10-20'}});
  });
  it.each([
    {kind:'parto',expected:'parida_reciente',category:'hato'},
    {kind:'secado_real',expected:'seca',category:'horro'},
    {kind:'confirmacion_prenez',expected:'preñada',category:'hato'},
  ])('resolves cycle ties by progress for $kind, despite a newer creation timestamp on the service',async({kind,expected,category})=>{
    await db.query("update hato_eventos set fecha='2026-10-20',created_at='2026-11-05T12:00:00Z' where id=$1",[HATO_QA.eventService]);
    if(kind==='confirmacion_prenez')await db.query("update hato_eventos set fecha='2026-10-20',created_at='2026-10-20T00:00:00Z' where id=$1",[HATO_QA.eventConfirmation]);
    else await addEvent(kind,'2026-10-20');
    const repro=result((await execute()).body).filas[0].reproduccion;expect(repro.derivado?.estado).toBe(expected);expect(repro.categoria).toBe(category);
  });
  it('reconciles effective stage and reproductive label instead of using raw manual stage',async()=>{
    const row=result((await execute({animal_ids:[HATO_QA.calf]})).body).filas[0];expect(row.reproduccion).toMatchObject({categoria:'ternera',categoria_origen:'calculado',subetapa_ternera:'leche',derivado:{estado:'cria'}});
  });
  it('honors explicit forced stage even when age would calculate a calf',async()=>{
    await db.query("update hato_animales set etapa_forzada=true,etapa='novilla' where id=$1",[HATO_QA.calf]);
    expect(result((await execute({animal_ids:[HATO_QA.calf]})).body).filas[0].reproduccion).toMatchObject({categoria:'novilla',categoria_origen:'override_manual',subetapa_ternera:null,derivado:{estado:'novilla'}});
  });
  it.each([{nombres:['QA Homónima']},{chapetas:[602]}])('clarifies duplicate exact selectors without preferring the active or most recent animal %#',async selector=>{
    const h=await execute(selector);const r=result(h.body);expect(r.estado).toMatch(/^(no_resuelto|aclaracion)$/);expect(r.filas).toEqual([]);expect(h.body.respuesta).toMatch(/precis|eleg|ambig|repetid/i);
  });
  it('selects an inactive animal by ID despite an active animal with the same name and chapeta',async()=>{
    const h=await execute({animal_ids:[HATO_QA.twinSold]});const r=result(h.body);expect(r.filas).toHaveLength(1);expect(r.filas[0]).toMatchObject({animal_id:HATO_QA.twinSold,numero:602,reproduccion:{estado:'ok',num_partos:0,categoria:null,derivado:{estado:'vendida',fecha_probable_parto:null}}});
  });
  it('resolves an exact animal name and a unique number without returning unasked animals',async()=>{
    for(const selector of [{nombres:['QA Lira']},{chapetas:[601]}]){const r=result((await execute(selector)).body);expect(r.filas.map(f=>f.animal_id)).toEqual([HATO_QA.main]);}
  });
  it('shows the provisional number as a working identifier, not a newly inferred identity',async()=>{
    const h=await execute({animal_ids:[HATO_QA.provisional]});expect(result(h.body).filas[0].animal_id).toBe(HATO_QA.provisional);expect(h.body.respuesta).toContain('QA Aura');expect(h.body.respuesta).toMatch(/provisional/i);
  });
  it('does not label a real Supata-style 5xxx number provisional',async()=>{
    await db.query('update hato_animales set numero=5181 where id=$1',[HATO_QA.provisional]);const h=await execute({animal_ids:[HATO_QA.provisional]});expect(result(h.body).filas[0].numero).toBe(5181);expect(h.body.respuesta).not.toMatch(/provisional/i);
  });
  it('renders a NULL chapeta as absent and retains the animal ID, never a fabricated zero',async()=>{
    const h=await execute({animal_ids:[HATO_QA.calf]});expect(result(h.body).filas[0].numero).toBeNull();expect(h.body.respuesta).toMatch(/sin (caravana|chapeta|n[uú]mero)|no registrad/i);
  });
  it('separates no parent link, a hidden parent and a visible parent without leaking hidden labels',async()=>{
    const h=await execute();const p=result(h.body).filas[0].ficha.parentescos;expect(p.madre.estado).toBe('no_legible');expect(p.padre.estado).toBe('sin_vinculo');expect(p.padre_toro).toMatchObject({estado:'visible',nombre:'QA Toro Norte'});expect(h.body.respuesta).not.toMatch(/NO PUBLICAR/);
  });
  it('resolves a self-table father by ID and not by its number or name',async()=>{
    const p=result((await execute({animal_ids:[HATO_QA.provisional]})).body).filas[0].ficha.parentescos.padre;expect(p).toMatchObject({estado:'visible',nombre:'QA Lira',numero:601});
  });
  it('preserves the animal and reproduction when its catalog bull father is hidden',async()=>{
    await db.query('update hato_animales set padre_toro_id=$1 where id=$2',[HATO_QA.hiddenBull,HATO_QA.main]);const h=await execute();const row=result(h.body).filas[0];expect(row.ficha.parentescos.padre_toro.estado).toBe('no_legible');expect(row.reproduccion.derivado).toMatchObject(HATO_ORACLE.confirmed);expect(h.body.respuesta).not.toContain('NO PUBLICAR');
  });
  it('does not publish a hidden animal through a visible view child overlay',async()=>{
    const h=await execute({animal_ids:[HATO_QA.hidden]},(t,r)=>t==='v_hato_estado_actual'?{...r,data:[...(r.data??[]),{animal_id:HATO_QA.hidden,num_partos:777}],count:(r.count??0)+1}:r);const r=result(h.body);expect(r.estado).not.toBe('ok');expect(r.filas).toEqual([]);expect(h.body.respuesta).not.toMatch(/NO PUBLICAR|777/);
  });
  it.each(['meses_gestacion_default','meses_secado_por_raza','meses_ternera_max'])('keeps a valid ficha but does not derive reproduction with missing config key %s',async key=>{
    await db.query('delete from hato_config where clave=$1',[key]);const row=result((await execute()).body).filas[0];expectUnavailable(row);expect(row.reproduccion.num_partos).toBe(1);
  });
  it.each([
    {key:'meses_gestacion_default',value:'10'},
    {key:'meses_secado_por_raza',value:['_default',1]},
    {key:'razas',value:[1]},
    {key:'meses_ternera_leche_max',value:'4'},
  ])('fails explicitly on mistyped configuration $key without inserting defaults',async({key,value})=>{
    await db.query('update hato_config set valor=$1::jsonb where clave=$2',[JSON.stringify(value),key]);expectUnavailable(result((await execute()).body).filas[0]);
  });
  it.each(['v_hato_estado_actual','hato_config'])('preserves the ficha when %s is unread, without inventing events or zero partos',async table=>{
    const h=await execute(base(),(t,r)=>t===table?{data:null,count:null,error:{message:'PRIVATE HATO TRANSPORT'}}:r);const row=result(h.body).filas[0];expectUnavailable(row);if(table==='v_hato_estado_actual')expect(row.reproduccion.num_partos).toBeNull();expect(h.body.respuesta).not.toContain('PRIVATE HATO TRANSPORT');
  });
  it('distinguishes a complete view with no selected row from an explicit zero-partos row',async()=>{
    const h=await execute(base(),(t,r)=>t==='v_hato_estado_actual'?{...r,data:r.data?.filter(x=>(x as Record<string,unknown>).animal_id!==HATO_QA.main)??null,count:(r.count??0)-1}:r);
    const missing=result(h.body).filas[0];expectUnavailable(missing);expect(missing.reproduccion.num_partos).toBeNull();
    expect(result((await execute({animal_ids:[HATO_QA.calf]})).body).filas[0].reproduccion.num_partos).toBe(0);
  });
  it.each([null,'missing',-1,1.5])('withholds derivation for incompatible num_partos %s instead of coercing to zero',async value=>{
    const h=await execute(base(),(t,r)=>t==='v_hato_estado_actual'?overlay(r,row=>{if(row.animal_id===HATO_QA.main){if(value==='missing')delete row.num_partos;else row.num_partos=value;}}):r);const row=result(h.body).filas[0];expectUnavailable(row);expect(row.reproduccion.num_partos).toBeNull();
  });
  it('preserves valid reproductive facts while marking an unread parent reference as unread',async()=>{
    const h=await execute(base(),(t,r)=>t==='hato_animales'?overlay(r,row=>{if(row.id===HATO_QA.main)delete row.madre_id;}):r);const row=result(h.body).filas[0];expect(row.ficha.parentescos.madre.estado).toBe('no_leido');expect(row.reproduccion.derivado).toMatchObject(HATO_ORACLE.confirmed);
  });
  it.each(['duplicate','truncated','required_missing'])('does not certify a %s reproductive-view transport',async mode=>{
    const h=await execute(base(),(t,r)=>{
      if(t!=='v_hato_estado_actual')return r;
      if(mode==='duplicate'&&r.data?.length)return {...r,data:[...r.data,r.data[0]],count:(r.count??0)+1};
      if(mode==='truncated')return {...r,count:(r.count??0)+1};
      return overlay(r,row=>{if(row.animal_id===HATO_QA.main)delete row.ultimo_servicio_fecha;});
    });expectUnavailable(result(h.body).filas[0]);
  });
  it('does not turn an unread ficha catalog into an empty verified herd',async()=>{
    const h=await execute(base(),(t,r)=>t==='hato_animales'?{data:null,count:null,error:{message:'PRIVATE FICHA ERROR'}}:r);const r=result(h.body);expect(r.estado).not.toMatch(/^(ok|vacio_verificado)$/);expect(r.filas).toEqual([]);
  });
  it('asks for an exact animal selector instead of reading out the whole herd',async()=>{
    const r=result((await execute({})).body);expect(r.estado).toBe('aclaracion');expect(r.filas).toEqual([]);
  });
  it('uses explicit contract projections under requester JWT and does not read notes, production, finance or legacy sources',async()=>{
    const h=await execute();expect(result(h.body).filas[0].reproduccion.derivado).toMatchObject(HATO_ORACLE.confirmed);
    expect(h.projections.every(p=>!p.columnas.includes('*'))).toBe(true);expect(h.traza.consultas.every(t=>t.rol==='authenticated')).toBe(true);
    const ficha=h.projections.filter(p=>p.tabla==='hato_animales');expect(ficha.length).toBeGreaterThan(0);
    expect(ficha.every(p=>p.columnas.split(',').sort().join(',')===['id','numero','nombre','sexo','etapa','raza','estado','fecha_estado','fecha_nacimiento','fecha_nacimiento_confianza','madre_id','padre_id','padre_toro_id','finca_id','origen','confianza','etapa_forzada'].sort().join(',')&&p.count==='exact')).toBe(true);
    expect(h.projections.filter(p=>p.tabla==='v_hato_estado_actual').every(p=>!/(^|,)(fecha_secar|fecha_probable_parto|pl|notas)(,|$)/.test(p.columnas))).toBe(true);
    expect(h.traza.consultas.some(t=>/^(hato_pesajes_leche|hato_produccion_quincenal|fin_|gan_)/.test(t.tabla))).toBe(false);expect(h.body.respuesta).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4000-8000-[0-9a-f]{12}/i);
  });
  it('retains Gerencia access control before model planning or herd reads',async()=>{
    const h=await execute(base(),undefined,USUARIOS.administrador);expect(h.response.status).toBe(403);expect(h.solicitudes).toHaveLength(0);expect(h.traza.consultas.every(t=>t.tabla==='usuarios')).toBe(true);
  });
});
