import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { getSupabase } from '../../utils/supabase/client';

interface NewPurchaseProps {
  onNavigate: (view: string) => void;
}

interface Product {
  id: number;
  nombre: string;
  unidad_medida: string;
  precio_unitario: number;
}

export function NewPurchase({ onNavigate }: NewPurchaseProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    proveedor: '',
    numero_factura: '',
    producto_id: '',
    cantidad: '',
    precio: '',
    lote_producto: '',
    fecha_vencimiento: '',
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('productos')
        .select('id, nombre, unidad_medida, precio_unitario')
        .eq('activo', true)
        .order('nombre');

      if (error) {
        console.error('Error cargando productos:', error);
      } else if (data) {
        setProducts(data);
      }
    } catch (error) {
      console.error('Error inesperado:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError('');

    // Si se selecciona un producto, autocompletar el precio
    if (field === 'producto_id' && value) {
      const product = products.find((p) => p.id === parseInt(value));
      if (product) {
        setFormData((prev) => ({ ...prev, precio: product.precio_unitario.toString() }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);

    try {
      const supabase = getSupabase();

      // Validaciones
      if (!formData.producto_id) {
        setError('Por favor selecciona un producto');
        setIsSaving(false);
        return;
      }

      const cantidad = parseFloat(formData.cantidad);
      const precio = parseFloat(formData.precio);

      if (isNaN(cantidad) || cantidad <= 0) {
        setError('La cantidad debe ser mayor a 0');
        setIsSaving(false);
        return;
      }

      if (isNaN(precio) || precio <= 0) {
        setError('El precio debe ser mayor a 0');
        setIsSaving(false);
        return;
      }

      const producto_id = parseInt(formData.producto_id);

      // 1. Insertar en tabla compras
      const { data: compraData, error: compraError } = await supabase
        .from('compras')
        .insert({
          fecha: formData.fecha,
          proveedor: formData.proveedor,
          numero_factura: formData.numero_factura,
          producto_id: producto_id,
          cantidad: cantidad,
          precio_unitario: precio,
          total: cantidad * precio,
          lote_producto: formData.lote_producto || null,
          fecha_vencimiento: formData.fecha_vencimiento || null,
        })
        .select()
        .single();

      if (compraError) {
        console.error('Error al registrar compra:', compraError);
        setError('Error al registrar la compra. Por favor intenta de nuevo.');
        setIsSaving(false);
        return;
      }

      // 2. Insertar en tabla movimientos_inventario
      const { error: movError } = await supabase
        .from('movimientos_inventario')
        .insert({
          producto_id: producto_id,
          tipo_movimiento: 'Entrada',
          cantidad: cantidad,
          fecha: formData.fecha,
          referencia: `Compra #${formData.numero_factura}`,
          responsable: 'Sistema',
        });

      if (movError) {
        console.error('Error al registrar movimiento:', movError);
        // Continuamos aunque falle el movimiento
      }

      // 3. Actualizar cantidad en tabla productos
      const { data: productoActual, error: prodError } = await supabase
        .from('productos')
        .select('cantidad_actual')
        .eq('id', producto_id)
        .single();

      if (prodError) {
        console.error('Error al obtener producto:', prodError);
      } else if (productoActual) {
        const nuevaCantidad = (productoActual.cantidad_actual || 0) + cantidad;
        
        const { error: updateError } = await supabase
          .from('productos')
          .update({ cantidad_actual: nuevaCantidad })
          .eq('id', producto_id);

        if (updateError) {
          console.error('Error al actualizar cantidad:', updateError);
        }
      }

      // Mostrar mensaje de éxito
      setShowSuccess(true);
      
      // Redirigir después de 2 segundos
      setTimeout(() => {
        onNavigate('inventory');
      }, 2000);

    } catch (error) {
      console.error('Error inesperado:', error);
      setError('Error inesperado. Por favor intenta de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedProduct = products.find(
    (p) => p.id === parseInt(formData.producto_id)
  );

  if (showSuccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/20 rounded-2xl mb-4 shadow-lg">
            <CheckCircle className="w-10 h-10 text-[#73991C]" />
          </div>
          <h2 className="text-2xl text-[#172E08] mb-2">¡Compra Registrada!</h2>
          <p className="text-[#4D240F]/70 mb-4">
            El inventario ha sido actualizado correctamente
          </p>
          <Loader2 className="w-6 h-6 text-[#73991C] animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate('inventory')}
          className="text-[#73991C] hover:bg-[#E7EDDD]/50 rounded-xl"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
      </div>

      <div>
        <h1 className="text-[#172E08] mb-2">Registrar Nueva Compra</h1>
        <p className="text-[#4D240F]/70">
          Ingresa los detalles de la compra para actualizar el inventario
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-8 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="space-y-8">
          {/* Información General */}
          <div>
            <h3 className="text-[#172E08] mb-4">Información General</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha" className="text-[#172E08]">Fecha de Compra</Label>
                <Input
                  id="fecha"
                  type="date"
                  value={formData.fecha}
                  onChange={(e) => handleChange('fecha', e.target.value)}
                  required
                  disabled={isSaving}
                  className="bg-[#E7EDDD]/30 border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="numero_factura" className="text-[#172E08]">Número de Factura</Label>
                <Input
                  id="numero_factura"
                  type="text"
                  placeholder="Ej: FC-001234"
                  value={formData.numero_factura}
                  onChange={(e) => handleChange('numero_factura', e.target.value)}
                  required
                  disabled={isSaving}
                  className="bg-[#E7EDDD]/30 border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="proveedor" className="text-[#172E08]">Proveedor</Label>
                <Input
                  id="proveedor"
                  type="text"
                  placeholder="Nombre del proveedor"
                  value={formData.proveedor}
                  onChange={(e) => handleChange('proveedor', e.target.value)}
                  required
                  disabled={isSaving}
                  className="bg-[#E7EDDD]/30 border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Producto y Cantidad */}
          <div>
            <h3 className="text-[#172E08] mb-4">Producto y Cantidad</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="producto_id" className="text-[#172E08]">Producto</Label>
                {isLoading ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-[#73991C]/20 rounded-xl bg-[#E7EDDD]/30">
                    <Loader2 className="w-4 h-4 animate-spin text-[#73991C]" />
                    <span className="text-[#4D240F]/70">Cargando productos...</span>
                  </div>
                ) : (
                  <select
                    id="producto_id"
                    value={formData.producto_id}
                    onChange={(e) => handleChange('producto_id', e.target.value)}
                    required
                    disabled={isSaving}
                    className="w-full px-3 py-2 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C]"
                  >
                    <option value="">Selecciona un producto</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.nombre} ({product.unidad_medida})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cantidad" className="text-[#172E08]">
                  Cantidad {selectedProduct && `(${selectedProduct.unidad_medida})`}
                </Label>
                <Input
                  id="cantidad"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.cantidad}
                  onChange={(e) => handleChange('cantidad', e.target.value)}
                  required
                  disabled={isSaving}
                  className="bg-[#E7EDDD]/30 border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="precio" className="text-[#172E08]">Precio Unitario</Label>
                <Input
                  id="precio"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.precio}
                  onChange={(e) => handleChange('precio', e.target.value)}
                  required
                  disabled={isSaving}
                  className="bg-[#E7EDDD]/30 border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
                />
              </div>

              {formData.cantidad && formData.precio && (
                <div className="md:col-span-2 bg-gradient-to-br from-[#73991C]/5 to-[#BFD97D]/5 rounded-xl p-5 border border-[#73991C]/10">
                  <p className="text-sm text-[#4D240F]/60 mb-1 uppercase tracking-wide">Total de la Compra</p>
                  <p className="text-2xl text-[#73991C]">
                    {new Intl.NumberFormat('es-CO', {
                      style: 'currency',
                      currency: 'COP',
                      minimumFractionDigits: 0,
                    }).format(parseFloat(formData.cantidad) * parseFloat(formData.precio))}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Información Adicional */}
          <div>
            <h3 className="text-[#172E08] mb-4">Información Adicional (Opcional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lote_producto" className="text-[#172E08]">Lote del Producto</Label>
                <Input
                  id="lote_producto"
                  type="text"
                  placeholder="Ej: L-2024-001"
                  value={formData.lote_producto}
                  onChange={(e) => handleChange('lote_producto', e.target.value)}
                  disabled={isSaving}
                  className="bg-[#E7EDDD]/30 border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fecha_vencimiento" className="text-[#172E08]">Fecha de Vencimiento</Label>
                <Input
                  id="fecha_vencimiento"
                  type="date"
                  value={formData.fecha_vencimiento}
                  onChange={(e) => handleChange('fecha_vencimiento', e.target.value)}
                  disabled={isSaving}
                  className="bg-[#E7EDDD]/30 border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-[#DC3545]/10 border border-[#DC3545]/20 text-[#DC3545] px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onNavigate('inventory')}
              disabled={isSaving}
              className="flex-1 border-[#73991C]/20 text-[#172E08] hover:bg-[#E7EDDD]/30 rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-gradient-to-r from-[#73991C] to-[#BFD97D] hover:shadow-lg hover:shadow-[#73991C]/30 text-white rounded-xl transition-all duration-200"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Registrando...
                </>
              ) : (
                'Registrar Compra'
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}