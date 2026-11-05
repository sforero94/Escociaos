// Every child read is constrained by a caller-visible parent UUID resolved in code.
import { leerFilasFijas, type ClienteDatos } from './fuente.ts';
import { esUuid, type DatosInventarioAplicaciones } from './aplicacionesTipos.ts';
import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';
import type { ConsultaCantidadesAplicacion, DatosCantidadesAplicacion } from './cantidadesTipos.ts';
export const COLUMNAS_CANTIDADES = {
  aplicaciones_mezclas: 'id,aplicacion_id,numero_mezcla,nombre_mezcla',
  aplicaciones_calculos: 'id,aplicacion_id,lote_id,mezcla_id,total_arboles,numero_canecas,litros_mezcla,numero_bultos,kilos_totales',
  aplicaciones_lotes: 'id,aplicacion_id,lote_id,arboles_grandes,arboles_medianos,arboles_pequenos,arboles_clonales,total_arboles,calibracion_litros_arbol,tamano_caneca',
  aplicaciones_productos: 'id,mezcla_id,producto_id,producto_nombre,producto_unidad,cantidad_total_necesaria,dosis_por_caneca,unidad_dosis,dosis_grandes,dosis_medianos,dosis_pequenos,dosis_clonales',
  movimientos_diarios: 'id,aplicacion_id,lote_id,fecha_movimiento,numero_canecas,numero_bultos',
  movimientos_diarios_productos: 'id,movimiento_diario_id,producto_id,producto_nombre,cantidad_utilizada,unidad',
  lotes: 'id,nombre',
} as const;
const CAMPOS_NUMERICOS = new Set(['numero_mezcla', 'total_arboles', 'numero_canecas', 'litros_mezcla', 'numero_bultos', 'kilos_totales', 'arboles_grandes', 'arboles_medianos', 'arboles_pequenos', 'arboles_clonales', 'calibracion_litros_arbol', 'tamano_caneca', 'cantidad_total_necesaria', 'dosis_por_caneca', 'dosis_grandes', 'dosis_medianos', 'dosis_pequenos', 'dosis_clonales', 'cantidad_utilizada']);
function normalizarFila(r: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => {
    if (!CAMPOS_NUMERICOS.has(k) || v === null) return [k, v];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    return [k, Number.isFinite(n) && n >= 0 ? n : undefined];
  }));
}
export function crearLectorCantidades(cliente: ClienteDatos, leerPadres: () => Promise<DatosInventarioAplicaciones>, tamanoPagina?: number) {
  return async (consulta: ConsultaCantidadesAplicacion): Promise<DatosCantidadesAplicacion> => {
    const d: DatosCantidadesAplicacion = { seleccion: 'no_leido' };
    let padres;
    try { padres = (await leerPadres()).aplicaciones; } catch { return d; }
    if (!padres) return d;
    const ids = resolverIdentidadAplicaciones({ aplicacion_ids: consulta.aplicacion_id ? [consulta.aplicacion_id] : [], aplicaciones: consulta.aplicacion ? [consulta.aplicacion] : [] }, padres);
    if (ids.estado !== 'ok' || ids.aplicaciones.length !== 1) return { seleccion: ids.estado === 'no_disponible' ? 'no_leido' : 'no_resuelto' };
    d.seleccion = 'ok'; d.aplicacion = ids.aplicaciones[0];
    async function leer(tabla: keyof typeof COLUMNAS_CANTIDADES, campo: string, padre: string) {
      const rows = await leerFilasFijas(cliente, tabla, COLUMNAS_CANTIDADES[tabla], q => q.eq(campo, padre), tamanoPagina);
      if (rows.some(r => !r || !esUuid(r.id) || r[campo] !== padre) || new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('fuente_cantidad_no_valida');
      return rows.map(normalizarFila);
    }
    const appId = d.aplicacion.id;
    const seguro = async (f: () => Promise<Record<string, unknown>[]>) => { try { return await f(); } catch { return undefined; } };
    const [mezclas, calculos, bases, movimientos] = await Promise.all([
      seguro(() => leer('aplicaciones_mezclas', 'aplicacion_id', appId)), seguro(() => leer('aplicaciones_calculos', 'aplicacion_id', appId)),
      seguro(() => leer('aplicaciones_lotes', 'aplicacion_id', appId)), seguro(() => leer('movimientos_diarios', 'aplicacion_id', appId)),
    ]);
    // Typed fields are checked again by the pure executor before any calculation.
    d.mezclas = mezclas as DatosCantidadesAplicacion['mezclas'];
    d.calculos = calculos as DatosCantidadesAplicacion['calculos'];
    d.bases_lotes = bases as DatosCantidadesAplicacion['bases_lotes'];
    d.movimientos = movimientos as DatosCantidadesAplicacion['movimientos'];
    if (mezclas) d.productos_plan = await seguro(async () => (await Promise.all(mezclas.map(m => leer('aplicaciones_productos', 'mezcla_id', m.id as string)))).flat()) as DatosCantidadesAplicacion['productos_plan'];
    if (movimientos) d.productos_ejecutados = await seguro(async () => (await Promise.all(movimientos.map(m => leer('movimientos_diarios_productos', 'movimiento_diario_id', m.id as string)))).flat()) as DatosCantidadesAplicacion['productos_ejecutados'];
    const loteIds = [...new Set([...(calculos ?? []).map(c => c.lote_id), ...(movimientos ?? []).map(m => m.lote_id)].filter(esUuid))];
    d.lotes = await seguro(async () => (await Promise.all(loteIds.map(l => leer('lotes', 'id', l)))).flat()) as DatosCantidadesAplicacion['lotes'];
    return d;
  };
}
