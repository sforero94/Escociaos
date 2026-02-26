// utils/fetchDatosReporteSemanal.ts
// Funciones para obtener los datos necesarios para el reporte semanal
// Fuentes: registros_trabajo, aplicaciones, monitoreos, lotes

import { getSupabase } from './supabase/client';
import { fetchDatosRealesAplicacion, fetchJornalesRealesPorLote } from './aplicacionesReales';
import type {
  RangoSemana,
  DatosPersonal,
  MatrizJornales,
  CeldaMatrizJornales,
  AplicacionPlaneada,
  AplicacionActiva,
  ProgresoLote,
  ItemCompraResumen,
  MezclaResumen,
  DatosMonitoreo,
  TendenciaMonitoreo,
  MonitoreoPorLote,
  MonitoreoSublote,
  DatosReporteSemanal,
  BloqueAdicional,
  LaborSemanal,
  AplicacionCerrada,
  AplicacionCierreGeneral,
  AplicacionCierreKPILote,
  AplicacionCierreFinancieroLote,
  VistaMonitoreoLote,
  VistaLotePlaga,
  VistaMonitoreoSublote,
  ObservacionFecha,
} from '../types/reporteSemanal';
import type { Insight } from '../types/monitoreo';

// Plagas de interés for priority marking
const PLAGAS_INTERES = [
  'Monalonion',
  'Ácaro',
  'Huevos de Ácaro',
  'Ácaro Cristalino',
  'Cucarrón marceño',
  'Trips',
];

// ============================================================================
// UTILIDADES DE SEMANA
// ============================================================================

/**
 * Calcula el número de semana ISO 8601 para una fecha dada
 */
export function getNumeroSemanaISO(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Calcula el rango de la semana anterior (lunes a domingo)
 * basándose en la fecha actual
 */
export function calcularSemanaAnterior(): RangoSemana {
  const hoy = new Date();
  // Retroceder al lunes de esta semana
  const diaActual = hoy.getDay(); // 0=Dom, 1=Lun, ..., 6=Sab
  const diasDesdeElLunes = diaActual === 0 ? 6 : diaActual - 1;

  // Lunes de esta semana
  const lunesActual = new Date(hoy);
  lunesActual.setDate(hoy.getDate() - diasDesdeElLunes);

  // Lunes de la semana anterior
  const lunesAnterior = new Date(lunesActual);
  lunesAnterior.setDate(lunesActual.getDate() - 7);

  // Domingo de la semana anterior
  const domingoAnterior = new Date(lunesAnterior);
  domingoAnterior.setDate(lunesAnterior.getDate() + 6);

  const formatFecha = (d: Date) => {
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  };

  return {
    inicio: formatFecha(lunesAnterior),
    fin: formatFecha(domingoAnterior),
    numero: getNumeroSemanaISO(lunesAnterior),
    ano: lunesAnterior.getFullYear(),
  };
}

/**
 * Calcula el rango de una semana específica dado un lunes
 */
export function calcularSemanaDesdeLunes(lunesISO: string): RangoSemana {
  const lunes = new Date(lunesISO + 'T00:00:00');
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);

  const formatFecha = (d: Date) => {
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  };

  return {
    inicio: lunesISO,
    fin: formatFecha(domingo),
    numero: getNumeroSemanaISO(lunes),
    ano: lunes.getFullYear(),
  };
}

// ============================================================================
// SECCIÓN 1: PERSONAL
// ============================================================================

/**
 * Obtiene el conteo de personal que trabajó en la semana
 */
export async function fetchPersonalSemana(
  inicio: string,
  fin: string
): Promise<Pick<DatosPersonal, 'totalTrabajadores' | 'empleados' | 'contratistas' | 'jornalesTrabajados'>> {
  const supabase = getSupabase();

  const { data: registros, error } = await supabase
    .from('registros_trabajo')
    .select('empleado_id, contratista_id, fraccion_jornal')
    .gte('fecha_trabajo', inicio)
    .lte('fecha_trabajo', fin);

  if (error) throw new Error(`Error al cargar personal: ${error.message}`);

  const empleadosUnicos = new Set(
    (registros || []).filter(r => r.empleado_id).map(r => r.empleado_id)
  );
  const contratistasUnicos = new Set(
    (registros || []).filter(r => r.contratista_id).map(r => r.contratista_id)
  );
  const jornalesTrabajados = (registros || []).reduce(
    (sum, r) => sum + (Number(r.fraccion_jornal) || 0), 0
  );

  return {
    totalTrabajadores: empleadosUnicos.size + contratistasUnicos.size,
    empleados: empleadosUnicos.size,
    contratistas: contratistasUnicos.size,
    jornalesTrabajados,
  };
}

// ============================================================================
// SECCIÓN 2: LABORES
// ============================================================================

/**
 * Obtiene tareas del kanban que se solapan con la semana dada.
 * Estados: Programada → "Por iniciar", En Proceso → "En proceso", Completada → "Terminada"
 */
export async function fetchLaboresSemanales(
  inicio: string,
  fin: string
): Promise<LaborSemanal[]> {
  const supabase = getSupabase();

  // Fetch tasks whose date range overlaps [inicio, fin]
  // Overlap condition: task.inicio <= semana.fin AND task.fin >= semana.inicio
  // Use vista_tareas_resumen which aggregates lote_nombres from the tareas_lotes junction table
  const { data: tareas, error } = await supabase
    .from('vista_tareas_resumen')
    .select(`
      id,
      codigo_tarea,
      nombre,
      estado,
      fecha_estimada_inicio,
      fecha_estimada_fin,
      fecha_inicio_real,
      fecha_fin_real,
      lote_nombres,
      tipo_tarea_nombre
    `)
    .in('estado', ['Programada', 'En Proceso', 'Completada'])
    .or(`fecha_estimada_inicio.lte.${fin},fecha_inicio_real.lte.${fin}`)
    .order('fecha_estimada_inicio', { ascending: true });

  if (error) throw new Error(`Error al cargar labores: ${error.message}`);

  const estadoMap: Record<string, 'Por iniciar' | 'En proceso' | 'Terminada'> = {
    'Programada': 'Por iniciar',
    'En Proceso': 'En proceso',
    'Completada': 'Terminada',
  };

  const resultado: LaborSemanal[] = [];

  for (const t of tareas || []) {
    const estadoMapeado = estadoMap[t.estado];
    if (!estadoMapeado) continue;

    // Filter: must overlap with the week range
    const tareaInicio = t.fecha_inicio_real || t.fecha_estimada_inicio;
    const tareaFin = t.fecha_fin_real || t.fecha_estimada_fin;

    // If no start date, skip
    if (!tareaInicio) continue;

    // Overlap check: tareaInicio <= fin AND (tareaFin >= inicio OR no tareaFin)
    if (tareaInicio > fin) continue;
    if (tareaFin && tareaFin < inicio) continue;

    // Parse lote names
    const lotesNombres = t.lote_nombres
      ? t.lote_nombres.split(',').map((n: string) => n.trim()).filter(Boolean)
      : [];

    resultado.push({
      id: t.id,
      codigoTarea: t.codigo_tarea,
      nombre: t.nombre,
      tipoTarea: (t as any).tipo_tarea_nombre || 'Sin tipo',
      estado: estadoMapeado,
      fechaInicio: tareaInicio,
      fechaFin: tareaFin || undefined,
      lotes: lotesNombres,
    });
  }

  return resultado;
}

