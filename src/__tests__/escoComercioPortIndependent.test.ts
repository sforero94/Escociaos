import {describe,it,expect} from 'vitest';
import {crearContextoNucleo} from '../utils/escoNucleoSolicitud';
import {crearPuertoNucleo} from '../utils/escoNucleoTransporte';
import {ejecutarNucleoComercio} from '../utils/escoNucleoComercio';

const now=new Date('2034-05-08T12:00:00.000Z');
const source={id:'purchase-a',producto_id:'product-a',fecha_compra:'2034-05-03',cantidad:'2',unidad:'Kilos',costo_unitario:'7',costo_total:'14',producto:{nombre:'Producto Ficticio'},proveedor_id:'supplier-a',proveedor:'Proveedor Ficticio',numero_factura:'SECRET_INVOICE',observaciones:'SECRET_NOTE',empleado_id:'SECRET_PERSON'};
function setup(question:string,channel:'web'|'telegram'='web'){
 const ctx=crearContextoNucleo({question,now,channel});const calls:Array<{table:string;query:string}>=[];
 const port=crearPuertoNucleo(ctx,{now:()=>now.toISOString(),page:async(table,query)=>{
  calls.push({table,query});const select=new URLSearchParams(query).get('select')!;
  // Model PostgREST's selected-column boundary, rather than handing the adapter a raw row.
  const row:Record<string,unknown>={};for(const field of select.split(',')){if(field==='producto:productos(nombre)')row.producto=source.producto;else row[field]=source[field as keyof typeof source];}
  return {rows:[row],total:1};
 }});return {ctx,port,calls};
}
describe('independent commerce adapter through real request context and closed read port',()=>{
 it.each(['web','telegram'] as const)('keeps default aggregate purchases private on %s',async channel=>{
  const s=setup('Compras por producto',channel),r=await ejecutarNucleoComercio('get_purchase_history',{},s.ctx,s.port);
  expect(s.calls).toHaveLength(1);expect(s.calls[0].query).not.toMatch(/proveedor|factura|observaciones|empleado/);
  expect(JSON.stringify(r)).not.toMatch(/supplier-a|Proveedor Ficticio|SECRET_/);
  expect(r.evidence.flatMap(e=>e.facts).find(f=>f.metric==='purchase.cost')?.value).toMatchObject({value:'14'});
 });
 it.each(['web','telegram'] as const)('groups canonical suppliers without selecting labels on %s',async channel=>{
  const s=setup('Compras por proveedor sin nombres',channel),r=await ejecutarNucleoComercio('get_purchase_history',{},s.ctx,s.port);
  expect(s.ctx.identities.supplier).toBe(true);expect(s.ctx.identityLabels?.supplier).toBe(false);
  const select=new URLSearchParams(s.calls[0].query).get('select')!;expect(select.split(',')).toContain('proveedor_id');expect(select.split(',')).not.toContain('proveedor');
  expect(JSON.stringify(r)).toContain('supplier-a');expect(JSON.stringify(r)).not.toMatch(/Proveedor Ficticio|SECRET_/);
 });
 it('allows an explicitly requested supplier label, without unrelated private columns',async()=>{
  const s=setup('Compras del proveedor Proveedor Ficticio'),r=await ejecutarNucleoComercio('get_purchase_history',{proveedor:'Proveedor Ficticio'},s.ctx,s.port);
  expect(new URLSearchParams(s.calls[0].query).get('select')!.split(',')).toContain('proveedor');
  expect(JSON.stringify(r)).toContain('Proveedor Ficticio');expect(JSON.stringify(r)).not.toContain('SECRET_');
 });
 it('rejects a model-invented supplier filter before I/O',async()=>{
  const s=setup('Compras por producto');await expect(ejecutarNucleoComercio('get_purchase_history',{proveedor:'Proveedor Ficticio'},s.ctx,s.port)).rejects.toThrow('scope_ambiguous');expect(s.calls).toHaveLength(0);
 });
 it('filters an explicitly supplied name without selecting or retaining its label',async()=>{
  const s=setup('Compras del proveedor Proveedor Ficticio sin nombres'),r=await ejecutarNucleoComercio('get_purchase_history',{proveedor:'Proveedor Ficticio'},s.ctx,s.port);
  const params=new URLSearchParams(s.calls[0].query);expect(params.get('select')!.split(',')).not.toContain('proveedor');expect(params.get('proveedor')).toBe('ilike.*Proveedor Ficticio*');expect(JSON.stringify(r)).not.toMatch(/Proveedor Ficticio|SECRET_/);
 });
 it('port rejects hidden personal projections before backend access',async()=>{
  const s=setup('Compras por proveedor');for(const select of ['id,observaciones','id,empleado_id','id,numero_factura'])await expect(s.port.read('compras','select='+select)).rejects.toThrow('outside_scope');expect(s.calls).toHaveLength(0);
 });
});
