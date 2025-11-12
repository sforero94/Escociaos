import { useState, useEffect } from 'react';
import { Calendar, Package, User, Trash2, AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { formatNumber } from '../../utils/format';
import { Button } from '../ui/button';
import type {
  MovimientoDiario,
  ResumenMovimientosDiarios,
  AlertaMovimientoDiario,
  Aplicacion,
  ProductoEnMezcla
} from '../../types/aplicaciones';

interface DailyMovementsListProps {
  aplicacion: Aplicacion;
  onRefresh?: () => void;
}

export function DailyMovementsList({ aplicacion, onRefresh }: DailyMovementsListProps) {
  const supabase = getSupabase();
  const [movimientos, setMovimientos] = useState<MovimientoDiario[]>([]);
  const [resumenProductos, setResumenProductos] = useState<ResumenMovimientosDiarios[]>([]);
  const [alertas, setAlertas] = useState<AlertaMovimientoDiario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);

  useEffect(() => {
    cargarMovimientos();
  }, [aplicacion.id]);

  const cargarMovimientos = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar movimientos diarios
      const { data: movimientosData, error: errorMovimientos } = await supabase
        .from('movimientos_diarios')
        .select('*')
        .eq('aplicacion_id', aplicacion.id)
        .order('fecha_movimiento', { ascending: false })
        .order('creado_en', { ascending: false });

      if (errorMovimientos) throw errorMovimientos;

      setMovimientos(movimientosData || []);

      // Calcular resumen y alertas
      if (movimientosData && movimientosData.length > 0) {
        await calcularResumenYAlertas(movimientosData);
      } else {
        setResumenProductos([]);
        setAlertas([]);
      }

      if (onRefresh) onRefresh();

    } catch (err: any) {
      console.error('Error cargando movimientos:', err);
      setError('Error al cargar los movimientos diarios');
    } finally {
      setLoading(false);
    }
  };

  const calcularResumenYAlertas = async (movimientos: MovimientoDiario[]) => {
    try {
      // Obtener productos planeados de la aplicación
      const { data: mezclasData, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacion.id);

      if (errorMezclas) throw errorMezclas;

      if (!mezclasData || mezclasData.length === 0) {
        setResumenProductos([]);
        setAlertas([]);
        return;
      }

      const mezclaIds = mezclasData.map(m => m.id);

      const { data: productosData, error: errorProductos } = await supabase
        .from('aplicaciones_productos')
        .select('*')
        .in('mezcla_id', mezclaIds);

      if (errorProductos) throw errorProductos;

      // Agrupar productos por producto_id y sumar cantidades planeadas
      const productosPlaneados = new Map<string, ProductoEnMezcla>();
      (productosData || []).forEach(p => {
        if (productosPlaneados.has(p.producto_id)) {
          const existing = productosPlaneados.get(p.producto_id)!;
          existing.cantidad_total_necesaria += p.cantidad_total_necesaria;
        } else {
          productosPlaneados.set(p.producto_id, {
            producto_id: p.producto_id,
            producto_nombre: p.producto_nombre,
            producto_categoria: p.producto_categoria,
            producto_unidad: p.producto_unidad,
            cantidad_total_necesaria: p.cantidad_total_necesaria,
          });
        }
      });

      // Agrupar movimientos por producto_id
      const movimientosPorProducto = new Map<string, number>();
      movimientos.forEach(m => {
        const total = movimientosPorProducto.get(m.producto_id) || 0;
        movimientosPorProducto.set(m.producto_id, total + m.cantidad_utilizada);
      });

      // Calcular resumen
      const resumen: ResumenMovimientosDiarios[] = [];
      const nuevasAlertas: AlertaMovimientoDiario[] = [];

      productosPlaneados.forEach((producto, productoId) => {
        const totalUtilizado = movimientosPorProducto.get(productoId) || 0;
        const diferencia = producto.cantidad_total_necesaria - totalUtilizado;
        const porcentajeUsado = producto.cantidad_total_necesaria > 0
          ? (totalUtilizado / producto.cantidad_total_necesaria) * 100
          : 0;
        const excedePlaneado = totalUtilizado > producto.cantidad_total_necesaria;

        resumen.push({
          producto_id: productoId,
          producto_nombre: producto.producto_nombre,
          total_utilizado: totalUtilizado,
          cantidad_planeada: producto.cantidad_total_necesaria,
          diferencia,
          porcentaje_usado: porcentajeUsado,
          excede_planeado: excedePlaneado,
        });

        // Generar alertas
        if (excedePlaneado) {
          nuevasAlertas.push({
            tipo: 'error',
            producto_nombre: producto.producto_nombre,
            mensaje: `Se ha excedido lo planeado en ${formatNumber(Math.abs(diferencia), 2)} ${producto.producto_unidad}`,
            porcentaje_usado: porcentajeUsado,
          });
        } else if (porcentajeUsado >= 90) {
          nuevasAlertas.push({
            tipo: 'warning',
            producto_nombre: producto.producto_nombre,
            mensaje: `Se ha utilizado el ${porcentajeUsado.toFixed(0)}% de lo planeado`,
            porcentaje_usado: porcentajeUsado,
          });
        }
      });

      setResumenProductos(resumen);
      setAlertas(nuevasAlertas);

    } catch (err: any) {
      console.error('Error calculando resumen:', err);
    }
  };

  const handleEliminar = async (movimientoId: string) => {
    if (!confirm('¿Estás seguro de eliminar este movimiento?')) return;

    try {
      setEliminando(movimientoId);

      const { error } = await supabase
        .from('movimientos_diarios')
        .delete()
        .eq('id', movimientoId);

      if (error) throw error;

      // Recargar lista
      await cargarMovimientos();

    } catch (err: any) {
      console.error('Error eliminando movimiento:', err);
      setError('Error al eliminar el movimiento');
    } finally {
      setEliminando(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="space-y-3">
          {alertas.map((alerta, index) => (
            <div
              key={index}
              className={`rounded-xl p-4 flex items-start gap-3 ${
                alerta.tipo === 'error'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-yellow-50 border border-yellow-200'
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                  alerta.tipo === 'error' ? 'text-red-600' : 'text-yellow-600'
                }`}
              />
              <div className="flex-1">
                <h4 className={`text-sm mb-1 ${
                  alerta.tipo === 'error' ? 'text-red-800' : 'text-yellow-800'
                }`}>
                  {alerta.producto_nombre}
                </h4>
                <p className={`text-sm ${
                  alerta.tipo === 'error' ? 'text-red-700' : 'text-yellow-700'
                }`}>
                  {alerta.mensaje}
                </p>
              </div>
              <div className={`text-xs px-2 py-1 rounded-lg ${
                alerta.tipo === 'error'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {alerta.porcentaje_usado.toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resumen por Producto */}
      {resumenProductos.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-[#73991C]" />
            <h3 className="text-lg text-[#172E08]">Resumen por Producto</h3>
          </div>
          <div className="space-y-4">
            {resumenProductos.map((resumen) => (
              <div key={resumen.producto_id} className="border-l-4 border-[#73991C] pl-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="text-[#172E08]">{resumen.producto_nombre}</h4>
                    <div className="flex items-center gap-4 mt-1 text-sm text-[#4D240F]/70">
                      <span>
                        Utilizado: <strong className="text-[#172E08]">{formatNumber(resumen.total_utilizado, 2)}</strong>
                      </span>
                      <span>
                        Planeado: <strong className="text-[#172E08]">{formatNumber(resumen.cantidad_planeada, 2)}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl ${
                      resumen.excede_planeado ? 'text-red-600' : 'text-[#73991C]'
                    }`}>
                      {resumen.porcentaje_usado.toFixed(0)}%
                    </div>
                    {resumen.excede_planeado && (
                      <span className="text-xs text-red-600">Excedido</span>
                    )}
                  </div>
                </div>
                {/* Barra de progreso */}
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      resumen.excede_planeado
                        ? 'bg-red-600'
                        : resumen.porcentaje_usado >= 90
                        ? 'bg-yellow-500'
                        : 'bg-[#73991C]'
                    }`}
                    style={{ width: `${Math.min(resumen.porcentaje_usado, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de Movimientos */}
      <div className="bg-white rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg text-[#172E08]">
            Movimientos Registrados ({movimientos.length})
          </h3>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {movimientos.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-[#4D240F]/40 mx-auto mb-4" />
            <h4 className="text-xl text-[#172E08] mb-2">
              No hay movimientos registrados
            </h4>
            <p className="text-[#4D240F]/60">
              Comienza registrando el primer movimiento diario de esta aplicación
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {movimientos.map((movimiento) => (
              <div
                key={movimiento.id}
                className="bg-[#F8FAF5] border border-[#73991C]/10 rounded-xl p-4 hover:border-[#73991C]/30 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Info principal */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Fecha */}
                    <div>
                      <p className="text-xs text-[#4D240F]/60 mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Fecha
                      </p>
                      <p className="text-sm text-[#172E08]">
                        {formatDate(movimiento.fecha_movimiento)}
                      </p>
                    </div>

                    {/* Producto */}
                    <div>
                      <p className="text-xs text-[#4D240F]/60 mb-1 flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        Producto
                      </p>
                      <p className="text-sm text-[#172E08]">
                        {movimiento.producto_nombre}
                      </p>
                    </div>

                    {/* Lote */}
                    <div>
                      <p className="text-xs text-[#4D240F]/60 mb-1">Lote</p>
                      <p className="text-sm text-[#172E08]">
                        {movimiento.lote_nombre}
                      </p>
                    </div>

                    {/* Cantidad */}
                    <div>
                      <p className="text-xs text-[#4D240F]/60 mb-1">Cantidad</p>
                      <p className="text-sm text-[#172E08]">
                        {formatNumber(movimiento.cantidad_utilizada, 2)} {movimiento.producto_unidad}
                      </p>
                    </div>
                  </div>

                  {/* Botón eliminar */}
                  <Button
                    onClick={() => handleEliminar(movimiento.id!)}
                    disabled={!!eliminando}
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  >
                    {eliminando === movimiento.id ? (
                      <div className="w-4 h-4 border-2 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {/* Responsable y notas */}
                <div className="mt-3 pt-3 border-t border-[#73991C]/10 flex flex-wrap gap-4 text-xs text-[#4D240F]/70">
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    <span>Responsable:</span>
                    <span className="text-[#172E08]">{movimiento.responsable}</span>
                  </div>
                  {movimiento.notas && (
                    <div className="flex items-center gap-1">
                      <span>•</span>
                      <span>Notas:</span>
                      <span className="text-[#172E08]">{movimiento.notas}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Estado provisional */}
      {movimientos.length > 0 && (
        <div className="bg-[#73991C]/5 border border-[#73991C]/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#73991C] flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm text-[#172E08] mb-1">
                Movimientos Provisionales
              </h4>
              <p className="text-xs text-[#4D240F]/70">
                Estos movimientos son <strong>provisionales</strong> y no han afectado el inventario.
                Al cerrar la aplicación, podrás revisar, ajustar y confirmar todos los movimientos registrados.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
