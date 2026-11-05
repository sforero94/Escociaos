// D37 independent integration: real handler, caller JWT, local SQL/RLS, no model/network.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll,beforeEach,afterAll,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { USUARIOS,type Traza } from './esco2ArnesRls.ts';
import { APPS,qaFaultClient,type QaProjection } from './esco2P3Task2QaHarness.ts';
import { T3 } from './esco2P3Task3QaHarness.ts';
import type { FiltroPostgrest,RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { task6QaDb,task6QaSeed,T6_ORACLE } from './esco2P3Task6QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await task6QaDb();},30000);
beforeEach(async()=>{await task6QaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
type Fila={producto_id:string;necesidad:number|null;stock:number|null;faltante:number|null;unidad:string|null;estado:string};
type Resultado={tipo:'faltantes_aplicacion';estado:string;fecha_consulta:string;filas:Fila[]};
const mutate=(r:RespuestaPostgrest,fn:(row:Record<string,unknown>)=>Record<string,unknown>)=>({...r,data:r.data?.map(x=>fn({...x as Record<string,unknown>}))??null});
async function run(args:Record<string,unknown>={},fault?:(t:string,r:RespuestaPostgrest)=>RespuestaPostgrest,user:string=USUARIOS.gerencia){
  const traza:Traza={consultas:[]};const projections:QaProjection[]=[];const ins:{tabla:string;col:string;n:number}[]=[];
  const h=dependencies(db,[{nombre:'consultar_faltantes_aplicacion',argumentos:JSON.stringify({aplicacion_ids:[T3.fertilizer,T3.liquid],...args})}],{crearClienteUsuario:jwt=>{
    const c=qaFaultClient(db,jwt,traza,projections,fault);
    return {...c,from(tabla){return {select(cols,opts){
      const q=c.from(tabla).select(cols,opts);
      const proxy:FiltroPostgrest=new Proxy(q,{get(target,key){
        const v=Reflect.get(target,key);
        if(key==='then')return v.bind(target);
        return typeof v!=='function'?v:(...params:unknown[])=>{
          if(key==='in')ins.push({tabla,col:String(params[0]),n:(params[1] as unknown[]).length});
          const result=Reflect.apply(v,target,params);return result===target?proxy:result;
        };
      }});
      return proxy;
    }};}};
  }});
  const response=await manejar(request({pregunta:'Faltantes vigentes de las aplicaciones sintéticas seleccionadas'},user),h.deps);const body=await response.json();
  return {...h,response,body,r:body.resultados?.find((x:{tipo:string})=>x.tipo==='faltantes_aplicacion') as Resultado,traza,projections,ins};
}
const p=(r:Resultado,id:string=T3.productP)=>r.filas.find(x=>x.producto_id===id)!;
describe('Task6 QA: D37 independent SQL/table oracles',()=>{
  it('proves literal17-8=9 and1.003-1=.003 in independent SQL without lot joins',async()=>{
    const q=await db.query<{id:string,need:number,short:number}>(`select pp.producto_id::text id,sum(pp.cantidad_total_necesaria)::float8 need,greatest(0,sum(pp.cantidad_total_necesaria)-max(p.cantidad_actual))::float8 short from aplicaciones_mezclas m join aplicaciones_productos pp on pp.mezcla_id=m.id join productos p on p.id=pp.producto_id where m.aplicacion_id=any($1::uuid[]) and m.id<>$2 group by pp.producto_id`,[[T3.fertilizer,T3.liquid],T3.hiddenMix]);
    expect(q.rows.find(x=>x.id===T3.productP)).toEqual({id:T3.productP,need:17,short:9});expect(q.rows.find(x=>x.id===T3.productQ)).toEqual({id:T3.productQ,need:1.003,short:0.003});
  });
  it('sums needs across mixes/apps first and subtracts stock once (no fanout, no ceil)',async()=>{
    const h=await run();expect(h.response.status).toBe(200);expect(h.r).toBeDefined();expect(p(h.r)).toMatchObject({necesidad:T6_ORACLE.needP,stock:8,faltante:T6_ORACLE.shortP,estado:'conocido'});expect(p(h.r,T3.productQ)).toMatchObject({necesidad:1.003,stock:1,faltante:0.003,estado:'conocido'});
    expect(h.r.fecha_consulta).toBe('2026-11-04');expect(h.body.respuesta).toContain('4 de noviembre de 2026');expect(h.body.respuesta).not.toMatch(/0,003000000|999/);expect(h.projections.some(x=>x.tabla==='aplicaciones_calculos'||x.tabla==='aplicaciones_lotes'||x.tabla==='aplicaciones_compras'||x.tabla.startsWith('movimientos_diarios'))).toBe(false);
  });
  it('positive control: selecting one application gives need10/stock8/short2',async()=>{
    expect(p((await run({aplicacion_ids:[T3.fertilizer]})).r)).toMatchObject({necesidad:10,stock:8,faltante:2});
  });
  it('ignores outdated compras and execution mutations instead of replacing current shortage',async()=>{
    await db.exec('update aplicaciones_compras set cantidad_faltante=12345,inventario_actual=12345;update movimientos_diarios_productos set cantidad_utilizada=100000');const h=await run();expect(p(h.r).faltante).toBe(9);expect(h.body.respuesta).not.toMatch(/12345|100000/);
  });
  it('does not include closed apps implicitly but supports an expressly selected closed app',async()=>{
    expect(p((await run()).r).necesidad).toBe(17);expect(p((await run({aplicacion_ids:[APPS.missingDate]})).r)).toMatchObject({necesidad:50,stock:8,faltante:42});
  });
  it.each(['null','unread','missing','unit'])('does not claim enough inventory with %s inventory',async state=>{
    if(state==='null')await db.query('update productos set cantidad_actual=null where id=$1',[T3.productP]);if(state==='missing')await db.query('delete from productos where id=$1',[T3.productP]);if(state==='unit')await db.query("update productos set unidad_medida='Litros' where id=$1",[T3.productP]);
    const h=await run({},state!=='unread'?undefined:(t,r)=>t!=='productos'?r:mutate(r,row=>{if(row.id===T3.productP)delete row.cantidad_actual;return row;}));expect(p(h.r).faltante).toBeNull();expect(p(h.r).estado).toBe({null:'sin_dato',unread:'no_leido',missing:'inventario_no_disponible',unit:'incompatible'}[state]);expect(h.body.respuesta).not.toMatch(/alcanza el inventario registrado hoy/i);
  });
  it('positive control: stock zero is known shortage17, never missing stock',async()=>{
    await db.query('update productos set cantidad_actual=0 where id=$1',[T3.productP]);expect(p((await run()).r)).toMatchObject({stock:0,faltante:17,estado:'conocido'});
  });
  it('does not mislabel incompatible stock liters as the plan kilograms',async()=>{
    await db.query("update productos set unidad_medida='Litros' where id=$1",[T3.productP]);const bad=await run();expect(p(bad.r).faltante).toBeNull();expect(bad.body.respuesta).not.toMatch(/stock\s+8\s*kg/i);
    await db.query("update productos set unidad_medida='Kilos' where id=$1",[T3.productP]);const good=await run();expect(p(good.r).faltante).toBe(9);expect(good.body.respuesta).toMatch(/stock\s+8\s*kg/i);
  });
  it('positive control: complete compatible stocks at/equal above need certify enough today',async()=>{
    await db.query('update productos set cantidad_actual=case when id=$1 then 17 else 2 end',[T3.productP]);const h=await run();expect(h.r.filas.every(x=>x.faltante===0)).toBe(true);expect(h.body.respuesta).toMatch(/alcanza el inventario registrado hoy/i);
  });
  it('does not call an empty or unread plan no shortage',async()=>{
    const noRead=await run({},(t,r)=>t==='aplicaciones_productos'?{data:null,error:{message:'synthetic unavailable'},count:null}:r);expect(noRead.body.respuesta).not.toMatch(/alcanza el inventario registrado hoy/i);
    await db.exec('delete from aplicaciones_productos');const empty=await run();expect(empty.body.respuesta).not.toMatch(/alcanza el inventario registrado hoy/i);expect(empty.r.estado).not.toBe('ok');
  });
  it('withholds missing need rather than replacing NULL with zero, but accepts explicit zero',async()=>{
    const missing=await run({},(t,r)=>t!=='aplicaciones_productos'?r:mutate(r,row=>{if(row.mezcla_id===T3.mix1&&row.producto_id===T3.productP)row.cantidad_total_necesaria=null;return row;}));expect(p(missing.r).faltante).toBeNull();
    await db.query('update aplicaciones_productos set cantidad_total_necesaria=0 where producto_id=$1',[T3.productP]);expect(p((await run()).r)).toMatchObject({necesidad:0,stock:8,faltante:0,estado:'conocido'});
  });
  it('cannot certify other product needs when a selected application has no products',async()=>{
    await db.query('delete from aplicaciones_productos where mezcla_id=$1',[T3.liquidMix]);const h=await run();expect(h.r.estado).not.toBe('ok');expect(h.r.filas.every(x=>x.faltante===null)).toBe(true);expect(h.body.respuesta).not.toMatch(/alcanza el inventario registrado hoy/i);
  });
  it('rejects duplicate inventory identities instead of counting the same stock twice',async()=>{
    const h=await run({},(t,r)=>t!=='productos'?r:{...r,data:[...(r.data??[]),...((r.data??[]).filter(x=>(x as Record<string,unknown>).id===T3.productP))],count:(r.count??0)+1});
    expect(h.r.filas.every(x=>x.faltante===null)).toBe(true);expect(h.body.respuesta).not.toMatch(/alcanza el inventario registrado hoy/i);
  });
  it('does not pool incompatible units for the same product across different mixes',async()=>{
    await db.query("update aplicaciones_productos set producto_unidad='Litros' where mezcla_id=$1 and producto_id=$2",[T3.mix2,T3.productP]);const h=await run();expect(p(h.r)).toMatchObject({estado:'incompatible',faltante:null});expect(p(h.r,T3.productQ).faltante).toBe(0.003);
  });
  it('rejects product children whose mix is not in the authorized parent scope',async()=>{
    const h=await run({},(t,r)=>t==='aplicaciones_productos'?{...r,data:[...(r.data??[]),{id:'96000000-0000-4000-8000-000000000099',mezcla_id:T3.hiddenParentMix,producto_id:T3.productP,producto_nombre:'NO PUBLICAR',producto_unidad:'Kilos',cantidad_total_necesaria:999}],count:(r.count??0)+1}:r);expect(h.r.filas.some(x=>x.necesidad===1016)).toBe(false);expect(h.body.respuesta).not.toContain('NO PUBLICAR');
  });
  it('does not authorize permissive product descendants of a hidden application',async()=>{
    const h=await run({aplicacion_ids:[APPS.hidden]});expect(h.r.estado).toMatch(/no_resuelto|no_disponible/);expect(h.body.respuesta).not.toContain('NO PUBLICAR');expect(h.projections.some(x=>x.tabla==='productos')).toBe(false);
  });
  it('keeps two products sharing one display name distinct by identity',async()=>{
    await db.exec("update productos set nombre='Duplicado'");const h=await run();expect(h.r.filas).toHaveLength(2);expect(p(h.r).faltante).toBe(9);expect(p(h.r,T3.productQ).faltante).toBe(0.003);expect(h.body.respuesta).toContain(T3.productP);expect(h.body.respuesta).toContain(T3.productQ);
  });
  it('batches101 mix parents into at most100 IDs each without losing legitimate needs',async()=>{
    await db.query('delete from aplicaciones_productos where mezcla_id=any($1::uuid[])',[[T3.mix1,T3.mix2]]);await db.query('delete from aplicaciones_mezclas where aplicacion_id=$1',[T3.fertilizer]);
    await db.query(`insert into aplicaciones_mezclas select ('98100000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,$1,g,'Sintética '||g from generate_series(1,101)g`,[T3.fertilizer]);
    await db.query(`insert into aplicaciones_productos(id,mezcla_id,producto_id,producto_nombre,producto_categoria,producto_unidad,cantidad_total_necesaria) select ('96100000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,('98100000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,$1,'Insumo P','Sintético','Kilos',1 from generate_series(1,101)g`,[T3.productP]);
    const h=await run({aplicacion_ids:[T3.fertilizer]});expect(p(h.r)).toMatchObject({necesidad:101,stock:8,faltante:93});const calls=h.ins.filter(x=>x.tabla==='aplicaciones_productos'&&x.col==='mezcla_id');expect(calls.length).toBeGreaterThanOrEqual(2);expect(calls.every(x=>x.n<=100)).toBe(true);
  });
  it('keeps named product output compact and uses fixed caller-JWT projections',async()=>{
    const h=await run();expect(h.body.respuesta).toContain('Insumo P');expect(h.body.respuesta).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);expect(h.body.respuesta.split('\n').length).toBeLessThan(20);expect(h.traza.consultas.every(x=>x.rol==='authenticated')).toBe(true);expect(h.projections.every(x=>!x.columnas.includes('*'))).toBe(true);
  });
  it('denies Administrador before inventory/model access',async()=>{
    const h=await run({},undefined,USUARIOS.administrador);expect(h.response.status).toBe(403);expect(h.solicitudes).toHaveLength(0);expect(h.projections.some(x=>x.tabla==='productos')).toBe(false);
  });
});
