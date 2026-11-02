import {describe,it,expect} from 'vitest';
import {crearContextoNucleo} from '../utils/escoNucleoSolicitud';
import {crearPuertoNucleo} from '../utils/escoNucleoTransporte';
import {HERRAMIENTAS_NUCLEO} from '../utils/escoNucleoComun';
import {filtrarCatalogoNucleo,LIMITES_NUCLEO,NUCLEO_EJECUTABLE} from '../utils/escoNucleoCatalogo';
import {definicionEstadoRegistrado} from '../utils/escoProyeccionLegada';
const now=new Date('2034-05-08T12:00:00.000Z');
const ctx=(question='Movimientos del 2034-05-01 al 2034-05-07')=>crearContextoNucleo({question,now});
describe('selected catalogue and scope are server-bound',()=>{
 it('offers 24 bounded and four conditional tools, excludes exactly29 other operations',()=>{expect(NUCLEO_EJECUTABLE.size).toBe(28);expect(HERRAMIENTAS_NUCLEO).toHaveLength(11);expect(Object.keys(LIMITES_NUCLEO)).toHaveLength(29);expect(filtrarCatalogoNucleo([...Object.keys(LIMITES_NUCLEO),...HERRAMIENTAS_NUCLEO])).toEqual([...HERRAMIENTAS_NUCLEO]);});
 it.each(Object.keys(LIMITES_NUCLEO))('returns a fixed useful limit for %s without source reads',state=>{expect(definicionEstadoRegistrado({domain:'capability',state})).toBe(LIMITES_NUCLEO[state as keyof typeof LIMITES_NUCLEO]);expect(definicionEstadoRegistrado({domain:'capability',state,query:'SELECT'})).toBeNull();});
 it('uses actual user dates; preserves a one-sided bound and does not inherit assistant context',()=>{expect(ctx().period).toEqual({from:'2034-05-01',to:'2034-05-07'});expect(ctx('Compras desde 2034-05-01')).toMatchObject({dateState:'open',bounds:{from:'2034-05-01'},period:null});expect(ctx('Compras')).toMatchObject({dateState:'absent',period:null});});
 it.each(['Compras por producto','Compras sin proveedores','Despachos sin clientes','Compras sin mencionar proveedores','Compras, no muestres nombres de proveedores','Despachos, no quiero mostrar identidades de clientes'])('does not grant counterpart access for %s',question=>{expect(ctx(question).identities).toEqual({client:false,supplier:false});});
 it.each([['Compras por proveedor','supplier'],['Compras a Proveedor Nube','supplier'],['Despachos por cliente','client'],['Ventas a Cliente Nube','client']])('requires an actual request for counterpart access: %s',(question,key)=>{expect(ctx(question).identities[key as 'client'|'supplier']).toBe(true);});
 it('separates grouping identity from optional names',()=>{expect(ctx('Compras por proveedor, sin nombres')).toMatchObject({identities:{supplier:true},identityLabels:{supplier:false}});});
});
describe('closed minimal source port',()=>{
 it.each(['select=*','select=id,observaciones','select=id,empleado_id','select=id,proveedor','select=id,cliente_id','select=id&limit=10','select=id&offset=0'])('rejects unsafe aggregate projection %s before any read',async query=>{let calls=0;const port=crearPuertoNucleo(ctx(),{now:()=>now.toISOString(),page:async()=>{calls++;return {rows:[],total:0};}});await expect(port.read('compras',query)).rejects.toThrow('outside_scope');expect(calls).toBe(0);});
 it('does not read arbitrary tables or customer labels without purpose',async()=>{let calls=0;const p=crearPuertoNucleo(ctx(),{now:()=>now.toISOString(),page:async()=>{calls++;return {rows:[],total:0};}});await expect(p.read('empleados','select=id')).rejects.toThrow();await expect(p.read('clientes','select=id,nombre')).rejects.toThrow();expect(calls).toBe(0);});
 it('rejects a supplier label while allowing a requested nameless grouping ID',async()=>{const p=crearPuertoNucleo(ctx('Compras por proveedor sin nombres'),{now:()=>now.toISOString(),page:async()=>({rows:[],total:0})});await expect(p.read('compras','select=id,proveedor_id')).resolves.toMatchObject({total:0});await expect(p.read('compras','select=id,proveedor')).rejects.toThrow();});
 it('reads a third page and preserves a verified zero as a complete empty population',async()=>{for(const count of [0,401]){const offsets:number[]=[];const p=crearPuertoNucleo(ctx(),{now:()=>now.toISOString(),page:async(_t,q)=>{const offset=Number(new URLSearchParams(q).get('offset'));offsets.push(offset);return {rows:Array.from({length:Math.min(200,Math.max(0,count-offset))},(_,i)=>({id:'record-'+(offset+i)})),total:count};}});const result=await p.read('movimientos_inventario','select=id');expect(result.total).toBe(count);expect(offsets).toEqual(count?[0,200,400]:[0]);}});
 it.each(['duplicate','count','missing'] as const)('rejects %s coverage rather than silently making totals complete',async failure=>{let calls=0;const p=crearPuertoNucleo(ctx(),{now:()=>now.toISOString(),page:async()=>{calls++;return calls===1?{rows:Array.from({length:200},(_,i)=>({id:String(i)})),total:201}:{rows:[{id:failure==='duplicate'?'0':'200'}],total:failure==='count'?202:failure==='missing'?null:201};}});await expect(p.read('movimientos_inventario','select=id')).rejects.toThrow('source_error');});
});

