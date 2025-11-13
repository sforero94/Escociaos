import { useState, useEffect } from 'react';
import { X, ChevronRight, Check, FileText, Users, Calendar } from 'lucide-react';
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

interface LoteConArboles {
  lote_id: string;
  nombre: string;
  arboles: number;
}

// Nueva estructura para jornales por lote y actividad
interface JornalPorLote {
  lote_id: string;
  preparacion: number;
  aplicacion: number;
  transporte: number;
}

interface DatosFinales {
  jornalesPorLote: JornalPorLote[];
  valorJornal: number;
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
  const [lotes, setLotes] = useState<LoteConArboles[]>([]);
  const [blancoBiologico, setBlancoBiologico] = useState<string>('');
  const [fechaInicioPlaneada, setFechaInicioPlaneada] = useState<string>('');
  const [fechaFinPlaneada, setFechaFinPlaneada] = useState<string>('');

  // Datos finales del usuario - nueva estructura con matriz
  const [datosFinales, setDatosFinales] = useState<DatosFinales>({
    jornalesPorLote: [],
    valorJornal: 50000, // Valor por defecto
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

      // 1. Cargar aplicación completa con lotes
      const { data: appData } = await supabase
        .from('aplicaciones')
        .select(`
          *,
          aplicaciones_lotes (
            lote_id,
            lotes (
              id,
              nombre,
              total_arboles
            )
          )
        `)
        .eq('id', aplicacion.id)
        .single();

      console.log('📋 Datos de aplicación:', appData);

      // Extraer lotes con árboles
      const lotesData: LoteConArboles[] = appData?.aplicaciones_lotes?.map((al: any) => ({
        lote_id: al.lotes?.id || '',
        nombre: al.lotes?.nombre || 'Sin nombre',
        arboles: al.lotes?.total_arboles || 0,
      })) || [];
      
      setLotes(lotesData);

      // Inicializar matriz de jornales con los lotes cargados
      const jornalesIniciales: JornalPorLote[] = lotesData.map(lote => ({
        lote_id: lote.lote_id,
        preparacion: 0,
        aplicacion: 0,
        transporte: 0,
      }));
      setDatosFinales(prev => ({ ...prev, jornalesPorLote: jornalesIniciales }));

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

          if (errorProductos) {
            console.error('❌ ERROR al cargar precios de productos:', errorProductos);
            setError(
              `No se pudieron cargar los precios: ${errorProductos.message}. Verifica tus permisos o contacta al administrador.`
            );
            setMovimientos([]);
            setLoading(false);
            return;
          }

          if (!productos || productos.length === 0) {
            console.warn('⚠️ No se encontraron precios para los productos');
            setError('No hay precios configurados para los productos utilizados');
            setMovimientos([]);
            setLoading(false);
            return;
          }

          // Verificar que los precios no sean nulos
          const productosSinPrecio = productos.filter(
            (p) => !p.precio_unitario || p.precio_unitario === 0
          );
          if (productosSinPrecio.length > 0) {
            console.warn('⚠️ Productos sin precio:', productosSinPrecio);
            setError(
              `${productosSinPrecio.length} producto(s) no tienen precio asignado. Por favor actualiza los precios en el módulo de Inventario antes de cerrar.`
            );
            setMovimientos([]);
            setLoading(false);
            return;
          }

          // Crear mapa de costos
          const costosMap = new Map(productos.map((p) => [p.id, p.precio_unitario || 0]));

          // Consolidar productos por movimiento
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

      // Agregar aplicados
      movimientosConsolidados.forEach((mov) => {
        const key = mov.producto_id;
        if (!insumosMap.has(key)) {
          insumosMap.set(key, {
            nombre: mov.producto_nombre,
            unidad: 'L/Kg',
            planeado: 0,
            aplicado: 0,
          });
        }
        const insumo = insumosMap.get(key)!;
        insumo.aplicado += mov.cantidad_utilizada;
      });

      setResumenInsumos(Array.from(insumosMap.values()));

      console.log('✅ Datos cargados exitosamente');
    } catch (err: any) {
      console.error('Error cargando datos:', err);
      setError('Error al cargar los datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * ACTUALIZAR JORNAL DE UN LOTE EN UNA ACTIVIDAD ESPECÍFICA
   */
  const actualizarJornal = (loteId: string, actividad: 'preparacion' | 'aplicacion' | 'transporte', valor: number) => {
    setDatosFinales(prev => ({
      ...prev,
      jornalesPorLote: prev.jornalesPorLote.map(j =>
        j.lote_id === loteId ? { ...j, [actividad]: valor } : j
      ),
    }));
  };

  /**
   * CERRAR APLICACIÓN
   */
  const cerrarAplicacion = async () => {
    try {
      setProcesando(true);
      console.log('🔒 Iniciando cierre de aplicación...');

      // Calcular total de jornales
      const totalJornales = datosFinales.jornalesPorLote.reduce(
        (sum, j) => sum + j.preparacion + j.aplicacion + j.transporte,
        0
      );

      // Calcular días de aplicación
      const fechaInicio = new Date(datosFinales.fechaInicioReal);
      const fechaFin = new Date(datosFinales.fechaFinReal);
      const diasAplicacion = Math.ceil((fechaFin.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser();

      // 1️⃣ CREAR REGISTRO EN aplicaciones_cierre
      const { data: cierreData, error: errorCierre } = await supabase
        .from('aplicaciones_cierre')
        .insert([
          {
            aplicacion_id: aplicacion.id,
            fecha_cierre: datosFinales.fechaFinReal,
            dias_aplicacion: diasAplicacion,
            valor_jornal: datosFinales.valorJornal,
            observaciones_generales: datosFinales.observaciones || null,
            cerrado_por: user?.email || null,
          },
        ])
        .select()
        .single();

      if (errorCierre) {
        console.error('❌ Error creando registro de cierre:', errorCierre);
        throw new Error('Error al crear registro de cierre: ' + errorCierre.message);
      }

      console.log('✅ Registro de cierre creado:', cierreData.id);

      // 2️⃣ ACTUALIZAR TABLA aplicaciones (simplificado)
      const { error: errorUpdate } = await supabase
        .from('aplicaciones')
        .update({
          estado: 'Cerrada',
          fecha_cierre: datosFinales.fechaFinReal,
          fecha_inicio_ejecucion: datosFinales.fechaInicioReal,
          fecha_fin_ejecucion: datosFinales.fechaFinReal,
          jornales_utilizados: totalJornales,
          valor_jornal: datosFinales.valorJornal,
          observaciones_cierre: datosFinales.observaciones,
          // 💰 CAMPOS DE COSTOS - Ahora se guardan correctamente
          costo_total_insumos: costoInsumos,
          costo_total_mano_obra: costoManoObra,
          costo_total: costoTotal,
          costo_por_arbol: costoPorArbol,
        })
        .eq('id', aplicacion.id);

      if (errorUpdate) {
        console.error('❌ Error actualizando aplicación:', errorUpdate);
        throw new Error('Error al actualizar la aplicación: ' + errorUpdate.message);
      }

      console.log('✅ Aplicación actualizada a estado Cerrada');

      // 3️⃣ CONSOLIDAR INVENTARIO DE PRODUCTOS APLICADOS
      if (movimientos.length > 0) {
        console.log('📦 Consolidando inventario...');

        // Agrupar movimientos por producto
        const consolidado = new Map<string, { nombre: string; cantidad: number }>();

        movimientos.forEach((mov) => {
          if (!consolidado.has(mov.producto_id)) {
            consolidado.set(mov.producto_id, {
              nombre: mov.producto_nombre,
              cantidad: 0,
            });
          }

          const item = consolidado.get(mov.producto_id)!;
          item.cantidad += mov.cantidad_utilizada;
        });

        console.log('📊 Productos consolidados:', Object.fromEntries(consolidado));

        // Para cada producto: actualizar inventario y crear movimiento
        for (const [productoId, { nombre, cantidad }] of consolidado.entries()) {
          // a) Obtener datos actuales del producto
          const { data: producto, error: errorProd } = await supabase
            .from('productos')
            .select('cantidad_actual, unidad_medida, precio_unitario')
            .eq('id', productoId)
            .single();

          if (errorProd || !producto) {
            console.error(`❌ Error obteniendo producto ${productoId}:`, errorProd);
            throw new Error(`Error obteniendo datos del producto ${nombre}`);
          }

          const saldoAnterior = producto.cantidad_actual || 0;
          const saldoNuevo = saldoAnterior - cantidad;

          // b) Actualizar inventario
          const { error: errorUpdate } = await supabase
            .from('productos')
            .update({ cantidad_actual: saldoNuevo })
            .eq('id', productoId);

          if (errorUpdate) {
            console.error(`❌ Error actualizando inventario de ${productoId}:`, errorUpdate);
            throw new Error(`Error actualizando inventario de ${nombre}`);
          }

          // c) Crear movimiento de salida
          const { error: errorMov } = await supabase
            .from('movimientos_inventario')
            .insert({
              fecha_movimiento: datosFinales.fechaFinReal,
              producto_id: productoId,
              tipo_movimiento: 'Salida por Aplicación',
              cantidad: cantidad,
              unidad: producto.unidad_medida,
              lote_aplicacion: lotes.map(l => l.nombre).join(', '),
              aplicacion_id: aplicacion.id,
              saldo_anterior: saldoAnterior,
              saldo_nuevo: saldoNuevo,
              valor_movimiento: cantidad * (producto.precio_unitario || 0),
              responsable: user?.email,
              observaciones: `Cierre de aplicación: ${aplicacion.nombre}`,
              provisional: false
            });

          if (errorMov) {
            console.error(`❌ Error creando movimiento de inventario para ${productoId}:`, errorMov);
            throw new Error(`Error registrando movimiento de ${nombre}`);
          }

          console.log(`✅ Producto ${nombre}: ${saldoAnterior.toFixed(2)} → ${saldoNuevo.toFixed(2)} ${producto.unidad_medida}`);
        }

        console.log('✅ Inventario consolidado exitosamente');
      }

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

  // Cálculos
  const totalArboles = lotes.reduce((sum, lote) => sum + lote.arboles, 0);
  const costoInsumos = movimientos.reduce(
    (sum, mov) => sum + mov.cantidad_utilizada * mov.costo_unitario,
    0
  );
  const totalJornales = datosFinales.jornalesPorLote.reduce(
    (sum, j) => sum + j.preparacion + j.aplicacion + j.transporte,
    0
  );
  const costoManoObra = totalJornales * datosFinales.valorJornal;
  const costoTotal = costoInsumos + costoManoObra;
  const costoPorArbol = totalArboles > 0 ? costoTotal / totalArboles : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-[#73991C] to-[#BFD97D] px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl">Cerrar Aplicación</h2>
            <p className="text-sm text-white/90 mt-1">{aplicacion.nombre}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEPPER */}
        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
          <div className="flex items-center justify-center gap-2">
            <div className={`flex items-center gap-2 ${paso === 'revision' ? 'text-[#73991C]' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${paso === 'revision' ? 'bg-[#73991C] text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span className="text-sm hidden sm:inline">Revisión</span>
            </div>
            
            <ChevronRight className="w-4 h-4 text-gray-400" />
            
            <div className={`flex items-center gap-2 ${paso === 'datos-finales' ? 'text-[#73991C]' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${paso === 'datos-finales' ? 'bg-[#73991C] text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="text-sm hidden sm:inline">Jornales</span>
            </div>
            
            <ChevronRight className="w-4 h-4 text-gray-400" />
            
            <div className={`flex items-center gap-2 ${paso === 'confirmacion' ? 'text-[#73991C]' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${paso === 'confirmacion' ? 'bg-[#73991C] text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span className="text-sm hidden sm:inline">Confirmación</span>
            </div>
          </div>
        </div>

        {/* CONTENIDO */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-12 h-12 border-4 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 px-6 py-4 rounded-xl">
              <p className="font-medium">⚠️ Error</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          ) : (
            <>
              {/* ========================================= */}
              {/* PASO 1: REVISIÓN - TABLA MEJORADA */}
              {/* ========================================= */}
              {paso === 'revision' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg text-[#172E08] mb-4">Resumen de la Aplicación</h3>
                    
                    {/* Información General */}
                    <div className="bg-gradient-to-br from-[#73991C]/5 to-[#BFD97D]/5 border border-[#73991C]/20 rounded-xl p-5 mb-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-[#4D240F]/70 mb-1">Tipo</p>
                          <p className="text-sm text-[#172E08] font-medium">
                            {aplicacion.tipo_aplicacion === 'Fumigación' ? 'Fumigación' : 
                             aplicacion.tipo_aplicacion === 'Fertilización' ? 'Fertilización' : 'Drench'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#4D240F]/70 mb-1">Lotes</p>
                          <p className="text-sm text-[#172E08] font-medium">{lotes.length} lotes</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#4D240F]/70 mb-1">Total Árboles</p>
                          <p className="text-sm text-[#172E08] font-medium">{totalArboles.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#4D240F]/70 mb-1">Propósito</p>
                          <p className="text-sm text-[#172E08] font-medium truncate">{aplicacion.proposito || 'No especificado'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Tabla de Insumos - Mejorada */}
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                        <h4 className="text-sm text-[#172E08] font-medium">Insumos Utilizados</h4>
                      </div>
                      
                      {resumenInsumos.length === 0 ? (
                        <div className="p-8 text-center">
                          <p className="text-sm text-[#4D240F]/70">No hay insumos registrados</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs text-[#4D240F]/70">Producto</th>
                                <th className="px-4 py-3 text-right text-xs text-[#4D240F]/70">Planeado</th>
                                <th className="px-4 py-3 text-right text-xs text-[#4D240F]/70">Aplicado</th>
                                <th className="px-4 py-3 text-right text-xs text-[#4D240F]/70">Diferencia</th>
                                <th className="px-4 py-3 text-center text-xs text-[#4D240F]/70">Estado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {resumenInsumos.map((insumo, index) => {
                                const diferencia = insumo.aplicado - insumo.planeado;
                                const porcentaje = insumo.planeado > 0 
                                  ? ((insumo.aplicado / insumo.planeado) * 100)
                                  : 0;
                                const esCritico = Math.abs(diferencia / insumo.planeado) > 0.15;

                                return (
                                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 text-sm text-[#172E08]">
                                      {insumo.nombre}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[#4D240F]/70 text-right">
                                      {insumo.planeado.toFixed(2)} {insumo.unidad}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[#172E08] font-medium text-right">
                                      {insumo.aplicado.toFixed(2)} {insumo.unidad}
                                    </td>
                                    <td className={`px-4 py-3 text-sm text-right ${
                                      diferencia > 0 ? 'text-orange-600' : diferencia < 0 ? 'text-blue-600' : 'text-gray-600'
                                    }`}>
                                      {diferencia > 0 ? '+' : ''}{diferencia.toFixed(2)} {insumo.unidad}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs ${
                                        esCritico 
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-green-100 text-green-700'
                                      }`}>
                                        {esCritico ? '⚠️ Desviado' : '✓ OK'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Tabla de Canecas (solo para fumigación) */}
                    {aplicacion.tipo_aplicacion === 'Fumigación' && (
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mt-4">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                          <h4 className="text-sm text-[#172E08] font-medium">Control de Canecas</h4>
                        </div>
                        <div className="p-4">
                          <div className="grid grid-cols-3 gap-4">
                            <div className="text-center">
                              <p className="text-xs text-[#4D240F]/70 mb-1">Planeadas</p>
                              <p className="text-2xl text-[#172E08] font-semibold">{canecasPlaneadas}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-[#4D240F]/70 mb-1">Aplicadas</p>
                              <p className="text-2xl text-[#73991C] font-semibold">{canecasAplicadas}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-[#4D240F]/70 mb-1">Diferencia</p>
                              <p className={`text-2xl font-semibold ${
                                canecasAplicadas - canecasPlaneadas > 0 ? 'text-orange-600' : 
                                canecasAplicadas - canecasPlaneadas < 0 ? 'text-blue-600' : 'text-gray-600'
                              }`}>
                                {canecasAplicadas - canecasPlaneadas > 0 ? '+' : ''}
                                {canecasAplicadas - canecasPlaneadas}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ========================================= */}
              {/* PASO 2: DATOS FINALES - MATRIZ DE JORNALES */}
              {/* ========================================= */}
              {paso === 'datos-finales' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg text-[#172E08] mb-2">Registro de Jornales</h3>
                    <p className="text-sm text-[#4D240F]/70 mb-4">
                      Registra los jornales utilizados por lote y tipo de actividad
                    </p>

                    {/* Matriz de Jornales */}
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-sm text-[#172E08]">Lote</th>
                              <th className="px-4 py-3 text-center text-sm text-[#4D240F]/70">
                                <div className="flex items-center justify-center gap-2">
                                  <Users className="w-4 h-4" />
                                  Preparación
                                </div>
                              </th>
                              <th className="px-4 py-3 text-center text-sm text-[#4D240F]/70">
                                <div className="flex items-center justify-center gap-2">
                                  <Users className="w-4 h-4" />
                                  Aplicación
                                </div>
                              </th>
                              <th className="px-4 py-3 text-center text-sm text-[#4D240F]/70">
                                <div className="flex items-center justify-center gap-2">
                                  <Users className="w-4 h-4" />
                                  Transporte
                                </div>
                              </th>
                              <th className="px-4 py-3 text-center text-sm text-[#172E08] font-medium bg-gray-100">
                                Total
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {lotes.map((lote, index) => {
                              const jornal = datosFinales.jornalesPorLote.find(j => j.lote_id === lote.lote_id) || {
                                lote_id: lote.lote_id,
                                preparacion: 0,
                                aplicacion: 0,
                                transporte: 0,
                              };
                              const totalLote = jornal.preparacion + jornal.aplicacion + jornal.transporte;

                              return (
                                <tr key={lote.lote_id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-3">
                                    <div>
                                      <p className="text-sm text-[#172E08] font-medium">{lote.nombre}</p>
                                      <p className="text-xs text-[#4D240F]/60">{lote.arboles.toLocaleString()} árboles</p>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.5"
                                      value={jornal.preparacion || ''}
                                      onChange={(e) => actualizarJornal(lote.lote_id, 'preparacion', parseFloat(e.target.value) || 0)}
                                      className="w-20 px-2 py-1.5 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C] text-sm"
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.5"
                                      value={jornal.aplicacion || ''}
                                      onChange={(e) => actualizarJornal(lote.lote_id, 'aplicacion', parseFloat(e.target.value) || 0)}
                                      className="w-20 px-2 py-1.5 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C] text-sm"
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.5"
                                      value={jornal.transporte || ''}
                                      onChange={(e) => actualizarJornal(lote.lote_id, 'transporte', parseFloat(e.target.value) || 0)}
                                      className="w-20 px-2 py-1.5 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C] text-sm"
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-center bg-gray-50">
                                    <span className="text-sm text-[#172E08] font-semibold">
                                      {totalLote.toFixed(1)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-[#73991C]/10">
                            <tr>
                              <td className="px-4 py-3 text-sm text-[#172E08] font-semibold">
                                Total General
                              </td>
                              <td className="px-4 py-3 text-center text-sm text-[#172E08] font-medium">
                                {datosFinales.jornalesPorLote.reduce((sum, j) => sum + j.preparacion, 0).toFixed(1)}
                              </td>
                              <td className="px-4 py-3 text-center text-sm text-[#172E08] font-medium">
                                {datosFinales.jornalesPorLote.reduce((sum, j) => sum + j.aplicacion, 0).toFixed(1)}
                              </td>
                              <td className="px-4 py-3 text-center text-sm text-[#172E08] font-medium">
                                {datosFinales.jornalesPorLote.reduce((sum, j) => sum + j.transporte, 0).toFixed(1)}
                              </td>
                              <td className="px-4 py-3 text-center text-lg text-[#73991C] font-bold bg-[#73991C]/20">
                                {totalJornales.toFixed(1)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    {/* Valor del Jornal y Fechas */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
                        />
                      </div>
                    </div>

                    {/* Observaciones */}
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
                        placeholder="Describe cualquier incidencia, clima, rendimiento del personal, etc..."
                      />
                    </div>

                    {/* Resumen de Costos */}
                    <div className="bg-gradient-to-br from-[#73991C]/5 to-[#BFD97D]/5 border border-[#73991C]/20 rounded-xl p-5 mt-6">
                      <h4 className="text-sm text-[#172E08] font-medium mb-3">Resumen de Costos</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-[#4D240F]/70 mb-1">Insumos</p>
                          <p className="text-lg text-[#172E08] font-semibold">
                            {formatearMoneda(costoInsumos)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#4D240F]/70 mb-1">Mano de Obra</p>
                          <p className="text-lg text-[#172E08] font-semibold">
                            {formatearMoneda(costoManoObra)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#4D240F]/70 mb-1">Total</p>
                          <p className="text-lg text-[#73991C] font-bold">
                            {formatearMoneda(costoTotal)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#4D240F]/70 mb-1">Costo/Árbol</p>
                          <p className="text-lg text-[#172E08] font-semibold">
                            {formatearMoneda(costoPorArbol)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================= */}
              {/* PASO 3: CONFIRMACIÓN */}
              {/* ========================================= */}
              {paso === 'confirmacion' && (
                <div className="space-y-6">
                  <div className="bg-gradient-to-br from-[#73991C]/5 to-[#BFD97D]/5 border-2 border-[#73991C]/30 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-[#73991C] rounded-full flex items-center justify-center">
                        <Check className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg text-[#172E08]">Confirmar Cierre</h3>
                        <p className="text-sm text-[#4D240F]/70">
                          Revisa los datos antes de cerrar la aplicación
                        </p>
                      </div>
                    </div>

                    {/* Resumen Final */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Información General */}
                      <div>
                        <h4 className="text-sm text-[#172E08] font-medium mb-3">Información General</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-[#4D240F]/70">Aplicación:</span>
                            <span className="text-[#172E08] font-medium">{aplicacion.nombre}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#4D240F]/70">Tipo:</span>
                            <span className="text-[#172E08]">
                              {aplicacion.tipo_aplicacion === 'Fumigación' ? 'Fumigación' : 
                               aplicacion.tipo_aplicacion === 'Fertilización' ? 'Fertilización' : 'Drench'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#4D240F]/70">Lotes:</span>
                            <span className="text-[#172E08]">{lotes.length} lotes</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#4D240F]/70">Árboles:</span>
                            <span className="text-[#172E08]">{totalArboles.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Fechas y Jornales */}
                      <div>
                        <h4 className="text-sm text-[#172E08] font-medium mb-3">Ejecución</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-[#4D240F]/70">Inicio:</span>
                            <span className="text-[#172E08]">{formatearFecha(datosFinales.fechaInicioReal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#4D240F]/70">Fin:</span>
                            <span className="text-[#172E08]">{formatearFecha(datosFinales.fechaFinReal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#4D240F]/70">Jornales:</span>
                            <span className="text-[#172E08] font-medium">{totalJornales.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#4D240F]/70">Valor Jornal:</span>
                            <span className="text-[#172E08]">{formatearMoneda(datosFinales.valorJornal)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Costos Totales */}
                    <div className="mt-6 pt-6 border-t-2 border-[#73991C]/20">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <p className="text-xs text-[#4D240F]/70 mb-1">Insumos</p>
                          <p className="text-base text-[#172E08] font-semibold">
                            {formatearMoneda(costoInsumos)}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-[#4D240F]/70 mb-1">Mano de Obra</p>
                          <p className="text-base text-[#172E08] font-semibold">
                            {formatearMoneda(costoManoObra)}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-[#4D240F]/70 mb-1">Costo Total</p>
                          <p className="text-lg text-[#73991C] font-bold">
                            {formatearMoneda(costoTotal)}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-[#4D240F]/70 mb-1">Costo/Árbol</p>
                          <p className="text-base text-[#172E08] font-semibold">
                            {formatearMoneda(costoPorArbol)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Observaciones */}
                    {datosFinales.observaciones && (
                      <div className="mt-6 pt-6 border-t-2 border-[#73991C]/20">
                        <h4 className="text-sm text-[#172E08] font-medium mb-2">Observaciones</h4>
                        <p className="text-sm text-[#4D240F]/70 italic">
                          "{datosFinales.observaciones}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Advertencia */}
                  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
                    <p className="text-sm text-yellow-800">
                      ⚠️ <strong>Importante:</strong> Al cerrar esta aplicación se descontarán los insumos del inventario
                      y no se podrán realizar más modificaciones.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOTER - BOTONES */}
        {!loading && !error && (
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div>
              {paso !== 'revision' && (
                <button
                  onClick={() => {
                    if (paso === 'datos-finales') setPaso('revision');
                    if (paso === 'confirmacion') setPaso('datos-finales');
                  }}
                  className="px-4 py-2 text-[#4D240F]/70 hover:text-[#172E08] transition-colors"
                >
                  ← Anterior
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-[#4D240F]/70 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>

              {paso === 'revision' && (
                <button
                  onClick={() => setPaso('datos-finales')}
                  className="px-6 py-2 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-lg hover:from-[#5f7d17] hover:to-[#9db86d] transition-all flex items-center gap-2"
                >
                  Continuar
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {paso === 'datos-finales' && (
                <button
                  onClick={() => setPaso('confirmacion')}
                  className="px-6 py-2 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-lg hover:from-[#5f7d17] hover:to-[#9db86d] transition-all flex items-center gap-2"
                >
                  Continuar
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {paso === 'confirmacion' && (
                <button
                  onClick={cerrarAplicacion}
                  disabled={procesando}
                  className="px-6 py-2 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg hover:from-green-700 hover:to-green-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {procesando ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Cerrando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Cerrar Aplicación
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}