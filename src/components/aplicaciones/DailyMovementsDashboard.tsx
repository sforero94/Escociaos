import { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  TrendingUp, 
  Package, 
  Calendar, 
  User, 
  Trash2,
  Plus,
  X,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Download
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { DailyMovementForm } from './DailyMovementForm';
import { Button } from '../ui/button';
import { exportarMovimientosACSV, descargarCSV } from '../../utils/dailyMovementUtils';
import type {
  Aplicacion,
  MovimientoDiario,
  ResumenMovimientoDiario,
  AlertaMovimiento,
  ProductoEnMezcla
} from '../../types/aplicaciones';

interface DailyMovementsDashboardProps {
  aplicacion: Aplicacion;
  onClose?: () => void;
}

export function DailyMovementsDashboard({ aplicacion, onClose }: DailyMovementsDashboardProps) {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    alertas: true,
    resumen: true,
    movimientos: true
  });

  // Datos
  const [movimientos, setMovimientos] = useState<MovimientoDiario[]>([]);
  const [productosPlanificados, setProductosPlanificados] = useState<ProductoEnMezcla[]>([]);
  const [resumen, setResumen] = useState<ResumenMovimientoDiario[]>([]);
  const [alertas, setAlertas] = useState<AlertaMovimiento[]>([]);
  const [canecasTotales, setCanecasTotales] = useState<{
    planeadas: number;
    utilizadas: number;
    porcentaje: number;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, [aplicacion.id]);

  useEffect(() => {
    calcularResumen();
  }, [movimientos, productosPlanificados]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadMovimientos(),
        loadProductosPlanificados()
      ]);
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMovimientos = async () => {
    const { data, error } = await supabase
      .from('movimientos_diarios')
      .select('*')
      .eq('aplicacion_id', aplicacion.id)
      .order('fecha_movimiento', { ascending: false });

    if (error) {
      console.error('Error cargando movimientos:', error);
      return;
    }

    setMovimientos(data || []);
  };

  const loadProductosPlanificados = async () => {
    try {
      // Cargar productos de las mezclas
      const { data: mezclasData, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacion.id);

      if (errorMezclas) throw errorMezclas;

      if (mezclasData && mezclasData.length > 0) {
        const mezclaIds = mezclasData.map(m => m.id);

        const { data: productosData, error: errorProductos } = await supabase
          .from('aplicaciones_productos')
          .select('*')
          .in('mezcla_id', mezclaIds);

        if (errorProductos) throw errorProductos;

        // Consolidar productos duplicados sumando cantidades
        const productosMap = new Map<string, ProductoEnMezcla>();
        (productosData || []).forEach(p => {
          const existing = productosMap.get(p.producto_id);
          if (existing) {
            existing.cantidad_total_necesaria += p.cantidad_total_necesaria;
          } else {
            productosMap.set(p.producto_id, {
              producto_id: p.producto_id,
              producto_nombre: p.producto_nombre,
              producto_categoria: p.producto_categoria,
              producto_unidad: p.producto_unidad,
              cantidad_total_necesaria: p.cantidad_total_necesaria,
            });
          }
        });

        setProductosPlanificados(Array.from(productosMap.values()));
      }
    } catch (err: any) {
      console.error('Error cargando productos planificados:', err);
    }
  };

  const calcularResumen = () => {
    const resumenMap = new Map<string, ResumenMovimientoDiario>();
    const nuevasAlertas: AlertaMovimiento[] = [];

    // Inicializar con productos planificados
    productosPlanificados.forEach(pp => {
      resumenMap.set(pp.producto_id, {
        producto_id: pp.producto_id,
        producto_nombre: pp.producto_nombre,
        producto_unidad: pp.producto_unidad,
        total_utilizado: 0,
        cantidad_planeada: pp.cantidad_total_necesaria,
        diferencia: -pp.cantidad_total_necesaria,
        porcentaje_usado: 0,
        excede_planeado: false
      });
    });

    // Sumar movimientos reales
    movimientos.forEach(mov => {
      const resumenItem = resumenMap.get(mov.producto_id);
      if (resumenItem) {
        resumenItem.total_utilizado += mov.cantidad_utilizada;
        resumenItem.diferencia = resumenItem.total_utilizado - resumenItem.cantidad_planeada;
        resumenItem.porcentaje_usado = resumenItem.cantidad_planeada > 0 
          ? (resumenItem.total_utilizado / resumenItem.cantidad_planeada) * 100 
          : 0;
        resumenItem.excede_planeado = resumenItem.total_utilizado > resumenItem.cantidad_planeada;
      } else {
        // Producto no planificado pero usado
        resumenMap.set(mov.producto_id, {
          producto_id: mov.producto_id,
          producto_nombre: mov.producto_nombre,
          producto_unidad: mov.producto_unidad,
          total_utilizado: mov.cantidad_utilizada,
          cantidad_planeada: 0,
          diferencia: mov.cantidad_utilizada,
          porcentaje_usado: Infinity,
          excede_planeado: true
        });
      }
    });

    // Generar alertas
    resumenMap.forEach(item => {
      if (item.cantidad_planeada === 0 && item.total_utilizado > 0) {
        nuevasAlertas.push({
          tipo: 'warning',
          producto_nombre: item.producto_nombre,
          mensaje: 'Producto utilizado sin planificación previa',
          porcentaje_usado: Infinity
        });
      } else if (item.porcentaje_usado >= 100) {
        nuevasAlertas.push({
          tipo: 'error',
          producto_nombre: item.producto_nombre,
          mensaje: `Se ha excedido la cantidad planificada en ${item.diferencia.toFixed(2)} ${item.producto_unidad}`,
          porcentaje_usado: item.porcentaje_usado
        });
      } else if (item.porcentaje_usado >= 90) {
        nuevasAlertas.push({
          tipo: 'warning',
          producto_nombre: item.producto_nombre,
          mensaje: `Cerca del límite planificado (${item.porcentaje_usado.toFixed(1)}%)`,
          porcentaje_usado: item.porcentaje_usado
        });
      }
    });

    setResumen(Array.from(resumenMap.values()));
    setAlertas(nuevasAlertas);

    // Calcular canecas totales
    const totalPlaneadas = productosPlanificados.reduce((acc, pp) => acc + pp.cantidad_total_necesaria, 0);
    const totalUtilizadas = movimientos.reduce((acc, mov) => acc + mov.cantidad_utilizada, 0);
    const porcentajeCanecas = totalPlaneadas > 0 ? (totalUtilizadas / totalPlaneadas) * 100 : 0;

    setCanecasTotales({
      planeadas: totalPlaneadas,
      utilizadas: totalUtilizadas,
      porcentaje: porcentajeCanecas
    });
  };

  const handleEliminarMovimiento = async (movimientoId: string) => {
    if (!confirm('¿Estás seguro de eliminar este movimiento?')) return;

    const { error } = await supabase
      .from('movimientos_diarios')
      .delete()
      .eq('id', movimientoId);

    if (error) {
      console.error('Error eliminando movimiento:', error);
      alert('Error al eliminar el movimiento');
      return;
    }

    await loadMovimientos();
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#73991C]/20 border-t-[#73991C] rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-[#4D240F]/60 mt-4">Cargando movimientos...</p>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <DailyMovementForm
        aplicacion={aplicacion}
        onSuccess={() => {
          setShowForm(false);
          loadMovimientos();
        }}
        onCancel={() => setShowForm(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl text-[#172E08]">Movimientos Diarios</h2>
          <p className="text-sm text-[#4D240F]/60 mt-1">
            {aplicacion.nombre} • {movimientos.length} {movimientos.length === 1 ? 'registro' : 'registros'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setShowForm(true)}
            className="bg-[#73991C] hover:bg-[#5f7d17] text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Movimiento
          </Button>
          {onClose && (
            <Button
              onClick={onClose}
              variant="outline"
              className="border-[#73991C]/20"
            >
              <X className="w-4 h-4 mr-2" />
              Cerrar
            </Button>
          )}
        </div>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#73991C]/10 shadow-[0_4px_24px_rgba(115,153,28,0.08)] overflow-hidden">
          <button
            onClick={() => toggleSection('alertas')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#73991C]/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="text-lg text-[#172E08]">
                Alertas ({alertas.length})
              </h3>
            </div>
            {expandedSections.alertas ? (
              <ChevronUp className="w-5 h-5 text-[#4D240F]/40" />
            ) : (
              <ChevronDown className="w-5 h-5 text-[#4D240F]/40" />
            )}
          </button>

          {expandedSections.alertas && (
            <div className="px-6 pb-4 space-y-2">
              {alertas.map((alerta, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl flex items-start gap-3 border ${
                    alerta.tipo === 'error'
                      ? 'bg-red-50 border-red-200'
                      : alerta.tipo === 'warning'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <AlertTriangle
                    className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      alerta.tipo === 'error'
                        ? 'text-red-600'
                        : alerta.tipo === 'warning'
                        ? 'text-amber-600'
                        : 'text-blue-600'
                    }`}
                  />
                  <div className="flex-1">
                    <p className="text-sm text-[#172E08]">{alerta.producto_nombre}</p>
                    <p className="text-xs text-[#4D240F]/70 mt-1">
                      {alerta.mensaje}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resumen de Productos */}
      <div className="bg-white rounded-2xl border border-[#73991C]/10 shadow-[0_4px_24px_rgba(115,153,28,0.08)] overflow-hidden">
        <button
          onClick={() => toggleSection('resumen')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#73991C]/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-[#73991C]" />
            <h3 className="text-lg text-[#172E08]">Resumen de Productos</h3>
          </div>
          {expandedSections.resumen ? (
            <ChevronUp className="w-5 h-5 text-[#4D240F]/40" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#4D240F]/40" />
          )}
        </button>

        {expandedSections.resumen && (
          <div className="px-6 pb-4">
            {resumen.length === 0 ? (
              <p className="text-sm text-[#4D240F]/60 text-center py-8">
                No hay productos planificados
              </p>
            ) : (
              <div className="space-y-4">
                {resumen.map(item => (
                  <div key={item.producto_id} className="border-b border-[#73991C]/10 pb-4 last:border-0">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-sm text-[#172E08]">{item.producto_nombre}</p>
                        <p className="text-xs text-[#4D240F]/60 mt-1">
                          {item.total_utilizado.toFixed(2)} / {item.cantidad_planeada.toFixed(2)} {item.producto_unidad}
                        </p>
                      </div>
                      <div className="text-right">
                        {item.excede_planeado ? (
                          <span className="inline-block px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs">
                            +{Math.abs(item.diferencia).toFixed(2)}
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-1 bg-[#73991C]/10 text-[#73991C] rounded-lg text-xs">
                            {item.porcentaje_usado.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Barra de progreso */}
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          item.excede_planeado
                            ? 'bg-red-500'
                            : item.porcentaje_usado >= 90
                            ? 'bg-amber-500'
                            : 'bg-[#73991C]'
                        }`}
                        style={{ width: `${Math.min(item.porcentaje_usado, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista de Movimientos */}
      <div className="bg-white rounded-2xl border border-[#73991C]/10 shadow-[0_4px_24px_rgba(115,153,28,0.08)] overflow-hidden">
        <button
          onClick={() => toggleSection('movimientos')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#73991C]/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-[#73991C]" />
            <h3 className="text-lg text-[#172E08]">
              Movimientos Registrados ({movimientos.length})
            </h3>
          </div>
          {expandedSections.movimientos ? (
            <ChevronUp className="w-5 h-5 text-[#4D240F]/40" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#4D240F]/40" />
          )}
        </button>

        {expandedSections.movimientos && (
          <div className="px-6 pb-4">
            {movimientos.length === 0 ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-[#73991C]/20 mx-auto mb-3" />
                <p className="text-sm text-[#4D240F]/60">
                  No hay movimientos registrados
                </p>
                <p className="text-xs text-[#4D240F]/40 mt-1">
                  Registra el primer uso de productos
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {movimientos.map(mov => (
                  <div
                    key={mov.id}
                    className="bg-[#73991C]/5 rounded-xl p-4 hover:bg-[#73991C]/10 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="text-sm text-[#172E08]">{mov.producto_nombre}</p>
                        <p className="text-xs text-[#4D240F]/60 mt-1">{mov.lote_nombre}</p>
                      </div>
                      <button
                        onClick={() => handleEliminarMovimiento(mov.id!)}
                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                        title="Eliminar movimiento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex items-center gap-2 text-[#4D240F]/70">
                        <Calendar className="w-3 h-3" />
                        {new Date(mov.fecha_movimiento).toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="flex items-center gap-2 text-[#4D240F]/70">
                        <Package className="w-3 h-3" />
                        {mov.cantidad_utilizada} {mov.producto_unidad}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#4D240F]/70 mt-2">
                      <User className="w-3 h-3" />
                      {mov.responsable}
                    </div>

                    {mov.notas && (
                      <div className="mt-3 pt-3 border-t border-[#73991C]/10">
                        <p className="text-xs text-[#4D240F]/60 italic">
                          "{mov.notas}"
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Botón para exportar movimientos */}
      <div className="text-right">
        <Button
          onClick={() => {
            const csvData = exportarMovimientosACSV(movimientos);
            descargarCSV(csvData, `movimientos_diarios_${aplicacion.nombre}.csv`);
          }}
          className="bg-[#73991C] hover:bg-[#5f7d17] text-white"
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar Movimientos
        </Button>
      </div>
    </div>
  );
}