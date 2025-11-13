import { useState, useEffect } from 'react';
import { X, ChevronRight, Check, FileText } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { formatearFecha, obtenerFechaHoy } from '../../utils/fechas';
import type { Aplicacion } from '../../types/aplicaciones';

interface CierreAplicacionProps {
  aplicacion: Aplicacion;
  onClose: () => void;
  onCerrado: () => void;
}

interface Movimiento {
  fecha: string;
  producto_id: string;
  producto_nombre: string;
  cantidad_utilizada: number;
  numero_canecas_utilizadas: number;
  costo_unitario: number;
}

interface ResumenInsumo {
  nombre: string;
  unidad: string;
  planeado: number;
  aplicado: number;
}

interface DatosFinales {
  jornales: number;
  valorJornal: number;
  arbolesJornal: number;
  fechaInicioReal: string;
  fechaFinReal: string;
  observaciones: string;
}

type Paso = 'revision' | 'datos-finales' | 'confirmacion';

export function CierreAplicacion({ aplicacion, onClose, onCerrado }: CierreAplicacionProps) {
  const supabase = getSupabase();
  const [paso, setPaso] = useState<Paso>('revision');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  // Datos cargados
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [resumenInsumos, setResumenInsumos] = useState<ResumenInsumo[]>([]);
  const [canecasPlaneadas, setCanecasPlaneadas] = useState(0);
  const [canecasAplicadas, setCanecasAplicadas] = useState(0);
  const [lotes, setLotes] = useState<{ nombre: string; arboles: number }[]>([]);
  const [blancoBiologico, setBlancoBiologico] = useState<string>('');
  const [fechaInicioPlaneada, setFechaInicioPlaneada] = useState<string>('');
  const [fechaFinPlaneada, setFechaFinPlaneada] = useState<string>('');

  // Datos finales del usuario
  const [datosFinales, setDatosFinales] = useState<DatosFinales>({
    jornales: 0,
    valorJornal: 0,
    arbolesJornal: 0,
    fechaInicioReal: aplicacion.fecha_inicio || '',
    fechaFinReal: obtenerFechaHoy(),
    observaciones: '',
  });

  useEffect(() => {
    cargarDatos();
  }, [aplicacion.id]);

  const cargarDatos = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔍 Cargando datos para cierre de aplicación:', aplicacion.id);

      // 1. Cargar aplicación completa
      const { data: appData } = await supabase
        .from('aplicaciones')
        .select(`
          *,
          aplicaciones_lotes (
            lotes (
              nombre,
              total_arboles
            )
          )
        `)
        .eq('id', aplicacion.id)
        .single();

      console.log('📋 Datos de aplicación:', appData);

      // Extraer lotes con árboles
      const lotesData = appData?.aplicaciones_lotes?.map((al: any) => ({
        nombre: al.lotes?.nombre || 'Sin nombre',
        arboles: al.lotes?.total_arboles || 0,
      })) || [];
      setLotes(lotesData);

      console.log('🌳 Lotes cargados:', lotesData);
      console.log('🌳 Total árboles:', lotesData.reduce((sum, l) => sum + l.arboles, 0));

      // Extraer fechas planeadas
      setFechaInicioPlaneada(appData?.fecha_inicio_planeada || '');
      setFechaFinPlaneada(appData?.fecha_fin_planeada || '');

      // Extraer blanco biológico
      if (appData?.blanco_biologico) {
        try {
          const bb = JSON.parse(appData.blanco_biologico);
          if (Array.isArray(bb) && bb.length > 0) {
            const { data: plagas } = await supabase
              .from('plagas_enfermedades_catalogo')
              .select('nombre')
              .in('id', bb);
            setBlancoBiologico(plagas?.map((p) => p.nombre).join(', ') || 'No especificado');
          } else {
            setBlancoBiologico('No especificado');
          }
        } catch {
          setBlancoBiologico('No especificado');
        }
      } else {
        setBlancoBiologico('No especificado');
      }

      // 2. Cargar canecas planeadas
      const { data: calculos } = await supabase
        .from('aplicaciones_calculos')
        .select('numero_canecas')
        .eq('aplicacion_id', aplicacion.id);

      const totalCanecasPlaneadas =
        calculos?.reduce((sum, calc) => sum + (calc.numero_canecas || 0), 0) || 0;
      setCanecasPlaneadas(totalCanecasPlaneadas);

      // 3. Cargar movimientos diarios con productos
      const { data: movimientosDiarios, error: errorMovimientos } = await supabase
        .from('movimientos_diarios')
        .select('id, fecha_movimiento, numero_canecas')
        .eq('aplicacion_id', aplicacion.id)
        .order('fecha_movimiento', { ascending: true });

      if (errorMovimientos) {
        throw new Error(`Error cargando movimientos: ${errorMovimientos.message}`);
      }

      console.log('🚛 Movimientos diarios:', movimientosDiarios);

      // Variable para almacenar movimientos consolidados
      let movimientosConsolidados: Movimiento[] = [];

      if (movimientosDiarios && movimientosDiarios.length > 0) {
        // Calcular canecas aplicadas
        const totalCanecasAplicadas = movimientosDiarios.reduce(
          (sum, mov) => sum + (mov.numero_canecas || 0),
          0
        );
        setCanecasAplicadas(totalCanecasAplicadas);

        // Cargar productos de los movimientos diarios
        const movimientosIds = movimientosDiarios.map(m => m.id);
        
        const { data: productosMovimientos, error: errorProductosMovimientos } = await supabase
          .from('movimientos_diarios_productos')
          .select('movimiento_diario_id, producto_id, producto_nombre, cantidad_utilizada, unidad')
          .in('movimiento_diario_id', movimientosIds);

        if (errorProductosMovimientos) {
          throw new Error(`Error cargando productos de movimientos: ${errorProductosMovimientos.message}`);
        }

        console.log('📦 Productos de movimientos:', productosMovimientos);

        if (productosMovimientos && productosMovimientos.length > 0) {
          // Obtener IDs únicos de productos
          const productosIds = [...new Set(productosMovimientos.map((p) => p.producto_id))];

          // Cargar precios de productos
          const { data: productos, error: errorProductos } = await supabase
            .from('productos')
            .select('id, precio_unitario')
            .in('id', productosIds);

          console.log('💰 Productos con precios desde BD:', productos);
          console.log('❌ Error productos:', errorProductos);

          if (errorProductos) {
            console.error('❌ ERROR al cargar precios de productos:', errorProductos);
            setError(
              `No se pudieron cargar los precios: ${errorProductos.message}. Verifica tus permisos o contacta al administrador.`
            );
            setMovimientos([]);
            return;
          }

          if (!productos || productos.length === 0) {
            console.warn('⚠️ No se encontraron precios para los productos');
            setError('No hay precios configurados para los productos utilizados');
            setMovimientos([]);
            return;
          }

          // Verificar que los precios no sean nulos
          const productosSinPrecio = productos.filter(
            (p) => !p.precio_unitario || p.precio_unitario === 0
          );
          if (productosSinPrecio.length > 0) {
            console.warn('⚠️ Productos sin precio:', productosSinPrecio);
            setError(
              `${productosSinPrecio.length} producto(s) no tienen precio asignado. Por favor actualiza los precios antes de cerrar.`
            );
          }

          // Crear mapa de costos
          const costosMap = new Map(productos.map((p) => [p.id, p.precio_unitario || 0]));

          console.log('🗺️ Mapa de costos creado:', Object.fromEntries(costosMap));

          // Consolidar productos por movimiento (agrupar por fecha)
          
          movimientosDiarios.forEach(mov => {
            const productosDeMov = productosMovimientos.filter(
              p => p.movimiento_diario_id === mov.id
            );
            
            productosDeMov.forEach(prod => {
              // Convertir unidades a unidad base si es necesario
              let cantidadEnUnidadBase = prod.cantidad_utilizada;
              if (prod.unidad === 'cc') {
                cantidadEnUnidadBase = prod.cantidad_utilizada / 1000;
              } else if (prod.unidad === 'g') {
                cantidadEnUnidadBase = prod.cantidad_utilizada / 1000;
              }
              
              movimientosConsolidados.push({
                fecha: mov.fecha_movimiento,
                producto_id: prod.producto_id,
                producto_nombre: prod.producto_nombre,
                cantidad_utilizada: cantidadEnUnidadBase,
                numero_canecas_utilizadas: mov.numero_canecas,
                costo_unitario: costosMap.get(prod.producto_id) || 0,
              });
            });
          });

          console.log('✅ Movimientos cargados con costos:', movimientosConsolidados);
          setMovimientos(movimientosConsolidados);
        } else {
          console.warn('⚠️ No hay productos en los movimientos');
          setMovimientos([]);
        }
      } else {
        console.warn('⚠️ No hay movimientos para esta aplicación');
        setMovimientos([]);
      }

      // 4. Cargar productos planeados
      const { data: mezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacion.id);

      let productosPlaneados = null;

      if (mezclas && mezclas.length > 0) {
        const mezclasIds = mezclas.map((m) => m.id);

        const result = await supabase
          .from('aplicaciones_productos')
          .select('producto_id, producto_nombre, producto_unidad, cantidad_total_necesaria')
          .in('mezcla_id', mezclasIds);

        productosPlaneados = result.data;
      }

      console.log('📦 Productos planeados:', productosPlaneados);

      // 5. Consolidar insumos
      const insumosMap = new Map<string, ResumenInsumo>();

      // Agregar planeados
      productosPlaneados?.forEach((prod) => {
        const key = prod.producto_id;
        if (!insumosMap.has(key)) {
          insumosMap.set(key, {
            nombre: prod.producto_nombre,
            unidad: prod.producto_unidad,
            planeado: 0,
            aplicado: 0,
          });
        }
        const insumo = insumosMap.get(key)!;
        insumo.planeado += prod.cantidad_total_necesaria || 0;
      });

      // Agregar aplicados (de los movimientos consolidados)
      movimientosConsolidados?.forEach((mov) => {
        const key = mov.producto_id;
        if (!insumosMap.has(key)) {
          insumosMap.set(key, {
            nombre: mov.producto_nombre,
            unidad: 'litros',
            planeado: 0,
            aplicado: 0,
          });
        }
        const insumo = insumosMap.get(key)!;
        insumo.aplicado += mov.cantidad_utilizada || 0;
      });

      const insumos = Array.from(insumosMap.values());
      console.log('📋 Resumen de insumos:', insumos);
      setResumenInsumos(insumos);
    } catch (err: any) {
      console.error('Error cargando datos:', err);
      setError(err.message || 'Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const handleCerrarAplicacion = async () => {
    setProcesando(true);
    try {
      const totalArboles = lotes.reduce((sum, lote) => sum + lote.arboles, 0);
      const costoInsumos = movimientos.reduce(
        (sum, mov) => sum + mov.cantidad_utilizada * mov.costo_unitario,
        0
      );
      const costoManoObra = datosFinales.jornales * datosFinales.valorJornal;
      const costoTotal = costoInsumos + costoManoObra;
      const arbolesPorJornal = datosFinales.jornales > 0 ? totalArboles / datosFinales.jornales : 0;

      const { error } = await supabase
        .from('aplicaciones')
        .update({
          estado: 'Cerrada',
          fecha_cierre: new Date().toISOString(),
          fecha_inicio_ejecucion: datosFinales.fechaInicioReal,
          fecha_fin_ejecucion: datosFinales.fechaFinReal,
          jornales_utilizados: datosFinales.jornales,
          valor_jornal: datosFinales.valorJornal,
          costo_total_insumos: costoInsumos,
          costo_total_mano_obra: costoManoObra,
          costo_total: costoTotal,
          costo_por_arbol: totalArboles > 0 ? costoTotal / totalArboles : 0,
          arboles_jornal: arbolesPorJornal,
          observaciones_cierre: datosFinales.observaciones,
        })
        .eq('id', aplicacion.id);

      if (error) throw error;

      console.log('✅ Aplicación cerrada exitosamente');
      onCerrado();
    } catch (err: any) {
      console.error('Error cerrando aplicación:', err);
      setError('Error al cerrar la aplicación: ' + err.message);
    } finally {
      setProcesando(false);
    }
  };

  const formatearMoneda = (valor: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(valor);
  };

  const totalArboles = lotes.reduce((sum, lote) => sum + lote.arboles, 0);
  const costoInsumos = movimientos.reduce(
    (sum, mov) => sum + mov.cantidad_utilizada * mov.costo_unitario,
    0
  );
  const costoManoObra = datosFinales.jornales * datosFinales.valorJornal;
  const costoTotal = costoInsumos + costoManoObra;
  const costoPorArbol = totalArboles > 0 ? costoTotal / totalArboles : 0;
  const arbolesPorJornal = datosFinales.jornales > 0 ? totalArboles / datosFinales.jornales : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="bg-[#73991C] px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg">Cerrar Aplicación: {aplicacion.nombre}</h2>
            <div className="flex items-center gap-6 mt-2 text-sm text-white/80">
              <span className={paso === 'revision' ? 'text-white' : ''}>
                1. Revisión
              </span>
              <ChevronRight className="w-4 h-4" />
              <span className={paso === 'datos-finales' ? 'text-white' : ''}>
                2. Datos Finales
              </span>
              <ChevronRight className="w-4 h-4" />
              <span className={paso === 'confirmacion' ? 'text-white' : ''}>
                3. Confirmación
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENIDO */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          ) : (
            <>
              {/* PASO 1: REVISIÓN */}
              {paso === 'revision' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm text-[#172E08] mb-3 pb-2 border-b-2 border-[#73991C]">
                      Resumen de Canecas
                    </h3>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-2 px-3 text-xs text-[#4D240F]/70">
                            Planeado
                          </th>
                          <th className="text-left py-2 px-3 text-xs text-[#4D240F]/70">
                            Aplicado
                          </th>
                          <th className="text-left py-2 px-3 text-xs text-[#4D240F]/70">
                            Diferencia
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="py-2 px-3 text-[#172E08]">{canecasPlaneadas}</td>
                          <td className="py-2 px-3 text-[#73991C]">{canecasAplicadas}</td>
                          <td
                            className={`py-2 px-3 ${
                              canecasAplicadas > canecasPlaneadas
                                ? 'text-red-600'
                                : canecasAplicadas < canecasPlaneadas
                                ? 'text-yellow-600'
                                : 'text-gray-600'
                            }`}
                          >
                            {canecasAplicadas > canecasPlaneadas ? '+' : ''}
                            {canecasAplicadas - canecasPlaneadas}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h3 className="text-sm text-[#172E08] mb-3 pb-2 border-b-2 border-[#73991C]">
                      Resumen de Productos
                    </h3>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-2 px-3 text-xs text-[#4D240F]/70">
                            Producto
                          </th>
                          <th className="text-right py-2 px-3 text-xs text-[#4D240F]/70">
                            Planeado
                          </th>
                          <th className="text-right py-2 px-3 text-xs text-[#4D240F]/70">
                            Aplicado
                          </th>
                          <th className="text-right py-2 px-3 text-xs text-[#4D240F]/70">
                            Diferencia
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumenInsumos.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-[#4D240F]/50 text-sm">
                              No hay productos registrados
                            </td>
                          </tr>
                        ) : (
                          resumenInsumos.map((insumo, index) => {
                            const diferencia = insumo.aplicado - insumo.planeado;
                            return (
                              <tr key={index} className="border-b hover:bg-gray-50">
                                <td className="py-2 px-3">
                                  <div className="text-[#172E08]">{insumo.nombre}</div>
                                  <div className="text-xs text-[#4D240F]/50">{insumo.unidad}</div>
                                </td>
                                <td className="py-2 px-3 text-right text-[#172E08]">
                                  {insumo.planeado.toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right text-[#73991C]">
                                  {insumo.aplicado.toFixed(2)}
                                </td>
                                <td
                                  className={`py-2 px-3 text-right ${
                                    diferencia > 0.1
                                      ? 'text-red-600'
                                      : diferencia < -0.1
                                      ? 'text-yellow-600'
                                      : 'text-gray-600'
                                  }`}
                                >
                                  {diferencia > 0 ? '+' : ''}
                                  {diferencia.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* PASO 2: DATOS FINALES */}
              {paso === 'datos-finales' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-[#4D240F]/70 mb-2">
                        Jornales Utilizados
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={datosFinales.jornales}
                        onChange={(e) =>
                          setDatosFinales({ ...datosFinales, jornales: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#73991C]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-[#4D240F]/70 mb-2">
                        Valor del Jornal (COP)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={datosFinales.valorJornal}
                        onChange={(e) =>
                          setDatosFinales({
                            ...datosFinales,
                            valorJornal: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#73991C]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-[#4D240F]/70 mb-2">
                        Fecha Inicio Real
                      </label>
                      <input
                        type="date"
                        value={datosFinales.fechaInicioReal}
                        onChange={(e) =>
                          setDatosFinales({ ...datosFinales, fechaInicioReal: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#73991C]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-[#4D240F]/70 mb-2">
                        Fecha Fin Real
                      </label>
                      <input
                        type="date"
                        value={datosFinales.fechaFinReal}
                        onChange={(e) =>
                          setDatosFinales({ ...datosFinales, fechaFinReal: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#73991C]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-[#4D240F]/70 mb-2">
                      Observaciones de Cierre
                    </label>
                    <textarea
                      rows={4}
                      value={datosFinales.observaciones}
                      onChange={(e) =>
                        setDatosFinales({ ...datosFinales, observaciones: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#73991C]"
                      placeholder="Observaciones generales sobre la aplicación..."
                    />
                  </div>
                </div>
              )}

              {/* PASO 3: CONFIRMACIÓN */}
              {paso === 'confirmacion' && (
                <div className="space-y-6">
                  {/* Información General */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm text-[#172E08] mb-3">Información General</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-[#4D240F]/70">Tipo:</span>
                        <span className="ml-2 text-[#172E08]">
                          {aplicacion.tipo === 'fumigacion'
                            ? 'Fumigación'
                            : aplicacion.tipo === 'fertilizacion'
                            ? 'Fertilización'
                            : 'Drench'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#4D240F]/70">Propósito:</span>
                        <span className="ml-2 text-[#172E08]">
                          {aplicacion.proposito || 'No especificado'}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[#4D240F]/70">Blanco Biológico:</span>
                        <span className="ml-2 text-[#172E08]">{blancoBiologico}</span>
                      </div>
                      <div>
                        <span className="text-[#4D240F]/70">Fecha Inicio Planeada:</span>
                        <span className="ml-2 text-[#172E08]">
                          {formatearFecha(fechaInicioPlaneada)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#4D240F]/70">Fecha Fin Planeada:</span>
                        <span className="ml-2 text-[#172E08]">
                          {formatearFecha(fechaFinPlaneada)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#4D240F]/70">Fecha Inicio Real:</span>
                        <span className="ml-2 text-[#73991C]">
                          {formatearFecha(datosFinales.fechaInicioReal)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#4D240F]/70">Fecha Fin Real:</span>
                        <span className="ml-2 text-[#73991C]">
                          {formatearFecha(datosFinales.fechaFinReal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lotes */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm text-[#172E08] mb-3">Lotes Aplicados</h3>
                    <div className="space-y-2">
                      {lotes.map((lote, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="text-[#172E08]">{lote.nombre}</span>
                          <span className="text-[#4D240F]/70">
                            {lote.arboles.toLocaleString('es-CO')} árboles
                          </span>
                        </div>
                      ))}
                      <div className="border-t pt-2 mt-2 flex justify-between text-sm">
                        <span className="text-[#172E08]">Total</span>
                        <span className="text-[#172E08]">
                          {totalArboles.toLocaleString('es-CO')} árboles
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Resumen de Costos */}
                  <div className="bg-[#F8FAF5] border-2 border-[#73991C] rounded-lg p-5">
                    <h3 className="text-sm text-[#172E08] mb-4">Resumen de Costos</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-[#4D240F]/70">Insumos</span>
                        <span className="text-[#172E08]">{formatearMoneda(costoInsumos)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#4D240F]/70">
                          Mano de Obra ({datosFinales.jornales} jornales × {formatearMoneda(datosFinales.valorJornal)})
                        </span>
                        <span className="text-[#172E08]">{formatearMoneda(costoManoObra)}</span>
                      </div>
                      <div className="border-t-2 border-[#73991C] pt-3 flex justify-between">
                        <span className="text-[#172E08]">Total</span>
                        <span className="text-[#73991C] text-lg">
                          {formatearMoneda(costoTotal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Métricas */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                      <div className="text-xs text-blue-600 mb-1">Costo por Árbol</div>
                      <div className="text-lg text-blue-700">
                        {formatearMoneda(costoPorArbol)}
                      </div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                      <div className="text-xs text-green-600 mb-1">Árboles por Jornal</div>
                      <div className="text-lg text-green-700">
                        {arbolesPorJornal.toFixed(0)}
                      </div>
                    </div>
                  </div>

                  {/* Botón Ver Reporte */}
                  <button
                    disabled
                    className="w-full py-3 border-2 border-dashed border-gray-300 text-gray-400 rounded-lg flex items-center justify-center gap-2 cursor-not-allowed"
                  >
                    <FileText className="w-5 h-5" />
                    Ver Reporte Detallado (Próximamente)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOTER - BOTONES */}
        <div className="border-t p-4 bg-gray-50 flex items-center justify-between">
          <button
            onClick={() => {
              if (paso === 'datos-finales') setPaso('revision');
              if (paso === 'confirmacion') setPaso('datos-finales');
            }}
            disabled={paso === 'revision'}
            className="px-4 py-2 text-sm text-[#4D240F]/70 hover:text-[#4D240F] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-100"
            >
              Cancelar
            </button>

            {paso !== 'confirmacion' ? (
              <button
                onClick={() => {
                  if (paso === 'revision') setPaso('datos-finales');
                  if (paso === 'datos-finales') setPaso('confirmacion');
                }}
                className="px-4 py-2 text-sm bg-[#73991C] text-white rounded hover:bg-[#5f7d17] flex items-center gap-2"
              >
                Siguiente
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleCerrarAplicacion}
                disabled={procesando}
                className="px-6 py-2 text-sm bg-[#73991C] text-white rounded hover:bg-[#5f7d17] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {procesando ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Cerrando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirmar Cierre
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}