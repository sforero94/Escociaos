import {describe,it,expect} from 'vitest';
import {crearContextoNucleo} from '../utils/escoNucleoSolicitud';
import {crearPuertoNucleo} from '../utils/escoNucleoTransporte';
import {ejecutarNucleoOperaciones} from '../utils/escoNucleoOperaciones';
const now=new Date('2034-05-08T12:00:00.000Z');
function setup(question:string,previousUserText?:string){
 const ctx=crearContextoNucleo({question,now,previousUserText,previousUserAt:'2034-05-08T11:59:00.000Z',channel:'web'});
 const calls:Array<{table:string;params:URLSearchParams}>=[];
 const port=crearPuertoNucleo(ctx,{now:()=>now.toISOString(),page:async(table,query)=>{
  calls.push({table,params:new URLSearchParams(query)});return {rows:table==='lotes'?[{id:'lot-a',nombre:'Norte'}]:[],total:table==='lotes'?1:0};
 }});return {ctx,port,calls};
}
describe('independent operations scope boundary',()=>{
 it('preserves prior lot or explicitly clarifies before I/O rather than widening a follow-up',async()=>{
  const s=setup('¿Y la conductividad?','Conductividad del lote Norte del 2034-05-01 al 2034-05-07');
  const result=await ejecutarNucleoOperaciones('get_conductivity_data',{},s.ctx,s.port);
  const query=s.calls.find(c=>c.table==='mon_conductividad');
  if(query){
   expect(query.params.get('lote_id')).toBe('eq.lot-a');
   expect(result.scopes.some(scope=>scope.filters.lote_id==='lot-a')).toBe(true);
  }else{
   expect(s.calls).toHaveLength(0);
   expect(result.evidence.some(e=>e.issues.some(i=>i.code==='scope_ambiguous'))).toBe(true);
   expect(result.evidence.flatMap(e=>e.facts)).toHaveLength(0);
  }
 });
 it('does not invert a negated completed-state request',async()=>{
  const s=setup('Tareas no completadas');const result=await ejecutarNucleoOperaciones('get_tareas',{},s.ctx,s.port);
  expect(s.calls.find(c=>c.table==='tareas')?.params.get('estado')).not.toBe('eq.Completada');
  // Conservative clarification is valid; selecting the explicitly excluded state is not.
  if(s.calls.some(c=>c.table==='tareas'))expect(result.scopes.every(scope=>scope.filters.estado!=='Completada')).toBe(true);
 });
 it('does not silently drop an explicit task priority selector',async()=>{
  const s=setup('Tareas de prioridad alta');const result=await ejecutarNucleoOperaciones('get_tareas',{},s.ctx,s.port);
  const query=s.calls.find(c=>c.table==='tareas');
  expect(query===undefined||query.params.get('prioridad')==='eq.Alta').toBe(true);
  if(!query)expect(result.evidence.some(e=>e.issues.some(i=>i.code==='scope_ambiguous'))).toBe(true);
 });
});
