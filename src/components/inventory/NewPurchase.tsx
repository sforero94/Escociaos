import { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../shared/Toast';
import { InventorySubNav } from './InventorySubNav';
import {
  Package,
  Search,
  Plus,
  Trash2,
  Calculator,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
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
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

// ============================================
// INTERFACES
// ============================================

interface Producto {
  id: string;
  nombre: string;
  presentacion_kg_l: number | null;
  unidad_medida: string;
  categoria: string;
  precio_unitario: number | null;
  cantidad_actual: number;
  activo: boolean;
}

interface ProductoCompra {
  id: string; // ID temporal para React
  producto_id: string;
  producto_nombre: string;
  
  // Presentación comercial (editable)
  presentacion_cantidad: number;
  presentacion_unidad: string;
  
  // Campos de entrada del usuario
  cantidad_bultos: number;
  precio_por_bulto: number;
  
  // Campos calculados automáticamente
  cantidad_total: number;
  costo_total: number;
  precio_unitario_real: number;
  
  // Trazabilidad (opcional)
  numero_lote: string;
  fecha_vencimiento: string;
  permitido_gerencia: boolean | null;
}

interface DatosCompra {
  fecha: string;
  proveedor: string;
  numero_factura: string;
  link_factura: string;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function NewPurchase({ onSuccess }: { onSuccess?: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError, showWarning, showInfo, ToastContainer } = useToast();

  // Estados principales
  const [datosCompra, setDatosCompra] = useState<DatosCompra>({
    fecha: new Date().toISOString().split('T')[0],
    proveedor: '',
    numero_factura: '',
    link_factura: '',
  });

  const [productosDisponibles, setProductosDisponibles] = useState<Producto[]>([]);
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [productosCompra, setProductosCompra] = useState<ProductoCompra[]>([]);
  const [mostrandoExito, setMostrandoExito] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // ============================================
  // EFECTOS
  // ============================================

  // Cargar productos disponibles al montar
  useEffect(() => {
    cargarProductos();
  }, []);

  // ============================================
  // FUNCIONES - CARGA DE DATOS
  // ============================================

  const cargarProductos = async () => {
    try {
      const { data, error } = await getSupabase()
        .from('productos')
        .select('id, nombre, presentacion_kg_l, unidad_medida, categoria, precio_unitario, cantidad_actual, activo')
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;
      setProductosDisponibles(data || []);
    } catch (err: any) {
      console.error('Error cargando productos:', err);
      showError('❌ Error al cargar productos');
    }
  };

  // ============================================
  // FUNCIONES - FILTRADO Y BÚSQUEDA
  // ============================================

  const productosFiltrados = productosDisponibles.filter((producto) =>
    producto.nombre.toLowerCase().includes(terminoBusqueda.toLowerCase())
  );

  // ============================================
  // FUNCIONES - GESTIÓN DE PRODUCTOS EN COMPRA
  // ============================================

  const agregarProductoVacio = () => {
    const nuevoProducto: ProductoCompra = {
      id: `temp-${Date.now()}`,
      producto_id: '',
      producto_nombre: '',
      presentacion_cantidad: 0,
      presentacion_unidad: 'kg',
      cantidad_bultos: 1,
      precio_por_bulto: 0,
      cantidad_total: 0,
      costo_total: 0,
      precio_unitario_real: 0,
      numero_lote: '',
      fecha_vencimiento: '',
      permitido_gerencia: null,
    };

    setProductosCompra([...productosCompra, nuevoProducto]);
    showInfo('➕ Producto agregado. Selecciona uno de la lista');
  };

  const eliminarProducto = (id: string) => {
    if (productosCompra.length <= 1) {
      showWarning('⚠️ Debe mantener al menos un producto');
      return;
    }
    setProductosCompra(productosCompra.filter((p) => p.id !== id));
    showInfo('🗑️ Producto eliminado');
  };

  const seleccionarProducto = (itemId: string, productoId: string) => {
    const productoSeleccionado = productosDisponibles.find((p) => p.id === productoId);
    if (!productoSeleccionado) return;

    setProductosCompra(
      productosCompra.map((item) => {
        if (item.id !== itemId) return item;

        // Auto-rellenar con datos del producto
        const presentacionCantidad = productoSeleccionado.presentacion_kg_l || 1;
        const presentacionUnidad = productoSeleccionado.unidad_medida || 'kg';
        const precioPorBulto = productoSeleccionado.precio_unitario || 0;

        return {
          ...item,
          producto_id: productoId,
          producto_nombre: productoSeleccionado.nombre,
          presentacion_cantidad: presentacionCantidad,
          presentacion_unidad: presentacionUnidad,
          precio_por_bulto: precioPorBulto,
        };
      })
    );

    // Recalcular inmediatamente
    setTimeout(() => recalcularProducto(itemId), 100);
  };

  const actualizarCampo = (itemId: string, campo: string, valor: any) => {
    setProductosCompra(
      productosCompra.map((item) => {
        if (item.id !== itemId) return item;
        return { ...item, [campo]: valor };
      })
    );

    // Si es un campo que afecta cálculos, recalcular
    if (['presentacion_cantidad', 'presentacion_unidad', 'cantidad_bultos', 'precio_por_bulto'].includes(campo)) {
      setTimeout(() => recalcularProducto(itemId), 100);
    }
  };

  // ============================================
  // FUNCIÓN CLAVE: CÁLCULOS AUTOMÁTICOS
  // ============================================

  const recalcularProducto = (itemId: string) => {
    setProductosCompra((items) =>
      items.map((item) => {
        if (item.id !== itemId) return item;

        const cantidadBultos = Number(item.cantidad_bultos) || 0;
        const precioPorBulto = Number(item.precio_por_bulto) || 0;
        const presentacionCantidad = Number(item.presentacion_cantidad) || 0;

        // Validar valores
        if (cantidadBultos <= 0 || precioPorBulto <= 0 || presentacionCantidad <= 0) {
          return {
            ...item,
            cantidad_total: 0,
            costo_total: 0,
            precio_unitario_real: 0,
          };
        }

        // CÁLCULO 1: Total kg/L = cantidad_bultos × presentacion_cantidad
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
        };
      })
    );
  };

  // ============================================
  // FUNCIONES - VALIDACIÓN Y GUARDADO
  // ============================================

  const validarFormulario = (): boolean => {
    // Validar datos generales
    if (!datosCompra.proveedor.trim()) {
      showError('❌ El proveedor es obligatorio');
      return false;
    }

    if (!datosCompra.numero_factura.trim()) {
      showError('❌ El número de factura es obligatorio');
      return false;
    }

    // Validar que haya al menos un producto
    if (productosCompra.length === 0) {
      showError('❌ Debe agregar al menos un producto');
      return false;
    }

    // Validar cada producto
    for (let i = 0; i < productosCompra.length; i++) {
      const item = productosCompra[i];
      const num = i + 1;

      if (!item.producto_id) {
        showError(`❌ Producto ${num}: Debe seleccionar un producto`);
        return false;
      }

      if (!item.presentacion_cantidad || item.presentacion_cantidad <= 0) {
        showError(`❌ Producto ${num}: La presentación debe ser mayor a 0`);
        return false;
      }

      if (!item.cantidad_bultos || item.cantidad_bultos <= 0) {
        showError(`❌ Producto ${num}: Debe especificar cuántos bultos compró`);
        return false;
      }

      if (!item.precio_por_bulto || item.precio_por_bulto <= 0) {
        showError(`❌ Producto ${num}: El precio por bulto debe ser mayor a 0`);
        return false;
      }

      if (item.permitido_gerencia === null) {
        showError(`❌ Producto ${num}: Debe marcar "Permitido por Gerencia" (requerido por GlobalGAP)`);
        return false;
      }
    }

    return true;
  };

  const guardarCompra = async () => {
    if (!validarFormulario()) return;

    setGuardando(true);
    showInfo('💾 Guardando compra...');

    try {
      // Para cada producto, registrar la compra
      for (const item of productosCompra) {
        const productoData = productosDisponibles.find((p) => p.id === item.producto_id);
        if (!productoData) continue;

        const cantidadAnterior = productoData.cantidad_actual || 0;
        const cantidadNueva = cantidadAnterior + item.cantidad_total;

        // 1. Insertar en tabla compras
        const { error: compraError } = await getSupabase().from('compras').insert([
          {
            fecha_compra: datosCompra.fecha,
            proveedor: datosCompra.proveedor,
            numero_factura: datosCompra.numero_factura,
            producto_id: item.producto_id,
            cantidad: item.cantidad_total,
            unidad: item.presentacion_unidad,
            numero_lote_producto: item.numero_lote || null,
            fecha_vencimiento: item.fecha_vencimiento || null,
            costo_unitario: item.precio_unitario_real,
            costo_total: item.costo_total,
            link_factura: datosCompra.link_factura || null,
            usuario_registro: user?.email || null,
          },
        ]);

        if (compraError) throw compraError;

        // 2. Actualizar cantidad en productos
        const { error: updateError } = await getSupabase()
          .from('productos')
          .update({
            cantidad_actual: cantidadNueva,
            precio_unitario: item.precio_unitario_real,
            // REGLA DE NEGOCIO: Si el producto está inactivo y ahora tiene cantidad > 0, activarlo automáticamente
            activo: cantidadNueva > 0 ? true : productoData.activo,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.producto_id);

        if (updateError) throw updateError;

        // 3. Crear movimiento de inventario
        const { error: movimientoError } = await getSupabase()
          .from('movimientos_inventario')
          .insert([
            {
              fecha_movimiento: datosCompra.fecha,
              producto_id: item.producto_id,
              tipo_movimiento: 'Entrada',
              cantidad: item.cantidad_total,
              unidad: item.presentacion_unidad,
              factura: datosCompra.numero_factura,
              saldo_anterior: cantidadAnterior,
              saldo_nuevo: cantidadNueva,
              valor_movimiento: item.costo_total,
              responsable: user?.email || null,
              observaciones: `Compra - Factura: ${datosCompra.numero_factura} - Proveedor: ${datosCompra.proveedor} - ${item.cantidad_bultos} bultos de ${item.presentacion_cantidad} ${item.presentacion_unidad}`,
              provisional: false,
            },
          ]);

        if (movimientoError) throw movimientoError;
      }

      showSuccess(`✅ Compra registrada exitosamente: ${productosCompra.length} producto(s)`);
      showInfo('📊 Inventario actualizado automáticamente');

      setMostrandoExito(true);
      setTimeout(() => {
        navigate('/inventario/movimientos');
      }, 2000);

      // Llamar a la función de éxito si está definida
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Error guardando compra:', err);
      showError(`❌ Error al guardar: ${err.message || 'Intente nuevamente'}`);
    } finally {
      setGuardando(false);
    }
  };

  // ============================================
  // HELPERS - FORMATEO
  // ============================================

  const formatearPesos = (valor: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(valor);
  };

  const calcularTotalGeneral = (): number => {
    return productosCompra.reduce((sum, item) => sum + (item.costo_total || 0), 0);
  };

  // ============================================
  // RENDER - VISTA DE ÉXITO
  // ============================================

  if (mostrandoExito) {
    return (
      <div className="space-y-6">
        <InventorySubNav />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/20 rounded-2xl mb-4 shadow-lg">
              <CheckCircle className="w-10 h-10 text-[#73991C]" />
            </div>
            <h2 className="text-[#172E08] mb-2">¡Compra registrada con éxito!</h2>
            <p className="text-[#4D240F]/70">
              Se han registrado {productosCompra.length} producto(s) correctamente
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER - FORMULARIO PRINCIPAL
  // ============================================

  return (
    <div className="space-y-6">
      <ToastContainer />
      <InventorySubNav />

      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* COLUMNA PRINCIPAL - Formulario */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-[#172E08] mb-2">Nueva Compra</h1>
              <p className="text-[#4D240F]/70">Registra una nueva compra de productos</p>
            </div>

            {/* SECCIÓN 1: Información General */}
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
                    value={datosCompra.fecha}
                    onChange={(e) => setDatosCompra({ ...datosCompra, fecha: e.target.value })}
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
                    value={datosCompra.proveedor}
                    onChange={(e) => setDatosCompra({ ...datosCompra, proveedor: e.target.value })}
                    className="border-[#73991C]/20 focus:border-[#73991C] rounded-xl h-12"
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
                    value={datosCompra.numero_factura}
                    onChange={(e) =>
                      setDatosCompra({ ...datosCompra, numero_factura: e.target.value })
                    }
                    className="border-[#73991C]/20 focus:border-[#73991C] rounded-xl h-12"
                    required
                  />
                </div>
              </div>

              <div className="mt-4">
                <Label htmlFor="link_factura" className="text-[#172E08] mb-2">
                  Link a Factura Digital (opcional)
                </Label>
                <Input
                  id="link_factura"
                  type="url"
                  placeholder="URL de Google Drive o similar"
                  value={datosCompra.link_factura}
                  onChange={(e) => setDatosCompra({ ...datosCompra, link_factura: e.target.value })}
                  className="border-[#73991C]/20 focus:border-[#73991C] rounded-xl h-12"
                />
              </div>
            </div>

            {/* SECCIÓN 2: Búsqueda y Selección de Productos */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-[#73991C]/10 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#172E08] flex items-center gap-2">
                  <Package className="w-5 h-5 text-[#73991C]" />
                  Productos ({productosCompra.length})
                </h3>
              </div>

              {/* Lista de productos en la compra */}
              <div className="space-y-4">
                {productosCompra.length === 0 ? (
                  <div className="text-center py-8 text-[#4D240F]/60">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>No hay productos agregados</p>
                    <p className="text-sm mb-4">Haz clic en "Agregar Producto" para comenzar</p>
                    <Button
                      type="button"
                      onClick={agregarProductoVacio}
                      className="bg-[#73991C] hover:bg-[#5a7516] text-white"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Agregar Producto
                    </Button>
                  </div>
                ) : (
                  <>
                    {productosCompra.map((item, index) => (
                      <TarjetaProducto
                        key={item.id}
                        item={item}
                        index={index}
                        productosFiltrados={productosFiltrados}
                        onSeleccionarProducto={seleccionarProducto}
                        onActualizarCampo={actualizarCampo}
                        onEliminar={eliminarProducto}
                        formatearPesos={formatearPesos}
                      />
                    ))}
                    
                    {/* Botón agregar debajo de los productos */}
                    <div className="flex justify-center pt-2">
                      <Button
                        type="button"
                        onClick={agregarProductoVacio}
                        className="bg-[#73991C] hover:bg-[#5a7516] text-white"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Agregar Producto
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-4 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/inventario')}
                className="border-[#73991C]/20"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={guardarCompra}
                disabled={guardando || productosCompra.length === 0}
                className="bg-[#4D240F] hover:bg-[#4D240F]/90 text-white"
              >
                {guardando ? 'Guardando...' : 'Registrar Compra'}
              </Button>
            </div>
          </div>

          {/* COLUMNA LATERAL - Panel de Resumen */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-[#73991C]/10 shadow-sm">
              <h3 className="text-[#172E08] mb-4 font-semibold">💰 Resumen de Compra</h3>

              <div className="space-y-4">
                {/* Info general */}
                {datosCompra.proveedor && (
                  <div>
                    <p className="text-xs text-[#4D240F]/60">Proveedor</p>
                    <p className="font-medium text-[#172E08]">{datosCompra.proveedor}</p>
                  </div>
                )}

                {datosCompra.numero_factura && (
                  <div>
                    <p className="text-xs text-[#4D240F]/60">Factura</p>
                    <p className="font-medium text-[#172E08]">{datosCompra.numero_factura}</p>
                  </div>
                )}

                {/* Total */}
                <div className="pt-4 border-t border-[#73991C]/20">
                  <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/20 rounded-xl p-4">
                    <p className="text-sm text-[#172E08]/70 mb-1">Total General</p>
                    <p className="text-2xl font-bold text-[#73991C]">
                      {formatearPesos(calcularTotalGeneral())}
                    </p>
                  </div>
                </div>

                {/* Lista de productos */}
                {productosCompra.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-[#172E08] mb-2">
                      Productos ({productosCompra.length})
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {productosCompra.map((item, idx) => (
                        <div
                          key={item.id}
                          className="text-sm bg-[#F5F5DC]/50 rounded-lg p-2"
                        >
                          <p className="font-medium text-[#172E08]">
                            {item.producto_nombre || `Producto ${idx + 1}`}
                          </p>
                          {item.cantidad_total > 0 && (
                            <p className="text-xs text-[#4D240F]/70">
                              {item.cantidad_total.toFixed(2)} {item.presentacion_unidad} •{' '}
                              {formatearPesos(item.costo_total)}
                            </p>
                          )}
                          {item.permitido_gerencia && (
                            <p className="text-xs text-green-600">✓ Permitido Gerencia</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Info GlobalGAP */}
                <div className="pt-4 border-t border-[#73991C]/20">
                  <div className="flex gap-2 text-xs text-[#4D240F]/60">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <p>
                      El campo "Permitido por Gerencia" es obligatorio para cumplimiento GlobalGAP
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// SUBCOMPONENTE: TARJETA DE PRODUCTO
// ============================================

interface TarjetaProductoProps {
  item: ProductoCompra;
  index: number;
  productosFiltrados: Producto[];
  onSeleccionarProducto: (itemId: string, productoId: string) => void;
  onActualizarCampo: (itemId: string, campo: string, valor: any) => void;
  onEliminar: (itemId: string) => void;
  formatearPesos: (valor: number) => string;
}

const TarjetaProducto: React.FC<TarjetaProductoProps> = ({
  item,
  index,
  productosFiltrados,
  onSeleccionarProducto,
  onActualizarCampo,
  onEliminar,
  formatearPesos,
}) => {
  return (
    <div className="relative bg-white border-2 border-[#73991C]/10 rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
      {/* Botón eliminar */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onEliminar(item.id)}
        className="absolute top-2 right-2 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="w-4 h-4" />
      </Button>

      <div className="space-y-4 pr-8">
        {/* Número de producto */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#73991C]/10 flex items-center justify-center text-xs font-bold text-[#73991C]">
            {index + 1}
          </div>
          <span className="text-sm text-[#4D240F]/60">Producto #{index + 1}</span>
        </div>

        {/* FILA 1: Selector de Producto */}
        <div>
          <Label className="text-sm text-[#172E08] mb-2">Producto *</Label>
          <Select
            value={item.producto_id}
            onValueChange={(value) => onSeleccionarProducto(item.id, value)}
          >
            <SelectTrigger className="h-12 border-[#73991C]/20">
              <SelectValue placeholder="Seleccionar producto..." />
            </SelectTrigger>
            <SelectContent>
              {productosFiltrados.map((producto) => (
                <SelectItem key={producto.id} value={producto.id}>
                  {producto.nombre}
                  {producto.presentacion_kg_l && (
                    <span className="text-[#4D240F]/60 ml-2">
                      ({producto.presentacion_kg_l} {producto.unidad_medida})
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* FILA 2: Presentación Comercial EDITABLE */}
        <div>
          <Label className="text-sm text-[#172E08] mb-2">
            Presentación de esta compra
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="25"
              value={item.presentacion_cantidad || ''}
              onChange={(e) =>
                onActualizarCampo(item.id, 'presentacion_cantidad', parseFloat(e.target.value) || 0)
              }
              className="h-12 text-lg border-[#73991C]/20"
            />
            <Select
              value={item.presentacion_unidad}
              onValueChange={(value) => onActualizarCampo(item.id, 'presentacion_unidad', value)}
            >
              <SelectTrigger className="h-12 border-[#73991C]/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kg">Kilogramos (kg)</SelectItem>
                <SelectItem value="L">Litros (L)</SelectItem>
                <SelectItem value="unidad">Unidades</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-[#4D240F]/60 mt-1">
            Si la presentación cambió, edítala aquí
          </p>
        </div>

        {/* FILA 3: ¿Cuántos bultos? */}
        <div>
          <Label className="text-sm text-[#172E08] font-medium mb-2">
            ¿Cuántos bultos/tarros compraste? *
          </Label>
          <Input
            type="number"
            min="1"
            placeholder="Ej: 4"
            value={item.cantidad_bultos || ''}
            onChange={(e) =>
              onActualizarCampo(item.id, 'cantidad_bultos', parseInt(e.target.value) || 0)
            }
            className="h-14 text-xl font-semibold border-2 border-[#73991C]/30 focus:border-[#73991C]"
            required
          />
        </div>

        {/* FILA 4: Precio por bulto */}
        <div>
          <Label className="text-sm text-[#172E08] font-medium mb-2">
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
              onChange={(e) =>
                onActualizarCampo(item.id, 'precio_por_bulto', parseFloat(e.target.value) || 0)
              }
              className="h-14 text-xl font-semibold pl-8 border-2 border-[#73991C]/30 focus:border-[#73991C]"
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
                  Total {item.presentacion_unidad}:
                </span>
                <span className="text-lg font-bold text-[#73991C]">
                  {item.cantidad_total.toFixed(2)} {item.presentacion_unidad}
                </span>
              </div>

              {/* Costo Total */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#172E08]">Costo Total:</span>
                <span className="text-xl font-bold text-[#172E08]">
                  {formatearPesos(item.costo_total)}
                </span>
              </div>

              {/* Precio Unitario Real */}
              <div className="flex justify-between items-center pt-2 border-t border-[#73991C]/20">
                <span className="text-xs text-[#4D240F]/70">Precio unitario real:</span>
                <span className="text-sm font-medium text-[#4D240F]/70">
                  {formatearPesos(item.precio_unitario_real)}/{item.presentacion_unidad}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* FILA 6: Trazabilidad y GlobalGAP - SIEMPRE VISIBLES */}
        <div className="space-y-3 pt-3 border-t border-[#73991C]/10">
          <h4 className="text-sm font-medium text-[#172E08] flex items-center gap-2">
            <Package className="w-4 h-4 text-[#73991C]" />
            Trazabilidad y GlobalGAP
          </h4>
          
          {/* Número de Lote */}
          <div>
            <Label className="text-sm text-[#172E08]">Número de Lote</Label>
            <Input
              type="text"
              placeholder="Ej: L-2025-001"
              value={item.numero_lote}
              onChange={(e) => onActualizarCampo(item.id, 'numero_lote', e.target.value)}
              className="h-10 border-[#73991C]/20"
            />
          </div>

          {/* Fecha de Vencimiento */}
          <div>
            <Label className="text-sm text-[#172E08]">Fecha de Vencimiento</Label>
            <Input
              type="date"
              value={item.fecha_vencimiento}
              onChange={(e) => onActualizarCampo(item.id, 'fecha_vencimiento', e.target.value)}
              className="h-10 border-[#73991C]/20"
            />
          </div>

          {/* Permitido por Gerencia */}
          <div className="space-y-2">
            <Label className="text-sm text-[#172E08] font-medium">
              Permitido por Gerencia *{' '}
              <span className="text-xs font-normal text-[#4D240F]/60">(GlobalGAP)</span>
            </Label>
            <RadioGroup
              value={item.permitido_gerencia === null ? '' : item.permitido_gerencia ? 'si' : 'no'}
              onValueChange={(value) =>
                onActualizarCampo(item.id, 'permitido_gerencia', value === 'si')
              }
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="si" id={`pg-si-${item.id}`} />
                <Label htmlFor={`pg-si-${item.id}`} className="cursor-pointer">
                  Sí
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id={`pg-no-${item.id}`} />
                <Label htmlFor={`pg-no-${item.id}`} className="cursor-pointer">
                  No
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewPurchase;