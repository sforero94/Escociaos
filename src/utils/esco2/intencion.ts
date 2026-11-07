import { METRICAS_ANALITICAS } from './analitica.ts';
// Separate extraction contract. No source rows, recorded plans or evaluation references enter this stage.
import { CAPACIDADES_PARTE, type CapacidadParte } from './cobertura.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import { esUuid } from './aplicacionesTipos.ts';
import { ErrorPlan } from './registro.ts';
import { METRICAS, METRICAS_RANKING, AGRUPACIONES } from './metricasLabores.ts';
import { VARIABLES_CLIMA } from './climaTipos.ts';
import { operacionesDelPlan, type MensajeHistorial, type OperacionConsulta, type Plan } from './tipos.ts';
export type EntidadIntencion = 'labores' | 'aplicaciones' | 'animales' | 'lotes' | 'rondas' | 'clima' | 'sublotes' | 'plagas' | 'quincenas';
export interface EvidenciaIntencion { mensaje:'actual'|'historial_usuario'; indice?:number; inicio:number; fin:number }
export interface PoblacionIntencion { tipo:'explicita'|'todas_visibles'|'derivada'; entidad:EntidadIntencion; ids?:string[]; nombres?:string[]; chapetas?:number[]; sin_lote?:'incluir'|'excluir'|'solo'; de?:string; filtros?:{campo:string;valores:string[]}[] }
export type PeriodoIntencion = {tipo:'intervalo';desde:string;hasta:string;base_fecha:string}|{tipo:'actual'|'vida_completa'|'sin_precisar'};
export interface CondicionIntencion { metrica:string; operador:'gt'|'gte'|'lt'|'lte'|'eq'; valor:number; unidad:string }
export interface RankingIntencion {metrica:string;direccion:'asc'|'desc';n:number;empates:'incluir'|'exactamente_n_por_id'}
export interface ObligacionIntencion { ultima_por_entidad?:true;ranking?:RankingIntencion;comparacion?:{metrica:string;izquierda:string;derecha:string}; id:string; evidencias:EvidenciaIntencion[]; capacidad:CapacidadParte; poblacion:PoblacionIntencion; periodo:PeriodoIntencion; metricas:string[]; agrupaciones:string[]; condiciones:CondicionIntencion[]; detalle:'resumen'|'exhaustivo' }
export interface IntencionSolicitud { version:1; obligaciones:ObligacionIntencion[]; residuales:{inicio:number;fin:number;motivo:'ambiguo'|'no_soportado'|'no_interpretado'}[] }
export const METRICAS_INTENCION:Record<CapacidadParte,readonly string[]> = {
 labores:METRICAS,aplicaciones:['conteo','estado_actual'],cantidades_aplicacion:['plan','ejecucion'],costos_aplicacion:['insumos','mano_obra','total','plan'],labor_aplicacion:['jornales','costo'],faltantes_aplicacion:['necesidad','stock','faltante'],monitoreo:['incidencia','gravedad','afectados','muestreados'],conductividad:['valor_ce','distribucion','ph'],clima:VARIABLES_CLIMA,hato:['ficha','reproduccion'],pesajes_leche:['suma_muestras','promedio_dias_pesados','litros_am','litros_pm','litros_usable'],litros_quincenales:['litros'],fuera_de_contrato:[],
};
const ENTIDADES:EntidadIntencion[]=['labores','aplicaciones','animales','lotes','rondas','clima','sublotes','plagas','quincenas'];
const BASES=['fecha_trabajo','fecha_estimada_inicio','fecha_inicio_planeada','fecha_movimiento','fecha_cierre_operativo','fecha_inicio_ronda','fecha_monitoreo','fecha','quincena'];
const FILTROS=['lote_ids','lotes','tarea_ids','tareas','categorias','aplicacion_ids','aplicaciones','estados','animal_ids','nombres','chapetas','etapas','finca_ids','estados_reproductivos','ronda_ids','rondas','sublote_ids','sublotes','plaga_ids','plagas','station_id','seleccion_ronda'];
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fail=(code:string):never=>{throw new ErrorPlan(`intencion_no_valida:${code}`);};
const keys=(v:Record<string,unknown>,allowed:string[])=>{if(Object.keys(v).some(k=>!allowed.includes(k)))fail('campo_no_registrado');};
const texts=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(x=>typeof x==='string'&&x.trim()===x&&x.length>0)&&new Set(v).size===v.length;
const span=(v:unknown,text:string)=>object(v)&&Number.isSafeInteger(v.inicio)&&Number.isSafeInteger(v.fin)&&(v.inicio as number)>=0&&(v.fin as number)>(v.inicio as number)&&(v.fin as number)<=text.length;
export function validarIntencion(valor:unknown,pregunta:string,historial:MensajeHistorial[]):IntencionSolicitud {
 if(!object(valor))return fail('forma');keys(valor,['version','obligaciones','residuales']);
 if(valor.version!==1||!Array.isArray(valor.obligaciones)||valor.obligaciones.length<1||valor.obligaciones.length>8||!Array.isArray(valor.residuales)||valor.residuales.length>8)return fail('forma');
 let actual=false;
 const obligaciones=valor.obligaciones.map((v:unknown,index):ObligacionIntencion=>{
  if(!object(v))return fail('obligacion');keys(v,['id','evidencias','capacidad','poblacion','periodo','metricas','agrupaciones','condiciones','detalle','ultima_por_entidad','ranking','comparacion']);
  if(v.id!==`o${index+1}`||!CAPACIDADES_PARTE.includes(v.capacidad as CapacidadParte)||!Array.isArray(v.evidencias)||!v.evidencias.length||v.evidencias.length>8||!texts(v.metricas)||!texts(v.agrupaciones)||!Array.isArray(v.condiciones)||v.condiciones.length>4||!['resumen','exhaustivo'].includes(v.detalle as string))return fail('obligacion');
  const capacidad=v.capacidad as CapacidadParte;
  if(v.metricas.some(m=>!METRICAS_INTENCION[capacidad].includes(m))||v.agrupaciones.some(g=>![...AGRUPACIONES,'animal','plaga','sublote','estacion'].includes(g)))return fail('metrica_o_grupo');
  if(v.ultima_por_entidad!==undefined&&(v.ultima_por_entidad!==true||!['conductividad','pesajes_leche','monitoreo'].includes(capacidad)))return fail('ultima_por_entidad');
  if(v.ranking!==undefined){const r=v.ranking;if(!object(r))return fail('ranking');keys(r,['metrica','direccion','n','empates']);if(capacidad!=='labores'||!METRICAS_RANKING.includes(r.metrica as never)||!v.metricas.includes(r.metrica as string)||!['asc','desc'].includes(r.direccion as string)||!['incluir','exactamente_n_por_id'].includes(r.empates as string)||!Number.isSafeInteger(r.n)||(r.n as number)<1||(r.n as number)>50)return fail('ranking');}
  if(v.comparacion!==undefined){const c=v.comparacion;if(!object(c))return fail('comparacion');keys(c,['metrica','izquierda','derecha']);if(!['labores','clima','conductividad','pesajes_leche','monitoreo'].includes(capacidad)||!v.metricas.includes(c.metrica as string)||!Object.prototype.hasOwnProperty.call(METRICAS_ANALITICAS[capacidad]??{},String(c.metrica))||typeof c.izquierda!=='string'||typeof c.derecha!=='string'||!c.izquierda||!c.derecha||c.izquierda===c.derecha||c.izquierda.length>2000||c.derecha.length>2000)return fail('comparacion');}
  for(const e of v.evidencias){
   if(!object(e))return fail('evidencia');keys(e,['mensaje','indice','inicio','fin']);
   if(e.mensaje==='actual'){if(e.indice!==undefined||!span(e,pregunta))return fail('evidencia_actual');actual=true;}
   else if(e.mensaje==='historial_usuario'){const m=Number.isSafeInteger(e.indice)?historial[e.indice as number]:undefined;if(!m||m.rol!=='user'||!span(e,m.texto))return fail('evidencia_historial');}
   else return fail('evidencia');
  }
  const p=v.poblacion;if(!object(p))return fail('poblacion');keys(p,['tipo','entidad','ids','nombres','chapetas','sin_lote','de','filtros']);
  if(!['explicita','todas_visibles','derivada'].includes(p.tipo as string)||!ENTIDADES.includes(p.entidad as EntidadIntencion)||p.sin_lote!==undefined&&!['incluir','excluir','solo'].includes(p.sin_lote as string))return fail('poblacion');
  if(p.ids!==undefined&&(!texts(p.ids)||!p.ids.length||p.ids.some(x=>!esUuid(x)))||p.nombres!==undefined&&(!texts(p.nombres)||!p.nombres.length)||p.chapetas!==undefined&&(!Array.isArray(p.chapetas)||!p.chapetas.length||p.chapetas.some(n=>!Number.isSafeInteger(n)||(n as number)<1)||new Set(p.chapetas).size!==p.chapetas.length))return fail('selector');
  const clases=[p.ids,p.nombres,p.chapetas].filter(x=>x!==undefined).length;
  if(p.tipo==='explicita'&&(clases!==1||p.de!==undefined)||p.tipo!=='explicita'&&clases)return fail('selector');
  if(p.tipo==='derivada'){if(typeof p.de!=='string'||!/^o[1-8]$/.test(p.de)||Number(p.de.slice(1))>index)return fail('dependencia');}
  else if(p.de!==undefined)return fail('dependencia');
  if(p.filtros!==undefined){if(!Array.isArray(p.filtros)||p.filtros.length>12)return fail('filtros');const seen=new Set<string>();for(const f of p.filtros){if(!object(f))return fail('filtro');keys(f,['campo','valores']);if(typeof f.campo!=='string'||!FILTROS.includes(f.campo)||seen.has(f.campo)||!texts(f.valores)||!f.valores.length)return fail('filtro');seen.add(f.campo);}}
  const t=v.periodo;if(!object(t))return fail('periodo');
  if(t.tipo==='intervalo'){keys(t,['tipo','desde','hasta','base_fecha']);if(!esFechaCalendario(t.desde)||!esFechaCalendario(t.hasta)||t.desde>t.hasta||!BASES.includes(t.base_fecha as string))return fail('periodo');}
  else {keys(t,['tipo']);if(!['actual','vida_completa','sin_precisar'].includes(t.tipo as string))return fail('periodo');}
  for(const c of v.condiciones){if(!object(c))return fail('condicion');keys(c,['metrica','operador','valor','unidad']);if(!v.metricas.includes(String(c.metrica))||!['gt','gte','lt','lte','eq'].includes(c.operador as string)||typeof c.valor!=='number'||!Number.isFinite(c.valor)||typeof c.unidad!=='string'||!c.unidad.trim()||METRICAS_ANALITICAS[capacidad]?.[String(c.metrica)]!==c.unidad)return fail('condicion');}
  return structuredClone(v) as unknown as ObligacionIntencion;
 });
 if(!actual)return fail('sin_ancla_actual');
 const residuales=valor.residuales.map((v:unknown)=>{if(!object(v))return fail('residual');keys(v,['inicio','fin','motivo']);if(!span(v,pregunta)||!['ambiguo','no_soportado','no_interpretado'].includes(v.motivo as string))return fail('residual');return {...v} as IntencionSolicitud['residuales'][number];});
 return {version:1,obligaciones,residuales};
}
const sorted=(v:unknown):string=>JSON.stringify(v,(_k,x)=>object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):Array.isArray(x)?[...x].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):x);
const same=(a:unknown,b:unknown)=>sorted(a)===sorted(b);
const selectorEntidad:Record<EntidadIntencion,[string,string,string?]>={labores:['tarea_ids','tareas'],aplicaciones:['aplicacion_ids','aplicaciones'],animales:['animal_ids','nombres','chapetas'],lotes:['lote_ids','lotes'],rondas:['ronda_ids','rondas'],clima:['station_id','station_id'],sublotes:['sublote_ids','sublotes'],plagas:['plaga_ids','plagas'],quincenas:['','']};
function seleccionEsperada(p:PoblacionIntencion):Record<string,string[]|number[]> {
 const out:Record<string,string[]|number[]>={};for(const f of p.filtros??[])out[f.campo]=f.valores;
 if(p.tipo==='explicita'){const [ids,nombres,chapetas]=selectorEntidad[p.entidad];if(p.ids)out[ids]=p.ids;if(p.nombres)out[nombres]=p.nombres;if(p.chapetas&&chapetas)out[chapetas]=p.chapetas;}
 return out;
}
function seleccionOperacion(o:OperacionConsulta):Record<string,string[]|number[]> {
 const c=o.consulta as unknown as Record<string,unknown>;const out:Record<string,string[]|number[]>={};
 for(const k of FILTROS){const v=c[k];if(Array.isArray(v)&&v.length)out[k]=v as string[];else if(typeof v==='string')out[k]=[v];}
 if(typeof c.aplicacion_id==='string')out.aplicacion_ids=[c.aplicacion_id];if(typeof c.aplicacion==='string')out.aplicaciones=[c.aplicacion];
 if(object(c.poblacion))for(const [k,v]of Object.entries(c.poblacion))if(Array.isArray(v)&&v.length)out[k]=v as string[];
 return out;
}
function metricasOperacion(o:OperacionConsulta):readonly string[]{
 if(o.tipo==='labores')return o.consulta.metricas;if(o.tipo==='clima')return o.consulta.variables;
 const ms=METRICAS_INTENCION[o.tipo];return o.tipo==='costos_aplicacion'&&!o.consulta.incluir_plan?ms.filter(m=>m!=='plan'):ms;
}
function baseOperacion(o:OperacionConsulta):string{
 const c=o.consulta as unknown as Record<string,unknown>;
 if(o.tipo==='labores')return String(c.base_fecha??'fecha_trabajo');if(o.tipo==='aplicaciones')return String(c.base_fecha);
 return ({cantidades_aplicacion:'fecha_movimiento',costos_aplicacion:'fecha_movimiento',labor_aplicacion:'fecha_trabajo',monitoreo:'fecha_inicio_ronda',conductividad:'fecha_monitoreo',clima:'fecha',pesajes_leche:'fecha',litros_quincenales:'quincena'} as Record<string,string>)[o.tipo]??'actual';
}
export function verificarIntencionPlan(intencion:IntencionSolicitud,plan:Plan):void{
 const ops=plan.tipo==='operaciones'||plan.tipo==='consultas'?operacionesDelPlan(plan):[];
 const mismatch=(id:string,campo:string):never=>{throw new ErrorPlan(`discrepancia_intencion:${id}:${campo}`);};
 for(const ob of intencion.obligaciones){
  const pid=`s${ob.id.slice(1)}`;const parte=plan.cobertura?.partes.find(p=>p.id===pid);
  if(!parte||parte.capacidad!==ob.capacidad)mismatch(ob.id,'omision_o_capacidad');
  if(ob.capacidad==='fuera_de_contrato'){if(parte!.disposicion!=='fuera_de_contrato')mismatch(ob.id,'fuera_de_contrato');continue;}
  if(parte!.disposicion==='aclarar'&&ob.periodo.tipo==='sin_precisar')continue;
  if(parte!.disposicion!=='consultar')mismatch(ob.id,'disposicion');
  const vinculadas=ops.filter(o=>o.parte_ids?.includes(pid));if(!vinculadas.length)mismatch(ob.id,'omision');
  for(const o of vinculadas){
   const c=o.consulta as unknown as Record<string,unknown>;
   const esperado=seleccionEsperada(ob.poblacion),actual=seleccionOperacion(o);
   if(ob.poblacion.tipo!=='derivada'&&!same(Object.keys(esperado).sort(),Object.keys(actual).sort()))mismatch(ob.id,'poblacion');
   if(ob.poblacion.tipo!=='derivada'&&Object.keys(esperado).some(k=>!same(esperado[k],actual[k])))mismatch(ob.id,'poblacion');
   if(ob.poblacion.tipo==='todas_visibles'&&ob.poblacion.entidad==='animales'&&!c.poblacion)mismatch(ob.id,'poblacion');
   if(ob.poblacion.tipo==='derivada'){ const origenParte=`s${ob.poblacion.de!.slice(1)}`; const candidatas=ops.map((op,index)=>({op,index})).filter(x=>x.op.parte_ids?.includes(origenParte)&&(ob.poblacion.entidad==='animales'?x.op.tipo==='hato':x.op.tipo==='aplicaciones')); if(candidatas.length!==1||c.seleccion_de!==`p${candidatas[0].index+1}`)mismatch(ob.id,'dependencia'); }
   if(o.tipo==='labores'&&(ob.poblacion.sin_lote??'incluir')!==(c.sin_lote??'incluir'))mismatch(ob.id,'sin_lote');
   if(ob.periodo.tipo==='intervalo'&&(c.desde!==ob.periodo.desde||c.hasta!==ob.periodo.hasta||baseOperacion(o)!==ob.periodo.base_fecha))mismatch(ob.id,'periodo_o_base');
   if(ob.periodo.tipo==='vida_completa'&&(c.desde!==undefined||c.hasta!==undefined))mismatch(ob.id,'periodo');
   if(ob.periodo.tipo==='actual'&&!['hato','faltantes_aplicacion'].includes(o.tipo))mismatch(ob.id,'actual');
   if(ob.periodo.tipo==='sin_precisar'&&o.tipo!=='aplicaciones')mismatch(ob.id,'periodo_sin_precisar');
   if(ob.metricas.some(m=>!metricasOperacion(o).includes(m)))mismatch(ob.id,'metricas');
   const grupos=c.agrupar_por??(o.tipo==='cantidades_aplicacion'||o.tipo==='labor_aplicacion'?['lote']:[]);
   const analisis=o.analisis;
   const ranking=o.tipo==='labores'?(o.consulta.ranking??(o.consulta.limite!==null?{metrica:'jornales',direccion:'desc',n:o.consulta.limite,empates:'exactamente_n_por_id'}:undefined)):undefined;
   if(!same(ob.ranking,ranking))mismatch(ob.id,'ranking');
   if((ob.ultima_por_entidad??false)!==(analisis?.ultima_por_entidad??false))mismatch(ob.id,'ultima_por_entidad');
   if(!same(ob.comparacion,analisis?.comparacion))mismatch(ob.id,'comparacion');
   if(!same(ob.agrupaciones,analisis?.agrupar_por??grupos))mismatch(ob.id,'agrupaciones');
   if(!same(ob.condiciones,analisis?.condiciones??[]))mismatch(ob.id,'condiciones');
  }
 }
 if(plan.cobertura?.partes.some(p=>!intencion.obligaciones.some(o=>`s${o.id.slice(1)}`===p.id)))mismatch('solicitud','parte_adicional');
}
export function herramientasIntencion():unknown[]{
 const list=(items:unknown)=>({type:'array',uniqueItems:true,items});
 const str={type:'string'};
 const obj=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required,properties});
 const evidencia=obj({mensaje:{type:'string',enum:['actual','historial_usuario']},indice:{type:'integer',minimum:0},inicio:{type:'integer',minimum:0},fin:{type:'integer',minimum:1}},['mensaje','inicio','fin']);
 const poblacion=obj({tipo:{type:'string',enum:['explicita','todas_visibles','derivada']},entidad:{type:'string',enum:ENTIDADES},ids:list(str),nombres:list(str),chapetas:list({type:'integer',minimum:1}),sin_lote:{type:'string',enum:['incluir','excluir','solo']},de:{type:'string',pattern:'^o[1-8]$'},filtros:{type:'array',maxItems:12,items:obj({campo:{type:'string',enum:FILTROS},valores:list(str)})}},['tipo','entidad']);
 const periodo={oneOf:[obj({tipo:{type:'string',enum:['intervalo']},desde:str,hasta:str,base_fecha:{type:'string',enum:BASES}}),obj({tipo:{type:'string',enum:['actual','vida_completa','sin_precisar']}})]};
 const condicion=obj({metrica:{type:'string',enum:[...new Set(Object.values(METRICAS_INTENCION).flat())]},operador:{type:'string',enum:['gt','gte','lt','lte','eq']},valor:{type:'number'},unidad:str});
 const ranking=obj({metrica:{type:'string',enum:[...METRICAS_RANKING]},direccion:{type:'string',enum:['asc','desc']},n:{type:'integer',minimum:1,maximum:50},empates:{type:'string',enum:['incluir','exactamente_n_por_id']}});
 const comparacion=obj({metrica:{type:'string'},izquierda:{type:'string',minLength:1,maxLength:2000},derecha:{type:'string',minLength:1,maxLength:2000}});
 const obligacion=obj({id:{type:'string',pattern:'^o[1-8]$'},evidencias:{type:'array',minItems:1,maxItems:8,items:evidencia},capacidad:{type:'string',enum:[...CAPACIDADES_PARTE]},poblacion,periodo,metricas:list({type:'string',enum:[...new Set(Object.values(METRICAS_INTENCION).flat())]}),agrupaciones:list({type:'string',enum:[...AGRUPACIONES,'animal','plaga','sublote','estacion']}),condiciones:{type:'array',maxItems:8,items:condicion},detalle:{type:'string',enum:['resumen','exhaustivo']}});
 const residual=obj({inicio:{type:'integer',minimum:0},fin:{type:'integer',minimum:1},motivo:{type:'string',enum:['ambiguo','no_soportado','no_interpretado']}});
 return [{type:'function',function:{name:'declarar_intencion',description:'Extrae todas las obligaciones antes de planificar; conserva población, período, métricas, condiciones y residuos explícitos. No calcula ni propone operaciones.',parameters:obj({version:{type:'integer',enum:[1]},obligaciones:{type:'array',minItems:1,maxItems:8,items:{oneOf:CAPACIDADES_PARTE.map(capacidad=>({...obligacion,properties:{...obligacion.properties,...(capacidad==='labores'?{ranking}:{}),...(['conductividad','pesajes_leche','monitoreo'].includes(capacidad)?{ultima_por_entidad:{type:'boolean',enum:[true]}}:{}),...(['labores','clima','conductividad','pesajes_leche','monitoreo'].includes(capacidad)?{comparacion:{...comparacion,properties:{...comparacion.properties,metrica:{type:'string',enum:Object.keys(METRICAS_ANALITICAS[capacidad]??{})}}}}:{}),capacidad:{type:'string',enum:[capacidad]},metricas:list({type:'string',enum:[...METRICAS_INTENCION[capacidad]]}),condiciones:METRICAS_ANALITICAS[capacidad]?{type:'array',maxItems:4,items:{oneOf:Object.entries(METRICAS_ANALITICAS[capacidad]).map(([metrica,unidad])=>({...condicion,properties:{...condicion.properties,metrica:{type:'string',enum:[metrica]},unidad:{type:'string',enum:[unidad]}}}))}}:{type:'array',maxItems:0}}}))}},residuales:{type:'array',maxItems:8,items:residual}})}}];
}
export function promptIntencion(hoy:string):string{
 return `Extrae la intención de todas las obligaciones del usuario. Hoy ${hoy}, Bogotá. La salida única es declarar_intencion. No recibes ni elaboras un plan. Cada evidencia usa offsets UTF-16 [inicio,fin) del mensaje actual o historial de usuario indexado; jamás texto assistant. Al menos una evidencia del mensaje actual. Conserva población, entidad, período inclusivo/base de fecha, métricas, agrupaciones, condiciones y detalle. Derivadas solo apuntan a obligaciones anteriores de selección por IDs visibles. No conviertas severidad en gravedad, estado histórico en actual, NULL en cero, muestra en población, plan en ejecución o lluvia parcial en total. Marca como residual cada requisito ambiguo, no soportado o no interpretado. No inventes fuentes ni valores. Diccionario de métricas por capacidad: ${JSON.stringify(METRICAS_INTENCION)}. Representa última medición con ultima_por_entidad:true, top con ranking completo y delta con comparacion. Conserva esas transformaciones en ambos sentidos. Clave de comparación estable: JSON.stringify([dominio,Object.entries(identidad).sort(([a],[b])=>a.localeCompare(b)),desde,hasta]); identidad solo IDs de entidad y dimensión calendario. No uses nombres ni índices como claves. Si faltan identidades o períodos necesarios, conserva un residual o aclaración, sin inventarlos. Predicados son condiciones cerradas; no hagas aritmética. El último mensaje cambia explícitamente el contexto previo. No declares exhaustividad semántica certificada.`;
}
