// Independent synthetic arithmetic checks through the real context and paginated read port.
// No fetch, provider, credentials, or production source is used.
import {describe,it,expect} from 'vitest';
import {crearContextoNucleo} from '../utils/escoNucleoSolicitud';
import {crearPuertoNucleo} from '../utils/escoNucleoTransporte';
import {ejecutarNucleoComercio} from '../utils/escoNucleoComercio';
import {ejecutarLlamadasVerificadas} from '../utils/escoTurnoVerificado';
import {validarEvidencia,type Evidence,type Fact} from '../utils/escoEvidencia';
import type {ResultadoNucleo} from '../utils/escoNucleoComun';
const now=new Date('2034-05-08T12:00:00Z');
const SENTINEL='SYN_COMMERCE_INDEPENDENT_PRIVATE';
type Row=Record<string,unknown>;
const purchase=(id:string,overrides:Row={}):Row=>({id,producto_id:'p-a',fecha_compra:'2034-05-03',cantidad:'0.1',unidad:'Kilos',costo_total:'0.1',costo_unitario:'999',producto:{nombre:'Producto igual'},proveedor_id:'supplier-a',proveedor:SENTINEL,observaciones:SENTINEL,empleado_id:SENTINEL,...overrides});
const movement=(id:string,type:string,quantity:unknown,value:unknown,unit='Kilos'):Row=>({id,producto_id:'p-a',fecha_movimiento:'2034-05-03',tipo_movimiento:type,cantidad:quantity,unidad:unit,valor_movimiento:value,producto:{nombre:'Producto igual'},saldo_anterior:'900',saldo_nuevo:'999',observaciones:SENTINEL});
function setup(question:string,tables:Record<string,Row[]>,prior?:string){
 const ctx=crearContextoNucleo({question,now,...(prior?{previousUserText:prior,previousUserAt:'2034-04-08T12:00:00Z'}:{})});
 const calls:Array<{table:string;query:string}>=[];
 const port=crearPuertoNucleo(ctx,{now:()=>now.toISOString(),page:async(table,query)=>{
  calls.push({table,query});if(!Object.prototype.hasOwnProperty.call(tables,table))throw Error('Closed synthetic table');
  const p=new URLSearchParams(query);let rows=tables[table];
  for(const[k,v]of p){if(['select','order','limit','offset'].includes(k))continue;
   if(v.startsWith('gte.'))rows=rows.filter(r=>String(r[k])>=v.slice(4));
   else if(v.startsWith('lte.'))rows=rows.filter(r=>String(r[k])<=v.slice(4));
   else if(v.startsWith('in.')){const values=v.slice(4,-1).split(',').map(s=>JSON.parse(s));rows=rows.filter(r=>values.includes(r[k]));}
   else throw Error('Closed synthetic filter');
  }
  rows=[...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const total=rows.length,offset=Number(p.get('offset')??0);rows=rows.slice(offset,offset+Number(p.get('limit')??200));
  const select=p.get('select')!;expect(select).not.toMatch(/observaciones|factura|empleado|responsable/);
  const selected=rows.map(r=>Object.fromEntries(select.split(',').map(field=>field==='producto:productos(nombre)'?['producto',r.producto]:[field,r[field]])));
  return {rows:selected,total};
 }});return {ctx,port,calls};
}
const all=(r:ResultadoNucleo,metric:string)=>r.evidence.flatMap(e=>e.facts).filter(f=>f.metric===metric);
function scalar(f:Fact|undefined){return f?.value.kind==='decimal'?f.value.value:undefined;}
function base(r:ResultadoNucleo,metric:string){return all(r,metric).find(f=>f.scopeId==='purchases'||f.scopeId==='movements');}
function valid(r:ResultadoNucleo){expect(r.evidence.every(e=>validarEvidencia(e,r.scopes,r.populations))).toBe(true);expect(JSON.stringify(r)).not.toContain(SENTINEL);}

describe('independent commerce arithmetic, grouping and late pages',()=>{
 it('includes the third page in exact totals and partitions by canonical product/unit, not names',async()=>{
  const rows=Array.from({length:401},(_,i)=>purchase('p'+String(i).padStart(4,'0'),i===400?{cantidad:'210.75',costo_total:'210.75',proveedor_id:null}:{producto_id:i<200?'p-a':'p-b',unidad:i>=100&&i<200?'Litros':'Kilos',proveedor_id:i<200?'supplier-a':'supplier-b'}));
  const s=setup('Compras por proveedor sin nombres del 2034-05-01 al 2034-05-07.',{compras:rows});
  const r=await ejecutarNucleoComercio('get_purchase_history',{},s.ctx,s.port);valid(r);
  expect(s.calls.map(c=>new URLSearchParams(c.query).get('offset'))).toEqual(['0','200','400']);
  expect(scalar(base(r,'purchase.count'))).toBe('401');expect(scalar(base(r,'purchase.cost'))).toBe('250.75');
  const grouped=all(r,'purchase.quantity').filter(f=>f.assertion!=='record_value');
  expect(grouped.map(f=>[f.entities[0].id,scalar(f),f.value.kind==='decimal'?f.value.unit:null])).toEqual([['p-a','220.75','Kilos'],['p-a','10','Litros'],['p-b','20','Kilos']]);
  const suppliers=r.scopes.filter(s=>s.id.startsWith('purchases:supplier:'));
  expect(suppliers).toHaveLength(3);expect(suppliers.filter(s=>s.entities[0].kind==='supplier')).toHaveLength(2);
  expect(all(r,'purchase.date')).toHaveLength(30);
  expect(all(r,'purchase.cost').filter(f=>f.scopeId.startsWith('purchases:supplier:')).map(scalar)).toEqual(['20','20','210.75']);
 });
 it('keeps complete counts while all-null money is unknown and mixed money is an explicit exact subtotal',async()=>{
  for(const costs of [[null,null],[null,'0.10','0.20']]as const){
   const s=setup('Compras del 2034-05-01 al 2034-05-07.',{compras:costs.map((cost,i)=>purchase('p'+i,{costo_total:cost}))});
   const r=await ejecutarNucleoComercio('get_purchase_history',{},s.ctx,s.port);valid(r);
   expect(scalar(base(r,'purchase.count'))).toBe(String(costs.length));
   if(costs.length===2)expect(base(r,'purchase.cost')?.value.kind).toBe('unknown');
   else {expect(scalar(base(r,'purchase.cost'))).toBe('0.3');expect(base(r,'purchase.cost')?.assertion).toBe('verified_subtotal');}
  }
 });
 it('retains verified empty record/money zero without manufacturing a product quantity or unit',async()=>{
  const s=setup('Compras del 2034-05-01 al 2034-05-07.',{compras:[]});const r=await ejecutarNucleoComercio('get_purchase_history',{},s.ctx,s.port);valid(r);
  expect(scalar(base(r,'purchase.count'))).toBe('0');expect(scalar(base(r,'purchase.cost'))).toBe('0');expect(all(r,'purchase.quantity')).toEqual([]);
 });
 it('preserves a signed adjustment and independent net quantities per unit, without using balances as flows',async()=>{
  const rows=[movement('a','Entrada','10','100'),movement('b','Salida por Aplicación','3','30'),movement('c','Ajuste','-1','7'),movement('d','Entrada','2','5','Litros')];
  const s=setup('Movimientos registrados del 2034-05-01 al 2034-05-07.',{movimientos_inventario:rows});const r=await ejecutarNucleoComercio('get_inventory_movements',{},s.ctx,s.port);valid(r);
  expect(scalar(base(r,'movement.value'))).toBe('142');expect(scalar(base(r,'movement.count'))).toBe('4');
  expect(all(r,'movement.net').map(f=>[scalar(f),f.value.kind==='decimal'?f.value.unit:null])).toEqual([['6','Kilos'],['2','Litros']]);
  expect(all(r,'movement.balance_after')).toEqual([]);
 });
 it('does not let a previous product enlarge an explicitly different current product and period',async()=>{
  const s=setup('Y compras del producto Azul del 2034-05-01 al 2034-05-07.',{
   productos:[{id:'red',nombre:'Rojo'},{id:'blue',nombre:'Azul'}],compras:[purchase('a',{producto_id:'red',producto:{nombre:'Rojo'},costo_total:'1'}),purchase('b',{producto_id:'blue',producto:{nombre:'Azul'},costo_total:'100'})],
  },'Compras del producto Rojo del 2034-04-01 al 2034-04-07.');
  expect(s.ctx.referencePending).toBe(true);
  const r=await ejecutarLlamadasVerificadas({calls:[{function:{name:'get_purchase_history',arguments:JSON.stringify({product_name:'Azul'})}}],
   policy:{mode:'aggregate'},referenceDay:s.ctx.referenceDay,turnStartedAt:s.ctx.startedAt,
   port:{currentUserText:s.ctx.currentUserText,now:()=>now.toISOString(),read:async()=>{throw Error('Legacy source forbidden');},selected:{context:s.ctx,port:s.port}}});
  expect(r).not.toBeNull();
  const context=JSON.parse(r!.interactions[0].result_summary) as {state:string;evidence:Evidence};
  expect(context.state).toBe('validated');
  const totals=context.evidence.facts.filter(f=>f.scopeId.endsWith(':purchases'));
  expect(scalar(totals.find(f=>f.metric==='purchase.count'))).toBe('1');expect(scalar(totals.find(f=>f.metric==='purchase.cost'))).toBe('100');
  expect(new URLSearchParams(s.calls.find(c=>c.table==='compras')!.query).get('producto_id')).toBe('in.("blue")');
  expect(r!.text).toContain('Azul');expect(JSON.stringify(r)).not.toMatch(/Rojo|SYN_COMMERCE_INDEPENDENT_PRIVATE/);
  expect(s.ctx.referencePending).toBe(true); // Only the central fresh-catalog restart may resolve this reference.
 });
 it.each(['Movimientos no salidas del 2034-05-01 al 2034-05-07.','Movimientos no incluyas salidas del 2034-05-01 al 2034-05-07.'])('never treats an excluded type as the positive exit set: %s',async question=>{
  const s=setup(question,{movimientos_inventario:[movement('a','Entrada','10','100'),movement('b','Salida Otros','3','30'),movement('c','Ajuste','1','7')]});
  let r:ResultadoNucleo;
  try{r=await ejecutarNucleoComercio('get_inventory_movements',{},s.ctx,s.port);}catch(error){expect((error as Error).message).toBe('scope_ambiguous');expect(s.calls).toEqual([]);return;}
  valid(r);expect(scalar(base(r,'movement.count'))).toBe('2');expect(all(r,'movement.type').map(f=>f.value.kind==='status'?f.value.value:'unknown')).not.toContain('Salida Otros');expect(all(r,'movement.net').map(scalar)).toEqual(['11']);
 });
});
