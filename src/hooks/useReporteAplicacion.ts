import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../utils/supabase/client';
import {
    calcularCambio,
    calcularDesviacion,
    convertirCanecasALitros,
    formatearDesviacion,
    formatearMoneda,
    formatearNumero,
} from '../utils/calculosReporteAplicacion';
// Types defined locally — not available in types/aplicaciones
interface KPICardData {
    titulo: string;
    valor: number;
    valorFormateado: string;
    comparacion: string;
    desviacion: number;
    esPositivo: boolean;
}

interface ComparisonField {
    real: number;
    planeado: number;
    // D2 fix (5 call sites, see below): `undefined` = no hay base de comparación
    // (planeado ausente o 0) — nunca se fabrica un +100%. Los sitios que todavía
    // usan `calcularDesviacion` (per-lote / per-producto) siguen devolviendo
    // `number`, que es un subtipo válido de `number | undefined`.
    desviacion: number | undefined;
}

interface CanecasPorLote {
    lote_id: string;
    lote_nombre: string;
    canecas: ComparisonField;
    litros_totales: ComparisonField;
}

interface JornalesPorLote {
    lote_id: string;
    lote_nombre: string;
    jornales_preparacion: ComparisonField;
    jornales_aplicacion: ComparisonField;
    jornales_transporte: ComparisonField;
    jornales_total: ComparisonField;
    arboles_por_jornal: ComparisonField;
}

interface DatosGraficoBarrasLote {
    lote: string;
    planeado: number;
    real: number;
    anterior: number;
}

interface DatosGraficoCostos {
    aplicacion: string;
    fecha: string;
    costoProductos: number;
    costoJornales: number;
    costoTotal: number;
}

interface FinancieroField {
    real: number;
    planeado: number;
    // D2 fix — ver la misma nota en ComparisonField.
    desviacion: number | undefined;
    cambio: number;
}

interface ProductoDetalle {
    producto_id: string;
    producto_nombre: string;
    unidad: string;
    cantidad: ComparisonField;
    costo: ComparisonField;
}

interface ReporteAplicacionCerrada {
    aplicacion_id: string;
    codigo_aplicacion: string | null;
    nombre_aplicacion: string | null;
    tipo_aplicacion: string | null;
    fecha_inicio: string;
    fecha_fin: string;
    dias_aplicacion: number;
    tamano_caneca: number;
    aplicacion_anterior_id?: string;
    aplicacion_anterior_nombre?: string;
    total_arboles: number;
    kpis: Record<string, KPICardData>;
    grafico_costos_historico: DatosGraficoCostos[];
    grafico_canecas_por_lote: DatosGraficoBarrasLote[];
    grafico_productos_por_lote: DatosGraficoBarrasLote[];
    grafico_jornales_por_lote: DatosGraficoBarrasLote[];
    grafico_eficiencia_por_lote: DatosGraficoBarrasLote[];
    detalle_canecas: { totales: CanecasPorLote; por_lote: CanecasPorLote[] };
    detalle_jornales: { totales: JornalesPorLote; por_lote: JornalesPorLote[]; valor_jornal: number };
    detalle_productos: { totales: ProductoDetalle[]; por_lote: Record<string, ProductoDetalle[]> };
    alertas: string[];
    financiero: {
        costo_productos: FinancieroField;
        costo_jornales: FinancieroField;
        costo_total: FinancieroField;
        costo_por_arbol: FinancieroField;
    };
    anterior?: {
        nombre: string;
        costo_total: number;
        costo_por_arbol: number;
        total_arboles: number;
        canecas: number;
        jornales: number;
        arboles_por_jornal: number;
    };
}

interface ResumenAplicacionCerrada {
    id: string;
    codigo: string;
    nombre: string;
    tipo: string;
    fecha_cierre: string;
    costo_total: number;
    desviacion_costo: number;
    estado: 'Cerrada';
}

// ============================================================================
// TYPES
// ============================================================================

