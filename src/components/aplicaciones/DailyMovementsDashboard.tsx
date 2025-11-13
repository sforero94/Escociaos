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
  ChevronDown,
  ChevronUp,
  Download,
  Droplet
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { DailyMovementForm } from './DailyMovementForm';
import { Button } from '../ui/button';
import type {
  Aplicacion,
  MovimientoDiario,
  MovimientoDiarioProducto,
  ResumenMovimientoDiario,
  AlertaMovimiento,
  ProductoEnMezcla
} from '../../types/aplicaciones';

interface DailyMovementsDashboardProps {
  aplicacion: Aplicacion;
  onClose?: () => void;
}

// Tipo extendido con productos cargados
interface MovimientoConProductos extends MovimientoDiario {
  productos: MovimientoDiarioProducto[];
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

  // Auto-cerrar si la aplicación se cierra mientras estamos aquí
  useEffect(() => {
    if (aplicacion.estado === 'Cerrada' && onClose) {
      console.log('🔒 Aplicación cerrada detectada, cerrando dashboard de movimientos...');
      // Cerrar inmediatamente sin mostrar modal
      onClose();
    }
  }, [aplicacion.estado, onClose]);

  // Validar que la aplicación esté en ejecución SOLO si estamos en modo modal
  // Si NO hay onClose (página dedicada), permitir visualización en cualquier estado
  // IMPORTANTE: No mostrar este modal si la aplicación está "Cerrada" porque ya se cerró arriba
  if (aplicacion.estado !== 'En ejecución' && aplicacion.estado !== 'Cerrada' && onClose) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <h3 className="text-lg text-[#172E08]">Aplicación No Iniciada</h3>
              <p className="text-sm text-[#4D240F]/70">No se pueden registrar movimientos</p>
            </div>
          </div>

          <p className="text-sm text-[#4D240F]/70 mb-6">
            Esta aplicación está en estado <span className="font-medium text-[#172E08]">"{aplicacion.estado}"</span>. 
            {' '}Debes iniciar la ejecución antes de poder registrar movimientos diarios.
          </p>

