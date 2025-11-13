import { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  RefreshCw,
  Database,
  TrendingDown,
  TrendingUp,
  Package,
  Activity
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'pending';
  message: string;
  details?: string;
}

interface InventoryStats {
  totalMovimientos: number;
  entradasHoy: number;
  salidasHoy: number;
  productosSinPrecio: number;
  aplicacionesSinInventario: number;
}

export function SistemaMonitoreo() {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    ejecutarPruebas();
  }, []);

  const ejecutarPruebas = async () => {
    setLoading(true);
    const results: TestResult[] = [];

    try {
      // ========================================
      // TEST 1: Verificar movimientos de inventario en aplicaciones cerradas
      // ========================================
      const { data: aplicacionesCerradas, error: errorAplicaciones } = await supabase
        .from('aplicaciones')
        .select(`
          id,
          nombre_aplicacion,
          fecha_cierre,
          estado
        `)
        .eq('estado', 'Cerrada')
        .gte('fecha_cierre', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (errorAplicaciones) throw errorAplicaciones;

      let aplicacionesSinMovimientos = 0;

      if (aplicacionesCerradas && aplicacionesCerradas.length > 0) {
        for (const app of aplicacionesCerradas) {
          const { data: movimientos } = await supabase
            .from('movimientos_inventario')
            .select('id', { count: 'exact', head: true })
            .eq('aplicacion_id', app.id)
            .eq('tipo_movimiento', 'Salida por Aplicación');

          if (!movimientos || movimientos.length === 0) {
            aplicacionesSinMovimientos++;
          }
        }

        results.push({
          name: 'Error Crítico #8: Movimientos de Inventario al Cerrar',
          status: aplicacionesSinMovimientos === 0 ? 'pass' : 'fail',
          message: aplicacionesSinMovimientos === 0
            ? `✅ Todas las ${aplicacionesCerradas.length} aplicaciones cerradas tienen movimientos de inventario`
            : `❌ ${aplicacionesSinMovimientos} de ${aplicacionesCerradas.length} aplicaciones cerradas NO tienen movimientos de inventario`,
          details: aplicacionesSinMovimientos === 0 
            ? 'El sistema está creando correctamente los movimientos de salida al cerrar aplicaciones.'
            : 'URGENTE: Algunas aplicaciones se cerraron sin actualizar el inventario. Revisar manualmente.'
        });
      } else {
        results.push({
          name: 'Error Crítico #8: Movimientos de Inventario al Cerrar',
          status: 'pending',
          message: 'No hay aplicaciones cerradas en los últimos 7 días para evaluar',
          details: 'Ejecuta el Test Case 1 de la guía de pruebas para validar.'
        });
      }

      // ========================================
      // TEST 2: Verificar productos sin precio
      // ========================================
      const { data: productosSinPrecio, error: errorPrecios } = await supabase
        .from('productos')
        .select('id, nombre')
        .eq('activo', true)
        .or('precio_unitario.is.null,precio_unitario.eq.0');

      if (errorPrecios) throw errorPrecios;

      results.push({
        name: 'Error #3: Productos sin Precio',
        status: productosSinPrecio && productosSinPrecio.length > 0 ? 'warning' : 'pass',
        message: productosSinPrecio && productosSinPrecio.length > 0
          ? `⚠️ ${productosSinPrecio.length} productos sin precio configurado`
          : '✅ Todos los productos tienen precio configurado',
        details: productosSinPrecio && productosSinPrecio.length > 0
          ? `Productos afectados: ${productosSinPrecio.map(p => p.nombre).join(', ')}`
          : 'El sistema bloqueará el cierre de aplicaciones si se usan productos sin precio.'
      });

      // ========================================
      // TEST 3: Verificar trazabilidad (última aplicación cerrada)
      // ========================================
      const { data: ultimaAplicacion } = await supabase
        .from('aplicaciones')
        .select('id, nombre_aplicacion')
        .eq('estado', 'Cerrada')
        .order('fecha_cierre', { ascending: false })
        .limit(1)
        .single();

      if (ultimaAplicacion) {
        // Obtener movimientos diarios consolidados
        const { data: movimientosDiarios } = await supabase
          .from('movimientos_diarios')
          .select(`
            id,
            movimientos_diarios_productos (
              producto_id,
              cantidad_utilizada,
              unidad
            )
          `)
          .eq('aplicacion_id', ultimaAplicacion.id);

        // Consolidar productos usados
        const productosUsados = new Map<string, number>();
        movimientosDiarios?.forEach(md => {
          md.movimientos_diarios_productos?.forEach((p: any) => {
            let cantidad = p.cantidad_utilizada;
            if (p.unidad === 'cc') cantidad = cantidad / 1000;
            if (p.unidad === 'g') cantidad = cantidad / 1000;

            const actual = productosUsados.get(p.producto_id) || 0;
            productosUsados.set(p.producto_id, actual + cantidad);
          });
        });

        // Obtener movimientos de inventario
        const { data: movimientosInventario } = await supabase
          .from('movimientos_inventario')
          .select('producto_id, cantidad')
          .eq('aplicacion_id', ultimaAplicacion.id)
          .eq('tipo_movimiento', 'Salida');

        // Comparar
        let trazabilidadOk = true;
        let diferencias: string[] = [];

        movimientosInventario?.forEach(mi => {
          const usado = productosUsados.get(mi.producto_id) || 0;
          const diferencia = Math.abs(usado - mi.cantidad);

          if (diferencia > 0.01) { // Tolerancia de 10ml
            trazabilidadOk = false;
            diferencias.push(`Producto ${mi.producto_id}: usado=${usado.toFixed(2)}, inventario=${mi.cantidad.toFixed(2)}`);
          }
        });

        results.push({
          name: 'Trazabilidad: Campo → Inventario',
          status: trazabilidadOk ? 'pass' : 'fail',
          message: trazabilidadOk
            ? `✅ Trazabilidad perfecta en "${ultimaAplicacion.nombre_aplicacion}"`
            : `❌ Discrepancias encontradas en "${ultimaAplicacion.nombre_aplicacion}"`,
          details: trazabilidadOk
            ? 'Los productos usados en campo coinciden exactamente con los descontados de inventario.'
            : `Diferencias: ${diferencias.join(', ')}`
        });
      } else {
        results.push({
          name: 'Trazabilidad: Campo → Inventario',
          status: 'pending',
          message: 'No hay aplicaciones cerradas para evaluar trazabilidad',
          details: 'Cierra al menos una aplicación para validar.'
        });
      }

      // ========================================
      // TEST 4: Verificar calibraciones en fumigaciones activas
      // ========================================
      const { data: fumigacionesActivas } = await supabase
        .from('aplicaciones')
        .select(`
          id,
          nombre_aplicacion,
          aplicaciones_lotes (
            calibracion_litros_arbol,
            tamano_caneca
          )
        `)
        .eq('tipo_aplicacion', 'Fumigación')
        .in('estado', ['Calculada', 'En ejecución']);

      let fumigacionesSinCalibracion = 0;
      fumigacionesActivas?.forEach(app => {
        const loteSinCalibracion = app.aplicaciones_lotes?.some(
          (l: any) => !l.calibracion_litros_arbol || !l.tamano_caneca
        );
        if (loteSinCalibracion) fumigacionesSinCalibracion++;
      });

      results.push({
        name: 'Error #1: Validación de Calibración',
        status: fumigacionesSinCalibracion === 0 ? 'pass' : 'warning',
        message: fumigacionesSinCalibracion === 0
          ? '✅ Todas las fumigaciones tienen calibración configurada'
          : `⚠️ ${fumigacionesSinCalibracion} fumigaciones sin calibración completa`,
        details: fumigacionesSinCalibracion === 0
          ? 'El sistema está validando correctamente la calibración antes de guardar.'
          : 'Estas aplicaciones se crearon antes de implementar la validación.'
      });

      // ========================================
      // ESTADÍSTICAS GENERALES
      // ========================================
      const hoy = new Date().toISOString().split('T')[0];

      const { count: totalMovimientos } = await supabase
        .from('movimientos_inventario')
        .select('*', { count: 'exact', head: true });

      const { count: entradasHoy } = await supabase
        .from('movimientos_inventario')
        .select('*', { count: 'exact', head: true })
        .eq('tipo_movimiento', 'Entrada')
        .gte('fecha_movimiento', hoy);

      const { count: salidasHoy } = await supabase
        .from('movimientos_inventario')
        .select('*', { count: 'exact', head: true })
        .eq('tipo_movimiento', 'Salida')
        .gte('fecha_movimiento', hoy);

      setStats({
        totalMovimientos: totalMovimientos || 0,
        entradasHoy: entradasHoy || 0,
        salidasHoy: salidasHoy || 0,
        productosSinPrecio: productosSinPrecio?.length || 0,
        aplicacionesSinInventario: aplicacionesSinMovimientos
      });

      setTestResults(results);
      setLastUpdate(new Date());

    } catch (error) {
      console.error('Error ejecutando pruebas:', error);
      results.push({
        name: 'Sistema de Pruebas',
        status: 'fail',
        message: '❌ Error ejecutando pruebas automáticas',
        details: error instanceof Error ? error.message : 'Error desconocido'
      });
      setTestResults(results);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'fail':
        return <XCircle className="w-6 h-6 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-yellow-600" />;
      default:
        return <Activity className="w-6 h-6 text-gray-400" />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'pass':
        return 'bg-green-50 border-green-200';
      case 'fail':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const passCount = testResults.filter(t => t.status === 'pass').length;
  const failCount = testResults.filter(t => t.status === 'fail').length;
  const warningCount = testResults.filter(t => t.status === 'warning').length;

  return (
    <div className="min-h-screen bg-[#F8FAF5] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl text-[#172E08] mb-2">
                🧪 Monitor del Sistema
              </h1>
              <p className="text-[#4D240F]/70">
                Validación automática de correcciones críticas
              </p>
            </div>
            <button
              onClick={ejecutarPruebas}
              disabled={loading}
              className="px-4 py-2 bg-[#73991C] text-white rounded-xl hover:bg-[#5f7d17] disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>

          {lastUpdate && (
            <p className="text-sm text-[#4D240F]/50">
              Última actualización: {lastUpdate.toLocaleString('es-CO')}
            </p>
          )}
        </div>

        {/* Estadísticas */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <Database className="w-8 h-8 text-[#73991C]" />
                <span className="text-2xl text-[#172E08]">{stats.totalMovimientos}</span>
              </div>
              <p className="text-sm text-[#4D240F]/70">Total Movimientos</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-8 h-8 text-green-600" />
                <span className="text-2xl text-[#172E08]">{stats.entradasHoy}</span>
              </div>
              <p className="text-sm text-[#4D240F]/70">Entradas Hoy</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingDown className="w-8 h-8 text-red-600" />
                <span className="text-2xl text-[#172E08]">{stats.salidasHoy}</span>
              </div>
              <p className="text-sm text-[#4D240F]/70">Salidas Hoy</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <Package className="w-8 h-8 text-yellow-600" />
                <span className="text-2xl text-[#172E08]">{stats.productosSinPrecio}</span>
              </div>
              <p className="text-sm text-[#4D240F]/70">Sin Precio</p>
            </div>
          </div>
        )}

        {/* Resumen de Pruebas */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
          <h2 className="text-xl text-[#172E08] mb-4">Resumen de Validación</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl text-green-900">{passCount}</p>
                <p className="text-sm text-green-700">Correctas</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-xl">
              <AlertTriangle className="w-8 h-8 text-yellow-600" />
              <div>
                <p className="text-2xl text-yellow-900">{warningCount}</p>
                <p className="text-sm text-yellow-700">Advertencias</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl">
              <XCircle className="w-8 h-8 text-red-600" />
              <div>
                <p className="text-2xl text-red-900">{failCount}</p>
                <p className="text-sm text-red-700">Fallos</p>
              </div>
            </div>
          </div>
        </div>

        {/* Resultados de Pruebas */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
              <RefreshCw className="w-12 h-12 text-[#73991C] animate-spin mx-auto mb-4" />
              <p className="text-[#4D240F]/70">Ejecutando pruebas...</p>
            </div>
          ) : (
            testResults.map((result, index) => (
              <div
                key={index}
                className={`rounded-2xl shadow-sm border p-6 ${getStatusBg(result.status)}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    {getStatusIcon(result.status)}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg text-[#172E08] mb-2">
                      {result.name}
                    </h3>
                    <p className="text-[#4D240F] mb-2">
                      {result.message}
                    </p>
                    {result.details && (
                      <p className="text-sm text-[#4D240F]/70 bg-white/50 rounded-lg p-3">
                        {result.details}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Acciones Rápidas */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mt-6">
          <h2 className="text-xl text-[#172E08] mb-4">Acciones Recomendadas</h2>
          
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl">
              <span className="text-2xl">📋</span>
              <div>
                <h4 className="text-[#172E08] mb-1">Guía de Pruebas Completa</h4>
                <p className="text-sm text-[#4D240F]/70 mb-2">
                  Ejecuta el flujo completo de validación paso a paso.
                </p>
                <p className="text-sm text-blue-700 font-medium">
                  Ver archivo: /GUIA_PRUEBAS.md
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-xl">
              <span className="text-2xl">💾</span>
              <div>
                <h4 className="text-[#172E08] mb-1">Queries de Verificación SQL</h4>
                <p className="text-sm text-[#4D240F]/70 mb-2">
                  Ejecuta queries para análisis profundo de datos.
                </p>
                <p className="text-sm text-purple-700 font-medium">
                  Ver archivo: /QUERIES_VERIFICACION.sql
                </p>
              </div>
            </div>

            {failCount > 0 && (
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl">
                <span className="text-2xl">🚨</span>
                <div>
                  <h4 className="text-[#172E08] mb-1">Acción Requerida</h4>
                  <p className="text-sm text-[#4D240F]/70">
                    Se detectaron {failCount} error(es) crítico(s) que requieren atención inmediata.
                    Revisa los detalles arriba y consulta la documentación.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}