// fetch-datos-reporte.ts
// Versión Deno de fetchDatosReporteSemanal.ts para uso en Edge Functions.
// Idéntica lógica de queries — sin dependencias del DOM ni del cliente frontend.

import { createClient } from 'npm:@supabase/supabase-js@2';

// ============================================================================
// SUPABASE CLIENT (SERVICE ROLE — para uso interno en Edge Functions)
// ============================================================================

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados');
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// ============================================================================
// TIPOS (subset de src/types/reporteSemanal.ts)
// ============================================================================

export interface RangoSemana {
  inicio: string;
  fin: string;
  numero: number;
  ano: number;
}

// ============================================================================
// UTILIDADES DE SEMANA
// ============================================================================

export function getNumeroSemanaISO(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function calcularSemanaAnterior(): RangoSemana {
  const hoy = new Date();
  const diaActual = hoy.getDay();
  const diasDesdeElLunes = diaActual === 0 ? 6 : diaActual - 1;

  const lunesActual = new Date(hoy);
  lunesActual.setDate(hoy.getDate() - diasDesdeElLunes);

  const lunesAnterior = new Date(lunesActual);
  lunesAnterior.setDate(lunesActual.getDate() - 7);

  const domingoAnterior = new Date(lunesAnterior);
  domingoAnterior.setDate(lunesAnterior.getDate() + 6);

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    inicio: fmt(lunesAnterior),
    fin: fmt(domingoAnterior),
    numero: getNumeroSemanaISO(lunesAnterior),
    ano: lunesAnterior.getFullYear(),
  };
}

// ============================================================================
// PERSONAL
// ============================================================================

async function fetchPersonalSemana(
  supabase: ReturnType<typeof createClient>,
  inicio: string,
  fin: string
): Promise<{ totalTrabajadores: number; empleados: number; contratistas: number }> {
  const { data: registros, error } = await supabase
    .from('registros_trabajo')
    .select('empleado_id, contratista_id')
    .gte('fecha_trabajo', inicio)
    .lte('fecha_trabajo', fin);

  if (error) throw new Error(`Error al cargar personal: ${error.message}`);

  const empleadosUnicos = new Set(
    (registros || []).filter((r: any) => r.empleado_id).map((r: any) => r.empleado_id)
  );
  const contratistasUnicos = new Set(
    (registros || []).filter((r: any) => r.contratista_id).map((r: any) => r.contratista_id)
  );

  return {
    totalTrabajadores: empleadosUnicos.size + contratistasUnicos.size,
    empleados: empleadosUnicos.size,
    contratistas: contratistasUnicos.size,
  };
}

// ============================================================================
// MATRIZ DE JORNALES
// ============================================================================

