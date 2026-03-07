// chat.tsx — Edge Function para "Esco", el agente conversacional de Escocia OS
// Flujo: mensaje -> tool-calling loop (non-streaming) -> streaming respuesta final -> SSE

import { Context } from "npm:hono";

// ============================================================================
// TIPOS
// ============================================================================

interface ChatRequest {
  conversation_id?: string;
  message: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ============================================================================
// SUPABASE ADMIN CLIENT
// ============================================================================

function getAdminHeaders() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return {
    url,
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  };
}

async function supabaseQuery(table: string, query: string): Promise<unknown[]> {
  const { url, headers } = getAdminHeaders();
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) {
    console.error(`Query error on ${table}:`, res.status, await res.text().catch(() => ''));
    return [];
  }
  return await res.json();
}

async function supabaseInsert(table: string, data: Record<string, unknown>): Promise<unknown> {
  const { url, headers } = getAdminHeaders();
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error(`Insert error on ${table}:`, res.status, err);
    throw new Error(`Insert failed: ${err}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

// ============================================================================
// AUTH HELPER
// ============================================================================

async function authenticateUser(c: Context): Promise<{ userId: string } | Response> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'No autorizado' }, 401);
  }

  const token = authHeader.slice(7);
  const { url, headers } = getAdminHeaders();

  // Verify JWT via Supabase auth
  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: { ...headers, 'Authorization': `Bearer ${token}` },
  });

  if (!userRes.ok) {
    return c.json({ error: 'Token invalido' }, 401);
  }

  const userData = await userRes.json();
  const userId = userData.id;

  // Check Gerencia role
  const usuarios = await supabaseQuery('usuarios', `select=rol&id=eq.${userId}`);
  const user = (usuarios as Array<{ rol: string }>)[0];
  if (!user || user.rol !== 'Gerencia') {
    return c.json({ error: 'Acceso restringido a rol Gerencia' }, 403);
  }

  return { userId };
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const TOOLS: ToolDefinition[] = [
  {
    name: 'get_labor_summary',
    description: 'Obtiene resumen de jornales y trabajo por lote/empleado en un rango de fechas. Incluye fraccion_jornal, costo, tarea y lote.',
    parameters: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD' },
        employee_name: { type: 'string', description: 'Nombre parcial del empleado (opcional)' },
        lote_name: { type: 'string', description: 'Nombre parcial del lote (opcional)' },
      },
      required: ['date_from', 'date_to'],
    },
  },
  {
    name: 'get_employee_activity',
    description: 'Obtiene actividad de un empleado o contratista: registros de trabajo, cargo, salario, jornales.',
    parameters: {
      type: 'object',
      properties: {
        worker_name: { type: 'string', description: 'Nombre parcial del trabajador' },
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (opcional)' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional)' },
      },
      required: ['worker_name'],
    },
  },
  {
    name: 'get_monitoring_data',
    description: 'Obtiene datos de monitoreo fitosanitario: plagas, incidencia, severidad por lote.',
    parameters: {
      type: 'object',
      properties: {
        lote_name: { type: 'string', description: 'Nombre parcial del lote (opcional)' },
        pest_name: { type: 'string', description: 'Nombre parcial de la plaga (opcional)' },
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (opcional)' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional)' },
      },
    },
  },
  {
    name: 'get_application_summary',
    description: 'Obtiene resumen de aplicaciones fitosanitarias: fumigaciones, fertilizaciones, drench, estado y costos.',
    parameters: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'UUID de aplicacion especifica (opcional)' },
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (opcional)' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional)' },
        type: { type: 'string', description: 'Tipo: Fumigacion, Fertilizacion, Drench (opcional)' },
      },
    },
  },
  {
    name: 'get_inventory_status',
    description: 'Obtiene estado del inventario de productos: stock actual, minimo, categoria, estado.',
    parameters: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: 'Nombre parcial del producto (opcional)' },
        category: { type: 'string', description: 'Categoria del producto (opcional)' },
      },
    },
  },
  {
    name: 'get_financial_summary',
    description: 'Obtiene resumen financiero: gastos (solo Confirmados), ingresos o transacciones de ganado con categorias, proveedores y totales agregados. Puede filtrar por negocio (ej: Hato Lechero, Aguacate, Ganaderia). Gastos e ingresos incluyen desglose por categoria. Ganado incluye totales de compras/ventas y desglose por finca.',
    parameters: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD' },
        type: { type: 'string', description: 'gastos, ingresos, o ganado (opcional, si no se especifica retorna todo)' },
        negocio_name: { type: 'string', description: 'Nombre parcial del negocio para filtrar (ej: Hato, Aguacate, Ganaderia). Opcional.' },
        search_term: { type: 'string', description: 'Busca en el nombre/descripcion del gasto o ingreso (ej: guadana, abono, transporte). Opcional.' },
      },
      required: ['date_from', 'date_to'],
    },
  },
  {
    name: 'get_production_data',
    description: 'Obtiene datos de produccion: kilos por lote, kg/arbol, tipo de cosecha (Principal/Traviesa).',
    parameters: {
      type: 'object',
      properties: {
        lote_name: { type: 'string', description: 'Nombre parcial del lote (opcional)' },
        year: { type: 'number', description: 'Ano (opcional)' },
        cosecha_tipo: { type: 'string', description: 'Principal o Traviesa (opcional)' },
      },
    },
  },
  {
    name: 'get_harvest_shipments',
    description: 'Obtiene datos de cosechas y despachos: kilos cosechados, canastillas, despachos a clientes.',
    parameters: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (opcional)' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional)' },
        client_name: { type: 'string', description: 'Nombre parcial del cliente (opcional)' },
      },
    },
  },
  {
    name: 'get_lot_info',
    description: 'Obtiene informacion de lotes: area, arboles por tamano, sublotes, fecha siembra.',
    parameters: {
      type: 'object',
      properties: {
        lote_name: { type: 'string', description: 'Nombre parcial del lote (opcional)' },
      },
    },
  },
  {
    name: 'get_weekly_overview',
    description: 'Obtiene un resumen compuesto de la semana: labores + monitoreo + aplicaciones + cosechas.',
    parameters: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Fecha inicio (lunes) YYYY-MM-DD. Default: lunes de esta semana.' },
        date_to: { type: 'string', description: 'Fecha fin (domingo) YYYY-MM-DD. Default: domingo de esta semana.' },
      },
    },
  },
];

// ============================================================================
// TOOL EXECUTORS
// ============================================================================

const e = encodeURIComponent;

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'get_labor_summary': return await execLaborSummary(args);
      case 'get_employee_activity': return await execEmployeeActivity(args);
      case 'get_monitoring_data': return await execMonitoringData(args);
      case 'get_application_summary': return await execApplicationSummary(args);
      case 'get_inventory_status': return await execInventoryStatus(args);
      case 'get_financial_summary': return await execFinancialSummary(args);
      case 'get_production_data': return await execProductionData(args);
      case 'get_harvest_shipments': return await execHarvestShipments(args);
      case 'get_lot_info': return await execLotInfo(args);
      case 'get_weekly_overview': return await execWeeklyOverview(args);
      default: return JSON.stringify({ error: `Tool desconocido: ${name}` });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error ejecutando tool';
    return JSON.stringify({ error: msg });
  }
}

async function execLaborSummary(args: Record<string, unknown>): Promise<string> {
  const { date_from, date_to, employee_name, lote_name } = args as {
    date_from: string; date_to: string; employee_name?: string; lote_name?: string;
  };

  let query = `select=id,fecha_trabajo,fraccion_jornal,observaciones,empleado:empleados(nombre,tipo_contrato,salario,prestaciones_sociales,auxilios_no_salariales),contratista:contratistas(nombre,tarifa_jornal),tarea:tareas(nombre,tipo_tarea:tipos_tareas(nombre)),lote:lotes(nombre)&fecha_trabajo=gte.${e(date_from)}&fecha_trabajo=lte.${e(date_to)}&order=fecha_trabajo.desc`;

  const data = await supabaseQuery('registros_trabajo', query);

  // Client-side filtering for name/lote (PostgREST embedded filters are limited)
  let filtered = data as Array<Record<string, unknown>>;
  if (employee_name) {
    const en = employee_name.toLowerCase();
    filtered = filtered.filter((r) => {
      const empName = ((r.empleado as Record<string, unknown>)?.nombre as string || '').toLowerCase();
      const contName = ((r.contratista as Record<string, unknown>)?.nombre as string || '').toLowerCase();
      return empName.includes(en) || contName.includes(en);
    });
  }
  if (lote_name) {
    const ln = lote_name.toLowerCase();
    filtered = filtered.filter((r) => ((r.lote as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(ln));
  }

  // Aggregate with real cost: (salario + prestaciones + auxilios) / 22 per jornal
  const DIAS_LABORALES_MES = 22;
  let totalJornales = 0;
  let totalCosto = 0;
  const byLote: Record<string, number> = {};
  const byTarea: Record<string, number> = {};

  for (const r of filtered) {
    const fj = parseFloat(String(r.fraccion_jornal)) || 0;
    totalJornales += fj;

    const emp = r.empleado as Record<string, unknown> | null;
    const cont = r.contratista as Record<string, unknown> | null;
    if (emp) {
      const salario = (emp.salario as number) || 0;
      const prestaciones = (emp.prestaciones_sociales as number) || 0;
      const auxilios = (emp.auxilios_no_salariales as number) || 0;
      const costoJornal = (salario + prestaciones + auxilios) / DIAS_LABORALES_MES;
      totalCosto += costoJornal * fj;
    } else if (cont) {
      const tarifa = (cont.tarifa_jornal as number) || 0;
      totalCosto += tarifa * fj;
    }

    const loteName = (r.lote as Record<string, unknown>)?.nombre as string || 'Sin lote';
    const tareaName = (r.tarea as Record<string, unknown>)?.nombre as string || 'Sin tarea';
    byLote[loteName] = (byLote[loteName] || 0) + fj;
    byTarea[tareaName] = (byTarea[tareaName] || 0) + fj;
  }

  const costoPromedioJornal = totalJornales > 0 ? Math.round(totalCosto / totalJornales) : 0;
  return JSON.stringify({
    periodo: { desde: date_from, hasta: date_to },
    total_registros: filtered.length,
    total_jornales: totalJornales,
    costo_total_mano_obra: Math.round(totalCosto),
    costo_promedio_jornal: costoPromedioJornal,
    nota_formula_costo: '(salario + prestaciones + auxilios) / 22 dias laborales por jornal de empleado; tarifa_jornal para contratistas',
    jornales_por_lote: byLote,
    jornales_por_tarea: byTarea,
    detalle: filtered.slice(0, 20),
  });
}

async function execEmployeeActivity(args: Record<string, unknown>): Promise<string> {
  const { worker_name, date_from, date_to } = args as {
    worker_name: string; date_from?: string; date_to?: string;
  };

  // Search employees
  const empleados = await supabaseQuery('empleados', `select=id,nombre,cargo,salario,tipo_contrato,activo&nombre=ilike.*${e(worker_name)}*&limit=5`);
  // Search contractors
  const contratistas = await supabaseQuery('contratistas', `select=id,nombre,tarifa_jornal,tipo_contrato&nombre=ilike.*${e(worker_name)}*&limit=5`);

  let registrosQuery = `select=fecha_trabajo,fraccion_jornal,costo_jornal,tarea:tareas(nombre),lote:lotes(nombre)&order=fecha_trabajo.desc&limit=30`;
  if (date_from) registrosQuery += `&fecha_trabajo=gte.${e(date_from)}`;
  if (date_to) registrosQuery += `&fecha_trabajo=lte.${e(date_to)}`;

  const registros: unknown[] = [];
  for (const emp of empleados as Array<Record<string, unknown>>) {
    const regs = await supabaseQuery('registros_trabajo', `${registrosQuery}&empleado_id=eq.${emp.id}`);
    registros.push({ empleado: emp, registros: regs });
  }
  for (const cont of contratistas as Array<Record<string, unknown>>) {
    const regs = await supabaseQuery('registros_trabajo', `${registrosQuery}&contratista_id=eq.${cont.id}`);
    registros.push({ contratista: cont, registros: regs });
  }

  return JSON.stringify({
    empleados_encontrados: empleados.length,
    contratistas_encontrados: contratistas.length,
    resultados: registros,
  });
}

async function execMonitoringData(args: Record<string, unknown>): Promise<string> {
  const { lote_name, pest_name, date_from, date_to } = args as {
    lote_name?: string; pest_name?: string; date_from?: string; date_to?: string;
  };

  let query = `select=id,fecha_monitoreo,incidencia,severidad,gravedad_texto,arboles_monitoreados,arboles_afectados,individuos_encontrados,notas,lote:lotes(nombre),sublote:sublotes(nombre),plaga:plagas_enfermedades_catalogo(nombre,tipo)&order=fecha_monitoreo.desc`;

  if (date_from) query += `&fecha_monitoreo=gte.${e(date_from)}`;
  if (date_to) query += `&fecha_monitoreo=lte.${e(date_to)}`;

  const data = await supabaseQuery('monitoreos', query);

  // Filter by name client-side (PostgREST embedded filters are limited)
  let filtered = data as Array<Record<string, unknown>>;
  if (lote_name) {
    const ln = lote_name.toLowerCase();
    filtered = filtered.filter((r) => ((r.lote as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(ln));
  }
  if (pest_name) {
    const pn = pest_name.toLowerCase();
    filtered = filtered.filter((r) => ((r.plaga as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(pn));
  }

  // Summary by pest
  const byPest: Record<string, { count: number; avg_incidencia: number; max_gravedad: string }> = {};
  for (const r of filtered) {
    const plagaName = (r.plaga as Record<string, unknown>)?.nombre as string || 'Desconocida';
    if (!byPest[plagaName]) byPest[plagaName] = { count: 0, avg_incidencia: 0, max_gravedad: 'Baja' };
    byPest[plagaName].count++;
    byPest[plagaName].avg_incidencia += (r.incidencia as number) || 0;
    const grav = r.gravedad_texto as string;
    if (grav === 'Alta' || (grav === 'Media' && byPest[plagaName].max_gravedad === 'Baja')) {
      byPest[plagaName].max_gravedad = grav;
    }
  }
  for (const key of Object.keys(byPest)) {
    if (byPest[key].count > 0) byPest[key].avg_incidencia /= byPest[key].count;
  }

  return JSON.stringify({
    total_registros: filtered.length,
    resumen_por_plaga: byPest,
    detalle: filtered.slice(0, 30),
  });
}

async function execApplicationSummary(args: Record<string, unknown>): Promise<string> {
  const { application_id, date_from, date_to, type } = args as {
    application_id?: string; date_from?: string; date_to?: string; type?: string;
  };

  let query = `select=id,nombre_aplicacion,tipo_aplicacion,estado,fecha_inicio_planeada,fecha_fin_planeada,fecha_cierre,blanco_biologico,costo_total,jornales_utilizados,notas&order=fecha_inicio_planeada.desc&limit=30`;

  if (application_id) query += `&id=eq.${e(application_id)}`;
  if (date_from) query += `&fecha_inicio_planeada=gte.${e(date_from)}`;
  if (date_to) query += `&fecha_inicio_planeada=lte.${e(date_to)}`;
  if (type) query += `&tipo_aplicacion=ilike.*${e(type)}*`;

  const apps = await supabaseQuery('aplicaciones', query);

  // For each app, get lots and products
  const enriched = [];
  for (const app of (apps as Array<Record<string, unknown>>).slice(0, 10)) {
    const [lotes, lotesPlan, productos, movimientos] = await Promise.all([
      supabaseQuery('aplicaciones_lotes',
        `select=lote:lotes(nombre)&aplicacion_id=eq.${app.id}`),
      supabaseQuery('aplicaciones_lotes_planificado',
        `select=lote:lotes(nombre),arboles_planificados&aplicacion_id=eq.${app.id}`),
      supabaseQuery('aplicaciones_productos',
        `select=producto:productos(nombre),dosis_por_arbol,dosis_total&aplicacion_id=eq.${app.id}`),
      supabaseQuery('movimientos_diarios',
        `select=id,fecha,canecas_aplicadas,lote:lotes(nombre)&aplicacion_id=eq.${app.id}&order=fecha.asc`),
    ]);
    enriched.push({
      ...app, lotes_asignados: lotes, lotes_planificados: lotesPlan,
      productos, movimientos_reales: movimientos,
    });
  }

  return JSON.stringify({
    total_aplicaciones: apps.length,
    aplicaciones: enriched,
  });
}

async function execInventoryStatus(args: Record<string, unknown>): Promise<string> {
  const { product_name, category } = args as { product_name?: string; category?: string };

  let query = `select=id,nombre,categoria,grupo,estado_fisico,presentacion_kg_l,cantidad_actual,stock_minimo,estado,precio_unitario,activo&activo=eq.true&order=nombre.asc&limit=50`;

  if (product_name) query += `&nombre=ilike.*${e(product_name)}*`;
  if (category) query += `&categoria=ilike.*${e(category)}*`;

  const data = await supabaseQuery('productos', query);

  const lowStock = (data as Array<Record<string, unknown>>).filter((p) => {
    const actual = (p.cantidad_actual as number) || 0;
    const minimo = (p.stock_minimo as number) || 0;
    return actual <= minimo && minimo > 0;
  });

  return JSON.stringify({
    total_productos: data.length,
    productos_stock_bajo: lowStock.length,
    alertas_stock: lowStock.map((p) => ({
      nombre: p.nombre,
      actual: p.cantidad_actual,
      minimo: p.stock_minimo,
      estado: p.estado,
    })),
    productos: data,
  });
}

async function execFinancialSummary(args: Record<string, unknown>): Promise<string> {
  const { date_from, date_to, type, negocio_name, search_term } = args as {
    date_from: string; date_to: string; type?: string; negocio_name?: string; search_term?: string;
  };

  // If negocio_name is provided, resolve the negocio IDs first
  let negocioIds: string[] = [];
  if (negocio_name) {
    const negocios = await supabaseQuery('fin_negocios',
      `select=id,nombre&nombre=ilike.*${e(negocio_name)}*`);
    negocioIds = (negocios as Array<Record<string, unknown>>).map((n) => n.id as string);
  }

  const result: Record<string, unknown> = { periodo: { desde: date_from, hasta: date_to } };
  if (negocio_name) result.negocio_filtro = negocio_name;

  if (!type || type === 'gastos') {
    let gastosQuery = `select=id,fecha,valor,nombre,estado,observaciones,categoria:fin_categorias_gastos(nombre),concepto:fin_conceptos_gastos(nombre),proveedor:fin_proveedores(nombre),negocio:fin_negocios(nombre)&estado=eq.Confirmado&fecha=gte.${e(date_from)}&fecha=lte.${e(date_to)}&order=fecha.desc`;
    if (negocioIds.length > 0) {
      gastosQuery += `&negocio_id=in.(${negocioIds.join(',')})`;
    }
    if (search_term) {
      gastosQuery += `&nombre=ilike.*${e(search_term)}*`;
    }
    const gastos = await supabaseQuery('fin_gastos', gastosQuery);

    let totalGastos = 0;
    const byCategoria: Record<string, number> = {};
    for (const g of gastos as Array<Record<string, unknown>>) {
      totalGastos += (g.valor as number) || 0;
      const cat = (g.categoria as Record<string, unknown>)?.nombre as string || 'Sin categoria';
      byCategoria[cat] = (byCategoria[cat] || 0) + ((g.valor as number) || 0);
    }
    result.gastos = { total: totalGastos, por_categoria: byCategoria, registros: gastos.length, detalle: (gastos as unknown[]).slice(0, 30) };
  }

  if (!type || type === 'ingresos') {
    let ingresosQuery = `select=id,fecha,valor,nombre,observaciones,cantidad,precio_unitario,cosecha,cliente,finca,categoria:fin_categorias_ingresos(nombre),comprador:fin_compradores(nombre),negocio:fin_negocios(nombre)&fecha=gte.${e(date_from)}&fecha=lte.${e(date_to)}&order=fecha.desc`;
    if (negocioIds.length > 0) {
      ingresosQuery += `&negocio_id=in.(${negocioIds.join(',')})`;
    }
    if (search_term) {
      ingresosQuery += `&nombre=ilike.*${e(search_term)}*`;
    }
    const ingresos = await supabaseQuery('fin_ingresos', ingresosQuery);

    let totalIngresos = 0;
    const byCategoria: Record<string, number> = {};
    for (const i of ingresos as Array<Record<string, unknown>>) {
      totalIngresos += (i.valor as number) || 0;
      const cat = (i.categoria as Record<string, unknown>)?.nombre as string || 'Sin categoria';
      byCategoria[cat] = (byCategoria[cat] || 0) + ((i.valor as number) || 0);
    }
    result.ingresos = { total: totalIngresos, por_categoria: byCategoria, registros: ingresos.length, detalle: (ingresos as unknown[]).slice(0, 30) };
  }

  if (!type || type === 'ganado') {
    const ganado = await supabaseQuery('fin_transacciones_ganado',
      `select=id,fecha,tipo,cantidad_cabezas,kilos_pagados,precio_kilo,valor_total,finca,cliente_proveedor,observaciones&fecha=gte.${e(date_from)}&fecha=lte.${e(date_to)}&order=fecha.desc`);

    let totalCompras = 0, totalVentas = 0;
    const byFinca: Record<string, { compras: number; ventas: number }> = {};
    for (const g of ganado as Array<Record<string, unknown>>) {
      const val = (g.valor_total as number) || 0;
      const tipo = g.tipo as string;
      const finca = (g.finca as string) || 'Sin finca';
      if (tipo === 'compra') totalCompras += val;
      else totalVentas += val;
      if (!byFinca[finca]) byFinca[finca] = { compras: 0, ventas: 0 };
      byFinca[finca][tipo === 'compra' ? 'compras' : 'ventas'] += val;
    }
    result.ganado = { total_compras: totalCompras, total_ventas: totalVentas, por_finca: byFinca, registros: ganado.length, detalle: ganado };
  }

  return JSON.stringify(result);
}

async function execProductionData(args: Record<string, unknown>): Promise<string> {
  const { lote_name, year, cosecha_tipo } = args as {
    lote_name?: string; year?: number; cosecha_tipo?: string;
  };

  let query = `select=id,ano,cosecha_tipo,kg_totales,arboles_registrados,kg_por_arbol,lote:lotes(nombre),sublote:sublotes(nombre)&order=ano.desc,kg_totales.desc`;

  if (year) query += `&ano=eq.${year}`;
  if (cosecha_tipo) query += `&cosecha_tipo=ilike.*${e(cosecha_tipo)}*`;

  const data = await supabaseQuery('produccion', query);

  let filtered = data as Array<Record<string, unknown>>;
  if (lote_name) {
    const ln = lote_name.toLowerCase();
    filtered = filtered.filter((r) => ((r.lote as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(ln));
  }

  let totalKg = 0;
  for (const r of filtered) totalKg += (r.kg_totales as number) || 0;

  return JSON.stringify({
    total_registros: filtered.length,
    total_kg: totalKg,
    produccion: filtered.slice(0, 30),
  });
}

async function execHarvestShipments(args: Record<string, unknown>): Promise<string> {
  const { date_from, date_to, client_name } = args as {
    date_from?: string; date_to?: string; client_name?: string;
  };

  let cosechasQuery = `select=id,fecha_cosecha,kilos_cosechados,numero_canastillas,lote:lotes(nombre),sublote:sublotes(nombre)&order=fecha_cosecha.desc`;
  if (date_from) cosechasQuery += `&fecha_cosecha=gte.${e(date_from)}`;
  if (date_to) cosechasQuery += `&fecha_cosecha=lte.${e(date_to)}`;

  let despachosQuery = `select=id,fecha_despacho,kilos_despachados,precio_por_kilo,valor_total,cliente:clientes(nombre)&order=fecha_despacho.desc`;
  if (date_from) despachosQuery += `&fecha_despacho=gte.${e(date_from)}`;
  if (date_to) despachosQuery += `&fecha_despacho=lte.${e(date_to)}`;

  const [cosechas, despachos] = await Promise.all([
    supabaseQuery('cosechas', cosechasQuery),
    supabaseQuery('despachos', despachosQuery),
  ]);

  let filteredDespachos = despachos as Array<Record<string, unknown>>;
  if (client_name) {
    const cn = client_name.toLowerCase();
    filteredDespachos = filteredDespachos.filter((d) =>
      ((d.cliente as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(cn)
    );
  }

  let totalCosechado = 0;
  for (const c of cosechas as Array<Record<string, unknown>>) totalCosechado += (c.kilos_cosechados as number) || 0;
  let totalDespachado = 0;
  for (const d of filteredDespachos) totalDespachado += (d.kilos_despachados as number) || 0;

  return JSON.stringify({
    cosechas: { total_kg: totalCosechado, registros: cosechas.length, detalle: (cosechas as unknown[]).slice(0, 30) },
    despachos: { total_kg: totalDespachado, registros: filteredDespachos.length, detalle: filteredDespachos.slice(0, 30) },
  });
}

async function execLotInfo(args: Record<string, unknown>): Promise<string> {
  const { lote_name } = args as { lote_name?: string };

  let query = `select=id,nombre,area_hectareas,arboles_grandes,arboles_medianos,arboles_pequenos,arboles_clonales,total_arboles,fecha_siembra,sublotes:sublotes(id,nombre)&order=nombre.asc&limit=20`;
  if (lote_name) query += `&nombre=ilike.*${e(lote_name)}*`;

  const data = await supabaseQuery('lotes', query);
  return JSON.stringify({ lotes: data });
}

async function execWeeklyOverview(args: Record<string, unknown>): Promise<string> {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const defaultFrom = new Date(now);
  defaultFrom.setDate(now.getDate() + mondayOffset);
  const defaultTo = new Date(defaultFrom);
  defaultTo.setDate(defaultFrom.getDate() + 6);

  const dateFrom = (args.date_from as string) || defaultFrom.toISOString().split('T')[0];
  const dateTo = (args.date_to as string) || defaultTo.toISOString().split('T')[0];

  const [labor, monitoring, applications, harvest] = await Promise.all([
    execLaborSummary({ date_from: dateFrom, date_to: dateTo }),
    execMonitoringData({ date_from: dateFrom, date_to: dateTo }),
    execApplicationSummary({ date_from: dateFrom, date_to: dateTo }),
    execHarvestShipments({ date_from: dateFrom, date_to: dateTo }),
  ]);

  return JSON.stringify({
    semana: { desde: dateFrom, hasta: dateTo },
    labores: JSON.parse(labor),
    monitoreo: JSON.parse(monitoring),
    aplicaciones: JSON.parse(applications),
    cosechas_despachos: JSON.parse(harvest),
  });
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function getSystemPrompt(): string {
  const hoy = new Date().toISOString().split('T')[0];
  return `Eres "Esco", el asistente de datos de Escocia Hass, una finca de aguacate Hass en Colombia.
Tu rol es consultar datos operativos de la finca y responder preguntas del gerente.

REGLAS:
- Responde en espanol, tono profesional pero conversacional
- Usa las herramientas para obtener datos reales — nunca inventes datos
- Si no tienes datos suficientes, dilo claramente
- Formatea cifras de dinero en COP con separadores de miles ($1.250.000)
- Usa porcentajes y comparaciones cuando sean utiles
- Si la pregunta es ambigua, pide aclaracion
- NO puedes modificar datos, solo consultarlos
- Cuando muestres tablas o listas, usa formato markdown
- Fecha actual: ${hoy}

DOMINIOS DE DATOS DISPONIBLES:
- Labores: tareas, registros de trabajo, jornales por empleado/contratista/lote
- Empleados y Contratistas: personal, cargos, salarios, tarifas
- Monitoreo: plagas/enfermedades, incidencia, severidad, tendencias por lote
- Aplicaciones: fumigaciones, fertilizaciones, drench, productos usados, costos
- Inventario: productos agricolas, stock, movimientos, compras
- Finanzas: gastos (solo Confirmados), ingresos, transacciones de ganado, categorias, busqueda por nombre
- Produccion: kilos por lote, kg/arbol, cosechas principal/traviesa
- Cosechas y Despachos: kilos cosechados, preseleccion, despachos a clientes
- Lotes: configuracion de la finca, arboles por tamano, sublotes

COSTOS DE MANO DE OBRA:
- El costo real por jornal se calcula como (salario + prestaciones_sociales + auxilios_no_salariales) / 22 dias laborales
- La herramienta de labores calcula esto automaticamente con los datos de cada empleado
- Para contratistas se usa la tarifa_jornal directamente
- Usa siempre los valores de costo_total_mano_obra y costo_promedio_jornal que retorna la herramienta, no inventes costos`;
}

// ============================================================================
// OPENROUTER LLM CALLS
// ============================================================================

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-3.1-flash-lite-preview';

function getOpenRouterHeaders(): Record<string, string> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no configurada');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
}

// Convert our tools to OpenAI function-calling format
function getToolsForAPI() {
  return TOOLS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// Non-streaming call for tool-calling loop
async function llmToolLoop(messages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string }>): Promise<string> {
  const headers = getOpenRouterHeaders();
  const tools = getToolsForAPI();
  const maxRounds = 3;

  for (let round = 0; round < maxRounds; round++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45_000);

    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools,
          tool_choice: 'auto',
          temperature: 0.3,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Timeout en la llamada al LLM');
      }
      throw err;
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('OpenRouter error:', response.status, errText.slice(0, 500));
      throw new Error(`Error OpenRouter: ${response.status}`);
    }

    const result = await response.json();
    const choice = result.choices?.[0];
    if (!choice) throw new Error('Sin respuesta del LLM');

    const msg = choice.message;

    // If the model wants to call tools
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // Add assistant message with tool calls
      messages.push(msg);

      // Execute each tool call
      for (const tc of msg.tool_calls) {
        const fnName = tc.function?.name;
        let fnArgs: Record<string, unknown> = {};
        try {
          fnArgs = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          fnArgs = {};
        }

        console.log(`[Esco] Tool call: ${fnName}`, JSON.stringify(fnArgs).slice(0, 200));
        const toolResult = await executeTool(fnName, fnArgs);
        console.log(`[Esco] Tool result length: ${toolResult.length}`);

        messages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: tc.id,
          name: fnName,
        });
      }

      continue; // next round
    }

    // No tool calls — return the final text
    return msg.content || '';
  }

  // Fallback: do a final call without tools to force a text response
  const finalRes = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!finalRes.ok) throw new Error('Error en respuesta final del LLM');
  const finalResult = await finalRes.json();
  return finalResult.choices?.[0]?.message?.content || 'No pude generar una respuesta.';
}

// Auto-generate title
async function generateTitle(userMessage: string): Promise<string> {
  try {
    const headers = getOpenRouterHeaders();
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'Genera un titulo corto (max 6 palabras, en espanol) para esta conversacion sobre una finca de aguacate. Solo responde con el titulo, sin comillas ni puntuacion final.' },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.5,
        max_tokens: 30,
      }),
    });
    if (!res.ok) return 'Nueva conversacion';
    const result = await res.json();
    return result.choices?.[0]?.message?.content?.trim() || 'Nueva conversacion';
  } catch {
    return 'Nueva conversacion';
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleChatMessage(c: Context) {
  // Auth
  const authResult = await authenticateUser(c);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  // Parse body
  let body: ChatRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Body invalido' }, 400);
  }

  const { message } = body;
  if (!message?.trim()) {
    return c.json({ error: 'Mensaje vacio' }, 400);
  }

  let conversationId = body.conversation_id;
  let isNew = false;

  // Create conversation if needed
  if (!conversationId) {
    const conv = await supabaseInsert('chat_conversations', {
      user_id: userId,
      title: null,
    }) as { id: string };
    conversationId = conv.id;
    isNew = true;
  }

  // Save user message
  await supabaseInsert('chat_messages', {
    conversation_id: conversationId,
    role: 'user',
    content: message.trim(),
  });

  // Load history (last 20 messages)
  const history = await supabaseQuery('chat_messages',
    `select=role,content&conversation_id=eq.${conversationId}&order=created_at.asc&limit=20`
  ) as Array<{ role: string; content: string }>;

  // Build messages for LLM
  const llmMessages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string }> = [
    { role: 'system', content: getSystemPrompt() },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  // SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // Tool-calling loop (non-streaming) then stream the final answer
        const finalText = await llmToolLoop(llmMessages);

        // Stream the final text character by character in chunks
        const chunkSize = 8;
        for (let i = 0; i < finalText.length; i += chunkSize) {
          const chunk = finalText.slice(i, i + chunkSize);
          send({ type: 'text_delta', content: chunk });
          // Small delay for streaming effect
          await new Promise((r) => setTimeout(r, 15));
        }

        // Save assistant message
        await supabaseInsert('chat_messages', {
          conversation_id: conversationId,
          role: 'assistant',
          content: finalText,
        });

        // Auto-title for new conversations
        let title: string | undefined;
        if (isNew) {
          title = await generateTitle(message);
          const { url, headers } = getAdminHeaders();
          await fetch(`${url}/rest/v1/chat_conversations?id=eq.${conversationId}`, {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ title }),
          });
        }

        send({
          type: 'done',
          conversation_id: conversationId,
          ...(title ? { title } : {}),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error interno';
        console.error('[Esco] Error:', msg);
        send({ type: 'error', message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
