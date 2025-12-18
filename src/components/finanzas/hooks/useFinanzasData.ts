import { useState, useEffect } from 'react';
import { getSupabase } from '../../../utils/supabase/client';
import type {
  KPIData,
  TendenciaData,
  DistribucionData,
  FiltrosFinanzas,
  Gasto,
  Ingreso
} from '../../../types/finanzas';

/**
 * Hook personalizado para cargar datos financieros
 */
export function useFinanzasData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabase();

  /**
   * Helper para aplicar filtros de negocio y región
   */
  const aplicarFiltrosNegocioRegion = (query: any, filtros: FiltrosFinanzas) => {
    // Aplicar filtro de negocio
    if (filtros.negocio_id) {
      if (Array.isArray(filtros.negocio_id)) {
        query = query.in('negocio_id', filtros.negocio_id);
      } else {
        query = query.eq('negocio_id', filtros.negocio_id);
      }
    }

    // Aplicar filtro de región
    if (filtros.region_id) {
      if (Array.isArray(filtros.region_id)) {
        query = query.in('region_id', filtros.region_id);
      } else {
        query = query.eq('region_id', filtros.region_id);
      }
    }

    return query;
  };

  /**
   * Cargar KPIs del período
   */
  const getKPIs = async (filtros: FiltrosFinanzas): Promise<KPIData> => {
    try {
      setLoading(true);
      setError(null);

      // Construir query base para gastos
      let gastosQuery = supabase
        .from('fin_gastos')
        .select('valor, estado')
        .eq('estado', 'Confirmado');

      // Construir query base para ingresos
      let ingresosQuery = supabase
        .from('fin_ingresos')
        .select('valor');

      // Aplicar filtros de fecha
      if (filtros.fecha_desde) {
        gastosQuery = gastosQuery.gte('fecha', filtros.fecha_desde);
        ingresosQuery = ingresosQuery.gte('fecha', filtros.fecha_desde);
      }
      if (filtros.fecha_hasta) {
        gastosQuery = gastosQuery.lte('fecha', filtros.fecha_hasta);
        ingresosQuery = ingresosQuery.lte('fecha', filtros.fecha_hasta);
      }

      // Aplicar filtros de negocio y región
      gastosQuery = aplicarFiltrosNegocioRegion(gastosQuery, filtros);
      ingresosQuery = aplicarFiltrosNegocioRegion(ingresosQuery, filtros);

      // Ejecutar queries
      const [gastosResult, ingresosResult] = await Promise.all([
        gastosQuery,
        ingresosQuery
      ]);

      if (gastosResult.error) throw gastosResult.error;
      if (ingresosResult.error) throw ingresosResult.error;

      // Calcular totales
      const gastosTotal = gastosResult.data?.reduce((sum, gasto) => sum + (gasto.valor || 0), 0) || 0;
      const ingresosTotal = ingresosResult.data?.reduce((sum, ingreso) => sum + (ingreso.valor || 0), 0) || 0;
      const flujoNeto = ingresosTotal - gastosTotal;
      const margenPorcentaje = ingresosTotal > 0 ? ((flujoNeto / ingresosTotal) * 100) : 0;

      return {
        ingresos_total: ingresosTotal,
        gastos_total: gastosTotal,
        flujo_neto: flujoNeto,
        margen_porcentaje: Math.round(margenPorcentaje * 100) / 100, // 2 decimales
        periodo: filtros.fecha_desde && filtros.fecha_hasta
          ? `${filtros.fecha_desde} - ${filtros.fecha_hasta}`
          : 'Período actual'
      };

    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cargar datos para gráfico de tendencias (líneas ingresos vs gastos)
   */
  const getTendencias = async (filtros: FiltrosFinanzas): Promise<TendenciaData[]> => {
    try {
      setLoading(true);
      setError(null);

      // Para simplificar, vamos a agrupar por mes
      // En una implementación completa, esto debería ser más sofisticado

      const fechaInicio = filtros.fecha_desde || '2024-01-01';
      const fechaFin = filtros.fecha_hasta || new Date().toISOString().split('T')[0];

      // Query gastos agrupados por mes
      let gastosQuery = supabase
        .from('fin_gastos')
        .select('fecha, valor')
        .eq('estado', 'Confirmado')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin);

      // Query ingresos agrupados por mes
      let ingresosQuery = supabase
        .from('fin_ingresos')
        .select('fecha, valor')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin);

      // Aplicar filtros adicionales
      gastosQuery = aplicarFiltrosNegocioRegion(gastosQuery, filtros);
      ingresosQuery = aplicarFiltrosNegocioRegion(ingresosQuery, filtros);

      const [gastosResult, ingresosResult] = await Promise.all([
        gastosQuery,
        ingresosQuery
      ]);

      if (gastosResult.error) throw gastosResult.error;
      if (ingresosResult.error) throw ingresosResult.error;

      // Agrupar por mes
      const datosPorMes: { [mes: string]: { ingresos: number; gastos: number } } = {};

      // Procesar gastos
      gastosResult.data?.forEach(gasto => {
        const mes = gasto.fecha.substring(0, 7); // YYYY-MM
        if (!datosPorMes[mes]) {
          datosPorMes[mes] = { ingresos: 0, gastos: 0 };
        }
        datosPorMes[mes].gastos += gasto.valor || 0;
      });

      // Procesar ingresos
      ingresosResult.data?.forEach(ingreso => {
        const mes = ingreso.fecha.substring(0, 7); // YYYY-MM
        if (!datosPorMes[mes]) {
          datosPorMes[mes] = { ingresos: 0, gastos: 0 };
        }
        datosPorMes[mes].ingresos += ingreso.valor || 0;
      });

      // Convertir a array ordenado
      const tendencias: TendenciaData[] = Object.entries(datosPorMes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, valores]) => ({
          fecha: mes,
          ingresos: valores.ingresos,
          gastos: valores.gastos
        }));

      return tendencias;

    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cargar datos para gráfico de distribución de gastos por categoría
   */
  const getDistribucion = async (filtros: FiltrosFinanzas): Promise<DistribucionData[]> => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('fin_gastos')
        .select(`
          valor,
          categoria_id,
          fin_categorias_gastos (
            nombre
          )
        `)
        .eq('estado', 'Confirmado');

      // Aplicar filtros
      if (filtros.fecha_desde) query = query.gte('fecha', filtros.fecha_desde);
      if (filtros.fecha_hasta) query = query.lte('fecha', filtros.fecha_hasta);
      query = aplicarFiltrosNegocioRegion(query, filtros);

      const { data, error } = await query;

      if (error) throw error;

      // Agrupar por categoría
      const distribucionPorCategoria: { [categoriaId: string]: { nombre: string; valor: number } } = {};

      data?.forEach((gasto: any) => {
        const categoriaId = gasto.categoria_id || 'sin_categoria';
        const categoriaNombre = gasto.fin_categorias_gastos?.nombre || 'Sin categoría';

        if (!distribucionPorCategoria[categoriaId]) {
          distribucionPorCategoria[categoriaId] = { nombre: categoriaNombre, valor: 0 };
        }
        distribucionPorCategoria[categoriaId].valor += gasto.valor || 0;
      });

      // Calcular total para porcentajes
      const total = Object.values(distribucionPorCategoria).reduce((sum, cat) => sum + cat.valor, 0);

      // Convertir a array con porcentajes
      const distribucion: DistribucionData[] = Object.entries(distribucionPorCategoria)
        .map(([categoriaId, { nombre, valor }]) => ({
          categoria: nombre,
          categoria_id: categoriaId,
          valor,
          porcentaje: total > 0 ? Math.round((valor / total) * 100 * 10) / 10 : 0 // 1 decimal
        }))
        .sort((a, b) => b.valor - a.valor); // Ordenar por valor descendente

      return distribucion;

    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cargar datos para gráfico de distribución de ingresos por categoría
   */
  const getDistribucionIngresos = async (filtros: FiltrosFinanzas): Promise<DistribucionData[]> => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('fin_ingresos')
        .select(`
          valor,
          categoria_id,
          fin_categorias_ingresos (
            nombre
          )
        `);

      // Aplicar filtros
      if (filtros.fecha_desde) query = query.gte('fecha', filtros.fecha_desde);
      if (filtros.fecha_hasta) query = query.lte('fecha', filtros.fecha_hasta);
      query = aplicarFiltrosNegocioRegion(query, filtros);

      const { data, error } = await query;

      if (error) throw error;

      // Agrupar por categoría
      const distribucionPorCategoria: { [categoriaId: string]: { nombre: string; valor: number } } = {};

      data?.forEach((ingreso: any) => {
        const categoriaId = ingreso.categoria_id || 'sin_categoria';
        const categoriaNombre = ingreso.fin_categorias_ingresos?.nombre || 'Sin categoría';

        if (!distribucionPorCategoria[categoriaId]) {
          distribucionPorCategoria[categoriaId] = { nombre: categoriaNombre, valor: 0 };
        }
        distribucionPorCategoria[categoriaId].valor += ingreso.valor || 0;
      });

      // Calcular total para porcentajes
      const total = Object.values(distribucionPorCategoria).reduce((sum, cat) => sum + cat.valor, 0);

      // Convertir a array con porcentajes
      const distribucion: DistribucionData[] = Object.entries(distribucionPorCategoria)
        .map(([categoriaId, { nombre, valor }]) => ({
          categoria: nombre,
          categoria_id: categoriaId,
          valor,
          porcentaje: total > 0 ? Math.round((valor / total) * 100 * 10) / 10 : 0 // 1 decimal
        }))
        .sort((a, b) => b.valor - a.valor); // Ordenar por valor descendente

      return distribucion;

    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cargar gastos con filtros
   */
  const getGastos = async (filtros: FiltrosFinanzas): Promise<Gasto[]> => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('fin_gastos')
        .select(`
          *,
          fin_negocios (nombre),
          fin_regiones (nombre),
          fin_categorias_gastos (nombre),
          fin_conceptos_gastos (nombre),
          fin_proveedores (nombre),
          fin_medios_pago (nombre)
        `)
        .order('fecha', { ascending: false });

      // Aplicar filtros
      if (filtros.fecha_desde) query = query.gte('fecha', filtros.fecha_desde);
      if (filtros.fecha_hasta) query = query.lte('fecha', filtros.fecha_hasta);
      query = aplicarFiltrosNegocioRegion(query, filtros);

      const { data, error } = await query;

      if (error) throw error;

      return data || [];

    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cargar ingresos con filtros
   */
  const getIngresos = async (filtros: FiltrosFinanzas): Promise<Ingreso[]> => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('fin_ingresos')
        .select(`
          *,
          fin_negocios (nombre),
          fin_regiones (nombre),
          fin_categorias_ingresos (nombre),
          fin_compradores (nombre),
          fin_medios_pago (nombre)
        `)
        .order('fecha', { ascending: false });

      // Aplicar filtros
      if (filtros.fecha_desde) query = query.gte('fecha', filtros.fecha_desde);
      if (filtros.fecha_hasta) query = query.lte('fecha', filtros.fecha_hasta);
      query = aplicarFiltrosNegocioRegion(query, filtros);

      const { data, error } = await query;

      if (error) throw error;

      return data || [];

    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cargar datos para gráfico de distribución de gastos por concepto
   * Permite filtrar opcionalmente por una categoría específica
   */
  const getDistribucionConceptos = async (
    filtros: FiltrosFinanzas,
    categoriaId?: string
  ): Promise<DistribucionData[]> => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('fin_gastos')
        .select(`
          valor,
          concepto_id,
          categoria_id,
          fin_conceptos_gastos (
            nombre,
            categoria_id
          )
        `)
        .eq('estado', 'Confirmado');

      // Aplicar filtros
      if (filtros.fecha_desde) query = query.gte('fecha', filtros.fecha_desde);
      if (filtros.fecha_hasta) query = query.lte('fecha', filtros.fecha_hasta);
      query = aplicarFiltrosNegocioRegion(query, filtros);

      // Filtro adicional por categoría (local al gráfico)
      if (categoriaId) {
        query = query.eq('categoria_id', categoriaId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Agrupar por concepto
      const distribucionPorConcepto: { [conceptoId: string]: { nombre: string; valor: number } } = {};

      data?.forEach((gasto: any) => {
        const conceptoId = gasto.concepto_id || 'sin_concepto';
        const conceptoNombre = gasto.fin_conceptos_gastos?.nombre || 'Sin concepto';

        if (!distribucionPorConcepto[conceptoId]) {
          distribucionPorConcepto[conceptoId] = { nombre: conceptoNombre, valor: 0 };
        }
        distribucionPorConcepto[conceptoId].valor += gasto.valor || 0;
      });

      // Calcular total para porcentajes
      const total = Object.values(distribucionPorConcepto).reduce((sum, con) => sum + con.valor, 0);

      // Convertir a array con porcentajes
      const distribucion: DistribucionData[] = Object.entries(distribucionPorConcepto)
        .map(([conceptoId, { nombre, valor }]) => ({
          categoria: nombre, // Usamos 'categoria' por compatibilidad con el tipo
          categoria_id: conceptoId,
          valor,
          porcentaje: total > 0 ? Math.round((valor / total) * 100 * 10) / 10 : 0 // 1 decimal
        }))
        .sort((a, b) => b.valor - a.valor); // Ordenar por valor descendente

      return distribucion;

    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    getKPIs,
    getTendencias,
    getDistribucion,
    getDistribucionIngresos,
    getDistribucionConceptos,
    getGastos,
    getIngresos
  };
}