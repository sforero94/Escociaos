import { validarEvidencia, type Evidence, type PopulationProof, type Scope } from '@/utils/escoEvidencia';

/** Solo el servidor resuelve esta política desde la solicitud actual y sus gates.
 * Los argumentos del modelo NUNCA son el origen de un selector verificado.
 * Este módulo no comprueba permisos ni acredita unicidad de un nombre parcial.
 */
export type ServerRequestPolicy = (
  | { mode: 'aggregate'; verifiedIndividualSelector?: never }
  | { mode: 'clarify'; verifiedIndividualSelector?: never }
  | { mode: 'individual_explicit'; verifiedIndividualSelector: { kind: 'employee'; id: string; workerName: string } }
) & { publicQuestion?: { query: string } };
export interface EntradaContextoValidado {
  evidence?: unknown;
  expected: Scope[];
  populations: readonly PopulationProof[];
  maxBytes: number;
}
export type ContextoValidado = { state: 'validated'; evidence: Evidence }
  | { state: 'unavailable'; code: 'source_unavailable' | 'budget_exceeded'; essentialFactsUnavailable: true; omittedDetail: true };
export interface MensajeModelo { role: 'system' | 'user'; content: string }
export interface EntradaMensajesModelo extends EntradaContextoValidado {
  /** Construido de nuevo por el caller, SIN memorias ni sistema histórico. */
  freshSystemWithoutMemories: string;
  currentUserText: string;
  policy: ServerRequestPolicy;
}
const indisponible = (code: 'source_unavailable' | 'budget_exceeded'): ContextoValidado => ({
  state: 'unavailable', code, essentialFactsUnavailable: true, omittedDetail: true,
});
const bytes = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v)).length;
const presupuestoValido = (n: number): boolean => Number.isSafeInteger(n) && n >= 512 && n <= 1000000;
const textoAcotado = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 512;
const filtrosNegocio = new Set(['membership_complete','group_by','selection_basis','date_from','date_to','cohort_start_from','cohort_start_to','cohort_start_basis','tarea_id','tarea_exclusiva','recipe_id','calculo_id','activo', 'categoria', 'grupo', 'nombre_contiene', 'lote_id', 'lote_ids', 'finca_id', 'finca_ids', 'producto_id', 'producto_ids', 'aplicacion_id', 'aplicacion_ids', 'station_id','tipo_aplicacion','animal_id','ledger','estado','negocio_id','categoria_id','activa','ubicacion_nombre_contiene','finca_nombre_contiene','ubicacion_id','etapa','tipos','universo','detalle_offset','seed_state','event_membership','event_kind','origin_paddock_ids','destination_paddock_ids','side','membership','ano','cosecha_tipo','lote_name','pest_name','plaga_enfermedad_id','sublote_id','mes','grain','client_name','cliente_id','proveedor_id','proveedor_registrado','unidad','tipo_movimiento','date_from','date_to','purchase_id','movement_id','proveedor_filtro','month','period','current_from','current_to','previous_from','previous_to','prioridad']);

/** Reconstrucción por lista positiva, incluso si validarEvidencia admite campos
 * extra. No copia extensiones de resumen, notas, herramientas o identidades.
 * Si un filtro no tiene contrato de negocio conocido, no lo borra cambiando el
 * universo: declara esa proyección indisponible. Nunca recorta strings o hechos.
 */
