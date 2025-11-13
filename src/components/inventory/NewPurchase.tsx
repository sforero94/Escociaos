import { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle, Package, Loader2, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { getSupabase } from '../../utils/supabase/client';
import { InventoryNav } from './InventoryNav';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../shared/Toast';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface NewPurchaseProps {
  onNavigate?: (view: string) => void;
}

interface Product {
  id: number;
  nombre: string;
  unidad_medida: string;
  precio_unitario: number;
  cantidad_actual: number;
}

interface PurchaseItem {
  id: string; // ID temporal para React keys
  producto_id: string;
  cantidad: string;
  precio_unitario: string;
  lote_producto: string;
  fecha_vencimiento: string;
  permitido_gerencia: boolean | null; // null = sin seleccionar, true = Sí, false = No
}

export function NewPurchase({ onNavigate }: NewPurchaseProps) {
  const navigate = useNavigate();
  const { showSuccess, showError, showWarning, showInfo, ToastContainer } = useToast();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessView, setShowSuccessView] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Datos generales de la compra
  const [purchaseData, setPurchaseData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    proveedor: '',
    numero_factura: '',
  });

  // Items de la compra
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([
    {
      id: crypto.randomUUID(),
      producto_id: '',
      cantidad: '',
      precio_unitario: '',
      lote_producto: '',
      fecha_vencimiento: '',
      permitido_gerencia: null,
    },
  ]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    
    // Intentar hasta 3 veces con delay incremental
    let retries = 3;
    let delay = 1000;
    
    while (retries > 0) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('productos')
          .select('id, nombre, unidad_medida, precio_unitario, cantidad_actual')
          .eq('activo', true)
          .order('nombre');

        if (error) {
          console.error('Error en query productos:', error);
          throw error;
        }
        
        setProducts(data || []);
        console.log('✅ Productos cargados exitosamente:', data?.length || 0);
        return; // Éxito, salir del loop
        
      } catch (err: any) {
        retries--;
        console.error(`Error cargando productos (intentos restantes: ${retries}):`, err);
        
        if (retries === 0) {
          // Último intento fallido
          showError(`❌ Error al cargar productos: ${err?.message || 'Error de conexión'}`);
          console.error('Error final cargando productos:', {
            message: err?.message,
            code: err?.code,
            details: err?.details,
            hint: err?.hint
          });
        } else {
          // Esperar antes de reintentar
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Backoff exponencial
        }
      }
    }
    
    setIsLoading(false);
  };

  // Filtrar productos por búsqueda
  const filteredProducts = products.filter((p) =>
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Agregar nueva línea de producto
  const addItem = () => {
    if (purchaseItems.length >= 20) {
      showWarning('⚠️ Máximo 20 productos por compra');
      return;
    }

    setPurchaseItems([
      ...purchaseItems,
      {
        id: crypto.randomUUID(),
        producto_id: '',
        cantidad: '',
        precio_unitario: '',
        lote_producto: '',
        fecha_vencimiento: '',
        permitido_gerencia: null,
      },
    ]);
    showInfo('➕ Producto agregado a la lista');
  };

  // Eliminar línea de producto
  const removeItem = (id: string) => {
    if (purchaseItems.length === 1) {
      showWarning('⚠️ Debe mantener al menos un producto');
      return;
    }
    
    setPurchaseItems(purchaseItems.filter((item) => item.id !== id));
    showInfo('🗑️ Producto eliminado de la lista');
  };

  // Actualizar campo de un item específico
  const updateItem = (id: string, field: keyof PurchaseItem, value: any) => {
    setPurchaseItems(
      purchaseItems.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          
          // Si cambia el producto, auto-cargar el precio unitario
          if (field === 'producto_id' && value) {
            const product = products.find((p) => p.id === parseInt(value));
            if (product) {
              updated.precio_unitario = product.precio_unitario.toString();
            }
          }
          
          return updated;
        }
        return item;
      })
    );
  };

  // Calcular subtotal de un item
  const calculateSubtotal = (item: PurchaseItem): number => {
    const cantidad = parseFloat(item.cantidad) || 0;
    const precio = parseFloat(item.precio_unitario) || 0;
    return cantidad * precio;
  };

  // Calcular total general
  const calculateTotal = (): number => {
    return purchaseItems.reduce((sum, item) => sum + calculateSubtotal(item), 0);
  };

  // Formatear moneda
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  // Obtener nombre del producto
  const getProductName = (productId: string): string => {
    const product = products.find((p) => p.id === parseInt(productId));
    return product?.nombre || '';
  };

  // Obtener producto completo
  const getProduct = (productId: string): Product | undefined => {
    return products.find((p) => p.id === parseInt(productId));
  };

  // Obtener unidad de medida
  const getProductUnit = (productId: string): string => {
    const product = products.find((p) => p.id === parseInt(productId));
    return product?.unidad_medida || '';
  };

  // Validar formulario
  const validateForm = (): boolean => {
    if (!purchaseData.proveedor.trim()) {
      showError('❌ El proveedor es obligatorio');
      return false;
    }

    if (!purchaseData.numero_factura.trim()) {
      showError('❌ El número de factura es obligatorio');
      return false;
    }

    for (let i = 0; i < purchaseItems.length; i++) {
      const item = purchaseItems[i];
      const productNum = i + 1;

      if (!item.producto_id) {
        showError(`❌ Producto ${productNum}: Debe seleccionar un producto`);
        return false;
      }
      if (!item.cantidad || parseFloat(item.cantidad) <= 0) {
        showError(`❌ Producto ${productNum}: La cantidad debe ser mayor a 0`);
        return false;
      }
      if (!item.precio_unitario || parseFloat(item.precio_unitario) <= 0) {
        showError(`❌ Producto ${productNum}: El precio debe ser mayor a 0`);
        return false;
      }
      if (item.permitido_gerencia === null) {
        showError(`❌ Producto ${productNum}: Debe seleccionar Sí o No en "Permitido por Gerencia" (PG)`);
        return false;
      }
    }

    return true;
  };

  // Mostrar diálogo de confirmación
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setShowConfirmDialog(true);
  };

  // Guardar compra después de confirmación
  const confirmPurchase = async () => {
    setShowConfirmDialog(false);
    setIsSaving(true);
    showInfo('💾 Guardando compra...');

    try {
      const supabase = getSupabase();

      // Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser();

      // Insertar cada producto como un registro individual en 'compras'
      // Según el schema: cada registro en 'compras' es UN producto comprado
      for (const item of purchaseItems) {
        const cantidad = parseFloat(item.cantidad);
        const precioUnitario = parseFloat(item.precio_unitario);
        const productoId = item.producto_id;

        // Obtener datos del producto
        const { data: productoData, error: productoError } = await supabase
          .from('productos')
          .select('cantidad_actual, unidad_medida, nombre')
          .eq('id', productoId)
          .single();

        if (productoError) throw productoError;

        const cantidadAnterior = productoData.cantidad_actual;
        const cantidadNueva = cantidadAnterior + cantidad;

        // Insertar registro de compra (un registro por producto según schema)
        const { data: compraData, error: compraError } = await supabase
          .from('compras')
          .insert([
            {
              fecha_compra: purchaseData.fecha,
              proveedor: purchaseData.proveedor,
              numero_factura: purchaseData.numero_factura || null,
              producto_id: productoId,
              cantidad: cantidad,
              unidad: productoData.unidad_medida,
              numero_lote_producto: item.lote_producto || null,
              fecha_vencimiento: item.fecha_vencimiento || null,
              costo_unitario: precioUnitario,
              costo_total: cantidad * precioUnitario,
              link_factura: null,
              usuario_registro: user?.email || null,
            },
          ])
          .select()
          .single();

        if (compraError) {
          console.error('Error guardando compra:', compraError);
          throw compraError;
        }

        // Actualizar cantidad en productos
        const { error: updateError } = await supabase
          .from('productos')
          .update({ 
            cantidad_actual: cantidadNueva,
            precio_unitario: precioUnitario, // Actualizar precio unitario con el de la compra
          })
          .eq('id', productoId);

        if (updateError) throw updateError;

        // Registrar movimiento de inventario
        const { error: movimientoError } = await supabase
          .from('movimientos_inventario')
          .insert([
            {
              fecha_movimiento: purchaseData.fecha,
              producto_id: productoId,
              tipo_movimiento: 'Entrada', // Enum con mayúscula inicial
              cantidad: cantidad,
              unidad: productoData.unidad_medida,
              factura: purchaseData.numero_factura || null,
              saldo_anterior: cantidadAnterior,
              saldo_nuevo: cantidadNueva,
              valor_movimiento: cantidad * precioUnitario,
              responsable: user?.email || null,
              observaciones: `Compra - Factura: ${purchaseData.numero_factura || 'Sin número'} - Proveedor: ${purchaseData.proveedor} - Producto: ${productoData.nombre}`,
              provisional: false,
            },
          ]);

        if (movimientoError) throw movimientoError;
      }

      showSuccess(`✅ Compra registrada exitosamente: ${purchaseItems.length} producto(s) - Factura ${purchaseData.numero_factura}`);
      showInfo('📊 Inventario actualizado automáticamente');
      
      setShowSuccessView(true);
      setTimeout(() => {
        navigate('/inventario/movimientos');
      }, 2000);
    } catch (err: any) {
      console.error('Error guardando compra:', err);
      showError(`❌ Error al guardar: ${err.message || 'Intente nuevamente'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Vista de éxito
  if (showSuccessView) {
    return (
      <div className="space-y-6">
        <InventoryNav />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/20 rounded-2xl mb-4 shadow-lg">
              <CheckCircle className="w-10 h-10 text-[#73991C]" />
            </div>
            <h2 className="text-[#172E08] mb-2">¡Compra registrada con éxito!</h2>
            <p className="text-[#4D240F]/70">
              Se han registrado {purchaseItems.length} producto(s) correctamente
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer />
      <InventoryNav />

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulario Principal - 2 columnas */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-[#172E08] mb-2">Nueva Compra</h1>
              <p className="text-[#4D240F]/70">Registra una nueva compra de productos</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Datos generales de la compra */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-[#73991C]/10 shadow-sm">
                <h3 className="text-[#172E08] mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-[#73991C]" />
                  Información General
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="fecha" className="text-[#172E08] mb-2">
                      Fecha
                    </Label>
                    <Input
                      id="fecha"
                      type="date"
                      value={purchaseData.fecha}
                      onChange={(e) =>
                        setPurchaseData({ ...purchaseData, fecha: e.target.value })
                      }
                      className="border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="proveedor" className="text-[#172E08] mb-2">
                      Proveedor *
                    </Label>
                    <Input
                      id="proveedor"
                      type="text"
                      placeholder="Nombre del proveedor"
                      value={purchaseData.proveedor}
                      onChange={(e) =>
                        setPurchaseData({ ...purchaseData, proveedor: e.target.value })
                      }
                      className="border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="numero_factura" className="text-[#172E08] mb-2">
                      Número de Factura *
                    </Label>
                    <Input
                      id="numero_factura"
                      type="text"
                      placeholder="Ej: F-001234"
                      value={purchaseData.numero_factura}
                      onChange={(e) =>
                        setPurchaseData({ ...purchaseData, numero_factura: e.target.value })
                      }
                      className="border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Búsqueda de Productos */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-[#73991C]/10 shadow-sm">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#4D240F]/40" />
                  <Input
                    type="text"
                    placeholder="Buscar productos disponibles..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
                  />
                </div>
                {searchTerm && (
                  <p className="text-xs text-[#4D240F]/60 mt-2">
                    {filteredProducts.length} producto(s) encontrado(s)
                  </p>
                )}
              </div>

              {/* Productos de la compra */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-[#73991C]/10 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[#172E08] flex items-center gap-2">
                    <Package className="w-5 h-5 text-[#73991C]" />
                    Productos ({purchaseItems.length})
                  </h3>
                  <Button
                    type="button"
                    onClick={addItem}
                    size="sm"
                    className="bg-[#73991C] hover:bg-[#5f7d17] text-white rounded-xl"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Agregar Producto
                  </Button>
                </div>

                <div className="space-y-3">
                  {purchaseItems.map((item, index) => {
                    const subtotal = calculateSubtotal(item);
                    const unit = getProductUnit(item.producto_id);

                    return (
                      <div
                        key={item.id}
                        className="bg-[#F8FAF5] rounded-xl p-4 border border-[#73991C]/10"
                      >
                        {/* Primera fila: Campos principales */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start mb-3">
                          {/* Producto */}
                          <div className="md:col-span-4">
                            <Label className="text-xs text-[#4D240F]/70 mb-1">
                              Producto *
                            </Label>
                            <select
                              value={item.producto_id}
                              onChange={(e) =>
                                updateItem(item.id, 'producto_id', e.target.value)
                              }
                              className="w-full px-3 py-2 border border-[#73991C]/20 rounded-lg text-sm focus:outline-none focus:border-[#73991C] bg-white"
                              required
                            >
                              <option value="">Seleccionar...</option>
                              {filteredProducts.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.nombre}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Cantidad */}
                          <div className="md:col-span-2">
                            <Label className="text-xs text-[#4D240F]/70 mb-1">
                              Cantidad * {unit && `(${unit})`}
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0"
                              value={item.cantidad}
                              onChange={(e) =>
                                updateItem(item.id, 'cantidad', e.target.value)
                              }
                              className="border-[#73991C]/20 focus:border-[#73991C] rounded-lg text-sm h-9"
                              required
                            />
                          </div>

                          {/* Precio Unitario */}
                          <div className="md:col-span-2">
                            <Label className="text-xs text-[#4D240F]/70 mb-1">
                              Precio Unit. *
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0"
                              value={item.precio_unitario}
                              onChange={(e) =>
                                updateItem(item.id, 'precio_unitario', e.target.value)
                              }
                              className="border-[#73991C]/20 focus:border-[#73991C] rounded-lg text-sm h-9"
                              required
                            />
                          </div>

                          {/* Subtotal */}
                          <div className="md:col-span-3">
                            <Label className="text-xs text-[#4D240F]/70 mb-1">
                              Subtotal
                            </Label>
                            <div className="px-3 py-2 bg-[#73991C]/5 rounded-lg text-sm font-medium text-[#172E08] h-9 flex items-center">
                              {formatCurrency(subtotal)}
                            </div>
                          </div>

                          {/* Botón Eliminar */}
                          <div className="md:col-span-1 flex items-end">
                            {purchaseItems.length > 1 && (
                              <Button
                                type="button"
                                onClick={() => removeItem(item.id)}
                                size="sm"
                                variant="ghost"
                                className="h-9 w-9 p-0 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Segunda fila: Campos adicionales */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                          {/* Lote */}
                          <div className="md:col-span-3">
                            <Label className="text-xs text-[#4D240F]/70 mb-1">
                              Lote
                            </Label>
                            <Input
                              type="text"
                              placeholder="Ej: L-2025-001"
                              value={item.lote_producto}
                              onChange={(e) =>
                                updateItem(item.id, 'lote_producto', e.target.value)
                              }
                              className="border-[#73991C]/20 focus:border-[#73991C] rounded-lg text-sm h-9"
                            />
                          </div>

                          {/* Fecha Vencimiento */}
                          <div className="md:col-span-3">
                            <Label className="text-xs text-[#4D240F]/70 mb-1">
                              Fecha Vencimiento
                            </Label>
                            <Input
                              type="date"
                              value={item.fecha_vencimiento}
                              onChange={(e) =>
                                updateItem(item.id, 'fecha_vencimiento', e.target.value)
                              }
                              className="border-[#73991C]/20 focus:border-[#73991C] rounded-lg text-sm h-9"
                            />
                          </div>

                          {/* Permitido por Gerencia */}
                          <div className="md:col-span-6">
                            <Label className="text-xs text-[#4D240F]/70 mb-1">
                              Permitido por Gerencia *
                            </Label>
                            <div className="flex items-center gap-4 h-9">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`pg-${item.id}`}
                                  checked={item.permitido_gerencia === true}
                                  onChange={() => updateItem(item.id, 'permitido_gerencia', true)}
                                  className="w-4 h-4 text-[#73991C] focus:ring-[#73991C]"
                                />
                                <span className="text-sm text-[#172E08]">Sí</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`pg-${item.id}`}
                                  checked={item.permitido_gerencia === false}
                                  onChange={() => updateItem(item.id, 'permitido_gerencia', false)}
                                  className="w-4 h-4 text-[#73991C] focus:ring-[#73991C]"
                                />
                                <span className="text-sm text-[#172E08]">No</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total */}
                <div className="mt-4 pt-4 border-t border-[#73991C]/10">
                  <div className="flex justify-between items-center">
                    <span className="text-[#172E08]">Total General:</span>
                    <span className="text-[#73991C]">
                      {formatCurrency(calculateTotal())}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/inventario')}
                  className="rounded-xl border-[#73991C]/20 hover:bg-[#E7EDDD]/50"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-gradient-to-r from-[#73991C] to-[#BFD97D] hover:from-[#5f7d17] hover:to-[#a8c96d] text-white rounded-xl shadow-lg shadow-[#73991C]/20"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    'Registrar Compra'
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* Panel de Resumen - 1 columna */}
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-[#F8FAF5] to-[#BFD97D]/20 rounded-2xl p-6 border-2 border-[#BFD97D] shadow-sm sticky top-6">
              <h3 className="text-[#172E08] mb-4 flex items-center gap-2">
                📊 Resumen de Compra
              </h3>

              <div className="space-y-4">
                {/* Información General */}
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#4D240F]/70">Proveedor:</span>
                      <span className="font-medium text-[#172E08]">
                        {purchaseData.proveedor || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#4D240F]/70">Factura:</span>
                      <span className="font-medium text-[#172E08]">
                        {purchaseData.numero_factura || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#4D240F]/70">Fecha:</span>
                      <span className="font-medium text-[#172E08]">
                        {new Date(purchaseData.fecha).toLocaleDateString('es-CO')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Productos */}
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4">
                  <p className="text-sm text-[#4D240F]/70 mb-2">Productos en Compra</p>
                  <p className="text-3xl font-bold text-[#73991C]">{purchaseItems.length}</p>
                </div>

                {/* Total */}
                <div className="bg-gradient-to-br from-[#73991C] to-[#5f7d17] rounded-xl p-4">
                  <p className="text-sm text-white/80 mb-1">Valor Total</p>
                  <p className="text-2xl font-bold text-white">
                    {formatCurrency(calculateTotal())}
                  </p>
                </div>

                {/* Lista de Productos Seleccionados */}
                {purchaseItems.some(item => item.producto_id) && (
                  <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4">
                    <p className="text-sm font-medium text-[#172E08] mb-3">
                      Productos Seleccionados:
                    </p>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {purchaseItems.map((item, index) => {
                        if (!item.producto_id) return null;
                        const product = getProduct(item.producto_id);
                        if (!product) return null;

                        return (
                          <div
                            key={item.id}
                            className="text-xs bg-[#F8FAF5] rounded-lg p-3 border border-[#73991C]/10"
                          >
                            <div className="flex items-start justify-between mb-1">
                              <span className="font-medium text-[#172E08] flex-1">
                                {index + 1}. {product.nombre}
                              </span>
                              <span className={`text-xs font-medium ml-2 ${
                                item.permitido_gerencia === true 
                                  ? 'text-green-600' 
                                  : item.permitido_gerencia === false 
                                  ? 'text-red-600' 
                                  : 'text-gray-400'
                              }`}>
                                PG: {
                                  item.permitido_gerencia === true ? '✅ Sí' :
                                  item.permitido_gerencia === false ? '❌ No' :
                                  '⚠️ Sin definir'
                                }
                              </span>
                            </div>
                            {item.cantidad && (
                              <p className="text-[#4D240F]/60">
                                Cantidad: {item.cantidad} {product.unidad_medida}
                              </p>
                            )}
                            {item.precio_unitario && (
                              <p className="text-[#4D240F]/60">
                                Precio: {formatCurrency(parseFloat(item.precio_unitario))}
                              </p>
                            )}
                            {item.cantidad && item.precio_unitario && (
                              <p className="text-[#73991C] font-medium mt-1">
                                Subtotal: {formatCurrency(calculateSubtotal(item))}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Diálogo de Confirmación */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="Confirmar Registro de Compra"
        message={`¿Confirma el registro de compra con ${purchaseItems.length} producto(s) por un valor total de ${formatCurrency(calculateTotal())}?\n\nProveedor: ${purchaseData.proveedor}\nFactura: ${purchaseData.numero_factura}`}
        confirmText="Sí, Registrar Compra"
        cancelText="Cancelar"
        type="success"
        onConfirm={confirmPurchase}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </div>
  );
}