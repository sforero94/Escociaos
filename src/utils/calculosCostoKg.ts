/**
 * Motor de costo por kg de aguacate Hass (lógica pura, sin Supabase).
 *
 * Sin imports de Supabase ni de fetch — testeable desde Vitest sin mocks de red.
 * El hook `useCostoKg` es quien carga los datos y los pasa aquí.
 *
 * Fórmula (válida lote-por-lote desde 2026):
 *   costo_directo(L,Y)  = Σ costo_jornal (registros_trabajo, lote_id = L, año Y)
 *                        + Σ cantidad_utilizada × precio_unitario
 *                          (movimientos_diarios_productos, lote via movimientos_diarios, año Y)
 *   overhead_farm(Y)    = Σ fin_gastos.valor (estado='Confirmado', negocio Aguacate Hass, año Y,
 *                           categoría NO IN categoriasExcluidas)
 *   overhead(L,Y)       = overhead_farm(Y) × (arboles_L / Σ arboles de lotes con arboles > 0)
 *   costo_total(L,Y)    = costo_directo + overhead
 *   costo_kg(L,Y)       = costo_total / kg_totales(L,Y)
 *   por_cosecha         = costo_total proporcional a kg de Principal vs Traviesa
 *
 * Fallback farm-level (años < 2026):
 *   costo_kg_farm(Y)    = total_fin_gastos_Confirmado_Aguacate(Y) / kg_totales_farm(Y)
 */

import type {
  CosechaTipo,
  CostoKgCosecha,
  CostoKgFarmFallback,
  CostoKgResult,
  CostoLoteAnual,
  InsumoLoteAnual,
  LaborLoteAnual,
  LoteInfoCosto,
  OverheadFarmaAnual,
} from '@/types/produccion';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Categorías excluidas del overhead por defecto (ya contadas como directo). */
export const CATEGORIAS_OVERHEAD_EXCLUIDAS_DEFAULT: string[] = [
  'Mano de Obra',
  'Alimentos y Fertilizantes',
  'Control de Plagas',
];

/** Primer año con datos lote-tagged suficientes para desglose por lote. */
export const ANO_MIN_LOTE = 2026;

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function redondear(n: number): number {
  return Math.round(n);
}

// ---------------------------------------------------------------------------
// Overhead de finca
// ---------------------------------------------------------------------------

/**
 * Filtra las filas de gastos por categorías excluidas y devuelve la suma.
 *
 * @param gastos          - Filas de fin_gastos ya filtradas por negocio/año/estado
 * @param categoriaNombre - Nombre de categoría de cada gasto (unido en la query)
 * @param categoriasExcluidas - Nombres de categorías a excluir (insensible a mayúsculas)
 */
export function calcularOverheadFarm(
  gastos: { valor: number; categoria_nombre: string | null }[],
  categoriasExcluidas: string[] = CATEGORIAS_OVERHEAD_EXCLUIDAS_DEFAULT,
): number {
  const excluidas = new Set(categoriasExcluidas.map((c) => c.toLowerCase()));
  return gastos.reduce((suma, g) => {
    const cat = (g.categoria_nombre ?? '').toLowerCase();
    if (excluidas.has(cat)) return suma;
    return suma + (g.valor || 0);
  }, 0);
}

// ---------------------------------------------------------------------------
// Asignación de overhead por árboles
// ---------------------------------------------------------------------------

/**
 * Asigna el overhead de finca a cada lote proporcional a su conteo de árboles.
 * Lotes con arboles <= 0 reciben 0 y no participan en el denominador.
 *
 * @returns Mapa lote_id → overhead asignado (sin redondear)
 */