export function proyectarContextoValidado(entrada: EntradaContextoValidado): ContextoValidado {
  const { evidence, expected, populations, maxBytes } = entrada;
  if (!presupuestoValido(maxBytes)) return indisponible('budget_exceeded');
  if (!validarEvidencia(evidence, expected, populations) || evidence.state === 'error' || evidence.facts.length === 0
    || evidence.scopes.some(s => s.entities.some(e => e.kind === 'record')
      || Object.keys(s.filters).some(k => !filtrosNegocio.has(k)))) return indisponible('source_unavailable');
  const canonico: Evidence = {
    version: 1, state: evidence.state,
    scopes: evidence.scopes.map(s => ({
      id: s.id, operation: s.operation,
      entities: s.entities.map(e => ({ kind: e.kind, id: e.id, label: e.label })),
      period: s.period === null ? null : {
        from: s.period.from, to: s.period.to, referenceDay: s.period.referenceDay,
        clock: s.period.clock, basis: s.period.basis, fieldMeaning: s.period.fieldMeaning,
      },
      filters: Object.fromEntries(Object.entries(s.filters).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v])),
    })),
    facts: evidence.facts.map(f => ({
      id: f.id, scopeId: f.scopeId, metric: f.metric, definitionId: f.definitionId,
      entities: f.entities.map(e => ({ kind: e.kind, id: e.id })),
      value: f.value.kind === 'decimal' ? { kind: 'decimal', value: f.value.value, unit: f.value.unit,
        ...(f.metric === 'milk.mean' ? { denominator: 'pesaje_observado' } : {}) }
        : f.value.kind === 'unknown' ? { kind: 'unknown', reason: f.value.reason }
        : { kind: f.value.kind, value: f.value.value },
      origin: f.origin,
      coverage: {
        populationId: f.coverage.populationId, population: f.coverage.population, values: f.coverage.values,
        rowsRead: f.coverage.rowsRead, expectedRows: f.coverage.expectedRows, missingValues: f.coverage.missingValues,
        identityUnique: f.coverage.identityUnique, consistency: f.coverage.consistency, reasons: [...f.coverage.reasons],
      },
      source: { tool: f.source.tool, field: f.source.field, capturedAt: f.source.capturedAt },
      assertion: f.assertion,
      ...(f.derivation ? { derivation: { operation: f.derivation.operation,
        inputs: f.derivation.inputs.map(i => 'factId' in i ? { factId: i.factId } : { populationId: i.populationId, field: i.field }) } } : {}),
    })),
    issues: evidence.issues.map(i => ({ partId: i.partId, code: i.code })),
  };
  const resultado: ContextoValidado = { state: 'validated', evidence: canonico };
  return bytes(resultado) <= maxBytes ? resultado : indisponible('budget_exceeded');
}

/** Único contexto permitido antes de persistir: usar el retorno de esta función
 * (también para error/fallback), nunca el objeto original ni JSON legado.
 */
export function contextoParaPersistir(entrada: EntradaContextoValidado): ContextoValidado {
  return proyectarContextoValidado(entrada);
}

/** No acepta/copia historial, mensajes assistant/tool, memorias ni resúmenes.
 * El usuario actual se conserva literalmente; no se analiza para cobertura.
 * Si el presupuesto total no cabe, messages=[] exige al caller omitir el request.
 */
export function construirMensajesModelo(entrada: EntradaMensajesModelo): { messages: MensajeModelo[]; context: ContextoValidado; canRequestModel: boolean } {
  const contexto = proyectarContextoValidado(entrada);
  const messages: MensajeModelo[] = [
    { role: 'system', content: entrada.freshSystemWithoutMemories },
    { role: 'user', content: entrada.currentUserText },
    { role: 'user', content: JSON.stringify(contexto) },
  ];
  if (!politicaValida(entrada.policy)) return { messages: [], context: indisponible('source_unavailable'), canRequestModel: false };
  if (!presupuestoValido(entrada.maxBytes)
    || typeof entrada.freshSystemWithoutMemories !== 'string' || typeof entrada.currentUserText !== 'string'
    || bytes(messages) > entrada.maxBytes) return { messages: [], context: indisponible('budget_exceeded'), canRequestModel: false };
  return { messages, context: contexto, canRequestModel: true };
}

