// utils/fetchDatosReporteSemanal.ts
// Funciones para obtener los datos necesarios para el reporte semanal
// Fuentes: registros_trabajo, aplicaciones, monitoreos, lotes

import { getSupabase } from './supabase/client';
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
  const { data: tareas, error } = await supabase
    .from('tareas')
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
      tipos_tareas!tipo_tarea_id(nombre)
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
      tipoTarea: (t as any).tipos_tareas?.nombre || 'Sin tipo',
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

    const costoTotal = listaCompras.reduce((sum, item) => sum + item.costoEstimado, 0);
    const inventarioTotal = listaCompras.reduce((sum, item) => sum + (item.inventarioDisponible || 0), 0);
    const totalPedido = listaCompras.reduce((sum, item) => sum + (item.cantidadAComprar || 0), 0);

    let blancos: string[] = [];
    if (app.blanco_biologico) {
      const ids = Array.isArray(app.blanco_biologico)
        ? app.blanco_biologico
        : [app.blanco_biologico];
      blancos = (ids as string[]).map((id: string) => plagasMap.get(id) || '').filter(Boolean);
    }

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

      // Fetch actual movimientos per lote
      const { data: movimientos } = await supabase
        .from('movimientos_diarios')
        .select('lote_id, numero_canecas, numero_bultos')
        .eq('aplicacion_id', appId);

      const movMap = new Map<string, { canecas: number; bultos: number }>();
      (movimientos || []).forEach((m: any) => {
        const loteId = m.lote_id;
        if (!movMap.has(loteId)) movMap.set(loteId, { canecas: 0, bultos: 0 });
        const cur = movMap.get(loteId)!;
        cur.canecas += Number(m.numero_canecas) || 0;
        cur.bultos += Number(m.numero_bultos) || 0;
      });

      // Fetch jornales from registros_trabajo via tarea_id
      const { data: registros } = await supabase
        .from('registros_trabajo')
        .select('lote_id, fraccion_jornal, costo_jornal, tareas!inner(aplicacion_id)')
        .eq('tareas.aplicacion_id', appId);

      const jornalesMap = new Map<string, { jornales: number; costo: number }>();
      (registros || []).forEach((r: any) => {
        const loteId = r.lote_id;
        if (!loteId) return;
        if (!jornalesMap.has(loteId)) jornalesMap.set(loteId, { jornales: 0, costo: 0 });
        const cur = jornalesMap.get(loteId)!;
        cur.jornales += Number(r.fraccion_jornal) || 0;
        cur.costo += Number(r.costo_jornal) || 0;
      });

      // Fetch insumos cost per lote (from compras / cost calculations)
      const costoInsumosTotal = Number(app.costo_total_insumos) || 0;
      const costoManoObraTotal = Number(app.costo_total_mano_obra) || 0;
      const costoTotal = Number(app.costo_total) || 0;

      // Build KPI and financial per lote
      const kpiPorLote: AplicacionCierreKPILote[] = [];
      const financieroPorLote: AplicacionCierreFinancieroLote[] = [];

      let totalCanecasPlan = 0;
      let totalCanecasReal = 0;

      lotesMap.forEach((loteInfo, loteId) => {
        const calc = calcMap.get(loteId) || {};
        const mov = movMap.get(loteId) || { canecas: 0, bultos: 0 };
        const jornales = jornalesMap.get(loteId) || { jornales: 0, costo: 0 };
        const arboles = loteInfo.arboles || 1;

        const canecasPlan = esFumigacion ? (Number(calc.numero_canecas) || 0) : (Number(calc.numero_bultos) || 0);
        const canecasReal = esFumigacion ? mov.canecas : mov.bultos;
        const canecasDesv = canecasPlan > 0 ? ((canecasReal - canecasPlan) / canecasPlan) * 100 : 0;

        totalCanecasPlan += canecasPlan;
        totalCanecasReal += canecasReal;

        // Insumos
        const insumosPlaneados = esFumigacion
          ? (Number(calc.litros_mezcla) || 0)
          : (Number(calc.kilos_totales) || 0);
        const insumosReales = canecasReal * (esFumigacion ? 200 : 50); // approx
        const insumosDesv = insumosPlaneados > 0
          ? ((insumosReales - insumosPlaneados) / insumosPlaneados) * 100 : 0;

        const jornalesPlan = 0; // Not stored at this granularity in current schema
        const jornalesReal = jornales.jornales;
        const jornalesDesv = 0;

        kpiPorLote.push({
          loteNombre: loteInfo.nombre,
          canecasPlaneadas: canecasPlan || undefined,
          canecasReales: canecasReal || undefined,
          canecasDesviacion: Math.round(canecasDesv * 10) / 10,
          insumosPlaneados: insumosPlaneados || undefined,
          insumosReales: insumosReales || undefined,
          insumosDesviacion: Math.round(insumosDesv * 10) / 10,
          insumosUnidad: esFumigacion ? 'L' : 'Kg',
          jornalesPlaneados: jornalesPlan || undefined,
          jornalesReales: jornalesReal || undefined,
          jornalesDesviacion: Math.round(jornalesDesv * 10) / 10,
          arbolesTratados: arboles,
          arbolesPorJornal: jornalesReal > 0 ? Math.round(arboles / jornalesReal * 10) / 10 : undefined,
          litrosKgPorArbol: arboles > 0 ? Math.round((insumosReales / arboles) * 100) / 100 : undefined,
        });

        // Financial (cost distributed proportionally by lote arboles weight)
        const weight = arboles / Math.max(1, Array.from(lotesMap.values()).reduce((s, l) => s + l.arboles, 0));
        const costoLoteInsumos = costoInsumosTotal * weight;
        const costoLoteManoObra = jornales.costo;
        const costoLoteTotal = costoLoteInsumos + costoLoteManoObra;
        const costoLotePlan = costoLoteTotal; // no historical planned per lote

        financieroPorLote.push({
          loteNombre: loteInfo.nombre,
          costoTotalPlaneado: Math.round(costoLotePlan),
          costoTotalReal: Math.round(costoLoteTotal),
          costoTotalDesviacion: 0,
          costoInsumosPlaneado: Math.round(costoLoteInsumos),
          costoInsumosReal: Math.round(costoLoteInsumos),
          costoInsumosDesviacion: 0,
          costoManoObraPlaneado: Math.round(costoLoteManoObra),
          costoManoObraReal: Math.round(costoLoteManoObra),
          costoManoObraDesviacion: 0,
        });
      });

      const totalCanecasDesv = totalCanecasPlan > 0
        ? ((totalCanecasReal - totalCanecasPlan) / totalCanecasPlan) * 100 : 0;

      const general: AplicacionCierreGeneral = {
        canecasBultosPlaneados: totalCanecasPlan,
        canecasBultosReales: totalCanecasReal,
        canecasBultosDesviacion: Math.round(totalCanecasDesv * 10) / 10,
        unidad,
        costoPlaneado: costoTotal,
        costoReal: costoTotal,
        costoDesviacion: 0,
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

  // Get all unique monitoring dates, descending
  const { data: fechasRaw, error: errorFechas } = await supabase
    .from('monitoreos')
    .select('fecha_monitoreo')
    .order('fecha_monitoreo', { ascending: false });

  if (errorFechas) throw new Error(`Error al cargar fechas de monitoreo: ${errorFechas.message}`);

  const fechasUnicas = [...new Set((fechasRaw || []).map(r => r.fecha_monitoreo))];
  const ultimas3Fechas = fechasUnicas.slice(0, 3);

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
