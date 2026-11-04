// P2-v1 synthetic integration fixture. No P0/P1 fixture or private evaluation input.
import type { PGlite } from '@electric-sql/pglite';
import { vi } from 'vitest';
import { manejar, type Dependencias } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { ClienteLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import type { LlamadaHerramienta } from '../utils/esco2/registro.ts';
import { clienteRls, crearBaseRls, jwtSintetico, USUARIOS, type Traza } from './esco2ArnesRls.ts';

export const ID = {
  l1: 'a1000000-0000-4000-8000-000000000001', l2: 'a1000000-0000-4000-8000-000000000002', l3:'a1000000-0000-4000-8000-000000000003',
  ty: 'b1000000-0000-4000-8000-000000000001',
  t1: 'c1000000-0000-4000-8000-000000000001', t2:'c1000000-0000-4000-8000-000000000002', t3:'c1000000-0000-4000-8000-000000000003',
  a1:'e1000000-0000-4000-8000-000000000001', a2:'e1000000-0000-4000-8000-000000000002',
  r1:'d1000000-0000-4000-8000-000000000001', r2:'d1000000-0000-4000-8000-000000000002', r3:'d1000000-0000-4000-8000-000000000003', r4:'d1000000-0000-4000-8000-000000000004',
  other:'66666666-6666-4666-8666-666666666666',
} as const;

export async function p2Db(): Promise<PGlite> {
  const db = await crearBaseRls();
  await db.exec('alter table tareas add column if not exists lote_ids uuid[];');
  await p2Seed(db);
  return db;
}

export async function p2Seed(db:PGlite) {
  await db.exec('truncate aplicaciones,registros_trabajo,tareas,tipos_tareas,lotes;');
  await db.query(`insert into usuarios(id,rol,activo) values($1,'Gerencia',true) on conflict(id) do nothing`,[ID.other]);
  await db.query(`insert into lotes values($1,'Lote repetido',true,100,2),($2,'Lote repetido',true,200,4),($3,'Otro',true,400,8)`,[ID.l1,ID.l2,ID.l3]);
  await db.query(`insert into tipos_tareas values($1,'Labor','Mantenimiento del cultivo',true)`,[ID.ty]);
  await db.query(`insert into tareas(id,nombre,estado,tipo_tarea_id,jornales_estimados,fecha_estimada_inicio,fecha_estimada_fin,fecha_inicio_real,fecha_fin_real,lote_ids) values
    ($1,'Labor igual','Programada',$4,5,'2026-11-10','2026-11-11',null,null,ARRAY[$5]::uuid[]),
    ($2,'Labor igual','Completada',$4,null,'2026-11-11','2026-11-12','2026-10-26','2026-11-01',ARRAY[$6]::uuid[]),
    ($3,'Sin trabajo','Banco',$4,0,null,null,null,null,ARRAY[]::uuid[])`,[ID.t1,ID.t2,ID.t3,ID.ty,ID.l2,ID.l1]);
  await db.query(`insert into registros_trabajo values
    ($1,$5,$7,'2026-10-26','1.0',100),
    ($2,$6,$8,'2026-11-01','0.5',100),
    ($3,$5,null,'2026-11-01','0.25',0),
    ($4,$6,$9,'2026-11-01','0.75',50)`,[ID.r1,ID.r2,ID.r3,ID.r4,ID.t1,ID.t2,ID.l1,ID.l2,ID.l3]);
  await db.query(`insert into aplicaciones values($1,$3,'P2-A','Aplicación igual','Cerrada'),($2,$3,'P2-B','Aplicación igual','Abierta')`,[ID.a1,ID.a2,ID.t1]);
}

export function plan(extra:Record<string,unknown>={}) {
  return {proposito:'consulta',desde:'2026-10-26',hasta:'2026-11-01',agrupar_por:[],metricas:['jornales','costo'],...extra};
}
export const tool=(args:Record<string,unknown>):LlamadaHerramienta=>({nombre:'consultar_labores',argumentos:JSON.stringify(args)});
export function scripted(calls:LlamadaHerramienta[]) {
  const solicitudes:SolicitudLLM[]=[];
  const llm:ClienteLLM={async completar(s){
    solicitudes.push(s);
    if(!s.herramientas) throw new Error('P2_COMPOSER_MUST_NOT_RUN');
    return {texto:'',llamadas:structuredClone(calls),uso:{entrada:1,salida:1,razonamiento:0,costoUsd:0},ms:0,modelo:s.modelo,finishReason:'stop'};
  }};
  return {llm,solicitudes};
}
export function request(body:unknown, user:string=USUARIOS.gerencia, signature:'valida'|'falsa'='valida') {
  return new Request('http://local/esco-consultas',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${jwtSintetico(user,signature)}`},body:JSON.stringify(body)});
}
export function dependencies(db:PGlite,calls:LlamadaHerramienta[],over:Partial<Dependencias>={}) {
  const {llm,solicitudes}=scripted(calls);const traza:Traza={consultas:[]};
  const events:Record<string,unknown>[]=[];
  const env:Record<string,string>={OPENROUTER_API_KEY:'offline-placeholder',SUPABASE_URL:'http://local',SUPABASE_ANON_KEY:'offline-placeholder'};
  const deps:Dependencias={env:n=>env[n],crearClienteUsuario:jwt=>clienteRls(db,jwt,traza),crearLLM:()=>llm,ahora:()=>new Date('2026-11-05T04:30:00Z'),registrar:e=>events.push(e),...over};
  return {deps,solicitudes,traza,events};
}
export async function run(db:PGlite,args:Record<string,unknown>|Record<string,unknown>[],body:Record<string,unknown>={pregunta:'consulta'},over:Partial<Dependencias>={}) {
  const h=dependencies(db,(Array.isArray(args)?args:[args]).map(tool),over);
  const response=await manejar(request(body),h.deps);
  return {...h,response,body:await response.json()};
}
export function forbidNetwork(){vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('NETWORK_FORBIDDEN_P2');}));}

/** Deliberate unread-field overlay after real local SQL/RLS; SQL NULL is distinct. */
export function overlayClient(db:PGlite,jwt:string,mutate:(table:string,row:Record<string,unknown>)=>Record<string,unknown>) {
  const client=clienteRls(db,jwt);
  return {...client,from(table:string){return {select(...args:Parameters<ReturnType<typeof client.from>['select']>){
    const original=client.from(table).select(...args);
    const proxy=new Proxy(original,{get(target,key){
      if(key==='then')return (resolve:(r:unknown)=>unknown,reject:(e:unknown)=>unknown)=>target.then(r=>resolve({...r,data:r.data?.map(row=>mutate(table,{...(row as Record<string,unknown>)}))??null}),reject);
      const value=Reflect.get(target,key);return typeof value==='function'?(...params:unknown[])=>{const result=Reflect.apply(value,target,params);return result===target?proxy:result;}:value;
    }});return proxy;
  }}}};
}