/**
 * Obtiene la matriz de jornales: actividades (filas) × lotes (columnas)
 */
export async function fetchMatrizJornales(
  inicio: string,
  fin: string
): Promise<MatrizJornales> {
  const supabase = getSupabase();

  const { data: tiposTareas, error: errorTipos } = await supabase
    .from('tipos_tareas')
    .select('id, nombre');

  if (errorTipos) throw new Error(`Error al cargar tipos de tarea: ${errorTipos.message}`);

  const tiposMap = new Map((tiposTareas || []).map(t => [t.id, t.nombre]));

  const { data: registros, error: errorRegistros } = await supabase
    .from('registros_trabajo')
    .select(`
      fraccion_jornal,
      costo_jornal,
      tareas!inner(tipo_tarea_id),
      lote:lotes!lote_id(nombre)
    `)
    .gte('fecha_trabajo', inicio)
    .lte('fecha_trabajo', fin);

  if (errorRegistros) throw new Error(`Error al cargar registros: ${errorRegistros.message}`);

  const datos: Record<string, Record<string, CeldaMatrizJornales>> = {};
  const totalesPorActividad: Record<string, CeldaMatrizJornales> = {};
  const totalesPorLote: Record<string, CeldaMatrizJornales> = {};
  const lotesSet = new Set<string>();
  const actividadesSet = new Set<string>();
  let totalGeneralJornales = 0;
  let totalGeneralCosto = 0;

  (registros || []).forEach((registro: any) => {
    const tipoTareaId = registro.tareas?.tipo_tarea_id;
    const actividad = tipoTareaId ? (tiposMap.get(tipoTareaId) || 'Sin tipo') : 'Sin tipo';
    const lote = registro.lote?.nombre || 'Sin lote';
    const jornales = Number(registro.fraccion_jornal) || 0;
    const costo = Number(registro.costo_jornal) || 0;

    actividadesSet.add(actividad);
    lotesSet.add(lote);

    if (!datos[actividad]) datos[actividad] = {};
    if (!datos[actividad][lote]) datos[actividad][lote] = { jornales: 0, costo: 0 };
    datos[actividad][lote].jornales += jornales;
    datos[actividad][lote].costo += costo;

    if (!totalesPorActividad[actividad]) totalesPorActividad[actividad] = { jornales: 0, costo: 0 };
    totalesPorActividad[actividad].jornales += jornales;
    totalesPorActividad[actividad].costo += costo;

    if (!totalesPorLote[lote]) totalesPorLote[lote] = { jornales: 0, costo: 0 };
    totalesPorLote[lote].jornales += jornales;
    totalesPorLote[lote].costo += costo;

    totalGeneralJornales += jornales;
    totalGeneralCosto += costo;
  });

  return {
    actividades: Array.from(actividadesSet).sort(),
    lotes: Array.from(lotesSet).sort(),
    datos,
    totalesPorActividad,
    totalesPorLote,
    totalGeneral: { jornales: totalGeneralJornales, costo: totalGeneralCosto },
  };
}

// ============================================================================
// SECCIÓN 3: APLICACIONES
// ============================================================================

/**
 * Obtiene aplicaciones planeadas (estado: 'Calculada') con mezclas y lista de compras
 */
export async function fetchAplicacionesPlaneadas(): Promise<AplicacionPlaneada[]> {
  const supabase = getSupabase();

  const { data: aplicaciones, error } = await supabase
    .from('aplicaciones')
    .select(`
      id,
      nombre_aplicacion,
      tipo_aplicacion,
      proposito,
      blanco_biologico,
      fecha_inicio_planeada,
      fecha_fin_planeada,
      aplicaciones_compras(
        producto_nombre,
        producto_categoria,
        cantidad_necesaria,
        unidad,
        costo_estimado,
        inventario_actual,
        cantidad_faltante
      ),
      aplicaciones_lotes(
        lotes(total_arboles)
      ),
      aplicaciones_calculos(
        litros_mezcla,
        kilos_totales
      )
    `)
    .eq('estado', 'Calculada')
    .order('fecha_inicio_planeada', { ascending: true });

  if (error) throw new Error(`Error al cargar aplicaciones planeadas: ${error.message}`);

  // Batch lookup for pest names
  const allBlancoIds = new Set<string>();
  for (const app of aplicaciones || []) {
    if (app.blanco_biologico) {
      const ids = Array.isArray(app.blanco_biologico)
        ? app.blanco_biologico
        : [app.blanco_biologico];
      (ids as string[]).forEach((id: string) => allBlancoIds.add(id));
    }
  }

  const plagasMap = new Map<string, string>();
  if (allBlancoIds.size > 0) {
    const { data: plagas } = await supabase
      .from('plagas_enfermedades_catalogo')
      .select('id, nombre')
      .in('id', Array.from(allBlancoIds));
    (plagas || []).forEach((p: any) => plagasMap.set(p.id, p.nombre));
  }

  // Fetch mezclas with products for all apps at once
  const appIds = (aplicaciones || []).map((a: any) => a.id);
  const mezclasMap = new Map<string, MezclaResumen[]>();

  if (appIds.length > 0) {
    const { data: mezclas } = await supabase
      .from('aplicaciones_mezclas')
      .select(`
        id,
        nombre,
        numero_orden,
        aplicacion_id,
        aplicaciones_productos(
          producto_nombre,
          dosis_por_caneca,
          unidad_dosis,
          dosis_grandes,
          dosis_medianos,
          dosis_pequenos,
          dosis_clonales
        )
      `)
      .in('aplicacion_id', appIds)
      .order('numero_orden', { ascending: true });

    for (const m of mezclas || []) {
      const appId = (m as any).aplicacion_id;
      if (!mezclasMap.has(appId)) mezclasMap.set(appId, []);

      const productos = ((m as any).aplicaciones_productos || []).map((p: any) => {
        let dosis = '';
        if (p.dosis_por_caneca != null) {
          dosis = `${p.dosis_por_caneca} ${p.unidad_dosis || 'cc'}/caneca`;
        } else if (p.dosis_grandes != null) {
          dosis = `${p.dosis_grandes}/${p.dosis_medianos}/${p.dosis_pequenos}/${p.dosis_clonales || 0} Kg/árbol`;
        }
        return { nombre: p.producto_nombre, dosis };
      });

      mezclasMap.get(appId)!.push({ nombre: m.nombre, productos });
    }
  }

  const resultado: AplicacionPlaneada[] = [];

  for (const app of aplicaciones || []) {
    const compras = (app as any).aplicaciones_compras || [];

    const listaCompras: ItemCompraResumen[] = compras.map((c: any) => ({
      productoNombre: c.producto_nombre,
      categoria: c.producto_categoria || '',
      cantidadNecesaria: Number(c.cantidad_necesaria) || 0,
      unidad: c.unidad || '',
      costoEstimado: Number(c.costo_estimado) || 0,
      inventarioDisponible: Number(c.inventario_actual) || 0,
      cantidadAComprar: Number(c.cantidad_faltante) || 0,
    }));

    // Calculate costs: Total = Costo Pedido + Valor Inventario a usar
    // Costo Pedido: cost of products that need to be purchased
    // Valor Inventario: value of inventory that will be consumed (need to estimate from precio_promedio)
    const costoPedido = listaCompras
      .filter(item => item.cantidadAComprar > 0)
      .reduce((sum, item) => sum + item.costoEstimado, 0);

    // For inventory value, we need to estimate based on average price
    // Since costo_estimado is for the purchase quantity, we derive unit cost
    const valorInventarioUsado = listaCompras
      .filter(item => item.inventarioDisponible > 0 && item.cantidadNecesaria > 0)
      .reduce((sum, item) => {
        // Estimate unit cost from costo_estimado / cantidad_faltante if available
        // Otherwise use a default calculation
        const unitCost = item.costoEstimado > 0 && item.cantidadAComprar > 0
          ? item.costoEstimado / item.cantidadAComprar
          : 0;
        // Value of inventory that will be used (up to needed quantity)
        const inventarioAUsar = Math.min(item.inventarioDisponible, item.cantidadNecesaria);
        return sum + (unitCost * inventarioAUsar);
      }, 0);

    const costoTotal = costoPedido + valorInventarioUsado;
    const inventarioTotal = listaCompras.reduce((sum, item) => sum + (item.inventarioDisponible || 0), 0);
    const totalPedido = listaCompras.reduce((sum, item) => sum + (item.cantidadAComprar || 0), 0);

    let blancos: string[] = [];
    if (app.blanco_biologico) {
      const ids = Array.isArray(app.blanco_biologico)
        ? app.blanco_biologico
        : [app.blanco_biologico];
      blancos = (ids as string[]).map((id: string) => plagasMap.get(id) || '').filter(Boolean);
    }

    // Extraer totales de los cálculos
    let totalArboles = 0;
    let totalLitrosKg = 0;
    
    ((app as any).aplicaciones_lotes || []).forEach((al: any) => {
      totalArboles += Number(al.lotes?.total_arboles) || 0;
    });
    
    ((app as any).aplicaciones_calculos || []).forEach((ac: any) => {
      if (app.tipo_aplicacion === 'Fumigación') {
        totalLitrosKg += Number(ac.litros_mezcla) || 0;
      } else {
        totalLitrosKg += Number(ac.kilos_totales) || 0;
      }
    });

    const costoPorLitroKg = totalLitrosKg > 0 ? costoTotal / totalLitrosKg : undefined;
    const costoPorArbol = totalArboles > 0 ? costoTotal / totalArboles : undefined;

    resultado.push({
      id: app.id,
      nombre: app.nombre_aplicacion || 'Sin nombre',
      tipo: app.tipo_aplicacion,
      proposito: app.proposito || '',
      blancosBiologicos: blancos,
      fechaInicioPlaneada: app.fecha_inicio_planeada || '',
      fechaFinPlaneada: app.fecha_fin_planeada || undefined,
      mezclas: mezclasMap.get(app.id) || [],
      listaCompras,
      costoTotalEstimado: costoTotal,
      inventarioTotalDisponible: inventarioTotal,
      totalPedido,
      costoPorLitroKg,
      costoPorArbol,
    });
  }

  return resultado;
}

