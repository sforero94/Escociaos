import {limiteNucleo} from './escoNucleoCatalogo';
/** Transitional positive projection. It does not certify legacy factual correctness. */
type Row=Record<string,unknown>;
export function definicionEstadoRegistrado(args:Record<string,unknown>):string|null {
 if(args.domain==='capability'&&Object.keys(args).every(k=>['domain','state'].includes(k)))return limiteNucleo(String(args.state));
 if(Object.keys(args).some(k=>!['domain','state'].includes(k))||args.domain!=='application'||!['Calculada','En ejecución','Cerrada'].includes(String(args.state)))return null;
 const meanings:Record<string,string>={Calculada:'Calculada (Planificada en la interfaz) identifica el estado de planificación/cálculo registrado; no es consumo real ni prueba ejecución física.', 'En ejecución':'En ejecución identifica el estado operativo registrado de la aplicación; por sí solo no cuantifica avance físico ni certifica captura completa.',Cerrada:'Cerrada indica un cierre registrado en el sistema. No demuestra por sí sola ejecución física completa o satisfactoria, ni que todos los consumos y trabajos hayan sido capturados.'};
 return meanings[String(args.state)]+' Para una aplicación concreta hay que consultar su estado, fechas planeadas/reales y registros actuales. No inferí causas ni modifiqué registros.';
}
const object=(v:unknown):Row=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
function scalars(v:unknown,keys:readonly string[]):Row {
 const r=object(v),out:Row={};for(const k of keys){const x=r[k];if(typeof x==='number'&&Number.isFinite(x)||typeof x==='boolean'||x===null||typeof x==='string'&&x.length<=128)out[k]=x;}return out;
}
export const CONTEXTO_NO_VERIFICADO=JSON.stringify({error:'source_unavailable',_evidencia:{consulta_completa:false},requiere_reconsulta:true});
export function proyectarLecturaLegada(tool:string,raw:string,individual?:{id:string;workerName:string;purpose?:'activity'|'history'|'salary'}):string {
 try{
  const r=object(JSON.parse(raw));if(Object.prototype.hasOwnProperty.call(r,'error'))return CONTEXTO_NO_VERIFICADO;
  const meta=object(r._evidencia),range=scalars(meta.rango,['desde','hasta']);
  const out:Row={_evidencia:{herramienta:tool,rango:range,...scalars(meta,['consulta_completa','detalle_completo','total_hechos'])}};
  const identity=(v:unknown)=>scalars(v,['id','numero','nombre','sexo','estado','etapa','fecha_nacimiento']);
  if(['propose_memory_save','commit_memory_save','forget_memory'].includes(tool)){
   // Confirm operation status/token, never retransmit content of stored memories.
   return JSON.stringify(scalars(r,tool==='propose_memory_save'?['_memory_proposal','token','content','reason']:['saved','id','saved_at','archived']));
  }else if(tool==='get_lot_info'){
   if(!Array.isArray(r.lotes))return CONTEXTO_NO_VERIFICADO;out.lotes=r.lotes.slice(0,100).map(v=>scalars(v,['id','nombre']));out.solo_descubrimiento=true;
  }else if(tool==='get_employee_activity'){
   if(!individual||!Array.isArray(r.resultados))return CONTEXTO_NO_VERIFICADO;
   const allowed=['id','nombre','cargo','tipo_contrato','activo',...(individual.purpose==='salary'?['salario','tarifa_jornal']:[])];
   out.resultados=r.resultados.map(v=>object(v)).filter(row=>object(row.empleado??row.contratista).id===individual.id).map(row=>({trabajador:scalars(row.empleado??row.contratista,allowed),resumen:individual.purpose==='salary'?{}:scalars(row.resumen,['total_jornales','total_costo_jornal']),registros:individual.purpose!=='salary'&&Array.isArray(row.registros)?row.registros.slice(0,30).map(v=>{const item=object(v);return {...scalars(item,['fecha_trabajo','fraccion_jornal','costo_jornal']),tarea:scalars(item.tarea,['nombre']),lote:scalars(item.lote,['nombre'])};}):[]}));
   if(!(out.resultados as unknown[]).length)return CONTEXTO_NO_VERIFICADO;
  }else if(['get_hato_partos','get_hato_eventos','get_hato_animales'].includes(tool)){
   out.resumen=scalars(r.resumen,['total_eventos','total_animales']);
   if(!Array.isArray(r.detalle)||r.detalle.length>100)return CONTEXTO_NO_VERIFICADO;
   out.detalle=r.detalle.map(v=>{const row=object(v);return {...scalars(row,['id','animal_id','tipo','fecha','fecha_confianza','cria_id','cria_destino','asociacion_cria']),...(tool==='get_hato_animales'?identity(row):{}),madre_o_animal:identity(row.madre_o_animal),cria_vinculada:identity(row.cria_vinculada),crias_por_madre_fecha:Array.isArray(row.crias_por_madre_fecha)?row.crias_por_madre_fecha.slice(0,100).map(identity):[]};});
  }else if(tool==='get_application_summary'){
   if(!Array.isArray(r.aplicaciones))return CONTEXTO_NO_VERIFICADO;
   out.aplicaciones=r.aplicaciones.slice(0,100).map(v=>scalars(v,['id','nombre_aplicacion','tipo_aplicacion','estado','fecha_inicio_planeada','fecha_fin_planeada','fecha_inicio_ejecucion','fecha_fin_ejecucion']));
   out.solo_descubrimiento=true;
  }else if(tool==='get_aplicaciones_ejecucion'){
   // Direct application rendering consumes the fresh full object internally.
   // Persistence/discovery contains identities/dates only, never rows or notes.
   if(!Array.isArray(r.detalle))return CONTEXTO_NO_VERIFICADO;
   out.detalle=r.detalle.slice(0,100).map(v=>scalars(v,['id','nombre_aplicacion','tipo_aplicacion','estado','fecha_inicio_planeada','fecha_fin_planeada','fecha_inicio_ejecucion','fecha_fin_ejecucion']));
   out.solo_descubrimiento=true;
  }else return CONTEXTO_NO_VERIFICADO;
  const serialized=JSON.stringify(out);return new TextEncoder().encode(serialized).length<=24000?serialized:CONTEXTO_NO_VERIFICADO;
 }catch{return CONTEXTO_NO_VERIFICADO;}
}
/** Unvalidated model media is not an output capability for aggregate answers. */
export function limitarMediosNoVerificados(text:string):string {
 return text.replace(/```(?:echarts|chart|mermaid|html)[\s\S]*?```/gi,'(Gráfico no verificado omitido.)')
  .replace(/!\[[^\]]*\]\([^)]*\)/g,'(Imagen no verificada omitida.)')
  .replace(/<[^>]*>/g,'').replace(/https?:\/\/[^\s)\]]+/gi,'(enlace no verificado omitido)');
}
/** Transitional source excerpt, never a license for generated claims. */
export function renderizarLecturasLegadas(reads:readonly {tool:string;result_summary:string}[]):string {
 const lines:string[]=[];
 const literal=(v:unknown)=>'`'+String(v??'no verificado').replace(/[|<>`\r\n]/g,' ').slice(0,128)+'`';
 for(const h of reads){try{const r=object(JSON.parse(h.result_summary));if(typeof r.capability_limit==='string'){const limit=limiteNucleo(r.capability_limit);if(limit)lines.push(limit);continue;}if(r.error)continue;
  const meta=object(r._evidencia),range=object(meta.rango);
  if(['get_hato_partos','get_hato_eventos','get_hato_animales'].includes(h.tool)&&Array.isArray(r.detalle)){
   lines.push(h.tool==='get_hato_partos'?'Partos registrados en el alcance consultado:':'Registros animales consultados:');
   if(range.desde&&range.hasta)lines.push(`Período: ${literal(range.desde)} a ${literal(range.hasta)}.`);
   const count=object(r.resumen).total_eventos??object(r.resumen).total_animales;
   if(meta.consulta_completa===true&&typeof count==='number'&&Number.isSafeInteger(count)&&count>=0)lines.push('Total de registros verificados: '+count+'.');
   lines.push('| Animal / madre | Fecha registrada | Cría vinculada / estado del vínculo |','| --- | --- | --- |');
   for(const v of r.detalle){const row=object(v),animal=object(row.madre_o_animal),calf=object(row.cria_vinculada);lines.push(`| ${literal(animal.numero??row.numero??animal.id??row.animal_id??row.id)} ${literal(animal.nombre??row.nombre??'')} | ${literal(row.fecha??row.fecha_nacimiento)} | ${literal(calf.numero??calf.id??'sin ficha vinculada')} — ${literal(row.asociacion_cria??row.estado??'registro')} |`);}
   lines.push('');if(meta.detalle_completo!==true)lines.push('Detalle parcial; los registros mostrados no son todo el universo.');
   if(!r.detalle.length)lines.push(meta.consulta_completa===true&&meta.detalle_completo===true?'No encontré coincidencias registradas bajo esos filtros.':'No hay detalle verificable; no concluí ausencia.');
   lines.push('No inferí identidad desde candidatas, venta, cobro ni cumplimiento físico.');
  }else if(h.tool==='get_employee_activity'&&Array.isArray(r.resultados)){
   for(const v of r.resultados){const row=object(v),worker=object(row.trabajador),summary=object(row.resumen);lines.push('Consulta individual explícita: '+literal(worker.nombre));for(const field of ['salario','tarifa_jornal'])if(worker[field]!=null)lines.push(literal(field)+': '+literal(worker[field])+' COP.');if(summary.total_jornales!=null)lines.push('Jornales registrados en los registros consultados: '+literal(summary.total_jornales));if(summary.total_costo_jornal!=null)lines.push('Costo redondeado del detalle consultado: '+literal(summary.total_costo_jornal)+' COP (detalle limitado; no acredita todo el período).');}
  }
 }catch{/* No raw parse error or payload is part of a response. */}}
 return lines.length?lines.join('\n'):'No pude verificar las partes pendientes con las fuentes disponibles. No sustituí datos con estimaciones o historial.';
}
