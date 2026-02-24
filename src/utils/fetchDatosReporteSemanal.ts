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
  DatosMonitoreo,
  TendenciaMonitoreo,
  MonitoreoPorLote,
  MonitoreoSublote,
  DatosReporteSemanal,
  BloqueAdicional,
} from '../types/reporteSemanal';
import type { Insight } from '../types/monitoreo';

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
 * - Total de trabajadores únicos (empleados + contratistas)
 * - Desglose empleados vs contratistas
 * Nota: fallas y permisos se ingresan manualmente
 */
export async function fetchPersonalSemana(
  inicio: string,
  fin: string
): Promise<Omit<DatosPersonal, 'fallas' | 'permisos'>> {
  const supabase = getSupabase();

  const { data: registros, error } = await supabase
    .from('registros_trabajo')
    .select('empleado_id, contratista_id')
    .gte('fecha_trabajo', inicio)
    .lte('fecha_trabajo', fin);

  if (error) throw new Error(`Error al cargar personal: ${error.message}`);

  const empleadosUnicos = new Set(
    (registros || []).filter(r => r.empleado_id).map(r => r.empleado_id)
  );
  const contratistasUnicos = new Set(
    (registros || []).filter(r => r.contratista_id).map(r => r.contratista_id)
  );

  return {
    totalTrabajadores: empleadosUnicos.size + contratistasUnicos.size,
    empleados: empleadosUnicos.size,
    contratistas: contratistasUnicos.size,
  };
}

// ============================================================================
// SECCIÓN 2: MATRIZ DE JORNALES
// ============================================================================

/**
 * Obtiene la matriz de jornales: actividades (filas) × lotes (columnas)
 * con totales por fila, columna y total general
 */