/**
 * Obtiene aplicaciones activas (estado: 'En ejecución') con progreso
 */
export async function fetchAplicacionesActivas(): Promise<AplicacionActiva[]> {
  const supabase = getSupabase();

  const { data: aplicaciones, error } = await supabase
    .from('aplicaciones')
    .select(`
      id,
      nombre_aplicacion,
      tipo_aplicacion,
      proposito,
      estado,
      fecha_inicio_ejecucion,
      aplicaciones_calculos(
        lote_id,
        numero_canecas,
        numero_bultos,
        lotes(nombre)
      ),
      movimientos_diarios(
        lote_id,
        numero_canecas,
        numero_bultos
      )
    `)
    .eq('estado', 'En ejecución');

  if (error) throw new Error(`Error al cargar aplicaciones activas: ${error.message}`);

  const resultado: AplicacionActiva[] = [];

  for (const app of aplicaciones || []) {
    const esFumigacion = app.tipo_aplicacion === 'Fumigación';
    const unidad: 'canecas' | 'bultos' = esFumigacion ? 'canecas' : 'bultos';

    const movimientos = (app as any).movimientos_diarios || [];

    const planeadoPorLote = new Map<string, { nombre: string; planeado: number }>();
    ((app as any).aplicaciones_calculos || []).forEach((calc: any) => {
      const loteNombre = calc.lotes?.nombre || 'Sin lote';
      const planeado = esFumigacion
        ? (Number(calc.numero_canecas) || 0)
        : (Number(calc.numero_bultos) || 0);
      planeadoPorLote.set(calc.lote_id, { nombre: loteNombre, planeado });
    });

    const ejecutadoPorLote = new Map<string, number>();
    movimientos.forEach((mov: any) => {
      const ejecutado = esFumigacion
        ? (Number(mov.numero_canecas) || 0)
        : (Number(mov.numero_bultos) || 0);
      ejecutadoPorLote.set(
        mov.lote_id,
        (ejecutadoPorLote.get(mov.lote_id) || 0) + ejecutado
      );
    });

    const progresoPorLote: ProgresoLote[] = [];
    let totalPlaneado = 0;
    let totalEjecutado = 0;

    planeadoPorLote.forEach((info, loteId) => {
      const ejecutado = ejecutadoPorLote.get(loteId) || 0;
      const porcentaje = info.planeado > 0 ? (ejecutado / info.planeado) * 100 : 0;
      totalPlaneado += info.planeado;
      totalEjecutado += ejecutado;
      progresoPorLote.push({
        loteNombre: info.nombre,
        planeado: info.planeado,
        ejecutado,
        porcentaje: Math.round(porcentaje * 10) / 10,
        unidad,
      });
    });

    resultado.push({
      id: app.id,
      nombre: app.nombre_aplicacion || 'Sin nombre',
      tipo: app.tipo_aplicacion,
      proposito: app.proposito || '',
      estado: app.estado,
      fechaInicio: app.fecha_inicio_ejecucion || '',
      totalPlaneado,
      totalEjecutado,
      porcentajeGlobal: totalPlaneado > 0
        ? Math.round((totalEjecutado / totalPlaneado) * 1000) / 10
        : 0,
      unidad,
      progresoPorLote,
    });
  }

  return resultado;
}

/**
 * Obtiene datos completos de cierre para aplicaciones seleccionadas.
 * Builds general, per-lote KPI, and per-lote financial breakdowns.
 */
