import {OperationFailure} from './escoOperacionContrato.ts';

/** Public aggregate proposal. reference_day belongs only to the server reader. */
export const LABOR_PARAMETERS = {
 type:'object',additionalProperties:false,
 properties:{
  date_from:{type:'string',description:'Inicio del período registrado YYYY-MM-DD'},
  date_to:{type:'string',description:'Fin del período registrado YYYY-MM-DD'},
  lote_name:{type:['string','null'],description:'Lote pedido por el usuario: nombre completo o fragmento inequívoco del catálogo. Omitir para desglose de todos los lotes.'},
 },required:['date_from','date_to'],
} as const;
export interface LoteLabor {id:string;nombre:string}
/** Bounded USER-clause projection for labor time/scope, not an authorization or
 * a general sentence parser. Explicit application metrics belong to their own
 * operation; unrelated domain clauses stop labor continuation inheritance.
 * A domain-free followup is retained for the separately validated reference.
 */
export function textoPartesLabor(question:string):string{
 const clauses=question.split(/[;\n]+|(?<=[.!?])\s+|\s+y\s+(?=(?:muestra(?:me)?|consulta|dime|dame|incluye|explica|compara)\b)|,\s*(?=(?:por separado|por otro lado|adem[aá]s|tambi[eé]n)\b)/i);
 const kinds=clauses.map(clause=>{
  const clean=clause.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/"[^"]*"|'[^']*'|«[^»]*»|“[^”]*”/g,' selector ');
  const example=/^\s*(?:consulta de solo lectura:\s*)?[¿¡]?\s*(?:ejemplo|cita|antes dijiste|respuesta anterior)\b/.test(clean);
  const application=/\b(?:aplicacion(?:es)?|fumigacion(?:es)?|fertilizacion(?:es)?|drench)\b/.test(clean);
  const other=/\b(?:compras?|despachos?|ventas?|lluvia|clima|radiacion|conductividad|monitoreos?|cosechas?|inventario|movimientos?|tareas?|ganado|hato|animales?|partos?|leche|pesajes?|finanzas|ingresos?|gastos?)\b/.test(clean);
  const labor=/\b(?:labores?|jornales?|trabajos?|mano de obra|costo laboral)\b/.test(clean)||/\bcostos?\b[^;.!?]*\bpor (?:cada )?lotes?\b/.test(clean);
  return {example,labor:!example&&!application&&!other&&labor,other:!example&&(application||other)};
 });
 const hasLabor=kinds.some(k=>k.labor),hasOther=kinds.some(k=>k.other);
 let activeLabor=hasLabor&&!hasOther;
 return clauses.filter((_,i)=>{
  const kind=kinds[i];if(kind.example)return false;
  if(kind.other){activeLabor=false;return false;}
  if(kind.labor){activeLabor=true;return true;}
  return activeLabor||!hasLabor&&!hasOther;
 }).join('; ');
}
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const contains=(text:string,label:string)=>(' '+norm(text)+' ').includes(' '+norm(label)+' ');
const fail=(code:'invalid_arguments'|'scope_ambiguous'|'outside_scope'):never=>{throw new OperationFailure(code,code==='invalid_arguments'?'arguments':'scope');};
/** No personal selector is ignored, including null. Empty optional business selectors mean absent. */
export function normalizarArgumentosLabor(args:Record<string,unknown>):Record<string,unknown>{
 const out:Record<string,unknown>={};
 for(const [key,value] of Object.entries(args)){
  if(!['date_from','date_to','reference_day','lote_name'].includes(key))fail('invalid_arguments');
  if(key==='lote_name'&&(value===null||typeof value==='string'&&!value.trim()))continue;
  if(typeof value!=='string')throw new OperationFailure('invalid_arguments','arguments');
  if(!value.trim()||value.length>256)fail('invalid_arguments');
  out[key]=value.trim();
 }
 return out;
}
/** This recognizes selector syntax, never the next arbitrary word after a grouping noun. */
export function requiereCatalogoLabor(question:string|undefined,selector:unknown):boolean{
 if(typeof selector==='string'&&selector.trim())return true;
 const q=norm(question??'');
 // Grouping is an operation, not a missing entity. Any remaining lot noun is
 // a selector/reference to resolve or clarify, including terse USER wording.
 const withoutGrouping=q.replace(/\b(?:por(?: cada)?|cada) lotes?\b/g,' ');
 return /\blotes?\b/.test(withoutGrouping);
}
function userScope(question:string):string{
 // Quoted names are valid user selectors; explicit examples/history are not selectors.
 return question.split(/[;.!?\n]/).filter(c=>! /\b(?:ejemplo|cita|texto anterior|respuesta anterior|antes dijiste)\b/.test(norm(c))).join(' ');
}
/** A model selector proposes a match; only current USER text plus a fresh catalog authorizes it. */
export function resolverLotesLabor(question:string|undefined,selector:unknown,catalog:readonly LoteLabor[]):LoteLabor[]|null{
 if(!question||!question.trim())throw new OperationFailure('scope_ambiguous','scope');
 if(catalog.some(l=>typeof l.id!=='string'||!l.id||typeof l.nombre!=='string'||!norm(l.nombre))||new Set(catalog.map(l=>l.id)).size!==catalog.length)fail('scope_ambiguous');
 const text=userScope(question),q=norm(text),selected=typeof selector==='string'?norm(selector):'';
 const explicitlyNamed=catalog.filter(l=>contains(text,l.nombre));
 const excluded=(label:string)=>new RegExp('\\b(?:sin|excepto|excluye|no incluir|no incluyas|no muestres) (?:el |la |los |las )?(?:lotes? )?'+norm(label)+'(?: |$)').test(q);
 if(explicitlyNamed.some(l=>excluded(l.nombre)))fail('scope_ambiguous');
 if(selected&&!contains(text,selected))fail('outside_scope');
 let matches=explicitlyNamed;
 if(selected){
  const proposed=catalog.filter(l=>contains(l.nombre,selected));
  if(!proposed.length)fail('scope_ambiguous');
  if(matches.length){
   if(!proposed.some(p=>matches.some(m=>m.id===p.id)))fail('outside_scope');
   // A shorter model selector cannot silently expand a specific full USER name.
   if(matches.some(m=>!proposed.some(p=>p.id===m.id)))fail('outside_scope');
  }else{
   const literalSelector=new RegExp('\\blotes? (?:el |la |los |las )?(?:llamado |denominado )?'+selected+'(?: |$)').test(q);
   if(proposed.length!==1||excluded(selected)||!literalSelector)fail('scope_ambiguous');
   matches=proposed;
  }
 }
 if(!matches.length)fail('scope_ambiguous');
 if(new Set(matches.map(l=>norm(l.nombre))).size!==matches.length)fail('scope_ambiguous');
 return matches;
}
