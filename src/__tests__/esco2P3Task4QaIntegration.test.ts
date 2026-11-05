// Independent D34 acceptance: real handler + fixed readers + synthetic SQL/RLS.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll,beforeEach,afterAll,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { USUARIOS,type Traza } from './esco2ArnesRls.ts';
import { APPS,qaFaultClient,type QaProjection } from './esco2P3Task2QaHarness.ts';
import { T3 } from './esco2P3Task3QaHarness.ts';
import type { FiltroPostgrest,RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { task4QaDb,task4QaSeed,T4_ORACLE } from './esco2P3Task4QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await task4QaDb();},30000);
beforeEach(async()=>{await task4QaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
type Bloque={total:number|null;estado:string;filas?:{producto_id:string;estado:string}[]};
type Resultado={tipo:'costos_aplicacion';estado:string;congelado?:Bloque;ejecucion?:Bloque;plan?:Bloque};
const mutate=(r:RespuestaPostgrest,fn:(row:Record<string,unknown>)=>Record<string,unknown>)=>({...r,data:r.data?.map(x=>fn({...x as Record<string,unknown>}))??null});
async function run(args:Record<string,unknown>={},fault?:(t:string,r:RespuestaPostgrest)=>RespuestaPostgrest,user:string=USUARIOS.gerencia){
  const traza:Traza={consultas:[]};const projections:QaProjection[]=[];const ins:{tabla:string;col:string;n:number}[]=[];
  const h=dependencies(db,[{nombre:'consultar_costos_aplicacion',argumentos:JSON.stringify({aplicacion_id:T3.fertilizer,...args})}],{crearClienteUsuario:jwt=>{
    const c=qaFaultClient(db,jwt,traza,projections,fault);return {...c,from(tabla){return {select(cols,opts){
      const q=c.from(tabla).select(cols,opts);const proxy:FiltroPostgrest=new Proxy(q,{get(target,key){
        const v=Reflect.get(target,key);if(key==='then')return v.bind(target);
        return typeof v!=='function'?v:(...params:unknown[])=>{if(key==='in')ins.push({tabla,col:String(params[0]),n:(params[1] as unknown[]).length});const result=Reflect.apply(v,target,params);return result===target?proxy:result;};
      }});return proxy;
    }};}};
  }});
  const response=await manejar(request({pregunta:'Costo de la aplicación sintética seleccionada'},user),h.deps);const body=await response.json();
  return {...h,response,body,r:body.resultados?.find((x:{tipo:string})=>x.tipo==='costos_aplicacion') as Resultado,traza,projections,ins};
}
async function open(){await db.query("update aplicaciones set estado='En ejecución' where id=$1",[T3.fertilizer]);}
describe('Task4 QA: independent D34 table oracles through handler/SQL-RLS',()=>{
  it('proves execution127/plan320 SQL oracles independently of calculation engines',async()=>{
    const execution=await db.query<{n:number}>(`select sum(mp.cantidad_utilizada*p.precio_unitario)::float8 n from movimientos_diarios m join movimientos_diarios_productos mp on mp.movimiento_diario_id=m.id join productos p on p.id=mp.producto_id where m.aplicacion_id=$1 and m.id<>'${T3.hiddenMovement}'`,[T3.fertilizer]);
    expect(execution.rows[0].n).toBe(T4_ORACLE.execution);
    const plan=await db.query<{n:number}>(`select sum(ap.cantidad_total_necesaria*p.precio_unitario)::float8 n from aplicaciones_mezclas m join aplicaciones_productos ap on ap.mezcla_id=m.id join productos p on p.id=ap.producto_id where m.aplicacion_id=$1 and m.id<>'${T3.hiddenMix}'`,[T3.fertilizer]);expect(plan.rows[0].n).toBe(T4_ORACLE.plan);
  });
  it('reads frozen200 and operative closure date without live price or valor_jornal substitution',async()=>{
    await db.exec('update productos set precio_unitario=999');const h=await run();expect(h.response.status).toBe(200);expect(h.r).toBeDefined();expect(h.r.congelado?.total).toBe(T4_ORACLE.frozen);
    expect(h.body.respuesta).toMatch(/costo congelado al cierre/i);expect(h.body.respuesta).toContain('2 de noviembre de 2026');expect(h.body.respuesta).toMatch(/calidad|mal capturad|origen/i);
    expect(h.projections.some(x=>x.tabla==='productos')).toBe(false);expect(h.projections.some(x=>x.columnas.includes('valor_jornal'))).toBe(false);
  });
  it.each(['absent','unread','duplicate'])('withholds frozen cost when closure is %s',async state=>{
    if(state==='absent')await db.query('delete from aplicaciones_cierre where aplicacion_id=$1',[T3.fertilizer]);
    const h=await run({},state==='absent'?undefined:(t,r)=>t!=='aplicaciones_cierre'?r:state==='unread'?{data:null,error:{message:'synthetic denied'},count:null}:{...r,data:[...(r.data??[]),{id:'94000000-0000-4000-8000-000000000009',aplicacion_id:T3.fertilizer,fecha_cierre:'2026-11-02'}],count:(r.count??0)+1});
    expect(h.r.congelado?.total).toBeNull();expect(h.body.respuesta).toMatch(/sin costo de cierre verificado|cierre.*no.*verific|no.*verific.*cierre/i);
  });
  it('does not turn a NULL frozen total into zero; explicit zero remains legitimate',async()=>{
    await db.query('update aplicaciones set costo_total=null where id=$1',[T3.fertilizer]);expect((await run()).r.congelado?.total).toBeNull();
    await db.query('update aplicaciones set costo_total=0,costo_total_insumos=0,costo_total_mano_obra=0 where id=$1',[T3.fertilizer]);expect((await run()).r.congelado?.total).toBe(0);
  });
  it('values execution127 without plan320 or fan-out, using today in Bogotá',async()=>{
    await open();const h=await run();expect(h.r.ejecucion?.total).toBe(127);expect(h.r.plan).toBeUndefined();expect(h.body.respuesta).toMatch(/a precio de hoy/i);expect(h.body.respuesta).toContain('4 de noviembre de 2026');expect(h.body.respuesta).not.toMatch(/costo hist[oó]rico:\s*127|447/);
  });
  it('positive control: an expressly requested plan320 stays separate from execution127',async()=>{
    await open();const h=await run({incluir_plan:true});expect(h.r.ejecucion?.total).toBe(127);expect(h.r.plan?.total).toBe(320);expect(h.body.respuesta).toMatch(/plan.*precio de hoy/i);expect(h.body.respuesta).not.toMatch(/447/);
  });
  it('does not overwrite frozen200 when a closed plan320 is explicitly requested',async()=>{
    const h=await run({incluir_plan:true});expect(h.r.congelado?.total).toBe(200);expect(h.r.plan?.total).toBe(320);expect(h.body.respuesta).not.toMatch(/520/);
  });
  it('does not combine frozen200 with a separate open application at current prices',async()=>{
    const h=dependencies(db,[T3.fertilizer,T3.liquid].map(aplicacion_id=>({nombre:'consultar_costos_aplicacion',argumentos:JSON.stringify({aplicacion_id})})));
    const response=await manejar(request({pregunta:'Compara costos de dos aplicaciones sintéticas'}),h.deps);const body=await response.json();const results=body.resultados as Resultado[];
    expect(results).toHaveLength(2);expect(results[0].congelado?.total).toBe(200);expect(results[1].ejecucion?.total).toBe(0.05);expect(body.respuesta).not.toMatch(/200[,.]05|200,05/);
  });
  it.each(['null','unread','missing','unit'])('prevents a complete execution total with %s price/inventory',async state=>{
    await open();if(state==='null')await db.query('update productos set precio_unitario=null where id=$1',[T3.productP]);if(state==='missing')await db.query('delete from productos where id=$1',[T3.productP]);if(state==='unit')await db.query("update productos set unidad_medida='Litros' where id=$1",[T3.productP]);
    const h=await run({},state!=='unread'?undefined:(t,r)=>t!=='productos'?r:mutate(r,row=>{if(row.id===T3.productP)delete row.precio_unitario;return row;}));expect(h.r.ejecucion?.total).toBeNull();expect(h.body.respuesta).toMatch(/no valorizable|sin precio|incompatib|no.*completo|incompleto/i);
  });
  it('positive control: explicit price0 is retained and a full subtotal22 is possible',async()=>{
    await open();await db.query('update productos set precio_unitario=0 where id=$1',[T3.productP]);const h=await run();expect(h.r.ejecucion?.total).toBe(22);expect(h.body.respuesta).toMatch(/precio.*cero|precio.*0|0.*precio/i);
  });
  it('filters only execution with inclusive movement dates (78), while plan stays320',async()=>{
    await open();const h=await run({desde:'2026-11-02',hasta:'2026-11-03',incluir_plan:true});expect(h.r.ejecucion?.total).toBe(T4_ORACLE.period);expect(h.r.plan?.total).toBe(320);
  });
  it('never calls empty products a verified zero actual cost',async()=>{
    await open();await db.query('delete from movimientos_diarios_productos where producto_id=any($1::uuid[])',[[T3.productP,T3.productQ]]);expect((await run()).r.ejecucion?.total).toBeNull();
  });
  it('does not certify complete monetary execution when one movement has no product rows',async()=>{
    await open();await db.exec("delete from movimientos_diarios_productos where movimiento_diario_id='f1000000-0000-4000-8000-000000000001'");const h=await run();expect(h.r.ejecucion?.total).toBeNull();
  });
  it('keeps a NULL frozen component incomplete even when a saved total exists',async()=>{
    await db.query('update aplicaciones set costo_total_mano_obra=null where id=$1',[T3.fertilizer]);const h=await run();expect(h.r.congelado?.total).toBeNull();expect(h.body.respuesta).not.toMatch(/mano de obra:\s*(?:\$\s*)?0/);
  });
  it('does not repair inconsistent frozen components into an exact total',async()=>{
    await db.query('update aplicaciones set costo_total_mano_obra=81 where id=$1',[T3.fertilizer]);const h=await run();expect(h.r.congelado?.total).toBeNull();expect(h.body.respuesta).toMatch(/discrepan|no concili|no coincide|no cuadran/i);
  });
  it('does not infer an open application from NULL/unread state',async()=>{
    await db.query('update aplicaciones set estado=null where id=$1',[T3.fertilizer]);const h=await run();expect(h.r.ejecucion?.total??null).toBeNull();expect(h.r.congelado?.total??null).toBeNull();
  });
  it('withholds frozen verification for a mismatched operative closure parent',async()=>{
    const h=await run({},(t,r)=>t!=='aplicaciones_cierre'?r:mutate(r,row=>({...row,aplicacion_id:APPS.unlinked})));expect(h.r.congelado?.total).toBeNull();
  });
  it('reads101 current product prices in blocks100 and preserves legitimate707 subtotal',async()=>{
    await open();await db.query('delete from movimientos_diarios_productos where producto_id=any($1::uuid[])',[[T3.productP,T3.productQ]]);
    await db.query("delete from movimientos_diarios where aplicacion_id=$1 and id<>'f1000000-0000-4000-8000-000000000001'",[T3.fertilizer]);
    await db.exec("insert into productos select ('a4000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'Producto sintético '||g,'Kilos',7,100 from generate_series(1,101)g");
    await db.exec("insert into movimientos_diarios_productos select ('d4000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'f1000000-0000-4000-8000-000000000001',('a4000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'Producto sintético '||g,'Sintético',1,'Kilos' from generate_series(1,101)g");
    const h=await run();expect(h.r.ejecucion?.total).toBe(707);const calls=h.ins.filter(x=>x.tabla==='productos'&&x.col==='id');expect(calls.length).toBeGreaterThanOrEqual(2);expect(calls.every(x=>x.n<=100)).toBe(true);
  });
  it('keeps hidden parent children out and uses fixed scoped reads',async()=>{
    const hidden=await run({aplicacion_id:APPS.hidden});expect(hidden.r.estado).toMatch(/no_resuelto|no_disponible/);expect(hidden.body.respuesta).not.toContain('NO PUBLICAR');
    await open();const good=await run();expect(good.r.ejecucion?.total).toBe(127);expect(good.projections.every(x=>!x.columnas.includes('*'))).toBe(true);expect(good.traza.consultas.every(x=>x.rol==='authenticated')).toBe(true);expect(good.projections.some(x=>x.tabla==='aplicaciones_compras')).toBe(false);
  });
  it('keeps first-name output compact with no UUID for unambiguous names',async()=>{
    await open();const h=await run();expect(h.body.respuesta).toContain('Fertilizante sintético');expect(h.body.respuesta).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);expect(h.body.respuesta.split('\n').length).toBeLessThan(20);
  });
  it('denies Administrador before model cost or reads',async()=>{
    const h=await run({},undefined,USUARIOS.administrador);expect(h.response.status).toBe(403);expect(h.solicitudes).toHaveLength(0);expect(h.projections.some(x=>x.tabla==='productos'||x.tabla==='aplicaciones_cierre')).toBe(false);
  });
});