export async function fetchAplicacionesCerradas(
  selectedIds: string[]
): Promise<AplicacionCerrada[]> {
  if (!selectedIds || selectedIds.length === 0) return [];

  const supabase = getSupabase();
  const resultado: AplicacionCerrada[] = [];

  for (const appId of selectedIds) {
    try {
      // Fetch application + lots
      const { data: app, error: appError } = await supabase
        .from('aplicaciones')
        .select(`
          id,
          tarea_id,
          nombre_aplicacion,
          tipo_aplicacion,
          proposito,
          estado,
          fecha_inicio_ejecucion,
          fecha_fin_ejecucion,
          fecha_cierre,
          costo_total_insumos,
          costo_total_mano_obra,
          costo_total,
          jornales_utilizados,
          valor_jornal,
          aplicaciones_lotes(
            lote_id,
            lotes(id, nombre, total_arboles)
          )
        `)
        .eq('id', appId)
        .single();

      if (appError || !app) continue;

      const esFumigacion = app.tipo_aplicacion === 'Fumigación';
      const unidad: 'canecas' | 'bultos' = esFumigacion ? 'canecas' : 'bultos';

      const fechaInicio = app.fecha_inicio_ejecucion || '';
      const fechaFin = app.fecha_fin_ejecucion || app.fecha_cierre || '';
      const diasEjecucion = fechaInicio && fechaFin
        ? Math.max(1, Math.round((new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / 86400000) + 1)
        : 0;

      // Build lotes map
      const lotesMap = new Map<string, { nombre: string; arboles: number }>();
      ((app as any).aplicaciones_lotes || []).forEach((al: any) => {
        const lote = al.lotes;
        if (lote) lotesMap.set(lote.id, { nombre: lote.nombre, arboles: lote.total_arboles || 0 });
      });

      // Fetch planned calcs per lote
      const { data: calculos } = await supabase
        .from('aplicaciones_calculos')
        .select('lote_id, numero_canecas, numero_bultos, kilos_totales, litros_mezcla')
        .eq('aplicacion_id', appId);

      const calcMap = new Map<string, any>();
      (calculos || []).forEach((c: any) => calcMap.set(c.lote_id, c));

      // Fetch planned products with quantities and prices to calculate total planned cost
      // costo_estimado from aplicaciones_compras only includes missing inventory (faltantes),
      // so we calculate the full planned cost from aplicaciones_productos × productos.precio_unitario
      const { data: mezclasData } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', appId);
      
      const mezclasIds = (mezclasData || []).map(m => m.id);
      
      let costoInsumosPlaneadoTotal = 0;
      let insumosPlaneadosTotalesApp = 0;
      if (mezclasIds.length > 0) {
        const { data: productosPlan } = await supabase
          .from('aplicaciones_productos')
          .select(`
            producto_id,
            cantidad_total_necesaria,
            productos!inner(precio_unitario)
          `)
          .in('mezcla_id', mezclasIds);
        
        for (const prod of productosPlan || []) {
          const cantidad = Number(prod.cantidad_total_necesaria) || 0;
          const precio = Number((prod.productos as any)?.precio_unitario) || 0;
          insumosPlaneadosTotalesApp += cantidad;
          costoInsumosPlaneadoTotal += cantidad * precio;
        }
      }

      // Fetch previous app of same type for comparison
      const { data: prevApp } = await supabase
        .from('aplicaciones')
        .select(`
          id,
          costo_total,
          costo_total_insumos,
          costo_total_mano_obra,
          tarea_id,
          movimientos_diarios(numero_canecas, numero_bultos)
        `)
        .eq('estado', 'Cerrada')
        .eq('tipo_aplicacion', app.tipo_aplicacion)
        .lt('fecha_cierre', app.fecha_cierre || new Date().toISOString())
        .order('fecha_cierre', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const costoAnterior = prevApp?.costo_total ? Number(prevApp.costo_total) : undefined;
      let totalCanecasAnt = 0;
      if (prevApp && prevApp.movimientos_diarios) {
        prevApp.movimientos_diarios.forEach((m: any) => {
          totalCanecasAnt += Number(esFumigacion ? m.numero_canecas : m.numero_bultos) || 0;
        });
      }
      
      let prevJornalesTotal = 0;
      if (prevApp?.tarea_id) {
        const { data: prevRegs } = await supabase
          .from('registros_trabajo')
          .select('fraccion_jornal')
          .eq('tarea_id', prevApp.tarea_id);
        (prevRegs || []).forEach((r: any) => { prevJornalesTotal += Number(r.fraccion_jornal) || 0; });
      }

      // Datos reales alineados con el flujo de reporte de cierre
      const datosReales = await fetchDatosRealesAplicacion(appId);
      const movMap = datosReales.movimientosPorLote;
      const insumosRealesMap = new Map<string, number>();
      const costoInsumosRealesMap = new Map<string, number>();
      datosReales.insumosPorLote.forEach((v, loteId) => {
        insumosRealesMap.set(loteId, v.cantidadTotal);
        costoInsumosRealesMap.set(loteId, v.costoTotal);
      });

      const jornalesMap = await fetchJornalesRealesPorLote(app.tarea_id);

      // Fetch insumos cost per lote (from compras / cost calculations)
      const costoInsumosTotal = Number(app.costo_total_insumos) || 0;
      const costoManoObraTotal = Number(app.costo_total_mano_obra) || 0;

      // Build KPI and financial per lote
      const kpiPorLote: AplicacionCierreKPILote[] = [];
      const financieroPorLote: AplicacionCierreFinancieroLote[] = [];

      let totalCanecasPlan = 0;
      let totalCanecasReal = 0;
      let totalJornalesPlan = 0;
      let totalJornalesReal = 0;
      const totalPlannedApp = Array.from(calcMap.values()).reduce(
        (sum, c) => sum + (esFumigacion ? (Number(c.litros_mezcla) || 0) : (Number(c.kilos_totales) || 0)),
        0
      );
      const totalJornalesRealesPorLote = Array.from(jornalesMap.values()).reduce(
        (sum, j) => sum + (Number(j.jornales) || 0),
        0
      );
      const jornalesUtilizadosApp = Number((app as any).jornales_utilizados) || totalJornalesRealesPorLote;
      const valorJornalApp = Number((app as any).valor_jornal) || 0;
      const avgCostoJornalPlan = valorJornalApp > 0
        ? valorJornalApp
        : (jornalesUtilizadosApp > 0 ? costoManoObraTotal / jornalesUtilizadosApp : 50000);

      lotesMap.forEach((loteInfo, loteId) => {
        const calc = calcMap.get(loteId) || {};
        const mov = movMap.get(loteId) || { canecas: 0, bultos: 0 };
        const jornales = jornalesMap.get(loteId) || { jornales: 0, costo: 0 };
        const arboles = loteInfo.arboles || 1;
        const totalPlannedQuantity = esFumigacion
          ? (Number(calc.litros_mezcla) || 0)
          : (Number(calc.kilos_totales) || 0);
        const quantityRatio = totalPlannedApp > 0 ? totalPlannedQuantity / totalPlannedApp : 0;

        const canecasPlan = esFumigacion ? (Number(calc.numero_canecas) || 0) : (Number(calc.numero_bultos) || 0);
        const canecasReal = esFumigacion ? mov.canecas : mov.bultos;
        const canecasDesv = canecasPlan > 0 ? ((canecasReal - canecasPlan) / canecasPlan) * 100 : 0;
        const tamanoRecipiente = esFumigacion
          ? (
            canecasPlan > 0
              ? (Number(calc.litros_mezcla) || 0) / canecasPlan
              : 200
          )
          : (
            canecasPlan > 0
              ? (Number(calc.kilos_totales) || 0) / canecasPlan
              : 50
          );

        totalCanecasPlan += canecasPlan;
        totalCanecasReal += canecasReal;

        // Insumos
        // IMPORTANT: compare same magnitude in technical table:
        // plan insumos (sum of planned product quantities) vs real insumos (sum of used product quantities).
        const insumosPlaneados = insumosPlaneadosTotalesApp * quantityRatio;
        // Use actual product quantities from movimientos_diarios_productos instead of approximation
        const insumosReales = insumosRealesMap.get(loteId) || 0;
        const insumosDesv = insumosPlaneados > 0
          ? ((insumosReales - insumosPlaneados) / insumosPlaneados) * 100 : 0;

        const jornalesPlan = canecasPlan * (esFumigacion ? 1 : 0.5); // Theoretical plan
        const jornalesReal = jornales.jornales;
        const jornalesDesv = jornalesPlan > 0 ? ((jornalesReal - jornalesPlan) / jornalesPlan) * 100 : 0;
        
        totalJornalesPlan += jornalesPlan;
        totalJornalesReal += jornalesReal;

        const arbolesPorJornalPlan = jornalesPlan > 0 ? arboles / jornalesPlan : undefined;
        const arbolesPorJornalReal = jornalesReal > 0 ? arboles / jornalesReal : undefined;
        const arbolesPorJornalDesv = (arbolesPorJornalPlan && arbolesPorJornalReal && arbolesPorJornalPlan > 0)
          ? ((arbolesPorJornalReal - arbolesPorJornalPlan) / arbolesPorJornalPlan) * 100 : undefined;

        const dosisMezclaPlan = canecasPlan * tamanoRecipiente;
        const dosisMezclaReal = canecasReal * tamanoRecipiente;
        const litrosKgPorArbolPlan = arboles > 0 ? dosisMezclaPlan / arboles : undefined;
        const litrosKgPorArbolReal = arboles > 0 ? dosisMezclaReal / arboles : undefined;
        const litrosKgPorArbolDesv = (litrosKgPorArbolPlan && litrosKgPorArbolReal && litrosKgPorArbolPlan > 0)
          ? ((litrosKgPorArbolReal - litrosKgPorArbolPlan) / litrosKgPorArbolPlan) * 100 : undefined;

        kpiPorLote.push({
          loteNombre: loteInfo.nombre,
          canecasPlaneadas: canecasPlan || undefined,
          canecasReales: canecasReal || undefined,
          canecasDesviacion: Math.round(canecasDesv * 10) / 10,
          insumosPlaneados: insumosPlaneados > 0 ? Math.round(insumosPlaneados) : undefined,
          insumosReales: insumosReales > 0 ? Math.round(insumosReales) : undefined,
          insumosDesviacion: Math.round(insumosDesv * 10) / 10,
          insumosUnidad: esFumigacion ? 'L' : 'Kg',
          jornalesPlaneados: Math.round(jornalesPlan * 10) / 10 || undefined,
          jornalesReales: jornalesReal || undefined,
          jornalesDesviacion: Math.round(jornalesDesv * 10) / 10,
          arbolesTratados: arboles,
          arbolesPorJornalPlaneado: arbolesPorJornalPlan ? Math.round(arbolesPorJornalPlan * 10) / 10 : undefined,
          arbolesPorJornal: arbolesPorJornalReal ? Math.round(arbolesPorJornalReal * 10) / 10 : undefined,
          arbolesPorJornalDesviacion: arbolesPorJornalDesv ? Math.round(arbolesPorJornalDesv * 10) / 10 : undefined,
          litrosKgPorArbolPlaneado: litrosKgPorArbolPlan ? Math.round(litrosKgPorArbolPlan * 100) / 100 : undefined,
          litrosKgPorArbol: litrosKgPorArbolReal ? Math.round(litrosKgPorArbolReal * 100) / 100 : undefined,
          litrosKgPorArbolDesviacion: litrosKgPorArbolDesv ? Math.round(litrosKgPorArbolDesv * 10) / 10 : undefined,
        });

        // Financial: planned from cálculos + productos, real from movimientos/registros
        // For planned costs, use proportional distribution based on planned quantities
        // The planned insumos cost is distributed by the proportion of planned quantity
        // Distribute total planned cost by quantity ratio (more accurate than by tree count)
        const costoLoteInsumosPlan = costoInsumosPlaneadoTotal * quantityRatio;
        
        // Real costs from movimientos_diarios_productos + registros_trabajo
        const costoLoteInsumosReal = costoInsumosRealesMap.get(loteId) || 0;
        const costoLoteManoObraReal = jornales.costo;
        
        // Calculate planned MO based on jornales plan × avg cost
        const costoLoteManoObraPlan = jornalesPlan * avgCostoJornalPlan;
        
        // Calculate deviations
        const costoInsumosDesv = costoLoteInsumosPlan > 0
          ? ((costoLoteInsumosReal - costoLoteInsumosPlan) / costoLoteInsumosPlan) * 100 : 0;
        const costoManoObraDesv = costoLoteManoObraPlan > 0
          ? ((costoLoteManoObraReal - costoLoteManoObraPlan) / costoLoteManoObraPlan) * 100 : 0;
        
        const costoLoteTotalPlan = costoLoteInsumosPlan + costoLoteManoObraPlan;
        const costoLoteTotalReal = costoLoteInsumosReal + costoLoteManoObraReal;
        const costoTotalDesv = costoLoteTotalPlan > 0
          ? ((costoLoteTotalReal - costoLoteTotalPlan) / costoLoteTotalPlan) * 100 : 0;
        
        // Previous app comparison (proportional by quantity)
        const costoInsumosAnt = (Number(prevApp?.costo_total_insumos) || 0) * quantityRatio;
        const costoInsumosVar = costoInsumosAnt > 0 ? ((costoLoteInsumosReal - costoInsumosAnt) / costoInsumosAnt) * 100 : undefined;
        const costoManoObraAnt = (Number(prevApp?.costo_total_mano_obra) || 0) * quantityRatio;
        const costoManoObraVar = costoManoObraAnt > 0 ? ((costoLoteManoObraReal - costoManoObraAnt) / costoManoObraAnt) * 100 : undefined;
        const costoTotalAnt = (Number(prevApp?.costo_total) || 0) * quantityRatio;
        const costoTotalVar = costoTotalAnt > 0 ? ((costoLoteTotalReal - costoTotalAnt) / costoTotalAnt) * 100 : undefined;

        financieroPorLote.push({
          loteNombre: loteInfo.nombre,
          costoTotalPlaneado: Math.round(costoLoteTotalPlan),
          costoTotalReal: Math.round(costoLoteTotalReal),
          costoTotalDesviacion: Math.round(costoTotalDesv * 10) / 10,
          costoTotalAnterior: costoTotalAnt > 0 ? Math.round(costoTotalAnt) : undefined,
          costoTotalVariacion: costoTotalVar !== undefined ? Math.round(costoTotalVar * 10) / 10 : undefined,
          costoInsumosPlaneado: Math.round(costoLoteInsumosPlan),
          costoInsumosReal: Math.round(costoLoteInsumosReal),
          costoInsumosDesviacion: Math.round(costoInsumosDesv * 10) / 10,
          costoInsumosAnterior: costoInsumosAnt > 0 ? Math.round(costoInsumosAnt) : undefined,
          costoInsumosVariacion: costoInsumosVar !== undefined ? Math.round(costoInsumosVar * 10) / 10 : undefined,
          costoManoObraPlaneado: Math.round(costoLoteManoObraPlan),
          costoManoObraReal: Math.round(costoLoteManoObraReal),
          costoManoObraDesviacion: Math.round(costoManoObraDesv * 10) / 10,
          costoManoObraAnterior: costoManoObraAnt > 0 ? Math.round(costoManoObraAnt) : undefined,
          costoManoObraVariacion: costoManoObraVar !== undefined ? Math.round(costoManoObraVar * 10) / 10 : undefined,
        });
      });

      // Add grand total row for KPI table
      const totalArbolesLotes = Array.from(lotesMap.values()).reduce((s, l) => s + l.arboles, 0);
      const totalCanecasDesv = totalCanecasPlan > 0
        ? ((totalCanecasReal - totalCanecasPlan) / totalCanecasPlan) * 100 : 0;
      const totalJornalesDesv = totalJornalesPlan > 0
        ? ((totalJornalesReal - totalJornalesPlan) / totalJornalesPlan) * 100 : 0;

      kpiPorLote.push({
        loteNombre: 'TOTAL',
        canecasPlaneadas: totalCanecasPlan,
        canecasReales: totalCanecasReal,
        canecasDesviacion: Math.round(totalCanecasDesv * 10) / 10,
        jornalesPlaneados: Math.round(totalJornalesPlan * 10) / 10,
        jornalesReales: totalJornalesReal,
        jornalesDesviacion: Math.round(totalJornalesDesv * 10) / 10,
        arbolesTratados: totalArbolesLotes,
      });

      // Add grand total row for Financial table
      // Sum values from individual lotes (not recalculate) to ensure consistency
      const totalPlanInsumos = financieroPorLote.reduce((sum, l) => sum + (l.costoInsumosPlaneado || 0), 0);
      const totalRealInsumos = financieroPorLote.reduce((sum, l) => sum + (l.costoInsumosReal || 0), 0);
      const totalPlanMO = financieroPorLote.reduce((sum, l) => sum + (l.costoManoObraPlaneado || 0), 0);
      const totalRealMO = financieroPorLote.reduce((sum, l) => sum + (l.costoManoObraReal || 0), 0);
      const totalPlan = financieroPorLote.reduce((sum, l) => sum + (l.costoTotalPlaneado || 0), 0);
      const totalReal = financieroPorLote.reduce((sum, l) => sum + (l.costoTotalReal || 0), 0);

      // Validaciones de consistencia para detectar desfases entre agregado por lote y total de aplicación
      if (Math.abs(totalRealInsumos - costoInsumosTotal) > 1 || Math.abs(totalRealMO - costoManoObraTotal) > 1) {
        console.warn('[ReporteSemanal] Desfase detectado en costos reales por lote', {
          aplicacionId: app.id,
          insumosLotes: totalRealInsumos,
          insumosAplicacion: costoInsumosTotal,
          manoObraLotes: totalRealMO,
          manoObraAplicacion: costoManoObraTotal,
        });
      }

      financieroPorLote.push({
        loteNombre: 'TOTAL',
        costoTotalPlaneado: Math.round(totalPlan),
        costoTotalReal: Math.round(totalReal),
        costoTotalDesviacion: Math.round(totalPlan > 0 ? ((totalReal - totalPlan) / totalPlan) * 100 : 0),
        costoTotalAnterior: costoAnterior ? Math.round(costoAnterior) : undefined,
        costoTotalVariacion: costoAnterior ? Math.round(((totalReal - costoAnterior) / costoAnterior) * 1000) / 10 : undefined,
        costoInsumosPlaneado: Math.round(totalPlanInsumos),
        costoInsumosReal: Math.round(totalRealInsumos),
        costoInsumosDesviacion: Math.round(totalPlanInsumos > 0 ? ((totalRealInsumos - totalPlanInsumos) / totalPlanInsumos) * 100 : 0),
        costoInsumosAnterior: prevApp?.costo_total_insumos ? Math.round(prevApp.costo_total_insumos) : undefined,
        costoInsumosVariacion: prevApp?.costo_total_insumos ? Math.round(((totalRealInsumos - prevApp.costo_total_insumos) / prevApp.costo_total_insumos) * 1000) / 10 : undefined,
        costoManoObraPlaneado: Math.round(totalPlanMO),
        costoManoObraReal: Math.round(totalRealMO),
        costoManoObraDesviacion: Math.round(totalPlanMO > 0 ? ((totalRealMO - totalPlanMO) / totalPlanMO) * 100 : 0),
        costoManoObraAnterior: prevApp?.costo_total_mano_obra ? Math.round(prevApp.costo_total_mano_obra) : undefined,
        costoManoObraVariacion: prevApp?.costo_total_mano_obra ? Math.round(((totalRealMO - prevApp.costo_total_mano_obra) / prevApp.costo_total_mano_obra) * 1000) / 10 : undefined,
      });

      const totalCanecasVar = totalCanecasAnt > 0
        ? ((totalCanecasReal - totalCanecasAnt) / totalCanecasAnt) * 100 : undefined;

      // Calculate planned total with proper MO cost calculation (not just copying real)
      const costoTotalPlaneadoApp = costoInsumosPlaneadoTotal + (totalJornalesPlan * avgCostoJornalPlan);
      const costoTotalDesvApp = costoTotalPlaneadoApp > 0
        ? ((totalReal - costoTotalPlaneadoApp) / costoTotalPlaneadoApp) * 100 : 0;
      
      const costoVariacionApp = costoAnterior
        ? ((totalReal - costoAnterior) / costoAnterior) * 100 : undefined;

      const general: AplicacionCierreGeneral = {
        canecasBultosPlaneados: totalCanecasPlan,
        canecasBultosReales: totalCanecasReal,
        canecasBultosDesviacion: Math.round(totalCanecasDesv * 10) / 10,
        canecasAnterior: totalCanecasAnt > 0 ? totalCanecasAnt : undefined,
        canecasVariacion: totalCanecasVar !== undefined ? Math.round(totalCanecasVar * 10) / 10 : undefined,
        unidad,
        costoPlaneado: Math.round(costoTotalPlaneadoApp),
        costoReal: Math.round(totalReal),
        costoDesviacion: Math.round(costoTotalDesvApp * 10) / 10,
        costoAnterior: costoAnterior ? Math.round(costoAnterior) : undefined,
        costoVariacion: costoVariacionApp !== undefined ? Math.round(costoVariacionApp * 10) / 10 : undefined,
      };

      resultado.push({
        id: app.id,
        nombre: app.nombre_aplicacion || 'Sin nombre',
        tipo: app.tipo_aplicacion,
        proposito: app.proposito || '',
        fechaInicio,
        fechaFin,
        diasEjecucion,
        general,
        kpiPorLote,
        financieroPorLote,
      });
    } catch (err) {
      console.warn(`fetchAplicacionesCerradas: skip ${appId}`, err);
    }
  }

  return resultado;
}

/**
 * Obtiene la lista de aplicaciones cerradas disponibles para selección en el wizard.
 */
export async function fetchListaAplicacionesCerradas(): Promise<{ id: string; nombre: string; tipo: string; fechaCierre: string }[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('aplicaciones')
    .select('id, nombre_aplicacion, tipo_aplicacion, fecha_cierre, fecha_fin_ejecucion')
    .eq('estado', 'Cerrada')
    .order('fecha_cierre', { ascending: false })
    .limit(30);

  if (error) throw new Error(`Error al cargar aplicaciones cerradas: ${error.message}`);

  return (data || []).map((a: any) => ({
    id: a.id,
    nombre: a.nombre_aplicacion || 'Sin nombre',
    tipo: a.tipo_aplicacion || '',
    fechaCierre: a.fecha_cierre || a.fecha_fin_ejecucion || '',
  }));
}

// ============================================================================
// SECCIÓN 4: MONITOREO
// ============================================================================

/**
 * Obtiene datos de monitoreo: tendencias de los últimos 3 eventos,
 * detalle por lote, vistas por lote con 3 fechas, y vistas por sublote.
 */
export async function fetchDatosMonitoreo(): Promise<DatosMonitoreo> {
  const supabase = getSupabase();

  // Get all unique monitoring dates, ascending (oldest first)
  // Then take the last 3 (most recent) which will be in chronological order
  const { data: fechasRaw, error: errorFechas } = await supabase
    .from('monitoreos')
    .select('fecha_monitoreo')
    .order('fecha_monitoreo', { ascending: true });

  if (errorFechas) throw new Error(`Error al cargar fechas de monitoreo: ${errorFechas.message}`);

  const fechasUnicas = [...new Set((fechasRaw || []).map(r => r.fecha_monitoreo))];
  // Take last 3 (most recent) - now in chronological order (oldest→newest)
  const ultimas3Fechas = fechasUnicas.slice(-3);

  if (ultimas3Fechas.length === 0) {
    return {
      tendencias: [],
      detallePorLote: [],
      insights: [],
      fechasMonitoreo: [],
      vistasPorLote: [],
      vistasPorSublote: [],
    };
  }

  // Load monitoring data for the last 3 dates
  const { data: monitoreos, error: errorMon } = await supabase
    .from('monitoreos')
    .select(`
      id,
      fecha_monitoreo,
      lote_id,
      sublote_id,
      plaga_enfermedad_id,
      arboles_monitoreados,
      arboles_afectados,
      incidencia,
      gravedad_texto,
      plagas_enfermedades_catalogo(nombre),
      lotes(id, nombre),
      sublotes(id, nombre)
    `)
    .in('fecha_monitoreo', ultimas3Fechas)
    .order('fecha_monitoreo', { ascending: true });

  if (errorMon) throw new Error(`Error al cargar monitoreos: ${errorMon.message}`);

  // --- TENDENCIAS: fecha × plaga → avg incidencia ---
  const tendenciasMap = new Map<string, Map<string, number[]>>();

  (monitoreos || []).forEach((m: any) => {
    const fecha = m.fecha_monitoreo;
    const plaga = m.plagas_enfermedades_catalogo?.nombre || 'Desconocida';

    if (!tendenciasMap.has(fecha)) tendenciasMap.set(fecha, new Map());
    const fechaMap = tendenciasMap.get(fecha)!;
    if (!fechaMap.has(plaga)) fechaMap.set(plaga, []);
    fechaMap.get(plaga)!.push(Number(m.incidencia) || 0);
  });

  const tendencias: TendenciaMonitoreo[] = [];
  tendenciasMap.forEach((plagasMap, fecha) => {
    plagasMap.forEach((incidencias, plagaNombre) => {
      const promedio = incidencias.reduce((a, b) => a + b, 0) / incidencias.length;
      tendencias.push({
        fecha,
        plagaNombre,
        incidenciaPromedio: Math.round(promedio * 10) / 10,
      });
    });
  });

  // --- DETALLE POR LOTE: most recent monitoring ---
  const fechaMasReciente = ultimas3Fechas[0];
  const monitoreoReciente = (monitoreos || []).filter(
    (m: any) => m.fecha_monitoreo === fechaMasReciente
  );

  const detalleLoteMap = new Map<string, MonitoreoSublote[]>();
  monitoreoReciente.forEach((m: any) => {
    const loteNombre = m.lotes?.nombre || 'Sin lote';
    const subloteNombre = m.sublotes?.nombre || 'Sin sublote';
    const plagaNombre = m.plagas_enfermedades_catalogo?.nombre || 'Desconocida';

    if (!detalleLoteMap.has(loteNombre)) detalleLoteMap.set(loteNombre, []);
    detalleLoteMap.get(loteNombre)!.push({
      subloteNombre,
      plagaNombre,
      incidencia: Number(m.incidencia) || 0,
      gravedad: m.gravedad_texto || 'Baja',
      arboresAfectados: Number(m.arboles_afectados) || 0,
      arboresMonitoreados: Number(m.arboles_monitoreados) || 0,
    });
  });

  const detallePorLote: MonitoreoPorLote[] = Array.from(detalleLoteMap.entries())
    .map(([loteNombre, sublotes]) => ({ loteNombre, sublotes }))
    .sort((a, b) => a.loteNombre.localeCompare(b.loteNombre));

  // --- INSIGHTS ---
  const insights: Insight[] = generarInsightsBasicos(monitoreos || []);

  // --- VISTAS POR LOTE (3 fechas per lote × plaga) ---
  const vistasPorLote = buildVistasPorLote(monitoreos || [], ultimas3Fechas);

  // --- VISTAS POR SUBLOTE (1 per lote: sublotes × plagas grid with 3 obs) ---
  const vistasPorSublote = buildVistasPorSublote(monitoreos || [], ultimas3Fechas);

  return {
    tendencias,
    detallePorLote,
    insights,
    fechasMonitoreo: ultimas3Fechas,
    vistasPorLote,
    vistasPorSublote,
  };
}

function buildVistasPorLote(monitoreos: any[], fechas: string[]): VistaMonitoreoLote[] {
  // loteId → plagaNombre → fecha → avg incidencia
  const loteMap = new Map<string, { id: string; nombre: string; plagas: Map<string, Map<string, number[]>> }>();

  monitoreos.forEach((m: any) => {
    const loteId = m.lote_id;
    const loteNombre = m.lotes?.nombre || 'Sin lote';
    const plaga = m.plagas_enfermedades_catalogo?.nombre || 'Desconocida';
    const fecha = m.fecha_monitoreo;
    const incidencia = Number(m.incidencia) || 0;

    if (!loteMap.has(loteId)) {
      loteMap.set(loteId, { id: loteId, nombre: loteNombre, plagas: new Map() });
    }
    const loteEntry = loteMap.get(loteId)!;
    if (!loteEntry.plagas.has(plaga)) loteEntry.plagas.set(plaga, new Map());
    const plagaEntry = loteEntry.plagas.get(plaga)!;
    if (!plagaEntry.has(fecha)) plagaEntry.set(fecha, []);
    plagaEntry.get(fecha)!.push(incidencia);
  });

  const result: VistaMonitoreoLote[] = [];

  loteMap.forEach(({ id, nombre, plagas }) => {
    const plagasRows: VistaLotePlaga[] = [];

    plagas.forEach((fechaMap, plagaNombre) => {
      const esInteres = PLAGAS_INTERES.some(p =>
        plagaNombre.toLowerCase().includes(p.toLowerCase())
      );

      const observaciones: ObservacionFecha[] = fechas.map(fecha => {
        const vals = fechaMap.get(fecha);
        if (!vals || vals.length === 0) return { fecha, incidencia: null };
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        return { fecha, incidencia: Math.round(avg * 10) / 10 };
      });

      plagasRows.push({ plagaNombre, esPlaga_interes: esInteres, observaciones });
    });

    // Sort: plagas de interes first, then by latest incidencia desc
    plagasRows.sort((a, b) => {
      if (a.esPlaga_interes !== b.esPlaga_interes) return a.esPlaga_interes ? -1 : 1;
      const aLast = a.observaciones.find(o => o.incidencia != null)?.incidencia || 0;
      const bLast = b.observaciones.find(o => o.incidencia != null)?.incidencia || 0;
      return bLast - aLast;
    });

    result.push({ loteId: id, loteNombre: nombre, plagasRows });
  });

  return result.sort((a, b) => a.loteNombre.localeCompare(b.loteNombre));
}

function buildVistasPorSublote(monitoreos: any[], fechas: string[]): VistaMonitoreoSublote[] {
  // loteId → { sublotes: Set, plagas: Set, celdas: plaga → sublote → fecha → vals[] }
  type LoteEntry = {
    id: string;
    nombre: string;
    sublotes: Set<string>;
    plagas: Set<string>;
    celdas: Map<string, Map<string, Map<string, number[]>>>;
  };

  const loteMap = new Map<string, LoteEntry>();

  monitoreos.forEach((m: any) => {
    const loteId = m.lote_id;
    const loteNombre = m.lotes?.nombre || 'Sin lote';
    const subloteNombre = m.sublotes?.nombre || 'Sin sublote';
    const plaga = m.plagas_enfermedades_catalogo?.nombre || 'Desconocida';
    const fecha = m.fecha_monitoreo;
    const incidencia = Number(m.incidencia) || 0;

    if (!loteMap.has(loteId)) {
      loteMap.set(loteId, {
        id: loteId, nombre: loteNombre,
        sublotes: new Set(), plagas: new Set(),
        celdas: new Map(),
      });
    }

    const entry = loteMap.get(loteId)!;
    entry.sublotes.add(subloteNombre);
    entry.plagas.add(plaga);

    if (!entry.celdas.has(plaga)) entry.celdas.set(plaga, new Map());
    const plagaMap = entry.celdas.get(plaga)!;
    if (!plagaMap.has(subloteNombre)) plagaMap.set(subloteNombre, new Map());
    const subloteMap = plagaMap.get(subloteNombre)!;
    if (!subloteMap.has(fecha)) subloteMap.set(fecha, []);
    subloteMap.get(fecha)!.push(incidencia);
  });

  const result: VistaMonitoreoSublote[] = [];

  loteMap.forEach(({ id, nombre, sublotes, plagas, celdas }) => {
    const sublotesArr = Array.from(sublotes).sort();
    const plagasArr = Array.from(plagas).sort((a, b) => {
      const aInt = PLAGAS_INTERES.some(p => a.toLowerCase().includes(p.toLowerCase()));
      const bInt = PLAGAS_INTERES.some(p => b.toLowerCase().includes(p.toLowerCase()));
      if (aInt !== bInt) return aInt ? -1 : 1;
      return a.localeCompare(b);
    });

    const celdasObj: Record<string, Record<string, ObservacionFecha[]>> = {};

    plagasArr.forEach(plaga => {
      celdasObj[plaga] = {};
      sublotesArr.forEach(sublote => {
        const fechaMap = celdas.get(plaga)?.get(sublote);
        celdasObj[plaga][sublote] = fechas.map(fecha => {
          const vals = fechaMap?.get(fecha);
          if (!vals || vals.length === 0) return { fecha, incidencia: null };
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          return { fecha, incidencia: Math.round(avg * 10) / 10 };
        });
      });
    });

    result.push({
      loteId: id,
      loteNombre: nombre,
      sublotes: sublotesArr,
      plagas: plagasArr,
      celdas: celdasObj,
    });
  });

  return result.sort((a, b) => a.loteNombre.localeCompare(b.loteNombre));
}

/**
 * Genera insights básicos sin depender de propiedades extendidas del monitoreo
 */
function generarInsightsBasicos(monitoreos: any[]): Insight[] {
  const insights: Insight[] = [];

  const plagaLoteMap = new Map<string, { incidencias: number[]; plaga: string; lote: string }>();

  monitoreos.forEach(m => {
    const plaga = m.plagas_enfermedades_catalogo?.nombre || 'Desconocida';
    const lote = m.lotes?.nombre || 'Sin lote';
    const key = `${plaga}|${lote}`;
    if (!plagaLoteMap.has(key)) {
      plagaLoteMap.set(key, { incidencias: [], plaga, lote });
    }
    plagaLoteMap.get(key)!.incidencias.push(Number(m.incidencia) || 0);
  });

  plagaLoteMap.forEach(({ incidencias, plaga, lote }) => {
    const promedio = incidencias.reduce((a, b) => a + b, 0) / incidencias.length;
    if (promedio >= 30) {
      insights.push({
        tipo: 'urgente',
        titulo: `${plaga} crítica en ${lote}`,
        descripcion: `Incidencia promedio de ${promedio.toFixed(1)}% - requiere atención inmediata`,
        plaga,
        lote,
        incidenciaActual: promedio,
        accion: 'Evaluar aplicación de tratamiento',
      });
    } else if (promedio >= 20) {
      insights.push({
        tipo: 'atencion',
        titulo: `${plaga} elevada en ${lote}`,
        descripcion: `Incidencia promedio de ${promedio.toFixed(1)}% - monitorear de cerca`,
        plaga,
        lote,
        incidenciaActual: promedio,
        accion: 'Monitorear de cerca',
      });
    }
  });

  return insights
    .sort((a, b) => (b.incidenciaActual || 0) - (a.incidenciaActual || 0))
    .slice(0, 5);
}

// ============================================================================
// FUNCIÓN PRINCIPAL: OBTENER TODOS LOS DATOS DEL REPORTE
// ============================================================================

export interface FetchReporteParams {
  semana: RangoSemana;
  fallas: number;
  permisos: number;
  ingresos?: number;
  retiros?: number;
  detalleFallas?: Array<{ empleado: string; razon?: string }>;
  detallePermisos?: Array<{ empleado: string; razon?: string }>;
  cerradasIds?: string[];
  temasAdicionales: BloqueAdicional[];
}

/**
 * Obtiene todos los datos necesarios para generar el reporte semanal.
 * Ejecuta las consultas en paralelo para optimizar tiempos.
 */
export async function fetchDatosReporteSemanal(
  params: FetchReporteParams
): Promise<DatosReporteSemanal> {
  const {
    semana,
    fallas,
    permisos,
    ingresos = 0,
    retiros = 0,
    detalleFallas = [],
    detallePermisos = [],
    cerradasIds = [],
    temasAdicionales,
  } = params;

  // Days in week = 5 working days (Mon–Fri) by default
  const diasHabiles = 5;

  // Execute all queries in parallel
  const [
    personalBase,
    laboresProgramadas,
    matrizJornales,
    aplicacionesPlaneadas,
    aplicacionesActivas,
    aplicacionesCerradas,
    monitoreo,
  ] = await Promise.all([
    fetchPersonalSemana(semana.inicio, semana.fin),
    fetchLaboresSemanales(semana.inicio, semana.fin),
    fetchMatrizJornales(semana.inicio, semana.fin),
    fetchAplicacionesPlaneadas(),
    fetchAplicacionesActivas(),
    fetchAplicacionesCerradas(cerradasIds),
    fetchDatosMonitoreo(),
  ]);

  const jornalesPosibles = personalBase.totalTrabajadores * diasHabiles;
  const jornalesTrabajados = personalBase.jornalesTrabajados;
  const eficienciaOperativa = jornalesPosibles > 0
    ? Math.round((jornalesTrabajados / jornalesPosibles) * 1000) / 10
    : 0;

  return {
    semana,
    personal: {
      ...personalBase,
      fallas,
      permisos,
      ingresos,
      retiros,
      detalleFallas,
      detallePermisos,
      jornalesPosibles,
      jornalesTrabajados,
      eficienciaOperativa,
    },
    labores: {
      programadas: laboresProgramadas,
      matrizJornales,
    },
    jornales: matrizJornales, // legacy
    aplicaciones: {
      planeadas: aplicacionesPlaneadas,
      activas: aplicacionesActivas,
      cerradas: aplicacionesCerradas,
    },
    monitoreo,
    temasAdicionales,
  };
}
