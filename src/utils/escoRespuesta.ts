import {DEFINITIONS,validarEvidencia,type Evidence,type Fact,type Metric,type Operation,type PopulationProof,type Scope} from './escoEvidencia';
export interface ParteSolicitada {id:string;operation:Operation;scopeIds:readonly string[];metrics:readonly Metric[];label:string}
export interface EntradaComposicion {parts:readonly ParteSolicitada[];evidence:readonly Evidence[];scopes:Scope[];populations:readonly PopulationProof[];turnStartedAt:string;labels?:Readonly<Record<string,string>>;modelText?:string}
export interface ResultadoComposicion {text:string;parts:Array<{id:string;state:'answered'|'partial'|'unavailable';known:number;unknown:number}>}
const literal=(s:string)=>'`'+s.replace(/[|<>`\r\n]/g,' ').slice(0,128)+'`';
const known=(f:Fact)=>f.value.kind!=='unknown';
/** Both normal and fallback must use this same factual path; modelText is never facts. */
export function componerRespuestaVerificada(input:EntradaComposicion):ResultadoComposicion {
 const first=Date.parse(input.turnStartedAt);
 if(!Number.isFinite(first))return {text:'No recibí evidencia fresca verificable para esta consulta.',parts:input.parts.map(p=>({id:p.id,state:'unavailable',known:0,unknown:p.metrics.length}))};
 const proofs=input.populations.filter(p=>Number.isFinite(Date.parse(p.capturedAt))&&Date.parse(p.capturedAt)>=first);
 // Validate separate envelopes: their fact IDs are local, not a global join key.
 const valid=input.evidence.filter(e=>validarEvidencia(e,input.scopes,proofs));
 const lines:string[]=[],parts:ResultadoComposicion['parts']=[];let remainingRows=200;
 // Display aliases do not replace canonical identity. Disambiguate homonyms
 // after the same escaping/truncation used by the renderer.
 const labelFor=(scope:Scope,e:{kind:string;id:string})=>input.labels?.[e.kind+':'+e.id]??scope.entities.find(x=>x.kind===e.kind&&x.id===e.id)?.label??e.id;
 const displayed=new Map<string,Set<string>>();for(const fact of valid.flatMap(e=>e.facts).filter(known)){const scope=input.scopes.find(s=>s.id===fact.scopeId)!;for(const e of fact.entities){const key=e.kind+':'+literal(labelFor(scope,e)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(!displayed.has(key))displayed.set(key,new Set());displayed.get(key)!.add(e.id);}}
 const visibleEntity=(scope:Scope,e:{kind:string;id:string})=>{const text=literal(labelFor(scope,e)),key=e.kind+':'+text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return ((displayed.get(key)?.size??0)>1||labelFor(scope,e).includes('[nombre abreviado]'))?text+' · '+literal(e.id):text;};
 const candidates=valid.flatMap(e=>e.facts).filter(known);
 const claimKey=(f:Fact)=>{const s=input.scopes.find(x=>x.id===f.scopeId)!;return JSON.stringify([s.operation,s.period,s.filters,[...f.entities].sort((a,b)=>(a.kind+a.id).localeCompare(b.kind+b.id)),f.metric,f.origin]);};
 const values=new Map<string,Set<string>>();for(const f of candidates){const key=claimKey(f);if(!values.has(key))values.set(key,new Set());values.get(key)!.add(JSON.stringify(f.value));}
 const conflicting=(f:Fact)=>(values.get(claimKey(f))?.size??0)>1;
 for(const part of input.parts){
  const scopes=input.scopes.filter(s=>part.scopeIds.includes(s.id)&&s.operation===part.operation);
  const facts=valid.flatMap(e=>e.facts).filter(f=>scopes.some(s=>s.id===f.scopeId)&&part.metrics.includes(f.metric));
  const seen=new Set<string>();const rows=facts.filter(f=>{const key=JSON.stringify([f.scopeId,f.metric,f.entities,f.value,f.assertion]);if(seen.has(key))return false;seen.add(key);return true;});
  const conflicts=rows.filter(known).filter(conflicting);
  const eligible=rows.filter(known).filter(f=>!conflicting(f));
  const available=eligible.slice(0,remainingRows);remainingRows-=available.length;
  const outputOmitted=available.length<eligible.length;
  const missing=part.metrics.filter(m=>part.scopeIds.some(id=>!available.some(f=>f.scopeId===id&&f.metric===m)));
  const missingScopes=part.scopeIds.filter(id=>!scopes.some(s=>s.id===id)||!available.some(f=>f.scopeId===id));
  const unknown=rows.filter(f=>!known(f));
  const omitted=valid.some(e=>e.scopes.some(s=>part.scopeIds.includes(s.id))&&e.issues.some(i=>['budget_exceeded','incomplete_population'].includes(i.code)));
  const incomplete=outputOmitted||conflicts.length>0||valid.some(e=>e.state!=='ok'&&e.scopes.some(s=>part.scopeIds.includes(s.id)))||omitted||rows.some(f=>f.assertion==='verified_subtotal'||f.coverage.population!=='complete'||f.coverage.values!=='complete');
  const state=!available.length?'unavailable':missing.length||missingScopes.length||unknown.length||incomplete?'partial':'answered';
  parts.push({id:part.id,state,known:available.length,unknown:missing.length+unknown.length});
  lines.push(literal(part.label));
  if(scopes.some(scope=>scope.filters.membership_complete==='false'))lines.push('Hay aplicaciones cuya pertenencia al período de actividad no pude acreditar por tareas o fechas desconocidas. Sus valores no son cero; los registros verificables de las otras aplicaciones se conservan por separado.');
  if(conflicts.length)lines.push('Las fuentes actuales discrepan para un mismo hecho y alcance; no elegí una cifra ni usé prosa para resolverlo.');
  if(outputOmitted)lines.push('Detalle limitado a 200 hechos por respuesta; hay hechos adicionales no mostrados. El total de fuente no convierte esta tabla en exhaustiva.');
  if(!available.length){lines.push('Falta evidencia verificable para esta parte; no usé cifras del historial ni completé con estimaciones.');continue;}
  lines.push('| Alcance / entidad | Hecho registrado o derivado | Valor |','| --- | --- | --- |');
  for(const f of available){
   const scope=scopes.find(s=>s.id===f.scopeId)!;
   const entities=f.entities.map(e=>visibleEntity(scope,e)).join(', ')||'Población consultada';
   const period=scope.period?` (${scope.period.from}–${scope.period.to}; ${literal(scope.period.fieldMeaning)})`:'';
   const v=f.value.kind==='decimal'?`${f.value.value} ${literal(f.value.unit)}${f.value.denominator?' / '+literal(f.value.denominator):''}`:f.value.kind==='status'&&f.value.value==='Calculada'?'Calculada (Planificada en la interfaz)':f.value.kind==='date'||f.value.kind==='status'?literal(f.value.value):'';
   let formula='';if(f.metric==='application.theoretical_quantity'&&f.value.kind==='decimal'&&f.derivation?.operation==='multiply'){const envelope=valid.find(e=>e.facts.includes(f));const inputs=f.derivation.inputs.flatMap(i=>'factId'in i?envelope?.facts.filter(x=>x.id===i.factId)??[]:[]);const dose=inputs.find(x=>x.metric==='application.planned_dose'),drums=inputs.find(x=>x.metric==='application.planned_drums');if(dose?.value.kind==='decimal'&&drums?.value.kind==='decimal')formula=` (teórico: ${dose.value.value} ${literal(dose.value.unit)} × ${drums.value.value} ${literal(drums.value.unit)} = ${f.value.value} ${literal(f.value.unit)})`;}
   const subtotal=f.assertion==='verified_subtotal'?' — subtotal verificado, no total completo':'';
   lines.push(`| ${entities}${period} | ${literal(DEFINITIONS[f.metric].label)}${subtotal} | ${v}${formula} |`);
  }
  lines.push('');
  if(missing.length||unknown.length)lines.push('Datos no verificables: '+[...new Set([...missing,...unknown.map(f=>f.metric)])].map(m=>literal(DEFINITIONS[m].label)).join(', ')+'. Las otras partes conservan sus valores verificados.');
  if(missingScopes.length)lines.push('Hay alcances solicitados sin hechos verificables; no extendí los valores de otro lote o período para rellenarlos.');
  if(valid.some(e=>e.scopes.some(s=>part.scopeIds.includes(s.id))&&e.issues.some(i=>i.code==='unsupported_operation')))lines.push('Una operación solicitada está fuera del contrato de esta fuente; respondí solo la serie identificada, sin sustituirla por otra.');
  if(omitted)lines.push('Detalle omitido o población incompleta: esta tabla no es un listado exhaustivo. Acota la consulta para el detalle restante.');
  if(incomplete)lines.push('Cobertura parcial del detalle o de algunas métricas: cada hecho conserva su alcance; no certifiqué las partes omitidas.');
 }
 lines.push('Los datos describen registros consultados. No acreditan por sí solos cobro, recepción física, ejecución satisfactoria ni una causa.');
 return {text:lines.join('\n'),parts};
}
