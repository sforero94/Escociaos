import {expect,it} from 'vitest';
import {ejecutarLlamadasVerificadas} from '../utils/escoTurnoVerificado';
import {crearPuertoNucleo} from '../utils/escoNucleoTransporte';
import {crearContextoNucleo} from '../utils/escoNucleoSolicitud';
const now=new Date('2034-05-08T12:00:00.000Z');
it.each(['Producto igual','A'.repeat(140)])('keeps canonical products distinguishable when displayed labels collide: %s',name=>run(name));
async function run(name:string){
 const ctx=crearContextoNucleo({question:'Compras por producto del 2034-05-01 al 2034-05-07',now});
 const rows=[{id:'purchase-a',producto_id:'product-a',producto:{nombre:name},fecha_compra:'2034-05-02',cantidad:'2',unidad:'Kilos',costo_total:'5',costo_unitario:'2.5'},{id:'purchase-b',producto_id:'product-b',producto:{nombre:name},fecha_compra:'2034-05-03',cantidad:'3',unidad:'Kilos',costo_total:'9',costo_unitario:'3'}];
 const port=crearPuertoNucleo(ctx,{now:()=>now.toISOString(),page:async()=>({rows,total:2})});
 const r=await ejecutarLlamadasVerificadas({calls:[{function:{name:'get_purchase_history',arguments:'{}'}}],policy:{mode:'aggregate'},port:{now:()=>now.toISOString(),read:async()=>{throw Error('Legacy not allowed');},selected:{context:ctx,port}},referenceDay:ctx.referenceDay,turnStartedAt:ctx.startedAt});
 expect(r?.text).toContain('product-a');expect(r?.text).toContain('product-b');expect(r?.text).toContain('5 `COP`');expect(r?.text).toContain('9 `COP`');expect(r?.text).toContain('14 `COP`');
}
it('also distinguishes inventory entities that are on facts rather than the global scope',async()=>{
 const {ejecutarFuenteVerificada}=await import('../utils/escoDispatcherVerificado');const {componerRespuestaVerificada}=await import('../utils/escoRespuesta');
 const source=await ejecutarFuenteVerificada('get_inventory_status',{}, {now:()=>now.toISOString(),currentUserText:'Inventario por producto',read:async()=>({rows:[{id:'product-a',nombre:'Duplicado',cantidad_actual:'2',stock_minimo:'1',unidad_medida:'Kilos',activo:true,categoria:'Fertilizante'},{id:'product-b',nombre:'Duplicado',cantidad_actual:'3',stock_minimo:'1',unidad_medida:'Kilos',activo:true,categoria:'Fertilizante'}],total:2})});
 expect(source?.scopes[0].entities).toEqual([]);const result=componerRespuestaVerificada({...source!,turnStartedAt:now.toISOString()});expect(result.text).toContain('product-a');expect(result.text).toContain('product-b');
});
