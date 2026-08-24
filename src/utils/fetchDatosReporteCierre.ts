// utils/fetchDatosReporteCierre.ts
// Fetches all closure data from Supabase for a closed application

import { getSupabase } from './supabase/client';
import { fetchDatosRealesAplicacion, fetchJornalesRealesPorLote } from './aplicacionesReales';
import { calcularCostosVivosAplicacion } from './calculosCierreAplicacion';
import type { DatosReporteCierre } from './generarPDFReporteCierre';

export async function fetchDatosReporteCierre(aplicacionId: string): Promise<DatosReporteCierre> {
  const supabase = getSupabase();

  // 1. Fetch application with lots
  const { data: app, error: appError } = await supabase
    .from('aplicaciones')
    .select(`
      *,
      aplicaciones_lotes (
        lotes (
          id,
          nombre,
          total_arboles
        )
      )
    `)
    .eq('id', aplicacionId)
    .single();

  if (appError || !app) {
    throw new Error('No se pudo cargar la aplicación: ' + (appError?.message || 'No encontrada'));
  }

  // 2. Fetch closure metadata (may not exist for older apps)
  const { data: cierre } = await supabase
    .from('aplicaciones_cierre')
    .select('dias_aplicacion, valor_jornal, observaciones_generales, cerrado_por, fecha_cierre')
    .eq('aplicacion_id', aplicacionId)
    .maybeSingle();

  // 3. Extract lots
  const lotes = (app.aplicaciones_lotes || []).map((al: any) => ({
    nombre: al.lotes?.nombre || 'Sin nombre',
    arboles: al.lotes?.total_arboles || 0,
  }));
  const totalArboles = lotes.reduce((sum: number, l: any) => sum + l.arboles, 0);

  // 4. Fetch planned products (from mezclas -> productos)
  const { data: mezclas } = await supabase
    .from('aplicaciones_mezclas')
    .select('id')
    .eq('aplicacion_id', aplicacionId);

  const planeadosMap = new Map<string, { nombre: string; unidad: string; cantidad: number }>();

  if (mezclas && mezclas.length > 0) {
    const mezclasIds = mezclas.map((m: any) => m.id);
    const { data: productos } = await supabase
      .from('aplicaciones_productos')
      .select('producto_id, producto_nombre, producto_unidad, cantidad_total_necesaria')
      .in('mezcla_id', mezclasIds);

    productos?.forEach((prod: any) => {
      const existing = planeadosMap.get(prod.producto_id);
      if (existing) {
        existing.cantidad += prod.cantidad_total_necesaria || 0;
      } else {
        planeadosMap.set(prod.producto_id, {
          nombre: prod.producto_nombre,
          unidad: prod.producto_unidad,
          cantidad: prod.cantidad_total_necesaria || 0,
        });
      }
    });
  }

  const aplicadosMap = new Map<string, { nombre: string; unidad: string; cantidad: number }>();
  const datosReales = await fetchDatosRealesAplicacion(aplicacionId);
  const productosAplicados = Array.from(datosReales.productosPorLote.values()).flat();
  productosAplicados.forEach((prod) => {
    const existing = aplicadosMap.get(prod.productoId);
    if (existing) {
      existing.cantidad += prod.cantidadBase;
    } else {
      aplicadosMap.set(prod.productoId, {
        nombre: prod.productoNombre,
        unidad: prod.unidadBase,
        cantidad: prod.cantidadBase,
      });
    }
  });

  // 6. Fetch product prices for cost calculation
  const allProductIds = [...new Set([...planeadosMap.keys(), ...aplicadosMap.keys()])];
  const preciosMap = new Map<string, number>();

  if (allProductIds.length > 0) {
    const { data: precios } = await supabase
      .from('productos')
      .select('id, precio_unitario')
      .in('id', allProductIds);

    precios?.forEach((p: any) => {
      preciosMap.set(p.id, p.precio_unitario || 0);
    });
  }

  // 7. Build product comparison
  const allProductoIds = new Set([...planeadosMap.keys(), ...aplicadosMap.keys()]);
  const comparacionProductos = Array.from(allProductoIds).map((prodId) => {
    const planeado = planeadosMap.get(prodId);
    const aplicado = aplicadosMap.get(prodId);
    const precio = preciosMap.get(prodId) || 0;

    const cantidadPlaneada = planeado?.cantidad || 0;
    const cantidadReal = aplicado?.cantidad || 0;
    const diferencia = cantidadReal - cantidadPlaneada;
    const porcentajeDesviacion = cantidadPlaneada > 0
      ? ((cantidadReal - cantidadPlaneada) / cantidadPlaneada) * 100
      : 0;

    return {
      producto_nombre: planeado?.nombre || aplicado?.nombre || 'Desconocido',
      producto_unidad: planeado?.unidad || aplicado?.unidad || 'Unidad',
      cantidad_planeada: cantidadPlaneada,
      cantidad_real: cantidadReal,
      diferencia,
      porcentaje_desviacion: porcentajeDesviacion,
      costo_total: cantidadReal * precio,
    };
  });

  // 8. Calculate derived values
  // Mano de obra SIEMPRE en vivo desde `registros_trabajo` — nunca el snapshot que
  // `aplicaciones`/`aplicaciones_cierre` congelaron al cerrar (hallazgo #39: dos aplicaciones de
  // enero cerraron con $50.000/jornal tecleado a mano mientras el costo real ya estaba
  // calculado). Ver `calcularCostosVivosAplicacion` para el porqué completo.
  const jornalesPorLote = await fetchJornalesRealesPorLote(app.tarea_id);
  const jornalesVivos = Array.from(jornalesPorLote.values()).reduce((sum, j) => sum + j.jornales, 0);
  const costoManoObraVivo = Array.from(jornalesPorLote.values()).reduce((sum, j) => sum + j.costo, 0);

  const {
    jornalesUtilizados,
    costoTotalInsumos,
    costoTotalManoObra,
    costoTotal,
    costoPorArbol,
    valorJornal,
    arbolesPorJornal,
  } = calcularCostosVivosAplicacion({
    jornalesVivos,
    costoManoObraVivo,
    costoTotalInsumos: app.costo_total_insumos || 0,
    totalArboles,
    snapshotJornales: app.jornales_utilizados || 0,
    snapshotCostoManoObra: app.costo_total_mano_obra || 0,
    snapshotValorJornal: app.valor_jornal || cierre?.valor_jornal || 0,
  });

  // Calculate dias_aplicacion
  let diasAplicacion = cierre?.dias_aplicacion || 0;
  if (!diasAplicacion && app.fecha_inicio_ejecucion && app.fecha_cierre) {
    const inicio = new Date(app.fecha_inicio_ejecucion);
    const fin = new Date(app.fecha_cierre);
    diasAplicacion = Math.ceil((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }

  return {
    nombre: app.nombre_aplicacion || '',
    tipo_aplicacion: app.tipo_aplicacion || '',
    proposito: app.proposito || undefined,
    fecha_inicio_planeada: app.fecha_inicio_planeada || undefined,
    fecha_fin_planeada: app.fecha_fin_planeada || undefined,
    fecha_inicio_ejecucion: app.fecha_inicio_ejecucion || undefined,
    fecha_cierre: app.fecha_cierre || cierre?.fecha_cierre || undefined,
    dias_aplicacion: diasAplicacion,
    lotes,
    total_arboles: totalArboles,
    costo_total_insumos: costoTotalInsumos,
    costo_total_mano_obra: costoTotalManoObra,
    costo_total: costoTotal,
    costo_por_arbol: costoPorArbol,
    jornales_utilizados: jornalesUtilizados,
    valor_jornal: valorJornal,
    arboles_por_jornal: arbolesPorJornal,
    comparacion_productos: comparacionProductos,
    observaciones_cierre: app.observaciones_cierre || cierre?.observaciones_generales || undefined,
    cerrado_por: cierre?.cerrado_por || undefined,
  };
}

// ============================================================================
// Comparable applications for comparison feature
// ============================================================================

export interface AplicacionComparable {
  id: string;
  nombre: string;
  tipo_aplicacion: string;
  fecha_cierre: string;
  costo_total: number | null;
}

export async function fetchAplicacionesComparables(
  aplicacionId: string,
  tipoAplicacion: string
): Promise<AplicacionComparable[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('aplicaciones')
    .select('id, nombre_aplicacion, tipo_aplicacion, fecha_cierre, costo_total')
    .eq('estado', 'Cerrada')
    .eq('tipo_aplicacion', tipoAplicacion as 'Fumigación' | 'Fertilización' | 'Drench' | 'N/A')
    .neq('id', aplicacionId)
    .order('fecha_cierre', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching comparable apps:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    nombre: row.nombre_aplicacion || 'Sin nombre',
    tipo_aplicacion: row.tipo_aplicacion,
    fecha_cierre: row.fecha_cierre || '',
    costo_total: row.costo_total,
  }));
}
