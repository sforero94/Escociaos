/** Bounded request metadata; does not authorize access and accepts no model selector. */
import {proponerPeriodoUsuario} from './escoAlcance';
import {fechaBogota} from './escoConsultas';
import {fechaValida} from './escoEvidencia';
import type {ContextoNucleo} from './escoNucleoComun';
const normal=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function proposito(question:string,noun:RegExp,verbs:RegExp):boolean {
 return normal(question).split(/[,;.!?\n]/).some(raw=>{
  if(/\b(?:ejemplo|cita|se hablaba|hablabamos|dijiste|dije|texto anterior|mensaje anterior|respuesta anterior)\b/.test(raw))return false;
  // Quoted text is a selector placeholder, never a new identity purpose.
  const clause=raw.replace(/"[^"]*"|'[^']*'|«[^»]*»|“[^”]*”/g,' selector ');
  if(!noun.test(clause)&&!verbs.test(clause))return false;
  if(/\b(?:no|nunca)\s+(?:(?:quiero|deseo)\s+)?(?:(?:mostrar|muestres|incluir|incluyas|consultar|consultes|listar|listes|ver|revelar|reveles|usar|uses)\s+)?(?:(?:los|las|el|la|datos de|detalle de|nombres de|identidades de)\s+)*(?:clientes?|compradores?|proveedor(?:es)?|contrapartes?)\b/.test(clause))return false;
  return !/(?:sin|omite|excluye|no incluyas|no muestres)\s+(?:(?:mostrar|mencionar|incluir|consultar|listar|revelar|usar)\s+)?(?:(?:los|las|el|la|detalle de|datos de|nombres de|identidades de)\s+)*(?:clientes?|compradores?|proveedor(?:es)?|contrapartes?)/.test(clause);
 });
}
export function crearContextoNucleo(input:{question:string;now:Date;previousUserText?:string;previousUserAt?:string;channel?:'web'|'telegram'}):ContextoNucleo {
 const q=normal(input.question),current=proponerPeriodoUsuario(input.question,input.now);
 const follows=/^(?:consulta de solo lectura:\s*)?[¿]?\s*(?:y\b|en esas?\b|en esos?\b|para esas?\b|para esos?\b|de esas?\b|de esos?\b)/i.test(input.question.trim())||/\b(?:esas?|esos?|mismas?|mismos?)\s+(?:lotes?|productos?|fincas?|ubicaciones?|clientes?|proveedor(?:es)?|estaciones?|tareas?|movimientos?|compras?|despachos?|cosechas?|registros?)\b/.test(q);
 const previous=input.previousUserText&&input.previousUserAt?proponerPeriodoUsuario(input.previousUserText,new Date(input.previousUserAt)):null;
 const temporal=current.state==='absent'&&follows&&previous?.state==='resolved'?previous:current;
 let dateState:ContextoNucleo['dateState']=temporal.state;
 let bounds:ContextoNucleo['bounds'];
 // Preserve the existing one-sided ISO filters. Never invent the opposite bound.
 if((current.state==='invalid'||current.state==='absent'||current.state==='ambiguous')&&(q.match(/\d{4}-\d{2}-\d{2}/g)?.length??0)===1){
  const from=/\b(?:desde|a partir de|a partir del)\s+(\d{4}-\d{2}-\d{2})\b/.exec(q),to=/\bhasta(?: el)?\s+(\d{4}-\d{2}-\d{2})\b/.exec(q);
  if(!!from!==!!to&&!/\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ayer|hoy|semana|mes|ano)\b/.test(q)&&fechaValida((from??to)![1])&&!/\b(?:no desde|no hasta|sin usar|excepto|ejemplo)\b/.test(q)){
   dateState='open';bounds=from?{from:from[1]}:{to:to![1]};
  }
 }
 const client=proposito(input.question,/\b(?:clientes?|compradores?)\b/,/\b(?:(?:a quien|a quienes|quienes)\b.*\b(?:despach|vend)|(?:despachos|despachamos|ventas|vendimos)\s+a\s+\S)/),supplier=proposito(input.question,/\bproveedor(?:es)?\b/,/\b(?:(?:a quien|a quienes|quienes)\b.*\bcompr|(?:compras|compramos)\s+(?:a|con)\s+\S)/);
 const noNames=/\b(?:sin|omite|excluye|no incluyas|no muestres|no quiero mostrar|no quiero|no mostrar|no revelar) (?:los |las )?(?:nombres|identidades|datos personales)\b/.test(q);
 return {currentUserText:input.question,...(follows?{referencePending:true}:{}),...(input.previousUserText?{previousUserText:input.previousUserText}:{}),referenceDay:fechaBogota(input.now),startedAt:input.now.toISOString(),...(input.channel?{channel:input.channel}:{}),period:temporal.state==='resolved'?{from:temporal.from,to:temporal.to}:null,dateState,...(bounds?{bounds}:{}),identities:{client,supplier},identityLabels:{client:client&&!noNames,supplier:supplier&&!noNames}};
}
