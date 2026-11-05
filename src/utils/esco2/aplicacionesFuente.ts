// Fixed inventory readers on the authenticated caller's existing data client.
import { leerFilasFijas, type ClienteDatos } from './fuente.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import { esUuid, ESTADOS_APLICACION, type AplicacionInventario, type CierreInventario, type DatosInventarioAplicaciones, type FuenteAplicaciones, type MovimientoInventario } from './aplicacionesTipos.ts';
import { crearLectorLaborAplicacion } from './laborAplicacionFuente.ts';
import { crearLectorCantidades } from './cantidadesFuente.ts';

export const COLUMNAS_APLICACIONES = {
  aplicaciones: 'id,codigo_aplicacion,nombre_aplicacion,tipo_aplicacion,estado,fecha_inicio_planeada,fecha_fin_planeada,fecha_inicio_ejecucion,fecha_fin_ejecucion,tarea_id',
  movimientos_diarios: 'id,aplicacion_id,lote_id,fecha_movimiento',
  aplicaciones_cierre: 'id,aplicacion_id,fecha_cierre',
} as const;
const texto = (v: unknown) => v === null ? null : typeof v === 'string' ? v : undefined;
const fecha = (v: unknown) => v === null ? null : esFechaCalendario(v) ? v : undefined;
/** Missing/malformed optional fields remain unread instead of deleting the parent. */
export function normalizarAplicacionInventario(a: AplicacionInventario): AplicacionInventario {
  return {
    id: a.id,
    codigo_aplicacion: texto(a.codigo_aplicacion), nombre_aplicacion: texto(a.nombre_aplicacion), tipo_aplicacion: texto(a.tipo_aplicacion),
    estado: a.estado === null ? null : ESTADOS_APLICACION.includes(a.estado!) ? a.estado : undefined,
    tarea_id: a.tarea_id === null ? null : esUuid(a.tarea_id) ? a.tarea_id : undefined,
    fecha_inicio_planeada: fecha(a.fecha_inicio_planeada), fecha_fin_planeada: fecha(a.fecha_fin_planeada),
    fecha_inicio_ejecucion: fecha(a.fecha_inicio_ejecucion), fecha_fin_ejecucion: fecha(a.fecha_fin_ejecucion),
  };
}
function validarIds(rows: Record<string, unknown>[]): void {
  if (rows.some(r => !r || !esUuid(r.id)) || new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('identidades_no_disponibles');
}
export function fuenteAplicacionesSupabase(cliente: ClienteDatos, opciones: { tamanoPagina?: number } = {}): FuenteAplicaciones {
  const fuente: FuenteAplicaciones = {
    async leer(base) {
      const datos: DatosInventarioAplicaciones = {};
      try {
        const rows = await leerFilasFijas(cliente, 'aplicaciones', COLUMNAS_APLICACIONES.aplicaciones, undefined, opciones.tamanoPagina);
        validarIds(rows);
        datos.aplicaciones = rows.map(r => normalizarAplicacionInventario({ ...r, id: r.id as string }));
      } catch { return datos; }
      const padres = new Set(datos.aplicaciones.map(a => a.id));
      if (!padres.size) {
        if (base === 'fecha_movimiento') datos.movimientos = [];
        if (base === 'fecha_cierre_operativo') datos.cierres = [];
        return datos;
      }
      if (base === 'fecha_movimiento' || base === 'fecha_cierre_operativo') {
        const tabla = base === 'fecha_movimiento' ? 'movimientos_diarios' : 'aplicaciones_cierre';
        try {
          const rows = await leerFilasFijas(cliente, tabla, COLUMNAS_APLICACIONES[tabla], undefined, opciones.tamanoPagina);
          if (rows.some(r => !r || !esUuid(r.aplicacion_id))) throw new Error('referencia_no_leida');
          const visibles = rows.filter(r => padres.has(r.aplicacion_id as string));
          validarIds(visibles);
          if (base === 'fecha_movimiento') datos.movimientos = visibles.map(r => ({ id: r.id as string, aplicacion_id: r.aplicacion_id as string, lote_id: r.lote_id === null ? null : esUuid(r.lote_id) ? r.lote_id : undefined, fecha_movimiento: fecha(r.fecha_movimiento) } satisfies MovimientoInventario));
          else datos.cierres = visibles.map(r => ({ id: r.id as string, aplicacion_id: r.aplicacion_id as string, fecha_cierre: fecha(r.fecha_cierre) } satisfies CierreInventario));
        } catch { /* Relation stays unread; parents remain independently available. */ }
      }
      return datos;
    },
  };
  fuente.leerCantidades = crearLectorCantidades(cliente, () => fuente.leer('fecha_inicio_planeada'), opciones.tamanoPagina);
  fuente.leerLaborAplicacion = crearLectorLaborAplicacion(cliente, () => fuente.leer('fecha_inicio_planeada'), opciones.tamanoPagina);
  return fuente;
}
