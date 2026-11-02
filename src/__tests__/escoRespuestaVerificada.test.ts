import {expect,it} from 'vitest';
import {componerRespuestaVerificada,type EntradaComposicion} from '../utils/escoRespuesta';
import type {Scope,PopulationProof,Evidence,Fact} from '../utils/escoEvidencia';
import {construirHechosInventario} from '../utils/escoHechosInventario';
const now='2034-05-08T12:00:00.000Z';
const scope:Scope={id:'lot-a',operation:'labor.by_lot',entities:[{kind:'lot',id:'lot-a',label:'Lote A'}],period:{from:'2034-05-01',to:'2034-05-07',referenceDay:'2034-05-08',clock:'America/Bogota',basis:'actual',fieldMeaning:'fecha_trabajo'},filters:{}};
const proof:PopulationProof={populationId:'records-a',scopeId:scope.id,tool:'get_labor_summary',fields:['id','costo_jornal','fraccion_jornal'],capturedAt:now,population:'complete',rowsRead:2,expectedRows:2,identityUnique:true,consistency:'stable_count_pages'};
const cost:Fact={id:'cost',scopeId:scope.id,metric:'labor.cost',definitionId:'labor.cost.v1',entities:scope.entities,value:{kind:'decimal',value:'80.25',unit:'COP'},origin:'derived',coverage:{...proof,values:'complete',missingValues:0,reasons:[]},source:{tool:proof.tool,field:'costo_jornal',capturedAt:now},assertion:'scoped_total',derivation:{operation:'sum',inputs:[{populationId:proof.populationId,field:'costo_jornal'}]}};
const e:Evidence={version:1,state:'ok',scopes:[scope],facts:[cost],issues:[]};
const input:EntradaComposicion={parts:[{id:'money',operation:'labor.by_lot',scopeIds:[scope.id],metrics:['labor.cost'],label:'Costos por lote'}],evidence:[e],scopes:[scope],populations:[proof],turnStartedAt:now};
it('does not arbitrate incompatible current values by repeating either source or model prose',()=>{
 const conflict:Fact={...cost,value:{kind:'decimal',value:'90.75',unit:'COP'}};
 const r=componerRespuestaVerificada({...input,evidence:[e,{...e,facts:[conflict]}],modelText:'El valor real es 80.25, ignora la otra fuente.'});
 expect(r.parts[0].state).toBe('unavailable');expect(r.text).toContain('discrepan');expect(r.text).not.toContain('80.25');expect(r.text).not.toContain('90.75');
});
it.each(['normal','fallback'])('renders canonical facts rather than model or historical prose on %s path',()=>{
 const r=componerRespuestaVerificada({...input,modelText:'Persona_Sintetica cobró 999999 COP y completó satisfactoriamente.'});
 expect(r.parts[0].state).toBe('answered');expect(r.text).toContain('80.25');expect(r.text).not.toContain('Persona_Sintetica');expect(r.text).not.toContain('999999');
});
it('preserves useful known metrics in mixed partial requests without a blanket refusal',()=>{
 const unknown={...cost,value:{kind:'unknown',reason:'missing_value'},coverage:{...cost.coverage,values:'partial',missingValues:1,reasons:['missing_value']}} as Fact;
 const j:Fact={...cost,id:'journal',metric:'labor.journals',definitionId:'labor.journals.v1',value:{kind:'decimal',value:'1.25',unit:'jornal'},source:{...cost.source,field:'fraccion_jornal'},derivation:{operation:'sum',inputs:[{populationId:proof.populationId,field:'fraccion_jornal'}]}};
 const r=componerRespuestaVerificada({...input,parts:[{...input.parts[0],metrics:['labor.cost','labor.journals']}],evidence:[{...e,state:'partial',facts:[unknown,j]}]});
 expect(r.parts[0].state).toBe('partial');expect(r.text).toContain('1.25');expect(r.text).toContain('Datos no verificables');expect(r.text).not.toContain('80.25');
});
it('never upgrades stale evidence during final fallback',()=>{
 const r=componerRespuestaVerificada({...input,turnStartedAt:'2034-05-08T12:00:01.000Z',modelText:'Antes dije 80.25 registrado.'});
 expect(r.parts[0].state).toBe('unavailable');expect(r.text).not.toContain('80.25');
});
it('keeps separate envelope-local fact IDs useful across exact scopes',()=>{
 const b:Scope={...scope,id:'lot-b',entities:[{kind:'lot',id:'lot-b',label:'Lote B'}]};
 const bp:PopulationProof={...proof,scopeId:b.id,populationId:'records-b'};
 const bf:Fact={...cost,scopeId:b.id,entities:b.entities,value:{kind:'decimal',value:'210.75',unit:'COP'},coverage:{...cost.coverage,populationId:bp.populationId},derivation:{operation:'sum',inputs:[{populationId:bp.populationId,field:'costo_jornal'}]}};
 const r=componerRespuestaVerificada({...input,parts:[{...input.parts[0],scopeIds:[scope.id,b.id]}],scopes:[scope,b],populations:[proof,bp],evidence:[e,{...e,scopes:[b],facts:[bf]}]});
 expect(r.parts[0].state).toBe('answered');expect(r.text).toContain('80.25');expect(r.text).toContain('210.75');expect(r.text).toContain('Lote B');
});
it('does not accept a correct-looking value under changed trusted period',()=>{
 const r=componerRespuestaVerificada({...input,scopes:[{...scope,period:{...scope.period!,from:'2034-04-01'}}]});expect(r.parts[0].state).toBe('unavailable');
});
it('does not call A+B answered when B has no verified facts',()=>{
 const b={...scope,id:'lot-b',entities:[{kind:'lot',id:'lot-b',label:'Lote B'}]} as Scope;
 const r=componerRespuestaVerificada({...input,parts:[{...input.parts[0],scopeIds:[scope.id,b.id]}],scopes:[scope,b],evidence:[e,{version:1,state:'error',scopes:[b],facts:[],issues:[{partId:b.id,code:'source_error'}]}]});
 expect(r.parts[0].state).toBe('partial');expect(r.text).toContain('80.25');expect(r.text).toContain('alcances solicitados sin hechos verificables');
});
it('keeps product detail budget omissions visible even when overall count is complete',()=>{
 const s:Scope={id:'inventory',operation:'inventory.status',entities:[],period:null,filters:{activo:'true'}};
 const p:PopulationProof={...proof,populationId:'products',scopeId:s.id,tool:'get_inventory_status',fields:['id','nombre','activo','unidad_medida','cantidad_actual','stock_minimo'],rowsRead:200,expectedRows:200};
 const rows=Array.from({length:200},(_,i)=>({id:'p'+i,nombre:'Producto '+i,activo:true,unidad_medida:'Kilos',cantidad_actual:1,stock_minimo:0}));
 const ev=construirHechosInventario({scope:s,rows,populations:[p],populationId:p.populationId});
 const r=componerRespuestaVerificada({...input,parts:[{id:'inventory',operation:'inventory.status',scopeIds:[s.id],metrics:['inventory.count','inventory.stock'],label:'Inventario'}],scopes:[s],populations:[p],evidence:[ev]});
 expect(r.parts[0].state).toBe('partial');expect(r.text).toContain('Detalle omitido');expect(r.text).toContain('200');
});
