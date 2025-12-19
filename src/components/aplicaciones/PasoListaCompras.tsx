import { useState, useEffect } from 'react';
import {
  Package,
  ShoppingCart,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  Download,
  Edit2,
  Save,
  X as XIcon,
  TrendingUp
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { useSafeMode } from '../../contexts/SafeModeContext';
import { generarPDFListaCompras } from '../../utils/generarPDFListaCompras';
import { 
  formatearMoneda, 
  formatearNumero, 
  calcularTotalesProductos, 
  generarListaCompras 
} from '../../utils/calculosAplicaciones';
import type {
  ConfiguracionAplicacion,
  Mezcla,
  CalculosPorLote,
  ListaCompras,
  ProductoCatalogo,
  ItemListaCompras,
} from '../../types/aplicaciones';

interface PasoListaComprasProps {
  configuracion: ConfiguracionAplicacion;
  mezclas: Mezcla[];
  calculos: CalculosPorLote[];
  lista_compras: ListaCompras | null;
  onUpdate: (lista_compras: ListaCompras) => void;
}

export function PasoListaCompras({
  configuracion,
  mezclas,
  calculos,
  lista_compras,
  onUpdate,
}: PasoListaComprasProps) {
  const supabase = getSupabase();
  const { isSafeModeEnabled } = useSafeMode();

  const [lista, setLista] = useState<ListaCompras | null>(lista_compras);
  const [cargando, setCargando] = useState(false);
  const [inventario, setInventario] = useState<ProductoCatalogo[]>([]);
  
  // Estado para edición manual - inline directa
  const [modoEdicion, setModoEdicion] = useState(false);
  const [itemsEditables, setItemsEditables] = useState<Record<string, ItemListaCompras>>({});

  /**
   * GENERAR LISTA DE COMPRAS AL MONTAR
   */
  useEffect(() => {
    if (!lista_compras) {
      generarLista();
    } else {
      // Inicializar items editables
      const editables: Record<string, ItemListaCompras> = {};
      lista_compras.items.forEach((item) => {
        editables[item.producto_id] = { ...item };
      });
      setItemsEditables(editables);
    }
  }, []);

  /**
   * CARGAR INVENTARIO Y GENERAR LISTA
   */
  const generarLista = async () => {
    setCargando(true);
    try {
      // Obtener IDs de productos necesarios
      const productosNecesarios = calcularTotalesProductos(calculos, mezclas);
      const productosIds = productosNecesarios.map((p) => p.producto_id);

      // Cargar inventario actual de esos productos
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .in('id', productosIds);

      if (error) throw error;

      let inventarioActual: ProductoCatalogo[] = data.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria,
        grupo: p.grupo,
        unidad_medida: p.unidad_medida,
        estado_fisico: p.estado_fisico,
        // Construir presentación: "50 Kg" o fallback a "1 Kg/L"
        presentacion_comercial: p.presentacion_kg_l && p.presentacion_kg_l > 0
          ? `${p.presentacion_kg_l} ${p.unidad_medida === 'kilos' ? 'Kg' : p.unidad_medida === 'litros' ? 'L' : p.unidad_medida}`
          : `1 ${p.unidad_medida === 'kilos' ? 'Kg' : p.unidad_medida === 'litros' ? 'L' : p.unidad_medida}`,
        ultimo_precio_unitario: p.precio_unitario || 0,      // Precio por Kg/L
        precio_presentacion: p.precio_presentacion || 0,     // Precio por bulto/envase
        cantidad_actual: p.cantidad_actual || 0,
        permitido_gerencia: p.permitido_gerencia,
      }));

      // Filtrar productos no permitidos si modo seguro está activado
      if (isSafeModeEnabled) {
        inventarioActual = inventarioActual.filter((p) => p.permitido_gerencia !== false);
      }

      setInventario(inventarioActual);

      // Generar lista de compras
      const nuevaLista = generarListaCompras(productosNecesarios, inventarioActual);
      setLista(nuevaLista);
      onUpdate(nuevaLista);
    } catch (error) {
      alert('Error al generar lista de compras');
    } finally {
      setCargando(false);
    }
  };

  /**
   * EXPORTAR LISTA A PDF
   */
  const exportarPDF = () => {
    if (lista) {
      // Datos de la empresa (podrías cargarlos de configuración global)
      const datosEmpresa = {
        nombre: 'Escocia Hass',
        nit: '900.XXX.XXX-X', // Actualizar con NIT real
        direccion: 'Dirección del cultivo', // Actualizar con dirección real
        telefono: '+57 XXX XXX XXXX', // Actualizar con teléfono real
        email: 'contacto@escocia-hass.com', // Actualizar con email real
      };

      generarPDFListaCompras(lista, configuracion, datosEmpresa);
    } else {
      alert('No hay lista de compras para exportar');
    }
  };

  /**
   * ACTIVAR MODO EDICIÓN
   */
  const activarEdicion = () => {
    setModoEdicion(true);
  };

  /**
   * CANCELAR EDICIÓN
   */
  const cancelarEdicion = () => {
    // Restaurar valores originales
    if (lista) {
      const editables: Record<string, ItemListaCompras> = {};
      lista.items.forEach((item) => {
        editables[item.producto_id] = { ...item };
      });
      setItemsEditables(editables);
    }

    setModoEdicion(false);
  };

  /**
   * Extrae el tamaño numérico de una presentación comercial
   */
  const extraerTamanoPresentacion = (presentacion: string | undefined): number => {
    if (!presentacion) return 1;
    
    // Normalizar: reemplazar coma europea por punto decimal
    const normalizada = presentacion.replace(/,/g, '.');
    
    // Buscar primer número (entero o decimal)
    const match = normalizada.match(/(\d+\.?\d*)/);
    const valor = match ? parseFloat(match[1]) : 1;
    
    // Validar que sea un número válido
    return isNaN(valor) || valor <= 0 ? 1 : valor;
  };

  /**
   * EDITAR CANTIDAD DE UN PRODUCTO
   */
  const editarCantidad = (
    productoId: string,
    campo: 'unidades_a_comprar' | 'cantidad_faltante',
    valor: number
  ) => {
    const item = itemsEditables[productoId];
    if (!item) return;

    const itemActualizado = { ...item };

    if (campo === 'unidades_a_comprar') {
      itemActualizado.unidades_a_comprar = Math.max(0, valor);

      // Recalcular cantidad faltante basado en unidades
      const tamanoPresentacion = extraerTamanoPresentacion(item.presentacion_comercial);
      const nuevaCantidadFaltante = itemActualizado.unidades_a_comprar * tamanoPresentacion;
      itemActualizado.cantidad_faltante = nuevaCantidadFaltante;
    } else if (campo === 'cantidad_faltante') {
      itemActualizado.cantidad_faltante = Math.max(0, valor);

      // Recalcular unidades basado en cantidad
      const tamanoPresentacion = extraerTamanoPresentacion(item.presentacion_comercial);
      itemActualizado.unidades_a_comprar = Math.ceil(valor / tamanoPresentacion);
    }

    // Recalcular costo usando precio_presentacion
    itemActualizado.costo_estimado = itemActualizado.unidades_a_comprar * (item.precio_presentacion || 0);

    setItemsEditables((prev) => ({
      ...prev,
      [productoId]: itemActualizado,
    }));
  };

  /**
   * EDITAR PRECIO DE PRESENTACIÓN (precio por bulto/envase completo)
   * Este precio NO afecta la tabla de productos, solo el reporte de lista de compras
   */
  const editarPrecioPresentacion = (productoId: string, nuevoPrecio: number) => {
    const item = itemsEditables[productoId];
    if (!item) return;

    const itemActualizado = { ...item };
    itemActualizado.precio_presentacion = Math.max(0, nuevoPrecio);

    // Recalcular costo con el nuevo precio
    itemActualizado.costo_estimado = itemActualizado.unidades_a_comprar * nuevoPrecio;

    setItemsEditables((prev) => ({
      ...prev,
      [productoId]: itemActualizado,
    }));
  };

  /**
   * GUARDAR CAMBIOS DE EDICIÓN
   */
  const guardarCambios = () => {
    if (!lista) return;

    // Crear nueva lista con items editados
    const itemsActualizados = Object.values(itemsEditables);

    // Recalcular totales
    const nuevosCostos = itemsActualizados
      .filter((item) => item.cantidad_faltante > 0)
      .reduce((sum, item) => sum + (item.costo_estimado || 0), 0);

    const nuevaLista: ListaCompras = {
      ...lista,
      items: itemsActualizados,
      costo_total_estimado: nuevosCostos,
    };

    setLista(nuevaLista);
    onUpdate(nuevaLista);
    setModoEdicion(false);
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#73991C]/20 border-t-[#73991C] mx-auto mb-4"></div>
          <p className="text-[#4D240F]/70">Generando lista de compras...</p>
        </div>
      </div>
    );
  }

  if (!lista) {
    return (
      <div className="text-center py-12">
        <Package className="w-16 h-16 text-[#73991C]/50 mx-auto mb-4" />
        <p className="text-[#4D240F]/70 mb-4">No se pudo generar la lista de compras</p>
        <button
          onClick={generarLista}
          className="px-4 py-2 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-lg hover:from-[#5f7d17] hover:to-[#9db86d] transition-all"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // Separar productos: a comprar vs disponibles
  const productosAComprar = modoEdicion 
    ? Object.values(itemsEditables).filter((item) => item.cantidad_faltante > 0) 
    : lista.items.filter((item) => item.cantidad_faltante > 0);
  const productosDisponibles = modoEdicion
    ? Object.values(itemsEditables).filter((item) => item.cantidad_faltante === 0)
    : lista.items.filter((item) => item.cantidad_faltante === 0);
  
  // Recalcular costo total en tiempo real cuando está en modo edición
  const costoTotalActual = modoEdicion
    ? productosAComprar.reduce((sum, item) => sum + (item.costo_estimado || 0), 0)
    : lista.costo_total_estimado;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg text-[#172E08]">Lista de Compras</h2>
          <p className="text-sm text-[#4D240F]/70 mt-1">Comparación con inventario disponible</p>
        </div>

        <div className="flex gap-2">
          {/* Botón Editar/Guardar/Cancelar */}
          {!modoEdicion ? (
            <button
              onClick={activarEdicion}
              className="px-4 py-2 border border-gray-300 text-[#4D240F] rounded-lg hover:bg-gray-50 transition-all flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              <span className="hidden sm:inline">Editar Cantidades</span>
            </button>
          ) : (
            <>
              <button
                onClick={cancelarEdicion}
                className="px-4 py-2 border border-gray-300 text-[#4D240F] rounded-lg hover:bg-gray-50 transition-all flex items-center gap-2"
              >
                <XIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Cancelar</span>
              </button>
              <button
                onClick={guardarCambios}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">Guardar Cambios</span>
              </button>
            </>
          )}

          {/* Botón Exportar PDF */}
          <button
            onClick={exportarPDF}
            disabled={modoEdicion}
            className="px-4 py-2 border border-gray-300 text-[#4D240F] rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </button>
        </div>
      </div>

      {/* ALERTA DE MODO EDICIÓN */}
      {modoEdicion && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
          <Edit2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-blue-900">Modo de edición activado</p>
            <p className="text-blue-700 text-sm">
              Puedes modificar las cantidades y los precios unitarios. Los costos se recalcularán automáticamente. 
              <strong> Los precios editados aquí NO afectan el inventario</strong>, solo se usan para este reporte.
            </p>
          </div>
        </div>
      )}

      {/* RESUMEN GENERAL */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-red-50 to-red-100/50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-100 rounded-lg">
              <ShoppingCart className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-sm text-red-700">Productos a Comprar</div>
          </div>
          <div className="text-2xl text-red-900">{productosAComprar.length}</div>
        </div>

        <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 border border-[#73991C]/20 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-[#73991C]/10 rounded-lg">
              <CheckCircle className="w-5 h-5 text-[#73991C]" />
            </div>
            <div className="text-sm text-[#4D240F]/70">Disponibles en Stock</div>
          </div>
          <div className="text-2xl text-[#172E08]">{productosDisponibles.length}</div>
        </div>

        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="text-sm text-yellow-700">Inversión Estimada</div>
          </div>
          <div className="text-2xl text-yellow-900">
            {formatearMoneda(costoTotalActual)}
          </div>
        </div>
      </div>

      {/* ALERTAS */}
      {(lista.productos_sin_precio > 0 || lista.productos_sin_stock > 0) && (
        <div className="space-y-2">
          {lista.productos_sin_precio > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-yellow-800 text-sm">
                <strong>{lista.productos_sin_precio}</strong> producto(s) no tienen precio
                registrado. El costo estimado puede ser inexacto.
              </p>
            </div>
          )}

          {lista.productos_sin_stock > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800 text-sm">
                <strong>{lista.productos_sin_stock}</strong> producto(s) no tienen stock
                disponible y deben comprarse en su totalidad.
              </p>
            </div>
          )}

          {/* Alerta si hay productos sin presentación configurada */}
          {lista.items.some(item => item.presentacion_comercial.startsWith('1 ')) && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-orange-900">
                  <strong>Algunos productos no tienen presentación comercial configurada</strong>
                </p>
                <p className="text-orange-700 text-sm mt-1">
                  Los productos sin tamaño de presentación se calcularán en unidades individuales (1 Kg/L). 
                  Para calcular correctamente en bultos, configura el campo "presentacion_kg_l" en la tabla de productos.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PRODUCTOS A COMPRAR */}
      {productosAComprar.length > 0 && (
        <div>
          <h3 className="text-[#172E08] mb-3 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-red-600" />
            Productos a Comprar ({productosAComprar.length})
          </h3>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs text-[#4D240F] uppercase tracking-wider">
                      Producto
                    </th>
                    <th className="px-4 py-3 text-right text-xs text-[#4D240F] uppercase tracking-wider">
                      En Stock
                    </th>
                    <th className="px-4 py-3 text-right text-xs text-[#4D240F] uppercase tracking-wider">
                      Necesario
                    </th>
                    <th className="px-4 py-3 text-right text-xs text-[#4D240F] uppercase tracking-wider">
                      Faltante
                    </th>
                    <th className="px-4 py-3 text-center text-xs text-[#4D240F] uppercase tracking-wider">
                      A Comprar
                    </th>
                    <th className="px-4 py-3 text-right text-xs text-[#4D240F] uppercase tracking-wider">
                      Precio Unit.
                    </th>
                    <th className="px-4 py-3 text-right text-xs text-[#4D240F] uppercase tracking-wider">
                      Costo Est.
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {productosAComprar.map((item) => (
                    <tr key={item.producto_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <div className={`${item.permitido_gerencia === false ? 'text-red-600 font-bold' : 'text-[#172E08]'}`}>{item.producto_nombre}</div>
                          <div className="text-sm text-[#4D240F]/70">{item.producto_categoria}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        <span className="text-[#4D240F]/70">
                          {formatearNumero(item.inventario_actual)} {item.unidad}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-[#172E08]">
                        {formatearNumero(item.cantidad_necesaria)} {item.unidad}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {modoEdicion ? (
                          <input
                            type="number"
                            step="0.01"
                            value={item.cantidad_faltante}
                            onChange={(e) =>
                              editarCantidad(
                                item.producto_id,
                                'cantidad_faltante',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-24 px-2 py-1 text-sm text-right border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        ) : (
                          <span className="text-red-600">
                            {formatearNumero(item.cantidad_faltante)} {item.unidad}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {modoEdicion ? (
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              min="0"
                              value={item.unidades_a_comprar}
                              onChange={(e) =>
                                editarCantidad(
                                  item.producto_id,
                                  'unidades_a_comprar',
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-16 px-2 py-1 text-sm text-center border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            <span className="text-xs text-[#4D240F]/70">×</span>
                            <span className="text-xs text-[#4D240F]/70">{item.presentacion_comercial}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                              item.presentacion_comercial.startsWith('1 ')
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {item.unidades_a_comprar} × {item.presentacion_comercial}
                            </div>
                            {item.presentacion_comercial.startsWith('1 ') && (
                              <span className="text-xs text-orange-600">Sin presentación</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {modoEdicion ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-[#4D240F]/70">$</span>
                            <input
                              type="number"
                              step="1000"
                              min="0"
                              value={item.precio_presentacion || 0}
                              onChange={(e) =>
                                editarPrecioPresentacion(
                                  item.producto_id,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-28 px-2 py-1 text-sm text-right border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                              placeholder="0"
                            />
                          </div>
                        ) : item.alerta === 'sin_precio' ? (
                          <span className="text-yellow-600">Sin precio</span>
                        ) : (
                          <span className="text-[#172E08]">
                            {formatearMoneda(item.precio_presentacion || 0)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {item.alerta === 'sin_precio' ? (
                          <span className="text-yellow-600">Sin precio</span>
                        ) : (
                          <span className="text-[#172E08]">
                            {formatearMoneda(item.costo_estimado || 0)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-right text-[#172E08]">
                      TOTAL A COMPRAR:
                    </td>
                    <td className="px-4 py-3 text-right text-[#172E08]">
                      {formatearMoneda(
                        productosAComprar.reduce((sum, item) => sum + (item.costo_estimado || 0), 0)
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCTOS DISPONIBLES */}
      {productosDisponibles.length > 0 && (
        <div>
          <h3 className="text-[#172E08] mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-[#73991C]" />
            Productos Disponibles en Stock ({productosDisponibles.length})
          </h3>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs text-[#4D240F] uppercase tracking-wider">
                      Producto
                    </th>
                    <th className="px-4 py-3 text-right text-xs text-[#4D240F] uppercase tracking-wider">
                      En Stock
                    </th>
                    <th className="px-4 py-3 text-right text-xs text-[#4D240F] uppercase tracking-wider">
                      Necesario
                    </th>
                    <th className="px-4 py-3 text-right text-xs text-[#4D240F] uppercase tracking-wider">
                      Sobrante
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {productosDisponibles.map((item) => {
                    const sobrante = item.inventario_actual - item.cantidad_necesaria;
                    return (
                      <tr key={item.producto_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div>
                            <div className={`${item.permitido_gerencia === false ? 'text-red-600 font-bold' : 'text-[#172E08]'}`}>{item.producto_nombre}</div>
                            <div className="text-sm text-[#4D240F]/70">
                              {item.producto_categoria}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-[#73991C]">
                          {formatearNumero(item.inventario_actual)} {item.unidad}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-[#172E08]">
                          {formatearNumero(item.cantidad_necesaria)} {item.unidad}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-[#73991C]">
                          +{formatearNumero(sobrante)} {item.unidad}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* RESUMEN FINAL */}
      <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 border border-[#73991C]/20 rounded-xl p-6">
        <h3 className="text-[#172E08] mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#73991C]" />
          Resumen de la Aplicación
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[#4D240F]/70 mb-1">Nombre:</div>
            <div className="text-[#172E08]">{configuracion.nombre}</div>
          </div>

          <div>
            <div className="text-[#4D240F]/70 mb-1">Tipo:</div>
            <div className="text-[#172E08] capitalize">{configuracion.tipo}</div>
          </div>

          <div>
            <div className="text-[#4D240F]/70 mb-1">Fecha Inicio:</div>
            <div className="text-[#172E08]">
              {new Date(configuracion.fecha_inicio).toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>

          <div>
            <div className="text-[#4D240F]/70 mb-1">Lotes:</div>
            <div className="text-[#172E08]">
              {configuracion.lotes_seleccionados.length} lotes seleccionados
            </div>
          </div>

          <div>
            <div className="text-[#4D240F]/70 mb-1">Productos en Mezcla:</div>
            <div className="text-[#172E08]">{mezclas[0]?.productos.length || 0} productos</div>
          </div>

          <div>
            <div className="text-[#4D240F]/70 mb-1">Inversión Estimada:</div>
            <div className="text-[#172E08] text-lg">
              {formatearMoneda(costoTotalActual)}
            </div>
          </div>
        </div>
      </div>

      {/* MENSAJE DE ÉXITO */}
      {productosAComprar.length === 0 && (
        <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 border border-[#73991C]/20 rounded-xl p-6 text-center">
          <CheckCircle className="w-12 h-12 text-[#73991C] mx-auto mb-3" />
          <h4 className="text-lg text-[#172E08] mb-2">¡Todos los productos están disponibles!</h4>
          <p className="text-sm text-[#4D240F]/70">
            No necesitas comprar nada. Tienes suficiente stock para realizar la aplicación.
          </p>
        </div>
      )}
    </div>
  );
}