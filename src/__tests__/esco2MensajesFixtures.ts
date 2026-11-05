// QA-owned mensajes-v1.3: literal Spanish and arithmetic fixed before renderer execution.
// Synthetic result objects only; no P1/private evaluation artifacts.
import type {ResultadoParte} from '../utils/esco2/tipos.ts';
export const PERIODO_OCT='Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.';
export const PERIODO_NOV='Del 2 de noviembre de 2026 al 8 de noviembre de 2026, ambas fechas incluidas.';
export const ALCANCE_VISIBLE='Se consultaron las labores que puedes ver.';
export const ACLARACION_COSECHA='¿Quieres consultar la tarea «Cosecha puntual» o toda la categoría «Cosecha»?';
export interface VinculoLiteral {entidad:string;metrica:string;valor:number|string|null;desde:string;hasta:string;fragmento:string;}
export interface CasoMensaje {id:string;criterio:string;resultados:ResultadoParte[];lineas:string[];vinculos:VinculoLiteral[];}
export function resultadoMensaje(over:Partial<ResultadoParte>={}):ResultadoParte {
  return {id:'p1',proposito:'777 afirmaciones arbitrarias del modelo',estado:'ok',
    semantica:{cohorte:'trabajo_registrado',base_fecha:'fecha_trabajo',disposicion:'respondida',miembros:['task-cosecha','task-poda'],fuentes:['record-a','record-b'],calificadores:['alcance_visible','trabajo_registrado','lecturas_sin_garantia_de_snapshot_conjunto','sin_lote:incluir']},
    alcance:{desde:'2026-10-26',hasta:'2026-11-01',hasta_recortado_a_hoy:false,lotes:'todos',tareas:'todas',categorias:'todas',sin_lote:'incluir',agrupar_por:[]},
    no_resueltos:[],filas:[],total:{jornales:4.5,costo:95000000},notas:[],cobertura:{registros:2,registros_sin_lote:0,registros_sin_costo:0,grupos_totales:0,grupos_mostrados:0},...over};
}
export const conocido=resultadoMensaje({filas:[
  {grupo:{tarea:'Cosecha'},grupo_ids:{tarea:'task-cosecha'},fuentes:['record-a'],jornales:2,costo:40000000},
  {grupo:{tarea:'Poda'},grupo_ids:{tarea:'task-poda'},fuentes:['record-b'],jornales:2.5,costo:55000000},
],cobertura:{registros:2,registros_sin_lote:0,registros_sin_costo:0,grupos_totales:2,grupos_mostrados:2}});
export const vacio=resultadoMensaje({estado:'sin_registros',total:{jornales:0,costo:0},semantica:{...conocido.semantica!,miembros:[],fuentes:[]},cobertura:{registros:0,registros_sin_lote:0,registros_sin_costo:0,grupos_totales:0,grupos_mostrados:0}});
export const sinCosto=resultadoMensaje({total:{jornales:4.5,costo:null},cobertura:{...conocido.cobertura,registros_sin_costo:1}});
export const noDisponible=resultadoMensaje({estado:'no_disponible',total:{},semantica:{...conocido.semantica!,disposicion:'fuente_no_disponible',motivo:'campo_registro_no_disponible',miembros:[],fuentes:[]}});
export const noSoportado=resultadoMensaje({estado:'no_disponible',total:{},semantica:{...conocido.semantica!,disposicion:'no_soportada',motivo:'valoracion_aplicaciones_no_soportada',miembros:[],fuentes:[]}});
export const pendiente=resultadoMensaje({estado:'no_resuelto',total:{},aclaracion:{tipo:'categoria_o_tareas',categoria:'Cosecha',tareas:['Cosecha puntual']},semantica:{...conocido.semantica!,disposicion:'aclaracion',miembros:[],fuentes:[]}});
export const estimadoParcial=resultadoMensaje({estimados:{jornales_estimados:5,tareas_en_alcance:3,tareas_sin_estimado:1,tareas_estimado_no_disponible:1,base:'toda_la_categoria'}});
export const asociaciones=resultadoMensaje({filas:[{grupo:{tarea:'Cosecha'},grupo_ids:{tarea:'task-cosecha'},jornales:4.5,costo:95000000,asociaciones:{estado:'conocido',aplicaciones:[
  {id:'application-a',codigo:'CODE-001',nombre:'Abono',estado:'Cerrada'},
  {id:'application-b',codigo:'CODE-002',nombre:'Riego',estado:'Abierta'},
]}}],cobertura:{...conocido.cobertura,grupos_totales:1,grupos_mostrados:1}});
export const asociacionDesconocida=resultadoMensaje({filas:[{grupo:{tarea:'Cosecha'},grupo_ids:{tarea:'task-cosecha'},jornales:4.5,costo:95000000,asociaciones:{estado:'no_disponible',aplicaciones:[]},campos_no_disponibles:['asociaciones']}]});
export const asociacionVacia=resultadoMensaje({filas:[{grupo:{tarea:'Cosecha'},grupo_ids:{tarea:'task-cosecha'},jornales:4.5,costo:95000000,asociaciones:{estado:'vacio_verificado',aplicaciones:[]}}]});
export const cruzado=resultadoMensaje({total:{jornales:97,costo:97000000},filas:[
 {grupo:{tarea:'Cosecha'},grupo_ids:{tarea:'task-cosecha'},jornales:95,costo:2000000},
 {grupo:{tarea:'Poda'},grupo_ids:{tarea:'task-poda'},jornales:2,costo:95000000},
],cobertura:{...conocido.cobertura,grupos_totales:2,grupos_mostrados:2}});
export const conciliado=resultadoMensaje({particiones:{con_lote:{jornales:4,costo:90000000},sin_lote:{jornales:.5,costo:5000000}}});
export const tabla=resultadoMensaje({total:{jornales:21,costo:6000000},alcance:{...conocido.alcance,agrupar_por:['lote']},filas:[
 {grupo:{lote:'Norte'},grupo_ids:{lote:'lot-norte'},jornales:1,costo:1000000},
 {grupo:{lote:'Sur'},grupo_ids:{lote:'lot-sur'},jornales:2,costo:1000000},
 {grupo:{lote:'Centro'},grupo_ids:{lote:'lot-centro'},jornales:3,costo:1000000},
 {grupo:{lote:'Alto'},grupo_ids:{lote:'lot-alto'},jornales:4,costo:1000000},
 {grupo:{lote:'Bajo'},grupo_ids:{lote:'lot-bajo'},jornales:5,costo:1000000},
 {grupo:{lote:'Sin lote'},grupo_ids:{lote:'sin_lote'},jornales:6,costo:1000000},
],cobertura:{registros:6,registros_sin_lote:1,registros_sin_costo:0,grupos_totales:6,grupos_mostrados:6}});
export const ranking=resultadoMensaje({total:{jornales:4.5,costo:95000000},filas:[
 {grupo:{lote:'Norte'},grupo_ids:{lote:'lot-norte'},jornales:2,costo:40000000},
 {grupo:{lote:'Sur'},grupo_ids:{lote:'lot-sur'},jornales:1,costo:40000000},
],alcance:{...conocido.alcance,agrupar_por:['lote']},semantica:{...conocido.semantica!,calificadores:[...conocido.semantica!.calificadores,'ranking:costo:desc:incluir','grupos:4:mostrados:2']},cobertura:{...conocido.cobertura,grupos_totales:4,grupos_mostrados:2}});
export const otroPeriodo=resultadoMensaje({id:'p2',total:{jornales:4.5,costo:2000000},alcance:{...conocido.alcance,desde:'2026-11-02',hasta:'2026-11-08'}});

