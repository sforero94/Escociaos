import {describe,expect,it} from 'vitest';
import {ejecutarNucleoOperaciones,TAREAS_PROYECCION,RADIACION_PROYECCION,CONDUCTIVIDAD_PROYECCION} from '../utils/escoNucleoOperaciones';
import {validarEvidencia,type Metric,type Value} from '../utils/escoEvidencia';
import {componerRespuestaVerificada} from '../utils/escoRespuesta';
import type {ContextoNucleo,LecturaNucleo,PuertoNucleo,ResultadoNucleo} from '../utils/escoNucleoComun';
const now='2034-05-08T12:00:00.000Z';
const ctx=(overrides:Partial<ContextoNucleo>={}):ContextoNucleo=>({currentUserText:'Consulta de operaciones registrada.',referenceDay:'2034-05-08',startedAt:now,period:null,dateState:'absent',identities:{client:false,supplier:false},...overrides});
const personal='SYN_PERSONAL_OPERATIONS_SECRET';
const task=(overrides:Record<string,unknown>={})=>({id:'task-a',nombre:'Tarea sintética A',codigo_tarea:'T-1',estado:'En Proceso',prioridad:'Alta',lote_id:'lot-a',lote_ids:['lot-a'],lote:{id:'lot-a',nombre:'Lote A'},tipo_tarea_id:'type-a',tipo:{id:'type-a',nombre:'Riego',categoria:'Riego'},jornales_estimados:'1.25',fecha_estimada_inicio:'2034-05-01',fecha_estimada_fin:'2034-05-03',fecha_inicio_real:'2034-05-02',fecha_fin_real:null,responsable:{nombre:personal,salario:987654321},observaciones:personal,...overrides});
const ce=(overrides:Record<string,unknown>={})=>({id:'ce-a',lote_id:'lot-a',lote:{id:'lot-a',nombre:'Lote A'},fecha_monitoreo:'2034-05-01',valor_ce:1,ph:7,monitor:personal,observaciones:personal,...overrides});
const rad=(date:string,wm:number|null,extra:Record<string,unknown>={})=>({station_id:'station-a',fecha:date,radiacion_wm2_avg:wm,horas_sol_duracion:8,lluvia_confianza:'ok',observaciones:personal,...extra});
function port(data:Record<string,Record<string,unknown>[]>={},change?:(r:LecturaNucleo,table:string,query:string)=>LecturaNucleo){
 const calls:Array<{table:string;query:string}>=[];
 const fixture:Record<string,Record<string,unknown>[]>={lotes:[{id:'lot-a',nombre:'Lote A'},{id:'lot-b',nombre:'Lote B'}],tipos_tareas:[{id:'type-a',categoria:'Riego'}],tareas:[],mon_conductividad:[],clima_resumen_diario:[],...data};
 const value:PuertoNucleo={now:()=>now,read:async(table,query,keys=['id'])=>{
  calls.push({table,query});if(!(table in fixture))throw Error('Closed fixture table');
  let rows=fixture[table];const params=new URLSearchParams(query);
  for(const [key,filter]of params){if(['select','order'].includes(key))continue;const dot=filter.indexOf('.'),op=filter.slice(0,dot),operand=filter.slice(dot+1);
   rows=rows.filter(r=>op==='eq'?String(r[key])===operand:op==='gte'?r[key]!=null&&String(r[key])>=operand:op==='lte'?r[key]!=null&&String(r[key])<=operand:false);
  }
  const r:LecturaNucleo={rows,total:rows.length,capturedAt:now,identityKeys:keys,complete:true,identityUnique:true,consistency:'stable_count_pages'};
  return change?change(r,table,query):r;
 }};
 return {value,calls};
}
function valid(r:ResultadoNucleo){for(const e of r.evidence)expect(validarEvidencia(e,r.scopes,r.populations)).toBe(true);expect(JSON.stringify(r)).not.toMatch(/SYN_PERSONAL_OPERATIONS_SECRET|987654321|responsable|observaciones|salario/);}
function facts(r:ResultadoNucleo,metric:Metric){return r.evidence.flatMap(e=>e.facts).filter(f=>f.metric===metric);}
function value(r:ResultadoNucleo,metric:Metric,scopeId?:string):Value|undefined{return facts(r,metric).find(f=>!scopeId||f.scopeId===scopeId)?.value;}
function render(r:ResultadoNucleo){return componerRespuestaVerificada({...r,turnStartedAt:now,modelText:personal+' pago y éxito físico inventados'}).text;}

