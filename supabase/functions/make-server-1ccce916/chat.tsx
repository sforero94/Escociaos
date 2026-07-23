// chat.tsx — Edge Function para "Esco", el agente conversacional de Escocia OS
// Flujo: mensaje -> tool-calling loop (non-streaming) -> streaming respuesta final -> SSE

import { Context } from "npm:hono";
import {
  aggregateInsumosPorLote,
  aggregateJornalesPorLote,
  combineCostosPorLote,
  summariseCostos,
} from './cost-aggregation.ts';
import {
  parseTavilyResponse,
  parseOpenWeatherForecast,
} from './external-tools.ts';
import {
  makeMemoryProposal,
  renderMemoriasBlock,
  type PersistedMemory,
} from './memory.ts';
import { buildRadiationContext } from './radiation-context.ts';
import {
  buildGanadoInventorySummary,
  renderMovimientosRecientes,
  type GanUbicacionRow,
  type GanFincaRow,
  type GanPotreroRow,
  type GanInventarioRow,
  type GanMovimientoRow,
} from './ganado-inventario.ts';
import {
  priorizarMonitoreo,
  type HistorialSublotePlaga,
  type UmbralEconomico,
  type PerfilEstacional,
  type EventoFumigacion,
} from './priorizacion-scouting.ts';
import {
  construirPeriodos,
  construirResumenPyG,
  construirResumenFlujoCaja,
  type DatosReportes,
  type GanadoRow,
  type GastoRow,
  type IngresoRow,
  type ModoReporte,
  type VistaReporte,
} from './reportes-financieros.ts';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from './hato-config-desde-tabla.ts';
import type { HatoConfig } from './calculos-hato.ts';
import {
  shapeAnimalMatches,
  buildAnimalFicha,
  buildReproduccionSummary,
  buildProduccionSummary,
  type HatoAnimalRow,
  type HatoToroRow,
  type HatoEventoRow,
  type HatoEstadoActualRow,
  type HatoChequeoVacaDetalleRow,
  type HatoPesajeRow,
  type HatoProduccionQuincenalRow,
} from './hato-aggregation.ts';

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

interface ToolInteraction {
  tool: string;
  args: Record<string, unknown>;
  result_summary: string;
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
    const errText = await res.text().catch(() => '');
    console.error(`[Esco] Query error on ${table}:`, res.status, errText);
    throw new Error(`Query failed on ${table} (${res.status}): ${errText.slice(0, 200)}`);
  }
  return await res.json();
}

/**
 * Igual que supabaseQuery pero paginando hasta traer todo.
 *
 * PostgREST corta en 1.000 filas por defecto y NO avisa. `fin_gastos` tiene
 * ~1.250 filas por año y los reportes financieros leen dos años, así que una
 * consulta sin paginar devolvería un P&G incompleto que se ve normal.
 */
async function supabaseQueryAll(table: string, query: string): Promise<unknown[]> {
  const PAGINA = 1000;
  const MAX_PAGINAS = 20;
  const filas: unknown[] = [];

  for (let p = 0; p < MAX_PAGINAS; p += 1) {
    const pagina = await supabaseQuery(table, `${query}&limit=${PAGINA}&offset=${p * PAGINA}`);
    filas.push(...pagina);
    if (pagina.length < PAGINA) return filas;
  }
  console.warn(`[Esco] supabaseQueryAll llegó al tope de páginas en ${table}`);
  return filas;
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
    description: 'Lista y desglosa movimientos financieros: gastos (solo Confirmados), ingresos o transacciones de ganado con categorias, proveedores y totales agregados. Puede filtrar por negocio (ej: Hato Lechero, Aguacate, Ganaderia). Gastos e ingresos incluyen desglose por categoria. Ganado incluye totales de compras/ventas y desglose por finca. NO uses este tool para calcular utilidad, margen ni rentabilidad: aqui la compra de ganado aparece como salida de dinero y no como inventario, asi que restar ingresos menos gastos da un resultado que CONTRADICE al P&G oficial. Para "cuanto gano/perdio", margen, utilidad, costo por kilo/litro o flujo de caja usa get_pyg_flujo_caja.',
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
    name: 'get_purchase_history',
    description: 'Obtiene historial de compras de productos: ordenes, proveedores, productos, cantidades y costos.',
    parameters: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (opcional)' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional)' },
        product_name: { type: 'string', description: 'Nombre parcial del producto (opcional)' },
        proveedor: { type: 'string', description: 'Nombre parcial del proveedor (opcional)' },
      },
    },
  },
  {
    name: 'get_inventory_movements',
    description: 'Obtiene movimientos de inventario (entradas/salidas) y resultados de verificaciones fisicas. Permite detectar discrepancias.',
    parameters: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: 'Nombre parcial del producto (opcional)' },
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (opcional)' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional)' },
        tipo: { type: 'string', description: 'Tipo: Entrada, Salida por Aplicación, Salida Otros, Ajuste (opcional)' },
      },
    },
  },
  {
    name: 'get_application_details',
    description: 'Obtiene datos detallados de una aplicacion especifica: cierre con costos reales, calculos por lote, y focos de plagas detectados.',
    parameters: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'UUID de la aplicacion (requerido)' },
      },
      required: ['application_id'],
    },
  },
  {
    name: 'get_application_cost_by_lote',
    description: 'Costo real de una aplicacion desglosado por lote: insumos (productos x precio_unitario), mano de obra (registros_trabajo) y costo por arbol. Usar cuando preguntan costo de aplicacion X por lote o por arbol.',
    parameters: {
      type: 'object',
      properties: {
        application_id: { type: 'string', description: 'UUID de la aplicacion (opcional si se pasa application_name)' },
        application_name: { type: 'string', description: 'Nombre parcial de la aplicacion (opcional si se pasa application_id)' },
      },
    },
  },
  {
    name: 'get_cost_by_lote',
    description: 'Costo agregado por lote sumando todas las aplicaciones en el rango de fechas. Usar para comparar lotes y responder cual lote es mas caro de mantener.',
    parameters: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD' },
      },
      required: ['date_from', 'date_to'],
    },
  },
  {
    name: 'web_search_agronomic',
    description: 'Busca informacion agronomica externa (compatibilidad de productos, dosis recomendadas, sintomas de plagas/enfermedades, umbrales economicos, regulacion ICA) y devuelve respuesta + fuentes citables. Usar SIEMPRE para preguntas fitosanitarias o de manejo agronomico que NO son datos de la finca, en vez de responder de memoria.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Consulta en lenguaje natural (espanol o ingles)' },
        max_results: { type: 'number', description: 'Numero maximo de fuentes (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_weather_forecast',
    description: 'Pronostico del clima para los proximos 5-7 dias en la finca: temperatura min/max, lluvia (mm + probabilidad), viento, humedad. Para decidir ventanas de aplicacion y planificacion operativa.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Cantidad de dias a pronosticar (1-7, default 5)' },
      },
    },
  },
  {
    name: 'propose_memory_save',
    description: 'Propone guardar una memoria de largo plazo cuando el usuario lo pide explicitamente ("guarda esto", "recuerda que...", "esto para luego"). NO inserta directamente: devuelve un payload para que el cliente (Telegram/web) muestre botones de confirmacion. Llama a esta herramienta SOLO cuando el usuario pida guardar, nunca por iniciativa propia.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Resumen breve y autocontenido de lo que se quiere guardar (≤500 caracteres)' },
        reason: { type: 'string', description: 'Una linea explicando por que vale la pena recordar esto' },
      },
      required: ['content'],
    },
  },
  {
    name: 'commit_memory_save',
    description: 'Confirma e inserta una memoria propuesta previamente. Solo se llama tras la aprobacion del usuario en el cliente; el cliente provee el token recibido en propose_memory_save.',
    parameters: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token unico devuelto por propose_memory_save' },
        final_content: { type: 'string', description: 'Contenido final (puede haber sido editado por el usuario)' },
      },
      required: ['token'],
    },
  },
  {
    name: 'forget_memory',
    description: 'Archiva (soft-delete) una memoria existente cuando el usuario dice "olvida X" o "elimina la memoria de Y". Pasa memory_id si lo conoces (lo ves en MEMORIAS GUARDADAS) o match_text para buscar por substring.',
    parameters: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'UUID de la memoria a archivar' },
        match_text: { type: 'string', description: 'Substring para encontrar la memoria si no conoces el ID' },
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
  {
    name: 'get_climate_data',
    description: 'Datos climáticos de la estación meteorológica Weather Underground (ISANFR102): temperatura, humedad, precipitación acumulada, viento (velocidad/ráfaga/dirección), radiación solar, índice UV. Soporta condiciones actuales, resúmenes por período, y datos históricos.',
    parameters: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (opcional, default: últimos 7 días)' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional, default: hoy)' },
        metric: { type: 'string', description: 'Métrica específica: temperatura, lluvia, humedad, viento, radiacion, uv (opcional, retorna resumen completo si no se especifica)' },
      },
    },
  },
  {
    name: 'get_radiation_context',
    description: 'Contexto agronómico de radiación solar: convierte W/m² a horas-sol equivalentes/día con bandas de estado (Crítico bajo <3.5h, Bajo 3.5-5h, Óptimo 5-7h, Alto 7-8.5h, Excesivo >8.5h) para aguacate Hass a 2200m. Incluye comparativo vs periodo anterior y conteo de días fuera del rango óptimo.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', '7d', '30d', '90d', 'ytd'], description: 'Periodo a analizar (default: 7d)' },
      },
    },
  },
  {
    name: 'get_conductivity_data',
    description: 'Obtiene datos de conductividad eléctrica (CE) del suelo por lote: promedios, pH, estado semáforo (verde <0.5, amarillo 0.5-1.5, rojo >1.5 dS/m), y tendencia mensual de la CE por lote. Útil para relacionar la evolución de la CE con las fertilizaciones (cruzar con get_application_summary type=Fertilizacion).',
    parameters: {
      type: 'object',
      properties: {
        lote_name: { type: 'string', description: 'Nombre parcial del lote (opcional)' },
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (opcional)' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional)' },
      },
    },
  },
  {
    name: 'get_beehive_data',
    description: 'Obtiene estado de salud de colmenas por apiario: fuertes, débiles, muertas, con reina. También lista apiarios configurados con ubicación y total de colmenas.',
    parameters: {
      type: 'object',
      properties: {
        apiario_name: { type: 'string', description: 'Nombre parcial del apiario (opcional)' },
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (opcional)' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional)' },
        include_config: { type: 'boolean', description: 'Incluir lista de apiarios configurados (default true)' },
      },
    },
  },
  {
    name: 'get_budget_data',
    description: 'Obtiene datos de presupuesto (budget): montos anuales asignados por concepto de gasto y su ejecucion real. Compara presupuesto vs gasto real para control presupuestal. Puede filtrar por negocio (default Aguacate Hass), año, y trimestres específicos. Retorna: presupuesto anual por concepto, gasto real ejecutado, porcentaje de ejecución, y comparativo con año anterior.',
    parameters: {
      type: 'object',
      properties: {
        anio: { type: 'number', description: 'Año del presupuesto (default: año actual)' },
        quarters: { type: 'string', description: 'Trimestres a consultar separados por coma, ej: "1,2" para Q1+Q2. Default: trimestre actual.' },
        negocio_name: { type: 'string', description: 'Nombre parcial del negocio (default: Aguacate Hass). Opcional.' },
        categoria_name: { type: 'string', description: 'Nombre parcial de categoria para filtrar (ej: Fertilizantes, Mano de Obra). Opcional.' },
      },
    },
  },
  {
    name: 'get_ganado_inventory',
    description: 'Inventario VIVO de ganado de CEBA (gan_*, cabezas de novillos/toros por ubicación → finca → potrero): cabezas actuales, cabezas por hectárea, peso promedio, variación de los últimos 30 días (entradas vs salidas) y movimientos pendientes de confirmar desde finanzas. Opcionalmente lista los movimientos recientes (compras, ventas, muertes, traslados, ajustes). NO incluye el Hato Lechero (animales individuales de ordeño) — para eso usa get_hato_reproduccion (panorama del hato) o get_hato_animal (una vaca puntual). Para el dinero de compras/ventas de ganado de ceba usa get_financial_summary con type=ganado; este tool es para el conteo físico.',
    parameters: {
      type: 'object',
      properties: {
        ubicacion_name: { type: 'string', description: 'Nombre parcial de la ubicación (San Francisco, Supata, Subachoque). Opcional.' },
        finca_name: { type: 'string', description: 'Nombre parcial de la finca. Opcional.' },
        include_movimientos: { type: 'boolean', description: 'Incluir lista de movimientos confirmados recientes (default false)' },
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD para los movimientos (default: hace 30 días)' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD para los movimientos (opcional)' },
      },
    },
  },
  {
    name: 'get_pyg_flujo_caja',
    description: 'Estado de resultados (P&G) y flujo de caja por negocio, con las MISMAS reglas contables que la pantalla /finanzas/reportes. Usar SIEMPRE para preguntas de rentabilidad, utilidad, margen, "cuánto ganó/perdió un negocio", costo por kilo/litro, margen por cabeza, o movimiento de caja mes a mes. El P&G trae: Ingresos → Costos directos → Margen de contribución → Gastos indirectos → Utilidad operativa, en columnas acumuladas (Q1, Q1-Q2, Q1-Q3, Año) o por cosecha (solo aguacate). Reglas clave: solo gastos Confirmados; la COMPRA de ganado NO es gasto (es inventario) y solo el costo de las cabezas vendidas entra al P&G; en el flujo de caja esa compra SÍ es salida. Prefiere este tool sobre get_financial_summary cuando la pregunta sea de resultado o rentabilidad; get_financial_summary sirve para listar gastos/ingresos por categoría o proveedor, no para calcular utilidad.',
    parameters: {
      type: 'object',
      properties: {
        vista: {
          type: 'string',
          description: 'Negocio: global (todos, incluye Oficina Central y Caballos), aguacate, ganado, hato. Default: global',
        },
        anio: { type: 'number', description: 'Año del reporte. Default: año en curso' },
        modo: {
          type: 'string',
          description: 'trimestres (acumulados Q1/Q1-Q2/Q1-Q3/Año) o cosecha (Principal/Traviesa, SOLO aguacate). Default: trimestres',
        },
        incluir_flujo_caja: {
          type: 'boolean',
          description: 'Incluir el flujo de caja mensual de 12 meses además del P&G. Default false',
        },
      },
    },
  },
  {
    name: 'get_hato_animal',
    description: 'Ficha de UN animal del Hato Lechero (vacas/terneras/novillas individuales, distinto del conteo de cabezas de ganado de get_ganado_inventory): raza, etapa, estado, fecha de nacimiento, genealogía (madre + padre, sea toro del catálogo o animal propio), estado reproductivo actual (servida/preñada/próxima a secar/seca/parida reciente/vacía por servir, con fecha probable de parto y fecha de secado si aplica), últimos eventos del ciclo (servicios, celos, partos, secados) y los valores del último chequeo veterinario. Busca por número de chapeta (numero) o por nombre parcial. Si el nombre coincide con varios animales, devuelve la lista para que el usuario precise en vez de adivinar. Números de chapeta entre 800 y 999 son NUMEROS DE TRABAJO provisionales (colisiones sin resolver o ventas inferidas de la importación histórica), NUNCA una caravana física — la ficha lo marca explícito con numero_es_provisional.',
    parameters: {
      type: 'object',
      properties: {
        numero: { type: 'number', description: 'Número de chapeta exacto del animal (opcional si se da nombre)' },
        nombre: { type: 'string', description: 'Nombre parcial del animal, case-insensitive (opcional si se da numero)' },
      },
    },
  },
  {
    name: 'get_hato_reproduccion',
    description: 'Panorama reproductivo del Hato Lechero completo: conteo de animales por las 3 categorías del hato (terneras/novillas, hato en ordeño, horro = vacas secas o próximas a secar esperando el parto), conteo por estado reproductivo detallado, cuántas alertas de secado/rechequeo/servicio-sin-confirmar/parto-próximo están activas HOY, listas ordenadas de próximos partos y próximas a secar (con días restantes), vacas próximas a reemplazo (cerca del umbral de partos) y vacas vacías marcadas como "problema" (necesitan rechequeo, no es normal que sigan vacías). Todos los umbrales salen de hato_config, nunca son fijos. Usar para "cómo va el hato", "cuántas vacas están próximas a parir/secar", "cuántas vacas necesitan atención". Para UN animal puntual usa get_hato_animal.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_hato_produccion',
    description: 'Producción de leche del Hato Lechero: pesaje SEMANAL por vaca individual (litros/vaca, productividad por animal) y producción QUINCENAL en litros vendidos al camión del Pomar (volumen de venta, con conciliación contra la confirmación del Pomar cuando existe). Son dos series DISTINTAS que nunca se mezclan: el pesaje mide productividad individual, la quincenal mide venta del hato completo. Una vaca sin pesaje en el rango simplemente no aparece en la lista — nunca se reporta con 0 litros (ausencia de dato, no "no produjo"). KPI litros/vaca = litros_total de la quincena ÷ num_vacas_ordeño. Para el DINERO de la venta de leche usa get_financial_summary o get_pyg_flujo_caja (negocio Hato Lechero); este tool es solo volumen físico.',
    parameters: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD para los pesajes semanales (default: hace 90 días)' },
        date_to: { type: 'string', description: 'Fecha fin YYYY-MM-DD para los pesajes semanales (default: hoy)' },
        animal_numero: { type: 'number', description: 'Filtra los pesajes semanales a un solo animal por número de chapeta (opcional)' },
        num_quincenas: { type: 'number', description: 'Cuántas quincenas recientes de producción traer, ordenadas de más reciente a más antigua (default 6)' },
      },
    },
  },
  {
    name: 'get_tareas',
    description: 'Obtiene las tareas/labores del tablero Kanban de labores (planeadas y en ejecución): estado (Banco, Programada, En Proceso, Completada, Cancelada), prioridad (Alta/Media/Baja), categoría, lote, responsable, jornales estimados y fechas estimadas/reales. Usar para "qué tareas hay pendientes/programadas/en proceso", "labores por lote", "carga de trabajo planificada". Distinto de get_labor_summary, que reporta jornales YA ejecutados (registros_trabajo).',
    parameters: {
      type: 'object',
      properties: {
        estado: { type: 'string', description: 'Filtra por estado: Banco, Programada, En Proceso, Completada, Cancelada (opcional)' },
        lote_name: { type: 'string', description: 'Nombre parcial del lote (opcional)' },
        categoria: { type: 'string', description: 'Categoría de la tarea (ej: Cosecha, Fertilización y Enmiendas, Monitoreo) (opcional)' },
        date_from: { type: 'string', description: 'Fecha estimada de inicio desde YYYY-MM-DD (opcional)' },
        date_to: { type: 'string', description: 'Fecha estimada de inicio hasta YYYY-MM-DD (opcional)' },
      },
    },
  },
  {
    name: 'get_weekly_reports',
    description: 'Obtiene el historial de reportes semanales generados (archivo): número de semana, año, rango de fechas, si fue automático o manual, y la URL del PDF si existe. Para consultar reportes ya generados. Para un resumen en vivo de la semana usa get_weekly_overview.',
    parameters: {
      type: 'object',
      properties: {
        anio: { type: 'number', description: 'Año del reporte (opcional)' },
        numero_semana: { type: 'number', description: 'Número de semana ISO (opcional)' },
        limit: { type: 'number', description: 'Máximo de reportes a retornar (default 12)' },
      },
    },
  },
  {
    name: 'get_pest_risk_priorizacion',
    description: 'Obtiene el ranking de prioridad de monitoreo por lote/sublote x plaga: cuales combinaciones ameritan revision esta semana y por que (umbral economico Cartama superado, tendencia, estacionalidad historica). Distingue plagas con umbral economico validado de las que usan un nivel estadistico de referencia (tercil historico). NO es lo mismo que web_search_agronomic (esa busca informacion externa; esta usa el ranking en vivo de ESTA finca).',
    parameters: {
      type: 'object',
      properties: {
        lote_name: { type: 'string', description: 'Nombre parcial del lote o sublote para filtrar (opcional)' },
        pest_name: { type: 'string', description: 'Nombre parcial de la plaga para filtrar (opcional)' },
        top_n: { type: 'number', description: 'Cuantas entradas devolver, ordenadas por prioridad (default 10)' },
      },
    },
  },
];