export async function fetchMatrizJornales(
  inicio: string,
  fin: string
): Promise<MatrizJornales> {
  const supabase = getSupabase();

  // Cargar tipos de tarea para resolver nombres
  const { data: tiposTareas, error: errorTipos } = await supabase
    .from('tipos_tareas')
    .select('id, nombre');

  if (errorTipos) throw new Error(`Error al cargar tipos de tarea: ${errorTipos.message}`);

  const tiposMap = new Map((tiposTareas || []).map(t => [t.id, t.nombre]));

  // Cargar registros de trabajo con joins a tareas y lotes
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

  // Construir la matriz
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

    // Celda actividad × lote
    if (!datos[actividad]) datos[actividad] = {};
    if (!datos[actividad][lote]) datos[actividad][lote] = { jornales: 0, costo: 0 };
    datos[actividad][lote].jornales += jornales;
    datos[actividad][lote].costo += costo;

    // Totales por actividad
    if (!totalesPorActividad[actividad]) totalesPorActividad[actividad] = { jornales: 0, costo: 0 };
    totalesPorActividad[actividad].jornales += jornales;
    totalesPorActividad[actividad].costo += costo;

    // Totales por lote
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
 * Obtiene aplicaciones planeadas (estado: 'Calculada') con su lista de compras
 */
export async function fetchAplicacionesPlaneadas(): Promise<AplicacionPlaneada[]> {
  const supabase = getSupabase();

  // Aplicaciones en estado Calculada — join aplicaciones_compras to avoid N+1
  const { data: aplicaciones, error } = await supabase
    .from('aplicaciones')
    .select(`
      id,
      nombre_aplicacion,
      tipo_aplicacion,
      proposito,
      blanco_biologico,
      fecha_inicio_planeada,
      aplicaciones_compras(
        producto_nombre,
        producto_categoria,
        cantidad_necesaria,
        unidad,
        costo_estimado
      )
    `)
    .eq('estado', 'Calculada')
    .order('fecha_inicio_planeada', { ascending: true });

  if (error) throw new Error(`Error al cargar aplicaciones planeadas: ${error.message}`);

  // Collect all unique pest IDs across all applications for a single batch lookup
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

  const resultado: AplicacionPlaneada[] = [];

  for (const app of aplicaciones || []) {
    const listaCompras: ItemCompraResumen[] = ((app as any).aplicaciones_compras || []).map((c: any) => ({
      productoNombre: c.producto_nombre,
      categoria: c.producto_categoria || '',
      cantidadNecesaria: Number(c.cantidad_necesaria) || 0,
      unidad: c.unidad || '',
      costoEstimado: Number(c.costo_estimado) || 0,
    }));

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
      listaCompras,
      costoTotalEstimado: listaCompras.reduce((sum, item) => sum + item.costoEstimado, 0),
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
      aplicaciones_lotes(
        lote_id,
        lotes(nombre)
      ),
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

    // Calcular planeado por lote (de aplicaciones_calculos)
    const planeadoPorLote = new Map<string, { nombre: string; planeado: number }>();
    ((app as any).aplicaciones_calculos || []).forEach((calc: any) => {
      const loteNombre = calc.lotes?.nombre || 'Sin lote';
      const planeado = esFumigacion
        ? (Number(calc.numero_canecas) || 0)
        : (Number(calc.numero_bultos) || 0);
      planeadoPorLote.set(calc.lote_id, { nombre: loteNombre, planeado });
    });

    // Calcular ejecutado por lote (de movimientos_diarios)
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

    // Construir progreso por lote
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

// ============================================================================
// SECCIÓN 4: MONITOREO
// ============================================================================

/**
 * Obtiene datos de monitoreo: tendencias de los últimos 3 eventos
 * y detalle por lote/sublote del monitoreo más reciente
 */
export async function fetchDatosMonitoreo(): Promise<DatosMonitoreo> {
  const supabase = getSupabase();

  // Obtener todas las fechas de monitoreo únicas, ordenadas desc
  const { data: fechasRaw, error: errorFechas } = await supabase
    .from('monitoreos')
    .select('fecha_monitoreo')
    .order('fecha_monitoreo', { ascending: false });

  if (errorFechas) throw new Error(`Error al cargar fechas de monitoreo: ${errorFechas.message}`);

  // Obtener fechas únicas
  const fechasUnicas = [...new Set((fechasRaw || []).map(r => r.fecha_monitoreo))];
  const ultimas3Fechas = fechasUnicas.slice(0, 3);

  if (ultimas3Fechas.length === 0) {
    return {
      tendencias: [],
      detallePorLote: [],
      insights: [],
      fechasMonitoreo: [],
    };
  }

  // Cargar monitoreos de las últimas 3 fechas con relaciones
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
      lotes(nombre),
      sublotes(nombre)
    `)
    .in('fecha_monitoreo', ultimas3Fechas)
    .order('fecha_monitoreo', { ascending: true });

  if (errorMon) throw new Error(`Error al cargar monitoreos: ${errorMon.message}`);

  // --- TENDENCIAS: Agrupar por fecha × plaga → promedio de incidencia ---
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

  // --- DETALLE POR LOTE: Monitoreo más reciente ---
  const fechaMasReciente = ultimas3Fechas[0];
  const monitoreoReciente = (monitoreos || []).filter(
    (m: any) => m.fecha_monitoreo === fechaMasReciente
  );

  // Agrupar por lote
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

  // --- INSIGHTS: Generar insights básicos ---
  const insights: Insight[] = generarInsightsBasicos(monitoreos || []);

  return {
    tendencias,
    detallePorLote,
    insights,
    fechasMonitoreo: ultimas3Fechas,
  };
}

/**
 * Genera insights básicos sin depender de propiedades extendidas del monitoreo
 * (versión simplificada de insightsAutomaticos.ts compatible con la query)
 */
function generarInsightsBasicos(monitoreos: any[]): Insight[] {
  const insights: Insight[] = [];

  // Agrupar por plaga × lote del monitoreo más reciente
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

  // Detectar plagas críticas (incidencia >= 30%)
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
  temasAdicionales: BloqueAdicional[];
}

/**
 * Obtiene todos los datos necesarios para generar el reporte semanal.
 * Ejecuta las consultas en paralelo para optimizar tiempos.
 */
export async function fetchDatosReporteSemanal(
  params: FetchReporteParams
): Promise<DatosReporteSemanal> {
  const { semana, fallas, permisos, temasAdicionales } = params;

  // Ejecutar todas las consultas en paralelo
  const [
    personalBase,
    jornales,
    aplicacionesPlaneadas,
    aplicacionesActivas,
    monitoreo,
  ] = await Promise.all([
    fetchPersonalSemana(semana.inicio, semana.fin),
    fetchMatrizJornales(semana.inicio, semana.fin),
    fetchAplicacionesPlaneadas(),
    fetchAplicacionesActivas(),
    fetchDatosMonitoreo(),
  ]);

  return {
    semana,
    personal: {
      ...personalBase,
      fallas,
      permisos,
    },
    jornales,
    aplicaciones: {
      planeadas: aplicacionesPlaneadas,
      activas: aplicacionesActivas,
    },
    monitoreo,
    temasAdicionales,
  };
}
