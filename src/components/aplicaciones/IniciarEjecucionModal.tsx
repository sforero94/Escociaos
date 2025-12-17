import { useState } from 'react';
import { Play, X, Calendar, AlertCircle, Package } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { Aplicacion } from '../../types/aplicaciones';

interface IniciarEjecucionModalProps {
  aplicacion: Aplicacion;
  onClose: () => void;
  onSuccess: () => void;
}

interface ProductoFaltante {
  nombre: string;
  necesario: number;
  disponible: number;
  unidad: string;
}

export function IniciarEjecucionModal({
  aplicacion,
  onClose,
  onSuccess,
}: IniciarEjecucionModalProps) {
  const supabase = getSupabase();
  const [fechaInicio, setFechaInicio] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(false);
  const [validandoStock, setValidandoStock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productosFaltantes, setProductosFaltantes] = useState<ProductoFaltante[]>([]);
  const [stockValidado, setStockValidado] = useState(false);

  /**
   * VALIDAR STOCK SUFICIENTE
   */
  const validarStockSuficiente = async (): Promise<boolean> => {
    try {
      setValidandoStock(true);
      setError(null);
      setProductosFaltantes([]);


      // 1. Cargar productos necesarios de todas las mezclas
      const { data: mezclas, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacion.id);

      if (errorMezclas) {
        throw new Error('Error al cargar mezclas');
      }

      if (!mezclas || mezclas.length === 0) {
        setStockValidado(true);
        return true;
      }

      const mezclasIds = mezclas.map(m => m.id);

      const { data: productosNecesarios, error: errorProductos } = await supabase
        .from('aplicaciones_productos')
        .select('producto_id, producto_nombre, cantidad_total_necesaria, producto_unidad')
        .in('mezcla_id', mezclasIds);

      if (errorProductos) {
        throw new Error('Error al cargar productos necesarios');
      }

      if (!productosNecesarios || productosNecesarios.length === 0) {
        setStockValidado(true);
        return true;
      }

      // 2. Consolidar cantidades por producto (puede haber duplicados en diferentes mezclas)
      const necesidadesPorProducto = new Map<string, { nombre: string; cantidad: number; unidad: string }>();
      
      productosNecesarios.forEach(p => {
        const actual = necesidadesPorProducto.get(p.producto_id);
        if (actual) {
          actual.cantidad += p.cantidad_total_necesaria || 0;
        } else {
          necesidadesPorProducto.set(p.producto_id, {
            nombre: p.producto_nombre,
            cantidad: p.cantidad_total_necesaria || 0,
            unidad: p.producto_unidad || 'L/Kg'
          });
        }
      });

      // 3. Cargar stock actual de productos
      const productosIds = Array.from(necesidadesPorProducto.keys());
      
      const { data: productosStock, error: errorStock } = await supabase
        .from('productos')
        .select('id, nombre, cantidad_actual, unidad_medida')
        .in('id', productosIds);

      if (errorStock) {
        throw new Error('Error al cargar inventario actual');
      }

      const stockMap = new Map(productosStock?.map(p => [p.id, { disponible: p.cantidad_actual || 0, unidad: p.unidad_medida }]) || []);

      // 4. Verificar faltantes
      const faltantes: ProductoFaltante[] = [];

      necesidadesPorProducto.forEach((necesidad, productoId) => {
        const stock = stockMap.get(productoId);
        const disponible = stock?.disponible || 0;

        if (disponible < necesidad.cantidad) {
          faltantes.push({
            nombre: necesidad.nombre,
            necesario: necesidad.cantidad,
            disponible: disponible,
            unidad: stock?.unidad || necesidad.unidad
          });
        }
      });

      // 5. Resultado
      if (faltantes.length > 0) {
        setProductosFaltantes(faltantes);
        setStockValidado(false);
        return false;
      }

      setStockValidado(true);
      return true;

    } catch (err: any) {
      setError(err.message || 'Error al validar inventario');
      return false;
    } finally {
      setValidandoStock(false);
    }
  };

  const handleIniciar = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validar fecha
      if (!fechaInicio) {
        setError('Debes seleccionar una fecha de inicio');
        return;
      }

      const fechaInicioDate = new Date(fechaInicio);
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      if (fechaInicioDate > hoy) {
        setError('La fecha de inicio no puede ser futura');
        return;
      }

      // 🆕 VALIDAR STOCK si no se ha validado aún
      if (!stockValidado) {
        const stockSuficiente = await validarStockSuficiente();
        if (!stockSuficiente) {
          // Si hay faltantes, preguntar al usuario
          const confirmar = window.confirm(
            `⚠️ STOCK INSUFICIENTE\n\n` +
            `${productosFaltantes.length} producto(s) no tienen suficiente inventario:\n\n` +
            productosFaltantes.map(p => 
              `• ${p.nombre}: Necesita ${p.necesario.toFixed(2)} ${p.unidad}, Disponible ${p.disponible.toFixed(2)} ${p.unidad}`
            ).join('\n') +
            `\n\n¿Desea iniciar de todos modos?`
          );
          
          if (!confirmar) {
            setLoading(false);
            return;
          }
        }
      }

      // Actualizar aplicación a estado "En ejecución"
      const { error: updateError } = await supabase
        .from('aplicaciones')
        .update({
          estado: 'En ejecución',
          fecha_inicio_ejecucion: fechaInicio,
          updated_at: new Date().toISOString(),
        })
        .eq('id', aplicacion.id);

      if (updateError) throw updateError;

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error al iniciar la ejecución');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#73991C]/10 rounded-xl flex items-center justify-center">
              <Play className="w-5 h-5 text-[#73991C]" />
            </div>
            <div>
              <h2 className="text-lg text-[#172E08]">Iniciar Ejecución</h2>
              <p className="text-sm text-[#4D240F]/60">{aplicacion.nombre}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#4D240F]/40 hover:text-[#4D240F] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-blue-900 mb-1">
                  Al iniciar la ejecución podrás:
                </p>
                <ul className="text-xs text-blue-800 space-y-1 ml-4 list-disc">
                  <li>Registrar movimientos diarios de productos</li>
                  <li>Mantener trazabilidad</li>
                  <li>Comparar lo planificado vs lo ejecutado</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Fecha de inicio */}
          <div>
            <label className="block text-sm text-[#172E08] mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Fecha de inicio de ejecución
            </label>
            <Input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full"
            />
            <p className="text-xs text-[#4D240F]/60 mt-1">
              Fecha en que comenzó la aplicación en campo
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-4 h-4" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Resumen */}
          <div className="bg-[#F8FAF5] rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#4D240F]/70">Estado actual:</span>
              <span className="text-[#172E08] px-2 py-0.5 bg-yellow-100 rounded">
                {aplicacion.estado}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4D240F]/70">Nuevo estado:</span>
              <span className="text-[#172E08] px-2 py-0.5 bg-blue-100 rounded">
                En ejecución
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4D240F]/70">Tipo:</span>
              <span className="text-[#172E08] capitalize">{aplicacion.tipo}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 border-t border-gray-200">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 border-gray-300 hover:bg-gray-50"
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleIniciar}
            className="flex-1 bg-[#73991C] hover:bg-[#5f7d17] text-white"
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Iniciando...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Iniciar Ejecución
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}