// ============================================================================
// TOOL EXECUTORS
// ============================================================================

const e = encodeURIComponent;

function validateDates(args: Record<string, unknown>): { date_from?: string; date_to?: string } {
  let { date_from, date_to } = args as { date_from?: string; date_to?: string };

  const clampDate = (d: string): string => {
    const parts = d.split('-').map(Number);
    const [y, m, day] = parts;
    if (!y || !m || !day) return d;
    const lastDay = new Date(y, m, 0).getDate();
    if (day > lastDay) {
      return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
    return d;
  };

  if (date_from) date_from = clampDate(date_from);
  if (date_to) date_to = clampDate(date_to);
  if (date_from && date_to && date_from > date_to) {
    [date_from, date_to] = [date_to, date_from];
  }

  return { date_from, date_to };
}

async function executeTool(name: string, args: Record<string, unknown>, userId?: string): Promise<string> {
  try {
    let result: string;
    switch (name) {
      case 'get_labor_summary': result = await execLaborSummary(args); break;
      case 'get_employee_activity': result = await execEmployeeActivity(args); break;
      case 'get_monitoring_data': result = await execMonitoringData(args); break;
      case 'get_application_summary': result = await execApplicationSummary(args); break;
      case 'get_inventory_status': result = await execInventoryStatus(args); break;
      case 'get_financial_summary': result = await execFinancialSummary(args); break;
      case 'get_production_data': result = await execProductionData(args); break;
      case 'get_harvest_shipments': result = await execHarvestShipments(args); break;
      case 'get_lot_info': result = await execLotInfo(args); break;
      case 'get_purchase_history': result = await execPurchaseHistory(args); break;
      case 'get_inventory_movements': result = await execInventoryMovements(args); break;
      case 'get_application_details': result = await execApplicationDetails(args); break;
      case 'get_application_cost_by_lote': result = await execApplicationCostByLote(args); break;
      case 'get_cost_by_lote': result = await execCostByLote(args); break;
      case 'web_search_agronomic': result = await execWebSearchAgronomic(args); break;
      case 'get_weather_forecast': result = await execWeatherForecast(args); break;
      case 'propose_memory_save': result = await execProposeMemorySave(args); break;
      case 'commit_memory_save': result = await execCommitMemorySave(args, userId); break;
      case 'forget_memory': result = await execForgetMemory(args, userId); break;
      case 'get_weekly_overview': result = await execWeeklyOverview(args); break;
      case 'get_climate_data': result = await execClimateData(args); break;
      case 'get_radiation_context': result = await execRadiationContext(args); break;
      case 'get_conductivity_data': result = await execConductivityData(args); break;
      case 'get_beehive_data': result = await execBeehiveData(args); break;
      case 'get_budget_data': result = await execBudgetData(args); break;
      case 'get_ganado_inventory': result = await execGanadoInventory(args); break;
      case 'get_pyg_flujo_caja': result = await execPygFlujoCaja(args); break;
      case 'get_hato_animal': result = await execHatoAnimal(args); break;
      case 'get_hato_reproduccion': result = await execHatoReproduccion(args); break;
      case 'get_hato_produccion': result = await execHatoProduccion(args); break;
      case 'get_tareas': result = await execTareas(args); break;
      case 'get_weekly_reports': result = await execWeeklyReports(args); break;
      case 'get_pest_risk_priorizacion': result = await execPestPriorizacion(args); break;
      default: return JSON.stringify({ error: `Tool desconocido: ${name}` });
    }

    // Add diagnostic info when no results found
    try {
      const parsed = JSON.parse(result);
      if (parsed.total_registros === 0) {
        parsed._parametros_usados = args;
        parsed._sugerencia = 'Verificar rango de fechas y ortografía de nombres. Intenta ampliar el rango o usar nombres parciales.';
        return JSON.stringify(parsed);
      }
    } catch { /* not JSON or parse error, return as-is */ }

    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error ejecutando tool';
    return JSON.stringify({ error: msg });
  }
}

async function execLaborSummary(args: Record<string, unknown>): Promise<string> {
  const validated = validateDates(args);
  const { date_from, date_to } = validated as { date_from: string; date_to: string };
  const { employee_name, lote_name } = args as { employee_name?: string; lote_name?: string };

  let query = `select=id,fecha_trabajo,fraccion_jornal,observaciones,empleado:empleados(nombre,tipo_contrato,salario,prestaciones_sociales,auxilios_no_salariales),contratista:contratistas(nombre,tarifa_jornal),tarea:tareas(nombre,tipo_tarea:tipos_tareas(nombre)),lote:lotes(nombre)&fecha_trabajo=gte.${e(date_from)}&fecha_trabajo=lte.${e(date_to)}&order=fecha_trabajo.desc&limit=2000`;

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
  const porMes: Record<string, { jornales: number; costo: number }> = {};
  const porEmpleado: Record<string, { jornales: number; costo: number }> = {};

  for (const r of filtered) {
    const fj = parseFloat(String(r.fraccion_jornal)) || 0;
    totalJornales += fj;

    const emp = r.empleado as Record<string, unknown> | null;
    const cont = r.contratista as Record<string, unknown> | null;
    let costoRegistro = 0;
    let workerName = 'Desconocido';
    if (emp) {
      const salario = (emp.salario as number) || 0;
      const prestaciones = (emp.prestaciones_sociales as number) || 0;
      const auxilios = (emp.auxilios_no_salariales as number) || 0;
      const costoJornal = (salario + prestaciones + auxilios) / DIAS_LABORALES_MES;
      costoRegistro = costoJornal * fj;
      workerName = (emp.nombre as string) || 'Desconocido';
    } else if (cont) {
      const tarifa = (cont.tarifa_jornal as number) || 0;
      costoRegistro = tarifa * fj;
      workerName = (cont.nombre as string) || 'Desconocido';
    }
    totalCosto += costoRegistro;

    const loteName = (r.lote as Record<string, unknown>)?.nombre as string || 'Sin lote';
    const tareaName = (r.tarea as Record<string, unknown>)?.nombre as string || 'Sin tarea';
    byLote[loteName] = (byLote[loteName] || 0) + fj;
    byTarea[tareaName] = (byTarea[tareaName] || 0) + fj;

    // por_mes
    const fecha = (r.fecha_trabajo as string) || '';
    const mes = fecha.slice(0, 7);
    if (mes) {
      if (!porMes[mes]) porMes[mes] = { jornales: 0, costo: 0 };
      porMes[mes].jornales += fj;
      porMes[mes].costo += costoRegistro;
    }

    // por_empleado
    if (!porEmpleado[workerName]) porEmpleado[workerName] = { jornales: 0, costo: 0 };
    porEmpleado[workerName].jornales += fj;
    porEmpleado[workerName].costo += costoRegistro;
  }

  // Round por_mes costs
  for (const key of Object.keys(porMes)) {
    porMes[key].costo = Math.round(porMes[key].costo);
  }

  // Top 15 employees by jornales
  const porEmpleadoTop = Object.entries(porEmpleado)
    .sort((a, b) => b[1].jornales - a[1].jornales)
    .slice(0, 15)
    .reduce((acc, [name, data]) => {
      acc[name] = { jornales: data.jornales, costo: Math.round(data.costo) };
      return acc;
    }, {} as Record<string, { jornales: number; costo: number }>);

  const costoPromedioJornal = totalJornales > 0 ? Math.round(totalCosto / totalJornales) : 0;
  const result: Record<string, unknown> = {
    periodo: { desde: date_from, hasta: date_to },
    total_registros: filtered.length,
    total_jornales: totalJornales,
    costo_total_mano_obra: Math.round(totalCosto),
    costo_promedio_jornal: costoPromedioJornal,
    nota_formula_costo: '(salario + prestaciones + auxilios) / 22 dias laborales por jornal de empleado; tarifa_jornal para contratistas',
    jornales_por_lote: byLote,
    jornales_por_tarea: byTarea,
    por_mes: porMes,
    por_empleado: porEmpleadoTop,
    detalle: filtered.slice(0, 20),
  };

  if ((data as unknown[]).length === 2000) {
    result.advertencia = 'Resultado limitado a 2000 registros. Los totales pueden ser parciales para períodos largos.';
  }

  return JSON.stringify(result);
}

function computeWorkerSummary(regs: Array<Record<string, unknown>>) {
  let totalJornales = 0;
  let totalCostoJornal = 0;
  const jornalesPorTarea: Record<string, number> = {};
  const jornalesPorLote: Record<string, number> = {};
  for (const r of regs) {
    const fj = parseFloat(String(r.fraccion_jornal)) || 0;
    const cj = parseFloat(String(r.costo_jornal)) || 0;
    totalJornales += fj;
    totalCostoJornal += cj;
    const tarea = (r.tarea as Record<string, unknown>)?.nombre as string || 'Sin tarea';
    const lote = (r.lote as Record<string, unknown>)?.nombre as string || 'Sin lote';
    jornalesPorTarea[tarea] = (jornalesPorTarea[tarea] || 0) + fj;
    jornalesPorLote[lote] = (jornalesPorLote[lote] || 0) + fj;
  }
  return { total_jornales: totalJornales, total_costo_jornal: Math.round(totalCostoJornal), jornales_por_tarea: jornalesPorTarea, jornales_por_lote: jornalesPorLote };
}

async function execEmployeeActivity(args: Record<string, unknown>): Promise<string> {
  const { worker_name, date_from, date_to } = args as {
    worker_name: string; date_from?: string; date_to?: string;
  };

  // Search employees
  const empleados = await supabaseQuery('empleados', `select=id,nombre,cargo,salario,tipo_contrato,activo&nombre=ilike.*${e(worker_name)}*&limit=5`);
  // Search contractors
  const contratistas = await supabaseQuery('contratistas', `select=id,nombre,tarifa_jornal,tipo_contrato&nombre=ilike.*${e(worker_name)}*&limit=5`);

  let registrosQuery = `select=fecha_trabajo,fraccion_jornal,costo_jornal,observaciones,tarea:tareas(nombre),lote:lotes(nombre)&order=fecha_trabajo.desc&limit=30`;
  if (date_from) registrosQuery += `&fecha_trabajo=gte.${e(date_from)}`;
  if (date_to) registrosQuery += `&fecha_trabajo=lte.${e(date_to)}`;

  const registros: unknown[] = [];
  for (const emp of empleados as Array<Record<string, unknown>>) {
    const regs = await supabaseQuery('registros_trabajo', `${registrosQuery}&empleado_id=eq.${emp.id}`) as Array<Record<string, unknown>>;
    const resumen = computeWorkerSummary(regs);
    registros.push({ empleado: emp, resumen, registros: regs });
  }
  for (const cont of contratistas as Array<Record<string, unknown>>) {
    const regs = await supabaseQuery('registros_trabajo', `${registrosQuery}&contratista_id=eq.${cont.id}`) as Array<Record<string, unknown>>;
    const resumen = computeWorkerSummary(regs);
    registros.push({ contratista: cont, resumen, registros: regs });
  }

  return JSON.stringify({
    empleados_encontrados: empleados.length,
    contratistas_encontrados: contratistas.length,
    resultados: registros,
  });
}

async function execMonitoringData(args: Record<string, unknown>): Promise<string> {
  const validated = validateDates(args);
  const { date_from, date_to } = validated;
  const { lote_name, pest_name } = args as { lote_name?: string; pest_name?: string };

  let query = `select=id,fecha_monitoreo,incidencia,severidad,gravedad_texto,arboles_monitoreados,arboles_afectados,individuos_encontrados,observaciones,floracion_sin_flor,floracion_brotes,floracion_flor_madura,floracion_cuaje,ronda_id,sublote_id,lote:lotes(nombre),sublote:sublotes(nombre),plaga:plagas_enfermedades_catalogo(nombre,tipo)&order=fecha_monitoreo.desc&limit=3000`;

  if (date_from) query += `&fecha_monitoreo=gte.${e(date_from)}`;
  if (date_to) query += `&fecha_monitoreo=lte.${e(date_to)}`;

  const data = await supabaseQuery('monitoreos', query);
  console.log(`[Esco] Monitoring returned ${data.length} rows`);

  let filtered = data as Array<Record<string, unknown>>;
  if (lote_name) {
    const ln = lote_name.toLowerCase();
    filtered = filtered.filter((r) => ((r.lote as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(ln));
  }
  if (pest_name) {
    const pn = pest_name.toLowerCase();
    filtered = filtered.filter((r) => ((r.plaga as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(pn));
  }

  // Summary by pest — weighted by tree counts
  const byPest: Record<string, { count: number; totalAfectados: number; totalMonitoreados: number; max_gravedad: string }> = {};
  // Summary by month — weighted by tree counts
  const byMonth: Record<string, { count: number; totalAfectados: number; totalMonitoreados: number; max_gravedad: string; plagas: Record<string, number>; lotes: Set<string> }> = {};
  // Summary by sublote — for area-specific decisions
  const bySublote: Record<string, { sublote_id: string; sublote_nombre: string; lote_nombre: string; count: number; totalAfectados: number; totalMonitoreados: number; max_gravedad: string; plagas: Set<string> }> = {};

  for (const r of filtered) {
    const plagaName = (r.plaga as Record<string, unknown>)?.nombre as string || 'Desconocida';
    const loteName = (r.lote as Record<string, unknown>)?.nombre as string || 'Sin lote';
    const subloteName = (r.sublote as Record<string, unknown>)?.nombre as string || '';
    const subloteId = (r.sublote_id as string) || '';
    const afectados = (r.arboles_afectados as number) || 0;
    const monitoreados = (r.arboles_monitoreados as number) || 0;
    const grav = r.gravedad_texto as string || 'Baja';

    // By pest
    if (!byPest[plagaName]) byPest[plagaName] = { count: 0, totalAfectados: 0, totalMonitoreados: 0, max_gravedad: 'Baja' };
    byPest[plagaName].count++;
    byPest[plagaName].totalAfectados += afectados;
    byPest[plagaName].totalMonitoreados += monitoreados;
    if (grav === 'Alta' || (grav === 'Media' && byPest[plagaName].max_gravedad === 'Baja')) {
      byPest[plagaName].max_gravedad = grav;
    }

    // By sublote
    if (subloteId) {
      if (!bySublote[subloteId]) bySublote[subloteId] = { sublote_id: subloteId, sublote_nombre: subloteName, lote_nombre: loteName, count: 0, totalAfectados: 0, totalMonitoreados: 0, max_gravedad: 'Baja', plagas: new Set() };
      bySublote[subloteId].count++;
      bySublote[subloteId].totalAfectados += afectados;
      bySublote[subloteId].totalMonitoreados += monitoreados;
      bySublote[subloteId].plagas.add(plagaName);
      if (grav === 'Alta' || (grav === 'Media' && bySublote[subloteId].max_gravedad === 'Baja')) {
        bySublote[subloteId].max_gravedad = grav;
      }
    }

    // By month
    const fecha = r.fecha_monitoreo as string || '';
    const mes = fecha.slice(0, 7); // YYYY-MM
    if (mes) {
      if (!byMonth[mes]) byMonth[mes] = { count: 0, totalAfectados: 0, totalMonitoreados: 0, max_gravedad: 'Baja', plagas: {}, lotes: new Set() };
      byMonth[mes].count++;
      byMonth[mes].totalAfectados += afectados;
      byMonth[mes].totalMonitoreados += monitoreados;
      byMonth[mes].plagas[plagaName] = (byMonth[mes].plagas[plagaName] || 0) + 1;
      byMonth[mes].lotes.add(loteName);
      if (grav === 'Alta' || (grav === 'Media' && byMonth[mes].max_gravedad === 'Baja')) {
        byMonth[mes].max_gravedad = grav;
      }
    }
  }

  for (const key of Object.keys(byPest)) {
    const p = byPest[key];
    (p as any).avg_incidencia = p.totalMonitoreados > 0
      ? Math.round((p.totalAfectados / p.totalMonitoreados) * 100 * 100) / 100
      : 0;
  }

  // Serialize byMonth (convert Sets to arrays, compute weighted averages)
  const byMonthSerialized: Record<string, unknown> = {};
  for (const [mes, data] of Object.entries(byMonth)) {
    byMonthSerialized[mes] = {
      registros: data.count,
      incidencia_promedio: data.totalMonitoreados > 0
        ? Math.round((data.totalAfectados / data.totalMonitoreados) * 100 * 100) / 100
        : 0,
      gravedad_maxima: data.max_gravedad,
      plagas_encontradas: data.plagas,
      lotes_monitoreados: [...data.lotes],
    };
  }

  // Flowering summary — deduplicate by (fecha, sublote_id) to avoid pest-row inflation
  const florEventMap = new Map<string, { arboles: number; sinFlor: number; brotes: number; flor: number; cuaje: number }>();
  for (const r of filtered) {
    const key = `${r.fecha_monitoreo}|${r.sublote_id ?? ''}`;
    const sf = (r.floracion_sin_flor as number) || 0;
    const b = (r.floracion_brotes as number) || 0;
    const fm = (r.floracion_flor_madura as number) || 0;
    const c = (r.floracion_cuaje as number) || 0;
    const arb = (r.arboles_monitoreados as number) || 35;
    const prev = florEventMap.get(key);
    if (prev) {
      prev.sinFlor = Math.max(prev.sinFlor, sf);
      prev.brotes = Math.max(prev.brotes, b);
      prev.flor = Math.max(prev.flor, fm);
      prev.cuaje = Math.max(prev.cuaje, c);
      prev.arboles = Math.max(prev.arboles, arb);
    } else {
      florEventMap.set(key, { arboles: arb, sinFlor: sf, brotes: b, flor: fm, cuaje: c });
    }
  }
  const floracionTotal = { arbolesMonitoreados: 0, sinFlor: 0, brotes: 0, florMadura: 0, cuaje: 0 };
  for (const ev of florEventMap.values()) {
    floracionTotal.arbolesMonitoreados += ev.arboles;
    floracionTotal.sinFlor += ev.sinFlor;
    floracionTotal.brotes += ev.brotes;
    floracionTotal.florMadura += ev.flor;
    floracionTotal.cuaje += ev.cuaje;
  }

  // Serialize bySublote (Sets → arrays, compute weighted incidencia)
  const bySubloteSerialized: Record<string, unknown> = {};
  for (const [id, data] of Object.entries(bySublote)) {
    bySubloteSerialized[id] = {
      sublote_nombre: data.sublote_nombre,
      lote_nombre: data.lote_nombre,
      registros: data.count,
      arboles_afectados: data.totalAfectados,
      arboles_monitoreados: data.totalMonitoreados,
      incidencia_promedio: data.totalMonitoreados > 0
        ? Math.round((data.totalAfectados / data.totalMonitoreados) * 100 * 100) / 100
        : 0,
      max_gravedad: data.max_gravedad,
      plagas_encontradas: [...data.plagas],
    };
  }

  return JSON.stringify({
    total_registros: filtered.length,
    resumen_por_mes: byMonthSerialized,
    resumen_por_plaga: byPest,
    resumen_por_sublote: bySubloteSerialized,
    resumen_floracion: floracionTotal,
    detalle: filtered.slice(0, 20),
  });
}

async function execApplicationSummary(args: Record<string, unknown>): Promise<string> {
  const validated = validateDates(args);
  const { date_from, date_to } = validated;
  const { application_id, type } = args as { application_id?: string; type?: string };

  let query = `select=id,nombre_aplicacion,tipo_aplicacion,estado,fecha_inicio_planeada,fecha_fin_planeada,fecha_cierre,blanco_biologico,costo_total,costo_total_insumos,costo_total_mano_obra,jornales_utilizados,valor_jornal,costo_por_arbol,arboles_jornal,observaciones_cierre&order=fecha_inicio_planeada.desc&limit=30`;

  if (application_id) query += `&id=eq.${e(application_id)}`;
  if (date_from) query += `&fecha_inicio_planeada=gte.${e(date_from)}`;
  if (date_to) query += `&fecha_inicio_planeada=lte.${e(date_to)}`;
  // tipo_aplicacion is an enum; PostgREST `ilike` has no operator overload
  // for enum vs text, so filter client-side after fetch.

  const apps = await supabaseQuery('aplicaciones', query);
  let appsList = apps as Array<Record<string, unknown>>;
  if (type) {
    const t = type.toLowerCase();
    appsList = appsList.filter((a) => ((a.tipo_aplicacion as string) || '').toLowerCase().includes(t));
  }

  // Batch all sub-queries to avoid N+1
  const enriched: Array<Record<string, unknown>> = [];
  const appIds = appsList.map(a => a.id as string).join(',');

  if (appIds) {
    const [allLotes, allLotesPlan, allMezclas, allMovimientos] = await Promise.all([
      supabaseQuery('aplicaciones_lotes', `select=aplicacion_id,lote:lotes(nombre)&aplicacion_id=in.(${appIds})&limit=2000`),
      supabaseQuery('aplicaciones_lotes_planificado', `select=aplicacion_id,lote:lotes(nombre),canecas_planificado,litros_mezcla_planificado&aplicacion_id=in.(${appIds})&limit=2000`),
      supabaseQuery('aplicaciones_mezclas', `select=aplicacion_id,nombre_mezcla,aplicaciones_productos(producto:productos(nombre),dosis_por_caneca,cantidad_total_necesaria,unidad_dosis)&aplicacion_id=in.(${appIds})&limit=2000`),
      supabaseQuery('movimientos_diarios', `select=aplicacion_id,fecha_movimiento,numero_canecas,numero_bultos,lote:lotes(nombre)&aplicacion_id=in.(${appIds})&order=fecha_movimiento.asc&limit=2000`),
    ]);

    // Group by aplicacion_id
    const groupBy = (arr: unknown[], key: string) => {
      const map: Record<string, unknown[]> = {};
      for (const item of arr as Array<Record<string, unknown>>) {
        const id = item[key] as string;
        if (!map[id]) map[id] = [];
        map[id].push(item);
      }
      return map;
    };

    const lotesByApp = groupBy(allLotes, 'aplicacion_id');
    const lotesPlanByApp = groupBy(allLotesPlan, 'aplicacion_id');
    const mezclasByApp = groupBy(allMezclas, 'aplicacion_id');
    const movsByApp = groupBy(allMovimientos, 'aplicacion_id');

    for (const app of appsList) {
      const id = app.id as string;
      enriched.push({
        ...app,
        lotes_asignados: lotesByApp[id] || [],
        lotes_planificados: lotesPlanByApp[id] || [],
        mezclas_productos: mezclasByApp[id] || [],
        movimientos_reales: movsByApp[id] || [],
      });
    }
  }

  return JSON.stringify({
    total_aplicaciones: appsList.length,
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
  const validated = validateDates(args);
  const { date_from, date_to } = validated as { date_from: string; date_to: string };
  const { type, negocio_name, search_term } = args as { type?: string; negocio_name?: string; search_term?: string };

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
    let gastosQuery = `select=id,fecha,valor,nombre,estado,observaciones,categoria:fin_categorias_gastos(nombre),concepto:fin_conceptos_gastos(nombre),proveedor:fin_proveedores(nombre),negocio:fin_negocios(nombre)&estado=eq.Confirmado&fecha=gte.${e(date_from)}&fecha=lte.${e(date_to)}&order=fecha.desc&limit=2000`;
    if (negocioIds.length > 0) {
      gastosQuery += `&negocio_id=in.(${negocioIds.join(',')})`;
    }
    if (search_term) {
      gastosQuery += `&nombre=ilike.*${e(search_term)}*`;
    }
    const gastos = await supabaseQuery('fin_gastos', gastosQuery);

    let totalGastos = 0;
    const byCategoria: Record<string, number> = {};
    const gastosPorMes: Record<string, { total: number; registros: number }> = {};
    for (const g of gastos as Array<Record<string, unknown>>) {
      const val = (g.valor as number) || 0;
      totalGastos += val;
      const cat = (g.categoria as Record<string, unknown>)?.nombre as string || 'Sin categoria';
      byCategoria[cat] = (byCategoria[cat] || 0) + val;
      const mes = ((g.fecha as string) || '').slice(0, 7);
      if (mes) {
        if (!gastosPorMes[mes]) gastosPorMes[mes] = { total: 0, registros: 0 };
        gastosPorMes[mes].total += val;
        gastosPorMes[mes].registros++;
      }
    }
    result.gastos = { total: totalGastos, por_categoria: byCategoria, por_mes: gastosPorMes, registros: gastos.length, detalle: (gastos as unknown[]).slice(0, 30) };
  }

  if (!type || type === 'ingresos') {
    let ingresosQuery = `select=id,fecha,valor,nombre,observaciones,cantidad,precio_unitario,cosecha,cliente,finca,categoria:fin_categorias_ingresos(nombre),comprador:fin_compradores(nombre),negocio:fin_negocios(nombre)&fecha=gte.${e(date_from)}&fecha=lte.${e(date_to)}&order=fecha.desc&limit=2000`;
    if (negocioIds.length > 0) {
      ingresosQuery += `&negocio_id=in.(${negocioIds.join(',')})`;
    }
    if (search_term) {
      ingresosQuery += `&nombre=ilike.*${e(search_term)}*`;
    }
    const ingresos = await supabaseQuery('fin_ingresos', ingresosQuery);

    let totalIngresos = 0;
    const byCategoria: Record<string, number> = {};
    const ingresosPorMes: Record<string, { total: number; registros: number }> = {};
    for (const i of ingresos as Array<Record<string, unknown>>) {
      const val = (i.valor as number) || 0;
      totalIngresos += val;
      const cat = (i.categoria as Record<string, unknown>)?.nombre as string || 'Sin categoria';
      byCategoria[cat] = (byCategoria[cat] || 0) + val;
      const mes = ((i.fecha as string) || '').slice(0, 7);
      if (mes) {
        if (!ingresosPorMes[mes]) ingresosPorMes[mes] = { total: 0, registros: 0 };
        ingresosPorMes[mes].total += val;
        ingresosPorMes[mes].registros++;
      }
    }
    result.ingresos = { total: totalIngresos, por_categoria: byCategoria, por_mes: ingresosPorMes, registros: ingresos.length, detalle: (ingresos as unknown[]).slice(0, 30) };
  }

  if (!type || type === 'ganado') {
    const ganado = await supabaseQuery('fin_transacciones_ganado',
      `select=id,fecha,tipo,cantidad_cabezas,kilos_pagados,precio_kilo,valor_total,finca,cliente_proveedor,observaciones&fecha=gte.${e(date_from)}&fecha=lte.${e(date_to)}&order=fecha.desc&limit=2000`);

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

  let query = `select=id,ano,cosecha_tipo,kg_totales,arboles_registrados,kg_por_arbol,lote:lotes(nombre),sublote:sublotes(nombre)&order=ano.desc,kg_totales.desc&limit=2000`;

  if (year) query += `&ano=eq.${year}`;
  if (cosecha_tipo) query += `&cosecha_tipo=ilike.*${e(cosecha_tipo)}*`;

  const data = await supabaseQuery('produccion', query);

  let filtered = data as Array<Record<string, unknown>>;
  if (lote_name) {
    const ln = lote_name.toLowerCase();
    filtered = filtered.filter((r) => ((r.lote as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(ln));
  }

  let totalKg = 0;
  const porAno: Record<number, { total_kg: number; avg_kg_arbol: number; lotes: Set<string>; _sum_kg_arbol: number; _count: number }> = {};
  const porLote: Record<string, { total_kg: number; _arboles: number; _count: number }> = {};

  for (const r of filtered) {
    const kg = (r.kg_totales as number) || 0;
    const kgArbol = (r.kg_por_arbol as number) || 0;
    const ano = (r.ano as number) || 0;
    const loteName = (r.lote as Record<string, unknown>)?.nombre as string || 'Sin lote';
    const arboles = (r.arboles_registrados as number) || 0;
    totalKg += kg;

    if (ano) {
      if (!porAno[ano]) porAno[ano] = { total_kg: 0, avg_kg_arbol: 0, lotes: new Set(), _sum_kg_arbol: 0, _count: 0 };
      porAno[ano].total_kg += kg;
      porAno[ano]._sum_kg_arbol += kgArbol;
      porAno[ano]._count++;
      porAno[ano].lotes.add(loteName);
    }

    if (!porLote[loteName]) porLote[loteName] = { total_kg: 0, _arboles: 0, _count: 0 };
    porLote[loteName].total_kg += kg;
    porLote[loteName]._arboles += arboles;
    porLote[loteName]._count++;
  }

  // Serialize por_ano
  const porAnoSerialized: Record<number, { total_kg: number; avg_kg_arbol: number; lotes: number }> = {};
  for (const [ano, data] of Object.entries(porAno)) {
    porAnoSerialized[Number(ano)] = {
      total_kg: data.total_kg,
      avg_kg_arbol: data._count > 0 ? Math.round(data._sum_kg_arbol / data._count * 10) / 10 : 0,
      lotes: data.lotes.size,
    };
  }

  // Serialize por_lote
  const porLoteSerialized: Record<string, { total_kg: number; kg_arbol: number }> = {};
  for (const [name, data] of Object.entries(porLote)) {
    porLoteSerialized[name] = {
      total_kg: data.total_kg,
      kg_arbol: data._arboles > 0 ? Math.round(data.total_kg / data._arboles * 10) / 10 : 0,
    };
  }

  return JSON.stringify({
    total_registros: filtered.length,
    total_kg: totalKg,
    por_ano: porAnoSerialized,
    por_lote: porLoteSerialized,
    produccion: filtered.slice(0, 30),
  });
}

async function execHarvestShipments(args: Record<string, unknown>): Promise<string> {
  const { date_from, date_to, client_name } = args as {
    date_from?: string; date_to?: string; client_name?: string;
  };

  let cosechasQuery = `select=id,fecha_cosecha,kilos_cosechados,numero_canastillas,lote:lotes(nombre),sublote:sublotes(nombre)&order=fecha_cosecha.desc&limit=2000`;
  if (date_from) cosechasQuery += `&fecha_cosecha=gte.${e(date_from)}`;
  if (date_to) cosechasQuery += `&fecha_cosecha=lte.${e(date_to)}`;

  let despachosQuery = `select=id,fecha_despacho,kilos_despachados,precio_por_kilo,valor_total,cliente:clientes(nombre)&order=fecha_despacho.desc&limit=2000`;
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
  const cosechasPorMes: Record<string, { total_kg: number; registros: number }> = {};
  const cosechasPorLote: Record<string, { total_kg: number; registros: number }> = {};
  for (const c of cosechas as Array<Record<string, unknown>>) {
    const kg = (c.kilos_cosechados as number) || 0;
    totalCosechado += kg;
    const mes = ((c.fecha_cosecha as string) || '').slice(0, 7);
    if (mes) {
      if (!cosechasPorMes[mes]) cosechasPorMes[mes] = { total_kg: 0, registros: 0 };
      cosechasPorMes[mes].total_kg += kg;
      cosechasPorMes[mes].registros++;
    }
    const loteName = (c.lote as Record<string, unknown>)?.nombre as string || 'Sin lote';
    if (!cosechasPorLote[loteName]) cosechasPorLote[loteName] = { total_kg: 0, registros: 0 };
    cosechasPorLote[loteName].total_kg += kg;
    cosechasPorLote[loteName].registros++;
  }

  let totalDespachado = 0;
  const despachosPorMes: Record<string, { total_kg: number; registros: number }> = {};
  const despachosPorCliente: Record<string, { total_kg: number; registros: number }> = {};
  for (const d of filteredDespachos) {
    const kg = (d.kilos_despachados as number) || 0;
    totalDespachado += kg;
    const mes = ((d.fecha_despacho as string) || '').slice(0, 7);
    if (mes) {
      if (!despachosPorMes[mes]) despachosPorMes[mes] = { total_kg: 0, registros: 0 };
      despachosPorMes[mes].total_kg += kg;
      despachosPorMes[mes].registros++;
    }
    const clienteName = (d.cliente as Record<string, unknown>)?.nombre as string || 'Sin cliente';
    if (!despachosPorCliente[clienteName]) despachosPorCliente[clienteName] = { total_kg: 0, registros: 0 };
    despachosPorCliente[clienteName].total_kg += kg;
    despachosPorCliente[clienteName].registros++;
  }

  return JSON.stringify({
    cosechas: { total_kg: totalCosechado, registros: cosechas.length, por_mes: cosechasPorMes, por_lote: cosechasPorLote, detalle: (cosechas as unknown[]).slice(0, 30) },
    despachos: { total_kg: totalDespachado, registros: filteredDespachos.length, por_mes: despachosPorMes, por_cliente: despachosPorCliente, detalle: filteredDespachos.slice(0, 30) },
  });
}

async function execLotInfo(args: Record<string, unknown>): Promise<string> {
  const { lote_name } = args as { lote_name?: string };

  let query = `select=id,nombre,area_hectareas,arboles_grandes,arboles_medianos,arboles_pequenos,arboles_clonales,total_arboles,fecha_siembra,activo,sublotes:sublotes(id,nombre)&order=nombre.asc&limit=20`;
  if (lote_name) query += `&nombre=ilike.*${e(lote_name)}*`;

  const data = await supabaseQuery('lotes', query);
  return JSON.stringify({ lotes: data });
}

async function execPurchaseHistory(args: Record<string, unknown>): Promise<string> {
  const validated = validateDates(args);
  const { date_from, date_to } = validated;
  const { product_name, proveedor } = args as { product_name?: string; proveedor?: string };

  let query = `select=id,fecha_compra,proveedor,numero_factura,cantidad,unidad,costo_unitario,costo_total,producto:productos(nombre,categoria)&order=fecha_compra.desc&limit=2000`;
  if (date_from) query += `&fecha_compra=gte.${e(date_from)}`;
  if (date_to) query += `&fecha_compra=lte.${e(date_to)}`;

  const data = await supabaseQuery('compras', query);
  let filtered = data as Array<Record<string, unknown>>;

  if (product_name) {
    const pn = product_name.toLowerCase();
    filtered = filtered.filter((r) => ((r.producto as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(pn));
  }
  if (proveedor) {
    const pv = proveedor.toLowerCase();
    filtered = filtered.filter((r) => ((r.proveedor as string) || '').toLowerCase().includes(pv));
  }

  let totalCompras = 0;
  const porProveedor: Record<string, { total: number; compras: number }> = {};
  const porProducto: Record<string, { total: number; cantidad: number }> = {};
  const porMes: Record<string, { total: number; registros: number }> = {};

  for (const r of filtered) {
    const costo = (r.costo_total as number) || 0;
    const cantidad = (r.cantidad as number) || 0;
    totalCompras += costo;

    const provName = (r.proveedor as string) || 'Sin proveedor';
    if (!porProveedor[provName]) porProveedor[provName] = { total: 0, compras: 0 };
    porProveedor[provName].total += costo;
    porProveedor[provName].compras++;

    const prodName = (r.producto as Record<string, unknown>)?.nombre as string || 'Sin producto';
    if (!porProducto[prodName]) porProducto[prodName] = { total: 0, cantidad: 0 };
    porProducto[prodName].total += costo;
    porProducto[prodName].cantidad += cantidad;

    const mes = ((r.fecha_compra as string) || '').slice(0, 7);
    if (mes) {
      if (!porMes[mes]) porMes[mes] = { total: 0, registros: 0 };
      porMes[mes].total += costo;
      porMes[mes].registros++;
    }
  }

  // Top 10 products by spend
  const porProductoTop = Object.entries(porProducto)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .reduce((acc, [name, data]) => { acc[name] = data; return acc; }, {} as Record<string, { total: number; cantidad: number }>);

  return JSON.stringify({
    total_registros: filtered.length,
    total_compras: Math.round(totalCompras),
    por_proveedor: porProveedor,
    por_producto: porProductoTop,
    por_mes: porMes,
    detalle: filtered.slice(0, 30),
  });
}

async function execInventoryMovements(args: Record<string, unknown>): Promise<string> {
  const validated = validateDates(args);
  const { date_from, date_to } = validated;
  const { product_name, tipo } = args as { product_name?: string; tipo?: string };

  let movQuery = `select=id,fecha_movimiento,tipo_movimiento,cantidad,unidad,saldo_anterior,saldo_nuevo,valor_movimiento,observaciones,producto:productos(nombre,categoria)&order=fecha_movimiento.desc&limit=2000`;
  if (date_from) movQuery += `&fecha_movimiento=gte.${e(date_from)}`;
  if (date_to) movQuery += `&fecha_movimiento=lte.${e(date_to)}`;
  // tipo_movimiento is an enum; PostgREST `ilike` has no operator overload
  // for enum vs text, so filter client-side after fetch.

  const [movimientos, verificaciones] = await Promise.all([
    supabaseQuery('movimientos_inventario', movQuery),
    supabaseQuery('verificaciones_inventario',
      `select=id,fecha_inicio,fecha_fin,estado,usuario_verificador,observaciones_generales,verificaciones_detalle(producto:productos(nombre),cantidad_teorica,cantidad_fisica,diferencia,porcentaje_diferencia,valor_diferencia,estado_diferencia)&order=fecha_inicio.desc&limit=10`),
  ]);

  let filteredMov = movimientos as Array<Record<string, unknown>>;
  if (tipo) {
    const t = tipo.toLowerCase();
    filteredMov = filteredMov.filter((r) => ((r.tipo_movimiento as string) || '').toLowerCase().includes(t));
  }
  if (product_name) {
    const pn = product_name.toLowerCase();
    filteredMov = filteredMov.filter((r) => ((r.producto as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(pn));
  }

  let entradasTotal = 0;
  let salidasTotal = 0;
  let ajustesTotal = 0;
  const porProducto: Record<string, { entradas: number; salidas: number; neto: number }> = {};

  for (const m of filteredMov) {
    const val = (m.valor_movimiento as number) || 0;
    const cantidad = (m.cantidad as number) || 0;
    const tipoMov = (m.tipo_movimiento as string) || '';
    const prodName = (m.producto as Record<string, unknown>)?.nombre as string || 'Sin producto';

    if (tipoMov.toLowerCase().includes('entrada')) {
      entradasTotal += val;
      if (!porProducto[prodName]) porProducto[prodName] = { entradas: 0, salidas: 0, neto: 0 };
      porProducto[prodName].entradas += cantidad;
      porProducto[prodName].neto += cantidad;
    } else if (tipoMov.toLowerCase().includes('salida')) {
      salidasTotal += val;
      if (!porProducto[prodName]) porProducto[prodName] = { entradas: 0, salidas: 0, neto: 0 };
      porProducto[prodName].salidas += cantidad;
      porProducto[prodName].neto -= cantidad;
    } else {
      ajustesTotal += val;
      if (!porProducto[prodName]) porProducto[prodName] = { entradas: 0, salidas: 0, neto: 0 };
      porProducto[prodName].neto += cantidad;
    }
  }

  // Extract discrepancias from verificaciones
  const discrepancias: unknown[] = [];
  const verifList = verificaciones as Array<Record<string, unknown>>;
  for (const v of verifList) {
    const detalles = (v.verificaciones_detalle as Array<Record<string, unknown>>) || [];
    for (const d of detalles) {
      if ((d.diferencia as number) !== 0) {
        discrepancias.push({ ...d, verificacion_id: v.id, fecha: v.fecha_inicio });
      }
    }
  }

  return JSON.stringify({
    movimientos: {
      total: filteredMov.length,
      entradas_total: Math.round(entradasTotal),
      salidas_total: Math.round(salidasTotal),
      ajustes_total: Math.round(ajustesTotal),
      por_producto: porProducto,
      detalle: filteredMov.slice(0, 30),
    },
    verificaciones: {
      total: verifList.length,
      ultima_verificacion: verifList[0] ? { fecha: verifList[0].fecha_inicio, estado: verifList[0].estado } : null,
      discrepancias,
    },
  });
}

async function execApplicationDetails(args: Record<string, unknown>): Promise<string> {
  const id = args.application_id as string;
  if (!id) return JSON.stringify({ error: 'application_id es requerido' });

  const [cierre, calculos, focos, appRows] = await Promise.all([
    supabaseQuery('aplicaciones_cierre', `select=*&aplicacion_id=eq.${e(id)}`),
    supabaseQuery('aplicaciones_calculos', `select=lote_nombre,area_hectareas,total_arboles,litros_mezcla,numero_canecas,kilos_totales,numero_bultos&aplicacion_id=eq.${e(id)}`),
    supabaseQuery('focos', `select=fecha_aplicacion,blanco_biologico,numero_focos,numero_bombas_30l,costo_insumos,jornales,costo_mano_obra,costo_total,observaciones,lote:lotes(nombre),sublote:sublotes(nombre),focos_productos(producto:productos(nombre),dosis_por_bomba,costo_producto)&aplicacion_id=eq.${e(id)}`),
    supabaseQuery('aplicaciones', `select=id,nombre_aplicacion,tipo_aplicacion,estado,fecha_inicio_planeada,fecha_cierre,tarea_id&id=eq.${e(id)}`),
  ]);

  // Per-lote cost breakdown via shared helper
  const appRow = (appRows as AplicacionRow[])[0];
  const costoPorLote = appRow ? await fetchPerLoteCostsForApplication(appRow) : [];
  costoPorLote.sort((a, b) => b.costo_total - a.costo_total);
  const costoSummary = summariseCostos(costoPorLote);

  // Cierre summary
  const cierreData = (cierre as Array<Record<string, unknown>>)[0] || null;

  // Calculos summary by lote
  const calculosList = calculos as Array<Record<string, unknown>>;
  let totalLitros = 0;
  let totalCanecas = 0;
  let totalArboles = 0;
  for (const c of calculosList) {
    totalLitros += (c.litros_mezcla as number) || 0;
    totalCanecas += (c.numero_canecas as number) || 0;
    totalArboles += (c.total_arboles as number) || 0;
  }

  // Focos summary
  const focosList = focos as Array<Record<string, unknown>>;
  let totalCostoFocos = 0;
  let totalFocos = 0;
  for (const f of focosList) {
    totalCostoFocos += (f.costo_total as number) || 0;
    totalFocos += (f.numero_focos as number) || 0;
  }

  return JSON.stringify({
    cierre: cierreData,
    calculos: {
      total_lotes: calculosList.length,
      total_arboles: totalArboles,
      total_litros_mezcla: totalLitros,
      total_canecas: totalCanecas,
      detalle: calculosList,
    },
    focos: {
      total_registros: focosList.length,
      total_focos: totalFocos,
      costo_total_focos: Math.round(totalCostoFocos),
      detalle: focosList,
    },
    costo_por_lote: costoPorLote,
    costo_resumen: costoSummary,
  });
}

// ----------------------------------------------------------------------------
// PER-LOTE COST ANALYSIS
//
// Mirrors the logic in src/utils/aplicacionesReales.ts (frontend equivalent).
// The pure aggregation lives in ./cost-aggregation.ts so it is unit-testable
// from Vitest without depending on Deno.
// ----------------------------------------------------------------------------

interface AplicacionRow {
  id: string;
  nombre_aplicacion: string;
  tipo_aplicacion: string;
  estado: string;
  fecha_inicio_planeada: string;
  fecha_cierre: string | null;
  tarea_id: string | null;
}

async function fetchAplicacionByIdOrName(
  applicationId?: string,
  applicationName?: string,
): Promise<AplicacionRow | null> {
  let q = `select=id,nombre_aplicacion,tipo_aplicacion,estado,fecha_inicio_planeada,fecha_cierre,tarea_id&order=fecha_inicio_planeada.desc&limit=1`;
  if (applicationId) {
    q += `&id=eq.${e(applicationId)}`;
  } else if (applicationName) {
    q += `&nombre_aplicacion=ilike.*${e(applicationName)}*`;
  } else {
    return null;
  }
  const rows = (await supabaseQuery('aplicaciones', q)) as AplicacionRow[];
  return rows[0] ?? null;
}

async function fetchPerLoteCostsForApplication(app: AplicacionRow) {
  // Movimientos diarios for this application (with lote)
  const movimientos = (await supabaseQuery(
    'movimientos_diarios',
    `select=id,lote_id&aplicacion_id=eq.${e(app.id)}&limit=2000`,
  )) as Array<{ id: string; lote_id: string | null }>;

  // Product detail per movement
  const movIds = movimientos.map((m) => m.id).filter(Boolean);
  const movProductos = movIds.length
    ? ((await supabaseQuery(
        'movimientos_diarios_productos',
        `select=movimiento_diario_id,producto_id,producto_nombre,cantidad_utilizada,unidad&movimiento_diario_id=in.(${movIds.join(',')})&limit=2000`,
      )) as Array<{
        movimiento_diario_id: string;
        producto_id: string;
        producto_nombre: string;
        cantidad_utilizada: number | string;
        unidad: string;
      }>)
    : [];

  // Product unit prices
  const productoIds = [...new Set(movProductos.map((p) => p.producto_id).filter(Boolean))];
  const precios = new Map<string, number>();
  if (productoIds.length) {
    const rows = (await supabaseQuery(
      'productos',
      `select=id,precio_unitario&id=in.(${productoIds.join(',')})`,
    )) as Array<{ id: string; precio_unitario: number | string }>;
    for (const r of rows) precios.set(r.id, Number(r.precio_unitario) || 0);
  }

  // Labor records via tarea_id
  let registros: Array<{ lote_id: string | null; fraccion_jornal: number | string; costo_jornal: number | string }> = [];
  if (app.tarea_id) {
    registros = (await supabaseQuery(
      'registros_trabajo',
      `select=lote_id,fraccion_jornal,costo_jornal&tarea_id=eq.${e(app.tarea_id)}&limit=2000`,
    )) as typeof registros;
  }

  // Tree counts per lote — read the canonical lot-assignment table (aplicaciones_lotes).
  // aplicaciones_lotes_planificado is only populated when the planning Calculadora is used,
  // so ad-hoc apps (drench, focos, edáficas registradas direct) end up with zero rows there.
  const lotesAsignados = (await supabaseQuery(
    'aplicaciones_lotes',
    `select=lote_id,total_arboles,lote:lotes(id,nombre,total_arboles)&aplicacion_id=eq.${e(app.id)}&limit=200`,
  )) as Array<{ lote_id: string; total_arboles: number | string; lote: { id: string; nombre: string; total_arboles: number | string } | null }>;

  const lotesInfo = lotesAsignados
    .filter((row) => row.lote_id)
    .map((row) => ({
      id: row.lote_id,
      nombre: row.lote?.nombre ?? row.lote_id,
      total_arboles: Number(row.total_arboles) || Number(row.lote?.total_arboles) || 0,
    }));

  const insumosByLote = aggregateInsumosPorLote(movimientos, movProductos, precios);
  const jornalesByLote = aggregateJornalesPorLote(registros);

  // Fallback: any lote that shows up only in movimientos / registros (e.g. focos applied
  // to a lote not formally assigned) gets its name + tree count from the lotes master.
  const knownIds = new Set(lotesInfo.map((l) => l.id));
  const orphanIds = [...new Set([...insumosByLote.keys(), ...jornalesByLote.keys()])]
    .filter((id) => !knownIds.has(id));
  if (orphanIds.length) {
    const orphans = (await supabaseQuery(
      'lotes',
      `select=id,nombre,total_arboles&id=in.(${orphanIds.join(',')})`,
    )) as Array<{ id: string; nombre: string; total_arboles: number | string }>;
    for (const o of orphans) {
      lotesInfo.push({ id: o.id, nombre: o.nombre, total_arboles: Number(o.total_arboles) || 0 });
    }
  }

  return combineCostosPorLote(insumosByLote, jornalesByLote, lotesInfo);
}

async function execApplicationCostByLote(args: Record<string, unknown>): Promise<string> {
  const { application_id, application_name } = args as { application_id?: string; application_name?: string };
  if (!application_id && !application_name) {
    return JSON.stringify({ error: 'Debe pasar application_id o application_name' });
  }

  const app = await fetchAplicacionByIdOrName(application_id, application_name);
  if (!app) return JSON.stringify({ error: 'No se encontro la aplicacion', application_id, application_name });

  const rows = await fetchPerLoteCostsForApplication(app);
  rows.sort((a, b) => b.costo_total - a.costo_total);
  const summary = summariseCostos(rows);

  return JSON.stringify({
    aplicacion: {
      id: app.id,
      nombre: app.nombre_aplicacion,
      tipo: app.tipo_aplicacion,
      estado: app.estado,
      fecha_inicio: app.fecha_inicio_planeada,
      fecha_cierre: app.fecha_cierre,
    },
    por_lote: rows,
    total: summary,
  });
}

async function execCostByLote(args: Record<string, unknown>): Promise<string> {
  const validated = validateDates(args);
  const { date_from, date_to } = validated;
  if (!date_from || !date_to) {
    return JSON.stringify({ error: 'date_from y date_to son requeridos (YYYY-MM-DD)' });
  }

  const apps = (await supabaseQuery(
    'aplicaciones',
    `select=id,nombre_aplicacion,tipo_aplicacion,estado,fecha_inicio_planeada,fecha_cierre,tarea_id&fecha_inicio_planeada=gte.${e(date_from)}&fecha_inicio_planeada=lte.${e(date_to)}&order=fecha_inicio_planeada.asc&limit=200`,
  )) as AplicacionRow[];

  const aggregated = new Map<
    string,
    { lote_id: string; lote_nombre: string; arboles_total: number; costo_insumos: number; costo_mano_obra: number; costo_total: number; jornales: number; aplicaciones_count: number }
  >();

  for (const app of apps) {
    const rows = await fetchPerLoteCostsForApplication(app);
    for (const r of rows) {
      let cur = aggregated.get(r.lote_id);
      if (!cur) {
        cur = {
          lote_id: r.lote_id,
          lote_nombre: r.lote_nombre,
          arboles_total: r.arboles_total,
          costo_insumos: 0,
          costo_mano_obra: 0,
          costo_total: 0,
          jornales: 0,
          aplicaciones_count: 0,
        };
        aggregated.set(r.lote_id, cur);
      }
      cur.costo_insumos += r.costo_insumos;
      cur.costo_mano_obra += r.costo_mano_obra;
      cur.costo_total += r.costo_total;
      cur.jornales += r.jornales;
      cur.aplicaciones_count += 1;
      if (cur.arboles_total === 0 && r.arboles_total > 0) cur.arboles_total = r.arboles_total;
    }
  }

  const result = [...aggregated.values()]
    .map((row) => ({
      ...row,
      costo_por_arbol: row.arboles_total > 0 ? Math.round(row.costo_total / row.arboles_total) : 0,
    }))
    .sort((a, b) => b.costo_total - a.costo_total);

  return JSON.stringify({
    rango: { desde: date_from, hasta: date_to },
    total_aplicaciones: apps.length,
    por_lote: result,
  });
}

// ----------------------------------------------------------------------------
// EXTERNAL KNOWLEDGE TOOLS
//
// Pure response-shaping lives in ./external-tools.ts (importable from Vitest).
// Network I/O and Deno.env reads stay here.
// ----------------------------------------------------------------------------

async function execWebSearchAgronomic(args: Record<string, unknown>): Promise<string> {
  const { query, max_results } = args as { query?: string; max_results?: number };
  if (!query || typeof query !== 'string' || !query.trim()) {
    return JSON.stringify({ error: 'query es requerido' });
  }
  const apiKey = Deno.env.get('TAVILY_API_KEY');
  if (!apiKey) {
    return JSON.stringify({ error: 'TAVILY_API_KEY no configurada en el edge function' });
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        include_answer: true,
        include_raw_content: false,
        max_results: typeof max_results === 'number' && max_results > 0 ? Math.min(max_results, 10) : 5,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return JSON.stringify({ error: `Tavily error ${res.status}`, detail: errText.slice(0, 200) });
    }
    const raw = await res.json();
    const parsed = parseTavilyResponse(raw);
    if (!parsed.sources.length) {
      return JSON.stringify({ ...parsed, _aviso: 'Tavily no devolvio fuentes; cita explicitamente que la respuesta no esta verificada.' });
    }
    return JSON.stringify(parsed);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function execWeatherForecast(args: Record<string, unknown>): Promise<string> {
  const { days } = args as { days?: number };
  const requestedDays = Math.max(1, Math.min(Number(days) || 5, 7));

  const apiKey = Deno.env.get('OPENWEATHER_API_KEY');
  if (!apiKey) {
    return JSON.stringify({ error: 'OPENWEATHER_API_KEY no configurada en el edge function' });
  }

  // Farm coordinates — overridable via env. Defaults to Aguadas, Caldas (Escocia
  // Hass region). If FARM_LAT / FARM_LON are set in the edge function secrets
  // they take precedence so the forecast resolves to the actual lot.
  const lat = Number(Deno.env.get('FARM_LAT')) || 5.6094;
  const lon = Number(Deno.env.get('FARM_LON')) || -75.4582;

  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=es&appid=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return JSON.stringify({ error: `OpenWeather error ${res.status}`, detail: errText.slice(0, 200) });
    }
    const raw = await res.json();
    const dias = parseOpenWeatherForecast(raw, requestedDays);
    return JSON.stringify({
      ubicacion: { lat, lon, ciudad: raw?.city?.name ?? 'Finca' },
      dias,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ----------------------------------------------------------------------------
// LONG-TERM MEMORY TOOLS
//
// "Save this for later" flow:
//   user says "guarda esto" → Esco calls propose_memory_save (no DB write)
//   → client (Telegram/web) renders inline confirmation buttons with the token
//   → on ✅ tap, client calls commit_memory_save with the token + final content
//   → row inserted into esco_memorias.
//
// At conversation start, handleChatMessage loads the user's active memorias
// and injects them into the system prompt via renderMemoriasBlock.
// ----------------------------------------------------------------------------

const memoryProposalCache = new Map<string, { content: string; reason?: string; createdAt: number }>();

async function execProposeMemorySave(args: Record<string, unknown>): Promise<string> {
  const { content, reason } = args as { content?: string; reason?: string };
  if (!content || typeof content !== 'string' || !content.trim()) {
    return JSON.stringify({ error: 'content es requerido' });
  }
  const proposal = makeMemoryProposal({ content, reason });
  memoryProposalCache.set(proposal.token, {
    content: proposal.content,
    reason: proposal.reason,
    createdAt: Date.now(),
  });
  // Best-effort GC: drop tokens older than 30 minutes
  for (const [t, v] of memoryProposalCache) {
    if (Date.now() - v.createdAt > 30 * 60 * 1000) memoryProposalCache.delete(t);
  }
  return JSON.stringify(proposal);
}

async function execCommitMemorySave(args: Record<string, unknown>, userId?: string): Promise<string> {
  const { token, final_content } = args as { token?: string; final_content?: string };
  if (!userId) return JSON.stringify({ error: 'No hay usuario autenticado' });
  if (!token) return JSON.stringify({ error: 'token es requerido' });

  const cached = memoryProposalCache.get(token);
  if (!cached) return JSON.stringify({ error: 'Token invalido o expirado' });

  const content = (final_content && final_content.trim()) || cached.content;
  const inserted = (await supabaseInsert('esco_memorias', {
    user_id: userId,
    content: content.slice(0, 1000),
    source_channel: 'telegram',
  })) as { id?: string; created_at?: string } | null;

  memoryProposalCache.delete(token);

  return JSON.stringify({
    saved: true,
    id: inserted?.id,
    saved_at: inserted?.created_at,
    content,
  });
}

async function execForgetMemory(args: Record<string, unknown>, userId?: string): Promise<string> {
  const { memory_id, match_text } = args as { memory_id?: string; match_text?: string };
  if (!userId) return JSON.stringify({ error: 'No hay usuario autenticado' });
  if (!memory_id && !match_text) {
    return JSON.stringify({ error: 'Pasa memory_id o match_text' });
  }

  // Find candidate rows
  let candidates: Array<{ id: string; content: string }> = [];
  if (memory_id) {
    candidates = (await supabaseQuery(
      'esco_memorias',
      `select=id,content&id=eq.${e(memory_id)}&user_id=eq.${e(userId)}&archived_at=is.null`,
    )) as Array<{ id: string; content: string }>;
  } else if (match_text) {
    candidates = (await supabaseQuery(
      'esco_memorias',
      `select=id,content&user_id=eq.${e(userId)}&archived_at=is.null&content=ilike.*${e(match_text)}*&limit=5`,
    )) as Array<{ id: string; content: string }>;
  }

  if (!candidates.length) {
    return JSON.stringify({ archived: 0, message: 'No se encontro ninguna memoria activa que coincida.' });
  }

  // Soft-delete: set archived_at = now() on each
  const { url, headers } = getAdminHeaders();
  const ids = candidates.map((c) => c.id).join(',');
  const res = await fetch(`${url}/rest/v1/esco_memorias?id=in.(${ids})`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ archived_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return JSON.stringify({ error: `Error archivando memoria`, status: res.status, detail: errText.slice(0, 200) });
  }
  return JSON.stringify({ archived: candidates.length, items: candidates.map((c) => c.content.slice(0, 100)) });
}

async function fetchActiveMemorias(userId: string): Promise<PersistedMemory[]> {
  if (!userId) return [];
  const rows = (await supabaseQuery(
    'esco_memorias',
    `select=id,content,created_at,source_channel&user_id=eq.${e(userId)}&archived_at=is.null&order=created_at.desc&limit=50`,
  )) as PersistedMemory[];
  return rows;
}

async function execWeeklyOverview(args: Record<string, unknown>): Promise<string> {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const defaultFrom = new Date(now);
  defaultFrom.setDate(now.getDate() + mondayOffset);
  const defaultTo = new Date(defaultFrom);
  defaultTo.setDate(defaultFrom.getDate() + 6);

  const validatedWeek = validateDates(args);
  const dateFrom = validatedWeek.date_from || defaultFrom.toISOString().split('T')[0];
  const dateTo = validatedWeek.date_to || defaultTo.toISOString().split('T')[0];

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
// CLIMATE DATA
// ============================================================================

async function execClimateData(args: Record<string, unknown>): Promise<string> {
  const validated = validateDates(args);
  const { metric } = args as { metric?: string };

  // Default: last 7 days
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const from = validated.date_from || defaultFrom;
  const to = validated.date_to || now.toISOString().split('T')[0];

  // Fetch readings
  let query = `select=timestamp,temp_c,humedad_pct,viento_kmh,rafaga_kmh,viento_dir,lluvia_diaria_mm,lluvia_tasa_mm_hr,radiacion_wm2,uv_index`;
  query += `&timestamp=gte.${e(from)}T00:00:00&timestamp=lte.${e(to)}T23:59:59`;
  query += `&order=timestamp.desc&limit=5000`;

  const readings = await supabaseQuery('clima_lecturas', query) as Array<Record<string, unknown>>;

  if (!readings || readings.length === 0) {
    return JSON.stringify({ message: 'No hay datos climáticos para el período seleccionado', periodo: { desde: from, hasta: to } });
  }

  // Latest reading (current conditions)
  const latest = readings[0];

  // Helper: extract non-null numbers
  const nums = (field: string) => readings.map(r => r[field]).filter((v): v is number => v !== null && typeof v === 'number');

  const temps = nums('temp_c');
  const humedad = nums('humedad_pct');
  const viento = nums('viento_kmh');
  const rafaga = nums('rafaga_kmh');
  const radiacion = nums('radiacion_wm2');
  const uv = nums('uv_index');

  // Rainfall: MAX per calendar day, then SUM
  const lluviaMap = new Map<string, number>();
  for (const r of readings) {
    if (r.lluvia_diaria_mm != null) {
      const day = String(r.timestamp).split('T')[0];
      const cur = lluviaMap.get(day) ?? 0;
      lluviaMap.set(day, Math.max(cur, r.lluvia_diaria_mm as number));
    }
  }
  const lluviaTotal = Array.from(lluviaMap.values()).reduce((s, v) => s + v, 0);

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 : null;
  const max = (arr: number[]) => arr.length ? arr.reduce((a, b) => a > b ? a : b) : null;
  const min = (arr: number[]) => arr.length ? arr.reduce((a, b) => a < b ? a : b) : null;

  const result: Record<string, unknown> = {
    periodo: { desde: from, hasta: to },
    total_lecturas: readings.length,
    condiciones_actuales: {
      timestamp: latest.timestamp,
      temperatura_c: latest.temp_c,
      humedad_pct: latest.humedad_pct,
      viento_kmh: latest.viento_kmh,
      rafaga_kmh: latest.rafaga_kmh,
      direccion_viento: latest.viento_dir,
      radiacion_wm2: latest.radiacion_wm2,
      uv_index: latest.uv_index,
    },
    resumen_periodo: {
      temperatura: { promedio: avg(temps), maxima: max(temps), minima: min(temps) },
      humedad: { promedio: avg(humedad), maxima: max(humedad), minima: min(humedad) },
      viento: { promedio: avg(viento), rafaga_max: max(rafaga) },
      lluvia_total_mm: Math.round(lluviaTotal * 10) / 10,
      radiacion: { promedio: avg(radiacion), maxima: max(radiacion) },
      uv: { promedio: avg(uv), maximo: max(uv) },
    },
  };

  // Daily breakdown (for charts or detail)
  const porDia = new Map<string, { temps: number[]; humedad: number[]; viento: number[]; lluvia: number; radiacion: number[] }>();
  for (const r of readings) {
    const day = String(r.timestamp).split('T')[0];
    if (!porDia.has(day)) porDia.set(day, { temps: [], humedad: [], viento: [], lluvia: 0, radiacion: [] });
    const d = porDia.get(day)!;
    if (r.temp_c != null) d.temps.push(r.temp_c as number);
    if (r.humedad_pct != null) d.humedad.push(r.humedad_pct as number);
    if (r.viento_kmh != null) d.viento.push(r.viento_kmh as number);
    if (r.radiacion_wm2 != null) d.radiacion.push(r.radiacion_wm2 as number);
    d.lluvia = Math.max(d.lluvia, (r.lluvia_diaria_mm as number) ?? 0);
  }

  const detalle_diario = Array.from(porDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, d]) => ({
      fecha: dia,
      temp_avg: avg(d.temps),
      temp_max: max(d.temps),
      temp_min: min(d.temps),
      humedad_avg: avg(d.humedad),
      viento_avg: avg(d.viento),
      lluvia_mm: Math.round(d.lluvia * 10) / 10,
      radiacion_avg: avg(d.radiacion),
      radiacion_max: max(d.radiacion),
    }));

  result.detalle_diario = detalle_diario;

  // Filter by specific metric if requested
  if (metric) {
    const m = metric.toLowerCase();
    if (m.includes('temp')) {
      return JSON.stringify({ periodo: result.periodo, temperatura_actual: latest.temp_c, resumen: result.resumen_periodo, detalle_diario: detalle_diario.map(d => ({ fecha: d.fecha, promedio: d.temp_avg, max: d.temp_max, min: d.temp_min })) });
    }
    if (m.includes('lluv') || m.includes('precip')) {
      return JSON.stringify({ periodo: result.periodo, lluvia_total_mm: Math.round(lluviaTotal * 10) / 10, detalle_diario: detalle_diario.map(d => ({ fecha: d.fecha, lluvia_mm: d.lluvia_mm })) });
    }
    if (m.includes('hum')) {
      return JSON.stringify({ periodo: result.periodo, humedad_actual: latest.humedad_pct, resumen: result.resumen_periodo, detalle_diario: detalle_diario.map(d => ({ fecha: d.fecha, humedad_avg: d.humedad_avg })) });
    }
    if (m.includes('vient')) {
      return JSON.stringify({ periodo: result.periodo, viento_actual: latest.viento_kmh, rafaga_actual: latest.rafaga_kmh, direccion: latest.viento_dir, resumen: result.resumen_periodo });
    }
    if (m.includes('radi') || m.includes('solar')) {
      const avgWm2 = avg(radiacion);
      const sunHoursPerDay = avgWm2 !== null ? Math.round(((avgWm2 * 24) / 1000) * 10) / 10 : null;
      return JSON.stringify({
        periodo: result.periodo,
        radiacion_actual: latest.radiacion_wm2,
        resumen: { promedio: avgWm2, maxima: max(radiacion) },
        contexto_solar: { horas_sol_dia: sunHoursPerDay, nota: 'Óptimo Hass: 5.0–7.0 h/día. Usa get_radiation_context para análisis detallado.' },
      });
    }
    if (m.includes('uv')) {
      return JSON.stringify({ periodo: result.periodo, uv_actual: latest.uv_index, resumen: { promedio: avg(uv), maximo: max(uv) } });
    }
  }

  return JSON.stringify(result);
}

// ============================================================================
// RADIATION CONTEXT (sun-hours agronomic analysis)
// ============================================================================

async function execRadiationContext(args: Record<string, unknown>): Promise<string> {
  const period = (args.period as string) || '7d';
  const now = new Date();
  let currentDays: number;
  let periodLabel: string;

  if (period === 'today') {
    currentDays = 1;
    periodLabel = 'Hoy';
  } else if (period === '7d') {
    currentDays = 7;
    periodLabel = 'Últimos 7 días';
  } else if (period === '30d') {
    currentDays = 30;
    periodLabel = 'Últimos 30 días';
  } else if (period === '90d') {
    currentDays = 90;
    periodLabel = 'Últimos 90 días';
  } else {
    // YTD
    const jan1 = `${now.getFullYear()}-01-01`;
    const prevJan1 = `${now.getFullYear() - 1}-01-01`;
    const todayStr = now.toISOString().slice(0, 10);
    const prevSameDay = `${now.getFullYear() - 1}-${todayStr.slice(5)}`;

    const currentRes = await supabaseQuery('clima_resumen_diario',
      `select=radiacion_wm2_avg&fecha=gte.${e(jan1)}&fecha=lte.${e(todayStr)}&order=fecha.asc`);
    const priorRes = await supabaseQuery('clima_resumen_diario',
      `select=radiacion_wm2_avg&fecha=gte.${e(prevJan1)}&fecha=lte.${e(prevSameDay)}&order=fecha.asc`);

    const currentRows = ((currentRes || []) as any[]).map(r => ({ radiacion_wm2_avg: r.radiacion_wm2_avg != null ? Number(r.radiacion_wm2_avg) : null }));
    const priorRows = ((priorRes || []) as any[]).map(r => ({ radiacion_wm2_avg: r.radiacion_wm2_avg != null ? Number(r.radiacion_wm2_avg) : null }));

    return JSON.stringify(buildRadiationContext(currentRows, priorRows, 'Año a la fecha'));
  }

  const cutoff = new Date(now.getTime() - currentDays * 24 * 60 * 60 * 1000);
  const priorCutoff = new Date(cutoff.getTime() - currentDays * 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().slice(0, 10);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const priorStr = priorCutoff.toISOString().slice(0, 10);

  const currentRes = await supabaseQuery('clima_resumen_diario',
    `select=radiacion_wm2_avg&fecha=gte.${e(cutoffStr)}&fecha=lte.${e(todayStr)}&order=fecha.asc`);
  const priorRes = await supabaseQuery('clima_resumen_diario',
    `select=radiacion_wm2_avg&fecha=gte.${e(priorStr)}&fecha=lt.${e(cutoffStr)}&order=fecha.asc`);

  const currentRows = ((currentRes || []) as any[]).map(r => ({ radiacion_wm2_avg: r.radiacion_wm2_avg != null ? Number(r.radiacion_wm2_avg) : null }));
  const priorRows = ((priorRes || []) as any[]).map(r => ({ radiacion_wm2_avg: r.radiacion_wm2_avg != null ? Number(r.radiacion_wm2_avg) : null }));

  return JSON.stringify(buildRadiationContext(currentRows, priorRows, periodLabel));
}

// ============================================================================
// CONDUCTIVITY DATA
// ============================================================================

async function execConductivityData(args: Record<string, unknown>): Promise<string> {
  const validated = validateDates(args);
  const { date_from, date_to } = validated;
  const { lote_name } = args as { lote_name?: string };

  // NOTE: la columna real de fecha es `fecha_monitoreo` (no `fecha_lectura`).
  // `valor_ce` ya es el promedio del lote en esa fecha; `ph` suele ser null; `lecturas` es el detalle por árbol.
  let query = `select=id,fecha_monitoreo,valor_ce,ph,num_arboles,observaciones,lote:lotes(nombre)&order=fecha_monitoreo.desc&limit=2000`;
  if (date_from) query += `&fecha_monitoreo=gte.${e(date_from)}`;
  if (date_to) query += `&fecha_monitoreo=lte.${e(date_to)}`;

  const data = await supabaseQuery('mon_conductividad', query);

  let filtered = data as Array<Record<string, unknown>>;
  if (lote_name) {
    const ln = lote_name.toLowerCase();
    filtered = filtered.filter((r) => ((r.lote as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(ln));
  }

  // Summary by lote (CE + pH)
  const byLote: Record<string, { sum: number; count: number; min: number; max: number; phSum: number; phCount: number }> = {};
  // Monthly trend (global) — útil para relacionar la evolución de la CE con las fertilizaciones en el tiempo
  const byMonth: Record<string, { sum: number; count: number }> = {};
  // Monthly trend per lote
  const byLoteMonth: Record<string, Record<string, { sum: number; count: number }>> = {};

  for (const r of filtered) {
    const ce = Number(r.valor_ce) || 0;
    const ph = r.ph != null ? Number(r.ph) : null;
    const loteName = (r.lote as Record<string, unknown>)?.nombre as string || 'Sin lote';

    if (!byLote[loteName]) byLote[loteName] = { sum: 0, count: 0, min: Infinity, max: -Infinity, phSum: 0, phCount: 0 };
    byLote[loteName].sum += ce;
    byLote[loteName].count++;
    byLote[loteName].min = Math.min(byLote[loteName].min, ce);
    byLote[loteName].max = Math.max(byLote[loteName].max, ce);
    if (ph != null) { byLote[loteName].phSum += ph; byLote[loteName].phCount++; }

    const fecha = (r.fecha_monitoreo as string) || '';
    const mes = fecha.slice(0, 7);
    if (mes) {
      if (!byMonth[mes]) byMonth[mes] = { sum: 0, count: 0 };
      byMonth[mes].sum += ce;
      byMonth[mes].count++;

      if (!byLoteMonth[loteName]) byLoteMonth[loteName] = {};
      if (!byLoteMonth[loteName][mes]) byLoteMonth[loteName][mes] = { sum: 0, count: 0 };
      byLoteMonth[loteName][mes].sum += ce;
      byLoteMonth[loteName][mes].count++;
    }
  }

  const getSemaforo = (ce: number) => ce < 0.5 ? 'verde' : ce <= 1.5 ? 'amarillo' : 'rojo';

  const resumenPorLote: Record<string, unknown> = {};
  for (const [lote, d] of Object.entries(byLote)) {
    const promedio = Math.round(d.sum / d.count * 100) / 100;
    // Serie mensual por lote (ascendente) para ver la tendencia tras cada fertilización
    const serie: Record<string, number> = {};
    const meses = Object.keys(byLoteMonth[lote] || {}).sort();
    for (const m of meses) serie[m] = Math.round(byLoteMonth[lote][m].sum / byLoteMonth[lote][m].count * 100) / 100;
    resumenPorLote[lote] = {
      promedio_ce: promedio,
      min_ce: Math.round(d.min * 100) / 100,
      max_ce: Math.round(d.max * 100) / 100,
      promedio_ph: d.phCount ? Math.round(d.phSum / d.phCount * 100) / 100 : null,
      registros: d.count,
      estado: getSemaforo(promedio),
      tendencia_mensual_ce: serie,
    };
  }

  const resumenPorMes: Record<string, unknown> = {};
  for (const mes of Object.keys(byMonth).sort()) {
    const d = byMonth[mes];
    resumenPorMes[mes] = {
      promedio_ce: Math.round(d.sum / d.count * 100) / 100,
      registros: d.count,
    };
  }

  return JSON.stringify({
    total_registros: filtered.length,
    unidad: 'dS/m',
    resumen_por_lote: resumenPorLote,
    resumen_por_mes: resumenPorMes,
    umbrales: { verde: '<0.5 dS/m', amarillo: '0.5-1.5 dS/m', rojo: '>1.5 dS/m' },
    nota: 'valor_ce es el promedio del lote en cada fecha de monitoreo. Para relacionar con fertilizaciones, cruza tendencia_mensual_ce / resumen_por_mes con get_application_summary type=Fertilizacion en el mismo rango.',
    detalle: filtered.slice(0, 10),
  });
}

// ============================================================================
// TAREAS (LABORES / KANBAN)
// ============================================================================

async function execTareas(args: Record<string, unknown>): Promise<string> {
  const validated = validateDates(args);
  const { date_from, date_to } = validated;
  const { estado, lote_name, categoria } = args as { estado?: string; lote_name?: string; categoria?: string };

  let query = `select=id,codigo_tarea,nombre,descripcion,estado,prioridad,fecha_estimada_inicio,fecha_estimada_fin,fecha_inicio_real,fecha_fin_real,jornales_estimados,observaciones,lote:lotes(nombre),responsable:empleados(nombre),tipo:tipos_tareas(nombre,categoria)&order=fecha_estimada_inicio.desc&limit=2000`;
  if (estado) query += `&estado=eq.${e(estado)}`;
  if (date_from) query += `&fecha_estimada_inicio=gte.${e(date_from)}`;
  if (date_to) query += `&fecha_estimada_inicio=lte.${e(date_to)}`;

  const data = await supabaseQuery('tareas', query);

  let filtered = data as Array<Record<string, unknown>>;
  if (lote_name) {
    const ln = lote_name.toLowerCase();
    filtered = filtered.filter((r) => ((r.lote as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(ln));
  }
  if (categoria) {
    const cn = categoria.toLowerCase();
    filtered = filtered.filter((r) => ((r.tipo as Record<string, unknown>)?.categoria as string || '').toLowerCase().includes(cn));
  }

  const porEstado: Record<string, { count: number; jornales_estimados: number }> = {};
  const porCategoria: Record<string, number> = {};
  for (const r of filtered) {
    const est = (r.estado as string) || 'Sin estado';
    if (!porEstado[est]) porEstado[est] = { count: 0, jornales_estimados: 0 };
    porEstado[est].count++;
    porEstado[est].jornales_estimados += Number(r.jornales_estimados) || 0;

    const cat = (r.tipo as Record<string, unknown>)?.categoria as string || 'Sin categoría';
    porCategoria[cat] = (porCategoria[cat] || 0) + 1;
  }
  for (const k of Object.keys(porEstado)) {
    porEstado[k].jornales_estimados = Math.round(porEstado[k].jornales_estimados * 100) / 100;
  }

  return JSON.stringify({
    total_registros: filtered.length,
    estados_posibles: ['Banco', 'Programada', 'En Proceso', 'Completada', 'Cancelada'],
    resumen_por_estado: porEstado,
    resumen_por_categoria: porCategoria,
    tareas: filtered.slice(0, 40).map((r) => ({
      codigo: r.codigo_tarea,
      nombre: r.nombre,
      estado: r.estado,
      prioridad: r.prioridad,
      categoria: (r.tipo as Record<string, unknown>)?.categoria ?? null,
      tipo: (r.tipo as Record<string, unknown>)?.nombre ?? null,
      lote: (r.lote as Record<string, unknown>)?.nombre ?? null,
      responsable: (r.responsable as Record<string, unknown>)?.nombre ?? null,
      jornales_estimados: r.jornales_estimados,
      fecha_estimada_inicio: r.fecha_estimada_inicio,
      fecha_estimada_fin: r.fecha_estimada_fin,
      fecha_inicio_real: r.fecha_inicio_real,
      fecha_fin_real: r.fecha_fin_real,
    })),
  });
}

// ============================================================================
// WEEKLY REPORTS (ARCHIVO REPORTES SEMANALES)
// ============================================================================

async function execWeeklyReports(args: Record<string, unknown>): Promise<string> {
  const { anio, numero_semana, limit } = args as { anio?: number; numero_semana?: number; limit?: number };
  const lim = typeof limit === 'number' && limit > 0 ? Math.min(limit, 52) : 12;

  let query = `select=id,numero_semana,ano,fecha_inicio,fecha_fin,generado_automaticamente,url_storage,created_at&order=ano.desc,numero_semana.desc&limit=${lim}`;
  if (typeof anio === 'number') query += `&ano=eq.${anio}`;
  if (typeof numero_semana === 'number') query += `&numero_semana=eq.${numero_semana}`;

  const data = await supabaseQuery('reportes_semanales', query) as Array<Record<string, unknown>>;

  return JSON.stringify({
    total_registros: data.length,
    reportes: data.map((r) => ({
      ano: r.ano,
      numero_semana: r.numero_semana,
      periodo: `${r.fecha_inicio} a ${r.fecha_fin}`,
      generado_automaticamente: r.generado_automaticamente,
      tiene_pdf: !!r.url_storage,
      url_pdf: r.url_storage ?? null,
      generado_el: r.created_at,
    })),
  });
}

// ============================================================================
// BEEHIVE DATA
// ============================================================================

async function execBeehiveData(args: Record<string, unknown>): Promise<string> {
  const validated = validateDates(args);
  const { date_from, date_to } = validated;
  const { apiario_name, include_config } = args as { apiario_name?: string; include_config?: boolean };

  // Query apiarios config
  let apiariosConfig: unknown[] = [];
  if (include_config !== false) {
    apiariosConfig = await supabaseQuery('apiarios', `select=id,nombre,ubicacion,total_colmenas,activo&order=nombre.asc`);
  }

  // Query beehive monitoring data
  let query = `select=id,fecha_inspeccion,colmenas_fuertes,colmenas_debiles,colmenas_muertas,colmenas_con_reina,observaciones,apiario:apiarios(nombre)&order=fecha_inspeccion.desc&limit=2000`;
  if (date_from) query += `&fecha_inspeccion=gte.${e(date_from)}`;
  if (date_to) query += `&fecha_inspeccion=lte.${e(date_to)}`;

  const data = await supabaseQuery('mon_colmenas', query);

  let filtered = data as Array<Record<string, unknown>>;
  if (apiario_name) {
    const an = apiario_name.toLowerCase();
    filtered = filtered.filter((r) => ((r.apiario as Record<string, unknown>)?.nombre as string || '').toLowerCase().includes(an));
  }

  // Summary by apiario
  const byApiario: Record<string, { fuertes: number; debiles: number; muertas: number; con_reina: number; registros: number }> = {};
  const byMonth: Record<string, { fuertes: number; total: number; registros: number }> = {};

  for (const r of filtered) {
    const apiarioName = (r.apiario as Record<string, unknown>)?.nombre as string || 'Sin apiario';
    const fuertes = (r.colmenas_fuertes as number) || 0;
    const debiles = (r.colmenas_debiles as number) || 0;
    const muertas = (r.colmenas_muertas as number) || 0;
    const conReina = (r.colmenas_con_reina as number) || 0;

    if (!byApiario[apiarioName]) byApiario[apiarioName] = { fuertes: 0, debiles: 0, muertas: 0, con_reina: 0, registros: 0 };
    byApiario[apiarioName].fuertes += fuertes;
    byApiario[apiarioName].debiles += debiles;
    byApiario[apiarioName].muertas += muertas;
    byApiario[apiarioName].con_reina += conReina;
    byApiario[apiarioName].registros++;

    const fecha = (r.fecha_inspeccion as string) || '';
    const mes = fecha.slice(0, 7);
    if (mes) {
      if (!byMonth[mes]) byMonth[mes] = { fuertes: 0, total: 0, registros: 0 };
      byMonth[mes].fuertes += fuertes;
      byMonth[mes].total += fuertes + debiles + muertas;
      byMonth[mes].registros++;
    }
  }

  // Enrich apiario summaries with % fuertes and semáforo
  const resumenPorApiario: Record<string, unknown> = {};
  for (const [name, data] of Object.entries(byApiario)) {
    const total = data.fuertes + data.debiles + data.muertas;
    const pctFuertes = total > 0 ? Math.round(data.fuertes / total * 100) : 0;
    resumenPorApiario[name] = {
      ...data,
      total_colmenas_inspeccionadas: total,
      pct_fuertes: pctFuertes,
      estado: pctFuertes >= 70 ? 'bueno' : pctFuertes >= 40 ? 'regular' : 'critico',
    };
  }

  const resumenPorMes: Record<string, unknown> = {};
  for (const [mes, data] of Object.entries(byMonth)) {
    resumenPorMes[mes] = {
      pct_fuertes: data.total > 0 ? Math.round(data.fuertes / data.total * 100) : 0,
      registros: data.registros,
    };
  }

  return JSON.stringify({
    apiarios_configurados: apiariosConfig,
    total_registros: filtered.length,
    resumen_por_apiario: resumenPorApiario,
    resumen_por_mes: resumenPorMes,
    detalle: filtered.slice(0, 10),
  });
}

async function execBudgetData(args: Record<string, unknown>): Promise<string> {
  const currentYear = new Date().getFullYear();
  const currentQ = Math.ceil((new Date().getMonth() + 1) / 3);
  const anio = (args.anio as number) || currentYear;
  const quartersStr = (args.quarters as string) || String(currentQ);
  const quarters = quartersStr.split(',').map(Number).filter((q) => q >= 1 && q <= 4).sort();
  const negocioName = (args.negocio_name as string) || 'Aguacate Hass';
  const categoriaName = args.categoria_name as string | undefined;

  // Resolve negocio
  const negocios = await supabaseQuery('fin_negocios',
    `select=id,nombre&nombre=ilike.*${e(negocioName)}*&activo=eq.true`);
  if ((negocios as unknown[]).length === 0) {
    return JSON.stringify({ error: `No se encontro negocio: ${negocioName}` });
  }
  const negocioId = (negocios as Array<Record<string, unknown>>)[0].id as string;
  const negocioNombre = (negocios as Array<Record<string, unknown>>)[0].nombre as string;

  // Fetch budgets for the year
  const budgets = await supabaseQuery('fin_presupuestos',
    `select=id,concepto_id,categoria_id,monto_anual,is_principal,fin_categorias_gastos(nombre),fin_conceptos_gastos(nombre)&anio=eq.${anio}&negocio_id=eq.${negocioId}`);

  // Quarter date ranges
  const QUARTER_MONTHS: Record<number, [number, number, number, number]> = {
    1: [1, 1, 3, 31], 2: [4, 1, 6, 30], 3: [7, 1, 9, 30], 4: [10, 1, 12, 31],
  };
  const pad = (n: number) => String(n).padStart(2, '0');

  // Aggregate actual expenses across selected quarters (current year + previous year)
  const aggregateExpenses = async (year: number, qs: number[]) => {
    const byConcepto: Record<string, { concepto_id: string; categoria: string; concepto: string; total: number }> = {};
    for (const q of qs) {
      const [sm, sd, em, ed] = QUARTER_MONTHS[q];
      const desde = `${year}-${pad(sm)}-${pad(sd)}`;
      const hasta = `${year}-${pad(em)}-${pad(ed)}`;
      const gastos = await supabaseQuery('fin_gastos',
        `select=concepto_id,categoria_id,valor,concepto:fin_conceptos_gastos(nombre),categoria:fin_categorias_gastos(nombre)&estado=eq.Confirmado&negocio_id=eq.${negocioId}&fecha=gte.${e(desde)}&fecha=lte.${e(hasta)}&limit=2000`);
      for (const g of gastos as Array<Record<string, unknown>>) {
        const cid = g.concepto_id as string;
        const val = (g.valor as number) || 0;
        if (!byConcepto[cid]) {
          byConcepto[cid] = {
            concepto_id: cid,
            categoria: ((g.categoria as Record<string, unknown>)?.nombre as string) || 'Sin categoria',
            concepto: ((g.concepto as Record<string, unknown>)?.nombre as string) || 'Sin concepto',
            total: 0,
          };
        }
        byConcepto[cid].total += val;
      }
    }
    return byConcepto;
  };

  const [actualsMap, actualsAntMap] = await Promise.all([
    aggregateExpenses(anio, quarters),
    aggregateExpenses(anio - 1, quarters),
  ]);

  // Build per-concepto rows
  const conceptoRows: Array<Record<string, unknown>> = [];
  const seenConceptos = new Set<string>();
  const qCount = quarters.length;

  // From budgets
  for (const b of budgets as Array<Record<string, unknown>>) {
    const cid = b.concepto_id as string;
    seenConceptos.add(cid);
    const montoAnual = (b.monto_anual as number) || 0;
    const pptoQ = (montoAnual * qCount) / 4;
    const actual = actualsMap[cid]?.total || 0;
    const actualAnt = actualsAntMap[cid]?.total || 0;
    const catNombre = ((b.fin_categorias_gastos as Record<string, unknown>)?.nombre as string) || '';
    const conNombre = ((b.fin_conceptos_gastos as Record<string, unknown>)?.nombre as string) || '';

    if (categoriaName && !catNombre.toLowerCase().includes(categoriaName.toLowerCase())) continue;

    conceptoRows.push({
      categoria: catNombre,
      concepto: conNombre,
      presupuesto_anual: montoAnual,
      presupuesto_periodo: pptoQ,
      ejecucion_real: actual,
      ejecucion_pct: pptoQ > 0 ? Math.round((actual / pptoQ) * 100) : null,
      periodo_anterior: actualAnt,
      variacion_yoy: actualAnt > 0 ? Math.round(((actual - actualAnt) / actualAnt) * 100) : null,
    });
  }

  // Unbudgeted conceptos with actuals
  for (const [cid, data] of Object.entries(actualsMap)) {
    if (seenConceptos.has(cid)) continue;
    if (categoriaName && !data.categoria.toLowerCase().includes(categoriaName.toLowerCase())) continue;
    const actualAnt = actualsAntMap[cid]?.total || 0;
    conceptoRows.push({
      categoria: data.categoria,
      concepto: data.concepto,
      presupuesto_anual: 0,
      presupuesto_periodo: 0,
      ejecucion_real: data.total,
      ejecucion_pct: null,
      periodo_anterior: actualAnt,
      variacion_yoy: actualAnt > 0 ? Math.round(((data.total - actualAnt) / actualAnt) * 100) : null,
      sin_presupuesto: true,
    });
  }

  // Aggregate by category
  const byCategoria: Record<string, { ppto_anual: number; ppto_q: number; real: number; real_ant: number }> = {};
  for (const row of conceptoRows) {
    const cat = row.categoria as string;
    if (!byCategoria[cat]) byCategoria[cat] = { ppto_anual: 0, ppto_q: 0, real: 0, real_ant: 0 };
    byCategoria[cat].ppto_anual += (row.presupuesto_anual as number) || 0;
    byCategoria[cat].ppto_q += (row.presupuesto_periodo as number) || 0;
    byCategoria[cat].real += (row.ejecucion_real as number) || 0;
    byCategoria[cat].real_ant += (row.periodo_anterior as number) || 0;
  }

  const categoriaSummary = Object.entries(byCategoria).map(([cat, d]) => ({
    categoria: cat,
    presupuesto_anual: d.ppto_anual,
    presupuesto_periodo: d.ppto_q,
    ejecucion_real: d.real,
    ejecucion_pct: d.ppto_q > 0 ? Math.round((d.real / d.ppto_q) * 100) : null,
    periodo_anterior: d.real_ant,
    variacion_yoy: d.real_ant > 0 ? Math.round(((d.real - d.real_ant) / d.real_ant) * 100) : null,
  })).sort((a, b) => b.ejecucion_real - a.ejecucion_real);

  // Totals
  const totalPptoAnual = conceptoRows.reduce((s, r) => s + ((r.presupuesto_anual as number) || 0), 0);
  const totalPptoQ = conceptoRows.reduce((s, r) => s + ((r.presupuesto_periodo as number) || 0), 0);
  const totalReal = conceptoRows.reduce((s, r) => s + ((r.ejecucion_real as number) || 0), 0);
  const totalRealAnt = conceptoRows.reduce((s, r) => s + ((r.periodo_anterior as number) || 0), 0);

  return JSON.stringify({
    negocio: negocioNombre,
    anio,
    trimestres_seleccionados: quarters,
    resumen: {
      presupuesto_anual_total: totalPptoAnual,
      presupuesto_periodo: totalPptoQ,
      ejecucion_real: totalReal,
      ejecucion_pct: totalPptoQ > 0 ? Math.round((totalReal / totalPptoQ) * 100) : null,
      periodo_anterior: totalRealAnt,
      variacion_yoy: totalRealAnt > 0 ? Math.round(((totalReal - totalRealAnt) / totalRealAnt) * 100) : null,
      conceptos_con_presupuesto: conceptoRows.filter((r) => (r.presupuesto_anual as number) > 0).length,
      conceptos_sin_presupuesto: conceptoRows.filter((r) => r.sin_presupuesto).length,
    },
    por_categoria: categoriaSummary,
    detalle_conceptos: conceptoRows.sort((a, b) => (b.ejecucion_real as number) - (a.ejecucion_real as number)).slice(0, 30),
  });
}

// ----------------------------------------------------------------------------
// Inventario vivo de ganado (issue #51): conteo físico por ubicación →
// finca → potrero, con variación 30 días y pendientes de confirmar.
// ----------------------------------------------------------------------------
/**
 * P&G + flujo de caja, con las mismas reglas contables que /finanzas/reportes.
 * El cálculo vive en `reportes-financieros.ts`, un port a mano de los motores
 * del frontend guardado por `src/__tests__/reportesFinancierosParidad.test.ts`.
 */
async function execPygFlujoCaja(args: Record<string, unknown>): Promise<string> {
  const vista = (['global', 'aguacate', 'ganado', 'hato'].includes(String(args.vista))
    ? String(args.vista)
    : 'global') as VistaReporte;
  const anio = Number.isFinite(Number(args.anio))
    ? Number(args.anio)
    : new Date().getFullYear();
  // El modo cosecha solo tiene sentido en aguacate: es su ciclo productivo.
  const modo: ModoReporte =
    args.modo === 'cosecha' && vista === 'aguacate' ? 'cosecha' : 'trimestres';
  const incluirFlujo = args.incluir_flujo_caja === true;

  // Dos años de gastos: el modo cosecha necesita el 2º semestre del anterior.
  const desdeGastos = `${anio - 1}-01-01`;
  const hastaGastos = `${anio}-12-31`;

  const [negocios, catGastos, conceptos, catIngresos, gastosRaw, ingresosRaw, ganadoRaw, parametros] =
    await Promise.all([
      supabaseQuery('fin_negocios', 'select=id,nombre'),
      supabaseQuery('fin_categorias_gastos', 'select=id,nombre,tipo_costo'),
      supabaseQuery('fin_conceptos_gastos', 'select=id,tipo_costo'),
      supabaseQuery('fin_categorias_ingresos', 'select=id,nombre'),
      supabaseQueryAll(
        'fin_gastos',
        `select=id,fecha,negocio_id,valor,estado,categoria_id,concepto_id&fecha=gte.${e(desdeGastos)}&fecha=lte.${e(hastaGastos)}&order=id`
      ),
      supabaseQueryAll('fin_ingresos', 'select=id,fecha,negocio_id,valor,categoria_id,cosecha,cantidad&order=id'),
      // Histórico COMPLETO: el costo promedio móvil del ganado es path-dependent.
      supabaseQueryAll('fin_transacciones_ganado', 'select=id,fecha,tipo,cantidad_cabezas,kilos_pagados,valor_total&order=id'),
      supabaseQuery('fin_parametros', 'select=clave,anio,valor'),
    ]);

  const mapaCatGastos = new Map(
    (catGastos as { id: string; nombre: string; tipo_costo: string | null }[]).map((c) => [c.id, c])
  );
  const mapaConceptos = new Map(
    (conceptos as { id: string; tipo_costo: string | null }[]).map((c) => [c.id, c])
  );
  const mapaCatIngresos = new Map(
    (catIngresos as { id: string; nombre: string }[]).map((c) => [c.id, c])
  );

  const tipoCosto = (v: string | null | undefined) =>
    v === 'directo' || v === 'indirecto' ? v : null;
  const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(n) ? n : 0;
  };
  const numONull = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };

  const datos: DatosReportes = {
    anio,
    negocios: negocios as { id: string; nombre: string }[],
    gastos: (gastosRaw as Record<string, unknown>[]).map((g): GastoRow => {
      const cat = mapaCatGastos.get(String(g.categoria_id));
      const con = mapaConceptos.get(String(g.concepto_id));
      return {
        id: String(g.id),
        fecha: String(g.fecha),
        negocio_id: String(g.negocio_id),
        valor: num(g.valor),
        estado: g.estado == null ? null : String(g.estado),
        categoria_id: g.categoria_id == null ? null : String(g.categoria_id),
        categoria_nombre: cat?.nombre ?? null,
        categoria_tipo_costo: tipoCosto(cat?.tipo_costo),
        concepto_tipo_costo: tipoCosto(con?.tipo_costo),
      };
    }),
    ingresos: (ingresosRaw as Record<string, unknown>[]).map((i): IngresoRow => ({
      id: String(i.id),
      fecha: String(i.fecha),
      negocio_id: String(i.negocio_id),
      valor: num(i.valor),
      categoria_id: i.categoria_id == null ? null : String(i.categoria_id),
      categoria_nombre: mapaCatIngresos.get(String(i.categoria_id))?.nombre ?? null,
      cosecha: i.cosecha == null ? null : String(i.cosecha),
      cantidad: numONull(i.cantidad),
    })),
    ganado: (ganadoRaw as Record<string, unknown>[])
      .filter((t) => t.tipo === 'compra' || t.tipo === 'venta')
      .map((t): GanadoRow => ({
        id: String(t.id),
        fecha: String(t.fecha),
        tipo: t.tipo as 'compra' | 'venta',
        cantidad_cabezas: num(t.cantidad_cabezas),
        kilos_pagados: numONull(t.kilos_pagados),
        valor_total: num(t.valor_total),
      })),
    parametros: (parametros as Record<string, unknown>[]).map((p) => ({
      clave: String(p.clave),
      anio: p.anio == null ? null : Number(p.anio),
      valor: num(p.valor),
    })),
  };

  const pyg = construirResumenPyG(datos, construirPeriodos(anio, modo), vista, modo);
  const salida: Record<string, unknown> = { pyg };

  if (incluirFlujo) salida.flujo_caja = construirResumenFlujoCaja(datos, vista);

  return JSON.stringify(salida);
}

async function execGanadoInventory(args: Record<string, unknown>): Promise<string> {
  const { ubicacion_name, finca_name, include_movimientos } = args as {
    ubicacion_name?: string;
    finca_name?: string;
    include_movimientos?: boolean;
  };
  const { date_from, date_to } = validateDates(args);

  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 30);
  const desde = date_from || hace30.toISOString().split('T')[0];

  let movQuery = `select=tipo,estado,fecha,novillos_delta,toros_delta,potrero_origen_id,potrero_destino_id,peso_promedio_kg,notas&estado=eq.confirmado&fecha=gte.${e(desde)}&order=fecha.desc&limit=200`;
  if (date_to) movQuery += `&fecha=lte.${e(date_to)}`;

  const [ubicaciones, fincas, potreros, inventario, movimientos, pendientes] = await Promise.all([
    supabaseQuery('gan_ubicaciones', 'select=id,nombre') as Promise<GanUbicacionRow[]>,
    supabaseQuery('gan_fincas', 'select=id,nombre,ubicacion_id,hectareas,activa') as Promise<GanFincaRow[]>,
    supabaseQuery('gan_potreros', 'select=id,nombre,finca_id,activo') as Promise<GanPotreroRow[]>,
    supabaseQuery('gan_inventario', 'select=potrero_id,novillos,toros,peso_promedio_kg,updated_at') as Promise<GanInventarioRow[]>,
    supabaseQuery('gan_movimientos', movQuery) as Promise<GanMovimientoRow[]>,
    supabaseQuery('gan_movimientos', 'select=id,tipo,fecha,novillos_delta,toros_delta,peso_promedio_kg,notas&estado=eq.pendiente&order=fecha.desc') as Promise<GanMovimientoRow[]>,
  ]);

  const summary = buildGanadoInventorySummary({
    ubicaciones,
    fincas,
    potreros,
    inventario,
    movimientos30d: movimientos,
    pendientes,
    filtroUbicacion: ubicacion_name,
    filtroFinca: finca_name,
  });

  return JSON.stringify({
    ...summary,
    periodo_movimientos: { desde, hasta: date_to || 'hoy' },
    ...(include_movimientos
      ? { movimientos_recientes: renderMovimientosRecientes(movimientos, potreros, fincas) }
      : {}),
  });
}

// ----------------------------------------------------------------------------
// HATO LECHERO (S7, plan §7.2 "Esco: 3 herramientas nuevas") — get_hato_animal,
// get_hato_reproduccion, get_hato_produccion. Toda la agregación/forma vive en
// `hato-aggregation.ts`; aquí solo se consultan las tablas y se pasa la data ya
// tipada. `hato_config` se lee EN VIVO en cada llamada (nunca cacheado ni
// hardcodeado) via `construirHatoConfigDesdeFilas`, que lanza un error
// explícito si falta alguna clave -- mismo contrato que `hato-chequeo-preview.ts`.
// ----------------------------------------------------------------------------

const HATO_ANIMAL_COLS = 'id,numero,nombre,sexo,etapa,raza,estado,fecha_estado,fecha_nacimiento,fecha_nacimiento_confianza,madre_id,padre_toro_id,padre_id,origen,confianza,notas';

async function fetchHatoConfig(): Promise<HatoConfig> {
  const filas = (await supabaseQuery('hato_config', 'select=clave,valor')) as FilaHatoConfig[];
  return construirHatoConfigDesdeFilas(filas);
}

async function execHatoAnimal(args: Record<string, unknown>): Promise<string> {
  const { numero, nombre } = args as { numero?: number; nombre?: string };
  if (numero == null && !nombre) {
    return JSON.stringify({ error: 'Debes indicar "numero" (chapeta) o "nombre" del animal.' });
  }

  const filtro = numero != null ? `numero=eq.${Number(numero)}` : `nombre=ilike.*${e(String(nombre))}*`;
  const candidatos = (await supabaseQuery('hato_animales', `select=${HATO_ANIMAL_COLS}&${filtro}&limit=10`)) as HatoAnimalRow[];

  if (candidatos.length === 0) {
    return JSON.stringify({
      encontrado: false,
      criterio_busqueda: numero != null ? { numero } : { nombre },
      mensaje: 'No se encontró ningún animal del Hato Lechero con ese criterio.',
    });
  }
  if (candidatos.length > 1) {
    return JSON.stringify({
      encontrado: false,
      criterio_busqueda: { nombre },
      mensaje: `${candidatos.length} animales coinciden con ese nombre. Pide precisar el número de chapeta o un nombre más específico.`,
      coincidencias: shapeAnimalMatches(candidatos),
    });
  }

  const animal = candidatos[0];
  const fechaReferencia = new Date().toISOString().split('T')[0];

  const [config, madreRows, padreAnimalRows, padreToroRows, estadoActualRows, eventosRows] = await Promise.all([
    fetchHatoConfig(),
    animal.madre_id
      ? (supabaseQuery('hato_animales', `select=${HATO_ANIMAL_COLS}&id=eq.${e(animal.madre_id)}`) as Promise<HatoAnimalRow[]>)
      : Promise.resolve([]),
    animal.padre_id
      ? (supabaseQuery('hato_animales', `select=${HATO_ANIMAL_COLS}&id=eq.${e(animal.padre_id)}`) as Promise<HatoAnimalRow[]>)
      : Promise.resolve([]),
    animal.padre_toro_id
      ? (supabaseQuery('hato_toros', `select=id,nombre,tipo,raza,activo&id=eq.${e(animal.padre_toro_id)}`) as Promise<HatoToroRow[]>)
      : Promise.resolve([]),
    supabaseQuery('v_hato_estado_actual', `select=*&animal_id=eq.${e(animal.id)}`) as Promise<Array<Record<string, unknown>>>,
    supabaseQuery(
      'hato_eventos',
      `select=tipo,fecha,fecha_confianza,tipo_servicio,cria_destino,datos,toro:hato_toros(nombre)&animal_id=eq.${e(animal.id)}&order=fecha.desc&limit=20`
    ) as Promise<HatoEventoRow[]>,
  ]);

  const estadoActualRaw = estadoActualRows[0] ?? null;
  const estadoActual = estadoActualRaw ? (estadoActualRaw as unknown as HatoEstadoActualRow) : null;

  let ultimoChequeo: HatoChequeoVacaDetalleRow | null = null;
  const ultimoChequeoVacaId = estadoActual?.ultimo_chequeo_vaca_id;
  if (ultimoChequeoVacaId) {
    const rows = (await supabaseQuery(
      'hato_chequeo_vacas',
      `select=pl,num_partos,fecha_servicio,toro,tipo_servicio,meses_prenez,fecha_secar,fecha_probable_parto,estado,estado_raw,normalizacion_issues,hato_chequeos(fecha)&id=eq.${e(ultimoChequeoVacaId)}`
    )) as Array<Record<string, unknown>>;
    const fila = rows[0];
    if (fila) {
      const chequeo = fila.hato_chequeos as { fecha: string } | { fecha: string }[] | null;
      const chequeoFecha = Array.isArray(chequeo) ? chequeo[0]?.fecha ?? null : chequeo?.fecha ?? null;
      ultimoChequeo = {
        pl: fila.pl as number | null,
        num_partos: fila.num_partos as number | null,
        fecha_servicio: fila.fecha_servicio as string | null,
        toro: fila.toro as string | null,
        tipo_servicio: fila.tipo_servicio as string | null,
        meses_prenez: fila.meses_prenez as number | null,
        fecha_secar: fila.fecha_secar as string | null,
        fecha_probable_parto: fila.fecha_probable_parto as string | null,
        estado: fila.estado as string | null,
        estado_raw: fila.estado_raw as string | null,
        normalizacion_issues: fila.normalizacion_issues,
        chequeo_fecha: chequeoFecha,
      };
    }
  }

  const ficha = buildAnimalFicha({
    animal,
    madre: madreRows[0] ?? null,
    padreAnimal: padreAnimalRows[0] ?? null,
    padreToro: padreToroRows[0] ?? null,
    estadoActual,
    config,
    fechaReferencia,
    eventosRecientes: eventosRows,
    ultimoChequeo,
  });

  return JSON.stringify(ficha);
}

async function execHatoReproduccion(_args: Record<string, unknown>): Promise<string> {
  const fechaReferencia = new Date().toISOString().split('T')[0];
  const [config, filas] = await Promise.all([
    fetchHatoConfig(),
    supabaseQuery('v_hato_estado_actual', 'select=*') as Promise<Array<Record<string, unknown>>>,
  ]);

  const summary = buildReproduccionSummary(filas as unknown as HatoEstadoActualRow[], config, fechaReferencia);

  return JSON.stringify(summary);
}

async function execHatoProduccion(args: Record<string, unknown>): Promise<string> {
  const { animal_numero, num_quincenas } = args as { animal_numero?: number; num_quincenas?: number };
  const { date_from, date_to } = validateDates(args);

  const hoy = new Date().toISOString().split('T')[0];
  const hace90 = new Date();
  hace90.setDate(hace90.getDate() - 90);
  const desde = date_from || hace90.toISOString().split('T')[0];
  const hasta = date_to || hoy;

  let pesajesQuery = `select=fecha,litros_am,litros_pm,litros_total,animal:hato_animales(numero,nombre)&fecha=gte.${e(desde)}&fecha=lte.${e(hasta)}&order=fecha.asc&limit=2000`;
  if (animal_numero != null) {
    // El número de chapeta vive en la tabla embebida -- se resuelve el
    // animal_id primero para poder filtrar server-side.
    const animalRows = (await supabaseQuery('hato_animales', `select=id&numero=eq.${Number(animal_numero)}`)) as Array<{ id: string }>;
    if (animalRows.length === 0) {
      return JSON.stringify({ error: `No existe ningún animal con numero=${animal_numero}.` });
    }
    pesajesQuery += `&animal_id=eq.${e(animalRows[0].id)}`;
  }

  const limiteQuincenas = Number.isFinite(Number(num_quincenas)) && Number(num_quincenas) > 0 ? Number(num_quincenas) : 6;

  const [pesajes, quincenas] = await Promise.all([
    supabaseQuery('hato_pesajes_leche', pesajesQuery) as Promise<HatoPesajeRow[]>,
    supabaseQuery(
      'hato_produccion_quincenal',
      `select=anio,mes,quincena,fecha_inicio,fecha_fin,litros_total,litros_pomar_confirmado,num_vacas_ordeno,notas&order=anio.desc,mes.desc,quincena.desc&limit=${limiteQuincenas}`
    ) as Promise<HatoProduccionQuincenalRow[]>,
  ]);

  const summary = buildProduccionSummary({
    periodo: { desde, hasta },
    pesajes,
    produccionQuincenal: quincenas,
  });

  return JSON.stringify(summary);
}

// ----------------------------------------------------------------------------
// PEST RISK PRIORITIZATION (P2b, docs/PLAN_PRIORIZACION_MONITOREO.md)
//
// Fetches the same tables/lookback windows as
// src/components/monitoreo/hooks/usePriorizacionMonitoreo.ts and delegates ALL
// ranking logic to priorizarMonitoreo() from ./priorizacion-scouting.ts (the
// Deno-side port of src/utils/priorizacionMonitoreo.ts) — no ranking logic is
// re-implemented here, only fetch + shape + filter/limit, exactly like the
// frontend hook does.
// ----------------------------------------------------------------------------

const LOOKBACK_MONITOREOS_DIAS_PRIORIZACION = 200; // ~6.5 meses, igual que el hook
const LOOKBACK_FUMIGACIONES_DIAS_PRIORIZACION = 730; // ~2 años, igual que el hook

interface MonitoreoPriorizacionRow {
  fecha_monitoreo: string;
  ronda_id: string;
  lote_id: string;
  sublote_id: string | null;
  plaga_enfermedad_id: string;
  arboles_monitoreados: number;
  arboles_afectados: number;
  incidencia: number;
  lote: { nombre: string } | null;
  sublote: { nombre: string } | null;
  plaga: { nombre: string } | null;
}

/** Agrupa filas crudas de `monitoreos` en historiales por (sublote, plaga
 * individual). No agrupa el complejo de ácaros -- eso lo hace
 * `priorizarMonitoreo` internamente vía `pest_umbral_economico.grupo_key`,
 * igual que agruparHistoriales() en el hook del frontend. */
function agruparHistorialesPriorizacion(rows: MonitoreoPriorizacionRow[]): HistorialSublotePlaga[] {
  const grupos = new Map<string, HistorialSublotePlaga>();

  for (const row of rows) {
    if (!row.sublote_id) continue; // el ranking es a nivel sublote

    const key = `${row.sublote_id}|${row.plaga_enfermedad_id}`;
    let grupo = grupos.get(key);
    if (!grupo) {
      grupo = {
        sublote_id: row.sublote_id,
        sublote_nombre: row.sublote?.nombre,
        lote_id: row.lote_id,
        lote_nombre: row.lote?.nombre,
        pest_id: row.plaga_enfermedad_id,
        pest_nombre: row.plaga?.nombre,
        rondas: [],
      };
      grupos.set(key, grupo);
    }

    grupo.rondas.push({
      // NUNCA reformatear: debe coincidir exactamente con el valor de la fila
      // para que observaciones de la misma ronda compartan el mismo string de
      // fecha y el pooling del complejo de ácaros funcione (ver el hook).
      fecha_monitoreo: row.fecha_monitoreo,
      ronda_id: row.ronda_id,
      incidencia: Number(row.incidencia) || 0,
      arboles_monitoreados: row.arboles_monitoreados,
      arboles_afectados: row.arboles_afectados,
    });
  }

  return Array.from(grupos.values());
}

async function execPestPriorizacion(args: Record<string, unknown>): Promise<string> {
  const { lote_name, pest_name, top_n } = args as { lote_name?: string; pest_name?: string; top_n?: number };
  const topN = typeof top_n === 'number' && top_n > 0 ? Math.floor(top_n) : 10;

  const fechaHaceNDias = (dias: number): string => {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return d.toISOString().split('T')[0];
  };

  const desdeMonitoreos = fechaHaceNDias(LOOKBACK_MONITOREOS_DIAS_PRIORIZACION);
  const desdeFumigaciones = fechaHaceNDias(LOOKBACK_FUMIGACIONES_DIAS_PRIORIZACION);

  const [monitoreosRows, umbralesRows, perfilesRows, movimientosRows, rondaActualRows] = await Promise.all([
    supabaseQuery(
      'monitoreos',
      `select=fecha_monitoreo,ronda_id,lote_id,sublote_id,plaga_enfermedad_id,arboles_monitoreados,arboles_afectados,incidencia,lote:lotes(nombre),sublote:sublotes(nombre),plaga:plagas_enfermedades_catalogo(nombre)&fecha_monitoreo=gte.${e(desdeMonitoreos)}&order=fecha_monitoreo.asc&limit=5000`,
    ) as Promise<MonitoreoPriorizacionRow[]>,
    supabaseQuery('pest_umbral_economico', 'select=pest_id,grupo_key,umbral_pct,source_label') as Promise<UmbralEconomico[]>,
    supabaseQuery('pest_seasonal_profile', 'select=pest_id,lote_id,week_of_year,historical_tier,n_years_observed') as Promise<PerfilEstacional[]>,
    supabaseQuery(
      'movimientos_diarios',
      `select=lote_id,fecha_movimiento&lote_id=not.is.null&fecha_movimiento=gte.${e(desdeFumigaciones)}`,
    ) as Promise<Array<{ lote_id: string; fecha_movimiento: string }>>,
    supabaseQuery('rondas_monitoreo', 'select=id&order=fecha_inicio.desc&limit=1') as Promise<Array<{ id: string }>>,
  ]);

  // Sin ninguna ronda registrada todavía: nada que priorizar.
  const rondaActualId = rondaActualRows[0]?.id;
  if (!rondaActualId) {
    return JSON.stringify({ total_registros: 0, total_evaluado: 0, filtros: { lote_name: lote_name ?? null, pest_name: pest_name ?? null, top_n: topN }, top: [] });
  }

  const historiales = agruparHistorialesPriorizacion(monitoreosRows);
  const umbrales: UmbralEconomico[] = umbralesRows.map((u) => ({
    pest_id: u.pest_id,
    grupo_key: u.grupo_key,
    umbral_pct: Number(u.umbral_pct),
    source_label: u.source_label,
  }));
  const perfilesEstacionales: PerfilEstacional[] = perfilesRows.map((p) => ({
    pest_id: p.pest_id,
    lote_id: p.lote_id,
    week_of_year: p.week_of_year,
    historical_tier: p.historical_tier,
    n_years_observed: p.n_years_observed,
  }));
  const ultimasFumigaciones: EventoFumigacion[] = movimientosRows.map((m) => ({
    lote_id: m.lote_id,
    fecha: m.fecha_movimiento,
  }));

  const ranked = priorizarMonitoreo({
    historiales,
    umbrales,
    perfilesEstacionales,
    ultimasFumigaciones,
    rondaActualId,
  });

  let filtered = ranked;
  if (lote_name) {
    const ln = lote_name.toLowerCase();
    filtered = filtered.filter(
      (r) => (r.lote_nombre || '').toLowerCase().includes(ln) || (r.sublote_nombre || '').toLowerCase().includes(ln),
    );
  }
  if (pest_name) {
    const pn = pest_name.toLowerCase();
    filtered = filtered.filter((r) => r.pest_nombre.toLowerCase().includes(pn));
  }

  const top = filtered.slice(0, topN).map((r) => ({
    lote: r.lote_nombre,
    sublote: r.sublote_nombre,
    plaga: r.pest_nombre,
    grupo_key: r.grupo_key,
    tier: r.tier,
    estado: r.tier === 'A' ? r.estadoUmbral : r.gravedad?.texto,
    umbral_pct: r.umbralPct,
    umbral_fuente: r.umbralSourceLabel,
    incidencia_actual: r.incidenciaActual,
    incidencia_anterior: r.incidenciaAnterior,
    cambio: r.cambioFormateado,
    tendencia: r.tendencia,
    temporada_alta: r.temporadaAlta,
    historical_tier: r.historicalTier,
    dias_desde_ultima_fumigacion: r.diasDesdeUltimaFumigacion,
    num_rondas: r.numRondas,
    why: r.why,
  }));

  return JSON.stringify({
    total_registros: filtered.length,
    total_evaluado: ranked.length,
    filtros: { lote_name: lote_name ?? null, pest_name: pest_name ?? null, top_n: topN },
    top,
  });
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export function getSystemPrompt(memorias: PersistedMemory[] = []): string {
  const hoy = new Date().toISOString().split('T')[0];
  const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const diaSemana = diasSemana[new Date().getDay()];
  const memoriasBlock = renderMemoriasBlock(memorias);
  return `Eres "Esco", el asistente de datos de Escocia Hass, una finca de aguacate Hass en Colombia.
Tu rol es consultar datos operativos de la finca y responder preguntas del gerente.

REGLAS:
- SIEMPRE usa las herramientas disponibles para consultar datos antes de responder cualquier pregunta sobre la finca. NUNCA respondas sobre datos sin haber llamado al menos una herramienta primero.
- Responde en espanol, tono profesional pero conversacional
- Usa las herramientas para obtener datos reales — nunca inventes datos
- Si no tienes datos suficientes, dilo claramente
- Formatea cifras de dinero en COP con separadores de miles ($1.250.000)
- Usa porcentajes y comparaciones cuando sean utiles
- NO puedes modificar datos, solo consultarlos
- Cuando muestres tablas o listas, usa formato markdown
- Solo pide aclaracion cuando genuinamente NO puedas determinar que datos quiere el usuario. NO pidas confirmacion de fechas, años o rangos que se puedan inferir razonablemente.

MANEJO DE FECHAS (OBLIGATORIO):
- Fecha actual: ${hoy} (${diaSemana})
- SIEMPRE infiere rangos de fecha sin pedir aclaracion:
  - "este mes" → 1 al ultimo dia del mes actual
  - "el mes pasado" → mes anterior completo
  - "este trimestre" → Q1(ene-mar), Q2(abr-jun), Q3(jul-sep), Q4(oct-dic) segun mes actual
  - "este año" → 1 enero a hoy
  - "esta semana" → lunes a domingo de la semana actual
  - "la semana pasada" → lunes a domingo de la semana anterior
  - "diciembre a marzo" → dic del año anterior a mar del actual (si estamos en ene-jun)
  - "ultimos N meses" → N meses atras hasta hoy
- NUNCA pidas confirmacion de año o rango cuando se puede inferir razonablemente

FORMATO DE RESPUESTA (prioridad):
1. GRAFICOS — cuando hay dimension temporal o comparaciones entre categorias, SIEMPRE incluye gráficos. Nunca digas que no puedes generar graficos.
2. TABLAS — para datos tabulares detallados, usa tablas markdown.
3. VIÑETAS — para alertas o hallazgos clave.
4. TEXTO — solo para explicaciones y contexto narrativo.

COMO CREAR GRAFICOS:
Usa bloques de codigo con lenguaje "chart" y JSON valido:
\`\`\`chart
{"type":"bar","title":"Titulo","data":[{"name":"Cat1","value":100}],"xKey":"name","yKey":"value","yFormat":"currency"}
\`\`\`
Tipos: bar (comparar categorias), line (tendencias temporales), pie (distribucion), area (volumenes).
yFormat: currency (pesos colombianos), number, percent, kg.
Para multiples series: yKey como array ["serie1","serie2"] con colors array.
IMPORTANTE: El JSON del grafico debe ser valido y estar en una sola linea o con formato JSON valido. No uses comillas simples ni trailing commas.

DOMINIOS DE DATOS DISPONIBLES:
- Labores: tablero de tareas planeadas/en ejecucion (get_tareas: estado Banco/Programada/En Proceso/Completada/Cancelada, prioridad, categoria, lote, responsable, jornales estimados) y registros de trabajo / jornales YA ejecutados por empleado/contratista/lote (get_labor_summary)
- Empleados y Contratistas: personal, cargos, salarios, tarifas
- Monitoreo: plagas/enfermedades, incidencia, severidad, tendencias por lote. Incluye estado fenológico de floración (brotes, flor madura, cuaje)
- Priorizacion de monitoreo (get_pest_risk_priorizacion): ranking en vivo de que lote/sublote x plaga amerita revision esta semana, basado en umbral economico Cartama (cuando existe), tendencia y estacionalidad historica de ESTA finca. Distinto de web_search_agronomic (esa es informacion externa, no datos de la finca)
- Aplicaciones: fumigaciones, fertilizaciones, drench, productos usados, costos
- Costos por lote: desglose insumos + mano de obra y costo por arbol para una aplicacion (get_application_cost_by_lote) o sumando todas las aplicaciones en un rango de fechas (get_cost_by_lote)
- Conocimiento agronomico externo (web_search_agronomic): compatibilidad de productos, dosis, umbrales economicos, regulacion ICA — siempre con fuentes citadas
- Pronostico del clima 5-7 dias (get_weather_forecast): para decidir ventanas de aplicacion
- Inventario: productos agricolas, stock, movimientos, compras
- Finanzas: gastos (solo Confirmados), ingresos, transacciones de ganado, categorias, busqueda por nombre
- Inventario vivo de ganado de ceba (get_ganado_inventory): cabezas actuales (novillos/toros) por ubicacion → finca → potrero, cabezas/ha, peso promedio, variacion 30 dias, muertes/traslados/ajustes y movimientos pendientes de confirmar. NO incluye el Hato Lechero. Para el DINERO de compras/ventas de ganado usa get_financial_summary type=ganado; para el CONTEO fisico usa get_ganado_inventory
- Hato Lechero (vacas/terneras/novillas individuales, modulo distinto de ganado de ceba): get_hato_animal trae la ficha de UN animal por numero de chapeta o nombre (raza, genealogia madre+padre, estado reproductivo actual, eventos recientes, ultimo chequeo veterinario). get_hato_reproduccion trae el panorama del hato completo: conteo por las 3 categorias (terneras/novillas, hato en ordeño, horro = secas o proximas a secar), conteo por estado reproductivo, alertas activas (secado/rechequeo/servicio sin confirmar/parto proximo), listas de proximos partos y proximas a secar con dias restantes, y vacas vacias marcadas "problema". get_hato_produccion trae el volumen de leche: pesaje SEMANAL por vaca (litros/vaca — una vaca sin pesaje en el rango no aparece, nunca se reporta con 0) y produccion QUINCENAL vendida al camion del Pomar (litros totales, litros/vaca, conciliacion contra la confirmacion del Pomar). Numeros de chapeta 800-999 son de TRABAJO (colisiones sin resolver de la importacion historica), nunca una caravana fisica — get_hato_animal lo marca explicito. Para el DINERO de la venta de leche usa get_financial_summary o get_pyg_flujo_caja vista=hato.
- P&G y flujo de caja (get_pyg_flujo_caja): estado de resultados por negocio (global, aguacate, ganado, hato) con Ingresos → Costos directos → Margen de contribucion → Gastos indirectos → Utilidad operativa, en trimestres acumulados o por cosecha (aguacate), mas indicadores unitarios (costo por kilo, $/litro, margen por cabeza) y flujo de caja mensual opcional. USA ESTE TOOL para toda pregunta de rentabilidad, utilidad, margen o "cuanto gano/perdio X"; usa get_financial_summary solo para listar o desglosar gastos e ingresos por categoria, proveedor o comprador.
  REGLAS CONTABLES que debes respetar al interpretar sus cifras, porque son la razon de que no coincidan con una simple resta de ingresos menos gastos:
  · Solo cuentan gastos Confirmados; los Pendientes salen listados en advertencias y NO estan sumados.
  · Comprar ganado NO es un gasto: es inventario. Solo el costo de las cabezas VENDIDAS entra al P&G, a promedio ponderado por cabeza. En el flujo de caja la compra SI aparece como salida. Si el usuario se extraña de que un mes con compra grande no golpee la utilidad, esa es la razon.
  · Un periodo de ganado sin ventas da margen negativo y es correcto: es el costo de sostener el hato mientras engorda.
  · En modo cosecha, cada cosecha carga los gastos del semestre en que se trabajo esa fruta (Principal 2026 ← jul-dic 2025), asi que mezcla dos años calendario a proposito.
  · No hay prorrateo entre negocios: los gastos de Oficina Central no los carga ningun negocio y solo aparecen en la vista global. Al comparar utilidades por negocio, mencionalo si es relevante.
  · Si las advertencias mencionan que falta el inventario inicial de ganado, avisa que el costo de venta es aproximado.
- Presupuesto: control presupuestal por concepto de gasto, ejecucion real vs presupuesto asignado, % de ejecucion, comparativo año anterior. Soporta multiples trimestres (ej: Q1+Q2)
- Produccion: kilos por lote, kg/arbol, cosechas principal/traviesa
- Cosechas y Despachos: kilos cosechados, preseleccion, despachos a clientes
- Lotes: configuracion de la finca, arboles por tamano, sublotes
- Conductividad Eléctrica (get_conductivity_data): CE del suelo por lote, promedios, pH, umbrales semáforo (verde <0.5, amarillo 0.5-1.5, rojo >1.5 dS/m) y tendencia mensual por lote. Para explicar la evolución de la CE en el tiempo, cruza la tendencia mensual con las fertilizaciones del mismo rango (get_application_summary type=Fertilizacion): tras una fertilización la CE suele subir y luego bajar con el riego/lavado
- Reportes semanales (get_weekly_reports): archivo de reportes semanales generados (semana, año, periodo, PDF). Para el resumen en vivo de la semana usa get_weekly_overview
- Colmenas y Apiarios: estado de salud (fuertes/débiles/muertas/con reina), configuración de apiarios
- Clima: temperatura, humedad, precipitacion, viento (velocidad/rafaga/direccion), radiacion solar, indice UV — datos de estacion Weather Underground sincronizados cada 5 minutos

RUTEO DE HERRAMIENTAS PARA COSTOS:
- "Cuanto costo la aplicacion X por lote/por arbol?" → get_application_cost_by_lote (insumos + mano de obra desglosados por lote)
- "Que lote es mas caro de mantener este trimestre/año?" → get_cost_by_lote con date_from y date_to
- "Costo total de la aplicacion X" → get_application_summary o get_application_details (incluyen costo_total, costo_total_insumos, costo_total_mano_obra)

RUTEO DE HERRAMIENTAS PARA PRIORIZACION DE MONITOREO (OBLIGATORIO):
- "Que debo revisar esta semana?", "que lotes/plagas necesitan atencion?", "como va el riesgo de X plaga en Y lote?" → get_pest_risk_priorizacion. Devuelve un ranking en vivo (tier A = umbral economico Cartama validado, tier B = tercil estadistico de referencia sin umbral validado) con la razon ("why") de cada entrada.
- NUNCA confundas esto con web_search_agronomic: get_pest_risk_priorizacion usa datos y umbrales YA cargados de ESTA finca (monitoreos, pest_umbral_economico, pest_seasonal_profile); web_search_agronomic busca informacion agronomica externa en internet. Si la pregunta es sobre el riesgo/prioridad actual de la finca, usa get_pest_risk_priorizacion, no busques en la web.
- Esta herramienta solo indica DONDE mirar, no prescribe ni ejecuta acciones de fumigacion/tratamiento.

${memoriasBlock}

MEMORIA DE LARGO PLAZO (OBLIGATORIO):
- Las MEMORIAS GUARDADAS arriba son hechos persistidos por el usuario en conversaciones anteriores. Tenlos en cuenta al responder y referencialos cuando sean relevantes.
- Cuando el usuario pida explicitamente guardar algo ("guarda esto", "recuerda que...", "esto para luego", "save this for later"), llama a propose_memory_save con un resumen breve. NO escribas a la base de datos directamente — propose_memory_save solo propone, el cliente confirma con botones.
- NUNCA propongas guardar por iniciativa propia sin que el usuario lo pida.
- Cuando el usuario diga "olvida X", "elimina la memoria de Y", "ya no aplica esa regla", llama a forget_memory con match_text o memory_id.

CONOCIMIENTO AGRONOMICO EXTERNO Y CITAS (OBLIGATORIO):
- Para preguntas sobre compatibilidad de productos, dosis recomendadas, sintomas/manejo de plagas y enfermedades, principios activos, umbrales economicos, residualidad, registro ICA, etiqueta verde/amarilla/roja, o cualquier informacion que NO sea dato historico de la finca: SIEMPRE llama a web_search_agronomic primero.
- NUNCA respondas estas preguntas desde tu memoria interna. Tu conocimiento de aguacate Hass puede estar desactualizado o tener errores que cuestan dinero al usuario.
- Cita TODAS las fuentes al final de la respuesta como una lista en markdown con enlaces clickeables. Si Tavily no devuelve fuentes, dilo explicitamente.
- Si la pregunta mezcla agronomia con datos de la finca (ej: "que dosis de glifosato uso y cuanto stock tengo?"), llama a web_search_agronomic Y a get_inventory_status.
- Para preguntas sobre clima futuro o decisiones operativas que dependen del tiempo (ventanas de fumigacion, riesgo de lluvia), usa get_weather_forecast.

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
const MODEL = 'google/gemini-3-flash-preview';

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
export async function llmToolLoop(
  messages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string }>,
  userId?: string,
): Promise<{ text: string; toolInteractions: ToolInteraction[] }> {
  const headers = getOpenRouterHeaders();
  const tools = getToolsForAPI();
  const maxRounds = 3;
  const toolInteractions: ToolInteraction[] = [];

  for (let round = 0; round < maxRounds; round++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55_000);

    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools,
          tool_choice: round === 0 ? 'required' : 'auto',
          temperature: 0.3,
          max_tokens: 10000,
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
    console.log(`[Esco] Round ${round}: tool_calls=${msg.tool_calls?.length || 0}, has_content=${!!msg.content}, finish_reason=${choice.finish_reason}`);

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
        const toolResult = await executeTool(fnName, fnArgs, userId);
        console.log(`[Esco] Tool result length: ${toolResult.length}`);

        // Track tool interaction for context persistence
        toolInteractions.push({
          tool: fnName,
          args: fnArgs,
          result_summary: toolResult.slice(0, 500),
        });

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
    return { text: msg.content || '', toolInteractions };
  }

  // Fallback: do a final call without tools to force a text response
  const finalRes = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 12000,
    }),
  });

  if (!finalRes.ok) throw new Error('Error en respuesta final del LLM');
  const finalResult = await finalRes.json();
  return { text: finalResult.choices?.[0]?.message?.content || 'No pude generar una respuesta.', toolInteractions };
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

  // Load history (last 20 messages) with metadata for tool context AND
  // long-term memorias to inject into the system prompt.
  const [history, memorias] = await Promise.all([
    supabaseQuery('chat_messages',
      `select=role,content,metadata&conversation_id=eq.${conversationId}&order=created_at.asc&limit=20`
    ) as Promise<Array<{ role: string; content: string; metadata?: { tool_interactions?: ToolInteraction[] } }>>,
    fetchActiveMemorias(userId),
  ]);

  // Build messages for LLM, injecting tool context from previous turns
  const llmMessages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string }> = [
    { role: 'system', content: getSystemPrompt(memorias) },
  ];
  for (const m of history) {
    if (m.role === 'assistant' && m.metadata?.tool_interactions?.length) {
      const ctx = m.metadata.tool_interactions
        .map((t: ToolInteraction) => `[${t.tool}(${JSON.stringify(t.args)}): ${t.result_summary}]`)
        .join('\n');
      llmMessages.push({ role: 'system', content: `Datos consultados en la respuesta anterior:\n${ctx}` });
    }
    llmMessages.push({ role: m.role, content: m.content });
  }

  // SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // Tool-calling loop (non-streaming) then stream the final answer
        const { text: finalText, toolInteractions } = await llmToolLoop(llmMessages, userId);

        // Stream the final text character by character in chunks
        const chunkSize = 8;
        for (let i = 0; i < finalText.length; i += chunkSize) {
          const chunk = finalText.slice(i, i + chunkSize);
          send({ type: 'text_delta', content: chunk });
          // Small delay for streaming effect
          await new Promise((r) => setTimeout(r, 15));
        }

        // Save assistant message with tool interaction metadata for context persistence
        await supabaseInsert('chat_messages', {
          conversation_id: conversationId,
          role: 'assistant',
          content: finalText,
          metadata: { tool_interactions: toolInteractions },
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
