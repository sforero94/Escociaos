import { describe, expect, it } from 'vitest';
import { ejecutarNucleoGanado, GANADO_PROYECCIONES } from '@/utils/escoNucleoGanado';
import type { ContextoNucleo, PuertoNucleo } from '@/utils/escoNucleoComun';
type Row = Record<string, unknown>;
const ctx: ContextoNucleo = { currentUserText: 'Inventario de ganado y pendientes', referenceDay: '2036-01-10', startedAt: '2036-01-10T12:00:00Z', dateState: 'resolved', period: { from: '2036-01-01', to: '2036-01-10' }, identities: { client: false, supplier: false } };
function fixture(): Record<string, Row[]> {
 return {
  gan_ubicaciones: [{ id: 'u', nombre: 'Zona sintética' }],
  gan_fincas: [{ id: 'f', nombre: 'Finca Alfa', ubicacion_id: 'u', hectareas: '8', activa: true }],
  gan_lotes: [{ id: 'l', nombre: 'Lote Alfa', finca_id: 'f', activo: true }],
  gan_potreros: ['a','b','c','d'].map(id => ({ id, nombre: 'Potrero '+id, finca_id: 'f', lote_id: 'l', etapa: 'ceba', activo: true })),
  gan_inventario: ['a','b','c','d'].map((id,i)=>({ id:'i'+id, potrero_id:id, novillos:i+1, toros:0, updated_at:'2036-01-09T00:00:00Z' })),
  gan_pesos_historico: [{ id:'w1',potrero_id:'a',fecha:'2036-01-05',peso_promedio_kg:'211.1' },{ id:'w2',potrero_id:'a',fecha:'2036-01-09',peso_promedio_kg:'255.5' }],
  gan_movimientos: [],
 };
}
function movement(id:string,n:number,origin:string|null,destination:string|null,extras:Row={}):Row {
 return { id,tipo:origin?'traslado_salida':'traslado_entrada',estado:'confirmado',fecha:'2036-01-05',potrero_origen_id:origin,potrero_destino_id:destination,novillos_delta:n,toros_delta:0,peso_promedio_kg:null,transaccion_ganado_id:null,grupo_id:'group',...extras };
}
function source(data:Record<string,Row[]>) {
 const calls:Array<{table:string;query:string}>=[];
 const port:PuertoNucleo={ now:()=> '2036-01-10T12:00:01Z', read:async(table,query,identityKeys)=> {
  calls.push({table,query});
  expect(query.split('&')[0]).toBe('select='+GANADO_PROYECCIONES[table as keyof typeof GANADO_PROYECCIONES]);
  const params=new URLSearchParams(query),fields=params.get('select')!.split(',');
  const rows=(data[table]??[]).filter(row=>[...params].every(([key,value])=>key==='select'||value.startsWith('eq.')&&String(row[key])===value.slice(3)||value.startsWith('gte.')&&String(row[key])>=value.slice(4)||value.startsWith('lte.')&&String(row[key])<=value.slice(4)||value.startsWith('in.(')&&value.slice(4,-1).split(',').map(v=>v.replace(/^"|"$/g,'')).includes(String(row[key])))).map(row=>Object.fromEntries(fields.map(k=>[k,row[k]??null])));
  return {rows,total:rows.length,capturedAt:'2036-01-10T12:00:01Z',identityKeys:identityKeys??['id'],complete:true,identityUnique:true,consistency:'stable_count_pages'};
 }};
 return {port,calls};
}
describe('independent cattle acceptance',()=>{
 it('counts a closed two-origin two-destination transfer once and retains the full external member',async()=>{
  const data=fixture(); data.gan_movimientos=[movement('m1',-2,'a',null),movement('m2',-3,'b',null),movement('m3',1,null,'c'),movement('m4',4,null,'d',{fecha:'2036-01-11'})];
  const {port}=source(data),r=await ejecutarNucleoGanado('get_ganado_movimientos_detalle',{},ctx,port),facts=r.evidence.flatMap(e=>e.facts);
  expect(facts.find(f=>f.metric==='ganado.movement.count')?.value).toEqual({kind:'decimal',value:'1',unit:'evento'});
  const event=r.scopes.find(s=>s.filters.event_kind==='g')!;
  expect(facts.find(f=>f.scopeId===event.id&&f.metric==='ganado.movement.heads')?.value).toEqual({kind:'decimal',value:'5',unit:'cabeza'});
  expect(event.filters.destination_paddock_ids).toContain('d');
  if(!r.scopes.some(s=>s.filters.membership==='linked_context_outside_period'))expect(r.evidence.some(e=>e.issues.some(i=>i.code==='budget_exceeded'))).toBe(true);
 });
 it('uses farm area once and selects the last history weight rather than movement weight',async()=>{
  const data=fixture(); data.gan_movimientos=[movement('m1',1,null,'a',{tipo:'compra',grupo_id:null,peso_promedio_kg:'999'})];
  const {port}=source(data),r=await ejecutarNucleoGanado('get_ganado_inventory',{}, {...ctx,currentUserText:'Peso por potrero y densidad'},port),facts=r.evidence.flatMap(e=>e.facts);
  expect(facts.find(f=>f.scopeId==='gan:stock:selected'&&f.metric==='ganado.density')?.value).toEqual({kind:'decimal',value:'1.3',unit:'cabeza/ha'});
  expect(facts.find(f=>f.scopeId==='gan:stock:paddock:a'&&f.metric==='ganado.weight.latest')?.value).toEqual({kind:'decimal',value:'255.5',unit:'kg'});
  expect(r.scopes.filter(s=>s.entities.some(e=>e.kind==='lot')).every(s=>!facts.some(f=>f.scopeId===s.id&&f.metric==='ganado.area'))).toBe(true);
 });
 it('keeps pending row count global and does not expose unrelated payload fields',async()=>{
  const data=fixture(); data.gan_movimientos=[movement('pending',7,null,null,{tipo:'compra',estado:'pendiente',grupo_id:null,notas:'SYN_PRIVATE_NOTE',created_by:'SYN_PRIVATE_ACTOR'})];
  const {port}=source(data),r=await ejecutarNucleoGanado('get_ganado_inventory',{finca_name:'Finca Alfa'}, {...ctx,currentUserText:'Pendientes e inventario de Finca Alfa'},port);
  expect(r.evidence.flatMap(e=>e.facts).find(f=>f.metric==='ganado.pending.count')?.value).toEqual({kind:'decimal',value:'1',unit:'registro'});
  expect(r.scopes.find(s=>s.id==='gan:pending:global')?.entities).toEqual([]);
  expect(JSON.stringify(r)).not.toMatch(/SYN_PRIVATE_NOTE|SYN_PRIVATE_ACTOR/);
 });
 it('does not certify a pending transaction as a closed event without checking its confirmed member',async()=>{
  const data=fixture();data.gan_movimientos=[movement('pending',2,null,null,{tipo:'compra',estado:'pendiente',grupo_id:null,transaccion_ganado_id:'tx'}),movement('confirmed',3,null,'a',{tipo:'compra',grupo_id:null,transaccion_ganado_id:'tx'})];
  const {port}=source(data),r=await ejecutarNucleoGanado('get_ganado_inventory',{},ctx,port);
  const pendingEventFacts=r.evidence.flatMap(e=>e.facts).filter(f=>f.metric==='ganado.movement.count'&&r.scopes.find(s=>s.id===f.scopeId)?.filters.universo==='global_pendientes');
  expect(pendingEventFacts.every(f=>f.value.kind==='unknown'||f.coverage.values!=='complete')).toBe(true);
 });
 it('denies unresolved inherited references before any source read',async()=>{
  const {port,calls}=source(fixture());
  await expect(ejecutarNucleoGanado('get_ganado_inventory',{}, {...ctx,referencePending:true},port)).rejects.toThrow('scope_ambiguous');
  expect(calls).toEqual([]);
 });
});
