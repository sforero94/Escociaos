// Acceptance oracles fixed independently before D36 runtime existed.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, ID, request } from './esco2P2Harness.ts';
import { USUARIOS, type Traza } from './esco2ArnesRls.ts';
import { APPS, qaFaultClient, type QaProjection } from './esco2P3Task2QaHarness.ts';
import type { FiltroPostgrest, RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { task5QaDb, task5QaSeed, T5_ORACLE } from './esco2P3Task5QaHarness.ts';
let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task5QaDb(); }, 30000);
beforeEach(async () => { await task5QaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
type Total = { jornales: number | null; costo: number | null; costo_registrado: number | null; completo: boolean };
type Fila = { tarea_id: string | null; aplicaciones: {id:string}[]; estado: string; total: Total; compartida: boolean; lotes: {lote_id:string|null; total:Total}[] };
type Resultado = {tipo:'labor_aplicacion'; estado:string; filas:Fila[]; total:Total};
const mutate = (r:RespuestaPostgrest, fn:(row:Record<string,unknown>)=>Record<string,unknown>) => ({...r,data:r.data?.map(x=>fn({...x as Record<string,unknown>}))??null});
async function run(args:Record<string,unknown> = {}, fault?: (table:string,r:RespuestaPostgrest)=>RespuestaPostgrest, user:string=USUARIOS.gerencia) {
  const traza:Traza={consultas:[]}; const projections:QaProjection[]=[];const ins:{tabla:string;col:string;n:number}[]=[];
  const h=dependencies(db,[{nombre:'consultar_labor_aplicacion',argumentos:JSON.stringify({aplicacion_ids:[APPS.closed],...args})}],{crearClienteUsuario:jwt=>{
    const c=qaFaultClient(db,jwt,traza,projections,fault);
    return {...c,from(tabla){return {select(cols,opts){const q=c.from(tabla).select(cols,opts);const proxy:FiltroPostgrest=new Proxy(q,{get(target,key){
      const v=Reflect.get(target,key);if(key==='then')return v.bind(target);
      return typeof v!=='function'?v:(...params:unknown[])=>{if(key==='in')ins.push({tabla,col:String(params[0]),n:(params[1] as unknown[]).length});const result=Reflect.apply(v,target,params);return result===target?proxy:result;};
    }});return proxy;}};}};
  }});
  const response=await manejar(request({pregunta:'Labor registrada de la tarea vinculada a la aplicación sintética'},user),h.deps);
  const body=await response.json();
  const r=body.resultados?.find((x:{tipo:string})=>x.tipo==='labor_aplicacion') as Resultado;
  return {...h,response,body,r,traza,projections,ins};
}
describe('Task5 QA: real handler/readers/SQL-RLS, literal D36 oracles',()=>{
  it('proves its independent SQL oracle and the same-name task trap',async()=>{
    const q=await db.query<{j:number,c:number,n:number}>('select sum(fraccion_jornal::text::numeric)::float8 j,sum(costo_jornal)::float8 c,count(*)::int n from registros_trabajo where tarea_id=$1',[ID.t1]);
    expect(q.rows[0]).toEqual({j:1.75,c:60,n:3});
    const q2=await db.query<{n:number}>('select count(*)::int n from tareas where nombre=\'Labor igual\''); expect(q2.rows[0].n).toBe(2);
  });
  it('joins only IDs, keeps NULL cost and sin-lote, and does not sum same-name work',async()=>{
    const h=await run();expect(h.response.status).toBe(200);expect(h.r).toBeDefined();
    expect(h.r.total).toMatchObject({jornales:T5_ORACLE.jornales,costo:null,costo_registrado:T5_ORACLE.costo_registrado,completo:false});
    expect(h.r.filas[0].lotes.find(x=>x.lote_id===null)?.total.jornales).toBe(T5_ORACLE.sin_lote);
    expect(h.body.respuesta).toMatch(/sin lote/i);expect(h.body.respuesta).not.toMatch(/999/);
    expect(h.projections.some(x=>/movimientos_diarios_(trabajadores|empleados)/.test(x.tabla))).toBe(false);
    expect(h.projections.every(x=>!x.columnas.includes('*'))).toBe(true);expect(h.traza.consultas.every(x=>x.rol==='authenticated')).toBe(true);
  });
  it('positive control: explicit zero cost is complete and no NULL is fabricated',async()=>{
    await db.query('update registros_trabajo set costo_jornal=0 where id=$1',[ID.r2]);const h=await run();
    expect(h.r.total).toMatchObject({jornales:1.75,costo:60,completo:true});
  });
  it('positive control: replacing missing cost with 10 gives literal total70',async()=>{
    await db.query('update registros_trabajo set costo_jornal=10 where id=$1',[ID.r2]);expect((await run()).r.total.costo).toBe(T5_ORACLE.con_costo_completo);
  });
  it('counts a shared task once and labels the cost common, including a nonselected sibling',async()=>{
    const h=await run({aplicacion_ids:[APPS.closed,APPS.future]});expect(h.r.filas).toHaveLength(1);expect(h.r.total.jornales).toBe(1.75);
    expect(h.r.filas[0].compartida).toBe(true);expect(h.r.filas[0].aplicaciones.map(x=>x.id).sort()).toEqual([APPS.closed,APPS.future].sort());expect(h.body.respuesta).toMatch(/com[uú]n|compartid/i);
    expect((await run()).r.filas[0].compartida).toBe(true);
  });
  it('does not drop an application with no linked task or call it zero labor',async()=>{
    const h=await run({aplicacion_ids:[APPS.closed,APPS.unlinked]});const absent=h.r.filas.find(x=>x.aplicaciones.some(a=>a.id===APPS.unlinked));
    expect(absent).toMatchObject({estado:'sin_tarea_vinculada',total:{jornales:null,costo:null}});expect(h.body.respuesta).toMatch(/sin tarea vinculada/i);expect(h.r.total.completo).toBe(false);
  });
  it('distinguishes unread link from recorded NULL',async()=>{
    const h=await run({},(t,r)=>t!=='aplicaciones'?r:mutate(r,row=>{if(row.id===APPS.closed)delete row.tarea_id;return row;}));
    expect(h.r.filas[0].estado).toBe('vinculo_no_leido');expect(h.r.filas[0].total.jornales).toBeNull();
  });
  it('distinguishes hidden linked task from a valid task with verified empty work',async()=>{
    await db.query("insert into registros_trabajo values('d5000000-0000-4000-8000-000000000007',$1,null,'2026-11-01','1.0',999)",[ID.t3]);
    await db.query('update aplicaciones set tarea_id=$1 where id=$2',[ID.t3,APPS.closed]);const hidden=await run();expect(hidden.r.filas[0].estado).toBe('tarea_no_disponible');expect(hidden.r.total.jornales).toBeNull();
    await db.query('update aplicaciones set tarea_id=$1 where id=$2',[ID.t1,APPS.closed]);await db.query('delete from registros_trabajo where tarea_id=$1',[ID.t1]);const empty=await run();
    expect(empty.r.filas[0].estado).toBe('sin_jornales_registrados');expect(empty.r.filas[0].total.jornales).toBe(0);
  });
  it('does not treat a failed child read as verified empty work',async()=>{
    const h=await run({},(t,r)=>t==='registros_trabajo'?{data:null,error:{message:'synthetic denied'},count:null}:r);
    expect(h.r.filas[0].estado).toBe('registros_no_leidos');expect(h.r.total.jornales).toBeNull();
  });
  it('filters work by inclusive dates without changing frozen closure amounts',async()=>{
    const h=await run({desde:'2026-11-01',hasta:'2026-11-02'});expect(h.r.total).toMatchObject({jornales:0.75,costo:null,costo_registrado:20});
  });
  it('rejects injected child rows from a different parent instead of counting them',async()=>{
    const h=await run({},(t,r)=>t==='registros_trabajo'?{...r,data:[...(r.data??[]),{id:'d5000000-0000-4000-8000-000000000008',tarea_id:ID.t2,lote_id:ID.l1,fecha_trabajo:'2026-11-02',fraccion_jornal:1,costo_jornal:999}],count:(r.count??0)+1}:r);
    expect(h.r.total.jornales).not.toBe(2.75);expect(h.r.total.costo).not.toBe(1059);expect(h.body.respuesta).not.toMatch(/999/);
  });
  it('never authorizes permissive children when the selected application is hidden',async()=>{
    const h=await run({aplicacion_ids:[APPS.hidden]});expect(h.r.estado).toMatch(/no_resuelto|no_disponible/);expect(h.body.respuesta).not.toContain('NO PUBLICAR');
  });
  it('keeps names first and compact output when identities are unambiguous',async()=>{
    await db.query("update tareas set nombre='Tarea distinta' where id=$1",[ID.t2]);
    const h=await run();expect(h.body.respuesta).toContain('Primera aplicación');expect(h.body.respuesta).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);expect(h.body.respuesta.split('\n').length).toBeLessThan(20);
  });
  it('publishes no zero labor figures when the only selected app has no task',async()=>{
    const h=await run({aplicacion_ids:[APPS.unlinked]});expect(h.r.total).toMatchObject({jornales:null,costo:null,costo_registrado:null,completo:false});expect(h.body.respuesta).not.toMatch(/(?:0\s*jornales|COP\s*0|\$\s*0|0\s*COP)/i);
  });
  it('includes complete life-work even with future dated records instead of silent clipping',async()=>{
    await db.query("insert into registros_trabajo values('d5000000-0000-4000-8000-000000000010',$1,null,'2026-11-10','0.25',10)",[ID.t1]);const h=await run();
    expect(h.r.total.jornales).toBe(2);expect(h.r.total.costo_registrado).toBe(70);
  });
  it('reads101 legitimate lot parents in blocks100 without losing registered work',async()=>{
    await db.query('delete from registros_trabajo where tarea_id=$1',[ID.t1]);
    await db.exec("insert into lotes select ('a5000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'Lote sintético '||g,true,100,1 from generate_series(1,101)g");
    await db.query("insert into registros_trabajo select ('d5000000-0000-4000-8000-'||lpad((g+100)::text,12,'0'))::uuid,$1,('a5000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'2026-11-01','0.25',1 from generate_series(1,101)g",[ID.t1]);
    const h=await run();expect(h.r.total).toMatchObject({jornales:25.25,costo:101,completo:true});expect(h.r.filas[0].lotes).toHaveLength(101);
    const calls=h.ins.filter(x=>x.tabla==='lotes'&&x.col==='id');expect(calls.length).toBeGreaterThanOrEqual(2);expect(calls.every(x=>x.n<=100)).toBe(true);
  });
  it('keeps distinct same-name lots separate and displays their full IDs only on collision',async()=>{
    await db.query("update lotes set nombre='Duplicado' where id=any($1::uuid[])",[[ID.l1,ID.l2]]);const h=await run();
    expect(h.r.filas[0].lotes.filter(x=>x.lote_id!==null)).toHaveLength(2);expect(h.body.respuesta).toContain(ID.l1);expect(h.body.respuesta).toContain(ID.l2);
  });
  it('denies Administrador before any model or task data read',async()=>{
    const h=await run({},undefined,USUARIOS.administrador);expect(h.response.status).toBe(403);expect(h.solicitudes).toHaveLength(0);expect(h.traza.consultas.some(x=>x.tabla==='registros_trabajo')).toBe(false);
  });
});
