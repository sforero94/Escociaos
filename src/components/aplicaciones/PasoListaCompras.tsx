import { useState, useEffect } from 'react';
import {
  ShoppingCart,
  AlertTriangle,
  CheckCircle,
  Download,
  DollarSign,
  Package,
  TrendingUp,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import {
  generarListaCompras,
  formatearMoneda,
  formatearNumero,
  calcularTotalesProductos,
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

  const [lista, setLista] = useState<ListaCompras | null>(lista_compras);
  const [cargando, setCargando] = useState(false);
  const [inventario, setInventario] = useState<ProductoCatalogo[]>([]);

  /**
   * GENERAR LISTA DE COMPRAS AL MONTAR
   */
  useEffect(() => {
    if (!lista_compras) {
      generarLista();
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

      const inventarioActual: ProductoCatalogo[] = data.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria,
        grupo: p.grupo,
        unidad_medida: p.unidad_medida,
        estado_fisico: p.estado_fisico,
        presentacion_comercial: p.presentacion_kg_l ? `${p.presentacion_kg_l} ${p.unidad_medida}` : p.unidad_medida,
        ultimo_precio_unitario: p.precio_unitario || 0,
        cantidad_actual: p.cantidad_actual || 0,
      }));

      setInventario(inventarioActual);

      // Generar lista de compras
      const nuevaLista = generarListaCompras(productosNecesarios, inventarioActual);
      setLista(nuevaLista);
      onUpdate(nuevaLista);
    } catch (error) {
      console.error('Error generando lista de compras:', error);
      alert('Error al generar lista de compras');
    } finally {
      setCargando(false);
    }
  };

  /**
   * EXPORTAR LISTA A PDF (función placeholder)
   */
  const exportarPDF = () => {
    alert('Función de exportar PDF en desarrollo');
    // TODO: Implementar generación de PDF
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
  const productosAComprar = lista.items.filter((item) => item.cantidad_faltante > 0);
  const productosDisponibles = lista.items.filter((item) => item.cantidad_faltante === 0);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg text-[#172E08]">Lista de Compras</h2>
          <p className="text-sm text-[#4D240F]/70 mt-1">Comparación con inventario disponible</p>
        </div>

        <button
          onClick={exportarPDF}
          className="px-4 py-2 border border-gray-300 text-[#4D240F] rounded-lg hover:bg-gray-50 transition-all flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Exportar PDF</span>
        </button>
      </div>

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
            {formatearMoneda(lista.costo_total_estimado)}
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
                      Costo Est.
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {productosAComprar.map((item) => (
                    <tr key={item.producto_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-[#172E08]">{item.producto_nombre}</div>
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
                        <span className="text-red-600">
                          {formatearNumero(item.cantidad_faltante)} {item.unidad}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-red-100 text-red-800">
                          {item.unidades_a_comprar} × {item.presentacion_comercial}
                        </div>
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
                    <td colSpan={5} className="px-4 py-3 text-right text-[#172E08]">
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
                            <div className="text-[#172E08]">{item.producto_nombre}</div>
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
              {formatearMoneda(lista.costo_total_estimado)}
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