it('restarts a fully explicit follow-up through fresh current-label binding, not old user identity',async()=>{
 const {ejecutarLlamadasVerificadas}=await import('../utils/escoTurnoVerificado');
 const question='¿Y compras del producto Azul del 2034-05-01 al 2034-05-07?';
 const context=crearContextoNucleo({question,now,previousUserText:'Compras del producto Rojo del 2034-04-01 al 2034-04-07',previousUserAt:'2034-05-08T11:59:00.000Z'});
 expect(context.referencePending).toBe(true);const reads:string[]=[];
 const port=crearPuertoNucleo(context,{now:()=>now.toISOString(),page:async(table)=>{reads.push(table);const rows=table==='productos'?[{id:'blue',nombre:'Azul'},{id:'red',nombre:'Rojo'}]:[{id:'purchase',producto_id:'blue',fecha_compra:'2034-05-03',cantidad:'2',unidad:'Kilos',costo_total:'9',costo_unitario:'4.5',producto:{nombre:'Azul'}}];return {rows,total:rows.length};}});
 const r=await ejecutarLlamadasVerificadas({calls:[{function:{name:'get_purchase_history',arguments:JSON.stringify({product_name:'Azul'})}}],policy:{mode:'aggregate'},referenceDay:context.referenceDay,turnStartedAt:context.startedAt,port:{currentUserText:question,now:()=>now.toISOString(),read:async()=>{throw Error('Legacy not allowed');},selected:{context,port}}});
 expect(reads).toEqual(['productos','compras']);expect(r?.text).toContain('9 `COP`');expect(r?.text).not.toContain('Rojo');expect(r?.parts.some(p=>p.state==='answered')).toBe(true);
});
it('does not treat current dates alone as a new identity in a contextual follow-up',async()=>{
 const {ejecutarLlamadasVerificadas}=await import('../utils/escoTurnoVerificado');const question='¿Y el promedio del 2034-05-01 al 2034-05-07?';
 const context=crearContextoNucleo({question,now,previousUserText:'Conductividad del lote Norte del 2034-05-01 al 2034-05-07',previousUserAt:'2034-05-08T11:59:00.000Z'});let calls=0;
 const port=crearPuertoNucleo(context,{now:()=>now.toISOString(),page:async()=>{calls++;return {rows:[],total:0};}});
 const r=await ejecutarLlamadasVerificadas({calls:[{function:{name:'get_conductivity_data',arguments:'{}'}}],policy:{mode:'aggregate'},referenceDay:context.referenceDay,turnStartedAt:context.startedAt,port:{now:()=>now.toISOString(),read:async()=>{throw Error();},selected:{context,port}}});
 expect(calls).toBe(0);expect(r?.text).toContain('Precisa');expect(r?.parts[0].state).toBe('unavailable');
});

it.each(['¿Y el promedio?','¿Cuánto cuestan esos productos?','¿Qué pasó en esos lotes?'])('does not treat an orphan reference as an all-history scope: %s',question=>{expect(ctx(question).referencePending).toBe(true);});
