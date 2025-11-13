import { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle, Package, Loader2, Search, Calculator, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { getSupabase } from '../../utils/supabase/client';
import { InventoryNav } from './InventoryNav';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../shared/Toast';
import { ConfirmDialog } from '../shared/ConfirmDialog';

// VERSION 2.0 - Placeholders grises, selector de unidades funcional, un solo buscador

interface NewPurchaseProps {
  onNavigate?: (view: string) => void;
}

interface Product {
  id: number;
  nombre: string;
  unidad_medida: string;
  precio_unitario: number;
  cantidad_actual: number;
  presentacion_kg_l?: number;
}

interface PurchaseItem {
  id: string; // ID temporal para React keys
  producto_id: string;
  producto_nombre: string;
  
  // NUEVOS CAMPOS
  presentacion_cantidad: number;      // Ej: 25
  presentacion_unidad: string;        // Ej: 'kg' | 'L' | 'unidad'
  cantidad_bultos: number;            // Ej: 4
  precio_por_bulto: number;           // Ej: 50000
  
  // CAMPOS CALCULADOS
  cantidad_total: number;             // = cantidad_bultos × presentacion_cantidad
  costo_total: number;                // = cantidad_bultos × precio_por_bulto
  precio_unitario_real: number;       // = costo_total ÷ cantidad_total
  
  // CAMPOS EXISTENTES
  cantidad: number;                   // Para BD = cantidad_total
  unidad: string;                     // Para BD = presentacion_unidad
  numero_lote: string;
  fecha_vencimiento: string;
  costo_unitario: number;             // Para BD = precio_unitario_real
  permitido_gerencia: boolean | null;
  subtotal: number;                   // Para BD = costo_total
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
      producto_nombre: '',
      presentacion_cantidad: 0,
      presentacion_unidad: 'kg',
      cantidad_bultos: 0,
      precio_por_bulto: 0,
      cantidad_total: 0,
      costo_total: 0,
      precio_unitario_real: 0,
      cantidad: 0,
      unidad: 'kg',
      numero_lote: '',
      fecha_vencimiento: '',
      costo_unitario: 0,
      permitido_gerencia: null,
      subtotal: 0,
    },
  ]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    
    let retries = 3;
    let delay = 1000;
    
    while (retries > 0) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('productos')
          .select('id, nombre, unidad_medida, precio_unitario, cantidad_actual, presentacion_kg_l')
          .eq('activo', true)
          .order('nombre');

        if (error) {
          console.error('Error en query productos:', error);
          throw error;
        }
        
        setProducts(data || []);
        console.log('✅ Productos cargados exitosamente:', data?.length || 0);
        return;
        
      } catch (err: any) {
        retries--;
        console.error(`Error cargando productos (intentos restantes: ${retries}):`, err);
        
        if (retries === 0) {
          showError(`❌ Error al cargar productos: ${err?.message || 'Error de conexión'}`);
          console.error('Error final cargando productos:', {
            message: err?.message,
            code: err?.code,
            details: err?.details,
            hint: err?.hint
          });
        } else {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
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
        producto_nombre: '',
        presentacion_cantidad: 0,
        presentacion_unidad: 'kg',
        cantidad_bultos: 0,
        precio_por_bulto: 0,
        cantidad_total: 0,
        costo_total: 0,
        precio_unitario_real: 0,
        cantidad: 0,
        unidad: 'kg',
        numero_lote: '',
        fecha_vencimiento: '',
        costo_unitario: 0,
        permitido_gerencia: null,
        subtotal: 0,
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
          
          // Si cambia el producto, cargar la presentación y precio
          if (field === 'producto_id' && value) {
            const product = products.find((p) => p.id === parseInt(value));
            if (product) {
              updated.producto_nombre = product.nombre;
              updated.presentacion_cantidad = product.presentacion_kg_l || 0;
              updated.presentacion_unidad = product.unidad_medida || 'kg';
              updated.unidad = product.unidad_medida || 'kg';
              updated.precio_por_bulto = product.precio_unitario || 0;
            }
          }
          
          return updated;
        }
        return item;
      })
    );
  };

  // FUNCIÓN DE CÁLCULO AUTOMÁTICO
  const recalcularProducto = (itemId: string) => {
    setPurchaseItems(items => items.map(item => {
      if (item.id !== itemId) return item;
      
      const cantidadBultos = item.cantidad_bultos || 0;
      const precioPorBulto = item.precio_por_bulto || 0;
      const presentacionCantidad = item.presentacion_cantidad || 0;
      
      // Validar que los valores sean válidos
      if (cantidadBultos <= 0 || precioPorBulto <= 0 || presentacionCantidad <= 0) {
        return {
          ...item,
          cantidad_total: 0,
          costo_total: 0,
          precio_unitario_real: 0,
          cantidad: 0,
          costo_unitario: 0,
          subtotal: 0
        };
      }
      
      // CÁLCULO 1: Total en kg/L = cantidad_bultos × presentacion_cantidad
      const cantidadTotal = cantidadBultos * presentacionCantidad;
      
      // CÁLCULO 2: Costo Total = cantidad_bultos × precio_por_bulto
      const costoTotal = cantidadBultos * precioPorBulto;
      
      // CÁLCULO 3: Precio Unitario Real = costo_total ÷ cantidad_total
      const precioUnitarioReal = costoTotal / cantidadTotal;
      
      return {
        ...item,
        cantidad_total: cantidadTotal,
        costo_total: costoTotal,
        precio_unitario_real: precioUnitarioReal,
        // Guardar también para la BD
        cantidad: cantidadTotal,
        costo_unitario: precioUnitarioReal,
        subtotal: costoTotal
      };
    }));
  };

  // Calcular total general
  const calculateTotal = (): number => {
    return purchaseItems.reduce((sum, item) => sum + (item.costo_total || 0), 0);
  };

  // Formatear moneda
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
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
      if (!item.presentacion_cantidad || item.presentacion_cantidad <= 0) {
        showError(`❌ ${item.producto_nombre}: Debe especificar la presentación comercial`);
        return false;
      }
      if (!item.cantidad_bultos || item.cantidad_bultos <= 0) {
        showError(`❌ ${item.producto_nombre}: Debe especificar cuántos bultos compró`);
        return false;
      }
      if (!item.precio_por_bulto || item.precio_por_bulto <= 0) {
        showError(`❌ ${item.producto_nombre}: Debe especificar el precio por bulto`);
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
      for (const item of purchaseItems) {
        const cantidad = item.cantidad_total;
        const precioUnitario = item.precio_unitario_real;
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

        // Insertar registro de compra
        const { data: compraData, error: compraError } = await supabase
          .from('compras')
          .insert([
            {
              fecha_compra: purchaseData.fecha,
              proveedor: purchaseData.proveedor,
              numero_factura: purchaseData.numero_factura || null,
              producto_id: productoId,
              cantidad: cantidad,
              unidad: item.presentacion_unidad,
              numero_lote_producto: item.numero_lote || null,
              fecha_vencimiento: item.fecha_vencimiento || null,
              costo_unitario: precioUnitario,
              costo_total: item.costo_total,
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
            precio_unitario: precioUnitario,
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
              tipo_movimiento: 'Entrada',
              cantidad: cantidad,
              unidad: item.presentacion_unidad,
              factura: purchaseData.numero_factura || null,
              saldo_anterior: cantidadAnterior,
              saldo_nuevo: cantidadNueva,
              valor_movimiento: item.costo_total,
              responsable: user?.email || null,
              observaciones: `Compra - ${item.cantidad_bultos} bultos de ${item.presentacion_cantidad} ${item.presentacion_unidad} - Factura: ${purchaseData.numero_factura || 'Sin número'} - Proveedor: ${purchaseData.proveedor}`,
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
                      className="border-[#73991C]/20 focus:border-[#73991C] rounded-xl h-12"
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
                      className="border-[#73991C]/20 focus:border-[#73991C] rounded-xl h-12 placeholder:text-gray-400"
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
                      className="border-[#73991C]/20 focus:border-[#73991C] rounded-xl h-12 placeholder:text-gray-400"
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
                    className="pl-10 border-[#73991C]/20 focus:border-[#73991C] rounded-xl h-12 placeholder:text-gray-400"
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

                <div className="space-y-4">
                  {purchaseItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="relative bg-white/80 backdrop-blur-sm rounded-2xl p-4 md:p-6 border border-[#73991C]/10 shadow-sm space-y-4"
                    >
                      {/* Botón eliminar - absolute top right */}
                      {purchaseItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.id)}
                          className="absolute top-2 right-2 hover:bg-red-50 hover:text-red-600 h-8 w-8"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {/* FILA 1: Selector de Producto */}
                      <div>
                        <Label className="text-sm text-[#172E08] mb-2">
                          Producto *
                        </Label>
                        <Select
                          value={item.producto_id}
                          onValueChange={(value) => updateItem(item.id, 'producto_id', value)}
                        >
                          <SelectTrigger className="h-12 border-[#73991C]/20 focus:border-[#73991C] rounded-xl">
                            <SelectValue placeholder="Seleccionar producto..." />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredProducts.map((producto) => (
                              <SelectItem key={producto.id} value={producto.id.toString()}>
                                {producto.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* FILA 2: Presentación Comercial EDITABLE */}
                      <div className="space-y-2">
                        <Label className="text-sm text-[#172E08]">
                          Presentación de esta compra
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="25"
                            value={item.presentacion_cantidad || ''}
                            onChange={(e) => {
                              updateItem(item.id, 'presentacion_cantidad', parseFloat(e.target.value) || 0);
                              recalcularProducto(item.id);
                            }}
                            className="h-12 text-lg border-[#73991C]/20 focus:border-[#73991C] rounded-xl bg-white placeholder:text-gray-400"
                          />
                          <Select
                            value={item.presentacion_unidad}
                            onValueChange={(value) => {
                              updateItem(item.id, 'presentacion_unidad', value);
                              updateItem(item.id, 'unidad', value);
                              recalcularProducto(item.id);
                            }}
                          >
                            <SelectTrigger className="h-12 border-[#73991C]/20 focus:border-[#73991C] rounded-xl bg-white">
                              <SelectValue placeholder="Seleccionar unidad" />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              <SelectItem value="kg">Kilogramos (kg)</SelectItem>
                              <SelectItem value="L">Litros (L)</SelectItem>
                              <SelectItem value="Galones">Galones</SelectItem>
                              <SelectItem value="unidad">Unidades</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-xs text-[#4D240F]/60">
                          Si la presentación cambió respecto al producto guardado, edítala aquí
                        </p>
                      </div>

                      {/* FILA 3: ¿Cuántos bultos/tarros compraste? */}
                      <div className="space-y-2">
                        <Label className="text-sm text-[#172E08] font-medium">
                          ¿Cuántos bultos/tarros compraste? *
                        </Label>
                        <Input
                          type="number"
                          min="1"
                          placeholder="Ej: 4"
                          value={item.cantidad_bultos || ''}
                          onChange={(e) => {
                            updateItem(item.id, 'cantidad_bultos', parseInt(e.target.value) || 0);
                            recalcularProducto(item.id);
                          }}
                          className="h-14 text-xl font-semibold border-2 border-[#73991C]/30 focus:border-[#73991C] rounded-xl bg-white placeholder:text-gray-400"
                          required
                        />
                      </div>

                      {/* FILA 4: Precio por bulto/tarro */}
                      <div className="space-y-2">
                        <Label className="text-sm text-[#172E08] font-medium">
                          Precio por bulto/tarro *
                        </Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#172E08] text-lg font-medium">
                            $
                          </span>
                          <Input
                            type="number"
                            min="0"
                            placeholder="50000"
                            value={item.precio_por_bulto || ''}
                            onChange={(e) => {
                              updateItem(item.id, 'precio_por_bulto', parseFloat(e.target.value) || 0);
                              recalcularProducto(item.id);
                            }}
                            className="h-14 text-xl font-semibold pl-8 border-2 border-[#73991C]/30 focus:border-[#73991C] rounded-xl bg-white placeholder:text-gray-400"
                            required
                          />
                        </div>
                      </div>

                      {/* FILA 5: Cálculos Automáticos */}
                      {item.cantidad_total > 0 && (
                        <div className="bg-[#F5F5DC] rounded-xl p-4 space-y-3 border border-[#73991C]/20">
                          <div className="flex items-center gap-2 mb-2">
                            <Calculator className="w-4 h-4 text-[#73991C]" />
                            <span className="text-xs font-medium text-[#172E08]/70 uppercase tracking-wide">
                              Cálculo Automático
                            </span>
                          </div>
                          
                          <div className="space-y-2">
                            {/* Total kg/L */}
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-[#172E08]">
                                Total {item.presentacion_unidad || 'kg'}:
                              </span>
                              <span className="text-lg font-bold text-[#73991C]">
                                {(item.cantidad_total || 0).toFixed(2)} {item.presentacion_unidad || 'kg'}
                              </span>
                            </div>
                            
                            {/* Costo Total */}
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-[#172E08]">
                                Costo Total:
                              </span>
                              <span className="text-xl font-bold text-[#172E08]">
                                {formatCurrency(item.costo_total || 0)}
                              </span>
                            </div>
                            
                            {/* Precio Unitario Real */}
                            <div className="flex justify-between items-center pt-2 border-t border-[#73991C]/20">
                              <span className="text-xs text-[#4D240F]/70">
                                Precio unitario real:
                              </span>
                              <span className="text-sm font-medium text-[#4D240F]/70">
                                {formatCurrency(item.precio_unitario_real || 0)}/{item.presentacion_unidad || 'kg'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* FILA 6: Detalles Adicionales (Colapsable) */}
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-[#73991C] hover:text-[#172E08] transition-colors">
                          <ChevronDown className="w-4 h-4" />
                          Más detalles (lote, vencimiento)
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-3 mt-3 pt-3 border-t border-[#73991C]/10">
                          {/* Número de Lote */}
                          <div>
                            <Label className="text-sm text-[#172E08]">Número de Lote</Label>
                            <Input
                              type="text"
                              placeholder="Ej: L-2025-001"
                              value={item.numero_lote || ''}
                              onChange={(e) => updateItem(item.id, 'numero_lote', e.target.value)}
                              className="h-10 border-[#73991C]/20 focus:border-[#73991C] rounded-xl mt-1"
                            />
                          </div>
                          
                          {/* Fecha de Vencimiento */}
                          <div>
                            <Label className="text-sm text-[#172E08]">Fecha de Vencimiento</Label>
                            <Input
                              type="date"
                              value={item.fecha_vencimiento || ''}
                              onChange={(e) => updateItem(item.id, 'fecha_vencimiento', e.target.value)}
                              className="h-10 border-[#73991C]/20 focus:border-[#73991C] rounded-xl mt-1"
                            />
                          </div>
                          
                          {/* Permitido por Gerencia */}
                          <div className="space-y-2">
                            <Label className="text-sm text-[#172E08] font-medium">
                              Permitido por Gerencia *
                            </Label>
                            <div className="flex gap-4">
                              <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`pg-${item.id}`}
                                  checked={item.permitido_gerencia === true}
                                  onChange={() => updateItem(item.id, 'permitido_gerencia', true)}
                                  className="w-4 h-4 text-[#73991C] focus:ring-[#73991C]"
                                />
                                <span className="text-sm text-[#172E08]">Sí</span>
                              </label>
                              <label className="flex items-center space-x-2 cursor-pointer">
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
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  ))}
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

              {/* Botones finales */}
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/inventario')}
                  className="flex-1 border-[#73991C]/20 hover:bg-[#73991C]/5 rounded-xl h-12"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving || purchaseItems.length === 0}
                  className="flex-1 bg-[#73991C] hover:bg-[#5f7d17] text-white rounded-xl h-12"
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

          {/* Panel lateral de resumen */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 bg-gradient-to-br from-[#F8FAF5] to-[#BFD97D]/20 rounded-2xl p-6 border border-[#73991C]/20 shadow-lg">
              <h3 className="text-[#172E08] mb-4">Resumen</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[#4D240F]/70">Productos:</span>
                  <span className="text-[#172E08] font-medium">{purchaseItems.length}</span>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span className="text-[#4D240F]/70">Proveedor:</span>
                  <span className="text-[#172E08] font-medium truncate max-w-[150px]">
                    {purchaseData.proveedor || '-'}
                  </span>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span className="text-[#4D240F]/70">Factura:</span>
                  <span className="text-[#172E08] font-medium">
                    {purchaseData.numero_factura || '-'}
                  </span>
                </div>
                
                <div className="border-t border-[#73991C]/20 pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[#172E08]">Total:</span>
                    <span className="text-[#73991C] text-xl">
                      {formatCurrency(calculateTotal())}
                    </span>
                  </div>
                </div>
                
                {purchaseItems.some(item => item.cantidad_total > 0) && (
                  <div className="bg-[#73991C]/10 rounded-xl p-3 mt-4">
                    <p className="text-xs text-[#172E08] mb-2">Detalles:</p>
                    <div className="space-y-1">
                      {purchaseItems.filter(item => item.cantidad_total > 0).map((item) => (
                        <div key={item.id} className="text-xs text-[#4D240F]/80">
                          <span className="font-medium">{item.producto_nombre || 'Producto'}:</span>{' '}
                          {item.cantidad_bultos} bultos × {item.presentacion_cantidad} {item.presentacion_unidad} = {item.cantidad_total.toFixed(2)} {item.presentacion_unidad}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Diálogo de confirmación */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={confirmPurchase}
        title="Confirmar Compra"
        message={`¿Está seguro de registrar esta compra de ${purchaseItems.length} producto(s) por un total de ${formatCurrency(calculateTotal())}?`}
        confirmText="Sí, registrar"
        cancelText="Cancelar"
      />
    </div>
  );
}