          <div className="flex gap-3">
            {onClose && (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-lg hover:from-[#5f7d17] hover:to-[#9db86d] transition-all"
              >
                Entendido
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Datos
  const [movimientos, setMovimientos] = useState<MovimientoConProductos[]>([]);
  const [productosPlanificados, setProductosPlanificados] = useState<ProductoEnMezcla[]>([]);
  const [resumen, setResumen] = useState<ResumenMovimientoDiario[]>([]);
  const [alertas, setAlertas] = useState<AlertaMovimiento[]>([]);
  const [canecasTotales, setCanecasTotales] = useState<{
    planeadas: number;
    utilizadas: number;
    porcentaje: number;
  }>({ planeadas: 0, utilizadas: 0, porcentaje: 0 });

  useEffect(() => {
    loadData();
  }, [aplicacion.id]);

  useEffect(() => {
    calcularResumen();
    calcularCanecasTotales();
  }, [movimientos, productosPlanificados]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadMovimientos(),
        loadProductosPlanificados(),
        loadCanecasPlaneadas()
      ]);
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMovimientos = async () => {
    try {
      // 1. Cargar movimientos diarios (padre)
      const { data: movimientosData, error: errorMovimientos } = await supabase
        .from('movimientos_diarios')
        .select('*')
        .eq('aplicacion_id', aplicacion.id)
        .order('fecha_movimiento', { ascending: false });

      if (errorMovimientos) throw errorMovimientos;

      if (!movimientosData || movimientosData.length === 0) {
        setMovimientos([]);
        return;
      }

      // 2. Cargar productos de cada movimiento
      const movimientoIds = movimientosData.map(m => m.id);
      const { data: productosData, error: errorProductos } = await supabase
        .from('movimientos_diarios_productos')
        .select('*')
        .in('movimiento_diario_id', movimientoIds);

      if (errorProductos) throw errorProductos;

      // 3. Para fertilización, cargar presentacion_kg_l de cada producto
      let presentacionMap = new Map<string, number>();
      if (aplicacion.tipo_aplicacion === 'Fertilización') {
        const productosIds = Array.from(new Set((productosData || []).map(p => p.producto_id)));
        if (productosIds.length > 0) {
          const { data: presentacionesData, error: errorPresentaciones } = await supabase
            .from('productos')
            .select('id, presentacion_kg_l')
            .in('id', productosIds);
          
          if (!errorPresentaciones && presentacionesData) {
            presentacionesData.forEach(p => {
              if (p.presentacion_kg_l) {
                presentacionMap.set(p.id, p.presentacion_kg_l);
              }
            });
          }
        }
      }

      // 4. Agrupar productos por movimiento y convertir Kg a bultos si aplica
      const movimientosConProductos: MovimientoConProductos[] = movimientosData.map(mov => {
        const productosMovimiento = (productosData || [])
          .filter(p => p.movimiento_diario_id === mov.id)
          .map(p => {
            // Para fertilización, convertir Kg a bultos para mostrar en UI
            if (aplicacion.tipo_aplicacion === 'Fertilización' && presentacionMap.has(p.producto_id)) {
              const presentacion = presentacionMap.get(p.producto_id)!;
            }
            return p;
          });

        return {
          ...mov,
          productos: productosMovimiento
        };
      });

      setMovimientos(movimientosConProductos);
    } catch (err: any) {
      console.error('Error cargando movimientos:', err);
    }
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

  const loadCanecasPlaneadas = async () => {
    try {
      const { data: calculosData, error } = await supabase
        .from('aplicaciones_calculos')
        .select('numero_canecas')
        .eq('aplicacion_id', aplicacion.id);

      if (error) throw error;

      const totalPlaneadas = (calculosData || []).reduce((sum, calc) => sum + (calc.numero_canecas || 0), 0);
      
      return totalPlaneadas;
    } catch (err: any) {
      console.error('Error cargando canecas planeadas:', err);
      return 0;
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

    // Sumar productos de todos los movimientos
    movimientos.forEach(mov => {
      mov.productos.forEach(producto => {
        const resumenItem = resumenMap.get(producto.producto_id);
        
        // Convertir a unidad base (L o Kg) para comparar con planificado
        let cantidadEnUnidadBase = producto.cantidad_utilizada;
        
        if (producto.unidad === 'bultos' && (producto as any).presentacion_kg_l) {
          // Para bultos: convertir de nuevo a Kg usando presentacion_kg_l
          cantidadEnUnidadBase = producto.cantidad_utilizada * (producto as any).presentacion_kg_l;
          console.log(`🔄 Resumen - Convertir ${producto.cantidad_utilizada} bultos × ${(producto as any).presentacion_kg_l} = ${cantidadEnUnidadBase} Kg`);
        } else if (producto.unidad === 'cc') {
          cantidadEnUnidadBase = producto.cantidad_utilizada / 1000; // cc a L
        } else if (producto.unidad === 'g') {
          cantidadEnUnidadBase = producto.cantidad_utilizada / 1000; // g a Kg
        }

        if (resumenItem) {
          resumenItem.total_utilizado += cantidadEnUnidadBase;
          resumenItem.diferencia = resumenItem.total_utilizado - resumenItem.cantidad_planeada;
          resumenItem.porcentaje_usado = resumenItem.cantidad_planeada > 0 
            ? (resumenItem.total_utilizado / resumenItem.cantidad_planeada) * 100 
            : 0;
          resumenItem.excede_planeado = resumenItem.total_utilizado > resumenItem.cantidad_planeada;
        } else {
          // Producto no planificado pero usado
          resumenMap.set(producto.producto_id, {
            producto_id: producto.producto_id,
            producto_nombre: producto.producto_nombre,
            producto_unidad: producto.unidad === 'cc' || producto.unidad === 'L' ? 'Litros' : 'Kilos',
            total_utilizado: cantidadEnUnidadBase,
            cantidad_planeada: 0,
            diferencia: cantidadEnUnidadBase,
            porcentaje_usado: Infinity,
            excede_planeado: true
          });
        }
      });
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
      } else if (item.porcentaje_usado > 100) {
        nuevasAlertas.push({
          tipo: 'error',
          producto_nombre: item.producto_nombre,
          mensaje: `Se ha excedido la cantidad planificada en ${Math.abs(item.diferencia).toFixed(2)} ${item.producto_unidad}`,
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
  };

  const calcularCanecasTotales = async () => {
    try {
      // Obtener canecas planeadas
      const totalPlaneadas = await loadCanecasPlaneadas();
      
      // Sumar canecas utilizadas de todos los movimientos
      const totalUtilizadas = movimientos.reduce((sum, mov) => sum + (mov.numero_canecas || 0), 0);
      
      const porcentaje = totalPlaneadas > 0 ? (totalUtilizadas / totalPlaneadas) * 100 : 0;

      setCanecasTotales({
        planeadas: totalPlaneadas,
        utilizadas: totalUtilizadas,
        porcentaje
      });
    } catch (err) {
      console.error('Error calculando canecas totales:', err);
    }
  };

  const handleEliminarMovimiento = async (movimientoId: string) => {
    if (!confirm('¿Estás seguro de eliminar este movimiento y todos sus productos?')) return;

    try {
      // Al eliminar el movimiento, los productos se eliminarán en cascada
      const { error } = await supabase
        .from('movimientos_diarios')
        .delete()
        .eq('id', movimientoId);

      if (error) throw error;

      await loadMovimientos();
    } catch (err: any) {
      console.error('Error eliminando movimiento:', err);
      alert('Error al eliminar el movimiento');
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const exportarACSV = () => {
    // Generar CSV con la información completa
    let csv = 'Fecha,Lote,Canecas,Producto,Cantidad,Unidad,Responsable,Notas\n';
    
    movimientos.forEach(mov => {
      mov.productos.forEach(producto => {
        csv += `${mov.fecha_movimiento},${mov.lote_nombre},${mov.numero_canecas},${producto.producto_nombre},${producto.cantidad_utilizada},${producto.unidad},${mov.responsable},"${mov.notas || ''}"\n`;
      });
    });

    // Descargar archivo
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `movimientos_diarios_${aplicacion.nombre}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

      {/* Resumen de Canecas/Bultos Totales */}
      {aplicacion.tipo === 'fumigacion' && canecasTotales && (
        <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-2xl border border-[#73991C]/20 p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[#73991C]/20 rounded-xl flex items-center justify-center">
              <Droplet className="w-7 h-7 text-[#73991C]" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm text-[#4D240F]/70 mb-1">Progreso de Canecas</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl text-[#172E08]">{canecasTotales.utilizadas.toFixed(1)}</span>
                <span className="text-sm text-[#4D240F]/60">/ {canecasTotales.planeadas.toFixed(1)} canecas</span>
                <span className={`ml-2 text-sm px-2 py-1 rounded-lg ${
                  canecasTotales.porcentaje > 100 
                    ? 'bg-red-100 text-red-700' 
                    : canecasTotales.porcentaje >= 90 
                    ? 'bg-amber-100 text-amber-700' 
                    : 'bg-[#73991C]/10 text-[#73991C]'
                }`}>
                  {canecasTotales.porcentaje.toFixed(0)}%
                </span>
              </div>
              <div className="mt-3 w-full bg-white/50 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    canecasTotales.porcentaje > 100
                      ? 'bg-red-500'
                      : canecasTotales.porcentaje >= 90
                      ? 'bg-amber-500'
                      : 'bg-[#73991C]'
                  }`}
                  style={{ width: `${Math.min(canecasTotales.porcentaje, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

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
                  Registra el primer movimiento diario
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {movimientos.map(mov => (
                  <div
                    key={mov.id}
                    className="bg-[#F8FAF5] border border-[#73991C]/20 rounded-xl p-4 hover:border-[#73991C]/40 transition-colors"
                  >
                    {/* Header del movimiento */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex items-center gap-2 text-sm text-[#172E08]">
                            <Calendar className="w-4 h-4 text-[#73991C]" />
                            {new Date(mov.fecha_movimiento).toLocaleDateString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </div>
                          
                          {/* Mostrar canecas o bultos según el tipo de aplicación */}
                          {mov.numero_canecas !== undefined && mov.numero_canecas !== null && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-[#73991C]/10 rounded-lg">
                              <Droplet className="w-4 h-4 text-[#73991C]" />
                              <span className="text-sm text-[#172E08]">
                                {mov.numero_canecas} caneca{mov.numero_canecas !== 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                          
                          {mov.numero_bultos !== undefined && mov.numero_bultos !== null && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-[#73991C]/10 rounded-lg">
                              <Package className="w-4 h-4 text-[#73991C]" />
                              <span className="text-sm text-[#172E08]">
                                {mov.numero_bultos} bulto{mov.numero_bultos !== 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-[#4D240F]/70">{mov.lote_nombre}</p>
                      </div>
                      <button
                        onClick={() => handleEliminarMovimiento(mov.id!)}
                        className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors"
                        title="Eliminar movimiento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Productos del movimiento */}
                    <div className="space-y-2 mb-3">
                      {mov.productos.map((producto, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-white rounded-lg p-3 border border-[#73991C]/10"
                        >
                          <div className="flex items-center gap-3">
                            <Package className="w-4 h-4 text-[#73991C]" />
                            <div>
                              <p className="text-sm text-[#172E08]">{producto.producto_nombre}</p>
                              <p className="text-xs text-[#4D240F]/60">{producto.producto_categoria}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-[#172E08]">
                              {producto.cantidad_utilizada} {producto.unidad}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Footer del movimiento */}
                    <div className="flex items-center justify-between pt-3 border-t border-[#73991C]/10">
                      <div className="flex items-center gap-2 text-xs text-[#4D240F]/70">
                        <User className="w-3 h-3" />
                        {mov.responsable}
                      </div>
                      {mov.notas && (
                        <p className="text-xs text-[#4D240F]/60 italic max-w-xs truncate">
                          "{mov.notas}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Botón para exportar */}
      {movimientos.length > 0 && (
        <div className="text-right">
          <Button
            onClick={exportarACSV}
            className="bg-[#73991C] hover:bg-[#5f7d17] text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar a CSV
          </Button>
        </div>
      )}
    </div>
  );
}