function politicaValida(p: ServerRequestPolicy): boolean {
  if (!p || !['aggregate', 'individual_explicit', 'clarify'].includes(p.mode)) return false;
  if (p.mode === 'individual_explicit') {
    const s = p.verifiedIndividualSelector;
    if (!s || s.kind !== 'employee' || !textoAcotado(s.id) || !textoAcotado(s.workerName)) return false;
  } else if (p.verifiedIndividualSelector !== undefined) return false;
  return p.publicQuestion === undefined || (!!p.publicQuestion && textoAcotado(p.publicQuestion.query));
}
// Herramientas de lectura existentes. Estar aquí no acredita salida: el contexto
// del proveedor sigue requiriendo proyección validada, jamás JSON de herramienta.
const lecturas = new Set([
  'get_labor_summary', 'get_monitoring_data', 'get_informes_visita', 'get_application_summary',
  'get_inventory_status', 'get_financial_summary', 'get_production_data', 'get_harvest_shipments',
  'get_lot_info', 'get_purchase_history', 'get_inventory_movements', 'get_application_details',
  'get_application_cost_by_lote', 'get_cost_by_lote', 'get_weather_forecast', 'get_weekly_overview',
  'get_climate_data', 'get_radiation_context', 'get_conductivity_data', 'get_beehive_data',
  'get_budget_data', 'get_ganado_inventory', 'get_pyg_flujo_caja', 'get_hato_animal',
  'get_hato_reproduccion', 'get_hato_produccion', 'get_tareas', 'get_weekly_reports',
  'get_recorded_state_definition', 'get_pest_risk_priorizacion', 'get_aplicaciones_ejecucion', 'get_hato_partos',
  'get_hato_eventos', 'get_hato_animales', 'get_hato_tratamientos', 'get_hato_chequeos',
  'get_hato_salidas_finanzas', 'get_ganado_conciliacion', 'get_ganado_movimientos_detalle',
  'get_cosecha_trazabilidad', 'get_produccion_calidad', 'get_recomendaciones_ejecucion',
  'get_carencia_cosecha', 'get_monitoreo_cobertura', 'get_inventario_conciliacion',
  'get_producto_consumo', 'get_compra_detalle', 'get_finanzas_detalle',
  'get_presupuesto_desviaciones', 'get_tarea_ejecucion', 'get_clima_cobertura', 'get_capturas_estado',
]);
function herramientaPermitida(p: ServerRequestPolicy, nombre: string): boolean {
  if (!politicaValida(p) || p.mode === 'clarify') return false;
  if (nombre === 'get_employee_activity') return p.mode === 'individual_explicit';
  if (nombre === 'web_search_agronomic') return p.publicQuestion !== undefined;
  return lecturas.has(nombre);
}
export function filtrarHerramientasPorPolitica(policy: ServerRequestPolicy, nombres: readonly string[]): string[] {
  return nombres.filter(nombre => herramientaPermitida(policy, nombre));
}
/** Guard del dispatcher ANTES de ejecutar. Una propuesta no puede ampliar la
 * consulta pública dedicada ni sustituir la identidad individual del servidor.
 * No se aceptan scripts, consultas fuente, HTML o datos arbitrarios de chart.
 */
export function permitirLlamadaHerramienta(policy: ServerRequestPolicy, nombre: string, args: unknown): boolean {
  if (!herramientaPermitida(policy, nombre) || !args || typeof args !== 'object' || Array.isArray(args)) return false;
  const argumentos = args as Record<string, unknown>;
  if (nombre === 'web_search_agronomic') return Object.keys(argumentos).every(k => ['query', 'max_results'].includes(k))
    && argumentos.query === policy.publicQuestion?.query
    && (argumentos.max_results === undefined || (Number.isSafeInteger(argumentos.max_results) && Number(argumentos.max_results) >= 1 && Number(argumentos.max_results) <= 5));
  if (nombre === 'get_employee_activity') return policy.mode === 'individual_explicit'
    && argumentos.worker_name === policy.verifiedIndividualSelector.workerName
    && Object.keys(argumentos).every(k => ['worker_name', 'date_from', 'date_to'].includes(k))
    && Object.values(argumentos).every(v => typeof v === 'string');
  // Lista positiva de argumentos de las lecturas existentes, no un filtro de
  // contenido de texto. Los lectores conservan su validación propia de alcance.
  const permitidos = new Set([
    'domain', 'state', 'date_from', 'date_to', 'lote_name', 'pest_name', 'tipo', 'tema', 'plaga', 'insumo', 'informe_id',
    'application_name', 'application_id', 'estado', 'date_basis', 'type', 'product_name', 'category',
    'negocio_name', 'search_term', 'year', 'cosecha_tipo', 'client_name', 'proveedor', 'days',
    'metric', 'period', 'apiario_name', 'include_config', 'anio', 'quarters', 'categoria_name',
    'ubicacion_name', 'finca_name', 'include_movimientos', 'vista', 'modo', 'incluir_flujo_caja',
    'numero', 'nombre', 'animal_numero', 'num_quincenas', 'categoria', 'numero_semana', 'limit', 'top_n',
    'detalle_offset', 'transaccion_id', 'cosecha_id', 'alcance', 'fecha_cosecha', 'ronda_id', 'compra_id',
    'movimiento_id', 'solo_pendientes', 'solo_sin_soporte', 'tarea_id',
  ]);
  if (nombre === 'get_informes_visita') permitidos.add('query');
  if ('employee_name' in argumentos) {
    if (policy.mode !== 'individual_explicit' || argumentos.employee_name !== policy.verifiedIndividualSelector.workerName) return false;
    permitidos.add('employee_name');
  }
  return Object.entries(argumentos).every(([k, v]) => permitidos.has(k)
    && (v === null || ['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every(x => typeof x === 'string'))));
}
