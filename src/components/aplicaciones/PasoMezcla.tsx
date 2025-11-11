import { useState, useEffect } from 'react';
import { Plus, X, Calculator, AlertTriangle, Package, Beaker } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import {
  calcularFumigacion,
  calcularFertilizacion,
  calcularTotalesProductos,
  formatearNumero,
  validarLoteFumigacion,
  validarProductoFumigacion,
  validarProductoFertilizacion,
} from '../../utils/calculosAplicaciones';
import type {
  ConfiguracionAplicacion,
  Mezcla,
  ProductoEnMezcla,
  CalculosPorLote,
  ProductoCatalogo,
} from '../../types/aplicaciones';

interface PasoMezclaProps {
  configuracion: ConfiguracionAplicacion;
  mezclas: Mezcla[];
  calculos: CalculosPorLote[];
  onUpdate: (mezclas: Mezcla[], calculos: CalculosPorLote[]) => void;
}

export function PasoMezcla({ configuracion, mezclas, calculos: calculosIniciales, onUpdate }: PasoMezclaProps) {
  const supabase = getSupabase();

  // Estado
  const [mezclaActual, setMezclaActual] = useState<Mezcla>(
    mezclas.length > 0
      ? mezclas[0]
      : { id: crypto.randomUUID(), nombre: 'Mezcla 1', productos: [] }
  );

  const [productosCatalogo, setProductosCatalogo] = useState<ProductoCatalogo[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);

  const [productoSeleccionado, setProductoSeleccionado] = useState<string>('');
  const [mostrarCalculos, setMostrarCalculos] = useState(calculosIniciales.length > 0);
  const [calculos, setCalculos] = useState<CalculosPorLote[]>(calculosIniciales);
  const [errores, setErrores] = useState<string[]>([]);

  /**
   * CARGAR PRODUCTOS DEL CATÁLOGO
   */
  useEffect(() => {
    cargarProductos();
  }, [configuracion.tipo]);

  const cargarProductos = async () => {
    try {
      // Filtrar productos según tipo de aplicación
      let categorias: string[] = [];

      if (configuracion.tipo === 'fumigacion') {
        categorias = [
          'Fungicida',
          'Insecticida',
          'Acaricida',
          'Herbicida',
          'Biocontrolador',
          'Coadyuvante',
        ];
      } else {
        categorias = ['Fertilizante'];
      }

      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .in('categoria', categorias)
        .eq('estado', 'OK')
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;

      const productosFormateados: ProductoCatalogo[] = data.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria,
        grupo: p.grupo,
        unidad_medida: p.unidad_medida,
        estado_fisico: p.estado_fisico,
        presentacion_comercial: p.presentacion_kg_l ? `${p.presentacion_kg_l} ${p.unidad_medida}` : p.unidad_medida,
        ultimo_precio_unitario: p.precio_unitario || 0,
        cantidad_actual: p.cantidad_actual || 0,
        display_nombre: `${p.nombre} (${p.categoria}) - Stock: ${p.cantidad_actual || 0} ${p.unidad_medida}`,
      }));

      setProductosCatalogo(productosFormateados);
    } catch (error) {
      console.error('Error cargando productos:', error);
    } finally {
      setCargandoProductos(false);
    }
  };

  /**
   * AGREGAR PRODUCTO A LA MEZCLA
   */
  const agregarProducto = () => {
    if (!productoSeleccionado) return;

    const producto = productosCatalogo.find((p) => p.id === productoSeleccionado);
    if (!producto) return;

    // Verificar que no esté ya agregado
    if (mezclaActual.productos.some((p) => p.producto_id === producto.id)) {
      alert('Este producto ya está en la mezcla');
      return;
    }

    const nuevoProducto: ProductoEnMezcla = {
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      producto_categoria: producto.categoria,
      producto_unidad: producto.unidad_medida,
      cantidad_total_necesaria: 0,
      inventario_disponible: producto.cantidad_actual,

      // Inicializar dosis según tipo
      ...(configuracion.tipo === 'fumigacion'
        ? {
            dosis_por_caneca: 0,
            unidad_dosis: (producto.estado_fisico === 'liquido' ? 'cc' : 'gramos') as const,
          }
        : {
            dosis_grandes: 0,
            dosis_medianos: 0,
            dosis_pequenos: 0,
            dosis_clonales: 0,
          }),
    };

    setMezclaActual((prev) => ({
      ...prev,
      productos: [...prev.productos, nuevoProducto],
    }));

    setProductoSeleccionado('');
  };

  /**
   * QUITAR PRODUCTO DE LA MEZCLA
   */
  const quitarProducto = (productoId: string) => {
    setMezclaActual((prev) => ({
      ...prev,
      productos: prev.productos.filter((p) => p.producto_id !== productoId),
    }));
  };

  /**
   * ACTUALIZAR DOSIS DE PRODUCTO
   */
  const actualizarDosis = (productoId: string, campo: string, valor: number) => {
    setMezclaActual((prev) => ({
      ...prev,
      productos: prev.productos.map((p) =>
        p.producto_id === productoId ? { ...p, [campo]: valor } : p
      ),
    }));
  };

  /**
   * CALCULAR CANTIDADES NECESARIAS
   */
  const calcularCantidades = () => {
    const nuevosErrores: string[] = [];
    const nuevosCalculos: CalculosPorLote[] = [];

    // Validar configuración de lotes y productos
    configuracion.lotes_seleccionados.forEach((lote) => {
      if (configuracion.tipo === 'fumigacion') {
        const error = validarLoteFumigacion(lote);
        if (error) nuevosErrores.push(error);
      }
    });

    mezclaActual.productos.forEach((producto) => {
      if (configuracion.tipo === 'fumigacion') {
        const error = validarProductoFumigacion(producto);
        if (error) nuevosErrores.push(error);
      } else {
        const error = validarProductoFertilizacion(producto);
        if (error) nuevosErrores.push(error);
      }
    });

    if (nuevosErrores.length > 0) {
      setErrores(nuevosErrores);
      return;
    }

    // Calcular por cada lote
    configuracion.lotes_seleccionados.forEach((lote) => {
      const calculo =
        configuracion.tipo === 'fumigacion'
          ? calcularFumigacion(lote, mezclaActual)
          : calcularFertilizacion(lote, mezclaActual);

      nuevosCalculos.push(calculo);
    });

    // Calcular totales
    const productosConTotales = calcularTotalesProductos(nuevosCalculos, [mezclaActual]);

    // Actualizar productos en la mezcla con las cantidades totales
    const mezclaActualizada = {
      ...mezclaActual,
      productos: mezclaActual.productos.map((p) => {
        const productoTotal = productosConTotales.find((pt) => pt.producto_id === p.producto_id);
        return productoTotal
          ? { ...p, cantidad_total_necesaria: productoTotal.cantidad_total_necesaria }
          : p;
      }),
    };

    setMezclaActual(mezclaActualizada);
    setCalculos(nuevosCalculos);
    setMostrarCalculos(true);
    setErrores([]);

    // Auto-guardar
    onUpdate([mezclaActualizada], nuevosCalculos);
  };

  /**
   * AUTO-GUARDAR AL CAMBIAR MEZCLA
   */
  useEffect(() => {
    // Solo auto-guardar si ya se han calculado las cantidades
    if (mostrarCalculos && calculos.length > 0) {
      onUpdate([mezclaActual], calculos);
    }
  }, [mezclaActual]);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg text-[#172E08]">Definición de Mezcla</h2>
          <p className="text-sm text-[#4D240F]/70 mt-1">
            {configuracion.tipo === 'fumigacion'
              ? 'Define los productos y sus dosis por caneca'
              : 'Define los productos y sus dosis por tipo de árbol'}
          </p>
        </div>

        <button
          onClick={calcularCantidades}
          disabled={mezclaActual.productos.length === 0}
          className="px-4 py-2 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-lg hover:from-[#5f7d17] hover:to-[#9db86d] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          <Calculator className="w-4 h-4" />
          Calcular Cantidades
        </button>
      </div>

      {/* ERRORES DE VALIDACIÓN */}
      {errores.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-900 mb-2">Errores de validación:</h3>
              <ul className="list-disc list-inside space-y-1">
                {errores.map((error, index) => (
                  <li key={index} className="text-red-700 text-sm">
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* SELECTOR DE PRODUCTOS */}
      <div className="border border-gray-200 rounded-xl p-4 bg-gradient-to-br from-[#73991C]/5 to-[#BFD97D]/5">
        <h3 className="text-[#172E08] mb-3 flex items-center gap-2">
          <Beaker className="w-5 h-5 text-[#73991C]" />
          Agregar Productos
        </h3>

        <div className="flex gap-2">
          <select
            value={productoSeleccionado}
            onChange={(e) => setProductoSeleccionado(e.target.value)}
            disabled={cargandoProductos}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
          >
            <option value="">
              {cargandoProductos ? 'Cargando productos...' : 'Selecciona un producto'}
            </option>
            {productosCatalogo
              .filter((p) => !mezclaActual.productos.some((mp) => mp.producto_id === p.id))
              .map((producto) => (
                <option key={producto.id} value={producto.id}>
                  {producto.display_nombre}
                </option>
              ))}
          </select>
          <button
            onClick={agregarProducto}
            disabled={!productoSeleccionado}
            className="px-4 py-2 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-lg hover:from-[#5f7d17] hover:to-[#9db86d] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Agregar
          </button>
        </div>
      </div>

      {/* LISTA DE PRODUCTOS EN LA MEZCLA */}
      {mezclaActual.productos.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-[#172E08]">
            Productos en la Mezcla ({mezclaActual.productos.length})
          </h3>

          {mezclaActual.productos.map((producto) => (
            <div
              key={producto.producto_id}
              className="border border-gray-200 rounded-xl p-4 bg-white"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-[#172E08] flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#73991C]" />
                    {producto.producto_nombre}
                  </h4>
                  <p className="text-sm text-[#4D240F]/70">
                    {producto.producto_categoria} • Stock: {producto.inventario_disponible}{' '}
                    {producto.producto_unidad}
                  </p>
                </div>
                <button
                  onClick={() => quitarProducto(producto.producto_id)}
                  className="text-red-600 hover:text-red-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* DOSIS PARA FUMIGACIÓN */}
              {configuracion.tipo === 'fumigacion' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-[#4D240F] mb-1">
                      Dosis por Caneca ({configuracion.lotes_seleccionados[0]?.tamano_caneca || 200}L)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={producto.dosis_por_caneca || ''}
                        onChange={(e) =>
                          actualizarDosis(
                            producto.producto_id,
                            'dosis_por_caneca',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
                      />
                      <span className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm">
                        {producto.unidad_dosis}
                      </span>
                    </div>
                  </div>

                  {mostrarCalculos && (
                    <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 border border-[#73991C]/20 rounded-lg p-3">
                      <div className="text-xs text-[#4D240F]/70 mb-1">Cantidad Total Necesaria</div>
                      <div className="text-lg text-[#172E08]">
                        {formatearNumero(producto.cantidad_total_necesaria)} {producto.producto_unidad}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* DOSIS PARA FERTILIZACIÓN */}
              {configuracion.tipo === 'fertilizacion' && (
                <div>
                  <label className="block text-sm text-[#4D240F] mb-2">
                    Dosis por Tipo de Árbol (kg/árbol)
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-[#4D240F]/70 mb-1">Grandes</label>
                      <input
                        type="number"
                        step="0.01"
                        value={producto.dosis_grandes || ''}
                        onChange={(e) =>
                          actualizarDosis(
                            producto.producto_id,
                            'dosis_grandes',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#4D240F]/70 mb-1">Medianos</label>
                      <input
                        type="number"
                        step="0.01"
                        value={producto.dosis_medianos || ''}
                        onChange={(e) =>
                          actualizarDosis(
                            producto.producto_id,
                            'dosis_medianos',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#4D240F]/70 mb-1">Pequeños</label>
                      <input
                        type="number"
                        step="0.01"
                        value={producto.dosis_pequenos || ''}
                        onChange={(e) =>
                          actualizarDosis(
                            producto.producto_id,
                            'dosis_pequenos',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#4D240F]/70 mb-1">Clonales</label>
                      <input
                        type="number"
                        step="0.01"
                        value={producto.dosis_clonales || ''}
                        onChange={(e) =>
                          actualizarDosis(
                            producto.producto_id,
                            'dosis_clonales',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
                      />
                    </div>
                  </div>

                  {mostrarCalculos && (
                    <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 border border-[#73991C]/20 rounded-lg p-3">
                      <div className="text-xs text-[#4D240F]/70 mb-1">Cantidad Total Necesaria</div>
                      <div className="text-lg text-[#172E08]">
                        {formatearNumero(producto.cantidad_total_necesaria)} kg
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* RESULTADOS DE CÁLCULOS POR LOTE */}
      {mostrarCalculos && calculos.length > 0 && (
        <div className="border-t pt-6">
          <h3 className="text-[#172E08] mb-4">Resultados por Lote</h3>

          <div className="space-y-3">
            {calculos.map((calculo) => (
              <div
                key={calculo.lote_id}
                className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 border border-[#73991C]/20 rounded-xl p-4"
              >
                <h4 className="text-[#172E08] mb-2">{calculo.lote_nombre}</h4>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  {configuracion.tipo === 'fumigacion' && (
                    <>
                      <div>
                        <div className="text-[#4D240F]/70">Litros de Mezcla</div>
                        <div className="text-[#172E08]">
                          {formatearNumero(calculo.litros_mezcla!)} L
                        </div>
                      </div>
                      <div>
                        <div className="text-[#4D240F]/70">Número de Canecas</div>
                        <div className="text-[#172E08]">
                          {formatearNumero(calculo.numero_canecas!)}
                        </div>
                      </div>
                    </>
                  )}

                  {configuracion.tipo === 'fertilizacion' && (
                    <>
                      <div>
                        <div className="text-[#4D240F]/70">Kilos Totales</div>
                        <div className="text-[#172E08]">
                          {formatearNumero(calculo.kilos_totales!)} kg
                        </div>
                      </div>
                      <div>
                        <div className="text-[#4D240F]/70">Bultos (25kg)</div>
                        <div className="text-[#172E08]">{calculo.numero_bultos}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MENSAJE DE AYUDA */}
      {mezclaActual.productos.length === 0 && (
        <div className="text-center py-8 text-[#4D240F]/70">
          <Beaker className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Agrega productos para comenzar a crear tu mezcla</p>
        </div>
      )}
    </div>
  );
}