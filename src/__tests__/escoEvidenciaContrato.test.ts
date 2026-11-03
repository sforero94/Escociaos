import {expect,it} from 'vitest';
import {hechoElegible,validarCobertura,validarEvidencia,validarScope,type Scope,type Fact,type Coverage,type Evidence,type PopulationProof} from '../utils/escoEvidencia';
const scope:Scope={id:'weekly',operation:'labor.by_lot',entities:[],period:{from:'2034-05-01',to:'2034-05-07',referenceDay:'2034-05-08',clock:'America/Bogota',basis:'actual',fieldMeaning:'fecha_trabajo'},filters:{}};
const coverage:Coverage={populationId:'work',population:'complete',values:'complete',rowsRead:2,expectedRows:2,missingValues:0,identityUnique:true,consistency:'stable_count_pages',reasons:[]};
const cost:Fact={id:'cost',scopeId:scope.id,metric:'labor.cost',definitionId:'labor.cost.v1',entities:[],value:{kind:'decimal',value:'291',unit:'COP'},origin:'derived',coverage,source:{tool:'get_labor_summary',field:'costo_jornal',capturedAt:'2034-05-08T12:00:00.000Z'},assertion:'scoped_total',derivation:{operation:'sum',inputs:[{populationId:'work',field:'costo_jornal'}]}};
const proof:PopulationProof={populationId:'work',scopeId:scope.id,tool:'get_labor_summary',fields:['id','fraccion_jornal','costo_jornal'],capturedAt:cost.source.capturedAt,population:'complete',rowsRead:2,expectedRows:2,identityUnique:true,consistency:'stable_count_pages'};
const proofOf=(f:Fact):PopulationProof=>({...proof,populationId:f.coverage.populationId,population:f.coverage.population,rowsRead:f.coverage.rowsRead,expectedRows:f.coverage.expectedRows,identityUnique:f.coverage.identityUnique,consistency:f.coverage.consistency});
const evidence=(f=cost):Evidence=>({version:1,state:'ok',scopes:[scope],facts:[f],issues:[]});
it('accepts a registered stored-cost sum with explicit scope/unit/population',()=>expect(validarEvidencia(evidence(),[scope],[proof])).toBe(true));
it.each([
 {coverage:{...coverage,population:'partial',expectedRows:3}},
 {coverage:{...coverage,values:'partial',missingValues:1}},
 {coverage:{...coverage,identityUnique:false}},
 {coverage:{...coverage,consistency:'not_attested'}},
 {value:{kind:'decimal',value:'291',unit:'kg'}},
 {value:{kind:'decimal',value:'NaN',unit:'COP'}},
 {metric:'unregistered',definitionId:'unregistered.v1'},
 {definitionId:'labor.cost.v2'},
 {source:{...cost.source,field:'salario'}},
 {source:{...cost.source,capturedAt:'yesterday'}},
 {origin:'planned'},
 {derivation:{operation:'mean',inputs:[{populationId:'work',field:'costo_jornal'}]}},
 {derivation:{operation:'sum',inputs:[{populationId:'different',field:'costo_jornal'}]}},
 {derivation:{operation:'sum',inputs:[{populationId:'work',field:'salario'}]}},
].map(patch=>({patch})))('rejects an ungrounded total/definition/source mutation %#',({patch})=>{
 expect(validarEvidencia(evidence({...cost,...patch} as Fact),[scope],[proof])).toBe(false);
});
it('allows an explicit verified subtotal while rejecting a complete total',()=>{
 const partial={...cost,assertion:'verified_subtotal',coverage:{...coverage,population:'partial',values:'partial',expectedRows:3,missingValues:1,reasons:['incomplete_population']}} as Fact;
 expect(validarEvidencia(evidence(partial),[scope],[proofOf(partial)])).toBe(true);expect(hechoElegible({...partial,assertion:'scoped_total'},scope,[proofOf(partial)])).toBe(false);
});
it('keeps complete record count independent of missing monetary values',()=>{
 const count:Fact={...cost,id:'count',metric:'labor.count',definitionId:'labor.count.v1',value:{kind:'decimal',value:'2',unit:'registro'},source:{...cost.source,field:'id'},assertion:'record_count',derivation:{operation:'count',inputs:[{populationId:'work',field:'id'}]}};
 expect(validarEvidencia(evidence(count),[scope],[proofOf(count)])).toBe(true);
});
it('requires verified exact zero for bounded empty, never partial zero',()=>{
 const count:Fact={...cost,metric:'labor.count',definitionId:'labor.count.v1',value:{kind:'decimal',value:'0',unit:'registro'},coverage:{...coverage,rowsRead:0,expectedRows:0},source:{...cost.source,field:'id'},assertion:'bounded_empty',derivation:{operation:'count',inputs:[{populationId:'work',field:'id'}]}};
 expect(validarEvidencia(evidence(count),[scope],[proofOf(count)])).toBe(true);expect(hechoElegible({...count,coverage:{...count.coverage,expectedRows:null,population:'unknown'}},scope,[proofOf(count)])).toBe(false);
});
it('rejects wrong entity and changed trusted period rather than accepting a familiar value',()=>{
 const selected={...scope,entities:[{kind:'lot',id:'lot-a',label:'Duplicate'}]} as Scope;
 expect(hechoElegible({...cost,entities:[{kind:'lot',id:'lot-b'}]},selected,[proof])).toBe(false);
 expect(validarEvidencia(evidence(),[{...scope,period:{...scope.period!,from:'2034-04-01'}}],[proof])).toBe(false);
});
it('does not conflate unknown monetary value with numeric zero',()=>{
 expect(hechoElegible({...cost,value:{kind:'unknown',reason:'missing_value'}},scope,[proof])).toBe(true);
 expect(hechoElegible({...cost,value:{kind:'unknown',reason:'anything'}},scope,[proof])).toBe(false);
});
it('rejects invented definitions and cyclic derivations even with complete coverage',()=>{
 const a={...cost,derivation:{operation:'sum',inputs:[{factId:'b'}]}} as Fact,b={...cost,id:'b',derivation:{operation:'sum',inputs:[{factId:'cost'}]}} as Fact;
 expect(validarEvidencia({...evidence(),facts:[a,b]},[scope],[proof])).toBe(false);
});
it.each([null,{},[],{facts:[null]}, {version:1,state:'ok',scopes:[scope],facts:[null],issues:[]}])('fails closed on malformed envelope %#',v=>expect(validarEvidencia(v,[scope],[proof])).toBe(false));
it('does not silently clamp dates or swap ranges',()=>{
 expect(validarScope({...scope,period:{...scope.period!,from:'2034-05-31',to:'2034-05-01'}})).toBe(false);
 expect(validarScope({...scope,period:{...scope.period!,from:'2034-02-30'}})).toBe(false);
 expect(validarCobertura({...coverage,expectedRows:null})).toBe(false);
 expect(validarScope({...scope,period:{...scope.period!,basis:'planned'}})).toBe(false);
});
it('requires an independently supplied population proof, not a matching invented identifier',()=>{
 expect(validarEvidencia(evidence(),[scope],[])).toBe(false);
 const fake={...cost,coverage:{...coverage,populationId:'invented'},derivation:{operation:'sum',inputs:[{populationId:'invented',field:'costo_jornal'}]}} as Fact;
 expect(validarEvidencia(evidence(fake),[scope],[proof])).toBe(false);
});
it('rejects a monetary sum from journal-valued input facts',()=>{
 const j:Fact={...cost,id:'j',metric:'labor.journals',definitionId:'labor.journals.v1',value:{kind:'decimal',value:'2',unit:'jornal'},source:{...cost.source,field:'fraccion_jornal'},derivation:{operation:'sum',inputs:[{populationId:'work',field:'fraccion_jornal'}]}};
 const bad:Fact={...cost,derivation:{operation:'sum',inputs:[{factId:'j'}]}};
 expect(validarEvidencia({...evidence(),facts:[j,bad]},[scope],[proof])).toBe(false);
});
it('rejects a numeric subtotal without verified contributing values',()=>{
 const c:Coverage={...coverage,rowsRead:0,expectedRows:null,population:'unknown',values:'unknown',consistency:'not_attested'};
 const f:Fact={...cost,assertion:'verified_subtotal',coverage:c};expect(hechoElegible(f,scope,[proofOf(f)])).toBe(false);
});
it('does not bypass origin or derivation rules for unknown values',()=>{
 expect(hechoElegible({...cost,origin:'planned',value:{kind:'unknown',reason:'missing_value'}},scope,[proof])).toBe(false);
 expect(hechoElegible({...cost,value:{kind:'unknown',reason:'missing_value'},derivation:{operation:'mean',inputs:[{populationId:'work',field:'costo_jornal'}]}},scope,[proof])).toBe(false);
});
it('compares actual and planned dates within the same verified actual-membership cohort',()=>{
 const s:Scope={...scope,operation:'application.execution',entities:[{kind:'application',id:'app',label:'Synthetic'}],period:{...scope.period!,fieldMeaning:'fecha_inicio_ejecucion'}};
 const p:PopulationProof={...proof,scopeId:s.id,tool:'get_aplicaciones_ejecucion',fields:['fecha_inicio_ejecucion','fecha_inicio_planeada'],rowsRead:1,expectedRows:1};
 const c:Coverage={...coverage,rowsRead:1,expectedRows:1};
 const a:Fact={...cost,id:'a',metric:'application.actual_start',definitionId:'application.actual_start.v1',entities:s.entities,origin:'recorded',value:{kind:'date',value:'2034-05-02'},coverage:c,source:{...cost.source,tool:p.tool,field:'fecha_inicio_ejecucion'},assertion:'record_value',derivation:undefined};
 const b:Fact={...a,id:'b',metric:'application.planned_start',definitionId:'application.planned_start.v1',origin:'planned',source:{...a.source,field:'fecha_inicio_planeada'},value:{kind:'date',value:'2034-04-30'}};
 const comparison:Fact={...a,id:'comparison',metric:'application.start_comparison',definitionId:'application.start_comparison.v1',origin:'derived',assertion:'derived_measure',value:{kind:'status',value:'Diferentes'},derivation:{operation:'compare_dates',inputs:[{factId:'a'},{factId:'b'}]}};
 const e:Evidence={version:1,state:'ok',scopes:[s],facts:[a,b,comparison],issues:[]};expect(validarEvidencia(e,[s],[p])).toBe(true);
 expect(validarEvidencia({...e,facts:[a,b,{...comparison,value:{kind:'status',value:'Iguales'}}]},[s],[p])).toBe(false);
});
it('does not sum the same fact twice',()=>{
 const bad={...cost,id:'bad',derivation:{operation:'sum',inputs:[{factId:'cost'},{factId:'cost'}]}} as Fact;
 expect(validarEvidencia({...evidence(),facts:[cost,bad]},[scope],[proof])).toBe(false);
});
it('requires a positive observed count as well as volume for a fact-referenced milk mean',()=>{
 const s:Scope={...scope,operation:'milk.production',period:{...scope.period!,basis:'observation',fieldMeaning:'fecha'}};
 const p:PopulationProof={...proof,tool:'get_hato_produccion',fields:['litros_total','num_pesajes','promedio_litros']};
 const v:Fact={...cost,id:'volume',metric:'milk.volume',definitionId:'milk.volume.v1',value:{kind:'decimal',value:'10',unit:'L'},source:{...cost.source,tool:p.tool,field:'litros_total'},derivation:{operation:'sum',inputs:[{populationId:'work',field:'litros_total'}]}};
 const c:Fact={...v,id:'count',metric:'milk.count',definitionId:'milk.count.v1',value:{kind:'decimal',value:'2',unit:'registro'},source:{...v.source,field:'num_pesajes'},assertion:'record_count',derivation:{operation:'count',inputs:[{populationId:'work',field:'num_pesajes'}]}};
 const m:Fact={...v,id:'mean',metric:'milk.mean',definitionId:'milk.mean.v1',value:{kind:'decimal',value:'5',unit:'L/pesaje',denominator:'pesaje_observado'},source:{...v.source,field:'promedio_litros'},assertion:'derived_measure',derivation:{operation:'mean',inputs:[{factId:'volume'},{factId:'count'}]}};
 const e:Evidence={...evidence(),scopes:[s],facts:[v,c,m]};expect(validarEvidencia(e,[s],[p])).toBe(true);
 expect(validarEvidencia({...e,facts:[v,c,{...m,derivation:{operation:'mean',inputs:[{factId:'volume'}]}}]},[s],[p])).toBe(false);
 expect(validarEvidencia({...e,facts:[v,c,{...m,derivation:{operation:'mean',inputs:[{factId:'volume'},{factId:'volume'}]}}]},[s],[p])).toBe(false);
});
