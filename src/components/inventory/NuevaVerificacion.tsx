import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Loader2, AlertTriangle, Package } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import { VerificacionesNav } from './VerificacionesNav';
import { formatearFecha } from '../../utils/fechas';

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  cantidad_actual: number | null;
  unidad_medida: string;
  precio_unitario: number | null;
  activo: boolean | null;
}

/**
 * Componente para iniciar una nueva verificación física de inventario
 * Carga todos los productos activos y crea el registro inicial
 */
export function NuevaVerificacion() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState('');
  const { profile } = useAuth();
  const navigate = useNavigate();
  const supabase = getSupabase();

  useEffect(() => {
    loadProductos();
  }, []);

  const loadProductos = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Consultar productos - sin filtro de activo para verificar todos
      const { data, error } = await supabase
        .from('productos')
        .select('id, nombre, categoria, cantidad_actual, unidad_medida, precio_unitario, activo')
        .order('nombre');

      if (error) throw error;

      // Filtrar solo productos activos, pero si activo es null, incluirlos también
      const productosActivos = (data || []).filter(p => p.activo !== false);
      
      console.log('Productos cargados:', data?.length, 'Activos:', productosActivos.length);
      setProductos(productosActivos);
    } catch (err: any) {
      console.error('Error cargando productos:', err);
      setError('Error al cargar productos: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCrearVerificacion = async () => {
    if (productos.length === 0) {
      setError('No hay productos activos para verificar');
      return;
    }

    try {
      setIsCreating(true);
      setError('');

      // 1. Crear el registro de verificación
      const { data: verificacion, error: errorVerificacion } = await supabase
        .from('verificaciones_inventario')
        .insert([
          {
            fecha_inicio: new Date().toISOString().split('T')[0],
            estado: 'En proceso',
            usuario_verificador: profile?.nombre || profile?.email || 'Usuario',
            observaciones_generales: observaciones || null,
          },
        ])
        .select()
        .single();

      if (errorVerificacion) throw errorVerificacion;

      // 2. Crear registros de detalle para cada producto
      const detalles = productos.map((producto) => ({
        verificacion_id: verificacion.id,
        producto_id: producto.id,
        cantidad_teorica: producto.cantidad_actual || 0,
        cantidad_fisica: null, // Se llenará durante el conteo
        contado: false,
      }));

      // Insertar sin select para evitar problemas de ORDER BY
      const { error: errorDetalles } = await supabase
        .from('verificaciones_detalle')
        .insert(detalles);

      if (errorDetalles) {
        console.error('Error insertando detalles:', errorDetalles);
        throw errorDetalles;
      }

      // 3. Navegar al módulo de conteo físico
      navigate(`/inventario/verificaciones/conteo/${verificacion.id}`);
    } catch (err: any) {
      console.error('Error creando verificación:', err);
      setError('Error al crear verificación: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const calcularValorTotal = () => {
    return productos.reduce(
      (sum, p) => sum + (p.cantidad_actual || 0) * (p.precio_unitario || 0),
      0
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <VerificacionesNav />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-[#73991C] animate-spin" />
        </div>
      </div>
    );
  }

  // Estado vacío - Sin productos
  if (productos.length === 0) {
    return (
      <div className="space-y-6">
        <VerificacionesNav />
        
        <div className="mb-6">
          <h1 className="text-[#172E08] mb-2 flex items-center gap-3">
            <ClipboardCheck className="w-8 h-8 text-[#73991C]" />
            Nueva Verificación Física
          </h1>
          <p className="text-[#4D240F]/70">
            Iniciar verificación mensual de inventario
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-red-800 mb-1">Error</h4>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-2xl mb-4">
            <Package className="w-10 h-10 text-[#73991C]/50" />
          </div>
          <h2 className="text-2xl text-[#172E08] mb-2">
            No hay productos para verificar
          </h2>
          <p className="text-[#4D240F]/70 mb-4">
            No se encontraron productos activos en el inventario
          </p>
          <button
            onClick={() => navigate('/inventario/nueva-compra')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-xl hover:from-[#5f7d17] hover:to-[#9db86d] transition-all"
          >
            <Package className="w-5 h-5" />
            Agregar Productos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navegación */}
      <VerificacionesNav />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[#172E08] mb-2 flex items-center gap-3">
          <ClipboardCheck className="w-8 h-8 text-[#73991C]" />
          Nueva Verificación Física
        </h1>
        <p className="text-[#4D240F]/70">
          Iniciar verificación mensual de inventario
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-red-800 mb-1">Error</h4>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Instrucciones */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-2xl p-6">
            <h3 className="text-lg text-[#172E08] mb-3 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-blue-600" />
              ¿Cómo funciona la verificación?
            </h3>
            <ol className="space-y-2 text-sm text-[#4D240F]/80">
              <li className="flex gap-2">
                <span className="flex-shrink-0 text-blue-600">1.</span>
                <span>El sistema cargará todos los productos activos con sus cantidades teóricas actuales</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 text-blue-600">2.</span>
                <span>Deberás contar físicamente cada producto en bodega</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 text-blue-600">3.</span>
                <span>El sistema calculará automáticamente las diferencias</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 text-blue-600">4.</span>
                <span>Al completar, Gerencia recibirá notificación para aprobar los ajustes</span>
              </li>
            </ol>
          </div>

          {/* Observaciones Iniciales */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
            <label className="block text-sm text-[#172E08] mb-2">
              Observaciones Iniciales (Opcional)
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej: Verificación mensual de noviembre, realizada por..."
              className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent resize-none"
              rows={4}
            />
          </div>

          {/* Lista de Productos a Verificar */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 overflow-hidden shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
            <div className="bg-gradient-to-r from-[#E7EDDD]/50 to-[#E7EDDD]/30 px-6 py-4 border-b border-[#73991C]/10">
              <h3 className="text-lg text-[#172E08] flex items-center gap-2">
                <Package className="w-5 h-5 text-[#73991C]" />
                Productos a Verificar ({productos.length})
              </h3>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-[#E7EDDD]/30 sticky top-0">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm text-[#4D240F]/70">Producto</th>
                    <th className="text-left px-6 py-3 text-sm text-[#4D240F]/70">Categoría</th>
                    <th className="text-right px-6 py-3 text-sm text-[#4D240F]/70">Cantidad Actual</th>
                    <th className="text-right px-6 py-3 text-sm text-[#4D240F]/70">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#73991C]/5">
                  {productos.map((producto) => (
                    <tr
                      key={producto.id}
                      className="hover:bg-[#E7EDDD]/20 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm text-[#172E08]">
                        {producto.nombre}
                      </td>
                      <td className="px-6 py-4 text-sm text-[#4D240F]/70">
                        {producto.categoria}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-[#172E08]">
                        {(producto.cantidad_actual || 0).toFixed(2)} {producto.unidad_medida}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-[#172E08]">
                        {formatCurrency((producto.cantidad_actual || 0) * (producto.precio_unitario || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Panel Lateral - Resumen */}
        <div className="space-y-6">
          {/* Resumen */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] sticky top-6">
            <h3 className="text-lg text-[#172E08] mb-4">Resumen</h3>

            <div className="space-y-4 mb-6">
              <div>
                <p className="text-sm text-[#4D240F]/60 mb-1">Total Productos</p>
                <p className="text-[#73991C]">{productos.length}</p>
              </div>

              <div className="pt-4 border-t border-[#73991C]/10">
                <p className="text-sm text-[#4D240F]/60 mb-1">Valor Total Teórico</p>
                <p className="text-2xl text-[#172E08]">
                  {formatCurrency(calcularValorTotal())}
                </p>
              </div>

              <div className="pt-4 border-t border-[#73991C]/10">
                <p className="text-sm text-[#4D240F]/60 mb-1">Verificador</p>
                <p className="text-sm text-[#172E08]">
                  {profile?.nombre || profile?.email || 'Usuario actual'}
                </p>
              </div>

              <div className="pt-4 border-t border-[#73991C]/10">
                <p className="text-sm text-[#4D240F]/60 mb-1">Fecha de Inicio</p>
                <p className="text-sm text-[#172E08]">
                  {formatearFecha(new Date().toISOString().split('T')[0])}
                </p>
              </div>
            </div>

            {/* Botón de Iniciar */}
            <button
              onClick={handleCrearVerificacion}
              disabled={isCreating || productos.length === 0}
              className="w-full px-6 py-4 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white hover:from-[#5f7d17] hover:to-[#9db86d] rounded-xl transition-all duration-200 font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creando Verificación...
                </>
              ) : (
                <>
                  <ClipboardCheck className="w-5 h-5" />
                  Iniciar Verificación
                </>
              )}
            </button>

            <p className="text-xs text-center text-[#4D240F]/60 mt-4">
              Al iniciar, podrás comenzar el conteo físico de productos
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}