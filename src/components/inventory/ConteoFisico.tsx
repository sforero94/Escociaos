import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ClipboardCheck,
  Loader2,
  Save,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Package,
  Search,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { VerificacionesNav } from './VerificacionesNav';

interface DetalleVerificacion {
  id: string;
  producto_id: string;
  cantidad_teorica: number;
  cantidad_fisica: number | null;
  diferencia: number | null;
  porcentaje_diferencia: number | null;
  valor_diferencia: number | null;
  estado_diferencia: string | null;
  observaciones: string | null;
  contado: boolean;
  producto: {
    nombre: string;
    categoria: string;
    unidad_medida: string;
    precio_unitario: number;
  };
}

interface Verificacion {
  id: string;
  fecha_inicio: string;
  estado: string;
  usuario_verificador: string | null;
}

/**
 * Componente para realizar el conteo físico de inventario
 * Interfaz optimizada para móvil y uso en bodega
 */
export function ConteoFisico() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const supabase = getSupabase();

  const [verificacion, setVerificacion] = useState<Verificacion | null>(null);
  const [detalles, setDetalles] = useState<DetalleVerificacion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Estado para el producto actual
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cantidadFisica, setCantidadFisica] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (id) {
      loadVerificacion();
    }
  }, [id]);

  useEffect(() => {
    if (detalles.length > 0 && currentIndex < detalles.length) {
      const current = detalles[currentIndex];
      setCantidadFisica(current.cantidad_fisica?.toString() || '');
      setObservaciones(current.observaciones || '');
    }
  }, [currentIndex, detalles]);

  const loadVerificacion = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Cargar verificación
      const { data: verif, error: errorVerif } = await supabase
        .from('verificaciones_inventario')
        .select('*')
        .eq('id', id)
        .single();

      if (errorVerif) throw errorVerif;

      // Verificar que esté en proceso
      if (verif.estado !== 'En proceso') {
        setError('Esta verificación ya no está en proceso');
        return;
      }

      setVerificacion(verif);

      // Cargar detalles con productos
      const { data: dets, error: errorDets } = await supabase
        .from('verificaciones_detalle')
        .select(
          `
          *,
          producto:productos(nombre, categoria, unidad_medida, precio_unitario)
        `
        )
        .eq('verificacion_id', id)
        .order('contado', { ascending: true }); // Los no contados primero

      if (errorDets) {
        throw errorDets;
      }

      // Ordenar manualmente por nombre de producto después de obtener los datos
      const detsSorted = (dets || []).sort((a, b) => {
        if (a.contado === b.contado) {
          return (a.producto?.nombre || '').localeCompare(b.producto?.nombre || '');
        }
        return a.contado ? 1 : -1;
      });

      setDetalles(detsSorted);

      // Si hay productos, ir al primero no contado
      if (dets && dets.length > 0) {
        const primerNoContado = dets.findIndex((d: any) => !d.contado);
        if (primerNoContado !== -1) {
          setCurrentIndex(primerNoContado);
        }
      }
    } catch (err: any) {
      setError('Error al cargar verificación: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuardarProducto = async () => {
    if (!cantidadFisica || cantidadFisica === '') {
      setError('Debes ingresar la cantidad física');
      return;
    }

    const cantidad = parseFloat(cantidadFisica);
    if (isNaN(cantidad) || cantidad < 0) {
      setError('La cantidad debe ser un número válido mayor o igual a 0');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      setSuccessMessage('');

      const detalle = detalles[currentIndex];

      // Actualizar detalle (el trigger calculará las diferencias automáticamente)
      const { error: errorUpdate } = await supabase
        .from('verificaciones_detalle')
        .update({
          cantidad_fisica: cantidad,
          observaciones: observaciones || null,
        })
        .eq('id', detalle.id);

      if (errorUpdate) throw errorUpdate;

      setSuccessMessage('✓ Guardado');

      // Recargar para obtener los cálculos automáticos
      await loadVerificacion();

      // Limpiar mensaje después de 2 segundos
      setTimeout(() => setSuccessMessage(''), 2000);
    } catch (err: any) {
      setError('Error al guardar: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSiguiente = async () => {
    if (currentIndex < detalles.length - 1) {
      // Si hay cambios sin guardar, preguntar
      const detalle = detalles[currentIndex];
      const cantidadActual = cantidadFisica ? parseFloat(cantidadFisica) : null;
      
      if (cantidadActual !== detalle.cantidad_fisica) {
        if (
          !window.confirm(
            '¿Deseas guardar los cambios antes de continuar?'
          )
        ) {
          setCurrentIndex(currentIndex + 1);
          return;
        }
        await handleGuardarProducto();
      }

      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleAnterior = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleCompletarVerificacion = async () => {
    const productosNoContados = detalles.filter((d) => !d.contado).length;

    if (productosNoContados > 0) {
      if (
        !window.confirm(
          `Hay ${productosNoContados} productos sin contar. ¿Estás seguro de completar la verificación?`
        )
      ) {
        return;
      }
    }

    try {
      setIsCompleting(true);
      setError('');

      // Actualizar estado de verificación
      const { error: errorUpdate } = await supabase
        .from('verificaciones_inventario')
        .update({
          estado: 'Pendiente Aprobación',
          fecha_completada: new Date().toISOString(),
        })
        .eq('id', id);

      if (errorUpdate) throw errorUpdate;

      // Navegar a la lista
      navigate('/inventario/verificaciones');
    } catch (err: any) {
      setError('Error al completar: ' + err.message);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSaltarAProducto = (index: number) => {
    setCurrentIndex(index);
  };

  const filteredDetalles = detalles.filter((d) =>
    d.producto.nombre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const productosContados = detalles.filter((d) => d.contado).length;
  const porcentajeProgreso = detalles.length > 0
    ? (productosContados / detalles.length) * 100
    : 0;

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

  if (error && !verificacion) {
    return (
      <div className="space-y-6">
        <VerificacionesNav />
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="text-red-800">{error}</p>
          <button
            onClick={() => navigate('/inventario/verificaciones')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Volver a Verificaciones
          </button>
        </div>
      </div>
    );
  }

  if (detalles.length === 0) {
    return (
      <div className="space-y-6">
        <VerificacionesNav />
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-12 text-center">
          <Package className="w-16 h-16 text-[#4D240F]/40 mx-auto mb-4" />
          <h3 className="text-xl text-[#172E08] mb-2">
            No hay productos para verificar
          </h3>
        </div>
      </div>
    );
  }

  const detalleActual = detalles[currentIndex];

  return (
    <div className="space-y-6">
      {/* Navegación */}
      <VerificacionesNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[#172E08] mb-2 flex items-center gap-3">
            <ClipboardCheck className="w-8 h-8 text-[#73991C]" />
            Conteo Físico
          </h1>
          <p className="text-[#4D240F]/70">
            Verificación: {verificacion?.fecha_inicio}
          </p>
        </div>
      </div>

      {/* Barra de Progreso */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[#4D240F]/70">Progreso</span>
          <span className="text-sm text-[#172E08]">
            {productosContados} / {detalles.length} productos contados
          </span>
        </div>
        <div className="w-full bg-[#E7EDDD]/50 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-[#73991C] to-[#BFD97D] h-3 rounded-full transition-all duration-300"
            style={{ width: `${porcentajeProgreso}%` }}
          />
        </div>
      </div>

      {/* Mensajes */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-green-700 text-sm">{successMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Principal - Producto Actual */}
        <div className="lg:col-span-2">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
            {/* Navegación de Producto */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#73991C]/10">
              <button
                onClick={handleAnterior}
                disabled={currentIndex === 0}
                className="p-2 hover:bg-[#E7EDDD]/50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-[#172E08]" />
              </button>

              <div className="text-center">
                <p className="text-sm text-[#4D240F]/60">Producto</p>
                <p className="text-lg text-[#73991C]">
                  {currentIndex + 1} de {detalles.length}
                </p>
              </div>

              <button
                onClick={handleSiguiente}
                disabled={currentIndex === detalles.length - 1}
                className="p-2 hover:bg-[#E7EDDD]/50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-6 h-6 text-[#172E08]" />
              </button>
            </div>

            {/* Información del Producto */}
            <div className="mb-6">
              <h2 className="text-2xl text-[#172E08] mb-2">
                {detalleActual.producto.nombre}
              </h2>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-[#E7EDDD]/50 text-[#4D240F]/70 rounded-lg text-sm">
                  {detalleActual.producto.categoria}
                </span>
                {detalleActual.contado && (
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Ya contado
                  </span>
                )}
              </div>
            </div>

            {/* Cantidad Teórica */}
            <div className="bg-[#E7EDDD]/30 rounded-xl p-4 mb-6">
              <p className="text-sm text-[#4D240F]/60 mb-1">Cantidad en Sistema</p>
              <p className="text-[#172E08]">
                {detalleActual.cantidad_teorica.toFixed(2)} {detalleActual.producto.unidad_medida}
              </p>
            </div>

            {/* Input Cantidad Física */}
            <div className="mb-6">
              <label className="block text-sm text-[#172E08] mb-2">
                Cantidad Física Contada *
              </label>
              <div className="flex gap-3">
                <input
                  type="number"
                  value={cantidadFisica}
                  onChange={(e) => setCantidadFisica(e.target.value)}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="flex-1 px-4 py-3 text-2xl border-2 border-[#73991C]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
                />
                <div className="flex items-center px-4 bg-[#E7EDDD]/30 rounded-xl">
                  <span className="text-lg text-[#4D240F]/70">
                    {detalleActual.producto.unidad_medida}
                  </span>
                </div>
              </div>
            </div>

            {/* Observaciones */}
            <div className="mb-6">
              <label className="block text-sm text-[#172E08] mb-2">
                Observaciones (Opcional)
              </label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej: Bolsa rota, producto derramado..."
                className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent resize-none"
                rows={3}
              />
            </div>

            {/* Botones de Acción */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleGuardarProducto}
                disabled={isSaving || !cantidadFisica}
                className="flex-1 px-6 py-4 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white hover:from-[#5f7d17] hover:to-[#9db86d] rounded-xl transition-all duration-200 font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Guardar
                  </>
                )}
              </button>

              {currentIndex < detalles.length - 1 && (
                <button
                  onClick={handleSiguiente}
                  className="flex-1 px-6 py-4 bg-white border-2 border-[#73991C] text-[#73991C] hover:bg-[#F8FAF5] rounded-xl transition-all duration-200 font-medium flex items-center justify-center gap-2"
                >
                  Siguiente
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Mostrar diferencia si ya fue contado */}
            {detalleActual.contado && detalleActual.diferencia !== null && (
              <div className={`mt-6 p-4 rounded-xl ${
                Math.abs(detalleActual.porcentaje_diferencia || 0) < 1
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-amber-50 border border-amber-200'
              }`}>
                <p className="text-sm mb-2">
                  {detalleActual.estado_diferencia}
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[#4D240F]/60">Diferencia</p>
                    <p>
                      {detalleActual.diferencia > 0 ? '+' : ''}
                      {detalleActual.diferencia.toFixed(2)} {detalleActual.producto.unidad_medida}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#4D240F]/60">Porcentaje</p>
                    <p>
                      {detalleActual.porcentaje_diferencia?.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Panel Lateral - Lista Rápida */}
        <div className="space-y-6">
          {/* Búsqueda */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-4 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4D240F]/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full pl-10 pr-4 py-2 border border-[#73991C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent"
              />
            </div>
          </div>

          {/* Lista de Productos */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 overflow-hidden shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
            <div className="bg-gradient-to-r from-[#E7EDDD]/50 to-[#E7EDDD]/30 px-4 py-3 border-b border-[#73991C]/10">
              <h3 className="text-sm text-[#172E08]">
                Todos los Productos
              </h3>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {filteredDetalles.map((detalle, index) => (
                <button
                  key={detalle.id}
                  onClick={() => handleSaltarAProducto(detalles.indexOf(detalle))}
                  className={`w-full text-left px-4 py-3 border-b border-[#73991C]/5 hover:bg-[#E7EDDD]/30 transition-colors ${
                    detalles.indexOf(detalle) === currentIndex
                      ? 'bg-[#E7EDDD]/50'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#172E08] truncate">
                        {detalle.producto.nombre}
                      </p>
                      <p className="text-xs text-[#4D240F]/60">
                        {detalle.cantidad_teorica.toFixed(2)} {detalle.producto.unidad_medida}
                      </p>
                    </div>
                    {detalle.contado && (
                      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Botón Completar */}
          <button
            onClick={handleCompletarVerificacion}
            disabled={isCompleting}
            className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800 rounded-xl transition-all duration-200 font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isCompleting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Completando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Completar Verificación
              </>
            )}
          </button>
          <p className="text-xs text-center text-[#4D240F]/60">
            Al completar, Gerencia recibirá notificación para aprobar ajustes
          </p>
        </div>
      </div>
    </div>
  );
}