// A previous result selection is server-owned scope, not evidence reconstructed from assistant prose.
import type {IntencionSolicitud} from './intencion.ts';
import type {MensajeHistorial,ResultadoConsulta} from './tipos.ts';
import {esUuid} from './aplicacionesTipos.ts';
export interface PoblacionPrevia {operacion_id:string;entidad:'animales'|'aplicaciones';ids:string[];estado:'completa'|'parcial'}
export interface VisibilidadPoblaciones {aplicaciones?:{id:string}[];animales?:{id:string}[]}
export type ReferenciaPoblacion={tipo:'no_deictica'}|{tipo:'aclaracion';motivo:'contexto_ausente'|'poblacion_ambigua_o_parcial'|'identidad_no_visible'}|{tipo:'resuelta';entidad:'animales'|'aplicaciones';ids:string[];origen:'estado'};
const palabrasNumero:Record<string,number>={una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10};
const forma=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const PATRON_REFERENCIA=/\b(?:esas|esos|estas|estos|aquellas|aquellos)\s+(\d+|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|mismas|mismos|anteriores)\b|\b(?:las|los)\s+(anteriores|mismas|mismos)\b/;
export function poblacionesDesdeResultados(resultados:ResultadoConsulta[]):PoblacionPrevia[]{
 const out:PoblacionPrevia[]=[];
 for(const r of resultados){
  if(!('tipo' in r)||!['aplicaciones','hato'].includes(r.tipo))continue;
  if(r.tipo==='aplicaciones'){
   const completos=['ok','vacio_verificado'].includes(r.estado)&&r.conteo!==null&&r.filas.length===r.conteo&&!r.excluidos.sin_fecha&&!r.excluidos.sin_estado;
   const ids=r.filas.map(f=>f.id).sort();const acotados=ids.length<=50&&new Set(ids).size===ids.length&&ids.every(esUuid);
   out.push({operacion_id:r.id,entidad:'aplicaciones',ids:acotados?ids:[],estado:completos&&acotados?'completa':'parcial'});
  }else if(r.tipo==='hato'){
   // Optional ficha/reproduction fields may be partial while membership was selected safely by the executor.
   const ids=r.filas.map(f=>f.animal_id).sort();const acotados=ids.length<=50&&new Set(ids).size===ids.length&&ids.every(esUuid);
   out.push({operacion_id:r.id,entidad:'animales',ids:acotados?ids:[],estado:['ok','parcial','vacio_verificado'].includes(r.estado)&&acotados?'completa':'parcial'});
  }
 }
 return out.slice(0,4);
}
function entidadTexto(t:string):'animales'|'aplicaciones'|undefined{
 const app=/\baplicacion(?:es)?\b/.test(t),hato=/\b(?:animales|animal|vacas|vaca|hato|fichas|ficha)\b/.test(t);
 return app===hato?undefined:app?'aplicaciones':'animales';
}
export function resolverReferenciaPoblacion(pregunta:string,_historial:MensajeHistorial[],estado:{poblacionesPrevias?:PoblacionPrevia[]}|undefined,visibilidad:VisibilidadPoblaciones):ReferenciaPoblacion{
 // This finite guard distinguishes immediate attribute references from member references; it does not certify arbitrary language.
 const t=forma(pregunta);
 const atributos=/^\s+(?:fechas?|periodos?|rangos?|intervalos?|dias?|mes(?:es)?|semanas?|quincenas?|bases?|metricas?|variables?|agrupaciones|filtros?|condiciones|unidades)\b/;
 const match=[...t.matchAll(new RegExp(PATRON_REFERENCIA.source,'g'))].find(m=>!atributos.test(t.slice((m.index??0)+m[0].length)));
 if(!match)return {tipo:'no_deictica'};
 const palabra=match[1]??match[2];const n=palabrasNumero[palabra]??(/^\d+$/.test(palabra)?Number(palabra):undefined);const entidad=entidadTexto(t);
 if(!estado)return {tipo:'aclaracion',motivo:'contexto_ausente'};
 const candidates=estado.poblacionesPrevias??[];
 const completas=candidates.filter(p=>p.estado==='completa'&&(!entidad||p.entidad===entidad)&&(n===undefined||p.ids.length===n));
 const unicas=[...new Map(completas.map(p=>[`${p.entidad}:${p.ids.join(',')}`,p])).values()];
 if(unicas.length!==1)return {tipo:'aclaracion',motivo:candidates.length?'poblacion_ambigua_o_parcial':'contexto_ausente'};
 const p=unicas[0],actuales=p.entidad==='aplicaciones'?visibilidad.aplicaciones:visibilidad.animales;
 if(!Array.isArray(actuales)||p.ids.some(id=>!actuales.some(a=>a.id.toLowerCase()===id.toLowerCase())))return {tipo:'aclaracion',motivo:'identidad_no_visible'};
 return {tipo:'resuelta',entidad:p.entidad,ids:[...p.ids],origen:'estado'};
}
export function verificarReferenciaPoblacion(ref:ReferenciaPoblacion,intencion:IntencionSolicitud):boolean{
 if(ref.tipo!=='resuelta')return ref.tipo==='no_deictica';
 const campo=ref.entidad==='aplicaciones'?'aplicacion_ids':'animal_ids';
 const capacidades=ref.entidad==='aplicaciones'?['aplicaciones','cantidades_aplicacion','costos_aplicacion','labor_aplicacion','faltantes_aplicacion']:['hato','pesajes_leche'];
 const propias=intencion.obligaciones.filter(o=>capacidades.includes(o.capacidad));if(!propias.length)return false;
 return propias.every(o=>{
  const p=o.poblacion;if(p.tipo==='derivada')return true;
  const ids=p.tipo==='explicita'&&p.entidad===ref.entidad?p.ids:p.filtros?.find(f=>f.campo===campo)?.valores;
  return !!ids&&JSON.stringify([...ids].sort())===JSON.stringify([...ref.ids].sort());
 });
}
