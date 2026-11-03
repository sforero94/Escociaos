import { describe, expect, it, vi } from 'vitest';
import { ejecutarFuenteVerificada, type PuertoFuente } from '../utils/escoDispatcherVerificado';
import { componerRespuestaVerificada } from '../utils/escoRespuesta';
import { OperationFailure, requestedApplicationMetrics } from '../utils/escoOperacionContrato';
const now='2034-05-08T12:00:00Z';
const fresh=()=>({id:'app',nombre_aplicacion:'Estimación',estado:'En ejecución',fecha_inicio_ejecucion:null,fecha_fin_ejecucion:null,fecha_inicio_planeada:'2034-05-02',fecha_fin_planeada:'2034-05-07',tarea_id:'task',membership:{selection_basis:'activity'},
 movimientos:[{id:'m',aplicacion_id:'app',lote_id:'lot',fecha_movimiento:'2034-05-02',consumos:[{id:'c',movimiento_diario_id:'m',producto_id:'product',unidad:'kg',cantidad_utilizada:'2'}]}],
 registros_trabajo:[{id:'w',tarea_id:'task',lote_id:'lot',fecha_trabajo:'2034-05-03',fraccion_jornal:'0.5',costo_jornal:'90'}],
 plan_por_lote:[{id:'plan',aplicacion_id:'app',lote_id:'lot',mezcla_id:'mix',numero_canecas:'3'}],productos_planeados:[{id:'recipe',mezcla_id:'mix',producto_id:'product',unidad_dosis:'kg',dosis_por_caneca:'2'}],
 hechos_ejecucion:{alcance:{lote_ids:null},trabajo:{atribucion:'tarea_exclusiva',tarea_id:'task'}},
});
function port(question:string,original=question){
 const applications=vi.fn<NonNullable<PuertoFuente['applications']>>(async()=>({rows:[fresh()],complete:true}));
 const read=vi.fn<PuertoFuente['read']>(async()=>{throw Error('unexpected generic source');});
 return {applications,read,now:()=>now,currentUserText:question,currentRequestText:original} satisfies PuertoFuente;
}
describe('independent application wiring review',()=>{
 it.each(['¿La aplicación Estimación sigue abierta?','¿La aplicación Teórica sigue abierta?'])('does not authorize a calculation from a noun in the current selector: %s',async question=>{
  const p=port(question);expect(requestedApplicationMetrics(question)).not.toContain('theoretical');
  await expect(ejecutarFuenteVerificada('get_aplicaciones_ejecucion',{metric:'theoretical'},p)).rejects.toMatchObject({code:'outside_scope',stage:'scope'});expect(p.applications).not.toHaveBeenCalled();
 });
 it('does not inherit theoretical permission from an expanded prior request',async()=>{
  const p=port('Calcula la estimación teórica para la aplicación Alfa','¿Sigue abierta?');
  await expect(ejecutarFuenteVerificada('get_aplicaciones_ejecucion',{metric:'theoretical'},p)).rejects.toMatchObject({code:'outside_scope'});expect(p.applications).not.toHaveBeenCalled();
 });
 it('retains a positive explicit dose calculation with verified planned inputs',async()=>{
  const p=port('Calcula la dosis teórica con las canecas planeadas de la aplicación Alfa');
  const r=await ejecutarFuenteVerificada('get_aplicaciones_ejecucion',{metric:'theoretical'},p);
  expect(r?.evidence.flatMap(e=>e.facts).find(f=>f.metric==='application.theoretical_quantity')?.value).toEqual({kind:'decimal',value:'6',unit:'kg'});expect(p.applications).toHaveBeenCalledTimes(1);
 });
 it('does not turn a planned-start request into a movement-date cohort',async()=>{
  const p=port('Consumos de las aplicaciones planeadas en mayo de 2034');
  await expect(ejecutarFuenteVerificada('get_aplicaciones_ejecucion',{metric:'quantity',date_basis:'planned',date_from:'2034-05-01',date_to:'2034-05-07',reference_day:'2034-05-08'},p)).rejects.toMatchObject({code:'unsupported_operation',stage:'scope'});expect(p.applications).not.toHaveBeenCalled();
 });
 it('preserves known planned dates when the independently requested activity scope is unsupported',async()=>{
  const p=port('Fechas planeadas y consumo registrado de las aplicaciones en mayo de 2034');p.applications.mockResolvedValue({rows:[{...fresh(),membership:{selection_basis:'start'}}],complete:true});
  const r=await ejecutarFuenteVerificada('get_aplicaciones_ejecucion',{metric:['dates','quantity'],date_basis:'planned',date_from:'2034-05-01',date_to:'2034-05-07',reference_day:'2034-05-08'},p);
  expect(r?.evidence.flatMap(e=>e.facts).find(f=>f.metric==='application.planned_start')?.value).toEqual({kind:'date',value:'2034-05-02'});expect(r?.evidence.flatMap(e=>e.facts).some(f=>f.metric==='application.quantity')).toBe(false);expect(r?.errors).toEqual(expect.arrayContaining([expect.objectContaining({code:'unsupported_operation',stage:'scope'})]));expect(p.applications).toHaveBeenCalledTimes(1);
 });
 it('keeps a historical labor result when a separate consumption source fails',async()=>{
  const p=port('Consumo registrado y jornales de la aplicación Alfa');p.applications.mockImplementation(async(_args,operation)=>{if(operation?.metrics.includes('quantity'))throw new OperationFailure('source_error','source');return {rows:[fresh()],complete:true};});
  const r=await ejecutarFuenteVerificada('get_aplicaciones_ejecucion',{metric:['quantity','labor'],date_from:'2034-05-01',date_to:'2034-05-07',reference_day:'2034-05-08'},p);
  expect(r?.evidence.flatMap(e=>e.facts).find(f=>f.metric==='application.cost')?.value).toEqual({kind:'decimal',value:'90',unit:'COP'});expect(r?.evidence.flatMap(e=>e.facts).find(f=>f.metric==='application.journals')?.value).toEqual({kind:'decimal',value:'0.5',unit:'jornal'});expect(r?.errors).toEqual(expect.arrayContaining([expect.objectContaining({code:'source_error',stage:'source'})]));expect(p.applications).toHaveBeenCalledTimes(2);
 });
});

 it.each(['Calcula el costo laboral de la aplicación Teórica','Estima si esa aplicación está cerrada'])('does not authorize dose arithmetic from an unrelated calculation request: %s',async question=>{
  const p=port(question);expect(requestedApplicationMetrics(question)).not.toContain('theoretical');await expect(ejecutarFuenteVerificada('get_aplicaciones_ejecucion',{metric:'theoretical'},p)).rejects.toMatchObject({code:'outside_scope',stage:'scope'});expect(p.applications).not.toHaveBeenCalled();
 });

 it('renders unknown activity membership beside verified labor without replacing it with zero',async()=>{
  const p=port('Jornales de las aplicaciones en mayo de 2034');
  const unknown={id:'unknown-app',nombre_aplicacion:'Sin tarea acreditada',estado:'Calculada',tarea_id:null,fecha_inicio_ejecucion:null,membership:{selection_basis:'activity',membership_complete:false},registros_trabajo:[],hechos_ejecucion:{alcance:{lote_ids:null},trabajo:{atribucion:'sin_tarea',tarea_id:null}}};
  p.applications.mockResolvedValue({rows:[fresh(),unknown],complete:true});
  const r=await ejecutarFuenteVerificada('get_aplicaciones_ejecucion',{metric:'labor',date_from:'2034-05-01',date_to:'2034-05-07',reference_day:'2034-05-08'},p);expect(r).not.toBeNull();
  const text=componerRespuestaVerificada({...r!,turnStartedAt:now,modelText:'PRIVATE_UNSUPPORTED_COMPLETION'}).text;
  expect(text).toContain('90');expect(text).toContain('COP');expect(text).toContain('pertenencia al período de actividad no pude acreditar');expect(text).toContain('Sus valores no son cero');expect(text).toContain('otras aplicaciones se conservan por separado');expect(text).not.toContain('PRIVATE_UNSUPPORTED_COMPLETION');
  const missing=r!.evidence.flatMap(e=>e.facts).filter(f=>f.entities.some(e=>e.kind==='application'&&e.id==='unknown-app'));
  expect(missing).toHaveLength(2);expect(missing.every(f=>f.value.kind==='unknown')).toBe(true);expect(missing.some(f=>f.value.kind==='decimal'&&f.value.value==='0')).toBe(false);
  expect(r!.scopes.some(s=>s.filters.membership_complete==='false')).toBe(true);
 });
