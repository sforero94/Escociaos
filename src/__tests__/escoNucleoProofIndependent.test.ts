// Independent synthetic proof/eligibility regressions. No I/O, identities or model calls.
import {expect,it} from 'vitest';
import {validarEvidencia,validarScope,type Scope,type Fact,type Evidence,type PopulationProof} from '../utils/escoEvidencia';
import {pruebaDerivadaNucleo,pruebaNucleo,coberturaNucleo,type LecturaNucleo} from '../utils/escoNucleoComun';
import {componerRespuestaVerificada} from '../utils/escoRespuesta';
const now='2034-05-08T12:00:00.000Z';
const scope:Scope={id:'work',operation:'labor.by_lot',period:{from:'2034-05-01',to:'2034-05-07',referenceDay:'2034-05-08',clock:'America/Bogota',basis:'actual',fieldMeaning:'fecha_trabajo'},entities:[],filters:{}};
const proof:PopulationProof={populationId:'work:rows',scopeId:scope.id,tool:'get_labor_summary',fields:['id','fraccion_jornal','costo_jornal'],capturedAt:now,population:'complete',rowsRead:2,expectedRows:2,identityUnique:true,consistency:'stable_count_pages'};
const cost:Fact={id:'cost',scopeId:scope.id,metric:'labor.cost',definitionId:'labor.cost.v1',entities:[],value:{kind:'decimal',value:'80.25',unit:'COP'},origin:'derived',assertion:'scoped_total',source:{tool:proof.tool,field:'costo_jornal',capturedAt:now},coverage:coberturaNucleo(proof),derivation:{operation:'sum',inputs:[{populationId:proof.populationId,field:'costo_jornal'}]}};
const envelope=(facts:Fact[],s:Scope=scope):Evidence=>({version:1,state:'ok',scopes:[s],facts,issues:[]});
it('retains a valid old-family stored-cost sum after additive metric registration',()=>{
 expect(validarEvidencia(envelope([cost]),[scope],[proof])).toBe(true);
});
it('does not let a fresh supporting read conceal an older source in a derived proof',()=>{
 const s:Scope={id:'task',operation:'task.status',period:null,entities:[{kind:'task',id:'a',label:'Synthetic task'}],filters:{}};
 const old:LecturaNucleo={rows:[{id:'a',estado:'En Proceso'}],total:1,capturedAt:'2034-05-07T12:00:00.000Z',identityKeys:['id'],complete:true,identityUnique:true,consistency:'stable_count_pages'};
 const fresh:LecturaNucleo={...old,rows:[{id:'catalog'}],capturedAt:now};
 const compose=(reads:LecturaNucleo[])=>{
  const p=pruebaDerivadaNucleo(reads,s,'get_tareas',['estado'],1);
  const f:Fact={id:'status',scopeId:s.id,metric:'task.status',definitionId:'task.status.v1',entities:[{kind:'task',id:'a'}],value:{kind:'status',value:'En Proceso'},origin:'recorded',assertion:'record_value',coverage:coberturaNucleo(p),source:{tool:p.tool,field:'estado',capturedAt:p.capturedAt}};
  return {p,result:componerRespuestaVerificada({parts:[{id:'tasks',operation:s.operation,scopeIds:[s.id],metrics:['task.status'],label:'Tasks'}],scopes:[s],populations:[p],evidence:[envelope([f],s)],turnStartedAt:'2034-05-08T11:59:00.000Z'})};
 };
 for(const reads of [[old,fresh],[fresh,old]]){const r=compose(reads);expect(r.p.capturedAt).toBe(old.capturedAt);expect(r.result.parts[0].state).toBe('unavailable');expect(r.result.text).not.toContain('En Proceso');}
 const r=compose([{...old,capturedAt:'2034-05-08T11:59:30.000Z'},fresh]);expect(r.result.parts[0].state).toBe('answered');expect(r.result.text).toContain('En Proceso');
});
it('permits the registered event-count unit without confusing raw transfer legs with logical events',()=>{
 const s:Scope={...scope,id:'moves',operation:'cattle.movements',period:{...scope.period!,basis:'recorded_at',fieldMeaning:'fecha'}};
 const empty:LecturaNucleo={rows:[],total:0,capturedAt:now,identityKeys:['id'],complete:true,identityUnique:true,consistency:'stable_count_pages'};
 const make=(p:PopulationProof,value:string,assertion:Fact['assertion']):Fact=>({...cost,id:'events',scopeId:s.id,metric:'ganado.movement.count',definitionId:'ganado.movement.count.v1',value:{kind:'decimal',value,unit:'evento'},assertion,source:{tool:p.tool,field:'event_id',capturedAt:p.capturedAt},coverage:coberturaNucleo(p),derivation:{operation:'group_events',inputs:[{populationId:p.populationId,field:'event_id'}]}});
 const p=pruebaDerivadaNucleo([empty],s,'get_ganado_movimientos_detalle',['event_id'],0);
 expect(validarEvidencia(envelope([make(p,'0','bounded_empty')],s),[s],[p])).toBe(true);
 const legs:LecturaNucleo={...empty,rows:[{id:'leg-a'},{id:'leg-b'}],total:2};
 const raw=pruebaNucleo(legs,s,'get_ganado_movimientos_detalle',['event_id']);
 expect(validarEvidencia(envelope([make(raw,'1','record_count')],s),[s],[raw])).toBe(false);
 expect(validarEvidencia(envelope([make(raw,'1','derived_measure')],s),[s],[raw])).toBe(true);
 expect(validarEvidencia(envelope([{...cost,value:{kind:'decimal',value:'2',unit:'evento'},assertion:'record_count'}]),[scope],[proof])).toBe(false);
});
it('rejects a cost derived from a journal-unit fact',()=>{
 const journals:Fact={...cost,id:'journals',metric:'labor.journals',definitionId:'labor.journals.v1',value:{kind:'decimal',value:'2',unit:'jornal'},source:{...cost.source,field:'fraccion_jornal'},derivation:{operation:'sum',inputs:[{populationId:proof.populationId,field:'fraccion_jornal'}]}};
 expect(validarEvidencia(envelope([journals,{...cost,derivation:{operation:'sum',inputs:[{factId:journals.id}]}}]),[scope],[proof])).toBe(false);
});
it('rejects a numeric subtotal with no verified contributing values',()=>{
 const p:PopulationProof={...proof,population:'unknown',rowsRead:0,expectedRows:null,consistency:'not_attested'};
 const f:Fact={...cost,assertion:'verified_subtotal',coverage:coberturaNucleo(p,0,['not_observed'])};f.coverage.values='unknown';
 expect(validarEvidencia(envelope([f]),[scope],[p])).toBe(false);
});
it('keeps a registered planned/actual comparison useful while rejecting a false comparison',()=>{
 const s:Scope={id:'app',operation:'application.execution',period:null,entities:[{kind:'application',id:'app-a',label:'Synthetic application'}],filters:{}};
 const p:PopulationProof={...proof,populationId:'application:row',scopeId:s.id,tool:'get_aplicaciones_ejecucion',fields:['fecha_inicio_ejecucion','fecha_inicio_planeada'],rowsRead:1,expectedRows:1};
 const actual:Fact={...cost,id:'actual',scopeId:s.id,metric:'application.actual_start',definitionId:'application.actual_start.v1',entities:s.entities.map(({kind,id})=>({kind,id})),value:{kind:'date',value:'2034-05-02'},origin:'recorded',assertion:'record_value',source:{tool:p.tool,field:'fecha_inicio_ejecucion',capturedAt:now},coverage:coberturaNucleo(p),derivation:undefined};
 const planned:Fact={...actual,id:'planned',metric:'application.planned_start',definitionId:'application.planned_start.v1',value:{kind:'date',value:'2034-05-01'},origin:'planned',source:{...actual.source,field:'fecha_inicio_planeada'}};
 const comparison:Fact={...actual,id:'comparison',metric:'application.start_comparison',definitionId:'application.start_comparison.v1',origin:'derived',assertion:'derived_measure',value:{kind:'status',value:'Diferentes'},derivation:{operation:'compare_dates',inputs:[{factId:actual.id},{factId:planned.id}]}};
 expect(validarEvidencia(envelope([actual,planned,comparison],s),[s],[p])).toBe(true);
 expect(validarEvidencia(envelope([actual,planned,{...comparison,value:{kind:'status',value:'Iguales'}}],s),[s],[p])).toBe(false);
});
it('rejects an invented population even when its references agree internally',()=>{
 const f:Fact={...cost,coverage:{...cost.coverage,populationId:'invented'},derivation:{operation:'sum',inputs:[{populationId:'invented',field:'costo_jornal'}]}};
 expect(validarEvidencia(envelope([f]),[scope],[proof])).toBe(false);
});
it('does not bypass origin or derivation checks for an unknown value',()=>{
 expect(validarEvidencia(envelope([{...cost,origin:'planned',value:{kind:'unknown',reason:'missing_value'}}]),[scope],[proof])).toBe(false);
 expect(validarEvidencia(envelope([{...cost,value:{kind:'unknown',reason:'missing_value'},derivation:{operation:'mean',inputs:[{populationId:proof.populationId,field:'costo_jornal'}]}}]),[scope],[proof])).toBe(false);
});
it('rejects a planned date basis for the actual registered labor field',()=>{
 expect(validarScope({...scope,period:{...scope.period!,basis:'planned'}})).toBe(false);
});