interface UseReporteAplicacionResult {
    reporte: ReporteAplicacionCerrada | null;
    loading: boolean;
    error: string | null;
    aplicacionesComparables: ResumenAplicacionCerrada[];
    seleccionarAnterior: (aplicacionId: string | null) => void;
    refetch: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Safe division helper that prevents division by zero errors
 * @param numerator The number to divide
 * @param denominator The number to divide by
 * @param fallback Value to return if denominator is 0 (default: 0)
 * @returns The result of division or fallback value
 */
const safeDivide = (numerator: number, denominator: number, fallback: number = 0): number => {
    return denominator !== 0 ? numerator / denominator : fallback;
};

// ============================================================================
// HOOK
// ============================================================================

export function useReporteAplicacion(aplicacionId: string): UseReporteAplicacionResult {
    const [reporte, setReporte] = useState<ReporteAplicacionCerrada | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [aplicacionesComparables, setAplicacionesComparables] = useState<ResumenAplicacionCerrada[]>([]);
    const [anteriorId, setAnteriorId] = useState<string | null>(null);

    const seleccionarAnterior = useCallback((id: string | null) => {
        setAnteriorId(id);
    }, []);

    const fetchReporte = useCallback(async () => {
        if (!aplicacionId) return;

        setLoading(true);
        setError(null);

        try {
            const supabase = getSupabase();

            // Helper function to aggregate application data
            const agregarDatosAplicacion = async (appId: string) => {
                const { data, error } = await supabase
                    .from('aplicaciones')
                    .select(`
                        *,
                        aplicaciones_cierre(*),
                        aplicaciones_lotes(*, lotes(nombre, total_arboles, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)),
                        aplicaciones_mezclas(*),
                        aplicaciones_calculos(*)
                    `)
                    .eq('id', appId)
                    .single();

                if (error) throw error;
                if (!data) return null;

                // Fetch movements
                const { data: movs } = await supabase
                    .from('movimientos_diarios')
                    .select('*')
                    .eq('aplicacion_id', appId);

                // `aplicaciones_lotes_planificado` is always empty (CLAUDE.md, "De dónde sale
                // el PLAN") and this helper never had a fallback for the previous-application
                // tree count — it has always resolved to 0 here. Kept literal to preserve that
                // behaviour exactly rather than inventing a new source for the comparison app.
                const totalArboles = 0;
                const totalJornales = Number(data.jornales_utilizados || 0);
                const canecasReales = movs?.reduce((sum, m) => sum + Number(m.numero_canecas || m.numero_bultos || 0), 0) || 0;

                return {
                    appData: data,
                    totalArboles,
                    totalJornales,
                    canecasReales
                };
            };

            // 1. FETCH DATA
            // ----------------------------------------------------------------
            const { data: appData, error: appError } = await supabase
                .from('aplicaciones')
                .select(`
                    *,
                    tareas ( jornales_estimados ),
                    aplicaciones_cierre(*),
                    aplicaciones_lotes(*, lotes(nombre, total_arboles, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)),
                    aplicaciones_mezclas(*),
                    aplicaciones_calculos(*)
                `)
                .eq('id', aplicacionId)
                .single();

            if (appError) throw new Error(`Error fetching application: ${appError.message}`);
            if (!appData) throw new Error('Application not found');

            // Fetch comparable applications (same type, closed, excluding current)
            const { data: comparables } = await supabase
                .from('aplicaciones')
                .select('id, codigo_aplicacion, nombre_aplicacion, fecha_fin_ejecucion')
                .eq('tipo_aplicacion', appData.tipo_aplicacion)
                .eq('estado', 'Cerrada')
                .neq('id', aplicacionId)
                .order('fecha_fin_ejecucion', { ascending: false })
                .limit(10);

            setAplicacionesComparables((comparables || []).map(c => ({
                id: c.id,
                codigo: c.codigo_aplicacion || '',
                nombre: c.nombre_aplicacion || '',
                tipo: appData.tipo_aplicacion,
                fecha_cierre: c.fecha_fin_ejecucion || '',
                costo_total: 0,
                desviacion_costo: 0,
                estado: 'Cerrada' as const
            })));

            // Fetch anterior application if selected
            let anteriorData: any = null;
            if (anteriorId) {
                const anteriorResult = await agregarDatosAplicacion(anteriorId);
                anteriorData = anteriorResult;
            }

            // Fetch mixture products for planned calculations
            const mezclaIds = appData.aplicaciones_mezclas?.map((m: any) => m.id).filter(Boolean) || [];
            let mezclasProductos: any[] = [];

            if (mezclaIds.length > 0) {
                const { data } = await supabase
                    .from('aplicaciones_productos')
                    .select('mezcla_id, producto_id, producto_nombre, producto_categoria, producto_unidad, cantidad_total_necesaria, dosis_grandes, dosis_medianos, dosis_pequenos, dosis_clonales')
                    .in('mezcla_id', mezclaIds);
                mezclasProductos = data || [];

                // Fetch prices separately (RLS policy may block nested join)
                if (mezclasProductos.length > 0) {
                    const prodIds = [...new Set(mezclasProductos.map((p: any) => p.producto_id))];
                    const { data: precios } = await supabase
                        .from('productos')
                        .select('id, precio_unitario')
                        .in('id', prodIds);

                    const precioMap = new Map(precios?.map((p: any) => [p.id, p.precio_unitario]) || []);

                    // Attach prices to mezclasProductos
                    mezclasProductos = mezclasProductos.map((mp: any) => ({
                        ...mp,
                        precio_unitario: precioMap.get(mp.producto_id) || 0
                    }));
                }
            }

            // Fetch Real Data (Movements + Products)
            const { data: movimientos, error: movError } = await supabase
                .from('movimientos_diarios')
                .select('*, lotes(nombre, total_arboles)')
                .eq('aplicacion_id', aplicacionId);

            if (movError) throw movError;

            const movIds = movimientos?.map(m => m.id).filter(Boolean) || [];
            let movProductos: any[] = [];

            if (movIds.length > 0) {
                // Step 1: Get product usage from movements
                const { data: mpData } = await supabase
                    .from('movimientos_diarios_productos')
                    .select('movimiento_diario_id, producto_id, producto_nombre, cantidad_utilizada, unidad')
                    .in('movimiento_diario_id', movIds);

                movProductos = mpData || [];

                // Step 2: Fetch prices separately (RLS policy may block nested join)
                if (movProductos.length > 0) {
                    const prodIds = [...new Set(movProductos.map((p: any) => p.producto_id))];
                    const { data: precios } = await supabase
                        .from('productos')
                        .select('id, precio_unitario')
                        .in('id', prodIds);

                    const precioMap = new Map(precios?.map((p: any) => [p.id, p.precio_unitario]) || []);

                    // Attach prices to movProductos
                    movProductos = movProductos.map((mp: any) => ({
                        ...mp,
                        precio_unitario: precioMap.get(mp.producto_id) || 0
                    }));
                }
            }

            // Fetch Real Labor Data (registros_trabajo — same source as the Historial de
            // Trabajo labor log) so per-lote jornales reflect actual worker assignments
            // instead of a tree-count proration of a single application-wide total.
            const jornalesPorLoteReal = new Map<string, { jornales: number; costo: number; lote_nombre?: string; total_arboles?: number }>();
            if (appData.tarea_id) {
                const { data: registrosTrabajo } = await supabase
                    .from('registros_trabajo')
                    .select('lote_id, fraccion_jornal, costo_jornal, lotes(nombre, total_arboles)')
                    .eq('tarea_id', appData.tarea_id);

                (registrosTrabajo || []).forEach((r: any) => {
                    if (!r.lote_id) return;
                    const existing = jornalesPorLoteReal.get(r.lote_id) || {
                        jornales: 0,
                        costo: 0,
                        lote_nombre: r.lotes?.nombre,
                        total_arboles: r.lotes?.total_arboles,
                    };
                    existing.jornales += Number(r.fraccion_jornal) || 0;
                    existing.costo += Number(r.costo_jornal) || 0;
                    jornalesPorLoteReal.set(r.lote_id, existing);
                });
            }
            const totalJornalesRegistros = Array.from(jornalesPorLoteReal.values())
                .reduce((sum, v) => sum + v.jornales, 0);

            // 2. AGGREGATE DATA
            // ----------------------------------------------------------------

            // --- Helper: Totals ---
            // Tree count source: `aplicaciones_lotes` (real, populated table). This used to
            // prefer `aplicaciones_lotes_planificado` and fall back to `aplicaciones_lotes`, but
            // the planned table is always empty (CLAUDE.md, "De dónde sale el PLAN") so the
            // fallback was the only branch that ever ran — the dead preference is removed.
            const lotesSource = appData.aplicaciones_lotes || [];
            const totalArbolesApp = lotesSource.reduce((sum: number, l: any) =>
                sum + (l.total_arboles || l.lotes?.total_arboles || 0), 0) || 0;

            // Planned jornales: canonical source is tareas.jornales_estimados (entered in the
            // Labores task dialog). It is per-application total; prorate across lotes by tree count.
            // Fallback to arboles/500 when no task estimate exists.
            const tareaData = (appData as any).tareas;
            const tareaJoined = Array.isArray(tareaData) ? tareaData[0] : tareaData;
            const jornalesEstimadosApp = Number(tareaJoined?.jornales_estimados) || 0;
            const jornalesPlanLote = (arboles: number) => {
                const trees = Number(arboles) || 0;
                if (jornalesEstimadosApp > 0 && totalArbolesApp > 0) {
                    return jornalesEstimadosApp * (trees / totalArbolesApp);
                }
                return trees > 0 ? trees / 500 : 0;
            };

            // Prefer the live sum of registros_trabajo (ground truth, matches the labor log);
            // fall back to the 'jornales_utilizados' snapshot taken at cierre time when the
            // application has no linked tarea or no work has been logged yet.
            const cierreData = appData.aplicaciones_cierre as unknown as any[] | undefined;
            const totalJornalesApp = totalJornalesRegistros > 0
                ? totalJornalesRegistros
                : Number(appData.jornales_utilizados || cierreData?.[0]?.jornales_aplicacion || 0);
            const valorJornal = Number(appData.valor_jornal || cierreData?.[0]?.valor_jornal || 0);

            // --- Real Data Processing ---
            const lotesRealMap = new Map();
            const productosRealMap = new Map();

            // This used to seed lotesRealMap from `aplicaciones_lotes_planificado` before
            // aggregating movements, "to ensure coverage". That table is always empty (CLAUDE.md,
            // "De dónde sale el PLAN"), so the seed never ran — lotesRealMap has only ever been
            // populated by movements and registros_trabajo, below. Removed as dead code.

            // Aggregate Movements
            movimientos?.forEach(m => {
                const loteId = m.lote_id;
                if (!lotesRealMap.has(loteId)) {
                    // If lot wasn't in plan but has movement
                    lotesRealMap.set(loteId, {
                        lote_id: loteId,
                        lote_nombre: m.lote_nombre || m.lotes?.nombre,
                        total_arboles: m.lotes?.total_arboles || 0,
                        canecas_200l: 0,
                        litros_total: 0,
                        jornales: 0,
                        costo_mano_obra: 0
                    });
                }
                const entry = lotesRealMap.get(loteId);
                const canecas = Number(m.numero_canecas || 0);
                const bultos = Number(m.numero_bultos || 0);

                if (appData.tipo_aplicacion === 'Fertilización') {
                    entry.canecas_200l += bultos; // Use canecas_200l field to store "units/bultos"
                } else {
                    entry.canecas_200l += canecas;
                    entry.litros_total += (canecas * 200); // Assume 200L canecas
                }
            });

            // Patch tree counts from aplicaciones_lotes when lotesRealMap entries
            // were created from movements (which don't carry tree counts reliably)
            const appLotesTreeMap = new Map<string, number>();
            (appData.aplicaciones_lotes || []).forEach((al: any) => {
                const trees = al.total_arboles || al.lotes?.total_arboles || 0;
                if (trees > 0) appLotesTreeMap.set(al.lote_id, trees);
            });
            lotesRealMap.forEach((lote) => {
                const treesFromAppLotes = appLotesTreeMap.get(lote.lote_id);
                if (treesFromAppLotes && lote.total_arboles === 0) {
                    lote.total_arboles = treesFromAppLotes;
                }
            });

            // Ensure lots with logged labor but no movement/plan entry (rare) still appear
            jornalesPorLoteReal.forEach((real, loteId) => {
                if (!lotesRealMap.has(loteId)) {
                    lotesRealMap.set(loteId, {
                        lote_id: loteId,
                        lote_nombre: real.lote_nombre || 'Unknown',
                        total_arboles: real.total_arboles || 0,
                        canecas_200l: 0,
                        litros_total: 0,
                        jornales: 0,
                        costo_mano_obra: 0
                    });
                }
            });

            // Distribute Labor: when the application has any registros_trabajo, they are
            // ground truth (matches the Historial de Trabajo labor log exactly) — a lot with
            // no logged rows genuinely got 0 jornales, it must NOT receive a tree-count share
            // of jornales actually worked on other lots. Only fall back to proration when the
            // application has no registros_trabajo at all (e.g. no linked tarea).
            lotesRealMap.forEach((lote) => {
                if (totalJornalesRegistros > 0) {
                    const real = jornalesPorLoteReal.get(lote.lote_id);
                    lote.jornales = real?.jornales || 0;
                    lote.costo_mano_obra = real?.costo || (lote.jornales * valorJornal);
                } else {
                    const share = safeDivide(lote.total_arboles, totalArbolesApp);
                    lote.jornales = totalJornalesApp * share;
                    lote.costo_mano_obra = lote.jornales * valorJornal;
                }
            });

            // Aggregate Real Products
            const movLoteMap = new Map(movimientos?.map(m => [m.id, m.lote_id]));
            movProductos.forEach(mp => {
                const loteId = movLoteMap.get(mp.movimiento_diario_id);
                if (!loteId) return;

                const key = `${loteId}-${mp.producto_id}`;
                if (!productosRealMap.has(key)) {
                    productosRealMap.set(key, {
                        lote_id: loteId,
                        producto_id: mp.producto_id,
                        nombre: mp.producto_nombre,  // Now available from Phase 2
                        cantidad: 0,
                        costo: 0,
                        unidad: mp.unidad
                    });
                }
                const entry = productosRealMap.get(key);
                const qty = Number(mp.cantidad_utilizada || 0);
                const price = Number(mp.precio_unitario || 0);  // Now available from Phase 2
                entry.cantidad += qty;
                entry.costo += (qty * price);
            });

            // --- Planned Data Processing ---
            const lotesPlanMap = new Map();
            const productosPlanMap = new Map();
            let costoProductosPlanTotal = 0;

            // Plan source: `aplicaciones_lotes_planificado` is always empty (CLAUDE.md, "De
            // dónde sale el PLAN" / "Applications Data Architecture" D6). A loop reading it used
            // to sit here and silently never run — removed. `aplicaciones_calculos` is the real
            // snapshot the Calculadora wrote per lote when the application was planned
            // (`numero_canecas`/`litros_mezcla`, or `numero_bultos`/`kilos_totales` for
            // Fertilización — same field split the real-data aggregation above uses), and this
            // hook already fetches it. 4 of 20 closed applications have no `aplicaciones_calculos`
            // rows (the calculator was never run for them); those fall straight through to
            // Fallback A/B below with plan left at 0/absent — never fabricated.
            const calculosRows: any[] = appData.aplicaciones_calculos || [];
            if (lotesPlanMap.size === 0 && calculosRows.length > 0) {
                const esFertilizacionCalc = appData.tipo_aplicacion === 'Fertilización';

                calculosRows.forEach((calc: any) => {
                    const loteId = calc.lote_id;
                    const canecas = esFertilizacionCalc
                        ? Number(calc.numero_bultos || 0)
                        : Number(calc.numero_canecas || 0);
                    const litros = esFertilizacionCalc
                        ? Number(calc.kilos_totales || 0)
                        : Number(calc.litros_mezcla || 0);

                    lotesPlanMap.set(loteId, {
                        lote_id: loteId,
                        canecas_plan: canecas,
                        litros_plan: litros,
                        jornales_plan: jornalesPlanLote(calc.total_arboles)
                    });
                });

                // Per-product plan: `aplicaciones_productos.cantidad_total_necesaria` is a total
                // for the MEZCLA, not per lote — when 2+ lotes share the same `mezcla_id` (via
                // `aplicaciones_calculos.mezcla_id`, the canonical mezcla↔lote mapping — see
                // CalculadoraAplicaciones.tsx step 5b), split it across those lotes proportionally
                // to each lote's planned canecas/bultos share (the same real per-lote weight just
                // computed above), so the totals still sum to `cantidad_total_necesaria` exactly
                // and nothing is double-counted. Falls back to an equal split only if every lote
                // sharing that mezcla reads 0 canecas, so a product never silently disappears.
                const lotesPorMezcla = new Map<string, { lote_id: string; peso: number }[]>();
                calculosRows.forEach((calc: any) => {
                    if (!calc.mezcla_id) return;
                    const arr = lotesPorMezcla.get(calc.mezcla_id) || [];
                    arr.push({ lote_id: calc.lote_id, peso: lotesPlanMap.get(calc.lote_id)?.canecas_plan || 0 });
                    lotesPorMezcla.set(calc.mezcla_id, arr);
                });

                lotesPorMezcla.forEach((lotesDeEstaMezcla, mezclaId) => {
                    const prods = mezclasProductos.filter((mp: any) => mp.mezcla_id === mezclaId);
                    if (prods.length === 0) return;

                    const pesoTotal = lotesDeEstaMezcla.reduce((sum, l) => sum + l.peso, 0);

                    prods.forEach((mp: any) => {
                        const cantidadTotal = Number(mp.cantidad_total_necesaria || 0);
                        const precio = Number(mp.precio_unitario || 0);

                        lotesDeEstaMezcla.forEach(({ lote_id: loteId, peso }) => {
                            const fraccion = pesoTotal > 0 ? peso / pesoTotal : 1 / lotesDeEstaMezcla.length;
                            const cantidad = cantidadTotal * fraccion;
                            const costo = cantidad * precio;

                            costoProductosPlanTotal += costo;

                            const key = `${loteId}-${mp.producto_id}`;
                            productosPlanMap.set(key, {
                                lote_id: loteId,
                                producto_id: mp.producto_id,
                                nombre: mp.producto_nombre,
                                cantidad_plan: cantidad,
                                costo_plan: costo
                            });
                        });
                    });
                });
            }

            // Fallback A: when lotesPlanMap is empty but mezclas exist,
            // compute per-lote planned bultos from mezcla product dosis × tree sizes
            if (lotesPlanMap.size === 0 && mezclasProductos.length > 0) {
              const esFertilizacion = appData.tipo_aplicacion !== 'Fumigación';
              // Sum product dosis per mezcla per tree size
              const dosisPerMezcla = new Map<string, { grandes: number; medianos: number; pequenos: number; clonales: number }>();
              for (const prod of mezclasProductos) {
                const mid = prod.mezcla_id;
                const entry = dosisPerMezcla.get(mid) || { grandes: 0, medianos: 0, pequenos: 0, clonales: 0 };
                entry.grandes += Number(prod.dosis_grandes) || 0;
                entry.medianos += Number(prod.dosis_medianos) || 0;
                entry.pequenos += Number(prod.dosis_pequenos) || 0;
                entry.clonales += Number(prod.dosis_clonales) || 0;
                dosisPerMezcla.set(mid, entry);
              }

              const appLotes = appData.aplicaciones_lotes || [];
              for (const al of appLotes) {
                const lote = (al as any).lotes;
                const loteId = al.lote_id;
                // Read tree sizes from aplicaciones_lotes row first, then lotes join
                const grandes = al.arboles_grandes || lote?.arboles_grandes || 0;
                const medianos = al.arboles_medianos || lote?.arboles_medianos || 0;
                const pequenos = al.arboles_pequenos || lote?.arboles_pequenos || 0;
                const clonales = al.arboles_clonales || lote?.arboles_clonales || 0;
                if (grandes + medianos + pequenos + clonales === 0) continue;

                let totalKg = 0;
                for (const [, dosis] of dosisPerMezcla) {
                  totalKg += grandes * dosis.grandes / 1000;
                  totalKg += medianos * dosis.medianos / 1000;
                  totalKg += pequenos * dosis.pequenos / 1000;
                  totalKg += clonales * dosis.clonales / 1000;
                }

                const bultos = Math.round(totalKg / 50 * 10) / 10;
                lotesPlanMap.set(loteId, {
                  lote_id: loteId,
                  canecas_plan: bultos,
                  litros_plan: totalKg,
                  jornales_plan: jornalesPlanLote(al.total_arboles || lote?.total_arboles || 0),
                });

                // Compute per-product planned quantity from dosis × trees (not cantidad_total_necesaria)
                for (const mp of mezclasProductos) {
                  const key = `${loteId}-${mp.producto_id}`;
                  const prodKg =
                    grandes * (Number(mp.dosis_grandes) || 0) / 1000 +
                    medianos * (Number(mp.dosis_medianos) || 0) / 1000 +
                    pequenos * (Number(mp.dosis_pequenos) || 0) / 1000 +
                    clonales * (Number(mp.dosis_clonales) || 0) / 1000;
                  const precio = Number(mp.precio_unitario || 0);
                  const costo = prodKg * precio;
                  costoProductosPlanTotal += costo;
                  const existing = productosPlanMap.get(key);
                  if (existing) {
                    existing.cantidad_plan += prodKg;
                    existing.costo_plan += costo;
                  } else {
                    productosPlanMap.set(key, {
                      lote_id: loteId,
                      producto_id: mp.producto_id,
                      nombre: mp.producto_nombre,
                      cantidad_plan: prodKg,
                      costo_plan: costo,
                    });
                  }
                }
              }
            }

            // Fallback B: when lotesPlanMap is still empty and no mezclas exist,
            // populate jornales estimates from aplicaciones_lotes tree counts
            if (lotesPlanMap.size === 0) {
              const appLotes = appData.aplicaciones_lotes || [];
              for (const al of appLotes) {
                const loteId = al.lote_id;
                const trees = al.total_arboles || (al as any).lotes?.total_arboles || 0;
                lotesPlanMap.set(loteId, {
                  lote_id: loteId,
                  canecas_plan: 0,
                  litros_plan: 0,
                  jornales_plan: jornalesPlanLote(trees),
                });
              }
            }

            // 3. BUILD REPORT
            // ----------------------------------------------------------------

            // Totals
            // Prefer the sum of actual per-worker costo_jornal from registros_trabajo (accounts
            // for each worker's real rate); fall back to average valorJornal × jornales otherwise.
            const totalCostoManoObraReal = totalJornalesRegistros > 0
                ? Array.from(jornalesPorLoteReal.values()).reduce((sum, v) => sum + v.costo, 0)
                : totalJornalesApp * valorJornal;
            const totalCostoProductosReal = Array.from(productosRealMap.values()).reduce((sum: number, p: any) => sum + p.costo, 0);
            const totalCostoReal = totalCostoManoObraReal + totalCostoProductosReal; // Ignore app.costo_total to force recalc

            const totalCanecasReal = Array.from(lotesRealMap.values()).reduce((sum: number, l: any) => sum + l.canecas_200l, 0);
            const totalCanecasPlan = Array.from(lotesPlanMap.values()).reduce((sum: number, l: any) => sum + l.canecas_plan, 0);

            const totalLitrosReal = Array.from(lotesRealMap.values()).reduce((sum: number, l: any) => sum + l.litros_total, 0);
            const totalLitrosPlan = Array.from(lotesPlanMap.values()).reduce((sum: number, l: any) => sum + l.litros_plan, 0);

            // KPIs
            const kpis = {
                costo_total: {
                    titulo: "Costo Total",
                    valor: totalCostoReal,
                    valorFormateado: formatearMoneda(totalCostoReal),
                    comparacion: "vs Plan",
                    desviacion: calcularDesviacion(costoProductosPlanTotal, totalCostoReal), // Rough comparison
                    esPositivo: totalCostoReal <= costoProductosPlanTotal
                },
                canecas_totales: {
                    titulo: appData.tipo_aplicacion === 'Fertilización' ? 'Bultos Totales' : 'Canecas Totales',
                    valor: totalCanecasReal,
                    valorFormateado: formatearNumero(totalCanecasReal, 0),
                    comparacion: "vs Plan",
                    desviacion: calcularDesviacion(totalCanecasPlan, totalCanecasReal),
                    esPositivo: true
                },
                eficiencia_planta: {
                    titulo: appData.tipo_aplicacion === 'Fertilización' ? 'KG/planta' : 'L/planta',
                    valor: safeDivide(totalLitrosReal, totalArbolesApp),
                    valorFormateado: formatearNumero(safeDivide(totalLitrosReal, totalArbolesApp), 2),
                    comparacion: "vs Plan",
                    desviacion: calcularDesviacion(safeDivide(totalLitrosPlan, totalArbolesApp), safeDivide(totalLitrosReal, totalArbolesApp)),
                    esPositivo: true
                },
                arboles_jornal: {
                    titulo: "Árboles/Jornal",
                    valor: safeDivide(totalArbolesApp, totalJornalesApp),
                    valorFormateado: formatearNumero(safeDivide(totalArbolesApp, totalJornalesApp), 0),
                    comparacion: "vs Meta",
                    desviacion: 0,
                    esPositivo: true
                }
            };

            // Charts
            const grafico_canecas_por_lote: DatosGraficoBarrasLote[] = [];
            lotesRealMap.forEach((realLote) => {
                const planLote = lotesPlanMap.get(realLote.lote_id);
                grafico_canecas_por_lote.push({
                    lote: realLote.lote_nombre,
                    planeado: planLote?.canecas_plan || 0,
                    real: realLote.canecas_200l,
                    anterior: anteriorData?.canecasReales || 0
                });
            });

            const grafico_productos_por_lote: DatosGraficoBarrasLote[] = [];
            // Aggregate totals per product name
            const prodsByName = new Map();
            productosRealMap.forEach((p) => {
                if (!prodsByName.has(p.nombre)) prodsByName.set(p.nombre, { real: 0, plan: 0 });
                prodsByName.get(p.nombre).real += p.cantidad;
            });
            productosPlanMap.forEach((p) => {
                if (!prodsByName.has(p.nombre)) prodsByName.set(p.nombre, { real: 0, plan: 0 });
                prodsByName.get(p.nombre).plan += p.cantidad_plan;
            });

            prodsByName.forEach((val, key) => {
                grafico_productos_por_lote.push({
                    lote: key, // Using 'lote' field for product name on x-axis
                    real: val.real,
                    planeado: val.plan,
                    anterior: 0 // Anterior product data would require detailed aggregation
                });
            });

            // Fetch last 3 applications for historical chart
            const { data: historico } = await supabase
                .from('aplicaciones')
                .select('id, codigo_aplicacion, nombre_aplicacion, fecha_fin_ejecucion, jornales_utilizados, valor_jornal, costo_total_insumos, costo_total_mano_obra, costo_total')
                .eq('tipo_aplicacion', appData.tipo_aplicacion)
                .eq('estado', 'Cerrada')
                .order('fecha_fin_ejecucion', { ascending: false })
                .limit(3);

            // Build historical chart data
            const grafico_costos_historico = await Promise.all((historico || []).map(async (app: any) => {
                // Fetch product costs for each application
                const { data: movs } = await supabase
                    .from('movimientos_diarios')
                    .select('id')
                    .eq('aplicacion_id', app.id);

                const movIds = movs?.map(m => m.id) || [];
                let costoProductos = 0;

                if (movIds.length > 0) {
                    // Step 1: Get product usage
                    const { data: prods } = await supabase
                        .from('movimientos_diarios_productos')
                        .select('producto_id, cantidad_utilizada')
                        .in('movimiento_diario_id', movIds);

                    // Step 2: Fetch prices separately
                    const prodIds = [...new Set(prods?.map((p: any) => p.producto_id) || [])];

                    if (prodIds.length > 0) {
                        const { data: precios } = await supabase
                            .from('productos')
                            .select('id, precio_unitario')
                            .in('id', prodIds);

                        const precioMap = new Map(precios?.map((p: any) => [p.id, p.precio_unitario]) || []);

                        costoProductos = prods?.reduce((sum: number, p: any) => {
                            const precio = precioMap.get(p.producto_id) || 0;
                            const cantidad = Number(p.cantidad_utilizada || 0);
                            return sum + (precio * cantidad);
                        }, 0) || 0;
                    }
                }

                const jornales = Number(app.jornales_utilizados || 0);
                const valorJornal = Number(app.valor_jornal || 0);
                const costoJornales = jornales * valorJornal;

                return {
                    aplicacion: app.nombre_aplicacion || app.codigo_aplicacion,
                    fecha: app.fecha_fin_ejecucion || '',
                    costoProductos,
                    costoJornales,
                    costoTotal: costoProductos + costoJornales
                };
            }));

            // Sort chronologically (oldest to newest)
            grafico_costos_historico.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

            // Graphs 3: Jornales
            const grafico_jornales_por_lote: DatosGraficoBarrasLote[] = [];
            lotesRealMap.forEach((realLote) => {
                const planLote = lotesPlanMap.get(realLote.lote_id);
                grafico_jornales_por_lote.push({
                    lote: realLote.lote_nombre,
                    planeado: planLote?.jornales_plan || 0,
                    real: realLote.jornales,
                    anterior: anteriorData ? safeDivide(anteriorData.totalJornales, lotesRealMap.size) : 0
                });
            });


            // Detail Tables Construction
            const detalle_canecas = {
                totales: {
                    lote_id: '',
                    lote_nombre: 'Total',
                    // D2 fix (1/5, 2/5): calcularCambio devuelve undefined cuando planeado es 0/ausente
                    // — nunca un +100% fabricado. aplicaciones_lotes_planificado está vacía hoy, así que
                    // esto es el caso normal, no la excepción (decisión 4 del contrato, CLAUDE.md D2).
                    canecas: { real: totalCanecasReal, planeado: totalCanecasPlan, desviacion: calcularCambio(totalCanecasReal, totalCanecasPlan) },
                    litros_totales: { real: totalLitrosReal, planeado: totalLitrosPlan, desviacion: calcularCambio(totalLitrosReal, totalLitrosPlan) }
                } as CanecasPorLote,
                por_lote: Array.from(lotesRealMap.values()).map(l => {
                    const planLote = lotesPlanMap.get(l.lote_id);
                    const canecasPlan = planLote?.canecas_plan || 0;
                    const litrosPlan = planLote?.litros_plan || 0;
                    return {
                        lote_id: l.lote_id,
                        lote_nombre: l.lote_nombre,
                        canecas: { real: l.canecas_200l, planeado: canecasPlan, desviacion: calcularDesviacion(canecasPlan, l.canecas_200l) },
                        litros_totales: { real: l.litros_total, planeado: litrosPlan, desviacion: calcularDesviacion(litrosPlan, l.litros_total) }
                    };
                })
            };

            const detalle_jornales = {
                totales: {
                    lote_id: '',
                    lote_nombre: 'Total',
                    jornales_preparacion: { real: 0, planeado: 0, desviacion: 0 },
                    jornales_aplicacion: { real: totalJornalesApp, planeado: 0, desviacion: 0 },
                    jornales_transporte: { real: 0, planeado: 0, desviacion: 0 },
                    jornales_total: { real: totalJornalesApp, planeado: 0, desviacion: 0 },
                    arboles_por_jornal: { real: kpis.arboles_jornal.valor, planeado: 0, desviacion: 0 }
                } as JornalesPorLote,
                por_lote: Array.from(lotesRealMap.values()).map(l => {
                    const arbolesJornal = safeDivide(l.total_arboles, l.jornales);
                    return {
                        lote_id: l.lote_id,
                        lote_nombre: l.lote_nombre,
                        jornales_preparacion: { real: 0, planeado: 0, desviacion: 0 },
                        jornales_aplicacion: { real: l.jornales, planeado: 0, desviacion: 0 },
                        jornales_transporte: { real: 0, planeado: 0, desviacion: 0 },
                        jornales_total: { real: l.jornales, planeado: 0, desviacion: 0 },
                        arboles_por_jornal: { real: arbolesJornal, planeado: 0, desviacion: 0 }
                    };
                }),
                valor_jornal: valorJornal
            };

            // Caneca size: `aplicaciones_lotes_planificado` is always empty (CLAUDE.md, "De
            // dónde sale el PLAN"), so this used to always resolve to the literal fallback below
            // — it was never reading a real per-application value. `aplicaciones_calculos`
            // doesn't carry `tamano_caneca` either (checked: its columns are numero_canecas /
            // litros_mezcla / numero_bultos / kilos_*, no caneca size). The real source is
            // `aplicaciones_lotes`, populated on every closed application (see
            // CalculadoraAplicaciones.tsx's lote insert) and already fetched above. Fertilización
            // applications store `tamano_caneca: null` there (they use bultos, not canecas), so
            // they still fall through to the default — same result as before, for the right
            // reason instead of an always-empty table.
            const TAMANO_CANECA_DEFAULT_L = 200;
            const tamanoCaneca = appData.aplicaciones_lotes?.[0]?.tamano_caneca || TAMANO_CANECA_DEFAULT_L;

            setReporte({
                aplicacion_id: appData.id,
                codigo_aplicacion: appData.codigo_aplicacion,
                nombre_aplicacion: appData.nombre_aplicacion,
                tipo_aplicacion: appData.tipo_aplicacion,
                fecha_inicio: appData.fecha_inicio_ejecucion || (appData as any).fecha_inicio,
                fecha_fin: appData.fecha_fin_ejecucion || (appData as any).fecha_fin,
                dias_aplicacion: (cierreData as any)?.[0]?.dias_aplicacion || 1,
                tamano_caneca: tamanoCaneca,
                aplicacion_anterior_id: anteriorId || undefined,
                aplicacion_anterior_nombre: anteriorData?.appData?.nombre_aplicacion || anteriorData?.appData?.codigo_aplicacion || undefined,
                total_arboles: totalArbolesApp,
                kpis,
                grafico_costos_historico,
                grafico_canecas_por_lote,
                grafico_productos_por_lote: grafico_productos_por_lote.slice(0, 8),
                grafico_jornales_por_lote,
                grafico_eficiencia_por_lote: Array.from(lotesRealMap.values()).map(lote => {
                    const planLote = lotesPlanMap.get(lote.lote_id);
                    return {
                        lote: lote.lote_nombre,
                        real: safeDivide(lote.total_arboles, lote.jornales),
                        planeado: safeDivide(lote.total_arboles, planLote?.jornales_plan || 0),
                        anterior: anteriorData ? safeDivide(anteriorData.totalArboles, anteriorData.totalJornales) : 0
                    };
                }),
                detalle_canecas,
                detalle_jornales,
                detalle_productos: (() => {
                    // Helper to build product details
                    const uniqueProdKeys = new Set([...productosRealMap.keys(), ...productosPlanMap.keys()]);
                    const prodTotalsMap = new Map<string, any>();
                    const prodPorLoteRecord: Record<string, any[]> = {};

                    // Helper to get or create total entry
                    const getTotal = (name: string, id: string, unit: string) => {
                        if (!prodTotalsMap.has(name)) {
                            prodTotalsMap.set(name, {
                                producto_id: id,
                                producto_nombre: name,
                                unidad: unit,
                                cantidad: { real: 0, planeado: 0, desviacion: 0 },
                                costo: { real: 0, planeado: 0, desviacion: 0 }
                            });
                        }
                        return prodTotalsMap.get(name)!;
                    };

                    lotesRealMap.forEach(l => {
                        const lotProds: any[] = [];
                        uniqueProdKeys.forEach(key => { // key is loteId-prodId
                            if (!key.startsWith(l.lote_id)) return;

                            const real = productosRealMap.get(key);
                            const plan = productosPlanMap.get(key);
                            const name = real?.nombre || plan?.nombre;
                            const id = real?.producto_id || plan?.producto_id;
                            const unit = real?.unidad || 'unidad';

                            if (!name) return;

                            const cantidadReal = real?.cantidad || 0;
                            const cantidadPlan = plan?.cantidad_plan || 0;
                            const costoReal = real?.costo || 0;
                            const costoPlan = plan?.costo_plan || 0;

                            const row = {
                                producto_id: id,
                                producto_nombre: name,
                                unidad: unit,
                                cantidad: {
                                    real: cantidadReal,
                                    planeado: cantidadPlan,
                                    desviacion: calcularDesviacion(cantidadPlan, cantidadReal)
                                },
                                costo: {
                                    real: costoReal,
                                    planeado: costoPlan,
                                    desviacion: calcularDesviacion(costoPlan, costoReal)
                                }
                            };
                            lotProds.push(row);

                            // Add to totals
                            const tot = getTotal(name, id, unit);
                            tot.cantidad.real += row.cantidad.real;
                            tot.cantidad.planeado += row.cantidad.planeado;
                            tot.costo.real += row.costo.real;
                            tot.costo.planeado += row.costo.planeado;
                            // Recalculate deviations for totals
                            tot.cantidad.desviacion = calcularDesviacion(tot.cantidad.planeado, tot.cantidad.real);
                            tot.costo.desviacion = calcularDesviacion(tot.costo.planeado, tot.costo.real);
                        });
                        prodPorLoteRecord[l.lote_id] = lotProds;
                    });

                    return {
                        totales: Array.from(prodTotalsMap.values()),
                        por_lote: prodPorLoteRecord
                    };
                })(),
                alertas: [],
                // D2 fix (3/5, 4/5, 5/5): mismo cambio que arriba, aplicado a los totales
                // financieros que alimentan directamente las 4 tarjetas KPI del Reporte.
                financiero: {
                    costo_productos: {
                        real: totalCostoProductosReal,
                        planeado: costoProductosPlanTotal,
                        desviacion: calcularCambio(totalCostoProductosReal, costoProductosPlanTotal),
                        cambio: 0
                    },
                    costo_jornales: {
                        real: totalCostoManoObraReal,
                        planeado: 0,
                        desviacion: 0,
                        cambio: 0
                    },
                    // `costo_total` y `costo_por_arbol` NO llevan plan, a propósito.
                    //
                    // `totalCostoReal` es insumos + mano de obra, pero el único plan que existe es
                    // el de insumos (`costoProductosPlanTotal`); no hay plan de jornales guardado
                    // en ninguna parte — `costo_jornales.planeado` es 0 justo arriba. Compararlos
                    // es un error de categoría: da "+138,1%" para una aplicación cuyo consumo de
                    // insumos se desvió +0,4%. El código venía marcando esa línea como
                    // "// Rough comparison" desde antes.
                    //
                    // Mientras `aplicaciones_lotes_planificado` estuvo vacía esto no se notaba: el
                    // plan era 0 y salía el +100% falso de D2. Al traer el plan real desde
                    // `aplicaciones_calculos`, la cifra pasó a ser plausible y equivocada, que es
                    // peor. Sin plan de mano de obra no hay plan de costo total — y la regla del
                    // proyecto es no inventar la comparación: `planeado: 0` hace que KPICard omita
                    // el badge y la tabla muestre "—".
                    // `costo_productos` sí conserva su plan: ahí sí se comparan insumos con insumos.
                    costo_total: {
                        real: totalCostoReal,
                        planeado: 0,
                        desviacion: undefined,
                        cambio: 0
                    },
                    costo_por_arbol: (() => {
                        const real = safeDivide(totalCostoReal, totalArbolesApp);
                        return {
                            real,
                            planeado: 0,
                            desviacion: undefined,
                            cambio: 0
                        };
                    })()
                },
                anterior: anteriorData ? {
                    nombre: anteriorData.appData?.nombre_aplicacion || anteriorData.appData?.codigo_aplicacion || '',
                    costo_total: Number(anteriorData.appData?.costo_total || 0),
                    costo_por_arbol: Number(anteriorData.appData?.costo_por_arbol || 0),
                    total_arboles: anteriorData.totalArboles || 0,
                    canecas: anteriorData.canecasReales || 0,
                    jornales: anteriorData.totalJornales || 0,
                    arboles_por_jornal: safeDivide(anteriorData.totalArboles, anteriorData.totalJornales),
                } : undefined,
            });

        } catch (err: any) {
            console.error('Error report:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [aplicacionId, anteriorId]);

    useEffect(() => {
        fetchReporte();
    }, [fetchReporte]);

    return {
        reporte,
        loading,
        error,
        aplicacionesComparables,
        seleccionarAnterior,
        refetch: fetchReporte,
    };
}
