import { ejecutarCostosAplicacion } from './costos.ts';
import { ejecutarCantidadesAplicacion } from './cantidades.ts';
import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';
import { resumirCantidadesAplicacion } from './cantidadesResumen.ts';
import type { FuenteAplicaciones, AplicacionInventario } from './aplicacionesTipos.ts';
import type { ConsultaCantidadesAplicacion, ResultadoCantidadesAplicacion } from './cantidadesTipos.ts';
import type { ConsultaCostosAplicacion, ResultadoCostosAplicacion } from './costosTipos.ts';
// Bounded, typed dependencies. Selection is a runtime result, never a model-enumerated label list.
import type { OperacionConsulta, ResultadoConsulta } from './tipos.ts';
import { ErrorPlan } from './registro.ts';
export const MAX_MIEMBROS_DEPENDENCIA = 50;
export interface SeleccionDependiente { estado:'ok'|'vacio_verificado'|'no_disponible'; ids:string[]; motivo?:string; de:string }
export function resolverDependencia(de:string,resultados:ResultadoConsulta[],entidad:'aplicaciones'|'animales'):SeleccionDependiente{
 const no=(motivo:string):SeleccionDependiente=>({de,estado:'no_disponible',ids:[],motivo});
 const r=resultados.find(r=>r.id===de);if(!r||!('tipo' in r))return no('seleccion_no_leida');
 let ids:string[];
 if(entidad==='aplicaciones'){
  if(r.tipo!=='aplicaciones'||!['ok','vacio_verificado'].includes(r.estado)||r.conteo===null||r.filas.length!==r.conteo)return no('seleccion_no_disponible');
  if(r.excluidos.sin_fecha||r.excluidos.sin_estado)return no('seleccion_con_desconocidos');
  ids=r.filas.map(f=>f.id);
 }else{
  if(r.tipo!=='hato'||!['ok','parcial','vacio_verificado'].includes(r.estado))return no('seleccion_no_disponible');
  ids=r.filas.map(f=>f.animal_id);
 }
 if(ids.length>MAX_MIEMBROS_DEPENDENCIA||new Set(ids).size!==ids.length)return no('limite_o_identidad_de_seleccion');
 return {de,estado:ids.length?'ok':'vacio_verificado',ids:[...ids].sort()};
}
export function validarDependencias(operaciones:OperacionConsulta[]):void{
 operaciones.forEach((o,index)=>{
  const de=(o.consulta as unknown as {seleccion_de?:unknown}).seleccion_de;if(de===undefined)return;
  if(typeof de!=='string'||!/^p[1-4]$/.test(de)||Number(de.slice(1))>index)throw new ErrorPlan('dependencia_no_valida');
  const fuente=operaciones[Number(de.slice(1))-1];
  const destinoAplicacion=['cantidades_aplicacion','costos_aplicacion','labor_aplicacion','faltantes_aplicacion'].includes(o.tipo);
  const destinoAnimal=['hato','pesajes_leche'].includes(o.tipo);
  if(!(destinoAplicacion&&fuente.tipo==='aplicaciones'||destinoAnimal&&fuente.tipo==='hato'))throw new ErrorPlan('dependencia_tipo_incompatible');
 });
}

export function seleccionarAplicacionesCompuestas(c:ConsultaCantidadesAplicacion,anteriores:ResultadoConsulta[],visibles:AplicacionInventario[]|undefined):SeleccionDependiente {
 if(c.seleccion_de)return resolverDependencia(c.seleccion_de,anteriores,'aplicaciones');
 if(!Array.isArray(visibles))return {de:'explicita',estado:'no_disponible',ids:[],motivo:'seleccion_no_disponible'};
 const r=resolverIdentidadAplicaciones({aplicacion_ids:c.aplicacion_ids??[],aplicaciones:c.aplicaciones??[]},visibles);
 if(r.estado!=='ok'||r.aplicaciones.length>MAX_MIEMBROS_DEPENDENCIA)return {de:'explicita',estado:'no_disponible',ids:[],motivo:'seleccion_no_disponible'};
 const ids=r.aplicaciones.map(a=>a.id).sort();return {de:'explicita',estado:ids.length?'ok':'vacio_verificado',ids};
}
export async function ejecutarCostosPoblacion(c:ConsultaCostosAplicacion,seleccion:SeleccionDependiente,fuente:FuenteAplicaciones|undefined,id:string,hoy:string):Promise<ResultadoCostosAplicacion>{
 const r=ejecutarCostosAplicacion(c,{seleccion:'no_leido'},id,hoy);r.seleccion=seleccion;r.resultados_poblacion=[];
 if(seleccion.estado==='no_disponible')return r;
 for(const app of seleccion.ids){
  const consulta={aplicacion_id:app,...(c.desde?{desde:c.desde,hasta:c.hasta}:{}),...(c.incluir_plan!==undefined?{incluir_plan:c.incluir_plan}:{})};
  let d;try{d=await fuente?.leerCostos?.(consulta);}catch{/* Unread member stays explicit. */}
  r.resultados_poblacion.push(ejecutarCostosAplicacion(consulta,d??{seleccion:'no_leido'},`${id}/${app}`,hoy));
 }
 r.estado=r.resultados_poblacion.every(x=>x.estado==='ok')?'ok':'parcial';
 return r;
}
export async function ejecutarCantidadesPoblacion(c:ConsultaCantidadesAplicacion,seleccion:SeleccionDependiente,fuente:FuenteAplicaciones|undefined,id:string,hoy:string):Promise<ResultadoCantidadesAplicacion>{
 const r=ejecutarCantidadesAplicacion(c,{seleccion:'no_leido'},id,hoy);r.seleccion=seleccion;r.resultados_poblacion=[];
 if(seleccion.estado==='no_disponible')return r;
 for(const app of seleccion.ids){
  const consulta={aplicacion_id:app,...(c.desde?{desde:c.desde,hasta:c.hasta}:{})};
  let d;try{d=await fuente?.leerCantidades?.(consulta);}catch{/* Unread member stays explicit. */}
  r.resultados_poblacion.push(ejecutarCantidadesAplicacion(consulta,d??{seleccion:'no_leido'},`${id}/${app}`,hoy));
 }
 const miembros=r.resultados_poblacion;
 r.estado=miembros.every(x=>x.estado==='ok')?'ok':'parcial';
 if(miembros.length){
  r.plan={estado:miembros.every(x=>x.plan.estado==='conocido')?'conocido':'parcial',filas:miembros.flatMap(x=>x.plan.filas),totales_guardados:miembros.flatMap(x=>x.plan.totales_guardados),conciliacion:miembros.flatMap(x=>x.plan.conciliacion),recipientes:miembros.flatMap(x=>x.plan.recipientes),motivos:miembros.flatMap(x=>x.plan.motivos),avisos:miembros.flatMap(x=>x.plan.avisos)};
  r.ejecucion={estado:miembros.every(x=>x.ejecucion.estado==='conocido')?'conocido':'parcial',filas:miembros.flatMap(x=>x.ejecucion.filas),recipientes:miembros.flatMap(x=>x.ejecucion.recipientes),motivos:miembros.flatMap(x=>x.ejecucion.motivos)};
  r.resumen=resumirCantidadesAplicacion(r);
 }
 return r;
}
