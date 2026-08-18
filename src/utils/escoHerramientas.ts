/**
 * Traduccion de la traza de Esco a algo que un administrador de finca reconozca.
 *
 * El edge function emite el nombre TECNICO de cada herramienta (`get_labor_summary`)
 * y sus argumentos crudos. La copia vive aqui, en el cliente, a proposito:
 *
 *  - El protocolo SSE se mantiene estable y traducible sin redesplegar el edge function.
 *  - `src/supabase/functions/server/` esta duplicado en `supabase/functions/make-server-1ccce916/`
 *    y todo lo que se mete alli hay que mantenerlo sincronizado a mano. Este archivo no
 *    paga ese costo.
 *  - Telegram formatea distinto; compartir la copia lo habria forzado a este formato.
 */

import { formatNumber } from '@/utils/format';

/**
 * Las 33 herramientas de Esco, en el lenguaje del dominio.
 *
 * Cada etiqueta nombra LA FUENTE consultada, no la accion ("Gastos e ingresos", no
 * "Consultando gastos"): el encabezado de la traza ya dice que se esta consultando, y
 * repetir el verbo en cada fila la vuelve ruido.
 */
export const ETIQUETAS_HERRAMIENTAS: Record<string, string> = {
  // Labores
  get_labor_summary: 'Jornales y mano de obra',
  get_employee_activity: 'Actividad de empleados',
  get_tareas: 'Tareas y labores',

  // Monitoreo
  get_monitoring_data: 'Monitoreo de plagas',
  get_pest_risk_priorizacion: 'Priorización de scouting',
  get_conductivity_data: 'Conductividad del suelo',
  get_beehive_data: 'Colmenas y apiarios',

  // Aplicaciones
  get_application_summary: 'Aplicaciones fitosanitarias',
  get_application_details: 'Detalle de la aplicación',
  get_application_cost_by_lote: 'Costo de aplicación por lote',

  // Inventario y compras
  get_inventory_status: 'Inventario de productos',
  get_inventory_movements: 'Movimientos de inventario',
  get_purchase_history: 'Historial de compras',

  // Finanzas
  get_financial_summary: 'Gastos e ingresos',
  get_pyg_flujo_caja: 'P&G y flujo de caja',
  get_budget_data: 'Presupuesto',
  get_cost_by_lote: 'Costos por lote',

  // Producción
  get_production_data: 'Producción de aguacate',
  get_harvest_shipments: 'Despachos de cosecha',
  get_lot_info: 'Lotes y sublotes',

  // Reportes
  get_weekly_overview: 'Resumen de la semana',
  get_weekly_reports: 'Reportes semanales',

  // Clima
  get_climate_data: 'Clima de la estación',
  get_weather_forecast: 'Pronóstico del tiempo',
  get_radiation_context: 'Radiación solar',

  // Ganado y hato
  get_ganado_inventory: 'Inventario de ganado',
  get_hato_animal: 'Ficha del animal',
  get_hato_reproduccion: 'Reproducción del hato',
  get_hato_produccion: 'Producción de leche',

  // Externas y memoria
  web_search_agronomic: 'Búsqueda agronómica',
  propose_memory_save: 'Propuesta de recordatorio',
  commit_memory_save: 'Guardar en memoria',
  forget_memory: 'Olvidar recordatorio',
};

/**
 * Etiqueta legible de una herramienta. Si aparece una herramienta nueva en el
 * servidor antes de registrarla aqui, se muestra su nombre tecnico legibilizado
 * en vez de romperse o mostrar un hueco.
 */
export function etiquetaHerramienta(tool: string): string {
  const etiqueta = ETIQUETAS_HERRAMIENTAS[tool];
  if (etiqueta) return etiqueta;
  return tool.replace(/^(get|exec)_/, '').replace(/_/g, ' ');
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * `AAAA-MM-DD` → `{ anio, mes, dia }` leyendo la cadena, nunca via `new Date()`.
 *
 * `new Date('2026-05-16')` se interpreta como medianoche UTC, que en Bogotá (UTC-5)
 * es el 15 a las 19:00 — `getMonth()` puede devolver el mes anterior. Es la misma
 * trampa que documenta el CLAUDE.md para `obtenerFechaHoy()`, del otro lado.
 */
function partesFecha(iso: string): { anio: number; mes: number; dia: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return { anio: Number(m[1]), mes, dia: Number(m[3]) };
}

/** Rango compacto para un chip: `may–ago 2026`, `2025 – ago 2026`, `desde 16 may 2026`. */
function formatearRango(desde?: unknown, hasta?: unknown): string | null {
  const a = typeof desde === 'string' ? partesFecha(desde) : null;
  const b = typeof hasta === 'string' ? partesFecha(hasta) : null;
  if (!a && !b) return null;

  if (a && b) {
    if (a.anio === b.anio) {
      return a.mes === b.mes
        ? `${MESES[a.mes - 1]} ${a.anio}`
        : `${MESES[a.mes - 1]}–${MESES[b.mes - 1]} ${a.anio}`;
    }
    return `${MESES[a.mes - 1]} ${a.anio} – ${MESES[b.mes - 1]} ${b.anio}`;
  }
  const solo = (a ?? b)!;
  return `${a ? 'desde' : 'hasta'} ${solo.dia} ${MESES[solo.mes - 1]} ${solo.anio}`;
}

/**
 * Argumentos que valen como detalle de un chip, en orden de preferencia.
 * Todo lo demas (`limit`, `top_n`, `include_config`, tokens) es plomería.
 */
const ARGS_INTERESANTES = [
  'lote_name', 'pest_name', 'product_name', 'employee_name', 'worker_name',
  'negocio_name', 'categoria_name', 'category', 'categoria', 'client_name',
  'proveedor', 'finca_name', 'ubicacion_name', 'apiario_name', 'application_name',
  'animal_numero', 'numero', 'nombre', 'search_term', 'query', 'cosecha_tipo',
  'vista', 'metric', 'period', 'estado', 'tipo', 'type', 'anio', 'year',
  'numero_semana', 'quarters', 'days', 'num_quincenas',
];

/**
 * Detalle corto de una llamada, para la segunda columna del chip.
 * Devuelve `null` cuando no hay nada que valga la pena mostrar — un chip sin
 * detalle se ve mejor que uno con `limit: 2000`.
 */
export function detalleArgumentos(args?: Record<string, unknown>): string | null {
  if (!args) return null;

  const rango = formatearRango(args.date_from, args.date_to);
  if (rango) return rango;

  for (const clave of ARGS_INTERESANTES) {
    const valor = args[clave];
    if (typeof valor === 'string' && valor.trim()) {
      return valor.length > 28 ? `${valor.slice(0, 27)}…` : valor;
    }
    if (typeof valor === 'number') return String(valor);
  }
  return null;
}

/** `4200` → `4,2 s`; `340` → `340 ms`. Coma decimal, como el resto de la app. */
export function formatearDuracion(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${formatNumber(ms / 1000, 1)} s`;
}

/**
 * Encabezado de la traza una vez terminada: `Consulté 3 fuentes · 24,1 s`.
 * En singular cuando fue una sola, y sin total cuando ninguna reportó duración.
 */
export function resumenTraza(pasos: Array<{ ms?: number }>): string {
  const n = pasos.length;
  const sustantivo = n === 1 ? 'fuente' : 'fuentes';
  const total = pasos.reduce((suma, p) => suma + (p.ms ?? 0), 0);
  if (total <= 0) return `Consulté ${n} ${sustantivo}`;
  return `Consulté ${n} ${sustantivo} · ${formatearDuracion(total)}`;
}
