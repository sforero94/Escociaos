import { useState, useEffect } from 'react';
import { getSupabase } from '../../../utils/supabase/client';
import { formatNumber } from '../../../utils/format';
import { calcularRangoFechasPorPeriodo } from '../../../utils/fechas';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { FiltrosFinanzas, ReportePyG } from '../../../types/finanzas';

interface PyGReportProps {
  filtros: FiltrosFinanzas;
  onReporteGenerated?: (reporte: ReportePyG) => void;
}

export function PyGReport({ filtros, onReporteGenerated }: PyGReportProps) {
  const [reporte, setReporte] = useState<ReportePyG | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReporte();
  }, [filtros, filtros.periodo, filtros.negocio_id, filtros.region_id, filtros.fecha_desde, filtros.fecha_hasta]);

  const loadReporte = async () => {
    try {
      setLoading(true);
      setError(null);

      const supabase = getSupabase();

      // Build date filters based on selected period
      let fechaDesde: string;
      let fechaHasta: string;

      if (filtros.periodo === 'rango_personalizado') {
        // Use custom dates from filtros
        fechaDesde = filtros.fecha_desde || '';
        fechaHasta = filtros.fecha_hasta || '';
      } else {
        // Calculate dates based on period
        const rangoDeFechas = calcularRangoFechasPorPeriodo(filtros.periodo || 'mes_actual');
        fechaDesde = rangoDeFechas.fecha_desde;
        fechaHasta = rangoDeFechas.fecha_hasta;
      }


      // Build filters
      let ingresosQuery = supabase
        .from('fin_ingresos')
        .select(`
          valor,
          fin_negocios (nombre),
          fin_categorias_ingresos (nombre)
        `)
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta);

      let gastosQuery = supabase
        .from('fin_gastos')
        .select(`
          valor,
          fin_negocios (nombre),
          fin_categorias_gastos (nombre)
        `)
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta);

      // Apply business filter if selected
      if (filtros.negocio_id) {
        ingresosQuery = ingresosQuery.eq('negocio_id', filtros.negocio_id);
        gastosQuery = gastosQuery.eq('negocio_id', filtros.negocio_id);
      }

      // Apply region filter if selected
      if (filtros.region_id) {
        ingresosQuery = ingresosQuery.eq('region_id', filtros.region_id);
        gastosQuery = gastosQuery.eq('region_id', filtros.region_id);
      }

      // Execute queries
      const [ingresosResult, gastosResult] = await Promise.all([
        ingresosQuery,
        gastosQuery
      ]);

      if (ingresosResult.error) throw ingresosResult.error;
      if (gastosResult.error) throw gastosResult.error;

      // Process incomes by business and category
      const ingresosPorNegocio: { [key: string]: { total: number; categorias: { [key: string]: number } } } = {};
      let totalIngresos = 0;

      ingresosResult.data?.forEach((ingreso: any) => {
        const negocioNombre = ingreso.fin_negocios?.nombre || 'Sin negocio';
        const categoriaNombre = ingreso.fin_categorias_ingresos?.nombre || 'Sin categoría';
        const valor = ingreso.valor || 0;

        if (!ingresosPorNegocio[negocioNombre]) {
          ingresosPorNegocio[negocioNombre] = { total: 0, categorias: {} };
        }

        ingresosPorNegocio[negocioNombre].total += valor;
        ingresosPorNegocio[negocioNombre].categorias[categoriaNombre] =
          (ingresosPorNegocio[negocioNombre].categorias[categoriaNombre] || 0) + valor;

        totalIngresos += valor;
      });

      // Process expenses by category
      const gastosPorCategoria: { [key: string]: number } = {};
      let totalGastos = 0;

      gastosResult.data?.forEach((gasto: any) => {
        const categoriaNombre = gasto.fin_categorias_gastos?.nombre || 'Sin categoría';
        const valor = gasto.valor || 0;

        gastosPorCategoria[categoriaNombre] = (gastosPorCategoria[categoriaNombre] || 0) + valor;
        totalGastos += valor;
      });

      // Calculate utilidad operativa
      const utilidadOperativa = totalIngresos - totalGastos;

      // Create report structure
      const reporteData: ReportePyG = {
        ingresos: {
          total: totalIngresos,
          por_negocio: Object.entries(ingresosPorNegocio).map(([negocio, data]) => ({
            negocio,
            total: data.total,
            categorias: Object.entries(data.categorias).map(([categoria, total]) => ({
              categoria,
              total
            }))
          }))
        },
        gastos: {
          total: totalGastos,
          por_categoria: Object.entries(gastosPorCategoria).map(([categoria, total]) => ({
            categoria,
            total
          }))
        },
        utilidad_operativa: utilidadOperativa
      };

      // Add comparative data if not current period
      if (filtros.periodo !== 'mes_actual' && filtros.periodo !== 'rango_personalizado') {
        // Calculate previous period dates
        let prevFechaDesde: string;
        let prevFechaHasta: string;

        const hoy = new Date();
        const anioActual = hoy.getFullYear();
        const mesActual = hoy.getMonth();

        switch (filtros.periodo) {
          case 'trimestre': {
            // Trimestre anterior
            const primerMesTrimestreAnterior = Math.floor(mesActual / 3) * 3 - 3;
            const primerDia = new Date(anioActual, primerMesTrimestreAnterior, 1);
            const ultimoDia = new Date(anioActual, primerMesTrimestreAnterior + 3, 0);

            prevFechaDesde = `${primerDia.getFullYear()}-${String(primerDia.getMonth() + 1).padStart(2, '0')}-${String(primerDia.getDate()).padStart(2, '0')}`;
            prevFechaHasta = `${ultimoDia.getFullYear()}-${String(ultimoDia.getMonth() + 1).padStart(2, '0')}-${String(ultimoDia.getDate()).padStart(2, '0')}`;
            break;
          }
          case 'ytd': {
            // Mismo período del año anterior
            const primerDia = new Date(anioActual - 1, 0, 1);
            const ultimoDia = new Date(anioActual - 1, mesActual, hoy.getDate());

            prevFechaDesde = `${primerDia.getFullYear()}-01-01`;
            prevFechaHasta = `${ultimoDia.getFullYear()}-${String(ultimoDia.getMonth() + 1).padStart(2, '0')}-${String(ultimoDia.getDate()).padStart(2, '0')}`;
            break;
          }
          case 'ano_anterior': {
            // Dos años atrás
            prevFechaDesde = `${anioActual - 2}-01-01`;
            prevFechaHasta = `${anioActual - 2}-12-31`;
            break;
          }
          default:
            prevFechaDesde = fechaDesde;
            prevFechaHasta = fechaHasta;
        }

        // Load previous period data
        const [prevIngresosResult, prevGastosResult] = await Promise.all([
          supabase
            .from('fin_ingresos')
            .select('valor')
            .gte('fecha', prevFechaDesde)
            .lte('fecha', prevFechaHasta)
            .eq(filtros.negocio_id ? 'negocio_id' : '', filtros.negocio_id || '')
            .eq(filtros.region_id ? 'region_id' : '', filtros.region_id || ''),
          supabase
            .from('fin_gastos')
            .select('valor')
            .gte('fecha', prevFechaDesde)
            .lte('fecha', prevFechaHasta)
            .eq(filtros.negocio_id ? 'negocio_id' : '', filtros.negocio_id || '')
            .eq(filtros.region_id ? 'region_id' : '', filtros.region_id || '')
        ]);

        const prevIngresos = prevIngresosResult.data?.reduce((sum, i) => sum + (i.valor || 0), 0) || 0;
        const prevGastos = prevGastosResult.data?.reduce((sum, g) => sum + (g.valor || 0), 0) || 0;
        const prevUtilidad = prevIngresos - prevGastos;

        reporteData.comparativo = {
          periodo_anterior: {
            ingresos: prevIngresos,
            gastos: prevGastos,
            utilidad: prevUtilidad
          },
          variacion_porcentaje: {
            ingresos: prevIngresos > 0 ? ((totalIngresos - prevIngresos) / prevIngresos) * 100 : 0,
            gastos: prevGastos > 0 ? ((totalGastos - prevGastos) / prevGastos) * 100 : 0,
            utilidad: prevUtilidad !== 0 ? ((utilidadOperativa - prevUtilidad) / Math.abs(prevUtilidad)) * 100 : 0
          },
          variacion_valor: {
            ingresos: totalIngresos - prevIngresos,
            gastos: totalGastos - prevGastos,
            utilidad: utilidadOperativa - prevUtilidad
          }
        };
      }

      setReporte(reporteData);

      // Notify parent component that report was generated
      if (onReporteGenerated) {
        onReporteGenerated(reporteData);
      }
    } catch (error: any) {
      setError('Error al cargar el reporte P&L');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return `$${formatNumber(Math.abs(value))}`;
  };

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const getVariationIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (value < 0) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-600" />;
  };

  const getVariationColor = (value: number) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#73991C] animate-spin mr-2" />
          <span>Cargando reporte P&L...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-8">
        <div className="text-center text-red-600">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!reporte) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="text-center text-gray-500">
          <p>No hay datos para mostrar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* INGRESOS */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-green-50 px-6 py-4 border-b border-green-200">
          <h3 className="text-lg font-semibold text-green-900">INGRESOS</h3>
        </div>

        <div className="divide-y divide-gray-200">
          {reporte.ingresos.por_negocio.map((negocio) => (
            <div key={negocio.negocio} className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-medium text-gray-900">{negocio.negocio}</h4>
                <span className="text-lg font-bold text-green-600">
                  {formatCurrency(negocio.total)}
                </span>
              </div>

              <div className="space-y-2 ml-4">
                {negocio.categorias.map((categoria) => (
                  <div key={categoria.categoria} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{categoria.categoria}</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(categoria.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Total Ingresos */}
          <div className="bg-green-50 px-6 py-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-green-900">TOTAL INGRESOS</span>
              <span className="text-xl font-bold text-green-600">
                {formatCurrency(reporte.ingresos.total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* GASTOS */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-red-50 px-6 py-4 border-b border-red-200">
          <h3 className="text-lg font-semibold text-red-900">GASTOS</h3>
        </div>

        <div className="divide-y divide-gray-200">
          {reporte.gastos.por_categoria.map((categoria) => (
            <div key={categoria.categoria} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-900">{categoria.categoria}</span>
                <span className="text-lg font-medium text-red-600">
                  -{formatCurrency(categoria.total)}
                </span>
              </div>
            </div>
          ))}

          {/* Total Gastos */}
          <div className="bg-red-50 px-6 py-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-red-900">TOTAL GASTOS</span>
              <span className="text-xl font-bold text-red-600">
                -{formatCurrency(reporte.gastos.total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* UTILIDAD OPERATIVA */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-blue-50 px-6 py-4 border-b border-blue-200">
          <h3 className="text-lg font-semibold text-blue-900">UTILIDAD OPERATIVA</h3>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-blue-900">UTILIDAD OPERATIVA</span>
            <span className={`text-2xl font-bold ${
              reporte.utilidad_operativa >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {reporte.utilidad_operativa >= 0 ? '+' : ''}{formatCurrency(reporte.utilidad_operativa)}
            </span>
          </div>
        </div>
      </div>

      {/* COMPARATIVO */}
      {reporte.comparativo && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-purple-50 px-6 py-4 border-b border-purple-200">
            <h3 className="text-lg font-semibold text-purple-900">COMPARATIVO</h3>
            <p className="text-sm text-purple-700">Comparación con período anterior</p>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Ingresos */}
              <div className="text-center">
                <h4 className="text-sm font-medium text-gray-600 mb-2">INGRESOS</h4>
                <div className="flex items-center justify-center gap-2 mb-1">
                  {getVariationIcon(reporte.comparativo.variacion_porcentaje.ingresos)}
                  <span className={`text-lg font-bold ${getVariationColor(reporte.comparativo.variacion_porcentaje.ingresos)}`}>
                    {formatPercentage(reporte.comparativo.variacion_porcentaje.ingresos)}
                  </span>
                </div>
                <p className={`text-sm ${getVariationColor(reporte.comparativo.variacion_valor.ingresos)}`}>
                  {reporte.comparativo.variacion_valor.ingresos >= 0 ? '+' : ''}{formatCurrency(reporte.comparativo.variacion_valor.ingresos)}
                </p>
              </div>

              {/* Gastos */}
              <div className="text-center">
                <h4 className="text-sm font-medium text-gray-600 mb-2">GASTOS</h4>
                <div className="flex items-center justify-center gap-2 mb-1">
                  {getVariationIcon(-reporte.comparativo.variacion_porcentaje.gastos)}
                  <span className={`text-lg font-bold ${getVariationColor(-reporte.comparativo.variacion_porcentaje.gastos)}`}>
                    {formatPercentage(-reporte.comparativo.variacion_porcentaje.gastos)}
                  </span>
                </div>
                <p className={`text-sm ${getVariationColor(-reporte.comparativo.variacion_valor.gastos)}`}>
                  {reporte.comparativo.variacion_valor.gastos >= 0 ? '+' : ''}{formatCurrency(reporte.comparativo.variacion_valor.gastos)}
                </p>
              </div>

              {/* Utilidad */}
              <div className="text-center">
                <h4 className="text-sm font-medium text-gray-600 mb-2">UTILIDAD</h4>
                <div className="flex items-center justify-center gap-2 mb-1">
                  {getVariationIcon(reporte.comparativo.variacion_porcentaje.utilidad)}
                  <span className={`text-lg font-bold ${getVariationColor(reporte.comparativo.variacion_porcentaje.utilidad)}`}>
                    {formatPercentage(reporte.comparativo.variacion_porcentaje.utilidad)}
                  </span>
                </div>
                <p className={`text-sm ${getVariationColor(reporte.comparativo.variacion_valor.utilidad)}`}>
                  {reporte.comparativo.variacion_valor.utilidad >= 0 ? '+' : ''}{formatCurrency(reporte.comparativo.variacion_valor.utilidad)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}