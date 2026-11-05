// D37 only reads current plans and inventory through caller-visible parent IDs.
import { leerFilasFijas, type ClienteDatos } from './fuente.ts';
import { esUuid, type DatosInventarioAplicaciones } from './aplicacionesTipos.ts';
import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';
import type { ConsultaFaltantesAplicacion, DatosFaltantesAplicacion } from './faltantesTipos.ts';
export const COLUMNAS_FALTANTES = {
  aplicaciones_mezclas: 'id,aplicacion_id',
  aplicaciones_productos: 'id,mezcla_id,producto_id,producto_nombre,producto_unidad,cantidad_total_necesaria',
  productos: 'id,nombre,unidad_medida,cantidad_actual',
} as const;
const normalizar = (r: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(r).map(([k,v])=>{if(!['cantidad_actual','cantidad_total_necesaria'].includes(k)||v===null)return [k,v];const n=typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v):NaN;return [k,Number.isFinite(n)&&n>=0?n:undefined];}));
export function crearLectorFaltantes(cliente: ClienteDatos, leerPadres: () => Promise<DatosInventarioAplicaciones>, tamanoPagina?: number) {
  return async (consulta: ConsultaFaltantesAplicacion): Promise<DatosFaltantesAplicacion> => {
    const d:DatosFaltantesAplicacion={seleccion:'no_leido'};
    let padres;
    try {padres=(await leerPadres()).aplicaciones;}catch{return d;}
    if(!padres)return d;
    const seleccion=resolverIdentidadAplicaciones(consulta,padres);
    if(seleccion.estado!=='ok'||!seleccion.aplicaciones.length)return {seleccion:seleccion.estado==='no_disponible'?'no_leido':'no_resuelto'};
    d.seleccion='ok';d.aplicaciones=seleccion.aplicaciones;
    async function leer(tabla:keyof typeof COLUMNAS_FALTANTES,campo:string,ids:string[]) {
      const unicos=[...new Set(ids)],filas:Record<string,unknown>[]=[];
      for(let i=0;i<unicos.length;i+=100){const bloque=unicos.slice(i,i+100),permitidos=new Set(bloque);const rows=await leerFilasFijas(cliente,tabla,COLUMNAS_FALTANTES[tabla],q=>q.in(campo,bloque),tamanoPagina);if(rows.some(r=>!r||!esUuid(r.id)||!permitidos.has(r[campo] as string)))throw Error('faltante_referencia_no_valida');filas.push(...rows);}
      if(new Set(filas.map(r=>r.id)).size!==filas.length)throw Error('faltante_referencia_no_valida');
      return filas.map(normalizar);
    }
    try {d.mezclas=(await leer('aplicaciones_mezclas','aplicacion_id',d.aplicaciones.map(a=>a.id))).map(r=>({...r,id:r.id as string,aplicacion_id:r.aplicacion_id as string}));}catch{return d;}
    try {d.productos_plan=(await leer('aplicaciones_productos','mezcla_id',d.mezclas!.map(m=>m.id))).map(r=>({...r,id:r.id as string,mezcla_id:r.mezcla_id as string,producto_id:r.producto_id as string}));}catch{return d;}
    if(d.productos_plan!.some(p=>!esUuid(p.producto_id))){d.productos_plan=undefined;return d;}
    try {d.inventario=(await leer('productos','id',d.productos_plan!.map(p=>p.producto_id))).map(r=>({...r,id:r.id as string}));}catch{/* Current inventory remains unread. */}
    return d;
  };
}
