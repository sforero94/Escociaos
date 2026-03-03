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
  supabase: ReturnType<typeof createClient>,
  semana: RangoSemana
): Promise<any> {
  const PLAGAS_INTERES = ['Monalonion', 'Ácaro', 'Huevos de Ácaro', 'Ácaro Cristalino', 'Cucarrón marceño', 'Trips'];

  // 1. Load ALL lotes and sublotes
  const [{ data: todosLotes, error: errLotes }, { data: todosSublotes, error: errSub }] = await Promise.all([
    supabase.from('lotes').select('id, nombre').order('nombre'),
    supabase.from('sublotes').select('id, nombre, lote_id').order('nombre'),
  ]);
  if (errLotes) throw new Error(`Error al cargar lotes: ${errLotes.message}`);
  if (errSub) throw new Error(`Error al cargar sublotes: ${errSub.message}`);

  const lotesDB = (todosLotes || []) as Array<{ id: string; nombre: string }>;
  const sublotesDB = (todosSublotes || []) as Array<{ id: string; nombre: string; lote_id: string }>;

  // 2. Find 2 relevant monitoring dates relative to the report week
  const limiteInferior = (() => {
    const d = new Date(semana.inicio);
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  })();

  const { data: fechasRaw, error: errorFechas } = await supabase
    .from('monitoreos')
    .select('fecha_monitoreo')
    .gte('fecha_monitoreo', limiteInferior)
    .lte('fecha_monitoreo', semana.fin)
    .order('fecha_monitoreo', { ascending: false });

  if (errorFechas) throw new Error(`Error al cargar fechas de monitoreo: ${errorFechas.message}`);

  const fechasUnicas = [...new Set((fechasRaw || []).map((r: any) => r.fecha_monitoreo))];
  const fechaActual = fechasUnicas[0] || null;
  let fechaAnterior: string | null = null;

  if (fechaActual) {
    const { data: anteriorRaw } = await supabase
      .from('monitoreos')
      .select('fecha_monitoreo')
      .lt('fecha_monitoreo', fechaActual)
      .order('fecha_monitoreo', { ascending: false })
      .limit(1);
    fechaAnterior = anteriorRaw?.[0]?.fecha_monitoreo || null;
  }

  let avisoFechaDesactualizada: string | null = null;
  if (fechaActual && fechaActual < semana.inicio) {
    avisoFechaDesactualizada = `Datos del monitoreo del ${fechaActual}. No se realizó monitoreo en la semana del reporte.`;
  }

  if (!fechaActual) {
    return {
      fechaActual: null, fechaAnterior: null,
      avisoFechaDesactualizada: 'No se encontraron monitoreos en las últimas 2 semanas.',
      resumenGlobal: [],
      vistasPorLote: lotesDB.map((l: any) => ({ loteId: l.id, loteNombre: l.nombre, sinDatos: true, plagas: [] })),
      vistasPorSublote: lotesDB.map((l: any) => ({
        loteId: l.id, loteNombre: l.nombre, sinDatos: true,
        sublotes: sublotesDB.filter((s: any) => s.lote_id === l.id).map((s: any) => s.nombre).sort(),
        plagas: [], celdas: {},
      })),
      insights: [], tendencias: [], detallePorLote: [], fechasMonitoreo: [],
    };
  }

  // 3. Load monitoring records for the 2 relevant dates
  const fechasQuery = fechaAnterior ? [fechaActual, fechaAnterior] : [fechaActual];

  const { data: monitoreos, error: errorMon } = await supabase
    .from('monitoreos')
    .select(`
      id, fecha_monitoreo, lote_id, sublote_id, plaga_enfermedad_id,
      arboles_monitoreados, arboles_afectados, incidencia, gravedad_texto,
      plagas_enfermedades_catalogo(nombre), lotes(id, nombre), sublotes(id, nombre)
    `)
    .in('fecha_monitoreo', fechasQuery)
    .order('fecha_monitoreo', { ascending: true });

  if (errorMon) throw new Error(`Error al cargar monitoreos: ${errorMon.message}`);

  const registros = monitoreos || [];
  const regActuales = registros.filter((m: any) => m.fecha_monitoreo === fechaActual);
  const regAnteriores = registros.filter((m: any) => m.fecha_monitoreo === fechaAnterior);

  const allPlagas = new Set<string>();
  registros.forEach((m: any) => allPlagas.add(m.plagas_enfermedades_catalogo?.nombre || 'Desconocida'));

  const esPlagaInteres = (nombre: string) => PLAGAS_INTERES.some(p => nombre.toLowerCase().includes(p.toLowerCase()));
  const avg = (vals: number[]) => vals.length === 0 ? 0 : Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10;
  const calcTendencia = (act: number | null, ant: number | null) => {
    if (act === null || ant === null) return 'sin_referencia';
    const diff = act - ant;
    if (Math.abs(diff) < 0.5) return 'estable';
    return diff > 0 ? 'subiendo' : 'bajando';
  };

  // 4. Build resumenGlobal
  const resumenGlobal = Array.from(allPlagas).map(plaga => {
    const lotesActuales = new Map<string, number[]>();
    regActuales.forEach((m: any) => {
      if ((m.plagas_enfermedades_catalogo?.nombre || 'Desconocida') !== plaga) return;
      const lid = m.lote_id;
      if (!lotesActuales.has(lid)) lotesActuales.set(lid, []);
      lotesActuales.get(lid)!.push(Number(m.incidencia) || 0);
    });
    const promediosPorLote = Array.from(lotesActuales.values()).map(v => avg(v));
    const promedioActual = promediosPorLote.length > 0
      ? Math.round((promediosPorLote.reduce((a: number, b: number) => a + b, 0) / promediosPorLote.length) * 10) / 10 : null;

    const valsAnt = regAnteriores.filter((m: any) => (m.plagas_enfermedades_catalogo?.nombre || 'Desconocida') === plaga).map((m: any) => Number(m.incidencia) || 0);
    const promedioAnterior = valsAnt.length > 0 ? avg(valsAnt) : null;

    return {
      plagaNombre: plaga, esPlaga_interes: esPlagaInteres(plaga),
      promedioActual, minLote: promediosPorLote.length > 0 ? Math.min(...promediosPorLote) : null,
      maxLote: promediosPorLote.length > 0 ? Math.max(...promediosPorLote) : null,
      promedioAnterior, tendencia: calcTendencia(promedioActual, promedioAnterior),
    };
  }).sort((a: any, b: any) => {
    if (a.esPlaga_interes !== b.esPlaga_interes) return a.esPlaga_interes ? -1 : 1;
    return (b.promedioActual ?? 0) - (a.promedioActual ?? 0);
  });

  // 5. Build vistasPorLote
  const vistasPorLote = lotesDB.map((lote: any) => {
    const regLA = regActuales.filter((m: any) => m.lote_id === lote.id);
    const regLAnt = regAnteriores.filter((m: any) => m.lote_id === lote.id);
    if (regLA.length === 0 && regLAnt.length === 0) return { loteId: lote.id, loteNombre: lote.nombre, sinDatos: true, plagas: [] };
    const plagasLote = new Set<string>();
    [...regLA, ...regLAnt].forEach((m: any) => plagasLote.add(m.plagas_enfermedades_catalogo?.nombre || 'Desconocida'));
    const plagas = Array.from(plagasLote).map(plaga => {
      const vA = regLA.filter((m: any) => (m.plagas_enfermedades_catalogo?.nombre || 'Desconocida') === plaga).map((m: any) => Number(m.incidencia) || 0);
      const vP = regLAnt.filter((m: any) => (m.plagas_enfermedades_catalogo?.nombre || 'Desconocida') === plaga).map((m: any) => Number(m.incidencia) || 0);
      const actual = vA.length > 0 ? avg(vA) : null;
      const anterior = vP.length > 0 ? avg(vP) : null;
      return { plagaNombre: plaga, esPlaga_interes: esPlagaInteres(plaga), actual, anterior, tendencia: calcTendencia(actual, anterior) };
    }).sort((a: any, b: any) => {
      if (a.esPlaga_interes !== b.esPlaga_interes) return a.esPlaga_interes ? -1 : 1;
      return (b.actual ?? 0) - (a.actual ?? 0);
    });
    return { loteId: lote.id, loteNombre: lote.nombre, sinDatos: false, plagas };
  });

  // 6. Build vistasPorSublote
  const vistasPorSublote = lotesDB.map((lote: any) => {
    const sublotesLote = sublotesDB.filter((s: any) => s.lote_id === lote.id).map((s: any) => s.nombre).sort();
    const regLA = regActuales.filter((m: any) => m.lote_id === lote.id);
    const regLAnt = regAnteriores.filter((m: any) => m.lote_id === lote.id);
    if (regLA.length === 0 && regLAnt.length === 0) {
      return { loteId: lote.id, loteNombre: lote.nombre, sinDatos: true, sublotes: sublotesLote, plagas: [], celdas: {} };
    }
    const plagasSet = new Set<string>();
    [...regLA, ...regLAnt].forEach((m: any) => plagasSet.add(m.plagas_enfermedades_catalogo?.nombre || 'Desconocida'));
    const plagasLote = Array.from(plagasSet).sort((a, b) => {
      const aI = esPlagaInteres(a); const bI = esPlagaInteres(b);
      if (aI !== bI) return aI ? -1 : 1;
      return a.localeCompare(b);
    });
    const celdas: Record<string, Record<string, any>> = {};
    plagasLote.forEach(plaga => {
      celdas[plaga] = {};
      sublotesLote.forEach(sub => {
        const vA = regLA.filter((m: any) => (m.plagas_enfermedades_catalogo?.nombre || 'Desconocida') === plaga && (m.sublotes?.nombre || 'Sin sublote') === sub).map((m: any) => Number(m.incidencia) || 0);
        const vP = regLAnt.filter((m: any) => (m.plagas_enfermedades_catalogo?.nombre || 'Desconocida') === plaga && (m.sublotes?.nombre || 'Sin sublote') === sub).map((m: any) => Number(m.incidencia) || 0);
        const actual = vA.length > 0 ? avg(vA) : null;
        const anterior = vP.length > 0 ? avg(vP) : null;
        celdas[plaga][sub] = { actual, anterior, tendencia: calcTendencia(actual, anterior) };
      });
    });
    return { loteId: lote.id, loteNombre: lote.nombre, sinDatos: false, sublotes: sublotesLote, plagas: plagasLote, celdas };
  });

  // 7. Insights
  const plagaLoteMap = new Map<string, { incidencias: number[]; plaga: string; lote: string }>();
  registros.forEach((m: any) => {
    const plaga = m.plagas_enfermedades_catalogo?.nombre || 'Desconocida';
    const lote = m.lotes?.nombre || 'Sin lote';
    const key = `${plaga}|${lote}`;
    if (!plagaLoteMap.has(key)) plagaLoteMap.set(key, { incidencias: [], plaga, lote });
    plagaLoteMap.get(key)!.incidencias.push(Number(m.incidencia) || 0);
  });
  const insights: any[] = [];
  plagaLoteMap.forEach(({ incidencias, plaga, lote }) => {
    const prom = incidencias.reduce((a: number, b: number) => a + b, 0) / incidencias.length;
    if (prom >= 30) {
      insights.push({ tipo: 'urgente', titulo: `${plaga} crítica en ${lote}`, descripcion: `Incidencia promedio de ${prom.toFixed(1)}% — requiere atención inmediata`, plaga, lote, incidenciaActual: prom, accion: 'Evaluar aplicación de tratamiento' });
    } else if (prom >= 20) {
      insights.push({ tipo: 'atencion', titulo: `${plaga} elevada en ${lote}`, descripcion: `Incidencia promedio de ${prom.toFixed(1)}% — monitorear de cerca`, plaga, lote, incidenciaActual: prom, accion: 'Monitorear de cerca' });
    }
  });

  // 8. Legacy tendencias for Gemini
  const tendenciasMap = new Map<string, Map<string, number[]>>();
  registros.forEach((m: any) => {
    const fecha = m.fecha_monitoreo;
    const plaga = m.plagas_enfermedades_catalogo?.nombre || 'Desconocida';
    if (!tendenciasMap.has(fecha)) tendenciasMap.set(fecha, new Map());
    const fm = tendenciasMap.get(fecha)!;
    if (!fm.has(plaga)) fm.set(plaga, []);
    fm.get(plaga)!.push(Number(m.incidencia) || 0);
  });
  const tendencias: any[] = [];
  tendenciasMap.forEach((plagasMap, fecha) => {
    plagasMap.forEach((incidencias, plagaNombre) => {
      tendencias.push({ fecha, plagaNombre, incidenciaPromedio: avg(incidencias) });
    });
  });

  const detalleLoteMap = new Map<string, any[]>();
  regActuales.forEach((m: any) => {
    const ln = m.lotes?.nombre || 'Sin lote';
    if (!detalleLoteMap.has(ln)) detalleLoteMap.set(ln, []);
    detalleLoteMap.get(ln)!.push({
      subloteNombre: m.sublotes?.nombre || 'Sin sublote',
      plagaNombre: m.plagas_enfermedades_catalogo?.nombre || 'Desconocida',
      incidencia: Number(m.incidencia) || 0,
      gravedad: m.gravedad_texto || 'Baja',
      arboresAfectados: Number(m.arboles_afectados) || 0,
      arboresMonitoreados: Number(m.arboles_monitoreados) || 0,
    });
  });
  const detallePorLote = Array.from(detalleLoteMap.entries())
    .map(([loteNombre, sublotes]) => ({ loteNombre, sublotes }))
    .sort((a: any, b: any) => a.loteNombre.localeCompare(b.loteNombre));

  return {
    fechaActual, fechaAnterior, avisoFechaDesactualizada,
    resumenGlobal, vistasPorLote, vistasPorSublote,
    insights: insights.sort((a: any, b: any) => (b.incidenciaActual || 0) - (a.incidenciaActual || 0)).slice(0, 5),
    tendencias, detallePorLote, fechasMonitoreo: fechasQuery,
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
    fetchDatosMonitoreo(supabase, semana),
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