describe('selected operations: tasks without personnel fields',()=>{
 it('preserves all five closed statuses, priority, planned/actual dates and exact estimated journals',async()=>{
  const p=port({tareas:[task(),task({id:'task-b',nombre:'Tarea B',estado:'Banco',fecha_estimada_inicio:null,fecha_estimada_fin:null,fecha_inicio_real:null,jornales_estimados:'0.1'})]});
  const r=await ejecutarNucleoOperaciones('get_tareas',{},ctx(),p.value);valid(r);
  expect(value(r,'task.count','tasks:all')).toMatchObject({kind:'decimal',value:'2'});
  expect(value(r,'task.estimated_journals','tasks:all')).toMatchObject({kind:'decimal',value:'1.35'});
  expect(value(r,'task.status','tasks:record:1')).toEqual({kind:'status',value:'Banco'});
  expect(value(r,'task.planned_start','tasks:record:0')).toMatchObject({value:'2034-05-01'});
  expect(value(r,'task.actual_start','tasks:record:0')).toMatchObject({value:'2034-05-02'});
  expect(value(r,'task.actual_end','tasks:record:0')?.kind).toBe('unknown');
  expect(facts(r,'task.estimated_journals').every(f=>f.origin==='planned')).toBe(true);
  expect(p.calls.find(c=>c.table==='tareas')?.query).toContain('select='+TAREAS_PROYECCION);
  expect(render(r)).toContain('Tarea sintética A');expect(render(r)).not.toContain(personal);
 });
 it('binds the user status and planned range instead of contradictory model status/dates',async()=>{
  const p=port({tareas:[task(),task({id:'other',estado:'Completada'})]});
  const r=await ejecutarNucleoOperaciones('get_tareas',{estado:'Completada',date_from:'1999-01-01'},ctx({currentUserText:'Tareas en proceso.',dateState:'resolved',period:{from:'2034-05-01',to:'2034-05-07'}}),p.value);valid(r);
  expect(value(r,'task.count','tasks:all')).toMatchObject({value:'1'});
  const q=new URLSearchParams(p.calls.find(c=>c.table==='tareas')!.query);
  expect(q.get('estado')).toBe('eq.En Proceso');expect(q.getAll('fecha_estimada_inicio')).toEqual(['gte.2034-05-01','lte.2034-05-07']);
 });
 it.each([
  ['Tareas no completadas.','Completada'],['Tareas sin programadas.','Programada'],['Tareas no en proceso.','En Proceso'],
  ['Tareas excepto canceladas.','Cancelada'],['No incluyas las tareas completadas.','Completada'],['Tareas que no están completadas.','Completada'],
 ])('clarifies a negated state before any I/O instead of selecting its positive enum: %s',async(question,estado)=>{
  const p=port({tareas:[task()]});const r=await ejecutarNucleoOperaciones('get_tareas',{estado},ctx({currentUserText:question}),p.value);valid(r);
  expect(p.calls).toEqual([]);expect(r.evidence.flatMap(e=>e.facts)).toEqual([]);expect(r.evidence[0].issues[0].code).toBe('scope_ambiguous');
 });
 it.each(['Alta','Media','Baja'])('binds actual USER priority %s without adding or trusting a model argument',async prioridad=>{
  const p=port({tareas:['Alta','Media','Baja'].map(prio=>task({id:'task-'+prio,prioridad:prio}))});
  const r=await ejecutarNucleoOperaciones('get_tareas',{},ctx({currentUserText:'Tareas de prioridad '+prioridad+'.'}),p.value);valid(r);
  expect(value(r,'task.count','tasks:all')).toMatchObject({value:'1'});expect(r.scopes[0].filters.prioridad).toBe(prioridad);
  expect(new URLSearchParams(p.calls.find(c=>c.table==='tareas')!.query).get('prioridad')).toBe('eq.'+prioridad);
  expect(value(r,'task.priority','tasks:record:0')).toMatchObject({value:prioridad});
 });
 it.each(['Tareas sin prioridad alta.','No incluyas tareas de prioridad alta.','Tareas con prioridad no alta.',
  'Tareas prioridad alta o media.','Tareas prioridad alta y prioridad baja.','Tareas de prioridad urgente.'])('clarifies a negated/conflicting/unregistered priority before source I/O: %s',async question=>{
  const p=port({tareas:[task()]});const r=await ejecutarNucleoOperaciones('get_tareas',{},ctx({currentUserText:question}),p.value);valid(r);
  expect(p.calls).toEqual([]);expect(r.evidence.flatMap(e=>e.facts)).toEqual([]);expect(r.evidence[0].issues[0].code).toBe('scope_ambiguous');
 });
 it('keeps null planned fields unknown and does not substitute actual dates or zero journals',async()=>{
  const p=port({tareas:[task({fecha_estimada_inicio:null,jornales_estimados:null})]});const r=await ejecutarNucleoOperaciones('get_tareas',{},ctx(),p.value);valid(r);
  expect(value(r,'task.planned_start','tasks:record:0')?.kind).toBe('unknown');
  expect(value(r,'task.actual_start','tasks:record:0')).toMatchObject({value:'2034-05-02'});
  expect(value(r,'task.estimated_journals','tasks:all')?.kind).toBe('unknown');
 });
 it('labels partial known estimated journals as a subtotal while keeping the complete record count',async()=>{
  const p=port({tareas:[task(),task({id:'null-value',jornales_estimados:null})]});const r=await ejecutarNucleoOperaciones('get_tareas',{},ctx(),p.value);valid(r);
  expect(value(r,'task.count','tasks:all')).toMatchObject({value:'2'});
  expect(facts(r,'task.estimated_journals').find(f=>f.scopeId==='tasks:all')).toMatchObject({value:{value:'1.25'},assertion:'verified_subtotal',origin:'planned'});
 });
 it('preserves complete totals beyond the original forty-detail cap and discloses omitted detail',async()=>{
  const p=port({tareas:Array.from({length:41},(_,i)=>task({id:'task-'+i,jornales_estimados:i===40?'99':'1'}))});
  const r=await ejecutarNucleoOperaciones('get_tareas',{},ctx(),p.value);valid(r);
  expect(value(r,'task.count','tasks:all')).toMatchObject({value:'41'});expect(value(r,'task.estimated_journals','tasks:all')).toMatchObject({value:'139'});
  expect(r.scopes.filter(s=>s.id.startsWith('tasks:record:'))).toHaveLength(40);expect(r.evidence.some(e=>e.issues.some(i=>i.code==='budget_exceeded'))).toBe(true);
 });
 it('resolves canonical lot and category, including verified empty source results',async()=>{
  const p=port();const r=await ejecutarNucleoOperaciones('get_tareas',{lote_name:'Lote A',categoria:'Riego'},ctx({currentUserText:'Tareas del Lote A categoría Riego.'}),p.value);valid(r);
  expect(value(r,'task.count','tasks:all')).toMatchObject({value:'0'});expect(r.scopes[0].filters).toMatchObject({lote_id:'lot-a',categoria:'Riego'});
 });
 it.each([{lote_name:'No existe'}, {employee_name:personal}, {estado:'Estado inventado'}, {query:'select=*'}])('rejects unknown/personnel/unregistered selectors %j without broad substitution',async args=>{
  const p=port({tareas:[task()]});const r=await ejecutarNucleoOperaciones('get_tareas',args,ctx({currentUserText:'Tareas del lote No existe.'}),p.value);
  expect(r.evidence.flatMap(e=>e.facts)).toEqual([]);expect(p.calls.filter(c=>c.table==='tareas')).toEqual([]);valid(r);
 });
 it('does not widen an omitted unknown lot selector to all tasks',async()=>{
  const p=port({tareas:[task()]});const r=await ejecutarNucleoOperaciones('get_tareas',{},ctx({currentUserText:'Tareas del lote Inexistente.'}),p.value);
  expect(r.evidence.flatMap(e=>e.facts)).toEqual([]);expect(p.calls.some(c=>c.table==='tareas')).toBe(false);
 });
});

