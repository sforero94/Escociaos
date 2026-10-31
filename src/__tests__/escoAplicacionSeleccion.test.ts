// Synthetic selection and scope regressions. No external models or production inputs.
import {describe,it,expect,vi} from 'vitest';
import {ejecutarConsultaEsco,planRespuestaAplicacion,argumentosRespuestaAplicacion,respuestaDeterministaAplicacion,aclaracionPlanAplicacion,resolverSeleccionAplicacion,type FilaEsco} from '../utils/escoConsultas';
const apps=[{id:'app-a',nombre_aplicacion:'Control Ácaro Z',estado:'En ejecución',fecha_inicio_ejecucion:'2026-10-01'}, {id:'app-b',nombre_aplicacion:'Abono sintético',estado:'En ejecución',fecha_inicio_ejecucion:'2026-10-02'}];
function database(extra:FilaEsco[]=[],nearLot=false) {
 const db:Record<string,FilaEsco[]>={aplicaciones:[...apps,...extra],lotes:[{id:'north',nombre:'Norte'},{id:'south',nombre:nearLot?'Norte2':'Sur'}],productos:[{id:'p',nombre:'Insumo',unidad_medida:'L'}],movimientos_diarios:[{id:'n',aplicacion_id:'app-a',lote_id:'north',fecha_movimiento:'2026-10-20'},{id:'s',aplicacion_id:'app-a',lote_id:'south',fecha_movimiento:'2026-10-20'}],movimientos_diarios_productos:[{id:'cn',movimiento_diario_id:'n',producto_id:'p',cantidad_utilizada:1,unidad:'L'},{id:'cs',movimiento_diario_id:'s',producto_id:'p',cantidad_utilizada:2,unidad:'L'}],aplicaciones_lotes:[],aplicaciones_lotes_planificado:[],aplicaciones_calculos:[],aplicaciones_mezclas:[],aplicaciones_productos:[],registros_trabajo:[]};
 return async(table:string,query:string)=>{if(!(table in db))throw Error('Unexpected synthetic table');const p=new URLSearchParams(query);let r=db[table];for(const[k,v]of p){if(['select','order','offset','limit'].includes(k))continue;const i=v.indexOf('.'),op=v.slice(0,i),val=v.slice(i+1);r=r.filter(x=>op==='eq'?String(x[k])===val:op==='in'?val.slice(1,-1).split(',').map(y=>y.replace(/"/g,'')).includes(String(x[k])):op==='gte'?x[k]!=null&&String(x[k])>=val:op==='lte'?x[k]!=null&&String(x[k])<=val:false);}return r.slice(Number(p.get('offset')??0),Number(p.get('offset')??0)+Number(p.get('limit')??200));};
}
async function answer(q:string,args:FilaEsco,extra:FilaEsco[]=[],anterior?:string,hoy='2026-10-30') {
 const plan=planRespuestaAplicacion(q,hoy),bound=argumentosRespuestaAplicacion(plan,args);
 const r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',bound,database(extra),hoy,{pregunta:q,anterior});
 return {plan,bound,r,text:respuestaDeterministaAplicacion(plan,JSON.stringify(r),bound)};
}
async function loopProbe(sequence:string[],options:{question?:string;previous?:string;wrong?:boolean;fail?:boolean;extra?:FilaEsco[]}={}) {
 const modulePath='../supabase/functions/server/chat.tsx';
 const {llmToolLoop}=await import(modulePath) as {llmToolLoop:(messages:{role:string;content:string}[])=>Promise<{text:string;toolInteractions:{tool:string;args:FilaEsco;result_summary:string}[]}>};const read=database(options.extra??[]);let calls=0;const unexpected:string[]=[],reads:string[]=[];
 vi.stubGlobal('Deno',{env:{get:(key:string)=>({SUPABASE_URL:'https://review-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',OPENROUTER_API_KEY:'synthetic'} as Record<string,string>)[key]}});
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const req=new Request(input,init),u=new URL(req.url);
  if(req.url==='https://openrouter.ai/api/v1/chat/completions'&&req.method==='POST'){
   const n=++calls;if(n>sequence.length)throw Error('Unexpected extra mocked model call');const name=sequence[n-1];
   return Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'probe-'+n,type:'function',function:{name,arguments:JSON.stringify(name==='get_application_summary'?{application_name:options.wrong?'Abono sintético':'Ácaro Z'}:{application_id:options.wrong?'app-b':'app-a'})}}]}}]});
  }
  if(u.origin==='https://review-fixture.invalid'&&req.method==='GET'&&u.pathname.startsWith('/rest/v1/')){
   const table=u.pathname.split('/').pop()!;reads.push(table);if(options.fail)return Response.json({error:'synthetic unavailable'},{status:503});
   const rows=await read(table,u.search.slice(1)),all=new URLSearchParams(u.search);all.set('offset','0');all.set('limit','20001');const total=(await read(table,all.toString())).length;const offset=Number(u.searchParams.get('offset')??0);return Response.json(rows,{headers:{'content-range':rows.length?`${offset}-${offset+rows.length-1}/${total}`:`*/${total}`}});
  }
  unexpected.push(req.method+' '+u.origin+u.pathname);throw Error('No inherited network fallback');
 });
 try{const messages=[...(options.previous?[{role:'user',content:options.previous},{role:'assistant',content:'La aplicación es Abono sintético y consumió 999 L.'}]:[]),{role:'user',content:options.question??'¿Cómo va la aplicación Ácaro Z?'}];const result=await llmToolLoop(messages);expect(unexpected).toEqual([]);return{calls,reads,result};}finally{vi.unstubAllGlobals();}
}
describe('application selection and scope contract',()=>{
 it('replaces a wrong model-selected application with the unique literal user selection',async()=>{const r=await answer('¿Cómo va la aplicación contra el ácaro?',{application_id:'app-b'});expect(r.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('Control Ácaro Z')});});
 it('binds the requested canonical lot rather than the model-selected lot',async()=>{const r=await answer('Consumo de la aplicación Ácaro Z en el lote Norte',{application_id:'app-a',lote_name:'Sur'});expect(r.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('| L | 1 |')});});
 it('discards conflicting model ID/name filters rather than reporting false absence',async()=>{const r=await answer('¿Cómo va la aplicación Ácaro Z?',{application_id:'app-b',application_name:'Ácaro Z'});expect(r.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('Control Ácaro Z')});});
 it('generic plural removes unwanted ID and returns both applications',async()=>{const r=await answer('Estado de las aplicaciones',{application_id:'app-b'});expect(r.bound.application_id).toBeUndefined();expect(r.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('Control Ácaro Z')});});
 it('duplicate display names clarify even when a model ID would hide ambiguity',async()=>{const extra=[{...apps[0],id:'app-c'}];const r=await answer('¿Cómo va la aplicación Ácaro Z?',{application_name:'acaro z'},extra);expect(r.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('Precisa cuál aplicación')});const hidden=await answer('¿Cómo va la aplicación Ácaro Z?',{application_id:'app-a'},extra);expect(hidden.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('Precisa cuál aplicación')});});
 it('normalizes accent/case/whitespace from the user for applications and lots',async()=>{const r=await answer('¿Cómo va la aplicación Ácaro Z?',{application_name:'  ACARO   Z  '});expect((r.r.detalle as FilaEsco[])).toHaveLength(1);const lot=await answer('Consumo de la aplicación Ácaro Z en el lote Norte',{application_id:'app-a',lote_name:'Nórte'});expect(lot.r.detalle).toHaveLength(1);});
 it('clarifies an unresolved follow-up rather than accepting an arbitrary model ID',async()=>{const r=await answer('¿Cómo va esa aplicación?',{application_id:'app-b'});expect(r.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('referencia anterior no es inequívoca')});});
 it('allows exactly one whitelisted discovery round before fresh execution evidence',async()=>{const r=await loopProbe(['get_application_summary','get_aplicaciones_ejecucion']);expect(r.calls).toBe(2);expect(r.result.toolInteractions.map(t=>t.tool)).toEqual(['get_application_summary','get_aplicaciones_ejecucion']);expect(r.result.text).toContain('Control Ácaro Z');const wrong=await loopProbe(['get_application_summary','get_aplicaciones_ejecucion'],{wrong:true});expect(wrong.result.text).toContain('Control Ácaro Z');expect(wrong.result.text).not.toContain('Abono sintético');});
 it('does not permit a second discovery round or non-whitelisted writes',async()=>{const repeated=await loopProbe(['get_application_summary','get_application_summary']);expect(repeated.calls).toBe(2);expect(repeated.result.text).toContain('No pude consolidar');const forbidden=await loopProbe(['commit_memory_save']);expect(forbidden.calls).toBe(1);expect(forbidden.result.toolInteractions[0].result_summary).toContain('solo permite');expect(forbidden.reads).toEqual([]);});
 it('does not continue after a failed discovery call',async()=>{const r=await loopProbe(['get_application_summary','get_aplicaciones_ejecucion'],{fail:true});expect(r.calls).toBe(1);expect(r.result.text).toContain('No pude consolidar');});
 it('rebinds actual-loop arguments from the user rather than wrong model or assistant figures',async()=>{const r=await loopProbe(['get_aplicaciones_ejecucion'],{question:'¿Cómo va esa aplicación?',previous:'¿Cómo va la aplicación Ácaro Z?',wrong:true});expect(r.result.text).toContain('Control Ácaro Z');expect(r.result.text).not.toContain('Abono sintético');expect(r.result.toolInteractions[0].args.application_id).toBe('app-a');expect(r.reads.filter(t=>t==='aplicaciones')).toHaveLength(1);expect(r.reads.filter(t=>t==='lotes')).toHaveLength(1);});
 it('clarifies unsupported time forms before a mocked model can give unbounded figures',async()=>{for(const question of ['Consumo de la aplicación Ácaro Z hace tres siglos','Consumo de la aplicación Ácaro Z del 2026-11-02 al 2026-11-01','Consumo de la aplicación Ácaro Z hoy y ayer']){const r=await loopProbe([],{question});expect(r.calls).toBe(0);expect(r.reads).toEqual([]);expect(r.result.text).toContain('Necesito precisar el alcance');}});
 it('rejects conflicting user name/ID selectors, not just model conflicts',async()=>{const r=await answer('¿Cómo va la aplicación Ácaro Z ID app-b?',{application_id:'app-b'});expect(r.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('nombre y el ID')});});
 it('honors an explicit user ID despite duplicate names',async()=>{const r=await answer('Estado de la aplicación ID app-a',{},[{...apps[0],id:'app-c'}]);expect(r.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('(ID app-a)')});});
 it('uses only the immediate explicit prior user selector and requeries fresh records',async()=>{const r=await answer('¿Cómo va esa aplicación?',{application_id:'app-b'},[],'¿Cómo va la aplicación Ácaro Z?');expect(r.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('Control Ácaro Z')});const stale=await answer('¿Cómo va esa aplicación?',{application_id:'app-a'},[],'Dame la leche de ayer');expect(stale.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('referencia anterior no es inequívoca')});});
 it('does not invent a synonym alias and preserves duplicate-lot ambiguity',async()=>{const unknown=await answer('Estado de la aplicación acaricida',{});expect(unknown.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('Precisa el nombre o ID')});expect(resolverSeleccionAplicacion({pregunta:'Consumo de la aplicación Ácaro Z en el lote Norte'},apps,[{id:'n1',nombre:'Norte'},{id:'n2',nombre:'Nórte'}],false)).toMatchObject({estado:'aclarar'});});
 it('preserves canonical lot IDs rather than expanding a selected display-name prefix',async()=>{const q='Consumo de la aplicación Ácaro Z en el lote north';const p=planRespuestaAplicacion(q,'2026-10-30'),args=argumentosRespuestaAplicacion(p,{});const r=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',args,database([],true),'2026-10-30',{pregunta:q});expect((r.detalle as FilaEsco[])[0].hechos_ejecucion).toMatchObject({alcance:{lote_ids:['north']}});expect(respuestaDeterministaAplicacion(p,JSON.stringify(r),args)).toMatchObject({tipo:'texto',texto:expect.stringContaining('| L | 1 |')});});
 it('resolves a prior explicit user application ID and lot reference against fresh catalogs',async()=>{const prior=await answer('¿Cómo va esa aplicación?',{application_id:'app-b'},[],'Estado de la aplicación ID app-a');expect(prior.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('(ID app-a)')});const both=await answer('Consumo de esa aplicación en ese lote',{application_id:'app-b',lote_name:'Sur'},[],'Consumo de la aplicación Ácaro Z en el lote Norte');expect(both.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('| L | 1 |')});});
 it('clarifies malformed or conflicting numeric ranges rather than widening',async()=>{for(const q of ['Consumo de la aplicación Ácaro Z del 31/02/2026 al 02/03/2026','Consumo de la aplicación Ácaro Z del 2 al 1 de noviembre de 2026','Consumo de la aplicación Ácaro Z del 01/11/2026 al 02/11/2026 hoy'])expect(aclaracionPlanAplicacion(planRespuestaAplicacion(q,'2026-10-30'))).toBeTruthy();});
 it('measures the same frozen 41 wordings without model calls',async()=>{
 const matrix:Record<string,string[]>={
 planned:[
 'Consulta de solo lectura: ¿Qué aplicaciones están planeadas para noviembre de 2026?',
 '¿Qué aplicaciones están planeadas para noviembre de 2026?',
 '¿Cuáles aplicaciones están planeadas para noviembre de 2026?',
 'Dame las aplicaciones planeadas para noviembre de 2026',
 'Muéstrame las aplicaciones planificadas para noviembre de 2026',
 '¿Qué fumigaciones están planeadas para noviembre de 2026?',
 '¿Qué fertilizaciones tenemos planeadas para noviembre de 2026?',
 'Lista las aplicaciones planeadas de noviembre de 2026',
 '¿Qué aplicaciones hay planeadas en noviembre de 2026?',
 '¿Cuáles son las aplicaciones planeadas durante noviembre de 2026?',
 '¿Qué aplicaciones están previstas para noviembre de 2026?',
 '¿Cuáles aplicaciones vamos a ejecutar en noviembre de 2026?'],
 comparisons:[
 'Compara las fechas planeadas y reales de la aplicación Ácaro Z',
 '¿La aplicación Ácaro Z empezó antes o después de lo planeado?',
 'Dame las fechas planeadas y las fechas reales de la aplicación Ácaro Z',
 '¿Cuántos días de retraso tuvo la aplicación Ácaro Z respecto al plan?',
 'Consumo real frente a dosis planeadas de la aplicación Ácaro Z',
 'Compara lo planeado con lo ejecutado en la aplicación Ácaro Z'],
 dates:[
 'Consumo de la aplicación Ácaro Z del 2026-11-01 al 2026-11-02',
 'Consumo de la aplicación Ácaro Z entre 2026-11-01 y 2026-11-02',
 'Consumo de la aplicación Ácaro Z desde 2026-11-01 hasta 2026-11-02',
 'Consumo de la aplicación Ácaro Z del 01/11/2026 al 02/11/2026',
 'Consumo de la aplicación Ácaro Z del 1 al 2 de noviembre de 2026',
 'Consumo de la aplicación Ácaro Z hoy',
 'Consumo de la aplicación Ácaro Z ayer',
 'Consumo de la aplicación Ácaro Z este mes',
 'Consumo de la aplicación Ácaro Z mes pasado',
 'Consumo de la aplicación Ácaro Z esta semana',
 'Consumo de la aplicación Ácaro Z semana pasada',
 'Consumo de la aplicación Ácaro Z anteayer',
 'Consumo de la aplicación Ácaro Z hace dos días',
 'Consumo de la aplicación Ácaro Z hoy y ayer',
 'Consumo de la aplicación Ácaro Z del 2026-11-01 al 2026-11-02 hoy'],
 punctuation:[
 '¿Cómo va la aplicación Ácaro Z?',
 '¿Cómo va la aplicación Ácaro Z, en el lote Norte?',
 'Consulta de solo lectura: ¿Cómo va la aplicación Ácaro Z, en el lote Norte?',
 '¿Cómo va la aplicación Ácaro Z — en el lote Norte?',
 '¿Cómo va la aplicación Ácaro Z (lote Norte)?',
 '¿Cómo va la aplicación «Ácaro Z»?',
 '¿Cómo va la aplicación: Ácaro Z?',
 '¿Cómo va la aplicación Ácaro Z? Dame también la lluvia.']};
 const observed:Record<string,{useful:number;clarifications:number}>={};
 for(const[group,qs]of Object.entries(matrix)){
  const rs=[];let useful=0,clarifications=0;
  for(const [index,q]of qs.entries()) {
   const p=planRespuestaAplicacion(q,'2027-01-01');
   if(p.tipo==='aplicacion') {
    const a=await answer(q,{application_id:'app-b',lote_name:'Sur'},[],undefined,'2027-01-01');
    expect(a.text.tipo).toBe('texto');if(a.text.tipo==='texto'){expect(a.text.texto).not.toContain('No pude verificar');expect(a.text.texto).not.toContain('Precisa');}
    useful++;
    if(group==='planned'){expect(p.base).toBe('planned');expect(p.rango).toEqual({desde:'2026-11-01',hasta:'2026-11-30'});}
    if(group==='dates') {
     const ranges=[['2026-11-01','2026-11-02'],['2026-11-01','2026-11-02'],['2026-11-01','2026-11-02'],['2026-11-01','2026-11-02'],['2026-11-01','2026-11-02'],['2027-01-01','2027-01-01'],['2026-12-31','2026-12-31'],['2027-01-01','2027-01-31'],['2026-12-01','2026-12-31'],['2026-12-28','2027-01-03'],['2026-12-21','2026-12-27'],['2026-12-30','2026-12-30'],['2026-12-30','2026-12-30']];
     expect(p.rango).toEqual({desde:ranges[index][0],hasta:ranges[index][1]});
    }
   } else {expect(aclaracionPlanAplicacion(p)).toBeTruthy();clarifications++;}
   rs.push({q,...p});
  }
  observed[group]={useful,clarifications};console.log('MATRIX '+group,JSON.stringify(rs));
 }
 expect(observed).toEqual({planned:{useful:10,clarifications:2},comparisons:{useful:1,clarifications:5},dates:{useful:13,clarifications:2},punctuation:{useful:7,clarifications:1}});
 console.log('COVERAGE_AFTER',JSON.stringify(observed));
 });
});


