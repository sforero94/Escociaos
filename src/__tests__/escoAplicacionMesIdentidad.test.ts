import {describe,it,expect} from 'vitest';
import {resolverSeleccionAplicacion,ejecutarConsultaEsco,type FilaEsco} from '../utils/escoConsultas';
const early: FilaEsco={id:'early',nombre_aplicacion:'Fumigación control plaga Q abril',fecha_inicio_ejecucion:'2033-04-05',fecha_inicio_planeada:'2033-04-01'};
const late: FilaEsco={id:'late',nombre_aplicacion:'Fumigación control plaga Q septiembre',fecha_inicio_ejecucion:'2033-09-14',fecha_inicio_planeada:'2033-09-01'};
const question='¿Cómo va la aplicación contra plaga Q de septiembre de 2033?';
const select=(q=question,apps=[early,late],previous?:string)=>resolverSeleccionAplicacion({pregunta:q,anterior:previous},apps,[],false);
describe('fresh named-month application identity',()=>{
 it('retains the requested month qualifier instead of asking between different months',()=>expect(select()).toMatchObject({estado:'verificada',aplicacion_ids:['late']}));
 it('resolves the same qualified selector from the immediate prior user only',()=>expect(select('¿Y cuántos jornales llevamos en esa aplicación?',[early,late],question)).toMatchObject({estado:'verificada',aplicacion_ids:['late'],referencia:'usuario_anterior'}));
 it('preserves genuine same-month/year ambiguity',()=>expect(select(question,[early,late,{...late,id:'duplicate'}])).toMatchObject({estado:'aclarar'}));
 it('does not let an unqualified name silently choose a monthly application',()=>expect(select('¿Cómo va la aplicación contra plaga Q?')).toMatchObject({estado:'aclarar'}));
 it('separates repeated named months by the verified actual year',()=>expect(select(question,[early,late,{...late,id:'previous-year',fecha_inicio_ejecucion:'2032-09-14'}])).toMatchObject({estado:'verificada',aplicacion_ids:['late']}));
 it('does not invent a year or substitute planned dates for actual dates',()=>{
  expect(select(question,[early,{...late,fecha_inicio_ejecucion:null}])).toMatchObject({estado:'aclarar'});
  expect(select(question.replace('2033','2032'))).toMatchObject({estado:'aclarar'});
 });
 it('rejects a conflicting explicit user ID even if it is a valid catalog record',()=>expect(select(question.replace('?', ' ID early?'))).toMatchObject({estado:'aclarar'}));
 it('does not let an ID-only selector override its conflicting month qualifier',()=>expect(select('Estado de la aplicación ID early de septiembre de 2033')).toMatchObject({estado:'aclarar'}));
 it('does not reinterpret a scoped execution range as a different application name',()=>expect(select('Consumo de la aplicación Fumigación control plaga Q abril del 12 al 15 de septiembre de 2033')).toMatchObject({estado:'verificada',aplicacion_ids:['early']}));
 it('does not drop the requested month when only a different month exists',()=>expect(select(question,[early])).toMatchObject({estado:'aclarar'}));
 it('preserves a uniquely qualified prior application when resolving the prior lot',()=>expect(resolverSeleccionAplicacion({pregunta:'Consumo de esa aplicación en ese lote',anterior:question.replace('?', ' en el lote Norte?')},[early,late],[{id:'north',nombre:'Norte'}],false)).toMatchObject({estado:'verificada',aplicacion_ids:['late'],lote_ids:['north']}));
 it('keeps literal month identity independent of model-choice ordering',()=>expect(select(question,[late,early])).toMatchObject({estado:'verificada',aplicacion_ids:['late']}));
});


describe('unknown years never establish a unique monthly identity',()=>{
 it.each([null,undefined,'2033-02-30'])('keeps a same-month unknown/invalid year candidate unresolved: %s',fecha=>{
  expect(select(question,[early,late,{...late,id:'unknown-year',fecha_inicio_ejecucion:fecha}])).toMatchObject({estado:'aclarar'});
 });
 it('does not discard a name-year/date-year conflict to select a different record',()=>{
  const conflict={...late,id:'conflict',nombre_aplicacion:'Fumigación control plaga Q septiembre 2033',fecha_inicio_ejecucion:'2032-09-14'};
  expect(select(question,[late,conflict])).toMatchObject({estado:'aclarar'});
 });
 it('allows an explicit consistent user ID to resolve another candidate with unknown year',()=>{
  expect(select(question.replace('?', ' ID late?'),[late,{...late,id:'unknown-year',fecha_inicio_ejecucion:null}])).toMatchObject({estado:'verificada',aplicacion_ids:['late']});
 });
});


it('resolves the unique named month even when the tool already supplied the correct actual period',async()=>{
 const allowed=new Set(['movimientos_diarios','productos','lotes','movimientos_diarios_productos','aplicaciones_lotes','aplicaciones_lotes_planificado','aplicaciones_calculos','aplicaciones_mezclas','aplicaciones_productos','registros_trabajo']);
 const args={alcance:'periodo',application_name:'plaga Q',date_basis:'actual',date_from:'2033-09-01',date_to:'2033-09-30'};
 const result=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',args,async(table)=>{
  if(table==='aplicaciones')return [early,late];expect(allowed.has(table)).toBe(true);return [];
 },'2033-09-20',{pregunta:question});
 expect(result.error).toBeUndefined();expect(result.seleccion).toMatchObject({estado:'verificada',aplicacion_ids:['late']});
 expect((result.detalle as FilaEsco[]).map(a=>a.id)).toEqual(['late']);
});
