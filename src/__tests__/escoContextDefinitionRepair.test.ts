import {describe,it,expect} from 'vitest';
import {analizarPropositoUsuario,resolverContextoSolicitudUsuario,type AntecedenteUsuarioSolicitud} from '../utils/escoReferenciaSolicitud';
import {crearContextoNucleo} from '../utils/escoNucleoSolicitud';
const now=new Date('2034-05-02T03:00:00Z'); // Bogotá May 1
const root='Estado y fechas de la aplicación Sol en lote Norte este mes';
const at='2034-05-01T03:00:00Z'; // Bogotá April 30
const history:AntecedenteUsuarioSolicitud[]=[{id:'u1',question:root,createdAt:at},{id:'u2',question:'¿Y los jornales de esa aplicación?',createdAt:'2034-05-01T03:02:00Z'}];

describe('one USER-derived temporal/reference proposal across consumers',()=>{
 it.each(['¿Y las fechas de esa aplicación?','¿Cuáles fueron las fechas de esa aplicación?','Muéstrame las fechas de esa aplicación','Consulta de solo lectura: ¿Cuáles fueron las fechas de esa aplicación?'])('preserves the same scope independent of prefix: %s',question=>{
  const input={question,now,previousUserText:root,previousUserAt:at};
  const r=resolverContextoSolicitudUsuario(input);
  expect(r.reference.state).toBe('resolved');expect(r.period).toMatchObject({state:'resolved',from:'2034-04-01',to:'2034-04-30'});
  expect(r.selectorProposals).toContainEqual({kind:'aplicacion',value:'sol'});expect(r.selectorProposals).toContainEqual({kind:'lote',value:'norte'});
  expect(crearContextoNucleo(input).period).toEqual({from:'2034-04-01',to:'2034-04-30'});
 });
 it('replays a bounded chronological USER chain without assistant facts or IDs',()=>{
  const input={question:'¿Cuáles fueron las fechas de esa aplicación?',now,historyUsers:history};
  const r=resolverContextoSolicitudUsuario(input);expect(r.reference.state).toBe('resolved');
  expect(r.period).toMatchObject({from:'2034-04-01',to:'2034-04-30'});expect(r.selectorProposals).toContainEqual({kind:'aplicacion',value:'sol'});
  expect(JSON.stringify(r)).not.toContain('u1');expect(JSON.stringify(r)).not.toContain('u2');
  expect(crearContextoNucleo(input).period).toEqual({from:'2034-04-01',to:'2034-04-30'});
 });
 it('current explicit period replaces inherited period across month boundary',()=>{
  const r=resolverContextoSolicitudUsuario({question:'Fechas de esa aplicación del 2034-05-01 al 2034-05-02',now,historyUsers:history});
  expect(r.period).toMatchObject({from:'2034-05-01',to:'2034-05-02'});expect(r.reference.effectiveQuestion).not.toContain('2034-04-01');
 });
 it('a current explicit independent identity resets earlier selectors',()=>{
  const r=resolverContextoSolicitudUsuario({question:'Estado de la aplicación Luna del 2034-05-01 al 2034-05-02',now,historyUsers:history});
  expect(r.reference.state).toBe('none');expect(r.selectorProposals).toContainEqual({kind:'aplicacion',value:'luna'});expect(JSON.stringify(r.selectorProposals)).not.toContain('sol');
 });
 it.each([
  [{id:'u1',question:'Compras y labores este mes',createdAt:at}],
  [{id:'u1',question:'Aplicación Sol o aplicación Luna',createdAt:at}],
  [...history,{id:'u3',question:'Jornales de esa aplicación o de otra',createdAt:'2034-05-01T03:03:00Z'}],
 ].map(historyUsers=>({historyUsers})))('does not invent a chain from mixed or ambiguous USER scope',({historyUsers})=>{
  const r=resolverContextoSolicitudUsuario({question:'Fechas de esa aplicación',now,historyUsers});expect(['orphan','ambiguous']).toContain(r.reference.state);expect(r.selectorProposals).toEqual([]);
 });
 it.each([
  [{...history[0],createdAt:'bad'}],
  [{...history[0],createdAt:'2034-02-30T03:00:00Z'}],
  [{...history[0],createdAt:'2035-01-01T00:00:00Z'}],
  [history[1],history[0]],
  [history[0],{...history[1],id:'u1'}],
  Array.from({length:7},(_,i)=>({...history[0],id:'u'+i})),
 ].map(historyUsers=>({historyUsers})))('rejects malformed, nonchronological, duplicate or overbudget history',({historyUsers})=>{
  const r=resolverContextoSolicitudUsuario({question:'Fechas de esa aplicación',now,historyUsers});expect(r.reference.state).toBe('orphan');expect(r.selectorProposals).toEqual([]);
 });
 it('does not skip an orphan intermediate reference to resurrect an old selection',()=>{
  const r=resolverContextoSolicitudUsuario({question:'Fechas de esa aplicación',now,historyUsers:[history[0],{id:'u2',question:'Costo de esos animales',createdAt:'2034-05-01T03:02:00Z'}]});
  expect(r.reference.state).toBe('orphan');expect(r.selectorProposals).toEqual([]);
 });
});

