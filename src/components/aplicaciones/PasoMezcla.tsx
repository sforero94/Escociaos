import { useState, useEffect } from 'react';
import { Plus, X, Calculator, AlertTriangle, Package, Beaker, Check, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { getSupabase } from '../../utils/supabase/client';
import { useSafeMode } from '../../contexts/SafeModeContext';
import {
  calcularFumigacion,
  calcularFertilizacion,
  calcularTotalesProductos,
  validarLoteFumigacion,
  validarProductoFumigacion,
  validarProductoFertilizacion,
} from '../../utils/calculosAplicaciones';
import { formatearNumero } from '../../utils/format';
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
  const { isSafeModeEnabled } = useSafeMode();

  // Estado
  const [mezclas_guardadas, setMezclasGuardadas] = useState<Mezcla[]>(mezclas);
  const [mezcla_en_edicion, setMezclaEnEdicion] = useState<Mezcla | null>(null);
  const [modo_edicion, setModoEdicion] = useState<'crear' | 'editar'>('crear');

  const [productosCatalogo, setProductosCatalogo] = useState<ProductoCatalogo[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);

  const [productoSeleccionado, setProductoSeleccionado] = useState<string>('');
  const [busquedaProducto, setBusquedaProducto] = useState<string>('');
  const [mostrarResultados, setMostrarResultados] = useState<boolean>(false);
  const [calculos, setCalculos] = useState<CalculosPorLote[]>(calculosIniciales);
  const [errores, setErrores] = useState<string[]>([]);
  const [confirmEliminarId, setConfirmEliminarId] = useState<string | null>(null);

  /**
   * CARGAR PRODUCTOS DEL CATÁLOGO
   */
  useEffect(() => {
    cargarProductos();
  }, [configuracion.tipo, isSafeModeEnabled]);

  const cargarProductos = async () => {
    try {
      // 🚨 CARGAR SOLO PRODUCTOS DE AGROINSUMOS (como blancos biológicos)
      
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('estado', 'OK')
        .eq('activo', true)
        .eq('grupo', 'Agroinsumos') // 🚨 FILTRAR POR GRUPO
        .order('nombre');

      if (error) {
        throw error;
      }


      let productosFormateados: ProductoCatalogo[] = (data || []).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria,
        grupo: p.grupo,
        unidad_medida: p.unidad_medida,
        estado_fisico: p.estado_fisico,
        presentacion_comercial: p.presentacion_kg_l ? `${p.presentacion_kg_l} ${p.unidad_medida}` : p.unidad_medida,
        ultimo_precio_unitario: p.precio_unitario || 0,
        cantidad_actual: p.cantidad_actual || 0,
        display_nombre: `${p.nombre} (${p.categoria} - ${p.estado_fisico}) - Stock: ${p.cantidad_actual || 0} ${p.unidad_medida}`,
        permitido_gerencia: p.permitido_gerencia,
      }));

      // Filtrar productos no permitidos si modo seguro está activado
      if (isSafeModeEnabled) {
        productosFormateados = productosFormateados.filter((p) => p.permitido_gerencia !== false);
      }

      setProductosCatalogo(productosFormateados);
    } catch (error) {
      setProductosCatalogo([]);
    } finally {
      setCargandoProductos(false);
    }
  };

  /**
   * CREAR NUEVA MEZCLA
   */
  const crearNuevaMezcla = () => {
    const numeroMezcla = mezclas_guardadas.length + 1;
    const nuevaMezcla: Mezcla = {
      id: crypto.randomUUID(),
      nombre: `Mezcla ${numeroMezcla}`,
      numero_orden: numeroMezcla,
      productos: [],
      lotes_asignados: [], // Inicialmente sin lotes
    };
    
    setMezclaEnEdicion(nuevaMezcla);
    setModoEdicion('crear');
    setErrores([]);
  };

  /**
   * EDITAR MEZCLA EXISTENTE
   */
  const editarMezcla = (mezcla: Mezcla) => {
    setMezclaEnEdicion({ ...mezcla });
    setModoEdicion('editar');
    setErrores([]);
  };

  /**
   * CANCELAR EDICIÓN
   */
  const cancelarEdicion = () => {
    setMezclaEnEdicion(null);
    setModoEdicion('crear');
    setProductoSeleccionado('');
    setErrores([]);
  };

  /**
   * CONFIRMAR/GUARDAR MEZCLA
   */
  const confirmarMezcla = () => {
    if (!mezcla_en_edicion) return;

    // Validación
    if (mezcla_en_edicion.productos.length === 0) {
      setErrores(['Debes agregar al menos un producto a la mezcla']);
      return;
    }

    if (!mezcla_en_edicion.lotes_asignados || mezcla_en_edicion.lotes_asignados.length === 0) {
      setErrores(['Debes asignar al menos un lote a esta mezcla']);
      return;
    }

    // Validar dosis de productos
    const nuevosErrores: string[] = [];
    mezcla_en_edicion.productos.forEach((producto) => {
      if (configuracion.tipo === 'fumigacion' || configuracion.tipo === 'drench') {
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

    // Guardar o actualizar
    let nuevasMezclas: Mezcla[];
    
    if (modo_edicion === 'crear') {
      nuevasMezclas = [...mezclas_guardadas, mezcla_en_edicion];
    } else {
      nuevasMezclas = mezclas_guardadas.map((m) =>
        m.id === mezcla_en_edicion.id ? mezcla_en_edicion : m
      );
    }

    setMezclasGuardadas(nuevasMezclas);
    
    // Recalcular con todas las mezclas
    recalcularTodo(nuevasMezclas);
    
    // Limpiar edición
    setMezclaEnEdicion(null);
    setModoEdicion('crear');
    setErrores([]);
  };

  /**
   * ELIMINAR MEZCLA
   */
  const eliminarMezcla = (mezclaId: string) => {
    setConfirmEliminarId(mezclaId);
  };

  const confirmarEliminarMezcla = () => {
    if (!confirmEliminarId) return;
    const mezclaId = confirmEliminarId;
    setConfirmEliminarId(null);

    const nuevasMezclas = mezclas_guardadas.filter((m) => m.id !== mezclaId);
    
    // Renumerar mezclas
    const mezclasRenumeradas = nuevasMezclas.map((m, index) => ({
      ...m,
      nombre: `Mezcla ${index + 1}`,
      numero_orden: index + 1,
    }));

    setMezclasGuardadas(mezclasRenumeradas);
    recalcularTodo(mezclasRenumeradas);
  };

  /**
   * TOGGLE LOTE ASIGNADO A MEZCLA EN EDICIÓN
   */
  const toggleLoteAsignado = (loteId: string) => {
    if (!mezcla_en_edicion) return;

    const lotesActuales = mezcla_en_edicion.lotes_asignados || [];
    const yaAsignado = lotesActuales.includes(loteId);

    setMezclaEnEdicion({
      ...mezcla_en_edicion,
      lotes_asignados: yaAsignado
        ? lotesActuales.filter((id) => id !== loteId)
        : [...lotesActuales, loteId],
    });
  };

  /**
   * AGREGAR PRODUCTO A MEZCLA EN EDICIÓN
   */
  const agregarProducto = () => {
    if (!mezcla_en_edicion || !productoSeleccionado) return;

    const producto = productosCatalogo.find((p) => p.id === productoSeleccionado);
    if (!producto) return;

    // Verificar que no esté ya agregado
    if (mezcla_en_edicion.productos.some((p) => p.producto_id === producto.id)) {
      toast('Este producto ya está en la mezcla');
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
      ...(configuracion.tipo === 'fumigacion' || configuracion.tipo === 'drench'
        ? {
            dosis_por_caneca: 0,
            unidad_dosis: (producto.estado_fisico === 'Líquido' ? 'cc' : 'gramos') as const,
          }
        : {
            dosis_grandes: 0,
            dosis_medianos: 0,
            dosis_pequenos: 0,
            dosis_clonales: 0,
          }),
    };

    setMezclaEnEdicion({
      ...mezcla_en_edicion,
      productos: [...mezcla_en_edicion.productos, nuevoProducto],
    });

    setProductoSeleccionado('');
    setBusquedaProducto('');
    setMostrarResultados(false);
  };

  /**
   * QUITAR PRODUCTO DE MEZCLA EN EDICIÓN
   */
  const quitarProducto = (productoId: string) => {
    if (!mezcla_en_edicion) return;

    setMezclaEnEdicion({
      ...mezcla_en_edicion,
      productos: mezcla_en_edicion.productos.filter((p) => p.producto_id !== productoId),
    });
  };

  /**
   * ACTUALIZAR DOSIS DE PRODUCTO EN EDICIÓN
   */
  const actualizarDosis = (productoId: string, campo: string, valor: number) => {
    if (!mezcla_en_edicion) return;

    setMezclaEnEdicion({
      ...mezcla_en_edicion,
      productos: mezcla_en_edicion.productos.map((p) =>
        p.producto_id === productoId ? { ...p, [campo]: valor } : p
      ),
    });
  };

  /**
   * RECALCULAR TODO (TODAS LAS MEZCLAS)
   */
  const recalcularTodo = async (mezclasParaCalcular: Mezcla[]) => {
    const nuevosCalculos: CalculosPorLote[] = [];
    const nuevosErrores: string[] = [];

    // 🆕 Para fertilización: cargar presentaciones de productos
    let productosInfo: Map<string, { presentacion_kg_l: number }> | undefined;
    
    if (configuracion.tipo === 'fertilizacion') {
      productosInfo = new Map();
      
      // Obtener IDs únicos de todos los productos en todas las mezclas
      const productosIds = Array.from(new Set(
        mezclasParaCalcular.flatMap(m => m.productos.map(p => p.producto_id))
      ));
      
      if (productosIds.length > 0) {
        try {
          const { data: productosData, error: errorProductos } = await supabase
            .from('productos')
            .select('id, presentacion_kg_l')
            .in('id', productosIds);
          
          if (!errorProductos && productosData) {
            productosData.forEach(p => {
              if (p.presentacion_kg_l) {
                productosInfo!.set(p.id, {
                  presentacion_kg_l: p.presentacion_kg_l
                });
              }
            });
          } else {
          }
        } catch (err) {
        }
      }
    }

    // Calcular por cada mezcla y sus lotes asignados
    mezclasParaCalcular.forEach((mezcla) => {
      const lotesAsignados = mezcla.lotes_asignados || [];
      
      lotesAsignados.forEach((loteId) => {
        const lote = configuracion.lotes_seleccionados.find((l) => l.lote_id === loteId);
        if (!lote) return;

        // Validar lote (fumigación y drench usan la misma validación)
        if (configuracion.tipo === 'fumigacion' || configuracion.tipo === 'drench') {
          const error = validarLoteFumigacion(lote);
          if (error) nuevosErrores.push(error);
        }

        // Calcular (drench usa el mismo cálculo que fumigación)
        const calculo =
          configuracion.tipo === 'fumigacion' || configuracion.tipo === 'drench'
            ? calcularFumigacion(lote, mezcla)
            : calcularFertilizacion(lote, mezcla, productosInfo); // 👈 Pasar productosInfo

        nuevosCalculos.push(calculo);
      });
    });

    // Calcular totales por producto PER MEZCLA (solo para lotes asignados a cada mezcla)
    const mezclasActualizadas = mezclasParaCalcular.map((mezcla) => {
      // Filtrar cálculos solo para los lotes asignados a ESTA mezcla
      const calculosDeEstaMezcla = nuevosCalculos.filter(calculo =>
        mezcla.lotes_asignados?.includes(calculo.lote_id)
      );

      return {
        ...mezcla,
        productos: mezcla.productos.map((productoEnMezcla) => {
          // Sumar cantidad solo de los lotes asignados a ESTA mezcla
          const cantidadTotal = calculosDeEstaMezcla.reduce((sum, calculo) => {
            const productoEnCalculo = calculo.productos.find(
              p => p.producto_id === productoEnMezcla.producto_id
            );
            return sum + (productoEnCalculo?.cantidad_necesaria || 0);
          }, 0);

          return {
            ...productoEnMezcla,
            cantidad_total_necesaria: Math.ceil(cantidadTotal * 100) / 100
          };
        })
      };
    });

    setCalculos(nuevosCalculos);
    setErrores(nuevosErrores);

    // Notificar al padre
    onUpdate(mezclasActualizadas, nuevosCalculos);
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg text-foreground">Definición de Mezclas</h2>
          <p className="text-sm text-brand-brown/70 mt-1">
            Crea mezclas, asigna lotes y define productos con sus dosis
          </p>
        </div>

        {!mezcla_en_edicion && (
          <button
            onClick={crearNuevaMezcla}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:from-primary-dark hover:to-secondary-dark transition-all"
          >
            <Plus className="w-5 h-5" />
            <span>Nueva Mezcla</span>
          </button>
        )}
      </div>

      {/* ERRORES */}
      {errores.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-red-800 mb-2">Errores de validación:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
                {errores.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* MEZCLAS GUARDADAS */}
      {!mezcla_en_edicion && mezclas_guardadas.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm text-foreground">Mezclas Creadas ({mezclas_guardadas.length})</h3>
          
          {mezclas_guardadas.map((mezcla) => {
            const lotesAsignados = mezcla.lotes_asignados || [];
            const nombreLotes = lotesAsignados
              .map((loteId) => {
                const lote = configuracion.lotes_seleccionados.find((l) => l.lote_id === loteId);
                return lote ? lote.nombre : 'Desconocido';
              })
              .join(', ');

            return (
              <div
                key={mezcla.id}
                className="border border-gray-200 rounded-xl p-4 hover:border-primary transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center text-white">
                      <Beaker className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-foreground">{mezcla.nombre}</h4>
                      <p className="text-sm text-brand-brown/70">
                        {mezcla.productos.length} productos • {lotesAsignados.length} lotes
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => editarMezcla(mezcla)}
                      className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => eliminarMezcla(mezcla.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Lotes asignados */}
                {lotesAsignados.length > 0 && (
                  <div className="mb-3 p-3 bg-background rounded-lg">
                    <p className="text-xs text-brand-brown/70 mb-1">Lotes asignados:</p>
                    <p className="text-sm text-foreground">{nombreLotes}</p>
                  </div>
                )}

                {/* Productos */}
                <div className="space-y-2">
                  {mezcla.productos.map((producto) => (
                    <div
                      key={producto.producto_id}
                      className="flex items-center justify-between text-sm p-2 bg-white rounded-lg"
                    >
                      <div className="flex-1">
                        <p className={`${productosCatalogo.find(p => p.id === producto.producto_id)?.permitido_gerencia === false ? 'text-red-600 font-bold' : 'text-foreground'}`}>
                          {producto.producto_nombre}
                        </p>
                        <p className="text-xs text-brand-brown/70">{producto.producto_categoria}</p>
                      </div>
                      <div className="text-right">
                        {(configuracion.tipo === 'fumigacion' || configuracion.tipo === 'drench') ? (
                          <p className="text-primary">
                            {producto.dosis_por_caneca} {producto.unidad_dosis}/caneca
                          </p>
                        ) : (
                          <p className="text-primary text-xs">
                            G:{producto.dosis_grandes} M:{producto.dosis_medianos} P:{producto.dosis_pequenos} C:{producto.dosis_clonales} kg/árbol
                          </p>
                        )}
                        <p className="text-xs text-brand-brown/70">
                          Total: {formatearNumero(producto.cantidad_total_necesaria)} {producto.producto_unidad}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FORMULARIO DE CREACIÓN/EDICIÓN */}
      {mezcla_en_edicion && (
        <div className="border-2 border-primary rounded-2xl p-6 bg-white">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center text-white">
                <Beaker className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg text-foreground">
                  {modo_edicion === 'crear' ? 'Crear' : 'Editar'} {mezcla_en_edicion.nombre}
                </h3>
                <p className="text-sm text-brand-brown/70">
                  Asigna lotes y productos a esta mezcla
                </p>
              </div>
            </div>
          </div>

          {/* ASIGNAR LOTES */}
          <div className="mb-6">
            <label className="block text-sm text-foreground mb-3">
              1. Asignar Lotes a esta Mezcla *
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {configuracion.lotes_seleccionados.map((lote) => {
                const yaAsignado = (mezcla_en_edicion.lotes_asignados || []).includes(lote.lote_id);

                return (
                  <button
                    key={lote.lote_id}
                    onClick={() => toggleLoteAsignado(lote.lote_id)}
                    className={`
                      p-4 rounded-xl border-2 text-left transition-all
                      ${
                        yaAsignado
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-foreground mb-1">{lote.nombre}</p>
                        <p className="text-xs text-brand-brown/70">
                          {lote.conteo_arboles.total} árboles
                        </p>
                      </div>
                      {yaAsignado && (
                        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-white flex-shrink-0">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AGREGAR PRODUCTOS */}
          <div className="mb-6">
            <label className="block text-sm text-foreground mb-3">
              2. Agregar Productos *
            </label>

            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Buscar producto..."
                disabled={cargandoProductos}
              />

              <select
                value={productoSeleccionado}
                onChange={(e) => setProductoSeleccionado(e.target.value)}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={cargandoProductos}
              >
                <option value="">
                  {cargandoProductos ? 'Cargando productos...' : 'Seleccionar producto'}
                </option>
                {productosCatalogo
                  .filter((producto) =>
                    producto.display_nombre.toLowerCase().includes(busquedaProducto.toLowerCase())
                  )
                  .map((producto) => (
                    <option key={producto.id} value={producto.id}>
                      {producto.display_nombre}
                    </option>
                  ))}
              </select>

              <button
                onClick={agregarProducto}
                disabled={!productoSeleccionado}
                className="px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
                <span>Agregar</span>
              </button>
            </div>

            {/* Lista de productos en la mezcla */}
            {mezcla_en_edicion.productos.length > 0 && (
              <div className="space-y-3">
                {mezcla_en_edicion.productos.map((producto) => (
                  <div
                    key={producto.producto_id}
                    className="border border-gray-200 rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className={`mb-1 ${productosCatalogo.find(p => p.id === producto.producto_id)?.permitido_gerencia === false ? 'text-red-600 font-bold' : 'text-foreground'}`}>
                          {producto.producto_nombre}
                        </h4>
                        <p className="text-xs text-brand-brown/70">
                          {producto.producto_categoria} • Stock: {formatearNumero(producto.inventario_disponible)} {producto.producto_unidad}
                        </p>
                      </div>

                      <button
                        onClick={() => quitarProducto(producto.producto_id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Dosis - Fumigación */}
                    {configuracion.tipo === 'fumigacion' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-brand-brown/70 mb-1">
                            Dosis por caneca *
                          </label>
                          <input
                            type="number"
                            value={producto.dosis_por_caneca || ''}
                            onChange={(e) =>
                              actualizarDosis(
                                producto.producto_id,
                                'dosis_por_caneca',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="0"
                            step="0.01"
                            min="0"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-brand-brown/70 mb-1">Unidad</label>
                          <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-foreground">
                            {producto.unidad_dosis === 'cc' ? 'cc (líquido)' : 'gramos (sólido)'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Dosis - Drench (igual a fumigación) */}
                    {configuracion.tipo === 'drench' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-brand-brown/70 mb-1">
                            Dosis por caneca *
                          </label>
                          <input
                            type="number"
                            value={producto.dosis_por_caneca || ''}
                            onChange={(e) =>
                              actualizarDosis(
                                producto.producto_id,
                                'dosis_por_caneca',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="0"
                            step="0.01"
                            min="0"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-brand-brown/70 mb-1">Unidad</label>
                          <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-foreground">
                            {producto.unidad_dosis === 'cc' ? 'cc (líquido)' : 'gramos (sólido)'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Dosis - Fertilización */}
                    {configuracion.tipo === 'fertilizacion' && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs text-brand-brown/70 mb-1">
                            Grandes (kg)
                          </label>
                          <input
                            type="number"
                            value={producto.dosis_grandes || ''}
                            onChange={(e) =>
                              actualizarDosis(
                                producto.producto_id,
                                'dosis_grandes',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="0"
                            step="0.01"
                            min="0"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-brand-brown/70 mb-1">
                            Medianos (kg)
                          </label>
                          <input
                            type="number"
                            value={producto.dosis_medianos || ''}
                            onChange={(e) =>
                              actualizarDosis(
                                producto.producto_id,
                                'dosis_medianos',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="0"
                            step="0.01"
                            min="0"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-brand-brown/70 mb-1">
                            Pequeños (kg)
                          </label>
                          <input
                            type="number"
                            value={producto.dosis_pequenos || ''}
                            onChange={(e) =>
                              actualizarDosis(
                                producto.producto_id,
                                'dosis_pequenos',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="0"
                            step="0.01"
                            min="0"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-brand-brown/70 mb-1">
                            Clonales (kg)
                          </label>
                          <input
                            type="number"
                            value={producto.dosis_clonales || ''}
                            onChange={(e) =>
                              actualizarDosis(
                                producto.producto_id,
                                'dosis_clonales',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="0"
                            step="0.01"
                            min="0"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={cancelarEdicion}
              className="px-6 py-3 text-brand-brown hover:bg-gray-100 rounded-xl transition-all"
            >
              Cancelar
            </button>

            <button
              onClick={confirmarMezcla}
              className="px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:from-primary-dark hover:to-secondary-dark transition-all flex items-center gap-2"
            >
              <Check className="w-5 h-5" />
              <span>{modo_edicion === 'crear' ? 'Confirmar Mezcla' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </div>
      )}

      {/* MENSAJE INICIAL */}
      {!mezcla_en_edicion && mezclas_guardadas.length === 0 && (
        <div className="text-center py-12 bg-background rounded-2xl border-2 border-dashed border-gray-300">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
            <Beaker className="w-8 h-8" />
          </div>
          <h3 className="text-lg text-foreground mb-2">No hay mezclas creadas</h3>
          <p className="text-brand-brown/70 mb-6">
            Crea tu primera mezcla para comenzar
          </p>
          <button
            onClick={crearNuevaMezcla}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:from-primary-dark hover:to-secondary-dark transition-all"
          >
            <Plus className="w-5 h-5" />
            <span>Crear Primera Mezcla</span>
          </button>
        </div>
      )}

      {/* CONFIRM DIALOG — ELIMINAR MEZCLA */}
      <ConfirmDialog
        open={confirmEliminarId !== null}
        onOpenChange={(open) => { if (!open) setConfirmEliminarId(null); }}
        title="¿Estás seguro de eliminar esta mezcla?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={confirmarEliminarMezcla}
        destructive
      />

      {/* RESUMEN DE CÁLCULOS */}
      {mezclas_guardadas.length > 0 && calculos.length > 0 && !mezcla_en_edicion && (
        <div className="bg-background rounded-2xl p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center text-white">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-foreground">Resumen de Cálculos</h3>
              <p className="text-sm text-brand-brown/70">
                {calculos.length} lotes calculados
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {calculos.map((calculo) => (
              <div
                key={`${calculo.lote_id}-${calculo.lote_nombre}`}
                className="bg-white rounded-xl p-4 border border-gray-200"
              >
                <h4 className="text-foreground mb-3">{calculo.lote_nombre}</h4>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-brand-brown/70 text-xs mb-1">Total Árboles</p>
                    <p className="text-foreground">{formatearNumero(calculo.total_arboles)}</p>
                  </div>

                  {(configuracion.tipo === 'fumigacion' || configuracion.tipo === 'drench') && (
                    <>
                      <div>
                        <p className="text-brand-brown/70 text-xs mb-1">Litros Mezcla</p>
                        <p className="text-primary">{formatearNumero(calculo.litros_mezcla)} L</p>
                      </div>
                      <div>
                        <p className="text-brand-brown/70 text-xs mb-1">Canecas</p>
                        <p className="text-primary">{formatearNumero(calculo.numero_canecas)}</p>
                      </div>
                    </>
                  )}

                  {configuracion.tipo === 'fertilizacion' && (
                    <>
                      <div>
                        <p className="text-brand-brown/70 text-xs mb-1">Kilos Totales</p>
                        <p className="text-primary">{formatearNumero(calculo.kilos_totales)} kg</p>
                      </div>
                      <div>
                        <p className="text-brand-brown/70 text-xs mb-1">Bultos (25kg)</p>
                        <p className="text-primary">{calculo.numero_bultos}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}