describe('selected operations: CE is recorded lot-date means, never invented sensor values',()=>{
 it('preserves zero, null, units, means/min/max/pH, monthly and lot populations',async()=>{
  const p=port({mon_conductividad:[ce({valor_ce:0,ph:null}),ce({id:'ce-b',fecha_monitoreo:'2034-05-02',valor_ce:1}),ce({id:'ce-c',fecha_monitoreo:'2034-04-02',valor_ce:null,ph:null})]});
  const r=await ejecutarNucleoOperaciones('get_conductivity_data',{},ctx(),p.value);valid(r);
  expect(value(r,'conductivity.mean','ce:all')).toMatchObject({value:'0.5',unit:'dS/m'});expect(value(r,'conductivity.min','ce:all')).toMatchObject({value:'0'});
  expect(value(r,'conductivity.max','ce:all')).toMatchObject({value:'1'});expect(value(r,'conductivity.ph_mean','ce:all')).toMatchObject({value:'7',unit:'pH'});
  expect(value(r,'conductivity.count','ce:all')).toMatchObject({value:'3'});expect(value(r,'conductivity.band','ce:all')).toEqual({kind:'status',value:'amarillo'});
  expect(r.scopes.some(s=>s.id==='ce:month:0')).toBe(true);expect(r.scopes.some(s=>s.id==='ce:lot:0:month:0')).toBe(true);
  expect(r.scopes[0].period).toBeNull();expect(p.calls[0].query).toBe('select='+CONDUCTIVIDAD_PROYECCION);
 });
 it.each([[0.49,'verde'],[0.5,'amarillo'],[1.5,'amarillo'],[1.51,'rojo']] as const)('keeps the existing configured CE boundary %s',async(n,band)=>{
  const p=port({mon_conductividad:[ce({valor_ce:n})]});const r=await ejecutarNucleoOperaciones('get_conductivity_data',{},ctx(),p.value);valid(r);expect(value(r,'conductivity.band','ce:all')).toMatchObject({value:band});
 });
 it('retains all-history and exact one-sided user bounds, never model-only opposite dates',async()=>{
  const p=port({mon_conductividad:[ce({fecha_monitoreo:'2001-01-01'}),ce({id:'ce-b',fecha_monitoreo:'2034-05-01'})]});
  const r=await ejecutarNucleoOperaciones('get_conductivity_data',{date_to:'2099-12-31'},ctx({dateState:'open',bounds:{from:'2034-01-01'}}),p.value);valid(r);
  const q=new URLSearchParams(p.calls[0].query);expect(q.getAll('fecha_monitoreo')).toEqual(['gte.2034-01-01']);
  expect(r.scopes[0].period).toBeNull();expect(r.scopes[0].filters.date_from).toBe('2034-01-01');expect(value(r,'conductivity.count','ce:all')).toMatchObject({value:'1'});
 });
 it('keeps a precise upper-only bound without inventing a lower date',async()=>{
  const p=port({mon_conductividad:[ce({fecha_monitoreo:'2001-01-01'}),ce({id:'later',fecha_monitoreo:'2034-05-01'})]});
  const r=await ejecutarNucleoOperaciones('get_conductivity_data',{},ctx({dateState:'open',bounds:{from:undefined,to:'2034-04-01'}}),p.value);valid(r);
  expect(new URLSearchParams(p.calls[0].query).getAll('fecha_monitoreo')).toEqual(['lte.2034-04-01']);expect(value(r,'conductivity.count','ce:all')).toMatchObject({value:'1'});
 });
 it('keeps verified empty population zero separate from unknown CE and pH',async()=>{
  const p=port();const r=await ejecutarNucleoOperaciones('get_conductivity_data',{},ctx(),p.value);valid(r);
  expect(value(r,'conductivity.count','ce:all')).toMatchObject({value:'0'});expect(value(r,'conductivity.mean','ce:all')?.kind).toBe('unknown');expect(value(r,'conductivity.ph_mean','ce:all')?.kind).toBe('unknown');
 });
});

