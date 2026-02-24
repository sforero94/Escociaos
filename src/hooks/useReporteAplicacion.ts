import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../utils/supabase/client';
import {
    calcularDesviacion,
    convertirCanecasALitros,
    formatearDesviacion,
    formatearMoneda,
    formatearNumero,
} from '../utils/calculosReporteAplicacion';
import type {
    ReporteAplicacionCerrada,
    KPICardData,
    DatosGraficoBarrasLote,
    DatosGraficoCostos,
    CanecasPorLote,
    JornalesPorLote,
    FilaComparacion,
    ResumenAplicacionCerrada,
} from '../types/aplicaciones';

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
                        aplicaciones_lotes(*, lotes(nombre, total_arboles)),
                        aplicaciones_lotes_planificado(*, lotes(nombre, total_arboles)),
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

                const totalArboles = data.aplicaciones_lotes_planificado?.reduce((sum: number, l: any) =>
                    sum + (l.total_arboles || l.lotes?.total_arboles || 0), 0) || 0;
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
                    aplicaciones_cierre(*),
                    aplicaciones_lotes(*, lotes(nombre, total_arboles)),
                    aplicaciones_lotes_planificado(*, lotes(nombre, total_arboles)),
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
                    .select('mezcla_id, producto_id, producto_nombre, producto_categoria, producto_unidad, cantidad_total_necesaria')
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

            // 2. AGGREGATE DATA
            // ----------------------------------------------------------------

            // --- Helper: Totals ---
            const totalArbolesApp = appData.aplicaciones_lotes_planificado?.reduce((sum: number, l: any) =>
                sum + (l.total_arboles || l.lotes?.total_arboles || 0), 0) || 0;

            // Use 'jornales_utilizados' from app for total labor, defaulting to 0
            const totalJornalesApp = Number(appData.jornales_utilizados || appData.aplicaciones_cierre?.[0]?.jornales_aplicacion || 0);
            const valorJornal = Number(appData.valor_jornal || appData.aplicaciones_cierre?.[0]?.valor_jornal || 0);

            // --- Real Data Processing ---
            const lotesRealMap = new Map();
            const productosRealMap = new Map();

            // Initialize real map with all planned lots to ensure coverage
            appData.aplicaciones_lotes_planificado?.forEach((plan: any) => {
                const loteId = plan.lote_id;
                lotesRealMap.set(loteId, {
                    lote_id: loteId,
                    lote_nombre: plan.lotes?.nombre || 'Unknown',
                    total_arboles: plan.total_arboles || plan.lotes?.total_arboles || 0,
                    canecas_200l: 0,
                    litros_total: 0,
                    jornales: 0,
                    costo_mano_obra: 0
                });
            });

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

            // Distribute Labor (Proportional to trees)
            lotesRealMap.forEach((lote) => {
                const share = safeDivide(lote.total_arboles, totalArbolesApp);
                lote.jornales = totalJornalesApp * share;
                lote.costo_mano_obra = lote.jornales * valorJornal;
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

            appData.aplicaciones_lotes_planificado?.forEach((lp: any) => {
                const loteId = lp.lote_id;
                const mezclaId = lp.mezcla_id;
                const canecas = Number(lp.canecas_planificado || 0); // Need to verify if this is populated
                const litros = lp.litros_mezcla_planificado || (canecas * (lp.tamano_caneca || 200));

                lotesPlanMap.set(loteId, {
                    lote_id: loteId,
                    canecas_plan: canecas,
                    litros_plan: litros,
                    jornales_plan: Math.ceil(lp.total_arboles / 500) // Rough estimate if not stored
                });

                // Products in this mixture
                const prods = mezclasProductos?.filter((mp: any) => mp.mezcla_id === mezclaId) || [];
                prods.forEach((mp: any) => {
                    const key = `${loteId}-${mp.producto_id}`;
                    // Dosis check: usually per caneca for field applications
                    const dosis = Number(mp.dosis || 0);
                    const cantidad = canecas * dosis;
                    const precio = Number(mp.precio_unitario || 0);  // Now available from Phase 1
                    const costo = cantidad * precio;

                    costoProductosPlanTotal += costo;

                    productosPlanMap.set(key, {
                        lote_id: loteId,
                        producto_id: mp.producto_id,
                        nombre: mp.producto_nombre,  // Now available from Phase 1
                        cantidad_plan: cantidad,
                        costo_plan: costo
                    });
                });
            });

            // 3. BUILD REPORT
            // ----------------------------------------------------------------

            // Totals
            const totalCostoManoObraReal = totalJornalesApp * valorJornal;
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
                    canecas: { real: totalCanecasReal, planeado: totalCanecasPlan, desviacion: calcularDesviacion(totalCanecasPlan, totalCanecasReal) },
                    litros_totales: { real: totalLitrosReal, planeado: totalLitrosPlan, desviacion: calcularDesviacion(totalLitrosPlan, totalLitrosReal) }
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

            // Get caneca size from first planned lot (or default to 200L)
            const tamanoCaneca = appData.aplicaciones_lotes_planificado?.[0]?.tamano_caneca || 200;

            setReporte({
                aplicacion_id: appData.id,
                codigo_aplicacion: appData.codigo_aplicacion,
                nombre_aplicacion: appData.nombre_aplicacion,
                tipo_aplicacion: appData.tipo_aplicacion,
                fecha_inicio: appData.fecha_inicio_ejecucion || appData.fecha_inicio,
                fecha_fin: appData.fecha_fin_ejecucion || appData.fecha_fin,
                dias_aplicacion: appData.aplicaciones_cierre?.[0]?.dias_aplicacion || 1,
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
                financiero: {
                    costo_productos: {
                        real: totalCostoProductosReal,
                        planeado: costoProductosPlanTotal,
                        desviacion: calcularDesviacion(costoProductosPlanTotal, totalCostoProductosReal),
                        cambio: 0
                    },
                    costo_jornales: {
                        real: totalCostoManoObraReal,
                        planeado: 0,
                        desviacion: 0,
                        cambio: 0
                    },
                    costo_total: {
                        real: totalCostoReal,
                        planeado: costoProductosPlanTotal,
                        desviacion: calcularDesviacion(costoProductosPlanTotal, totalCostoReal),
                        cambio: 0
                    },
                    costo_por_arbol: {
                        real: safeDivide(totalCostoReal, totalArbolesApp),
                        planeado: 0,
                        desviacion: 0,
                        cambio: 0
                    }
                }
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
