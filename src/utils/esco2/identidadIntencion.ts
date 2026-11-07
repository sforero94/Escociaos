// Local identity normalization. The model never receives these catalogs through this module.
import type { IntencionSolicitud, PoblacionIntencion } from './intencion.ts';
import type { AplicacionInventario } from './aplicacionesTipos.ts';
import { esUuid } from './aplicacionesTipos.ts';
import type { CatalogoHato } from './hatoTipos.ts';
import type { CatalogoMonitoreo } from './monitoreoTipos.ts';
import type { CatalogoConductividad } from './conductividadTipos.ts';
import { resolverTareas, resolverCategorias, normalizar } from './catalogo.ts';
import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';
import { terminoDoble, aplicarReglaDoble } from './ambiguedad.ts';
import { operacionesDelPlan, type DatosLabores, type OperacionConsulta, type Plan } from './tipos.ts';
export interface CatalogosIdentidadVisibles {
 labores?:Pick<DatosLabores,'lotes'|'tareas'|'tiposTareas'>;
 aplicaciones?:AplicacionInventario[];
 hato?:CatalogoHato;
 monitoreo?:CatalogoMonitoreo;
 conductividad?:CatalogoConductividad;
}
export interface PendienteIdentidadD26 { indice:number;termino:string;categoria:string;tarea_ids:string[];tareas:string[] }
export type IdentidadNormalizada = {tipo:'ok';intencionCanonica:IntencionSolicitud;planCanonico:Plan}
 | {tipo:'aclaracion';obligacion_ids:string[];motivo:'nombre_sin_coincidencia'|'nombre_ambiguo'|'tarea_o_categoria';d26?:PendienteIdentidadD26;intencionCanonica?:IntencionSolicitud;planCanonico?:Plan}
 | {tipo:'no_disponible';motivo:'catalogo_no_leido'|'identidad_no_visible'};