describe('selected operations: radiation preserves energy/duration/configuration distinctions',()=>{
 const data=[rad('2034-05-01',100,{horas_sol_duracion:6}),rad('2034-05-02',200,{horas_sol_duracion:10}),rad('2034-04-29',50),rad('2034-04-30',50)];
 const request=ctx({dateState:'resolved',period:{from:'2034-05-01',to:'2034-05-02'}});
 it('reuses existing energy/solar-duration aggregates and absolute prior comparison with explicit union scope',async()=>{
  const p=port({clima_resumen_diario:data});const r=await ejecutarNucleoOperaciones('get_radiation_context',{period:'ytd'},request,p.value);valid(r);
  expect(value(r,'radiation.energy_mean','radiation:current:0')).toMatchObject({value:'3.6',unit:'kWh/m²/día'});expect(value(r,'radiation.sunshine_mean','radiation:current:0')).toMatchObject({value:'8',unit:'h/día'});
  expect(value(r,'radiation.energy_change')).toMatchObject({value:'2.4',unit:'kWh/m²/día'});
  const s=r.scopes.find(s=>s.id==='radiation:comparison:0')!;expect(s.period).toMatchObject({from:'2034-04-29',to:'2034-05-02',fieldMeaning:'comparison_period'});
  expect(s.filters).toMatchObject({current_from:'2034-05-01',current_to:'2034-05-02',previous_from:'2034-04-29',previous_to:'2034-04-30'});
  expect(p.calls.every(c=>c.query.startsWith('select='+RADIACION_PROYECCION))).toBe(true);
 });
 it('preserves the exact legacy 7d default API bounds and independently visible previous period',async()=>{
  const p=port();const r=await ejecutarNucleoOperaciones('get_radiation_context',{},ctx(),p.value);valid(r);
  expect(new URLSearchParams(p.calls[0].query).getAll('fecha')).toEqual(['gte.2034-05-01','lte.2034-05-08']);
  expect(new URLSearchParams(p.calls[1].query).getAll('fecha')).toEqual(['gte.2034-04-24','lte.2034-04-30']);
 });
 it('detects absent calendar dates, null energy and partial days without inventing full-day totals',async()=>{
  const p=port({clima_resumen_diario:[rad('2034-05-01',0,{horas_sol_duracion:null,lluvia_confianza:'cobertura_parcial'})]});
  const r=await ejecutarNucleoOperaciones('get_radiation_context',{},request,p.value);valid(r);
  expect(value(r,'radiation.energy_mean','radiation:current:0')).toMatchObject({value:'0'});expect(value(r,'radiation.sunshine_mean','radiation:current:0')?.kind).toBe('unknown');
  expect(value(r,'radiation.missing_days','radiation:current:0')).toMatchObject({value:'1'});expect(value(r,'radiation.partial_days','radiation:current:0')).toMatchObject({value:'1'});
  expect(facts(r,'radiation.energy_mean')[0].coverage.values).toBe('partial');
  expect(render(r)).toContain('cota inferior');
 });
 it('keeps the historical rounded band boundary distinct from day optimal-count semantics',async()=>{
  const p=port({clima_resumen_diario:[rad('2034-05-01',291.66666666666663)]});const r=await ejecutarNucleoOperaciones('get_radiation_context',{},request,p.value);valid(r);
  expect(value(r,'radiation.energy_mean','radiation:current:0')).toMatchObject({value:'7'});expect(value(r,'radiation.band','radiation:current:0')).toMatchObject({value:'alto'});
  expect(value(r,'radiation.optimal_days','radiation:current:0')).toMatchObject({value:'1'});
 });
 it('keeps separate stations and counts a station entirely absent from the current range',async()=>{
  const p=port({clima_resumen_diario:[...data,rad('2034-04-29',300,{station_id:'station-b'})]});const r=await ejecutarNucleoOperaciones('get_radiation_context',{},request,p.value);valid(r);
  const s=r.scopes.find(s=>s.id.startsWith('radiation:current:')&&s.entities[0]?.id==='station-b')!;
  expect(value(r,'radiation.energy_mean',s.id)?.kind).toBe('unknown');expect(value(r,'radiation.missing_days',s.id)).toMatchObject({value:'2'});
  expect(value(r,'radiation.energy_mean','radiation:current:0')).toMatchObject({value:'3.6'});
 });
 it('retains current measurements when the prior read is stale or unavailable, with no fabricated delta',async()=>{
  const p=port({clima_resumen_diario:data},(r,_,q)=>q.includes('2034-04-29')?{...r,capturedAt:'2034-05-07T12:00:00Z'}:r);
  const r=await ejecutarNucleoOperaciones('get_radiation_context',{},request,p.value);valid(r);
  expect(value(r,'radiation.energy_mean','radiation:current:0')).toMatchObject({value:'3.6'});expect(facts(r,'radiation.energy_change')).toEqual([]);expect(r.parts.some(p=>p.metrics.includes('radiation.energy_change'))).toBe(true);
 });
 it('keeps independent current stations and their unavailable comparison parts uniquely bound',async()=>{
  const p=port({clima_resumen_diario:[...data,rad('2034-05-01',100,{station_id:'station-b'})]},(r,_,q)=>q.includes('2034-04-29')?{...r,capturedAt:'2034-05-07T12:00:00Z'}:r);
  const r=await ejecutarNucleoOperaciones('get_radiation_context',{},request,p.value);valid(r);
  expect(new Set(r.parts.map(p=>p.id)).size).toBe(r.parts.length);expect(r.scopes.filter(s=>s.id.startsWith('radiation:current:'))).toHaveLength(2);
 });
 it('preserves ten known station parts and discloses additional-station omission instead of refusing all',async()=>{
  const p=port({clima_resumen_diario:Array.from({length:11},(_,i)=>rad('2034-05-01',100,{station_id:'station-'+i}))});const r=await ejecutarNucleoOperaciones('get_radiation_context',{},request,p.value);valid(r);
  expect(r.scopes.filter(s=>s.id.startsWith('radiation:current:'))).toHaveLength(10);expect(facts(r,'radiation.energy_mean').some(f=>f.value.kind==='decimal')).toBe(true);expect(r.evidence.some(e=>e.issues.some(i=>i.code==='budget_exceeded'))).toBe(true);
 });
});