export const noResuelto=resultadoMensaje({estado:'no_resuelto',total:{},no_resueltos:[{tipo:'lote',texto:'Vega',motivo:'ambiguo',sugerencias:['Norte','Sur']}],semantica:undefined});
export const ceroConocido=resultadoMensaje({total:{jornales:1,costo:0}});
export const vacioProgramado=resultadoMensaje({estado:'sin_registros',total:{},filas:[],semantica:{...conocido.semantica!,cohorte:'tarea_programada',base_fecha:'fecha_estimada_inicio',miembros:[],fuentes:[]}});

export const casosMensajes:CasoMensaje[]=[
 {id:'no-resuelto',criterio:'Un nombre ambiguo ofrece sugerencias legibles sin seleccionar una entidad.',resultados:[noResuelto],lineas:['No pude identificar el lote que quieres consultar. ¿Te refieres a Norte o Sur?'],vinculos:[]},
 {id:'cero-conocido',criterio:'Un costo cero registrado conserva el trabajo conocido.',resultados:[ceroConocido],lineas:['Se registró 1 jornal; costo de mano de obra: $0.',PERIODO_OCT],vinculos:[]},
 {id:'vacio-programado',criterio:'Vacío programado es ausencia registrada y visible, no dato desconocido.',resultados:[vacioProgramado],lineas:['No hay tareas programadas registradas con inicio planeado en el período consultado entre las que puedes ver.',PERIODO_OCT],vinculos:[]},
 {id:'conocido',criterio:'Trabajo y costo conocidos aparecen con su entidad y período inclusivo.',resultados:[conocido],lineas:['Se registraron 4,5 jornales; costo de mano de obra: $95.0M.',PERIODO_OCT,'- Cosecha: 2 jornales registrados; costo de mano de obra: $40.0M.','- Poda: 2,5 jornales registrados; costo de mano de obra: $55.0M.',ALCANCE_VISIBLE],vinculos:[
  {entidad:'total',metrica:'jornales',valor:4.5,desde:'2026-10-26',hasta:'2026-11-01',fragmento:'Se registraron 4,5 jornales; costo de mano de obra: $95.0M.'},
  {entidad:'task-cosecha',metrica:'costo',valor:40000000,desde:'2026-10-26',hasta:'2026-11-01',fragmento:'- Cosecha: 2 jornales registrados; costo de mano de obra: $40.0M.'},
  {entidad:'task-poda',metrica:'jornales',valor:2.5,desde:'2026-10-26',hasta:'2026-11-01',fragmento:'- Poda: 2,5 jornales registrados; costo de mano de obra: $55.0M.'},
 ]},
 {id:'vacio-visible',criterio:'Vacío verificado se limita al usuario y período.',resultados:[vacio],lineas:['No hay registros de trabajo en el período consultado.',PERIODO_OCT,ALCANCE_VISIBLE],vinculos:[]},
 {id:'costo-null',criterio:'NULL no se convierte en costo cero.',resultados:[sinCosto],lineas:['Se registraron 4,5 jornales.','El costo no está completo: hay registros sin costo registrado.',PERIODO_OCT],vinculos:[]},
 {id:'fuente-no-disponible',criterio:'La fuente faltante tiene una razón legible y ningún cero.',resultados:[noDisponible],lineas:['No tengo ese dato: no pude leer los datos de los registros de trabajo necesarios para responder.',PERIODO_OCT],vinculos:[]},
 {id:'no-soportado',criterio:'Una capacidad no implementada se declara sin datos inventados.',resultados:[noSoportado],lineas:['Esa consulta todavía no está disponible. Por ahora puedo responder sobre labores registradas y tareas programadas.'],vinculos:[]},
 {id:'aclaracion',criterio:'Una sola pregunta ofrece dos elecciones concretas.',resultados:[pendiente],lineas:[ACLARACION_COSECHA],vinculos:[]},
 {id:'estimados-parciales',criterio:'Subtotal conocido, plan completo, NULL y no leído se distinguen.',resultados:[estimadoParcial],lineas:['Jornales estimados para el plan completo de esas tareas: 5.','Es un subtotal conocido: 1 tarea no tiene estimado y el estimado de 1 tarea no se pudo leer.'],vinculos:[]},
 {id:'asociaciones',criterio:'Se conservan los miembros correctos sin códigos ni IDs.',resultados:[asociaciones],lineas:['Aplicaciones asociadas a Cosecha: Abono y Riego.'],vinculos:[]},
 {id:'asociacion-desconocida',criterio:'La relación no leída no es un conjunto vacío.',resultados:[asociacionDesconocida],lineas:['No pude comprobar las aplicaciones asociadas a Cosecha porque esos datos no están disponibles.'],vinculos:[]},
 {id:'asociacion-vacia',criterio:'Ausencia verificada solo en el alcance visible.',resultados:[asociacionVacia],lineas:['Cosecha no tiene aplicaciones asociadas entre las que puedes ver.'],vinculos:[]},
];
