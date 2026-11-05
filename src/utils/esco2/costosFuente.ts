import { leerFilasFijas, type ClienteDatos } from './fuente.ts';
import { esUuid, type DatosInventarioAplicaciones } from './aplicacionesTipos.ts';
import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import type { ConsultaCantidadesAplicacion, DatosCantidadesAplicacion } from './cantidadesTipos.ts';
import type { ConsultaCostosAplicacion, DatosCostosAplicacion } from './costosTipos.ts';
export const COLUMNAS_COSTOS = {
  aplicaciones:'id,estado,costo_total_insumos,costo_total_mano_obra,costo_total',
  aplicaciones_cierre:'id,aplicacion_id,fecha_cierre',
  productos:'id,nombre,unidad_medida,precio_unitario',
} as const;
const numero=(n:unknown)=>{if(n===null)return null;const v=typeof n==='number'?n:typeof n==='string'&&n.trim()?Number(n):NaN;return Number.isFinite(v)&&v>=0?v:undefined;};
const texto=(v:unknown)=>v===null?null:typeof v==='string'?v:undefined;
export function crearLectorCostos(cliente:ClienteDatos,leerPadres:()=>Promise<DatosInventarioAplicaciones>,leerCantidades:(consulta:ConsultaCantidadesAplicacion)=>Promise<DatosCantidadesAplicacion>,tamanoPagina?:number){
  return async(consulta:ConsultaCostosAplicacion):Promise<DatosCostosAplicacion>=>{
    let padres;try{padres=(await leerPadres()).aplicaciones;}catch{return{seleccion:'no_leido'};}
    if(!padres)return{seleccion:'no_leido'};
    const identidad=resolverIdentidadAplicaciones({aplicacion_ids:consulta.aplicacion_id?[consulta.aplicacion_id]:[],aplicaciones:consulta.aplicacion?[consulta.aplicacion]:[]},padres);
    if(identidad.estado!=='ok'||identidad.aplicaciones.length!==1)return{seleccion:identidad.estado==='no_disponible'?'no_leido':'no_resuelto'};
    const aplicacion=identidad.aplicaciones[0],d:DatosCostosAplicacion={seleccion:'ok',aplicacion};
    const etiqueta=(a:typeof aplicacion)=>(a.nombre_aplicacion?.trim()||a.codigo_aplicacion?.trim()||'').toLocaleLowerCase('es');
    d.aplicacion_nombre_repetido=!!etiqueta(aplicacion)&&padres.filter(a=>etiqueta(a)===etiqueta(aplicacion)).length>1;
    async function leer(tabla:keyof typeof COLUMNAS_COSTOS,campo:string,ids:string[]){
      const filas:Record<string,unknown>[]=[];
      for(let i=0;i<ids.length;i+=100){
        const bloque=ids.slice(i,i+100),permitidos=new Set(bloque);
        const rows=await leerFilasFijas(cliente,tabla,COLUMNAS_COSTOS[tabla],q=>q.in(campo,bloque),tamanoPagina);
        if(rows.some(r=>!r||!esUuid(r.id)||!permitidos.has(r[campo] as string)))throw new Error('costos_pertenencia_no_verificada');
        filas.push(...rows);
      }
      if(new Set(filas.map(r=>r.id)).size!==filas.length)throw new Error('costos_identidad_duplicada');
      return filas;
    }
    if(aplicacion.estado==='Cerrada'){
      const [costos,cierres]=await Promise.all([
        leer('aplicaciones','id',[aplicacion.id]).catch(()=>undefined),
        leer('aplicaciones_cierre','aplicacion_id',[aplicacion.id]).catch(()=>undefined),
      ]);
      if(costos?.length===1){const c=costos[0];d.costos={id:c.id as string,estado:texto(c.estado),costo_total_insumos:numero(c.costo_total_insumos),costo_total_mano_obra:numero(c.costo_total_mano_obra),costo_total:numero(c.costo_total)};}
      if(cierres)d.cierres=cierres.map(c=>({id:c.id as string,aplicacion_id:c.aplicacion_id as string,fecha_cierre:c.fecha_cierre===null?null:esFechaCalendario(c.fecha_cierre)?c.fecha_cierre:undefined}));
    }
    if(aplicacion.estado==='Calculada'||aplicacion.estado==='En ejecución'||consulta.incluir_plan){
      try{d.cantidades=await leerCantidades(consulta);}catch{/* Amounts stay unread, independently of frozen values. */}
      if(d.cantidades?.seleccion!=='ok'||d.cantidades.aplicacion?.id!==aplicacion.id||d.cantidades.aplicacion.estado!==aplicacion.estado)return d;
      const ids=[...new Set([...(aplicacion.estado!=='Cerrada'?d.cantidades.productos_ejecutados??[]:[]),...(consulta.incluir_plan?d.cantidades.productos_plan??[]:[])].map(p=>p.producto_id))];
      if(ids.some(p=>!esUuid(p)))return d;
      try{d.precios=(await leer('productos','id',ids)).map(p=>({id:p.id as string,nombre:texto(p.nombre),unidad_medida:texto(p.unidad_medida),precio_unitario:numero(p.precio_unitario)}));}catch{/* Catalog unread is distinct from a visible catalog with a missing product. */}
    }
    return d;
  };
}