async function fetchMatrizJornales(
  supabase: ReturnType<typeof createClient>,
  inicio: string,
  fin: string
): Promise<any> {
  const { data: tiposTareas, error: errorTipos } = await supabase
    .from('tipos_tareas')
    .select('id, nombre');

  if (errorTipos) throw new Error(`Error al cargar tipos de tarea: ${errorTipos.message}`);

  const tiposMap = new Map((tiposTareas || []).map((t: any) => [t.id, t.nombre]));

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

  const datos: Record<string, Record<string, { jornales: number; costo: number }>> = {};
  const totalesPorActividad: Record<string, { jornales: number; costo: number }> = {};
  const totalesPorLote: Record<string, { jornales: number; costo: number }> = {};
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
// APLICACIONES PLANEADAS
// ============================================================================

async function fetchAplicacionesPlaneadas(
  supabase: ReturnType<typeof createClient>
): Promise<any[]> {
  const { data: aplicaciones, error } = await supabase
    .from('aplicaciones')
    .select(`
      id,
      nombre_aplicacion,
      tipo_aplicacion,
      proposito,
      blanco_biologico,
      fecha_inicio_planeada
    `)
    .eq('estado', 'Calculada')
    .order('fecha_inicio_planeada', { ascending: true });

  if (error) throw new Error(`Error al cargar aplicaciones planeadas: ${error.message}`);

  const resultado = [];

  for (const app of (aplicaciones || [])) {
    const { data: compras } = await supabase
      .from('aplicaciones_compras')
      .select('producto_nombre, producto_categoria, cantidad_necesaria, unidad, costo_estimado')
      .eq('aplicacion_id', (app as any).id);

    let blancos: string[] = [];
    if ((app as any).blanco_biologico) {
      const ids = Array.isArray((app as any).blanco_biologico)
        ? (app as any).blanco_biologico
        : [(app as any).blanco_biologico];
      const { data: plagas } = await supabase
        .from('plagas_enfermedades_catalogo')
        .select('nombre')
        .in('id', ids);
      blancos = (plagas || []).map((p: any) => p.nombre);
    }

    const listaCompras = (compras || []).map((c: any) => ({
      productoNombre: c.producto_nombre,
      categoria: c.producto_categoria || '',
      cantidadNecesaria: Number(c.cantidad_necesaria) || 0,
      unidad: c.unidad || '',
      costoEstimado: Number(c.costo_estimado) || 0,
    }));

    resultado.push({
      id: (app as any).id,
      nombre: (app as any).nombre_aplicacion || 'Sin nombre',
      tipo: (app as any).tipo_aplicacion,
      proposito: (app as any).proposito || '',
      blancosBiologicos: blancos,
      fechaInicioPlaneada: (app as any).fecha_inicio_planeada || '',
      listaCompras,
      costoTotalEstimado: listaCompras.reduce((sum: number, item: any) => sum + item.costoEstimado, 0),
    });
  }

  return resultado;
}

// ============================================================================
// APLICACIONES ACTIVAS
// ============================================================================

async function fetchAplicacionesActivas(
  supabase: ReturnType<typeof createClient>
): Promise<any[]> {
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
      )
    `)
    .eq('estado', 'En ejecución');

  if (error) throw new Error(`Error al cargar aplicaciones activas: ${error.message}`);

  const resultado = [];

  for (const app of (aplicaciones || [])) {
    const esFumigacion = (app as any).tipo_aplicacion === 'Fumigación';
    const unidad = esFumigacion ? 'canecas' : 'bultos';

    const { data: movimientos } = await supabase
      .from('movimientos_diarios')
      .select('lote_id, numero_canecas, numero_bultos')
      .eq('aplicacion_id', (app as any).id);

    const planeadoPorLote = new Map<string, { nombre: string; planeado: number }>();
    ((app as any).aplicaciones_calculos || []).forEach((calc: any) => {
      const loteNombre = calc.lotes?.nombre || 'Sin lote';
      const planeado = esFumigacion
        ? (Number(calc.numero_canecas) || 0)
        : (Number(calc.numero_bultos) || 0);
      planeadoPorLote.set(calc.lote_id, { nombre: loteNombre, planeado });
    });

    const ejecutadoPorLote = new Map<string, number>();
    (movimientos || []).forEach((mov: any) => {
      const ejecutado = esFumigacion
        ? (Number(mov.numero_canecas) || 0)
        : (Number(mov.numero_bultos) || 0);
      ejecutadoPorLote.set(mov.lote_id, (ejecutadoPorLote.get(mov.lote_id) || 0) + ejecutado);
    });

    const progresoPorLote: any[] = [];
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
      id: (app as any).id,
      nombre: (app as any).nombre_aplicacion || 'Sin nombre',
      tipo: (app as any).tipo_aplicacion,
      proposito: (app as any).proposito || '',
      estado: (app as any).estado,
      fechaInicio: (app as any).fecha_inicio_ejecucion || '',
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
// MONITOREO
// ============================================================================

async function fetchDatosMonitoreo(
  supabase: ReturnType<typeof createClient>
): Promise<any> {
  const { data: fechasRaw, error: errorFechas } = await supabase
    .from('monitoreos')
    .select('fecha_monitoreo')
    .order('fecha_monitoreo', { ascending: false });

  if (errorFechas) throw new Error(`Error al cargar fechas de monitoreo: ${errorFechas.message}`);

  const fechasUnicas = [...new Set((fechasRaw || []).map((r: any) => r.fecha_monitoreo))];
  const ultimas3Fechas = fechasUnicas.slice(0, 3);

  if (ultimas3Fechas.length === 0) {
    return { tendencias: [], detallePorLote: [], insights: [], fechasMonitoreo: [] };
  }

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

  // Tendencias
  const tendenciasMap = new Map<string, Map<string, number[]>>();
  (monitoreos || []).forEach((m: any) => {
    const fecha = m.fecha_monitoreo;
    const plaga = m.plagas_enfermedades_catalogo?.nombre || 'Desconocida';
    if (!tendenciasMap.has(fecha)) tendenciasMap.set(fecha, new Map());
    const fechaMap = tendenciasMap.get(fecha)!;
    if (!fechaMap.has(plaga)) fechaMap.set(plaga, []);
    fechaMap.get(plaga)!.push(Number(m.incidencia) || 0);
  });

  const tendencias: any[] = [];
  tendenciasMap.forEach((plagasMap, fecha) => {
    plagasMap.forEach((incidencias, plagaNombre) => {
      const promedio = incidencias.reduce((a: number, b: number) => a + b, 0) / incidencias.length;
      tendencias.push({ fecha, plagaNombre, incidenciaPromedio: Math.round(promedio * 10) / 10 });
    });
  });

  // Detalle por lote (fecha más reciente)
  const fechaMasReciente = ultimas3Fechas[0];
  const monitoreoReciente = (monitoreos || []).filter(
    (m: any) => m.fecha_monitoreo === fechaMasReciente
  );

  const detalleLoteMap = new Map<string, any[]>();
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

  const detallePorLote = Array.from(detalleLoteMap.entries())
    .map(([loteNombre, sublotes]) => ({ loteNombre, sublotes }))
    .sort((a: any, b: any) => a.loteNombre.localeCompare(b.loteNombre));

  // Insights simples
  const plagaLoteMap = new Map<string, { incidencias: number[]; plaga: string; lote: string }>();
  (monitoreos || []).forEach((m: any) => {
    const plaga = m.plagas_enfermedades_catalogo?.nombre || 'Desconocida';
    const lote = m.lotes?.nombre || 'Sin lote';
    const key = `${plaga}|${lote}`;
    if (!plagaLoteMap.has(key)) plagaLoteMap.set(key, { incidencias: [], plaga, lote });
    plagaLoteMap.get(key)!.incidencias.push(Number(m.incidencia) || 0);
  });

  const insights: any[] = [];
  plagaLoteMap.forEach(({ incidencias, plaga, lote }) => {
    const promedio = incidencias.reduce((a: number, b: number) => a + b, 0) / incidencias.length;
    if (promedio >= 30) {
      insights.push({
        tipo: 'urgente',
        titulo: `${plaga} crítica en ${lote}`,
        descripcion: `Incidencia promedio de ${promedio.toFixed(1)}% — requiere atención inmediata`,
        plaga, lote, incidenciaActual: promedio,
        accion: 'Evaluar aplicación de tratamiento',
      });
    } else if (promedio >= 20) {
      insights.push({
        tipo: 'atencion',
        titulo: `${plaga} elevada en ${lote}`,
        descripcion: `Incidencia promedio de ${promedio.toFixed(1)}% — monitorear de cerca`,
        plaga, lote, incidenciaActual: promedio,
        accion: 'Monitorear de cerca',
      });
    }
  });

  return {
    tendencias,
    detallePorLote,
    insights: insights.sort((a: any, b: any) => (b.incidenciaActual || 0) - (a.incidenciaActual || 0)).slice(0, 5),
    fechasMonitoreo: ultimas3Fechas,
  };
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

/**
 * Obtiene todos los datos para el reporte semanal usando el service role key.
 * Fallas y permisos son 0 en la generación rápida (no hay input manual).
 */
export async function fetchDatosReporteSemanalServidor(
  semana: RangoSemana
): Promise<any> {
  const supabase = getServiceClient();

  const [
    personalBase,
    jornales,
    aplicacionesPlaneadas,
    aplicacionesActivas,
    monitoreo,
  ] = await Promise.all([
    fetchPersonalSemana(supabase, semana.inicio, semana.fin),
    fetchMatrizJornales(supabase, semana.inicio, semana.fin),
    fetchAplicacionesPlaneadas(supabase),
    fetchAplicacionesActivas(supabase),
    fetchDatosMonitoreo(supabase),
  ]);

  return {
    semana,
    personal: { ...personalBase, fallas: 0, permisos: 0 },
    jornales,
    aplicaciones: { planeadas: aplicacionesPlaneadas, activas: aplicacionesActivas },
    monitoreo,
    temasAdicionales: [],
  };
}