describe('selected operations: trusted read and context invariants',()=>{
 it.each(['get_tareas','get_conductivity_data','get_radiation_context'])('rejects ambiguous/invalid user date context before any source read: %s',async tool=>{
  for(const dateState of ['ambiguous','invalid']as const){const p=port();const r=await ejecutarNucleoOperaciones(tool,{},ctx({dateState}),p.value);expect(p.calls).toEqual([]);expect(r.evidence.flatMap(e=>e.facts)).toEqual([]);valid(r);}
 });
 it.each(['count','duplicate','stale','identity','incomplete'])('does not emit known facts from an unattested source: %s',async mode=>{
  const p=port({tareas:[task()]},r=>mode==='count'?{...r,total:r.total+1}:mode==='duplicate'?{...r,rows:[...r.rows,...r.rows],total:r.total*2}:mode==='stale'?{...r,capturedAt:'2034-05-07T12:00:00Z'}:mode==='identity'?{...r,rows:r.rows.map(x=>({...x,id:' bad '}))}:{...r,complete:false as unknown as true});
  const r=await ejecutarNucleoOperaciones('get_tareas',{},ctx(),p.value);expect(r.evidence.flatMap(e=>e.facts)).toEqual([]);valid(r);
 });
 it('sanitizes source failures and unknown arguments instead of exposing raw source text',async()=>{
  const r=await ejecutarNucleoOperaciones('get_tareas',{},ctx(),{now:()=>now,read:async()=>{throw Error(personal);}});valid(r);expect(r.evidence[0].issues[0].code).toBe('source_error');
 });
 it.each(['get_tareas','get_conductivity_data'])('rejects a conflicting lot join rather than attributing another lot label: %s',async tool=>{
  const p=port({tareas:[task({lote:{id:'lot-b',nombre:'Lote B'}})],mon_conductividad:[ce({lote:{id:'lot-b',nombre:'Lote B'}})]});const r=await ejecutarNucleoOperaciones(tool,{},ctx(),p.value);valid(r);expect(r.evidence.flatMap(e=>e.facts)).toEqual([]);
 });
});