describe('semantic registered-state definition versus record facts',()=>{
 it.each(['Explica el estado Cerrada','Explícame el estado Cerrada','Explica el estado registrado Cerrada','¿Qué implica que figure Cerrada?','¿Qué implica que una aplicación figure como Cerrada?','¿Qué implica que aparezca como Cerrada?','Qué implica el estado Cerrada','Explica el estado «Cerrada»','Qué significa Cerrada; ¿garantiza que terminó físicamente?'])('permits relevant semantics without claiming record truth: %s',q=>{
  expect(analizarPropositoUsuario(q).definitions).toContainEqual({domain:'application',states:['Cerrada']});
 });
 it.each(['No expliques el estado Cerrada','No me expliques el estado Cerrada','No quiero que expliques el estado Cerrada','Sin explicar el estado Cerrada','Ejemplo: explica el estado Cerrada','«Explica el estado Cerrada»','Dijiste: explica el estado Cerrada'])('does not derive permission from negation, quotation or reported text: %s',q=>{
  expect(analizarPropositoUsuario(q).definitions).toEqual([]);
 });
 it.each(['Explica el estado Cerrada de una tarea','Qué implica que figure Cerrada en el producto','Explica por qué está Cerrada la aplicación Sol','¿La aplicación Sol está Cerrada?','Estado de la aplicación Sol'])('does not replace another domain or actual entity query with a definition: %s',q=>{
  expect(analizarPropositoUsuario(q).definitions).toEqual([]);
 });
 it('retains separate data and definition intents in one request',()=>{
  const r=analizarPropositoUsuario('Explica el estado Cerrada; muestra las fechas de la aplicación Sol');expect(r.intents).toEqual(expect.arrayContaining(['definition','data_query']));
 });
});


describe('raw USER anchor preserves identity assertions for downstream fresh validation',()=>{
 it.each([
  'Estado de la aplicación Sol en lote Norte con ID 22222222-2222-4222-8222-222222222222 del 2034-05-01 al 2034-05-07',
  'Estado de la aplicación Sol sin lote Norte del 2034-05-01 al 2034-05-07',
 ])('keeps the original ID/exclusion byte-for-byte through a chain: %s',anchor=>{
  const historyUsers=[{id:'a1',question:anchor,createdAt:at},{id:'a2',question:'¿Y las fechas de esa aplicación?',createdAt:'2034-05-01T03:02:00Z'}];
  const r=resolverContextoSolicitudUsuario({question:'¿Cuántos jornales llevamos en esa aplicación?',now,historyUsers});
  expect(r.reference.state).toBe('resolved');expect(r.anchorQuestion).toBe(anchor);expect(r.anchorQuestion).not.toContain('¿Y las fechas');
 });
 it('uses the direct valid raw USER antecedent without history',()=>{
  const r=resolverContextoSolicitudUsuario({question:'Fechas de esa aplicación',now,previousUserText:root,previousUserAt:at});
  expect(r.reference.state).toBe('resolved');expect(r.anchorQuestion).toBe(root);
 });
 it('resets the chain anchor at a fresh explicit USER query, never at a follow-up operation',()=>{
  const next='Estado de la aplicación Luna del 2034-05-01 al 2034-05-02';
  const r=resolverContextoSolicitudUsuario({question:'Fechas de esa aplicación',now,historyUsers:[...history,{id:'u3',question:next,createdAt:'2034-05-01T03:03:00Z'}]});
  expect(r.reference.state).toBe('resolved');expect(r.anchorQuestion).toBe(next);
  expect(resolverContextoSolicitudUsuario({question:next,now,historyUsers:history})).not.toHaveProperty('anchorQuestion');
 });
 it('clears an orphan or ambiguous link instead of recovering an older anchor',()=>{
  for(const question of ['Costo de esos animales','Aplicación Sol o aplicación Luna']){
   const r=resolverContextoSolicitudUsuario({question:'Fechas de esa aplicación',now,historyUsers:[history[0],{id:'u2',question,createdAt:'2034-05-01T03:02:00Z'}]});
   expect(['orphan','ambiguous']).toContain(r.reference.state);expect(r).not.toHaveProperty('anchorQuestion');
  }
 });
 it('does not return an older anchor after a malformed chronological entry',()=>{
  const r=resolverContextoSolicitudUsuario({question:'Fechas de esa aplicación',now,historyUsers:[...history,{id:'u3',question:'Estado de aplicación Luna',createdAt:''}]});
  expect(r.reference.state).toBe('orphan');expect(r).not.toHaveProperty('anchorQuestion');
 });
});
