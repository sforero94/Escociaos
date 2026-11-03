import { describe, expect, it } from 'vitest';
import { ejecutarConsultaEsco, HERRAMIENTAS_CONSULTA, type ConsultaPagina } from '../utils/escoConsultas';
import { particionesMetricasAplicacion, evidenciaMetricaParticion } from '../utils/escoAplicacionMetricas';
import type { PopulationProof, Scope } from '../utils/escoEvidencia';
import { APPLICATION_METRICS, OperationFailure } from '../utils/escoOperacionContrato';
type Row=Record<string,unknown>;
function fixture():Record<string,Row[]>{return {
 aplicaciones:[
  {id:'inside',nombre_aplicacion:'Aplicación Alfa',estado:'En ejecución',fecha_inicio_ejecucion:'2034-05-02',fecha_inicio_planeada:'2034-04-01',fecha_fin_ejecucion:null,fecha_fin_planeada:'2034-04-09',tarea_id:'task-a'},
  {id:'activity',nombre_aplicacion:'Aplicación Beta',estado:'Cerrada',fecha_inicio_ejecucion:'2034-04-01',fecha_inicio_planeada:'2034-05-02',fecha_fin_ejecucion:'2034-05-03',fecha_fin_planeada:'2034-05-04',tarea_id:'task-b'},
  {id:'null-date',nombre_aplicacion:'Aplicación Gamma',estado:'Calculada',fecha_inicio_ejecucion:null,fecha_inicio_planeada:'2034-05-02',fecha_fin_ejecucion:null,fecha_fin_planeada:null,tarea_id:null},
 ], movimientos_diarios:['inside','activity','null-date'].map((app,i)=>({id:'move-'+i,aplicacion_id:app,lote_id:'lot',fecha_movimiento:'2034-05-03',numero_canecas:2})),
 movimientos_diarios_productos:[{id:'c',movimiento_diario_id:'move-0',producto_id:'p',producto_nombre:'Producto sintético',cantidad_utilizada:'2',unidad:'kg'}],
 productos:[{id:'p',nombre:'Producto sintético',unidad_medida:'kg',periodo_carencia_dias:3}],lotes:[{id:'lot',nombre:'Lote Alfa'}],
 aplicaciones_lotes:[],aplicaciones_calculos:[],aplicaciones_mezclas:[],aplicaciones_productos:[],registros_trabajo:[],
};}
function source(data=fixture()){
 const calls:Array<{table:string;query:string}>=[];
 const q:ConsultaPagina=async(table,query)=>{
  calls.push({table,query});expect(Object.prototype.hasOwnProperty.call(data,table)).toBe(true);
  const p=new URLSearchParams(query),cols=p.get('select')!.split(',');
  const rows=data[table].filter(row=>[...p].every(([key,value])=>['select','order','offset','limit'].includes(key)||value.startsWith('gte.')&&String(row[key])>=value.slice(4)||value.startsWith('lte.')&&String(row[key])<=value.slice(4)||value.startsWith('in.(')&&value.slice(4,-1).split(',').map(s=>s.replace(/^"|"$/g,'')).includes(String(row[key]))));
  return rows.slice(Number(p.get('offset')),Number(p.get('offset'))+Number(p.get('limit'))).map(row=>Object.fromEntries(cols.map(k=>[k,row[k]??null])));
 };return {q,calls};
}
describe('application reader metadata and population separation',()=>{
 it.each([undefined,...APPLICATION_METRICS,[...APPLICATION_METRICS],['quantity','labor']])('consumes presentation metadata without passing it as SQL filters: %j',async metric=>{
  const s=source(),args={application_id:'inside',metric,reference_day:'2034-05-08',type:'application'};
  const r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',args,s.q,'2034-05-08');
  expect((r.detalle as Row[]).map(a=>a.id)).toEqual(['inside']);expect(s.calls.some(c=>/metric|reference_day|type=/.test(c.query))).toBe(false);
  expect(args).toEqual({application_id:'inside',metric,reference_day:'2034-05-08',type:'application'});
 });
 it.each([[],['quantity','bogus'],'bogus',null,42])('rejects invalid metrics before source reads: %j',async metric=>{
  const s=source();await expect(ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric},s.q)).rejects.toMatchObject({code:'invalid_arguments',stage:'arguments'});expect(s.calls).toEqual([]);
 });
 it('retains genuine declared filters and refuses arbitrary SQL or unknown filters before source',async()=>{
  const s=source(),r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:['status','dates'],application_name:'Alfa',estado:'En ejecución',lote_name:'Lote Alfa'},s.q);
  expect((r.detalle as Row[]).map(a=>a.id)).toEqual(['inside']);
  const bad=source();await expect(ejecutarConsultaEsco('get_aplicaciones_ejecucion',{sql:'select *'},bad.q)).rejects.toBeInstanceOf(OperationFailure);expect(bad.calls).toEqual([]);
 });
 it('selects actual-start cohort independently of in-window activity and null starts',async()=>{
  const s=source(),r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:'quantity',date_from:'2034-05-01',date_to:'2034-05-07',date_basis:'actual'},s.q);
  expect((r.detalle as Row[]).map(a=>a.id)).toEqual(['inside']);
 });
 it('selects planned-start cohort without filling or changing observed actual dates',async()=>{
  const s=source(),r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:['dates','date_comparison'],date_from:'2034-05-01',date_to:'2034-05-07',date_basis:'planned'},s.q);
  const rows=r.detalle as Row[];expect(rows.map(a=>a.id)).toEqual(['activity','null-date']);expect(rows.find(a=>a.id==='null-date')!.fecha_inicio_ejecucion).toBeNull();
 });
 it('keeps null dates in an unbounded named record and does not invent activity zero',async()=>{
  const s=source(),r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{application_id:'null-date',metric:'dates'},s.q);
  expect((r.detalle as Row[])[0]).toMatchObject({id:'null-date',fecha_inicio_ejecucion:null,fecha_real_ausente:true});
 });
 it.each([{date_from:'2034-02-30'},{date_basis:'activity'},{estado:'Exitoso'},{detalle_offset:'1'},{alcance:'periodo'},{date_from:'2034-05-07',date_to:'2034-05-01'}])('types invalid arguments before source %j',async args=>{
  const s=source();await expect(ejecutarConsultaEsco('get_aplicaciones_ejecucion',args,s.q)).rejects.toMatchObject({code:'invalid_arguments',stage:'arguments'});expect(s.calls).toEqual([]);
 });
 it('advertises the same six closed metrics the reader accepts',()=>{
  const properties=HERRAMIENTAS_CONSULTA.find(t=>t.name==='get_aplicaciones_ejecucion')!.parameters.properties as Row;
  expect(properties.metric).toMatchObject({oneOf:[{enum:[...APPLICATION_METRICS]},{items:{enum:[...APPLICATION_METRICS]}}]});
 });
});

 it('keeps proven movement membership with null/outside actual starts in its own activity population',async()=>{
  const s=source(),r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:'quantity',selection_basis:'activity',date_from:'2034-05-01',date_to:'2034-05-07'},s.q);
  expect((r.detalle as Row[]).map(a=>a.id)).toEqual(['inside','activity','null-date']);
  expect((r.detalle as Row[]).find(a=>a.id==='null-date')!.membership).toMatchObject({selection_basis:'activity',movement_ids:['move-2']});
  expect(r.resumen).toMatchObject({selection_basis:'activity'});
 });
 it('includes labor-only activity without a movement or an actual start',async()=>{
  const data=fixture();data.aplicaciones.push({id:'labor',nombre_aplicacion:'Labor sin inicio',estado:'Calculada',fecha_inicio_ejecucion:null,tarea_id:'task-labor'});
  data.registros_trabajo=[{id:'work',tarea_id:'task-labor',lote_id:'lot',fecha_trabajo:'2034-05-03',fraccion_jornal:0.5,costo_jornal:40}];
  const s=source(data),r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{application_id:'labor',metric:'labor',selection_basis:'activity',date_from:'2034-05-01',date_to:'2034-05-07'},s.q);
  expect((r.detalle as Row[]).map(a=>a.id)).toEqual(['labor']);expect((r.detalle as Row[])[0].membership).toMatchObject({selection_basis:'activity',movement_ids:[],work_ids:['work']});
 });

 it('returns closed source error codes without disclosing an original provider exception',async()=>{
  const q:ConsultaPagina=async()=>{throw new Error('PRIVATE_SQL_BODY');};
  try{await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:'quantity'},q);throw Error('must reject');}
  catch(error){expect(error).toBeInstanceOf(OperationFailure);expect(error).toMatchObject({code:'source_error',stage:'source',message:'source_error'});expect(String(error)).not.toContain('PRIVATE_SQL_BODY');}
 });
 it('types the existing complete-read limit as a budget failure',async()=>{
  const q:ConsultaPagina=async()=>Array.from({length:200},(_,i)=>({id:String(i)}));
  await expect(ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:'quantity'},q)).rejects.toMatchObject({code:'budget_exceeded',stage:'budget'});
 });
 it('reads only fresh application metadata and catalogs for validated date parts',async()=>{
  const s=source(),r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:['status','dates'],date_from:'2034-05-01',date_to:'2034-05-07'},s.q,'2034-05-08',{pregunta:'¿Qué aplicaciones ejecutamos en mayo de 2034?',metricas:['status','dates']});
  expect(s.calls.map(c=>c.table).sort()).toEqual(['aplicaciones','lotes']);expect((r.detalle as Row[]).map(a=>a.id)).toEqual(['inside']);
  expect((r.detalle as Row[])[0]).not.toHaveProperty('movimientos');expect((r.detalle as Row[])[0]).not.toHaveProperty('hechos_ejecucion');expect(r.resumen).toMatchObject({metadata_only:true,selection_basis:'start'});
 });
 it('preserves dates independently when a separately requested quantity source fails',async()=>{
  const base=source(),calls:string[]=[];const q:ConsultaPagina=async(table,query)=>{calls.push(table);if(table==='movimientos_diarios_productos')throw Error('PRIVATE_CONSUMPTION_FAILURE');return base.q(table,query);};
  const solicitud={pregunta:'Dame las fechas de la aplicación Alfa',metricas:['dates'] as const};
  const dates=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{application_id:'inside',metric:'dates'},q,'2034-05-08',solicitud);
  expect(calls).toEqual(['aplicaciones','lotes']);expect((dates.detalle as Row[])[0]).toMatchObject({id:'inside',fecha_inicio_ejecucion:'2034-05-02'});
  await expect(ejecutarConsultaEsco('get_aplicaciones_ejecucion',{application_id:'inside',metric:'quantity',selection_basis:'activity'},q,'2034-05-08',{...solicitud,metricas:['quantity']})).rejects.toMatchObject({code:'source_error',stage:'source'});
  expect((dates.detalle as Row[])[0].fecha_inicio_ejecucion).toBe('2034-05-02');expect(JSON.stringify(dates)).not.toContain('PRIVATE_CONSUMPTION_FAILURE');
 });

 it('preserves a typed incomplete-coverage failure independently of HTTP source failures',async()=>{
  const q:ConsultaPagina=async()=>{throw new OperationFailure('incomplete_population','coverage');};
  await expect(ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:'dates'},q)).rejects.toMatchObject({code:'incomplete_population',stage:'coverage',message:'incomplete_population'});
 });
 it('reads labor from task records despite unavailable product and consumption sources',async()=>{
  const data=fixture();data.registros_trabajo=[{id:'work-a',tarea_id:'task-a',lote_id:'lot',fecha_trabajo:'2034-05-03',fraccion_jornal:'0.5',costo_jornal:'90'}];
  const base=source(data),calls:string[]=[];const q:ConsultaPagina=async(table,query)=>{calls.push(table);expect(query).not.toMatch(/empleado|contratista|salario|remuneracion|observaciones/);if(['productos','movimientos_diarios','movimientos_diarios_productos'].includes(table))throw Error('UNAVAILABLE_UNRELATED_SOURCE');return base.q(table,query);};
  const r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:'labor',selection_basis:'activity',date_from:'2034-05-01',date_to:'2034-05-07'},q,'2034-05-08',{pregunta:'Jornales de la aplicación Alfa en mayo de 2034',metricas:['labor']});
  expect(calls.sort()).toEqual(['aplicaciones','lotes','registros_trabajo']);expect((r.detalle as Row[]).map(a=>a.id)).toEqual(['inside']);
  const a=(r.detalle as Row[])[0];expect(a).not.toHaveProperty('movimientos');expect(a.hechos_ejecucion).not.toHaveProperty('consumos');expect(a.hechos_ejecucion).toMatchObject({trabajo:{atribucion:'tarea_exclusiva',jornales_total:'0.5',costo_total_cop:'90'}});
 });
 it('preserves null-start membership proved by work and excludes work outside the requested window',async()=>{
  const data=fixture();data.aplicaciones[0].fecha_inicio_ejecucion=null;data.registros_trabajo=[{id:'inside-work',tarea_id:'task-a',lote_id:'lot',fecha_trabajo:'2034-05-03',fraccion_jornal:'0.5',costo_jornal:'90'},{id:'outside-work',tarea_id:'task-a',lote_id:'lot',fecha_trabajo:'2034-04-03',fraccion_jornal:'1',costo_jornal:'800'}];
  const s=source(data),r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:'labor',selection_basis:'activity',date_from:'2034-05-01',date_to:'2034-05-07'},s.q,'2034-05-08',{pregunta:'Jornales de la aplicación Alfa en mayo de 2034',metricas:['labor']});
  expect((r.detalle as Row[])[0]).toMatchObject({fecha_inicio_ejecucion:null,membership:{work_ids:['inside-work']},hechos_ejecucion:{trabajo:{costo_total_cop:'90',registros_fuera_alcance:1}}});
 });
 it('does not attribute a shared task exclusively or make a missing task imply zero work',async()=>{
  const data=fixture();data.aplicaciones[1].tarea_id='task-a';data.registros_trabajo=[{id:'work',tarea_id:'task-a',lote_id:'lot',fecha_trabajo:'2034-05-03',fraccion_jornal:'1',costo_jornal:'100'}];
  const s=source(data),r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:'labor',selection_basis:'activity'},s.q,'2034-05-08',{pregunta:'Jornales de la aplicación Alfa',metricas:['labor']});
  expect((r.detalle as Row[])[0].hechos_ejecucion).toMatchObject({trabajo:{atribucion:'tarea_compartida',costo_total_cop:null}});
  const missing=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:'labor',selection_basis:'activity'},s.q,'2034-05-08',{pregunta:'Jornales de la aplicación Gamma',metricas:['labor']});expect((missing.detalle as Row[])[0].hechos_ejecucion).toMatchObject({trabajo:{atribucion:'sin_tarea',jornales_total:null,costo_total_cop:null}});
 });
 it('does not certify an empty labor-window population when the task link is unknown',async()=>{
  const s=source(),r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:'labor',selection_basis:'activity',date_from:'2034-05-01',date_to:'2034-05-07'},s.q,'2034-05-08',{pregunta:'Jornales de la aplicación Gamma en mayo de 2034',metricas:['labor']});
  expect((r.detalle as Row[])[0]).toMatchObject({id:'null-date',membership:{membership_complete:false},hechos_ejecucion:{trabajo:{jornales_total:null,costo_total_cop:null}}});
 });

 it('retains known labor beside an application with unresolved task membership',async()=>{
  const data=fixture();data.registros_trabajo=[{id:'known-work',tarea_id:'task-a',lote_id:'lot',fecha_trabajo:'2034-05-03',fraccion_jornal:'0.5',costo_jornal:'90'}];
  const s=source(data),r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',{metric:'labor',selection_basis:'activity',date_from:'2034-05-01',date_to:'2034-05-07'},s.q,'2034-05-08',{pregunta:'Jornales de las aplicaciones en mayo de 2034',metricas:['labor']});
  const rows=r.detalle as Row[];expect(rows.map(row=>row.id)).toEqual(['inside','null-date']);
  for(const row of rows){
    const scope:Scope={id:'labor:'+String(row.id),operation:'application.execution',entities:[{kind:'application',id:String(row.id),label:String(row.id)}],period:{from:'2034-05-01',to:'2034-05-07',referenceDay:'2034-05-08',clock:'America/Bogota',basis:'actual',fieldMeaning:'fecha_trabajo'},filters:{selection_basis:'activity'}};
    const p=particionesMetricasAplicacion(scope,row,'labor')[0],proof:PopulationProof={populationId:p.scope.id+':read',scopeId:p.scope.id,tool:'get_aplicaciones_ejecucion',fields:p.fields,capturedAt:'2034-05-08T12:00:00Z',population:p.complete?'complete':'partial',rowsRead:p.rows.length,expectedRows:p.complete?p.rows.length:null,identityUnique:true,consistency:'stable_count_pages'};
    const e=evidenciaMetricaParticion(p,proof),cost=e.facts.find(f=>f.metric==='application.cost')!;
    if(row.id==='inside'){expect(row.membership).toMatchObject({membership_complete:true});expect(p.complete).toBe(true);expect(cost.value).toEqual({kind:'decimal',value:'90',unit:'COP'});}
    else{expect(row.membership).toMatchObject({membership_complete:false});expect(p.complete).toBe(false);expect(cost.value.kind).toBe('unknown');expect(e.issues.some(i=>i.code==='incomplete_population')).toBe(true);}
    expect(e.facts.some(f=>f.metric==='application.count')).toBe(false);
  }
 });
