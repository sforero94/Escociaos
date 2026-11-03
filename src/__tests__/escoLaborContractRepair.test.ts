import {expect,it} from 'vitest';
import {LABOR_PARAMETERS,normalizarArgumentosLabor,resolverLotesLabor,textoPartesLabor} from '../utils/escoContratoLabor';
import {ejecutarFuenteVerificada,type PuertoFuente} from '../utils/escoDispatcherVerificado';
import {ejecutarLlamadasVerificadas} from '../utils/escoTurnoVerificado';
import {componerRespuestaVerificada} from '../utils/escoRespuesta';

const now='2034-05-08T12:00:00.000Z';
const dates={date_from:'2034-05-01',date_to:'2034-05-07',reference_day:'2034-05-08'};
const lots=[{id:'lot-a',nombre:'Río Claro'},{id:'lot-b',nombre:'Monte Azul'}];
it.each([
 {q:'Consumo de la aplicación Luna de abril de 2034; jornales y costos por lote de mayo de 2034',include:'mayo',exclude:'abril'},
 {q:'Jornales y costo por lote de mayo de 2034; estado de la aplicación Luna de abril de 2034',include:'mayo',exclude:'abril'},
 {q:'Jornales por lote de mayo de 2034\nMuestra el estado de la aplicación Luna de abril de 2034',include:'mayo',exclude:'abril'},
 {q:'Estado de la aplicación Luna de abril de 2034 y muestra jornales por lote de mayo de 2034',include:'mayo',exclude:'abril'},
 {q:'Jornales por lote de mayo de 2034; y sus costos registrados',include:'sus costos',exclude:'aplicación'},
 {q:'Jornales por lote de mayo de 2034; compras de junio de 2034; y sus costos registrados',include:'mayo',exclude:'sus costos'},
 {q:'Jornales por lote de mayo de 2034; Ejemplo: compras de junio de 2034',include:'mayo',exclude:'junio'},
])('keeps only bounded labor clauses: $q',({q,include,exclude})=>{
 const text=textoPartesLabor(q);expect(text).toContain(include);expect(text).not.toContain(exclude);
});
it.each(['Jornales de la aplicación Luna de abril de 2034','Estado de la aplicación Luna de abril de 2034','Compras de mayo de 2034'])('does not borrow dates from another explicit operation: %s',q=>{
 expect(textoPartesLabor(q)).toBe('');
});
it.each(['¿Y sus costos registrados?','En ese período','Consulta de solo lectura: del 2034-05-01 al 2034-05-07'])('retains a domain-free followup for independent scope validation: %s',q=>{
 expect(textoPartesLabor(q)).toBe(q);
});
function fixture(question:string,catalog=lots){
 const queries:Array<{table:string;query:string}>=[];
 const rows=lots.map((lot,i)=>({id:'work-'+i,fecha_trabajo:'2034-05-03',lote_id:lot.id,lote:{nombre:lot.nombre},fraccion_jornal:'1',costo_jornal:i?'130':'70'}));
 const port:PuertoFuente={currentUserText:question,now:()=>now,read:async(table,query)=>{
  queries.push({table,query});const params=new URLSearchParams(query);
  const records=table==='lotes'?catalog:rows.filter(r=>!params.has('lote_id')||params.get('lote_id')==='eq.'+r.lote_id||params.get('lote_id')!.startsWith('in.')&&params.get('lote_id')!.includes(r.lote_id));
  const offset=Number(params.get('offset')??0),limit=Number(params.get('limit')??200);
  return {rows:records.slice(offset,offset+limit),total:records.length};
 }};
 return {port,queries};
}
it('offers only aggregate business selectors and excludes server-owned metadata',()=>{
 expect(Object.keys(LABOR_PARAMETERS.properties)).toEqual(['date_from','date_to','lote_name']);
 expect(LABOR_PARAMETERS.additionalProperties).toBe(false);
 expect(LABOR_PARAMETERS.required).toEqual(['date_from','date_to']);
 expect(normalizarArgumentosLabor(dates)).toEqual(dates);
});
it.each([undefined,null,'','  '])('normalizes absent optional lot %s without changing dates',lote_name=>{
 const args={...dates,...(lote_name===undefined?{}:{lote_name})};expect(normalizarArgumentosLabor(args)).toEqual(dates);
});
it.each([
 {employee_name:null},{employee_name:''},{worker_name:null},{finca_name:'Finca sintética'},
 {group_by:'lote'},{metric:'cost'},{lote_name:42},{lote_name:[]},
])('rejects unknown/personal or malformed proposal before any read: %j',async extra=>{
 const f=fixture('Jornales y costo por lote la semana pasada');
 await expect(ejecutarFuenteVerificada('get_labor_summary',{...dates,...extra},f.port)).rejects.toMatchObject({code:'invalid_arguments',stage:'arguments'});
 expect(f.queries).toEqual([]);
});
it.each(['por lote','por lote desglosados','por lote registrado','por cada lote','por lote, con total'])('does not confuse grouping %s with a named selector',async group=>{
 const f=fixture('Jornales y costos '+group+' la semana pasada');
 const result=await ejecutarFuenteVerificada('get_labor_summary',dates,f.port);
 const answer=componerRespuestaVerificada({...result!,turnStartedAt:now,modelText:'Invented prorated cost 100'});
 expect(answer.parts[0].state).toBe('answered');expect(answer.text).toContain('70 `COP`');expect(answer.text).toContain('130 `COP`');
 expect(answer.text).not.toContain('100');expect(f.queries.map(q=>q.table)).toEqual(['registros_trabajo']);
 expect(f.queries[0].query).not.toMatch(/empleado|salario|observaciones/);
});
it.each([
 {q:'Jornales y costos en el lote Río Claro la semana pasada',selector:undefined},
 {q:'Jornales y costos en el lote Río Claro la semana pasada',selector:'Río Claro'},
 {q:'Jornales y costos en el lote Río la semana pasada',selector:'Río'},
 {q:'Jornales y costos en el lote "RÍO" la semana pasada',selector:'rio'},
 {q:'Jornales y costos en el lote Río Claro la semana pasada',selector:null},
])('binds unique supported selector to canonical ID: $q / $selector',async({q,selector})=>{
 const f=fixture(q);const result=await ejecutarFuenteVerificada('get_labor_summary',{...dates,...(selector===undefined?{}:{lote_name:selector})},f.port);
 expect(result?.scopes).toHaveLength(1);expect(result?.scopes[0].entities[0].id).toBe('lot-a');
 expect(f.queries.map(q=>q.table)).toEqual(['lotes','registros_trabajo']);expect(f.queries[1].query).toContain('lote_id=eq.lot-a');
});
it.each([
 {q:'Jornales en el lote Río Claro',selector:'Monte Azul',code:'outside_scope'},
 {q:'Jornales por lote. Ejemplo: lote Río',selector:'Río',code:'outside_scope'},
 {q:'Jornales por lote sin el lote Río Claro',selector:'Río Claro',code:'scope_ambiguous'},
 {q:'Jornales por lote sin el lote Río Claro',selector:undefined,code:'scope_ambiguous'},
 {q:'Jornales en el lote Inexistente',selector:undefined,code:'scope_ambiguous'},
])('does not accept wrong, excluded or example-only selection: $q',async({q,selector,code})=>{
 const f=fixture(q);await expect(ejecutarFuenteVerificada('get_labor_summary',{...dates,...(selector===undefined?{}:{lote_name:selector})},f.port)).rejects.toMatchObject({code,stage:'scope'});
 expect(f.queries.every(q=>q.table==='lotes')).toBe(true);
});
it.each([
 {catalog:[{id:'a',nombre:'Río Claro'},{id:'b',nombre:'Río Claro'}]},
 {catalog:[{id:'a',nombre:'Río Claro'},{id:'b',nombre:'Río Norte'}]},
])('clarifies homonyms/ambiguous partials instead of selecting the model favorite',async({catalog})=>{
 const f=fixture('Jornales en el lote Río',catalog);
 await expect(ejecutarFuenteVerificada('get_labor_summary',{...dates,lote_name:'Río'},f.port)).rejects.toMatchObject({code:'scope_ambiguous'});
 expect(f.queries.map(q=>q.table)).toEqual(['lotes']);
});
it('keeps explicit multiple lots while rejecting a model-selected narrower subset',()=>{
 expect(resolverLotesLabor('Jornales en los lotes Río Claro y Monte Azul',undefined,lots)?.map(l=>l.id)).toEqual(['lot-a','lot-b']);
 expect(()=>resolverLotesLabor('Jornales en los lotes Río Claro y Monte Azul','Río Claro',lots)).toThrow('outside_scope');
});
it('does not turn a generic metric word into a partial lot selector',()=>{
 expect(()=>resolverLotesLabor('Jornales y costo por lote','costo',[{id:'a',nombre:'Costo Norte'}])).toThrow('scope_ambiguous');
});
it('uses typed argument failure for retry rather than claiming a source or period failure',async()=>{
 const f=fixture('Jornales por lote la semana pasada');
 const {reference_day,...publicDates}=dates;
 const result=await ejecutarLlamadasVerificadas({calls:[{function:{name:'get_labor_summary',arguments:JSON.stringify({...publicDates,finca_name:'No ofrecida'})}}],policy:{mode:'aggregate'},referenceDay:reference_day,turnStartedAt:now,port:f.port});
 expect(result?.retryable).toBe(true);expect(JSON.parse(result!.interactions[0].result_summary)).toMatchObject({error:'invalid_arguments',stage:'arguments'});expect(f.queries).toEqual([]);
});