type MapaSeleccion=Record<string,(string|number)[]>;
type FilaNombre={id:string;nombre?:string|null;numero?:number|null;lote_id?:string|null};
class ProblemaIdentidad extends Error { constructor(readonly tipo:'aclaracion'|'no_disponible',readonly motivo:'nombre_sin_coincidencia'|'nombre_ambiguo'|'catalogo_no_leido'|'identidad_no_visible'){super(motivo);} }
const nombreNormal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const idNormal=(s:string)=>esUuid(s)?s.toLowerCase():s;
const failCatalogo=():never=>{throw new ProblemaIdentidad('no_disponible','catalogo_no_leido');};
const arrays=(v:unknown):v is (string|number)[]=>Array.isArray(v);
const primaria:Record<string,[string,string,string?]>={labores:['tarea_ids','tareas'],lotes:['lote_ids','lotes'],aplicaciones:['aplicacion_ids','aplicaciones'],animales:['animal_ids','nombres','chapetas'],rondas:['ronda_ids','rondas'],sublotes:['sublote_ids','sublotes'],plagas:['plaga_ids','plagas'],clima:['station_id','station_id'],quincenas:['','']};
function mapaPoblacion(p:PoblacionIntencion):MapaSeleccion{
 const out:MapaSeleccion={};
 const poner=(campo:string,valores:(string|number)[])=>{
  const normal=(v:string|number)=>campo.endsWith('_ids')?idNormal(String(v)):campo==='station_id'?String(v):nombreNormal(String(v));
  const previos=out[campo];if(!previos){out[campo]=[...valores];return;}
  const existentes=new Set(previos.map(normal));const interseccion=valores.filter(v=>existentes.has(normal(v)));
  if(!interseccion.length)throw new ProblemaIdentidad('aclaracion','nombre_sin_coincidencia');out[campo]=interseccion;
 };
 for(const f of p.filtros??[])poner(f.campo,f.valores);
 if(p.tipo==='explicita'){const [ids,nombres,chapetas]=primaria[p.entidad];if(p.ids)poner(ids,p.ids);if(p.nombres)poner(nombres,p.nombres);if(p.chapetas&&chapetas)poner(chapetas,p.chapetas);}
 return out;
}
function mapaConsulta(o:OperacionConsulta):MapaSeleccion{
 const out:MapaSeleccion={};const c=o.consulta as unknown as Record<string,unknown>;
 for(const campo of ['lote_ids','lotes','tarea_ids','tareas','categorias','aplicacion_ids','aplicaciones','estados','animal_ids','nombres','chapetas','ronda_ids','rondas','sublote_ids','sublotes','plaga_ids','plagas','station_id','seleccion_ronda']){
  const v=c[campo];if(arrays(v)&&v.length)out[campo]=[...v];else if(typeof v==='string')out[campo]=[v];
 }
 if(typeof c.aplicacion_id==='string')out.aplicacion_ids=[c.aplicacion_id];if(typeof c.aplicacion==='string')out.aplicaciones=[c.aplicacion];
 return out;
}
function comprobarCatalogo(rows:FilaNombre[]|undefined):FilaNombre[]{
 if(!Array.isArray(rows)||rows.some(r=>!r||typeof r.id!=='string'||!r.id)||new Set(rows.map(r=>idNormal(r.id))).size!==rows.length)return failCatalogo();return rows;
}
function resolverExactos(nombres:string[],rows:FilaNombre[],normal:(v:string)=>string=nombreNormal):string[]{
 if(rows.some(r=>r.nombre===undefined))return failCatalogo();
 const ids:string[]=[];for(const nombre of nombres){const opciones=rows.filter(r=>typeof r.nombre==='string'&&normal(r.nombre)===normal(nombre));if(opciones.length!==1)throw new ProblemaIdentidad('aclaracion',opciones.length?'nombre_ambiguo':'nombre_sin_coincidencia');ids.push(idNormal(opciones[0].id));}return [...new Set(ids)].sort();
}
function canonicalizarMapa(original:MapaSeleccion,capacidad:string,cat:CatalogosIdentidadVisibles,diferidos:Set<string>):MapaSeleccion{
 const out=structuredClone(original);
 function convertir(idsCampo:string,nombreCampo:string,rows:FilaNombre[]|undefined,modo:'exacto'|'tarea'|'aplicacion'='exacto'){
  const ids=(out[idsCampo]??[]) as string[],nombres=(out[nombreCampo]??[]) as string[];
  if(!ids.length&&!nombres.length)return;
  if(nombres.some(n=>diferidos.has(nombreNormal(n))))return;
  const leidas=comprobarCatalogo(rows),visibles=new Set(leidas.map(r=>idNormal(r.id)));
  if(ids.some(id=>!visibles.has(idNormal(id))))throw new ProblemaIdentidad('no_disponible','identidad_no_visible');
  let resueltos:string[]=[];
  if(nombres.length){
   if(modo==='tarea'){
    if(!cat.labores)return failCatalogo();
    const r=resolverTareas(nombres,cat.labores.tareas,cat.labores.tiposTareas);if(r.noResueltos.length)throw new ProblemaIdentidad('aclaracion','nombre_sin_coincidencia');resueltos=[...r.ids].map(idNormal);
   }else if(modo==='aplicacion'){
    if(!cat.aplicaciones)return failCatalogo();
    const r=resolverIdentidadAplicaciones({aplicacion_ids:ids.map(idNormal),aplicaciones:nombres},cat.aplicaciones);
    if(r.estado==='no_disponible')return failCatalogo();if(r.estado!=='ok'){
     const ambiguo=nombres.some(n=>cat.aplicaciones!.filter(a=>[a.nombre_aplicacion,a.codigo_aplicacion].some(v=>typeof v==='string'&&nombreNormal(v).includes(nombreNormal(n)))).length>1);
     throw new ProblemaIdentidad('aclaracion',ambiguo?'nombre_ambiguo':'nombre_sin_coincidencia');
    }resueltos=r.aplicaciones.map(a=>idNormal(a.id));
   }else resueltos=resolverExactos(nombres,leidas,capacidad==='labores'&&nombreCampo==='lotes'?normalizar:nombreNormal);
  }
  const seleccion=ids.length&&nombres.length?resueltos.filter(id=>ids.map(idNormal).includes(id)):nombres.length?resueltos:ids.map(idNormal);
  if(!seleccion.length)throw new ProblemaIdentidad('aclaracion','nombre_sin_coincidencia');
  delete out[nombreCampo];out[idsCampo]=[...new Set(seleccion)].sort();
 }
 const lotes=capacidad==='labores'?cat.labores?.lotes:capacidad==='conductividad'?cat.conductividad?.lotes:cat.monitoreo?.lotes;
 convertir('lote_ids','lotes',lotes);
 convertir('tarea_ids','tareas',cat.labores?.tareas,'tarea');
 convertir('aplicacion_ids','aplicaciones',cat.aplicaciones,'aplicacion');
 convertir('animal_ids','nombres',cat.hato?.animales);
 if(out.chapetas?.length){
  const rows=comprobarCatalogo(cat.hato?.animales);if(rows.some(r=>r.numero===undefined))return failCatalogo();
  const elegidos=out.chapetas.map(valor=>{const numero=typeof valor==='number'?valor:/^[0-9]+$/.test(valor)?Number(valor):NaN;if(!Number.isSafeInteger(numero)||numero<=0)throw new ProblemaIdentidad('aclaracion','nombre_sin_coincidencia');const xs=rows.filter(a=>a.numero===numero);if(xs.length!==1)throw new ProblemaIdentidad('aclaracion',xs.length?'nombre_ambiguo':'nombre_sin_coincidencia');return idNormal(xs[0].id);});
  const anteriores=out.animal_ids as string[]|undefined;const interseccion=anteriores?.length?elegidos.filter(id=>anteriores.includes(id)):elegidos;if(!interseccion.length)throw new ProblemaIdentidad('aclaracion','nombre_sin_coincidencia');delete out.chapetas;out.animal_ids=[...new Set(interseccion)].sort();
 }
 convertir('ronda_ids','rondas',cat.monitoreo?.rondas);
 const sublotes=cat.monitoreo?.sublotes;
 const subAmbito=out.lote_ids?.length&&out.sublotes?.length?sublotes?.filter(s=>out.lote_ids.includes(s.lote_id!)):sublotes;
 convertir('sublote_ids','sublotes',subAmbito);
 convertir('plaga_ids','plagas',cat.monitoreo?.plagas);
 if(out.categorias?.length&&!out.categorias.some(n=>diferidos.has(nombreNormal(String(n))))){
  if(capacidad==='labores'){
   if(!cat.labores)return failCatalogo();const r=resolverCategorias(out.categorias as string[],{...cat.labores,registros:[]});if(r.noResueltos.length)throw new ProblemaIdentidad('aclaracion',r.noResueltos.some(p=>p.motivo==='ambiguo')?'nombre_ambiguo':'nombre_sin_coincidencia');out.categorias=r.nombres.sort();
  }
 }
 return out;
}
function escribirPoblacion(p:PoblacionIntencion,mapa:MapaSeleccion):PoblacionIntencion{
 if(p.tipo==='derivada')return structuredClone(p);
 const out=structuredClone(p);delete out.ids;delete out.nombres;delete out.chapetas;out.filtros=[];
 const [idsCampo,nombreCampo,chapetasCampo]=primaria[p.entidad];
 if(p.tipo==='explicita'){
  if(mapa[idsCampo]){out.ids=mapa[idsCampo] as string[];delete mapa[idsCampo];}
  else if(mapa[nombreCampo]){out.nombres=mapa[nombreCampo] as string[];delete mapa[nombreCampo];}
  else if(chapetasCampo&&mapa[chapetasCampo]){out.chapetas=mapa[chapetasCampo] as number[];delete mapa[chapetasCampo];}
 }
 out.filtros=Object.entries(mapa).map(([campo,valores])=>({campo,valores:valores.map(String)}));if(!out.filtros.length)delete out.filtros;return out;
}
function escribirConsulta(o:OperacionConsulta,mapa:MapaSeleccion):OperacionConsulta{
 const copia=structuredClone(o);const c=copia.consulta as unknown as Record<string,unknown>;
 for(const k of ['lote_ids','lotes','tarea_ids','tareas','categorias','aplicacion_ids','aplicaciones','animal_ids','nombres','chapetas','ronda_ids','rondas','sublote_ids','sublotes','plaga_ids','plagas'])if(k in c)c[k]=[];
 if(o.tipo==='cantidades_aplicacion'||o.tipo==='costos_aplicacion'){delete c.aplicacion_id;delete c.aplicacion;delete c.aplicacion_ids;delete c.aplicaciones;const ids=mapa.aplicacion_ids as string[]|undefined;if(ids?.length===1){c.aplicacion_id=ids[0];delete mapa.aplicacion_ids;}else if(ids?.length)c.aplicacion_ids=ids;}
 for(const [k,v]of Object.entries(mapa))c[k]=k==='station_id'||k==='seleccion_ronda'?v[0]:v;
 return copia;
}
export function normalizarIdentidadIntencionPlan(intencion:IntencionSolicitud,plan:Plan,catalogos:CatalogosIdentidadVisibles):IdentidadNormalizada{
 const i=structuredClone(intencion),p=structuredClone(plan);
 const ops=p.tipo==='consultas'||p.tipo==='operaciones'?operacionesDelPlan(p):[];
 let actualObligacion:string[]=[];
 const diferidos=new Set<string>();
 try{
 if(catalogos.labores)for(const ob of i.obligaciones){actualObligacion=[ob.id];if(ob.capacidad!=='labores')continue;const m=mapaPoblacion(ob.poblacion);for(const t of [...m.tareas??[],...m.categorias??[]])if(typeof t==='string'&&terminoDoble(t,catalogos.labores))diferidos.add(nombreNormal(t));}
  for(const ob of i.obligaciones){actualObligacion=[ob.id];if(ob.poblacion.tipo==='derivada')continue;const m=canonicalizarMapa(mapaPoblacion(ob.poblacion),ob.capacidad,catalogos,diferidos);ob.poblacion=escribirPoblacion(ob.poblacion,m);}
  const normalizadas=ops.map(o=>{actualObligacion=(o.parte_ids??[]).map(id=>`o${id.slice(1)}`);return escribirConsulta(o,canonicalizarMapa(mapaConsulta(o),o.tipo,catalogos,diferidos));});
  if(diferidos.size)for(const ob of i.obligaciones){
   if(ob.capacidad!=='labores')continue;const m=mapaPoblacion(ob.poblacion);
   const tieneAmbigua=[...m.tareas??[],...m.categorias??[]].some(t=>diferidos.has(nombreNormal(String(t))));if(!tieneAmbigua)continue;
   for(const op of normalizadas)if(op.tipo==='labores'&&op.parte_ids?.includes(`s${ob.id.slice(1)}`)){
    op.consulta.tareas=(m.tareas??[]) as string[];op.consulta.categorias=(m.categorias??[]) as string[];op.consulta.tarea_ids=(m.tarea_ids??[]) as string[];
   }
  }
  const planCanonico:Plan=p.tipo==='consultas'||p.tipo==='operaciones'?{tipo:'operaciones',operaciones:normalizadas,...(p.cobertura?{cobertura:p.cobertura}:{}),...(p.parcialFueraDeAlcance?{parcialFueraDeAlcance:true}:{})}:p;
  // A task/category ambiguity remains raw until the existing D26 choice resolves it.
  if(diferidos.size&&catalogos.labores){
   const laborales=normalizadas.map((o,indice)=>({o,indice})).filter((x):x is {o:Extract<OperacionConsulta,{tipo:'labores'}>;indice:number}=>x.o.tipo==='labores');
   const prueba=aplicarReglaDoble({tipo:'consultas',consultas:laborales.map(x=>x.o.consulta)},catalogos.labores);
   if(prueba.plan.tipo==='aclaracion'){
    const x=laborales.find(x=>[...x.o.consulta.tareas,...x.o.consulta.categorias].some(t=>diferidos.has(nombreNormal(t))));
    if(x){const t=[...x.o.consulta.tareas,...x.o.consulta.categorias].find(t=>diferidos.has(nombreNormal(t)))!;const d=terminoDoble(t,catalogos.labores)!;
     return {tipo:'aclaracion',motivo:'tarea_o_categoria',obligacion_ids:(x.o.parte_ids??[]).map(id=>`o${id.slice(1)}`),d26:{indice:x.indice,termino:t,categoria:d.categoria,tarea_ids:[...resolverTareas([t],catalogos.labores.tareas,catalogos.labores.tiposTareas).ids],tareas:d.tareas},intencionCanonica:i,planCanonico};
    }
   }
  }
  return {tipo:'ok',intencionCanonica:i,planCanonico};
 }catch(e){if(e instanceof ProblemaIdentidad)return e.tipo==='aclaracion'?{tipo:'aclaracion',motivo:e.motivo as 'nombre_sin_coincidencia'|'nombre_ambiguo',obligacion_ids:actualObligacion}:{tipo:'no_disponible',motivo:e.motivo as 'catalogo_no_leido'|'identidad_no_visible'};throw e;}
}
