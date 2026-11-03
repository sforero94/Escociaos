import {expect,it} from 'vitest';
import {ejecutarFuenteVerificada,type PuertoFuente} from '../utils/escoDispatcherVerificado';
import {componerRespuestaVerificada} from '../utils/escoRespuesta';
const now='2034-05-08T12:00:00.000Z';
const args={date_from:'2034-05-01',date_to:'2034-05-07',reference_day:'2034-05-08'};
function port(rows:Record<string,unknown>[],count:number|null=rows.length){
 const observed:Array<{table:string;query:string}>=[];
 const source:PuertoFuente={now:()=>now,read:async(table,query)=>{observed.push({table,query});const p=new URLSearchParams(query),o=Number(p.get('offset')),n=Number(p.get('limit'));return {rows:rows.slice(o,o+n),total:count};}};
 return {source,observed};
}
it('routes actual full paginated reads through adapters, proof registry and common composer',async()=>{
 const rows=Array.from({length:401},(_,i)=>({id:'r'+String(i).padStart(4,'0'),fecha_trabajo:'2034-05-03',lote_id:i===400?'lot-b':'lot-a',lote:{nombre:i===400?'Lote B':'Lote A'},fraccion_jornal:'1',costo_jornal:i===400?'210.75':'0.10',empleado:{nombre:'PERSONA_FICTICIA',salario:987654321},observaciones:'NOTA_PERSONAL_FICTICIA'}));
 const p=port(rows),r=await ejecutarFuenteVerificada('get_labor_summary',args,p.source);expect(r).not.toBeNull();
 const answer=componerRespuestaVerificada({...r!,turnStartedAt:now,modelText:'PERSONA_FICTICIA: prorrateo 145.50'});
 expect(p.observed).toHaveLength(3);expect(p.observed.every(x=>!x.query.includes('empleado')&&!x.query.includes('salario')&&!x.query.includes('observaciones'))).toBe(true);
 expect(answer.parts[0].state).toBe('answered');expect(answer.text).toContain('40');expect(answer.text).toContain('210.75');expect(JSON.stringify(r)).not.toMatch(/PERSONA_FICTICIA|987654321|NOTA_PERSONAL_FICTICIA/);
});
it.each([null,3])('does not attest missing or inconsistent count %s',async count=>{
 const p=port([{id:'a',fecha_trabajo:'2034-05-03',lote_id:'a',fraccion_jornal:'1',costo_jornal:'1'}],count);await expect(ejecutarFuenteVerificada('get_labor_summary',args,p.source)).rejects.toMatchObject({code:'incomplete_population',stage:'coverage'});
});
it('rejects duplicate IDs on later pages rather than losing or doubling their cost',async()=>{
 const rows=Array.from({length:201},(_,i)=>({id:i===200?'r0':'r'+i}));await expect(ejecutarFuenteVerificada('get_inventory_status',{},port(rows).source)).rejects.toThrow('source_error');
});
it('returns a useful verified zero for a named product search without relabeling all active products',async()=>{
 const p=port([{id:'p',nombre:'Producto Azul',activo:true,unidad_medida:'Kilos',cantidad_actual:1,stock_minimo:0}]);
 const r=await ejecutarFuenteVerificada('get_inventory_status',{product_name:'Producto rojo'},p.source);
 expect(r?.scopes[0].filters.nombre_contiene).toBe('Producto rojo');expect(r?.evidence[0].facts[0].value).toMatchObject({kind:'decimal',value:'0'});
 expect(componerRespuestaVerificada({...r!,turnStartedAt:now}).parts[0].state).toBe('partial');
});
it('does not manufacture complete empty membership from malformed product names',async()=>{
 const p=port([{id:'p',nombre:null,activo:true,unidad_medida:'Kilos',cantidad_actual:1,stock_minimo:0}]);await expect(ejecutarFuenteVerificada('get_inventory_status',{product_name:'Rojo'},p.source)).rejects.toThrow('scope_ambiguous');
});
it('keeps recorded date comparison within the same selected application',async()=>{
 const p=port([]);p.source.applications=async()=>({complete:true,rows:[{id:'app',nombre_aplicacion:'Aplicación sintética',estado:'Cerrada',fecha_inicio_ejecucion:'2034-05-02',fecha_fin_ejecucion:'2034-05-05',fecha_inicio_planeada:'2034-05-01',fecha_fin_planeada:'2034-05-05'}]});
 const r=await ejecutarFuenteVerificada('get_aplicaciones_ejecucion',{...args,metric:'date_comparison'},p.source);const a=componerRespuestaVerificada({...r!,turnStartedAt:now});expect(a.parts[0].state).toBe('answered');expect(a.text).toContain('Diferentes');expect(a.text).toContain('Iguales');
});
it('accepts exact planned empty zero without inventing physical absence',async()=>{
 const p=port([]);p.source.applications=async()=>({complete:true,rows:[]});const r=await ejecutarFuenteVerificada('get_aplicaciones_ejecucion',{...args,date_basis:'planned'},p.source);const a=componerRespuestaVerificada({...r!,turnStartedAt:now});expect(a.parts[0].state).toBe('answered');expect(a.text).toContain('0');expect(a.text).not.toContain('no hubo actividad');
});
it.each(['get_labor_summary','get_climate_data'])('rejects unbound location filters for %s before reading other locations',async tool=>{
 const p=port([]);await expect(ejecutarFuenteVerificada(tool,{...args,finca_name:'Ubicación sintética'},p.source)).rejects.toThrow(tool==='get_labor_summary'?'invalid_arguments':'outside_scope');expect(p.observed).toEqual([]);
});
