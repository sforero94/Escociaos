import { describe, expect, it } from 'vitest';
import { particionesMetricasAplicacion, evidenciaMetricaParticion, type ParticionMetricaAplicacion } from '../utils/escoAplicacionMetricas';
import { validarEvidencia, type PopulationProof, type Scope } from '../utils/escoEvidencia';
const scope:Scope={id:'synthetic-app',operation:'application.execution',entities:[{kind:'application',id:'app',label:'Aplicación sintética'}],period:null,filters:{aplicacion_id:'app'}};
const row=()=>({id:'app',estado:'Cerrada',fecha_inicio_ejecucion:'2034-05-02',fecha_fin_ejecucion:null,fecha_inicio_planeada:'2034-05-01',fecha_fin_planeada:'2034-05-03',tarea_id:'task',
 hechos_ejecucion:{trabajo:{atribucion:'tarea_exclusiva',tarea_id:'task',costo_total_cop:'9999999'}},
 movimientos:[{id:'m1',aplicacion_id:'app',lote_id:'lot-a',fecha_movimiento:'2034-05-02',consumos:[{id:'c1',movimiento_diario_id:'m1',producto_id:'prod',unidad:'kg',cantidad_utilizada:'0.1'}]},{id:'m2',aplicacion_id:'app',lote_id:'lot-a',fecha_movimiento:'2034-05-03',consumos:[{id:'c2',movimiento_diario_id:'m2',producto_id:'prod',unidad:'kg',cantidad_utilizada:'0.2'}]},{id:'m3',aplicacion_id:'app',lote_id:'lot-b',fecha_movimiento:'2034-05-03',consumos:[{id:'c3',movimiento_diario_id:'m3',producto_id:'prod',unidad:'L',cantidad_utilizada:'2'}]}],
 registros_trabajo:[{id:'w1',tarea_id:'task',lote_id:'lot-a',fecha_trabajo:'2034-05-02',fraccion_jornal:'0.5',costo_jornal:'20'},{id:'w2',tarea_id:'task',lote_id:'lot-b',fecha_trabajo:'2034-05-03',fraccion_jornal:'0.5',costo_jornal:'80'}],
 plan_por_lote:[{id:'plan',aplicacion_id:'app',lote_id:'lot-a',mezcla_id:'mix',numero_canecas:'3'}],productos_planeados:[{id:'recipe',mezcla_id:'mix',producto_id:'prod',unidad_dosis:'kg',dosis_por_caneca:'0.25'}],
});
function proof(p:ParticionMetricaAplicacion,extra:Partial<PopulationProof>={}):PopulationProof{return {populationId:'proof:'+p.scope.id,scopeId:p.scope.id,tool:'get_aplicaciones_ejecucion',fields:p.fields,capturedAt:'2034-05-08T12:00:00Z',population:p.complete?'complete':'partial',rowsRead:p.rows.length,expectedRows:p.complete?p.rows.length:null,identityUnique:true,consistency:'stable_count_pages',...extra};}
function run(p:ParticionMetricaAplicacion,extra:Partial<PopulationProof>={}){const attested=proof(p,extra),e=evidenciaMetricaParticion(p,attested);expect(validarEvidencia(e,[p.scope],[attested])).toBe(true);return e;}
const val=(e:ReturnType<typeof run>,metric:string)=>e.facts.find(f=>f.metric===metric)?.value;
describe('application metric partitions and source-bound facts',()=>{
 it('defaults to status and dates without quantity/labor/theory or comparisons',()=>{
  const parts=particionesMetricasAplicacion(scope,row());expect(parts.map(p=>p.kind)).toEqual(['application']);const e=run(parts[0]);
  expect(e.facts.map(f=>f.metric)).toEqual(['application.status','application.actual_start','application.actual_end','application.planned_start','application.planned_end','application.count']);
  expect(val(e,'application.actual_end')?.kind).toBe('unknown');expect(val(e,'application.status')).toEqual({kind:'status',value:'Cerrada'});
 });
 it('isolates scalar status and includes required date input facts for comparisons',()=>{
  expect(run(particionesMetricasAplicacion(scope,row(),'status')[0]).facts.map(f=>f.metric)).toEqual(['application.status','application.count']);
  const e=run(particionesMetricasAplicacion(scope,row(),'date_comparison')[0]);expect(val(e,'application.start_comparison')).toEqual({kind:'status',value:'Diferentes'});expect(val(e,'application.end_comparison')?.kind).toBe('unknown');
 });
 it('keeps product, units and lots distinct with exact decimal sums',()=>{
  const parts=particionesMetricasAplicacion(scope,row(),'quantity');expect(parts).toHaveLength(2);
  expect(val(run(parts[0]),'application.quantity')).toEqual({kind:'decimal',value:'0.3',unit:'kg'});
  expect(val(run(parts[1]),'application.quantity')).toEqual({kind:'decimal',value:'2',unit:'L'});
  expect(parts[0].scope.entities).toEqual(expect.arrayContaining([{kind:'product',id:'prod',label:'prod'}]));expect(parts[0].scope.entities.some(e=>e.kind==='lot')).toBe(false);
 });
 it('sums unequal historical costs independently of equal fractions without forcing a lot',()=>{
  const part=particionesMetricasAplicacion(scope,row(),'labor')[0],e=run(part);
  expect(val(e,'application.journals')).toEqual({kind:'decimal',value:'1',unit:'jornal'});expect(val(e,'application.cost')).toEqual({kind:'decimal',value:'100',unit:'COP'});expect(part.scope.entities.some(x=>x.kind==='lot')).toBe(false);
 });
 it('does not attribute shared task totals or cached DTO numbers to an application',()=>{
  const r=row();r.hechos_ejecucion.trabajo.atribucion='tarea_compartida';const e=run(particionesMetricasAplicacion(scope,r,'labor')[0]);
  expect(val(e,'application.cost')?.kind).toBe('unknown');expect(JSON.stringify(e)).not.toContain('9999999');
 });
 it('requires explicit theoretical request and verifies inputs/formula separately from consumption',()=>{
  const parts=particionesMetricasAplicacion(scope,row(),['quantity','theoretical']),theory=parts.find(p=>p.kind==='theoretical')!,e=run(theory);
  expect(val(e,'application.planned_dose')).toEqual({kind:'decimal',value:'0.25',unit:'kg/caneca'});expect(val(e,'application.planned_drums')).toEqual({kind:'decimal',value:'3',unit:'caneca'});expect(val(e,'application.theoretical_quantity')).toEqual({kind:'decimal',value:'0.75',unit:'kg'});
  expect(e.facts.find(f=>f.metric==='application.theoretical_quantity')?.derivation).toMatchObject({operation:'multiply'});
  expect(e.facts.filter(f=>f.metric!=='application.theoretical_quantity').every(f=>f.origin==='planned')).toBe(true);
 });
 it('keeps all six metrics useful through separate externally attested populations',()=>{
  const parts=particionesMetricasAplicacion(scope,row(),['status','dates','date_comparison','quantity','labor','theoretical']);
  expect(new Set(parts.map(p=>p.scope.id)).size).toBe(parts.length);expect(parts.map(p=>p.kind)).toEqual(['application','quantity','quantity','labor','theoretical']);parts.forEach(p=>run(p));
 });
 it('uses a movement window without replacing application start cohort membership',()=>{
  const s:Scope={...scope,period:{from:'2034-05-03',to:'2034-05-03',referenceDay:'2034-05-08',clock:'America/Bogota',basis:'actual',fieldMeaning:'fecha_inicio_ejecucion'}};
  const parts=particionesMetricasAplicacion(s,row(),'quantity');expect(parts[0].scope.period?.fieldMeaning).toBe('fecha_movimiento');expect(parts[0].scope.filters.cohort_start_from).toBe('2034-05-03');expect(val(run(parts[0]),'application.quantity')).toEqual({kind:'decimal',value:'0.2',unit:'kg'});
 });
 it('displays null actual dates for a proven activity record without pretending start-cohort membership',()=>{
  const r={...row(),fecha_inicio_ejecucion:null,membership:{selection_basis:'activity'}},s:Scope={...scope,period:{from:'2034-05-01',to:'2034-05-07',referenceDay:'2034-05-08',clock:'America/Bogota',basis:'actual',fieldMeaning:'fecha_movimiento'}};
  const p=particionesMetricasAplicacion(s,r,'dates')[0];expect(p.scope.period).toBeNull();expect(p.scope.filters.selection_basis).toBe('activity');expect(val(run(p),'application.actual_start')?.kind).toBe('unknown');
 });
 it('preserves useful subtotals when values or population completeness are missing',()=>{
  const r=row();r.movimientos[1].consumos[0].cantidad_utilizada=null as unknown as string;
  const e=run(particionesMetricasAplicacion(scope,r,'quantity')[0]);expect(val(e,'application.quantity')).toEqual({kind:'decimal',value:'0.1',unit:'kg'});expect(e.facts[0].assertion).toBe('verified_subtotal');expect(e.state).toBe('partial');
  const p=particionesMetricasAplicacion(scope,row(),'labor')[0],partial=run(p,{population:'partial',expectedRows:null});expect(val(partial,'application.cost')).toEqual({kind:'decimal',value:'100',unit:'COP'});expect(partial.facts[0].assertion).toBe('verified_subtotal');
 });
 it('does not promote incomplete attribution to a complete proof and keeps unknown units explicit',()=>{
  const r=row();r.movimientos.push({id:'bad',aplicacion_id:'app',lote_id:'lot-a',fecha_movimiento:'2034-05-02',consumos:[{id:'bad-c',movimiento_diario_id:'bad',producto_id:'prod',unidad:'',cantidad_utilizada:'50'}]});
  const p=particionesMetricasAplicacion(scope,r,'quantity')[0];expect(p.complete).toBe(false);expect(run(p).facts[0].assertion).toBe('verified_subtotal');expect(evidenciaMetricaParticion(p,proof(p,{population:'complete',expectedRows:p.rows.length})).state).toBe('error');
 });
 it('keeps missing theoretical inputs unknown rather than using actuals or an unverified formula',()=>{
  const r=row();r.productos_planeados[0].dosis_por_caneca=null as unknown as string;const e=run(particionesMetricasAplicacion(scope,r,'theoretical')[0]);expect(val(e,'application.theoretical_quantity')?.kind).toBe('unknown');expect(val(e,'application.planned_drums')).toEqual({kind:'decimal',value:'3',unit:'caneca'});
 });
 it('does not convert empty capture to a consumption or labor zero',()=>{
  const r=row();r.movimientos=[];r.registros_trabajo=[];for(const p of particionesMetricasAplicacion(scope,r,['quantity','labor']))expect(run(p).facts.every(f=>f.value.kind==='unknown')).toBe(true);
 });
 it('binds proof counts, fields, source and canonical partition identity',()=>{
  const p=particionesMetricasAplicacion(scope,row(),'quantity')[0];
  for(const bad of [{rowsRead:1},{scopeId:'other'},{fields:['estado']},{tool:'other'}])expect(evidenciaMetricaParticion(p,proof(p,bad)).state).toBe('error');
  const forged={...p,scope:{...p.scope,entities:p.scope.entities.map(e=>e.kind==='product'?{...e,id:'wrong-product'}:e)}};expect(evidenciaMetricaParticion(forged,proof(forged)).state).toBe('error');
 });
 it('minimizes descriptors and evidence even if the supplied fresh row has extensions',()=>{
  const r=row();Object.assign(r,{empleado:'PRIVATE_PERSON',notas:'PRIVATE_NOTE'});Object.assign(r.registros_trabajo[0],{salario:'PRIVATE_SALARY',empleado_id:'PRIVATE_EMPLOYEE'});
  const parts=particionesMetricasAplicacion(scope,r,['status','quantity','labor','theoretical']);expect(JSON.stringify(parts)).not.toMatch(/PRIVATE_|empleado|salario|notas/);expect(JSON.stringify(parts.map(p=>run(p)))).not.toContain('PRIVATE_');
 });
});

 it('does not attribute foreign plan or consumption joins to the current application',()=>{
  const r=row();r.plan_por_lote[0].aplicacion_id='foreign';r.movimientos[0].consumos[0].movimiento_diario_id='foreign';
  const theory=particionesMetricasAplicacion(scope,r,'theoretical');expect(theory.every(p=>!p.complete)).toBe(true);expect(run(theory[0]).facts.every(f=>f.value.kind==='unknown')).toBe(true);
  const quantities=particionesMetricasAplicacion(scope,r,'quantity');expect(quantities[0].complete).toBe(false);expect(val(run(quantities[0]),'application.quantity')).toEqual({kind:'decimal',value:'0.2',unit:'kg'});
 });

 it('retains known planned inputs when their exact product exceeds supported decimal precision',()=>{
  const r=row();r.productos_planeados[0].dosis_por_caneca='0.000000000000000001';r.plan_por_lote[0].numero_canecas='0.000000000000000001';
  const e=run(particionesMetricasAplicacion(scope,r,'theoretical')[0]);
  expect(val(e,'application.planned_dose')?.kind).toBe('decimal');expect(val(e,'application.planned_drums')?.kind).toBe('decimal');expect(val(e,'application.theoretical_quantity')).toEqual({kind:'unknown',reason:'invalid_value'});expect(e.state).toBe('partial');
 });

 it('rejects contradictory scope filters even if an entity label looks correct',()=>{
  expect(()=>particionesMetricasAplicacion({...scope,filters:{aplicacion_id:'foreign'}},row(),'labor')).toThrow('outside_scope');
  const p=particionesMetricasAplicacion(scope,row(),'quantity')[0];
  for(const filters of [{...p.scope.filters,producto_id:'foreign'},{...p.scope.filters,lote_id:'foreign'}]){
    const bad={...p,scope:{...p.scope,filters}};expect(evidenciaMetricaParticion(bad,proof(bad)).state).toBe('error');
  }
 });

 it('defaults to one exact application total per product/unit and splits only requested lot dimensions',()=>{
  const r=row();r.movimientos[2].consumos[0].unidad='kg';
  const total=particionesMetricasAplicacion(scope,r,'quantity');expect(total).toHaveLength(1);expect(total[0].rows).toHaveLength(3);expect(val(run(total[0]),'application.quantity')).toEqual({kind:'decimal',value:'2.3',unit:'kg'});expect(total[0].scope.entities.some(e=>e.kind==='lot')).toBe(false);
  const variants:Scope['filters'][]=[{aplicacion_id:'app',group_by:'lot'},{aplicacion_id:'app',lote_id:['lot-a','lot-b']}];
  for(const filters of variants){
    const parts=particionesMetricasAplicacion({...scope,filters},r,'quantity');expect(parts).toHaveLength(2);expect(parts.map(p=>val(run(p),'application.quantity'))).toEqual([{kind:'decimal',value:'0.3',unit:'kg'},{kind:'decimal',value:'2',unit:'kg'}]);
  }
 });

 it('keeps application metadata useful beside a requested lot breakdown',()=>{
  const p=particionesMetricasAplicacion({...scope,filters:{aplicacion_id:'app',group_by:'lot'}},row(),['status','dates','quantity']);
  expect(p[0].scope.filters).toEqual({aplicacion_id:'app'});expect(val(run(p[0]),'application.status')).toEqual({kind:'status',value:'Cerrada'});expect(p.filter(x=>x.kind==='quantity').every(x=>x.scope.entities.some(e=>e.kind==='lot'))).toBe(true);
 });

 it('respects one-sided activity bounds for task records without inventing a closed interval',()=>{
  const s:Scope={...scope,filters:{...scope.filters,date_from:'2034-05-03'}},part=particionesMetricasAplicacion(s,row(),'labor')[0];
  expect(part.scope.period).toBeNull();expect(part.rows.map(r=>r.id)).toEqual(['w2']);expect(val(run(part),'application.cost')).toEqual({kind:'decimal',value:'80',unit:'COP'});
  expect(()=>particionesMetricasAplicacion({...scope,filters:{date_from:'2034-02-30'}},row(),'labor')).toThrow('scope_ambiguous');
 });

 it.each(['%','kg/caneca','g/L','ppm','unidad desconocida'])('does not invent a theoretical quantity from compound/concentration/unknown unit %s',unit=>{
  const r=row();r.productos_planeados[0].unidad_dosis=unit;const e=run(particionesMetricasAplicacion(scope,r,'theoretical')[0]);
  expect(val(e,'application.planned_dose')).toEqual({kind:'unknown',reason:'unknown_unit'});expect(val(e,'application.theoretical_quantity')).toEqual({kind:'unknown',reason:'unknown_unit'});expect(val(e,'application.planned_drums')).toEqual({kind:'decimal',value:'3',unit:'caneca'});
 });
 it.each(['cc','gramos','kg','g','L','ml','mg','kilogramos','litros','unidad','unidades'])('keeps an atomic planned unit literal without conversion: %s',unit=>{
  const r=row();r.productos_planeados[0].unidad_dosis=unit;const e=run(particionesMetricasAplicacion(scope,r,'theoretical')[0]);expect(val(e,'application.theoretical_quantity')).toEqual({kind:'decimal',value:'0.75',unit});
 });
