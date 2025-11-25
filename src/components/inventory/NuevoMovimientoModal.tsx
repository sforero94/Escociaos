import { useState, useEffect } from 'react';
import { X, Package, Search, AlertCircle, CheckCircle } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface Product {
  id: number;
  nombre: string;
  unidad_medida: string;
  cantidad_actual: number;
  precio_unitario: number;
  activo: boolean;
}

interface NuevoMovimientoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NuevoMovimientoModal({ isOpen, onClose, onSuccess }: NuevoMovimientoModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [tipoMovimiento, setTipoMovimiento] = useState<'Entrada' | 'Salida Otros' | 'Ajuste'>('Entrada');
  const [cantidad, setCantidad] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Buscar productos al escribir
  useEffect(() => {
    if (searchTerm.length >= 2) {
      searchProducts();
    } else {
      setProducts([]);
    }
  }, [searchTerm]);

  const searchProducts = async () => {
    setSearching(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('productos')
        .select('id, nombre, unidad_medida, cantidad_actual, precio_unitario, activo')
        .eq('activo', true)
        .ilike('nombre', `%${searchTerm}%`)
        .order('nombre')
        .limit(10);

      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
      console.error('Error buscando productos:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSearchTerm(product.nombre);
    setProducts([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validaciones
    if (!selectedProduct) {
      setError('Debe seleccionar un producto');
      return;
    }

    const cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum) || cantidadNum < 0) {
      setError('La cantidad debe ser mayor o igual a 0');
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabase();

      // Calcular nuevo saldo según tipo de movimiento
      let saldoAnterior = selectedProduct.cantidad_actual;
      let cantidadMovimiento = 0;
      let nuevoSaldo = 0;

      switch (tipoMovimiento) {
        case 'Entrada':
          // Para entrada: sumar al stock actual
          cantidadMovimiento = cantidadNum;
          nuevoSaldo = saldoAnterior + cantidadMovimiento;
          break;
        case 'Salida Otros':
          // Para salida: restar del stock actual
          if (cantidadNum > saldoAnterior) {
            setError(`La cantidad no puede ser mayor al stock actual (${saldoAnterior} ${selectedProduct.unidad_medida})`);
            setLoading(false);
            return;
          }
          cantidadMovimiento = -cantidadNum; // Negativo para salidas
          nuevoSaldo = saldoAnterior + cantidadMovimiento;
          break;
        case 'Ajuste':
          // Para ajuste: la cantidad ingresada ES el nuevo saldo deseado
          nuevoSaldo = cantidadNum;
          cantidadMovimiento = nuevoSaldo - saldoAnterior; // Puede ser positivo o negativo
          break;
      }

      // 1. Registrar movimiento en movimientos_inventario
      const { error: movError } = await supabase
        .from('movimientos_inventario')
        .insert({
          fecha_movimiento: new Date().toISOString().split('T')[0], // Fecha actual en formato YYYY-MM-DD
          producto_id: selectedProduct.id,
          tipo_movimiento: tipoMovimiento,
          cantidad: cantidadMovimiento,
          unidad: selectedProduct.unidad_medida,
          saldo_anterior: saldoAnterior,
          saldo_nuevo: nuevoSaldo,
          observaciones: observaciones || null,
          provisional: false
        });

      if (movError) throw movError;

      // 2. Actualizar cantidad_actual en productos
      const { error: prodError } = await supabase
        .from('productos')
        .update({ 
          cantidad_actual: nuevoSaldo,
          // REGLA DE NEGOCIO: Si después del movimiento la cantidad > 0, activar automáticamente
          activo: nuevoSaldo > 0 ? true : selectedProduct.activo
        })
        .eq('id', selectedProduct.id);

      if (prodError) throw prodError;

      // Success
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);

    } catch (err: any) {
      console.error('Error registrando movimiento:', err);
      setError(err.message || 'Error al registrar el movimiento');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSearchTerm('');
    setProducts([]);
    setSelectedProduct(null);
    setTipoMovimiento('Entrada');
    setCantidad('');
    setObservaciones('');
    setError(null);
    setSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#73991C] to-[#5f7d17] text-white p-6 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6" />
            <h2 className="text-2xl">Registrar Movimiento Manual</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-white/80 hover:text-white transition-colors"
            disabled={loading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="m-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-green-800">Movimiento registrado exitosamente</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Buscador de Producto */}
          <div className="relative">
            <label className="block text-sm text-gray-700 mb-2">
              Producto *
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (selectedProduct && e.target.value !== selectedProduct.nombre) {
                    setSelectedProduct(null);
                  }
                }}
                placeholder="Buscar producto por nombre..."
                className="pl-10 pr-4 py-3 rounded-xl border-[#73991C]/20 focus:ring-[#73991C] focus:border-[#73991C]"
                disabled={loading}
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-[#73991C] border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            {/* Resultados de búsqueda */}
            {products.length > 0 && !selectedProduct && (
              <div className="absolute z-10 w-full mt-2 bg-white border border-[#73991C]/20 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleSelectProduct(product)}
                    className="w-full px-4 py-3 text-left hover:bg-[#F8FAF5] transition-colors border-b border-gray-100 last:border-b-0"
                  >
                    <p className="text-[#172E08] font-medium">{product.nombre}</p>
                    <p className="text-sm text-[#4D240F]/70">
                      Stock actual: {product.cantidad_actual} {product.unidad_medida}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* Producto seleccionado */}
            {selectedProduct && (
              <div className="mt-3 p-4 bg-[#F8FAF5] rounded-xl border border-[#73991C]/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[#172E08] font-medium">{selectedProduct.nombre}</p>
                    <p className="text-sm text-[#4D240F]/70">
                      Stock actual: <span className="font-medium text-[#73991C]">
                        {selectedProduct.cantidad_actual} {selectedProduct.unidad_medida}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setSearchTerm('');
                    }}
                    className="text-[#4D240F]/70 hover:text-[#DC3545] transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tipo de Movimiento */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Tipo de Movimiento *
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(['Entrada', 'Salida Otros', 'Ajuste'] as const).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setTipoMovimiento(tipo)}
                  disabled={loading}
                  className={`px-4 py-3 rounded-xl border-2 transition-all duration-200 capitalize ${
                    tipoMovimiento === tipo
                      ? 'border-[#73991C] bg-[#73991C] text-white shadow-md'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-[#73991C]/40'
                  }`}
                >
                  {tipo}
                </button>
              ))}
            </div>
            
            {/* Descripción del tipo seleccionado */}
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                {tipoMovimiento === 'Entrada' && '✅ Aumenta el stock del producto'}
                {tipoMovimiento === 'Salida Otros' && '⬇️ Disminuye el stock del producto'}
                {tipoMovimiento === 'Ajuste' && '🔧 Ajuste de inventario (corrección de stock)'}
              </p>
            </div>
          </div>

          {/* Cantidad */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Cantidad *
            </label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="flex-1 rounded-xl border-[#73991C]/20 focus:ring-[#73991C] focus:border-[#73991C]"
                disabled={loading || !selectedProduct}
              />
              {selectedProduct && (
                <span className="text-[#4D240F]/70 font-medium whitespace-nowrap">
                  {selectedProduct.unidad_medida}
                </span>
              )}
            </div>
            
            {/* Preview del nuevo saldo */}
            {selectedProduct && cantidad && parseFloat(cantidad) >= 0 && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Saldo anterior:</span>
                  <span className="font-medium">{selectedProduct.cantidad_actual} {selectedProduct.unidad_medida}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-gray-600">Movimiento:</span>
                  <span className={`font-medium ${
                    tipoMovimiento === 'Entrada' ? 'text-green-600' : 
                    tipoMovimiento === 'Salida Otros' ? 'text-red-600' : 
                    (() => {
                      const diff = parseFloat(cantidad) - selectedProduct.cantidad_actual;
                      return diff >= 0 ? 'text-green-600' : 'text-red-600';
                    })()
                  }`}>
                    {tipoMovimiento === 'Entrada' && `+${parseFloat(cantidad)} ${selectedProduct.unidad_medida}`}
                    {tipoMovimiento === 'Salida Otros' && `-${parseFloat(cantidad)} ${selectedProduct.unidad_medida}`}
                    {tipoMovimiento === 'Ajuste' && (() => {
                      const diff = parseFloat(cantidad) - selectedProduct.cantidad_actual;
                      const sign = diff >= 0 ? '+' : '';
                      return `${sign}${diff.toFixed(2)} ${selectedProduct.unidad_medida}`;
                    })()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-gray-300">
                  <span className="font-medium text-gray-900">Nuevo saldo:</span>
                  <span className="font-bold text-[#73991C]">
                    {tipoMovimiento === 'Entrada' 
                      ? selectedProduct.cantidad_actual + parseFloat(cantidad)
                      : tipoMovimiento === 'Salida Otros'
                      ? selectedProduct.cantidad_actual - parseFloat(cantidad)
                      : parseFloat(cantidad)
                    } {selectedProduct.unidad_medida}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Notas / Motivo
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej: Pérdida por daño, ajuste por inventario físico, etc."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-[#73991C]/20 focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent resize-none"
              disabled={loading}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              onClick={handleClose}
              variant="outline"
              className="flex-1 rounded-xl border-gray-300 hover:bg-gray-50"
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#73991C] hover:bg-[#5f7d17] text-white rounded-xl"
              disabled={loading || !selectedProduct || !cantidad}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Registrando...
                </>
              ) : (
                <>
                  <Package className="w-4 h-4 mr-2" />
                  Registrar Movimiento
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}