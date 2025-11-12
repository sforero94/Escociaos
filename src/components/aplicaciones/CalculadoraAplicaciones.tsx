import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Beaker,
  ShoppingCart,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import type {
  EstadoCalculadora,
  ConfiguracionAplicacion,
  Mezcla,
  CalculosPorLote,
  ListaCompras,
} from '../../types/aplicaciones';

// Importar componentes de pasos
import { PasoConfiguracion } from './PasoConfiguracion';
import { PasoMezcla } from './PasoMezcla';
import { PasoListaCompras } from './PasoListaCompras';

// ============================================================================
// CONFIGURACIÓN DE PASOS
// ============================================================================

const PASOS = [
  {
    numero: 1,
    titulo: 'Configuración',
    descripcion: 'Selecciona lotes y tipo de aplicación',
    icono: Settings,
  },
  {
    numero: 2,
    titulo: 'Mezcla',
    descripcion: 'Define productos y dosis',
    icono: Beaker,
  },
  {
    numero: 3,
    titulo: 'Lista de Compras',
    descripcion: 'Revisa inventario y necesidades',
    icono: ShoppingCart,
  },
];

// ============================================================================
// ESTADO INICIAL
// ============================================================================

const INITIAL_STATE: EstadoCalculadora = {
  paso_actual: 1,
  configuracion: null,
  mezclas: [],
  calculos: [],
  lista_compras: null,
  guardando: false,
  error: null,
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function CalculadoraAplicaciones() {
  const navigate = useNavigate();
  const supabase = getSupabase();
  const [state, setState] = useState<EstadoCalculadora>(INITIAL_STATE);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [validationError, setValidationError] = useState('');

  // ==========================================================================
  // VALIDACIONES POR PASO
  // ==========================================================================

  const validarPaso1 = (): boolean => {
    if (!state.configuracion) {
      setValidationError('Debes completar la configuración');
      return false;
    }

    const { nombre, tipo, fecha_inicio, lotes_seleccionados } = state.configuracion;

    if (!nombre || nombre.trim() === '') {
      setValidationError('Debes ingresar un nombre para la aplicación');
      return false;
    }

    if (!tipo) {
      setValidationError('Debes seleccionar un tipo de aplicación');
      return false;
    }

    if (!fecha_inicio) {
      setValidationError('Debes seleccionar una fecha de inicio');
      return false;
    }

    if (lotes_seleccionados.length === 0) {
      setValidationError('Debes seleccionar al menos un lote');
      return false;
    }

    setValidationError('');
    return true;
  };

  const validarPaso2 = (): boolean => {
    if (state.mezclas.length === 0) {
      setValidationError('Debes crear al menos una mezcla');
      return false;
    }

    // Validar que todas las mezclas tengan productos
    const mezclasSinProductos = state.mezclas.filter((m) => m.productos.length === 0);

    if (mezclasSinProductos.length > 0) {
      setValidationError('Todas las mezclas deben tener al menos un producto');
      return false;
    }

    // Validar que todos los productos tengan dosis configuradas
    const productosSinDosis = state.mezclas.flatMap((m) => m.productos).filter((p) => {
      if (state.configuracion?.tipo === 'fumigacion') {
        return !p.dosis_por_caneca || p.dosis_por_caneca <= 0;
      } else {
        // Fertilización: al menos una dosis debe ser > 0
        return (
          (p.dosis_grandes || 0) === 0 &&
          (p.dosis_medianos || 0) === 0 &&
          (p.dosis_pequenos || 0) === 0 &&
          (p.dosis_clonales || 0) === 0
        );
      }
    });

    if (productosSinDosis.length > 0) {
      setValidationError('Todos los productos deben tener dosis configuradas');
      return false;
    }

    setValidationError('');
    return true;
  };

  const validarPaso3 = (): boolean => {
    // Paso 3 siempre puede avanzar (aunque falten productos)
    setValidationError('');
    return true;
  };

  // ==========================================================================
  // NAVEGACIÓN
  // ==========================================================================

  const handleSiguiente = () => {
    // Validar paso actual antes de avanzar
    let esValido = false;

    if (state.paso_actual === 1) {
      esValido = validarPaso1();
    } else if (state.paso_actual === 2) {
      esValido = validarPaso2();
    } else if (state.paso_actual === 3) {
      esValido = validarPaso3();
    }

    if (!esValido) return;

    // Avanzar al siguiente paso
    if (state.paso_actual < 3) {
      setState((prev) => ({
        ...prev,
        paso_actual: (prev.paso_actual + 1) as 1 | 2 | 3,
      }));
      setValidationError('');
    }
  };

  const handleAnterior = () => {
    if (state.paso_actual > 1) {
      setState((prev) => ({
        ...prev,
        paso_actual: (prev.paso_actual - 1) as 1 | 2 | 3,
      }));
      setValidationError('');
    }
  };

  const handleCancelar = () => {
    setShowCancelDialog(true);
  };

  const confirmarCancelar = () => {
    navigate('/aplicaciones');
  };

  const handleGuardarYFinalizar = async () => {
    if (!validarPaso3()) return;

    if (!state.configuracion || state.mezclas.length === 0) {
      setState((prev) => ({ ...prev, error: 'Datos incompletos' }));
      return;
    }

    try {
      setState((prev) => ({ ...prev, guardando: true, error: null }));

      // Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // =============================================================
      // PASO 1: INSERTAR APLICACIÓN BASE
      // =============================================================
      
      // Generar código único (formato: APL-YYYYMMDD-XXX)
      const fecha = new Date();
      const codigoBase = `APL-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}`;
      
      // Buscar último código del día
      const { data: ultimaAplicacion } = await supabase
        .from('aplicaciones')
        .select('codigo_aplicacion')
        .like('codigo_aplicacion', `${codigoBase}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let codigoAplicacion = `${codigoBase}-001`;
      if (ultimaAplicacion?.codigo_aplicacion) {
        const ultimoNumero = parseInt(ultimaAplicacion.codigo_aplicacion.split('-')[2]) || 0;
        codigoAplicacion = `${codigoBase}-${String(ultimoNumero + 1).padStart(3, '0')}`;
      }

      const aplicacionData = {
        codigo_aplicacion: codigoAplicacion,
        nombre_aplicacion: state.configuracion.nombre,
        tipo_aplicacion: state.configuracion.tipo === 'fumigacion' ? 'fumigación' : 'fertilización',
        proposito: state.configuracion.proposito || null,
        fecha_recomendacion: state.configuracion.fecha_inicio,
        agronomo_responsable: state.configuracion.agronomo_responsable || null,
        estado: 'Calculada' as const,
        fecha_inicio_ejecucion: null,
        fecha_fin_ejecucion: null,
      };

      console.log('📝 Insertando aplicación:', aplicacionData);

      const { data: aplicacion, error: errorAplicacion } = await supabase
        .from('aplicaciones')
        .insert([aplicacionData])
        .select()
        .single();

      if (errorAplicacion) {
        console.error('❌ Error insertando aplicación:', errorAplicacion);
        throw errorAplicacion;
      }

      console.log('✅ Aplicación insertada:', aplicacion.id);

      // =============================================================
      // PASO 2: INSERTAR LOTES
      // =============================================================
      
      const lotesData = state.configuracion.lotes_seleccionados.map((lote) => ({
        aplicacion_id: aplicacion.id,
        lote_id: lote.lote_id,
        sublotes_ids: lote.sublotes_ids || null,
        arboles_grandes: lote.conteo_arboles.grandes,
        arboles_medianos: lote.conteo_arboles.medianos,
        arboles_pequenos: lote.conteo_arboles.pequenos,
        arboles_clonales: lote.conteo_arboles.clonales,
        total_arboles: lote.conteo_arboles.total,
        calibracion_litros_arbol: state.configuracion.tipo === 'fumigacion' 
          ? lote.calibracion_litros_arbol 
          : null,
        tamano_caneca: state.configuracion.tipo === 'fumigacion'
          ? lote.tamano_caneca
          : null,
      }));

      console.log('📝 Insertando lotes:', lotesData.length);

      const { error: errorLotes } = await supabase
        .from('aplicaciones_lotes')
        .insert(lotesData);

      if (errorLotes) {
        console.error('❌ Error insertando lotes:', errorLotes);
        throw errorLotes;
      }

      console.log('✅ Lotes insertados');

      // =============================================================
      // PASO 3: INSERTAR MEZCLAS Y PRODUCTOS
      // =============================================================
      
      for (const mezcla of state.mezclas) {
        // Insertar mezcla
        const mezclaData = {
          aplicacion_id: aplicacion.id,
          nombre: mezcla.nombre,
          numero_orden: mezcla.numero_orden,
        };

        console.log('📝 Insertando mezcla:', mezclaData.nombre);

        const { data: mezclaInsertada, error: errorMezcla } = await supabase
          .from('aplicaciones_mezclas')
          .insert([mezclaData])
          .select()
          .single();

        if (errorMezcla) {
          console.error('❌ Error insertando mezcla:', errorMezcla);
          throw errorMezcla;
        }

        console.log('✅ Mezcla insertada:', mezclaInsertada.id);

        // Insertar productos de la mezcla
        const productosData = mezcla.productos.map((producto) => ({
          mezcla_id: mezclaInsertada.id,
          producto_id: producto.producto_id,
          dosis_por_caneca: state.configuracion?.tipo === 'fumigacion' 
            ? producto.dosis_por_caneca 
            : null,
          unidad_dosis: state.configuracion?.tipo === 'fumigacion'
            ? producto.unidad_dosis
            : null,
          dosis_grandes: state.configuracion?.tipo === 'fertilizacion'
            ? producto.dosis_grandes
            : null,
          dosis_medianos: state.configuracion?.tipo === 'fertilizacion'
            ? producto.dosis_medianos
            : null,
          dosis_pequenos: state.configuracion?.tipo === 'fertilizacion'
            ? producto.dosis_pequenos
            : null,
          dosis_clonales: state.configuracion?.tipo === 'fertilizacion'
            ? producto.dosis_clonales
            : null,
          cantidad_total_necesaria: producto.cantidad_total_necesaria,
          producto_nombre: producto.producto_nombre,
          producto_categoria: producto.producto_categoria,
          producto_unidad: producto.producto_unidad,
        }));

        console.log('📝 Insertando productos de mezcla:', productosData.length);

        const { error: errorProductos } = await supabase
          .from('aplicaciones_productos')
          .insert(productosData);

        if (errorProductos) {
          console.error('❌ Error insertando productos:', errorProductos);
          throw errorProductos;
        }

        console.log('✅ Productos insertados');
      }

      // =============================================================
      // PASO 4: INSERTAR CÁLCULOS POR LOTE
      // =============================================================
      
      const calculosData = state.calculos.map((calculo) => {
        // Buscar datos del lote
        const loteConfig = state.configuracion!.lotes_seleccionados.find(
          (l) => l.lote_id === calculo.lote_id
        );

        return {
          aplicacion_id: aplicacion.id,
          lote_id: calculo.lote_id,
          lote_nombre: calculo.lote_nombre,
          area_hectareas: loteConfig?.area_hectareas || null,
          total_arboles: calculo.total_arboles,
          // Fumigación
          litros_mezcla: state.configuracion?.tipo === 'fumigacion'
            ? calculo.litros_mezcla
            : null,
          numero_canecas: state.configuracion?.tipo === 'fumigacion'
            ? calculo.numero_canecas
            : null,
          // Fertilización
          kilos_totales: state.configuracion?.tipo === 'fertilizacion'
            ? calculo.kilos_totales
            : null,
          numero_bultos: state.configuracion?.tipo === 'fertilizacion'
            ? calculo.numero_bultos
            : null,
          kilos_grandes: state.configuracion?.tipo === 'fertilizacion'
            ? calculo.kilos_grandes
            : null,
          kilos_medianos: state.configuracion?.tipo === 'fertilizacion'
            ? calculo.kilos_medianos
            : null,
          kilos_pequenos: state.configuracion?.tipo === 'fertilizacion'
            ? calculo.kilos_pequenos
            : null,
          kilos_clonales: state.configuracion?.tipo === 'fertilizacion'
            ? calculo.kilos_clonales
            : null,
        };
      });

      console.log('📝 Insertando cálculos:', calculosData.length);

      const { error: errorCalculos } = await supabase
        .from('aplicaciones_calculos')
        .insert(calculosData);

      if (errorCalculos) {
        console.error('❌ Error insertando cálculos:', errorCalculos);
        throw errorCalculos;
      }

      console.log('✅ Cálculos insertados');

      // =============================================================
      // PASO 5: INSERTAR LISTA DE COMPRAS
      // =============================================================
      
      if (state.lista_compras && state.lista_compras.items.length > 0) {
        const comprasData = state.lista_compras.items.map((item) => ({
          aplicacion_id: aplicacion.id,
          producto_id: item.producto_id,
          producto_nombre: item.producto_nombre,
          producto_categoria: item.producto_categoria,
          unidad: item.unidad,
          inventario_actual: item.inventario_actual,
          cantidad_necesaria: item.cantidad_necesaria,
          cantidad_faltante: item.cantidad_faltante,
          presentacion_comercial: item.presentacion_comercial || null,
          unidades_a_comprar: item.unidades_a_comprar,
          precio_unitario: item.ultimo_precio_unitario || null,
          costo_estimado: item.costo_estimado || null,
          alerta: item.alerta || 'normal',
        }));

        console.log('📝 Insertando lista de compras:', comprasData.length);

        const { error: errorCompras } = await supabase
          .from('aplicaciones_compras')
          .insert(comprasData);

        if (errorCompras) {
          console.error('❌ Error insertando lista de compras:', errorCompras);
          throw errorCompras;
        }

        console.log('✅ Lista de compras insertada');
      }

      // =============================================================
      // ÉXITO - REDIRIGIR
      // =============================================================
      
      console.log('🎉 Aplicación guardada exitosamente:', aplicacion.id);
      console.log('📋 Código:', codigoAplicacion);

      // Redirigir al listado con mensaje de éxito
      navigate('/aplicaciones', { 
        state: { 
          success: true, 
          mensaje: `Aplicación ${codigoAplicacion} guardada exitosamente` 
        } 
      });
      
    } catch (error) {
      console.error('💥 Error al guardar aplicación:', error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Error al guardar la aplicación',
      }));
    } finally {
      setState((prev) => ({ ...prev, guardando: false }));
    }
  };

  // ==========================================================================
  // ACTUALIZACIÓN DE ESTADO
  // ==========================================================================

  const updateConfiguracion = (configuracion: ConfiguracionAplicacion) => {
    setState((prev) => ({
      ...prev,
      configuracion,
    }));
  };

  const updateMezclas = (mezclas: Mezcla[], calculos: CalculosPorLote[]) => {
    setState((prev) => ({
      ...prev,
      mezclas,
      calculos,
    }));
  };

  const updateListaCompras = (lista_compras: ListaCompras) => {
    setState((prev) => ({
      ...prev,
      lista_compras,
    }));
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="min-h-screen bg-[#F8FAF5] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1200px] mx-auto">
        {/* Header con Stepper */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-8">
          {/* Título */}
          <div className="mb-8">
            <h1 className="text-[#172E08] mb-2">Nueva Aplicación</h1>
            <p className="text-[#4D240F]/70">
              Calcula productos, dosis y genera lista de compras automáticamente
            </p>
          </div>

          {/* Stepper */}
          <div className="relative">
            {/* Desktop Stepper */}
            <div className="hidden md:block">
              <div className="flex items-center justify-between">
                {PASOS.map((paso, index) => {
                  const Icon = paso.icono;
                  const isActive = state.paso_actual === paso.numero;
                  const isCompleted = state.paso_actual > paso.numero;
                  const isLast = index === PASOS.length - 1;

                  return (
                    <div key={paso.numero} className="flex items-center flex-1">
                      {/* Paso */}
                      <div className="flex flex-col items-center">
                        {/* Círculo con icono */}
                        <div
                          className={`
                            w-16 h-16 rounded-2xl flex items-center justify-center mb-3 transition-all duration-300
                            ${
                              isActive
                                ? 'bg-gradient-to-br from-[#73991C] to-[#BFD97D] text-white shadow-lg scale-110'
                                : isCompleted
                                ? 'bg-[#73991C] text-white'
                                : 'bg-gray-100 text-gray-400'
                            }
                          `}
                        >
                          {isCompleted ? (
                            <Check className="w-8 h-8" />
                          ) : (
                            <Icon className="w-8 h-8" />
                          )}
                        </div>

                        {/* Texto */}
                        <div className="text-center">
                          <p
                            className={`text-sm mb-1 transition-colors ${
                              isActive || isCompleted
                                ? 'text-[#172E08]'
                                : 'text-gray-400'
                            }`}
                          >
                            {paso.titulo}
                          </p>
                          <p className="text-xs text-[#4D240F]/50 max-w-[140px]">
                            {paso.descripcion}
                          </p>
                        </div>
                      </div>

                      {/* Línea conectora */}
                      {!isLast && (
                        <div className="flex-1 h-1 mx-4 -mt-12">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isCompleted ? 'bg-[#73991C]' : 'bg-gray-200'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile Breadcrumbs */}
            <div className="md:hidden">
              <div className="flex items-center justify-center gap-2 mb-6">
                {PASOS.map((paso) => {
                  const isActive = state.paso_actual === paso.numero;
                  const isCompleted = state.paso_actual > paso.numero;

                  return (
                    <div
                      key={paso.numero}
                      className={`
                        h-2 flex-1 rounded-full transition-all duration-300
                        ${
                          isActive || isCompleted
                            ? 'bg-[#73991C]'
                            : 'bg-gray-200'
                        }
                      `}
                    />
                  );
                })}
              </div>

              {/* Paso actual en móvil */}
              <div className="text-center">
                <p className="text-lg text-[#172E08] mb-1">
                  {PASOS[state.paso_actual - 1].titulo}
                </p>
                <p className="text-sm text-[#4D240F]/70">
                  Paso {state.paso_actual} de {PASOS.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Mensaje de error de validación */}
        {validationError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-red-800 mb-1">Error de validación</h4>
              <p className="text-red-700 text-sm">{validationError}</p>
            </div>
          </div>
        )}

        {/* Error general */}
        {state.error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-red-800 mb-1">Error</h4>
              <p className="text-red-700 text-sm">{state.error}</p>
            </div>
          </div>
        )}

        {/* Contenido del paso actual */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-8">
          {state.paso_actual === 1 && (
            <PasoConfiguracion
              configuracion={state.configuracion}
              onUpdate={updateConfiguracion}
            />
          )}

          {state.paso_actual === 2 && state.configuracion && (
            <PasoMezcla
              configuracion={state.configuracion}
              mezclas={state.mezclas}
              calculos={state.calculos}
              onUpdate={updateMezclas}
            />
          )}

          {state.paso_actual === 3 && state.configuracion && (
            <PasoListaCompras
              configuracion={state.configuracion}
              mezclas={state.mezclas}
              calculos={state.calculos}
              lista_compras={state.lista_compras}
              onUpdate={updateListaCompras}
            />
          )}
        </div>

        {/* Navegación */}
        <div className="flex items-center justify-between gap-4">
          {/* Botón Cancelar */}
          <button
            onClick={handleCancelar}
            disabled={state.guardando}
            className="px-6 py-3 text-[#4D240F] hover:bg-gray-100 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
            <span className="hidden sm:inline">Cancelar</span>
          </button>

          <div className="flex items-center gap-4">
            {/* Botón Anterior */}
            <button
              onClick={handleAnterior}
              disabled={state.paso_actual === 1 || state.guardando}
              className="px-6 py-3 bg-gray-100 text-[#172E08] rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Anterior</span>
            </button>

            {/* Botón Siguiente o Finalizar */}
            {state.paso_actual < 3 ? (
              <button
                onClick={handleSiguiente}
                disabled={state.guardando}
                className="px-6 py-3 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-xl hover:from-[#5f7d17] hover:to-[#9db86d] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Siguiente</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleGuardarYFinalizar}
                disabled={state.guardando}
                className="px-6 py-3 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-xl hover:from-[#5f7d17] hover:to-[#9db86d] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {state.guardando ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Guardar y Finalizar</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dialog de cancelación */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg text-[#172E08] mb-2">
                  ¿Cancelar aplicación?
                </h3>
                <p className="text-sm text-[#4D240F]/70">
                  Se perderán todos los datos ingresados. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowCancelDialog(false)}
                className="px-4 py-2 text-[#4D240F] hover:bg-gray-100 rounded-lg transition-all"
              >
                Continuar editando
              </button>
              <button
                onClick={confirmarCancelar}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
              >
                Sí, cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}