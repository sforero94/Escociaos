import { useState, useEffect } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  FileText,
  ArrowLeft,
  ArrowRight,
  X,
  Save,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { PasoCierreRevision } from './PasoCierreRevision';
import { PasoCierreDatos } from './PasoCierreDatos';
import { PasoCierreValidacion } from './PasoCierreValidacion';
import { PasoCierreConfirmacion } from './PasoCierreConfirmacion';
import type {
  Aplicacion,
  CierreAplicacion as CierreAplicacionType,
  MovimientoDiario,
  JornalesPorActividad,
  DetalleCierreLote,
  ComparacionProducto,
} from '../../types/aplicaciones';

interface CierreAplicacionProps {
  aplicacion: Aplicacion;
  onClose: () => void;
  onCierreCompleto: () => void;
}

export function CierreAplicacion({ aplicacion, onClose, onCierreCompleto }: CierreAplicacionProps) {
  const supabase = getSupabase();
  const [pasoActual, setPasoActual] = useState<1 | 2 | 3 | 4>(1);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Datos del cierre
  const [fechaFinal, setFechaFinal] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [valorJornal, setValorJornal] = useState<number>(60000); // Valor por defecto
  const [jornalesTotales, setJornalesTotales] = useState<JornalesPorActividad>({
    aplicacion: 0,
    mezcla: 0,
    transporte: 0,
    otros: 0,
  });
  const [observaciones, setObservaciones] = useState({
    generales: '',
    meteorologicas: '',
    problemas: '',
    ajustes: '',
  });

  // Datos calculados
  const [movimientos, setMovimientos] = useState<MovimientoDiario[]>([]);
  const [detallesLotes, setDetallesLotes] = useState<DetalleCierreLote[]>([]);
  const [comparacionProductos, setComparacionProductos] = useState<ComparacionProducto[]>([]);
  const [requiereAprobacion, setRequiereAprobacion] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, [aplicacion.id]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      await Promise.all([cargarMovimientos(), cargarConfiguracionCompleta()]);
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const cargarConfiguracionCompleta = async () => {
    try {
      console.log('=== CARGANDO CONFIGURACIÓN DESDE TABLAS RELACIONADAS ===');
      console.log('ID de aplicación:', aplicacion.id);

      // Cargar MEZCLAS (sin productos, los cargamos después)
      const { data: mezclas, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('*')
        .eq('aplicacion_id', aplicacion.id)
        .order('numero_mezcla', { ascending: true });

      if (errorMezclas) {
        console.error('Error cargando mezclas:', errorMezclas);
        return;
      }

      console.log('Mezclas cargadas:', mezclas);

      if (!mezclas || mezclas.length === 0) {
        console.warn('No se encontraron mezclas para esta aplicación');
        return;
      }

      // Cargar PRODUCTOS desde aplicaciones_productos (no desde aplicaciones_mezclas_productos)
      const { data: productosCalc, error: errorProductos } = await supabase
        .from('aplicaciones_productos')
        .select('*, producto:productos(id, nombre, unidad_medida, categoria)')
        .in('mezcla_id', mezclas.map(m => m.id));

      if (errorProductos) {
        console.error('Error cargando productos:', errorProductos);
      } else {
        console.log('🔍 Productos cargados desde aplicaciones_productos:', productosCalc);
      }

      // Transformar al formato que espera el código
      aplicacion.mezclas = mezclas.map((mezcla) => {
        // Filtrar productos de esta mezcla
        const productosDeEstaMezcla = productosCalc?.filter(
          (p: any) => p.mezcla_id === mezcla.id
        ) || [];

        return {
          id: mezcla.id,
          numero_mezcla: mezcla.numero_mezcla,
          nombre_mezcla: mezcla.nombre_mezcla,
          productos: productosDeEstaMezcla.map((prod: any) => ({
            id: prod.id,
            producto_id: prod.producto_id,
            producto_nombre: prod.producto_nombre || prod.producto?.nombre || '',
            producto_unidad: prod.producto_unidad || prod.producto?.unidad_medida || '',
            producto_categoria: prod.producto_categoria || prod.producto?.categoria || '',
            dosis: prod.dosis_por_caneca || 0,
            unidad_dosis: prod.unidad_dosis || '',
            cantidad_total_necesaria: prod.cantidad_total_necesaria || 0,
          })),
        };
      });

      console.log('✅ Mezclas transformadas:', aplicacion.mezclas);
      console.log('✅ Productos en primera mezcla:', aplicacion.mezclas[0]?.productos);

      // Cargar CÁLCULOS (incluye canecas planeadas por lote)
      const { data: calculos, error: errorCalculos } = await supabase
        .from('aplicaciones_calculos')
        .select('*, lote:lotes(id, nombre)')
        .eq('aplicacion_id', aplicacion.id);

      if (errorCalculos) {
        console.error('Error cargando cálculos:', errorCalculos);
      } else {
        console.log('✅ Cálculos cargados (canecas planeadas):', calculos);
        
        if (calculos && calculos.length > 0) {
          aplicacion.calculos = calculos.map((calc: any) => ({
            id: calc.id,
            lote_id: calc.lote_id,
            lote_nombre: calc.lote_nombre || calc.lote?.nombre || '',
            area_hectareas: calc.area_hectareas,
            total_arboles: calc.total_arboles,
            litros_mezcla: calc.litros_mezcla,
            numero_canecas: calc.numero_canecas || 0,
            kilos_totales: calc.kilos_totales,
            numero_bultos: calc.numero_bultos,
          }));
        }
      }

      // Cargar CONFIGURACIÓN DE LOTES
      const { data: lotesConfig, error: errorLotes } = await supabase
        .from('aplicaciones_lotes')
        .select('*, lote:lotes(id, nombre)')
        .eq('aplicacion_id', aplicacion.id);

      if (errorLotes) {
        console.error('Error cargando configuración de lotes:', errorLotes);
      } else {
        console.log('Configuración de lotes:', lotesConfig);
        
        if (lotesConfig && lotesConfig.length > 0) {
          aplicacion.configuracion = {
            lotes_seleccionados: lotesConfig.map((lc: any) => ({
              id: lc.lote_id,
              nombre: lc.lote?.nombre || '',
              conteo_arboles: {
                grandes: lc.arboles_grandes || 0,
                medianos: lc.arboles_medianos || 0,
                pequenos: lc.arboles_pequenos || 0,
                clonales: lc.arboles_clonales || 0,
                total: lc.total_arboles || 0,
              },
              calibracion: lc.calibracion_litros_arbol || 0,
              tamano_caneca: lc.tamano_caneca || 0,
            })),
          };
        }
      }

      // Cargar LISTA DE COMPRAS
      const { data: listaCompras, error: errorCompras } = await supabase
        .from('aplicaciones_compras')
        .select('*')
        .eq('aplicacion_id', aplicacion.id);

      if (errorCompras) {
        console.error('Error cargando lista de compras:', errorCompras);
      } else {
        console.log('Lista de compras:', listaCompras);
        
        if (listaCompras && listaCompras.length > 0) {
          aplicacion.lista_compras = {
            items: listaCompras.map((lc: any) => ({
              producto_id: lc.producto_id,
              producto_nombre: lc.producto_nombre,
              cantidad_total: lc.cantidad_necesaria,
              cantidad: lc.cantidad_necesaria,
            })),
            costo_total_estimado: listaCompras.reduce(
              (sum: number, lc: any) => sum + (lc.costo_estimado || 0),
              0
            ),
            productos_sin_precio: 0,
            productos_sin_stock: 0,
          };
        }
      }

      console.log('=== CONFIGURACIÓN FINAL ===');
      console.log('aplicacion.mezclas:', aplicacion.mezclas);
      console.log('aplicacion.calculos:', aplicacion.calculos);
      console.log('aplicacion.configuracion:', aplicacion.configuracion);
      console.log('aplicacion.lista_compras:', aplicacion.lista_compras);
      console.log('Resumen:', {
        mezclas: aplicacion.mezclas?.length || 0,
        productos_total: aplicacion.mezclas?.reduce((sum, m) => sum + m.productos.length, 0) || 0,
        lotes: aplicacion.configuracion?.lotes_seleccionados?.length || 0,
      });
    } catch (err: any) {
      console.error('Error cargando configuración completa:', err);
    }
  };

  const cargarMovimientos = async () => {
    try {
      const { data, error } = await supabase
        .from('movimientos_diarios')
        .select('*')
        .eq('aplicacion_id', aplicacion.id)
        .order('fecha_movimiento', { ascending: true });

      if (error) throw error;
      
      console.log('📦 Movimientos cargados desde BD:', data);
      
      // Cargar costos de productos por separado
      if (data && data.length > 0) {
        const productosIds = [...new Set(data.map(m => m.producto_id))];
        
        console.log('🔍 IDs de productos a buscar:', productosIds);
        
        const { data: productos, error: errorProductos } = await supabase
          .from('productos')
          .select('id, precio_unitario')
          .in('id', productosIds);
        
        console.log('💰 Productos con precios desde BD:', productos);
        console.log('❌ Error productos:', errorProductos);
        
        if (!errorProductos && productos) {
          // Crear mapa de costos
          const costosMap = new Map(
            productos.map(p => [p.id, p.precio_unitario || 0])
          );
          
          console.log('🗺️ Mapa de costos creado:', Object.fromEntries(costosMap));
          
          // Agregar costo unitario a cada movimiento
          const movimientosConCosto = data.map(mov => ({
            ...mov,
            costo_unitario: costosMap.get(mov.producto_id) || 0,
          }));
          
          console.log('✅ Movimientos cargados con costos:', movimientosConCosto);
          setMovimientos(movimientosConCosto);
        } else {
          console.warn('⚠️ No se pudieron cargar costos, usando movimientos sin costo');
          setMovimientos(data);
        }
      } else {
        console.warn('⚠️ No hay movimientos para esta aplicación');
        setMovimientos(data || []);
      }
    } catch (err: any) {
      console.error('Error cargando movimientos:', err);
      setError('Error al cargar los movimientos diarios');
    }
  };

  const calcularDiasAplicacion = (): number => {
    const fechaInicio = new Date(aplicacion.fecha_inicio);
    const fechaFin = new Date(fechaFinal);
    const diferencia = fechaFin.getTime() - fechaInicio.getTime();
    return Math.ceil(diferencia / (1000 * 60 * 60 * 24)) + 1;
  };

  const puedeAvanzar = (): boolean => {
    switch (pasoActual) {
      case 1:
        // Validar que haya movimientos registrados
        return movimientos.length > 0;
      case 2:
        // Validar datos del cierre
        return (
          fechaFinal !== '' &&
          valorJornal > 0 &&
          (jornalesTotales.aplicacion +
            jornalesTotales.mezcla +
            jornalesTotales.transporte +
            (jornalesTotales.otros || 0)) > 0
        );
      case 3:
        // Paso de validación, siempre puede avanzar
        return true;
      case 4:
        // Último paso
        return false;
      default:
        return false;
    }
  };

  const avanzarPaso = () => {
    if (pasoActual < 4 && puedeAvanzar()) {
      setPasoActual((prev) => (prev + 1) as 1 | 2 | 3 | 4);
    }
  };

  const retrocederPaso = () => {
    if (pasoActual > 1) {
      setPasoActual((prev) => (prev - 1) as 1 | 2 | 3 | 4);
    }
  };

  const guardarCierre = async () => {
    try {
      setGuardando(true);
      setError(null);

      // Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // Crear objeto de cierre
      const diasAplicacion = calcularDiasAplicacion();
      const totalJornales =
        jornalesTotales.aplicacion +
        jornalesTotales.mezcla +
        jornalesTotales.transporte +
        (jornalesTotales.otros || 0);

      const costoManoObraTotal = totalJornales * valorJornal;
      const costoInsumosTotal = comparacionProductos.reduce(
        (sum, prod) => sum + prod.costo_total,
        0
      );
      const costoTotal = costoManoObraTotal + costoInsumosTotal;

      const totalArboles =
        aplicacion.configuracion?.lotes_seleccionados?.reduce(
          (sum, lote) => sum + lote.conteo_arboles.total,
          0
        ) || 0;

      const cierre: CierreAplicacionType = {
        aplicacion_id: aplicacion.id,
        fecha_inicio: aplicacion.fecha_inicio,
        fecha_final: fechaFinal,
        dias_aplicacion: diasAplicacion,
        valor_jornal: valorJornal,
        jornales_totales: jornalesTotales,
        observaciones_generales: observaciones.generales,
        condiciones_meteorologicas: observaciones.meteorologicas,
        problemas_encontrados: observaciones.problemas,
        ajustes_realizados: observaciones.ajustes,
        detalles_lotes: detallesLotes,
        comparacion_productos: comparacionProductos,
        costo_insumos_total: costoInsumosTotal,
        costo_mano_obra_total: costoManoObraTotal,
        costo_total: costoTotal,
        costo_promedio_por_arbol: totalArboles > 0 ? costoTotal / totalArboles : 0,
        total_arboles_tratados: totalArboles,
        total_jornales: totalJornales,
        arboles_por_jornal: totalJornales > 0 ? totalArboles / totalJornales : 0,
        requiere_aprobacion: requiereAprobacion,
        desviacion_maxima: Math.max(
          ...comparacionProductos.map((p) => Math.abs(p.porcentaje_desviacion))
        ),
        created_by: user.id,
      };

      // Guardar en base de datos (implementar según tu schema)
      // Por ahora usamos kv_store como ejemplo
      console.log('Cierre a guardar:', cierre);

      // TODO: Guardar en tabla cierres_aplicaciones cuando esté creada
      // await supabase.from('cierres_aplicaciones').insert(cierre);

      // Actualizar estado de aplicación a "Cerrada"
      const { error: errorUpdate } = await supabase
        .from('aplicaciones')
        .update({
          estado: 'Cerrada',
          fecha_cierre: fechaFinal,
          updated_at: new Date().toISOString(),
        })
        .eq('id', aplicacion.id);

      if (errorUpdate) throw errorUpdate;

      // Notificar éxito
      alert('Aplicación cerrada exitosamente');
      onCierreCompleto();
    } catch (err: any) {
      console.error('Error guardando cierre:', err);
      setError(err.message || 'Error al guardar el cierre');
    } finally {
      setGuardando(false);
    }
  };

  // Configuración de pasos
  const pasos = [
    {
      numero: 1,
      titulo: 'Revisión',
      descripcion: 'Revisar movimientos diarios',
      icono: FileText,
    },
    {
      numero: 2,
      titulo: 'Datos del Cierre',
      descripcion: 'Fechas, jornales y observaciones',
      icono: Calendar,
    },
    {
      numero: 3,
      titulo: 'Validación',
      descripcion: 'Comparar planeado vs. real',
      icono: TrendingUp,
    },
    {
      numero: 4,
      titulo: 'Confirmación',
      descripcion: 'Confirmar y cerrar',
      icono: CheckCircle,
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-[#73991C] to-[#BFD97D] p-6 text-white">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl mb-2">Cierre de Aplicación</h2>
              <p className="text-white/90">
                {aplicacion.nombre} - {aplicacion.tipo}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* INDICADOR DE PASOS */}
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            {pasos.map((paso, index) => {
              const Icono = paso.icono;
              const esActual = paso.numero === pasoActual;
              const completado = paso.numero < pasoActual;

              return (
                <div key={paso.numero} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all ${
                        esActual
                          ? 'bg-white text-[#73991C] scale-110 shadow-lg'
                          : completado
                          ? 'bg-[#BFD97D] text-white'
                          : 'bg-white/30 text-white/70'
                      }`}
                    >
                      {completado ? (
                        <CheckCircle className="w-6 h-6" />
                      ) : (
                        <Icono className="w-6 h-6" />
                      )}
                    </div>
                    <div className="text-center">
                      <div
                        className={`text-sm ${
                          esActual || completado ? 'text-white' : 'text-white/70'
                        }`}
                      >
                        {paso.titulo}
                      </div>
                      <div className="text-xs text-white/60 hidden sm:block">
                        {paso.descripcion}
                      </div>
                    </div>
                  </div>

                  {index < pasos.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 mx-2 transition-colors ${
                        completado ? 'bg-white' : 'bg-white/30'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mx-6 mt-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-900">{error}</p>
            </div>
          </div>
        )}

        {/* CONTENIDO DEL PASO ACTUAL */}
        <div className="flex-1 overflow-y-auto p-6">
          {pasoActual === 1 && (
            <PasoCierreRevision
              aplicacion={aplicacion}
              movimientos={movimientos}
              onMovimientosActualizados={setMovimientos}
            />
          )}

          {pasoActual === 2 && (
            <PasoCierreDatos
              aplicacion={aplicacion}
              fechaFinal={fechaFinal}
              onFechaFinalChange={setFechaFinal}
              valorJornal={valorJornal}
              onValorJornalChange={setValorJornal}
              jornales={jornalesTotales}
              onJornalesChange={setJornalesTotales}
              observaciones={observaciones}
              onObservacionesChange={setObservaciones}
              movimientos={movimientos}
            />
          )}

          {pasoActual === 3 && (
            <PasoCierreValidacion
              aplicacion={aplicacion}
              movimientos={movimientos}
              valorJornal={valorJornal}
              jornales={jornalesTotales}
              onDetallesLotesCalculados={setDetallesLotes}
              onComparacionProductosCalculada={setComparacionProductos}
              onRequiereAprobacionChange={setRequiereAprobacion}
            />
          )}

          {pasoActual === 4 && (
            <PasoCierreConfirmacion
              aplicacion={aplicacion}
              fechaInicio={aplicacion.fecha_inicio}
              fechaFinal={fechaFinal}
              diasAplicacion={calcularDiasAplicacion()}
              valorJornal={valorJornal}
              jornales={jornalesTotales}
              detallesLotes={detallesLotes}
              comparacionProductos={comparacionProductos}
              observaciones={observaciones}
              requiereAprobacion={requiereAprobacion}
            />
          )}
        </div>

        {/* FOOTER - BOTONES DE NAVEGACIÓN */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex items-center justify-between">
            <button
              onClick={retrocederPaso}
              disabled={pasoActual === 1}
              className="px-6 py-2 border border-gray-300 text-[#4D240F] rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Atrás
            </button>

            <div className="text-sm text-[#4D240F]/70">
              Paso {pasoActual} de {pasos.length}
            </div>

            {pasoActual < 4 ? (
              <button
                onClick={avanzarPaso}
                disabled={!puedeAvanzar()}
                className="px-6 py-2 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-lg hover:from-[#5f7d17] hover:to-[#9db86d] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                Siguiente
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={guardarCierre}
                disabled={guardando || requiereAprobacion}
                className="px-6 py-2 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-lg hover:from-[#5f7d17] hover:to-[#9db86d] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {guardando ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Cerrar Aplicación
                  </>
                )}
              </button>
            )}
          </div>

          {requiereAprobacion && pasoActual === 4 && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-900">
                  <strong>Aprobación de Gerencia Requerida</strong>
                </p>
                <p className="text-yellow-800 text-sm mt-1">
                  La desviación supera el 20% en uno o más productos. Se requiere aprobación de
                  gerencia antes de cerrar esta aplicación.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}