import {describe,expect,it} from 'vitest';
import {APPLICATION_METRICS,OperationFailure,reconciliarSolicitudAplicacion,requestedApplicationMetrics,textoPartesAplicacion} from '../utils/escoOperacionContrato';

describe('current-user application presentation contract independent of model proposal',()=>{
 const questions=[
  {question:'¿Qué productos se usaron en la aplicación sintética Q?',expected:['quantity']},
  {question:'Muéstrame los productos usados de la aplicación Q',expected:['quantity']},
  {question:'Consulta los insumos y sus cantidades en la aplicación Q',expected:['quantity']},
  {question:'¿Qué insumos se utilizaron en la aplicación Q?',expected:['quantity']},
  {question:'Jornales y costo laboral registrado de la aplicación Q',expected:['labor']},
  {question:'Consumo real y mano de obra de la aplicación Q',expected:['labor','quantity']},
  {question:'Estado y fechas de la aplicación Q',expected:['dates','status']},
  {question:'Compara fechas planeadas y reales de la aplicación Q; muestra consumo registrado',expected:['quantity','date_comparison']},
 ] as const;
 it.each(questions.flatMap(q=>[undefined,...APPLICATION_METRICS,['status','dates'],['quantity','labor']].map(proposed=>({...q,proposed}))))('keeps USER parts for $question despite proposed $proposed',({question,expected,proposed})=>{
  const r=reconciliarSolicitudAplicacion(question,proposed);
  expect(r.requestedMetrics).toEqual(expected);expect(r.expectedMetrics).toEqual(expected);expect(r.metricsToExecute).toEqual(expected);
  expect(r.intent).toBe('explicit_user');
  expect(r.validatedProposedMetrics).toEqual(proposed===undefined?[]:Array.isArray(proposed)?proposed:[proposed]);
  expect(r.metricsToExecute).not.toContain('theoretical');
 });
 it.each(['status','labor'] as const)('reports requested quantity missing under a valid but wrong %s proposal',proposed=>{
  const r=reconciliarSolicitudAplicacion('¿Qué productos se usaron en la aplicación Q?',proposed);
  expect(r.missingRequestedMetrics).toEqual(['quantity']);expect(r.discardedProposedMetrics).toEqual([proposed]);
  expect(r.metricsToExecute).toEqual(['quantity']);
 });
 it('preserves all requested siblings when a valid proposal is only a subset',()=>{
  const r=reconciliarSolicitudAplicacion('Consumo registrado, fechas y jornales de la aplicación Q',['quantity','dates']);
  expect(r.expectedMetrics).toEqual(['labor','quantity','dates']);expect(r.missingRequestedMetrics).toEqual(['labor']);
 });
 it('recognizes that a proposed literal date comparison contains its requested dates',()=>{
  const r=reconciliarSolicitudAplicacion('Fechas de la aplicación Q','date_comparison');
  expect(r.missingRequestedMetrics).toEqual([]);expect(r.metricsToExecute).toEqual(['dates']);
 });
 it.each([
  ['No incluyas estado; solo consumo registrado',['quantity']],
  ['Sin fechas ni estado; muestra jornales',['labor']],
  ['No muestres insumos y sus cantidades; solo estado',['status']],
  ['No quiero consumo registrado ni jornales; solo fechas',['dates']],
  ['Solo consumo registrado, sin estimación teórica',['quantity']],
  ['Ejemplo: productos usados y jornales; muestra fechas',['dates']],
  ['Consulta de solo lectura: Ejemplo: productos usados y jornales; muestra estado',['status']],
  ['«insumos y sus cantidades»; consulta el estado',['status']],
  ['Antes dijiste consumo registrado; muestra fechas',['dates']],
 ] as const)('does not restore negated or quoted parts: %s',(question,expected)=>{
  const r=reconciliarSolicitudAplicacion(question,[...APPLICATION_METRICS]);expect(r.expectedMetrics).toEqual(expected);expect(r.metricsToExecute).toEqual(expected);
 });
 it('only current explicit calculation purpose grants theoretical presentation',()=>{
  const positive=reconciliarSolicitudAplicacion('Estima la dosis teórica de la aplicación Q','status');
  expect(positive.expectedMetrics).toEqual(['theoretical']);expect(positive.missingRequestedMetrics).toEqual(['theoretical']);
  for(const question of ['Estado de la aplicación Calcula Dosis','«Estima la dosis teórica»; muestra estado','No calcules dosis; muestra consumo registrado','Y ahora solo consumo registrado']){
   expect(reconciliarSolicitudAplicacion(question,'theoretical').metricsToExecute).not.toContain('theoretical');
  }
 });
 it.each(['¿Cómo va la aplicación Q?','Avance de la aplicación Q','Progreso de la aplicación Q'].flatMap(question=>[undefined,'status','quantity',['status','dates']].map(proposed=>({question,proposed}))))('preserves the existing complete real-record progress operation: $question / $proposed',({question,proposed})=>{
  const r=reconciliarSolicitudAplicacion(question,proposed);
  expect(new Set(r.expectedMetrics)).toEqual(new Set(['status','dates','quantity','labor']));
  expect(r.metricsToExecute).toEqual(r.expectedMetrics);expect(r.expectedMetrics).not.toContain('theoretical');
 });
 it.each([
  ['Cómo va la aplicación Q, sin consumo',['status','dates','labor']],
  ['Cómo va la aplicación Q; no muestres estado',['dates','quantity','labor']],
  ['Avance de la aplicación Q; no incluyas jornales',['status','dates','quantity']],
  ['Progreso de la aplicación Q; no muestres estado ni fechas',['quantity','labor']],
  ['No quiero progreso de la aplicación Q; solo estado',['status']],
 ] as const)('preserves explicit exclusions within the real-record progress operation: %s',(question,expected)=>{
  expect(new Set(reconciliarSolicitudAplicacion(question,'status').expectedMetrics)).toEqual(new Set(expected));
 });
 it.each(['Consumo de la aplicación Q','Consumos de la aplicación Q','Muestra el consumo de la aplicación Q'].flatMap(question=>['status','labor',undefined].map(proposed=>({question,proposed}))))('preserves plain registered-consumption semantics: $question / $proposed',({question,proposed})=>{
  expect(reconciliarSolicitudAplicacion(question,proposed).expectedMetrics).toEqual(['quantity']);
 });
 it.each(['Consumo teórico de la aplicación Q','Consumo estimado de la aplicación Q','Consumos planeados de la aplicación Q','Consumo previsto de la aplicación Q','Estima el consumo teórico de la aplicación Q'])('does not turn planned or theoretical consumption into actual consumption: %s',question=>{
  expect(reconciliarSolicitudAplicacion(question,'quantity').metricsToExecute).not.toContain('quantity');
 });
 it('keeps explicitly separate actual consumption beside an explicitly requested estimate',()=>{
  const r=reconciliarSolicitudAplicacion('Estima el consumo teórico de la aplicación Q; muestra consumo registrado','status');
  expect(new Set(r.expectedMetrics)).toEqual(new Set(['quantity','theoretical']));
 });
 it.each([null,[],{},false,0,'alien',['status','alien'],['status',null]])('rejects malformed proposed metric %s rather than silently repairing its envelope',proposed=>{
  expect(()=>reconciliarSolicitudAplicacion('Consumo registrado de aplicación Q',proposed)).toThrow(OperationFailure);
 });
 it('marks unresolved wording defaults without certifying the whole question or granting theoretical purpose',()=>{
  const r=reconciliarSolicitudAplicacion('Consulta la aplicación Q','theoretical');
  expect(r.intent).toBe('conservative_default');expect(r.requestedMetrics).toEqual([]);expect(r.expectedMetrics).toEqual(['status','dates']);
  expect(r.metricsToExecute).toEqual(['status','dates']);expect(r.discardedProposedMetrics).toEqual(['theoretical']);
  expect(r).not.toHaveProperty('complete');expect(r).not.toHaveProperty('coverage');
 });
 it('does not use defaults to restore explicitly forbidden state/date parts',()=>{
  const r=reconciliarSolicitudAplicacion('No muestres estado; no incluyas fechas','status');
  expect(r.expectedMetrics).toEqual([]);expect(r.metricsToExecute).toEqual([]);expect(r.intent).toBe('unresolved');
 });
 it('returns presentation metadata only, with no source identity, date, access or historical authority',()=>{
  const r=reconciliarSolicitudAplicacion('Consumo registrado en aplicación Q del lote Claro durante abril de 2034','status');
  expect(Object.keys(r).sort()).toEqual(['requestedMetrics','expectedMetrics','validatedProposedMetrics','metricsToExecute','missingRequestedMetrics','discardedProposedMetrics','intent'].sort());
  expect(JSON.stringify(r)).not.toMatch(/Claro|2034|application_id|date_from|date_to|role/);
  r.metricsToExecute.push('labor');expect(reconciliarSolicitudAplicacion('Consumo registrado en aplicación Q','status').metricsToExecute).toEqual(['quantity']);
 });
 it('keeps the prior extraction API consistent with the new authoritative expected parts',()=>{
  for(const {question}of questions)expect(requestedApplicationMetrics(question)).toEqual(reconciliarSolicitudAplicacion(question,undefined).requestedMetrics);
 });
 it.each([
  ['Estado de la aplicación Q; por separado, jornales y costo de todas las labores por lote la semana pasada',['status']],
  ['Consumo registrado de la aplicación Q; por separado, fechas de las compras de abril de 2034',['quantity']],
  ['Estado de la aplicación Q; consulta la mano de obra general por lote',['status']],
  ['Estado de la aplicación Q; muestra fechas de los partos',['status']],
  ['Consumo registrado de la aplicación Q; muestra las fechas de ingresos registrados',['quantity']],
  ['Muestra productos usados en la aplicación Q y consulta fechas de las compras',['quantity']],
  ['Consumo registrado de la aplicación Q, por separado fechas de las compras',['quantity']],
  ['Estado de la aplicación Q; consulta compras; y las fechas',['status']],
  ['Compras de abril; estado de la aplicación Q; y sus fechas',['dates','status']],
  ['Estado de la aplicación Q; muestra jornales',['labor','status']],
  ['Consumo registrado de la aplicación Q; sin fechas ni estado',['quantity']],
  ['No incluyas estado de la aplicación Q; consulta las fechas de las compras',[]],
 ] as const)('binds expected metrics only to their application clauses: %s',(question,expected)=>{
  expect(requestedApplicationMetrics(question)).toEqual(expected);
  expect(reconciliarSolicitudAplicacion(question,'labor').requestedMetrics).toEqual(expected);
 });
 it('does not turn foreign negation into application date intent or erase useful application clauses',()=>{
  const question='No consultes fechas de las compras; muestra consumo registrado de la aplicación Q; no incluyas jornales';
  const text=textoPartesAplicacion(question);
  expect(text).toContain('consumo registrado de la aplicación Q');expect(text).toContain('no incluyas jornales');expect(text).not.toContain('compras');
  expect(requestedApplicationMetrics(question)).toEqual(['quantity']);
 });
 it.each(['Y cuántos jornales llevamos','Muestra fechas; no incluyas estado','Consumo registrado y jornales'])('preserves metric-only current continuations without inventing a domain: %s',question=>{
  expect(textoPartesAplicacion(question)).toBeTruthy();expect(requestedApplicationMetrics(question).length).toBeGreaterThan(0);
 });
});