describe('literal-month identity and follow-up safeguards',()=>{
 it('binds the full literal month in a fresh name instead of selecting another month',async()=>{
  const extra=[{...apps[0],id:'may',nombre_aplicacion:'Control Plaga Q mayo'},{...apps[0],id:'june',nombre_aplicacion:'Control Plaga Q junio'}];
  const r=await answer('¿Cómo va la aplicación Control Plaga Q mayo?',{application_id:'june'},extra);
  expect(r.bound.application_id).toBe('may');expect(r.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('(ID may)')});
 });
 it('does not resolve a follow-up using assistant identity or a stale user reference',async()=>{
  for(const previous of [undefined,'Dame la lluvia','¿Y cuántos jornales llevamos en esa aplicación?']) {
   const r=await answer('¿Y cuántos jornales llevamos en esa aplicación?',{application_id:'app-b'},[],previous);
   expect(r.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('referencia anterior no es inequívoca')});
  }
 });
 it('keeps ambiguous prior names unresolved rather than using the model-selected ID',async()=>{
  const r=await answer('¿Y cuántos jornales llevamos en esa aplicación?',{application_id:'app-a'},[{...apps[0],id:'duplicate'}],'¿Cuánto se ha usado en la aplicación Ácaro Z?');
  expect(r.text).toMatchObject({tipo:'texto',texto:expect.stringContaining('Precisa cuál aplicación')});
 });
});


describe('monthly selector through the closed actual loop',()=>{
 it('answers the requested named month despite a wrong model ID and another monthly record',async()=>{
  const extra=[{...apps[0],id:'spring',nombre_aplicacion:'Fumigación control plaga Q abril',fecha_inicio_ejecucion:'2033-04-05'},
   {...apps[0],id:'autumn',nombre_aplicacion:'Fumigación control plaga Q septiembre',fecha_inicio_ejecucion:'2033-09-14'}];
  const r=await loopProbe(['get_aplicaciones_ejecucion'],{question:'¿Cómo va la aplicación contra plaga Q de septiembre de 2033?',wrong:true,extra});
  expect(r.calls).toBe(1);expect(r.result.text).toContain('Fumigación control plaga Q septiembre');
  expect(r.result.text).not.toContain('Precisa cuál');expect(r.result.text).not.toContain('Fumigación control plaga Q abril');
  expect(r.result.toolInteractions[0].args.application_id).toBe('autumn');
 });
});
