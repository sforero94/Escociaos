// D36 never joins by names or drops applications without a task.
import { aRegistro, COLUMNAS, leerFilasFijas, type ClienteDatos } from './fuente.ts';
import { esUuid, type DatosInventarioAplicaciones } from './aplicacionesTipos.ts';
import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';
import type { ConsultaLaborAplicacion, DatosLaborAplicacion } from './laborAplicacionTipos.ts';
const COLUMNAS_LABOR = { tareas: 'id,nombre', registros_trabajo: COLUMNAS.registros_trabajo, lotes: 'id,nombre' } as const;
export function crearLectorLaborAplicacion(cliente: ClienteDatos, leerPadres: () => Promise<DatosInventarioAplicaciones>, tamanoPagina?: number) {
  return async (consulta: ConsultaLaborAplicacion): Promise<DatosLaborAplicacion> => {
    const d: DatosLaborAplicacion = { seleccion: 'no_leido' };
    let padres;
    try { padres = (await leerPadres()).aplicaciones; } catch { return d; }
    if (!padres) return d;
    const seleccion = resolverIdentidadAplicaciones(consulta, padres);
    if (seleccion.estado !== 'ok' || !seleccion.aplicaciones.length) return { seleccion: seleccion.estado === 'no_disponible' ? 'no_leido' : 'no_resuelto' };
    d.seleccion = 'ok'; d.aplicaciones = seleccion.aplicaciones; d.aplicaciones_visibles = padres;
    async function leer(tabla: keyof typeof COLUMNAS_LABOR, campo: string, ids: string[]) {
      const unicos = [...new Set(ids)], filas: Record<string, unknown>[] = [];
      for(let i=0;i<unicos.length;i+=100) {
        const bloque=unicos.slice(i,i+100), permitidos=new Set(bloque);
        const rows=await leerFilasFijas(cliente,tabla,COLUMNAS_LABOR[tabla],q=>q.in(campo,bloque),tamanoPagina);
        if(rows.some(r=>!r||!esUuid(r.id)||!permitidos.has(r[campo] as string))) throw Error('labor_fuente_no_valida');
        filas.push(...rows);
      }
      if(new Set(filas.map(r=>r.id)).size!==filas.length) throw Error('labor_fuente_no_valida');
      return filas;
    }
    const tareaIds=d.aplicaciones.map(a=>a.tarea_id).filter(esUuid);
    try { d.tareas = await leer('tareas','id',tareaIds) as DatosLaborAplicacion['tareas']; } catch { return d; }
    // Only a task visible through the selected parent can authorize its labor children.
    const visibles=d.tareas!.map(t=>t.id);
    try { d.registros=(await leer('registros_trabajo','tarea_id',visibles)).map(aRegistro); } catch { return d; }
    const loteIds=d.registros.map(r=>r.lote_id).filter(esUuid);
    try { d.lotes=await leer('lotes','id',loteIds) as DatosLaborAplicacion['lotes']; } catch { /* Optional names do not erase registered labor. */ }
    return d;
  };
}