export function asignarOverheadPorArboles(
  lotes: LoteInfoCosto[],
  overheadFarm: number,
): Map<string, number> {
  const result = new Map<string, number>();
  const totalArboles = lotes.reduce(
    (s, l) => s + (l.total_arboles > 0 ? l.total_arboles : 0),
    0,
  );

  for (const lote of lotes) {
    if (lote.total_arboles <= 0 || totalArboles <= 0) {
      result.set(lote.id, 0);
    } else {
      result.set(lote.id, overheadFarm * (lote.total_arboles / totalArboles));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Costo total por lote
// ---------------------------------------------------------------------------

/**
 * Combina labor directa, insumos directos y overhead asignado por lote
 * en un único objeto `CostoLoteAnual` por lote.
 *
 * Los lotes sin datos de costo directo ni overhead siguen apareciendo si
 * están en `lotes` (con valores en 0) para facilitar la UI.
 */
export function combinarCostosLote(
  ano: number,
  lotes: LoteInfoCosto[],
  labor: LaborLoteAnual[],
  insumos: InsumoLoteAnual[],
  overheadFarm: number,
): CostoLoteAnual[] {
  const laborMap = new Map(labor.map((l) => [l.lote_id, l]));
  const insumosMap = new Map(insumos.map((i) => [i.lote_id, i]));
  const overheadMap = asignarOverheadPorArboles(lotes, overheadFarm);

  return lotes.map((lote) => {
    const lab = laborMap.get(lote.id);
    const ins = insumosMap.get(lote.id);
    const costoLabor = lab?.costo_labor ?? 0;
    const costoInsumos = ins?.costo_insumos ?? 0;
    const costoDirecto = costoLabor + costoInsumos;
    const overhead = overheadMap.get(lote.id) ?? 0;
    const costoTotal = costoDirecto + overhead;

    return {
      lote_id: lote.id,
      lote_nombre: lote.nombre,
      ano,
      arboles: lote.total_arboles,
      costo_labor: redondear(costoLabor),
      costo_insumos: redondear(costoInsumos),
      costo_directo: redondear(costoDirecto),
      overhead_asignado: redondear(overhead),
      costo_total: redondear(costoTotal),
    };
  });
}

// ---------------------------------------------------------------------------
// Costo/kg por lote y cosecha
// ---------------------------------------------------------------------------

/**
 * Dado el costo total de un lote y su producción por cosecha,
 * calcula costo/kg suprimiendo resultados cuando los datos son insuficientes.
 *
 * Supresión:
 *   - kg_totales <= 0  → costo_kg = null
 *   - arboles <= 0     → costo_kg = null
 */
export function calcularCostoKgLote(
  costoLote: CostoLoteAnual,
  produccionPorCosecha: { cosecha_tipo: CosechaTipo; kg: number }[],
): CostoKgResult {
  const kgTotales = produccionPorCosecha.reduce((s, c) => s + c.kg, 0);
  const suprimido = kgTotales <= 0 || costoLote.arboles <= 0;
  const costoKg = suprimido ? null : costoLote.costo_total / kgTotales;

  const porCosecha: CostoKgCosecha[] = produccionPorCosecha.map((c) => {
    const proporcion = kgTotales > 0 ? c.kg / kgTotales : 0;
    const costoAsignado = costoLote.costo_total * proporcion;
    return {
      cosecha_tipo: c.cosecha_tipo,
      kg: c.kg,
      costo_asignado: redondear(costoAsignado),
      costo_kg: suprimido || c.kg <= 0 ? null : costoKg,
    };
  });

  return {
    lote_id: costoLote.lote_id,
    lote_nombre: costoLote.lote_nombre,
    ano: costoLote.ano,
    costo_kg: costoKg !== null ? Math.round(costoKg) : null,
    costo_total: costoLote.costo_total,
    kg_totales: kgTotales,
    por_cosecha: porCosecha,
  };
}

/**
 * Calcula costo/kg para todos los lotes de un año.
 *
 * `produccionPorLoteCosecha` mapea lote_id → array de { cosecha_tipo, kg }.
 */
export function calcularCostoKgTodosLotes(
  costosLote: CostoLoteAnual[],
  produccionPorLoteCosecha: Map<string, { cosecha_tipo: CosechaTipo; kg: number }[]>,
): CostoKgResult[] {
  return costosLote.map((costo) => {
    const produccion = produccionPorLoteCosecha.get(costo.lote_id) ?? [];
    return calcularCostoKgLote(costo, produccion);
  });
}

// ---------------------------------------------------------------------------
// Fallback farm-level (años < ANO_MIN_LOTE)
// ---------------------------------------------------------------------------

/**
 * Calcula el costo/kg a nivel finca para un año sin desglose por lote.
 * Usa el total de fin_gastos Confirmado del negocio Aguacate Hass dividido
 * entre el total de kg producidos en la finca ese año.
 *
 * @param gastosTotales  - Suma de fin_gastos.valor (ya filtrados: estado=Confirmado, negocio AH, año)
 * @param kgTotalesFarm  - Σ kg_totales de todos los lotes ese año
 */
export function calcularCostoKgFarmFallback(
  ano: number,
  gastosTotales: number,
  kgTotalesFarm: number,
): CostoKgFarmFallback {
  return {
    ano,
    costo_kg: kgTotalesFarm > 0 ? Math.round(gastosTotales / kgTotalesFarm) : null,
    costo_total_farm: redondear(gastosTotales),
    kg_totales_farm: kgTotalesFarm,
    es_fallback: true,
  };
}

// ---------------------------------------------------------------------------
// Punto de entrada principal
// ---------------------------------------------------------------------------

/**
 * Orquestador principal: dada una colección de datos pre-cargados,
 * produce resultados para todos los lotes del año.
 *
 * Para años < ANO_MIN_LOTE devuelve un único objeto fallback (array vacío de lotes).
 *
 * @param ano
 * @param lotes                    - Lotes con total_arboles (de la tabla `lotes`)
 * @param labor                    - Costo de mano de obra por lote
 * @param insumos                  - Costo de insumos por lote
 * @param gastosOverhead           - Filas de fin_gastos para el overhead
 * @param produccionPorLoteCosecha - Produccion por lote y tipo de cosecha
 * @param categoriasExcluidas      - Categorías a excluir del overhead
 * @returns { resultados, overhead, fallback? }
 */
export function calcularCostoKgAnual(
  ano: number,
  lotes: LoteInfoCosto[],
  labor: LaborLoteAnual[],
  insumos: InsumoLoteAnual[],
  gastosOverhead: { valor: number; categoria_nombre: string | null }[],
  produccionPorLoteCosecha: Map<string, { cosecha_tipo: CosechaTipo; kg: number }[]>,
  categoriasExcluidas: string[] = CATEGORIAS_OVERHEAD_EXCLUIDAS_DEFAULT,
): {
  resultados: CostoKgResult[];
  overheadFarm: OverheadFarmaAnual;
  costosLote: CostoLoteAnual[];
  fallback?: CostoKgFarmFallback;
} {
  const overheadTotal = calcularOverheadFarm(gastosOverhead, categoriasExcluidas);
  const overheadFarm: OverheadFarmaAnual = { ano, total: redondear(overheadTotal) };

  if (ano < ANO_MIN_LOTE) {
    // Sin datos lote-tagged: fallback finca
    const kgTotalesFarm = Array.from(produccionPorLoteCosecha.values()).reduce(
      (s, cosechas) => s + cosechas.reduce((ss, c) => ss + c.kg, 0),
      0,
    );
    const gastosTotales = gastosOverhead.reduce((s, g) => s + (g.valor || 0), 0);
    return {
      resultados: [],
      overheadFarm,
      costosLote: [],
      fallback: calcularCostoKgFarmFallback(ano, gastosTotales, kgTotalesFarm),
    };
  }

  const costosLote = combinarCostosLote(ano, lotes, labor, insumos, overheadTotal);
  const resultados = calcularCostoKgTodosLotes(costosLote, produccionPorLoteCosecha);

  return { resultados, overheadFarm, costosLote };
}
