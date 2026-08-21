import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, AlertTriangle, Check } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { useFormPersistence } from '../../hooks/useFormPersistence';
import { FormDraftBanner } from '../shared/FormDraftBanner';
import { AplicacionShell } from './shared/AplicacionShell';
import { AplicacionStepper, type PasoStepper } from './shared/AplicacionStepper';
import { Button } from '../ui/button';
import { ButtonGroup } from '../ui/button-group';
import { Spinner } from '../ui/spinner';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { ConfirmDialog } from '../ui/confirm-dialog';
import type {
  EstadoAplicacion,
  EstadoCalculadora,
  ConfiguracionAplicacion,
  Mezcla,
  CalculosPorLote,
  ListaCompras,
} from '../../types/aplicaciones';

// Importar componentes de pasos
import { PasoConfiguracion } from './PasoConfiguracion';
import type { EstadoAsignacionMezcla } from './PasoMezcla';
import { PasoListaCompras } from './PasoListaCompras';
import { obtenerFechaHoy } from '@/utils/fechas';

// ============================================================================
// CONFIGURACIÓN DE PASOS — 2, no 3 (W01-calculadora-v2.md). "Configuración" y "Mezcla"
// se fusionan en "Plan": son la misma cadena causal de decisión (qué se va a hacer y
// dónde), mientras que "Lista de Compras" es una fase distinta de verdad (procurar, no
// decidir) y se mantiene aparte.
// ============================================================================

const PASOS: PasoStepper[] = [
  { id: 'plan', titulo: 'Plan', descripcion: 'Lotes, mezclas y dosis' },
  { id: 'compras', titulo: 'Lista de Compras', descripcion: 'Inventario y costos' },
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

  // Parámetros de la URL
  const { id } = useParams<{ id: string }>();
  const modoEdicion = !!id;

  // Use form persistence for NEW applications only (not in edit mode)
  const [state, setState, clearFormData] = useFormPersistence<EstadoCalculadora>({
    key: modoEdicion ? `calculadora-edit-${id}` : 'calculadora-new-v2',
    initialState: INITIAL_STATE,
    debounceMs: 1500, // Longer debounce for complex form
    enabled: !modoEdicion, // Only enable for new applications
  });

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [estadoAplicacionActual, setEstadoAplicacionActual] = useState<EstadoAplicacion | null>(null);

  // D6 — estado de asignación mezcla↔lotes por mezcla.id, solo relevante con 2+ mezclas
  // (con 1 sola mezcla la asignación se hereda estructuralmente, ver PasoMezcla.tsx).
  const [estadosAsignacion, setEstadosAsignacion] = useState<Record<string, EstadoAsignacionMezcla>>({});

  // ==========================================================================
  // CARGAR DATOS EN MODO EDICIÓN
  // ==========================================================================

  useEffect(() => {
    if (modoEdicion && id) {
      cargarAplicacion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, modoEdicion]);

  const cargarAplicacion = async () => {
    try {
      setCargandoDatos(true);

      // 1. Obtener aplicación base
      const { data: aplicacion, error: errorAplicacion } = await supabase
        .from('aplicaciones')
        .select('*')
        .eq('id', id!)
        .single();

      if (errorAplicacion) throw errorAplicacion;
      if (!aplicacion) throw new Error('Aplicación no encontrada');

      setEstadoAplicacionActual((aplicacion.estado as EstadoAplicacion | null) ?? null);

      // 2. Obtener lotes con conteo de árboles
      const { data: lotesData, error: errorLotes } = await supabase
        .from('aplicaciones_lotes')
        .select(
          `
          *,
          lotes ( id, nombre, area_hectareas )
        `,
        )
        .eq('aplicacion_id', id!);

      if (errorLotes) throw errorLotes;

      // 3. Obtener mezclas
      const { data: mezclasRaw, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('*')
        .eq('aplicacion_id', id!)
        .order('numero_mezcla');

      if (errorMezclas) throw errorMezclas;

      // 4. Obtener productos de cada mezcla
      let mezclasConProductos = await Promise.all(
        (mezclasRaw || []).map(async (mezcla) => {
          const { data: productos, error: errorProductos } = await supabase
            .from('aplicaciones_productos')
            .select('*')
            .eq('mezcla_id', mezcla.id);

          if (errorProductos) throw errorProductos;

          return {
            id: mezcla.id,
            numero_orden: mezcla.numero_mezcla,
            nombre: mezcla.nombre_mezcla || `Mezcla ${mezcla.numero_mezcla}`,
            productos: (productos || []).map((p) => ({
              producto_id: p.producto_id,
              producto_nombre: p.producto_nombre,
              producto_categoria: p.producto_categoria,
              producto_unidad: p.producto_unidad,
              dosis_por_caneca: p.dosis_por_caneca || undefined,
              unidad_dosis: p.unidad_dosis || undefined,
              dosis_grandes: p.dosis_grandes || undefined,
              dosis_medianos: p.dosis_medianos || undefined,
              dosis_pequenos: p.dosis_pequenos || undefined,
              dosis_clonales: p.dosis_clonales || undefined,
              cantidad_total_necesaria: p.cantidad_total_necesaria || 0,
            })),
            lotes_asignados: [] as string[],
          };
        }),
      );

      // 5. Obtener cálculos — es también la fuente del mapeo mezcla↔lote real
      // (`aplicaciones_calculos.mezcla_id`, contrato de Fase 0).
      const { data: calculos, error: errorCalculos } = await supabase
        .from('aplicaciones_calculos')
        .select('*')
        .eq('aplicacion_id', id!);

      if (errorCalculos) throw errorCalculos;

      // 5b. D6 — rehidratar `lotes_asignados` por mezcla en vez de dejarlo vacío (el bug
      // original: cargarAplicacion() nunca lo poblaba). Con una sola mezcla no hace falta
      // leer nada: se hereda de los lotes de la aplicación, estructuralmente sin ambigüedad
      // (W01-calculadora-v2.md §5). Con 2+ mezclas se lee `aplicaciones_calculos.mezcla_id`
      // y se distinguen 3 estados — nunca se confunde "0 lotes" con "no se pudo leer".
      const idsLotesAplicacion = (lotesData || []).map((l) => l.lote_id);
      const nuevosEstadosAsignacion: Record<string, EstadoAsignacionMezcla> = {};

      if (mezclasConProductos.length === 1) {
        mezclasConProductos = [{ ...mezclasConProductos[0], lotes_asignados: idsLotesAplicacion }];
      } else if (mezclasConProductos.length > 1) {
        const algunCalculoTraeMezclaId = (calculos || []).some((c) => !!c.mezcla_id);
        mezclasConProductos = mezclasConProductos.map((m) => {
          const lotesDeEstaMezcla = Array.from(
            new Set((calculos || []).filter((c) => c.mezcla_id === m.id).map((c) => c.lote_id as string)),
          );
          if (!algunCalculoTraeMezclaId) {
            // Ningún cálculo de TODA la aplicación trae mezcla_id: no es "0 lotes", es que
            // no se puede leer el mapeo — falla de carga, no una decisión deliberada.
            nuevosEstadosAsignacion[m.id] = 'error';
          } else if (lotesDeEstaMezcla.length === 0) {
            nuevosEstadosAsignacion[m.id] = 'sin_asignar';
          } else {
            nuevosEstadosAsignacion[m.id] = 'ok';
          }
          return { ...m, lotes_asignados: lotesDeEstaMezcla };
        });
      }
      setEstadosAsignacion(nuevosEstadosAsignacion);

      // 6. Obtener lista de compras
      const { data: compras, error: errorCompras } = await supabase
        .from('aplicaciones_compras')
        .select(
          `
          id, aplicacion_id, producto_id, producto_nombre, producto_categoria, unidad,
          inventario_actual, cantidad_necesaria, cantidad_faltante, presentacion_comercial,
          unidades_a_comprar, precio_unitario, costo_estimado, alerta, created_at
        `,
        )
        .eq('aplicacion_id', id!);

      if (errorCompras) throw errorCompras;

      // 7. Mapear datos a la configuración
      const tipoAplicacion =
        aplicacion.tipo_aplicacion === 'Fumigación'
          ? 'fumigacion'
          : aplicacion.tipo_aplicacion === 'Fertilización'
            ? 'fertilizacion'
            : 'drench';

      let blancoBiologico: string[] = [];
      if (aplicacion.blanco_biologico) {
        try {
          const parsed = JSON.parse(aplicacion.blanco_biologico);
          if (Array.isArray(parsed)) blancoBiologico = parsed;
        } catch {
          blancoBiologico = [];
        }
      }

      const configuracion: ConfiguracionAplicacion = {
        nombre: aplicacion.nombre_aplicacion || '',
        tipo: tipoAplicacion,
        fecha_inicio_planeada: aplicacion.fecha_inicio_planeada || obtenerFechaHoy(),
        fecha_fin_planeada: aplicacion.fecha_fin_planeada || undefined,
        fecha_recomendacion: aplicacion.fecha_recomendacion || undefined,
        proposito: aplicacion.proposito || undefined,
        agronomo_responsable: aplicacion.agronomo_responsable || undefined,
        blanco_biologico: blancoBiologico,
        lotes_seleccionados: (lotesData || []).map((lote) => ({
          lote_id: lote.lote_id,
          nombre: lote.lotes?.nombre || 'Sin nombre',
          sublotes_ids: lote.sublotes_ids || [],
          area_hectareas: lote.lotes?.area_hectareas ?? 0,
          conteo_arboles: {
            grandes: lote.arboles_grandes || 0,
            medianos: lote.arboles_medianos || 0,
            pequenos: lote.arboles_pequenos || 0,
            clonales: lote.arboles_clonales || 0,
            total: lote.total_arboles || 0,
          },
          calibracion_litros_arbol: lote.calibracion_litros_arbol || undefined,
          tamano_caneca: (lote.tamano_caneca || undefined) as 20 | 200 | 500 | 1000 | undefined,
        })),
      };

      const calculosData = (calculos || []).map((calc) => ({
        lote_id: calc.lote_id,
        lote_nombre: calc.lote_nombre,
        total_arboles: calc.total_arboles,
        litros_mezcla: calc.litros_mezcla || undefined,
        numero_canecas: calc.numero_canecas || undefined,
        kilos_totales: calc.kilos_totales || undefined,
        numero_bultos: calc.numero_bultos || undefined,
        kilos_grandes: calc.kilos_grandes || undefined,
        kilos_medianos: calc.kilos_medianos || undefined,
        kilos_pequenos: calc.kilos_pequenos || undefined,
        kilos_clonales: calc.kilos_clonales || undefined,
        productos: [],
      })) as CalculosPorLote[];

      const listaCompras: ListaCompras | null =
        compras && compras.length > 0
          ? {
              items: compras.map((item) => ({
                producto_id: item.producto_id,
                producto_nombre: item.producto_nombre,
                producto_categoria: item.producto_categoria ?? '',
                unidad: item.unidad,
                inventario_actual: item.inventario_actual,
                cantidad_necesaria: item.cantidad_necesaria,
                cantidad_faltante: item.cantidad_faltante,
                presentacion_comercial: item.presentacion_comercial || '',
                unidades_a_comprar: item.unidades_a_comprar,
                ultimo_precio_unitario: item.precio_unitario || undefined,
                costo_estimado: item.costo_estimado || undefined,
                alerta: (item.alerta ?? 'normal') as 'normal' | 'sin_precio' | 'sin_stock',
              })),
              costo_total_estimado: compras.reduce((sum, item) => sum + (item.costo_estimado || 0), 0),
              productos_sin_precio: compras.filter((item) => !item.precio_unitario).length,
              productos_sin_stock: compras.filter((item) => item.cantidad_faltante > 0).length,
            }
          : null;

      // 8. Actualizar estado
      setState({
        paso_actual: 1,
        configuracion,
        mezclas: mezclasConProductos as Mezcla[],
        calculos: calculosData,
        lista_compras: listaCompras,
        guardando: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Error cargando la aplicación',
      }));
    } finally {
      setCargandoDatos(false);
    }
  };

  // ==========================================================================
  // VALIDACIÓN DEL PASO "PLAN" — fusión de las viejas validarPaso1 + validarPaso2: ya no
  // hay una pantalla intermedia donde detenerse, así que se valida todo junto antes de
  // pasar a Lista de Compras.
  // ==========================================================================

  const validarPasoPlan = (): boolean => {
    if (!state.configuracion) {
      setValidationError('Debes completar la configuración');
      return false;
    }

    const { nombre, tipo, fecha_inicio_planeada, lotes_seleccionados } = state.configuracion;

    if (!nombre || nombre.trim() === '') {
      setValidationError('Debes ingresar un nombre para la aplicación');
      return false;
    }
    if (!tipo) {
      setValidationError('Debes seleccionar un tipo de aplicación');
      return false;
    }
    if (!fecha_inicio_planeada) {
      setValidationError('Debes seleccionar una fecha de inicio');
      return false;
    }
    if (lotes_seleccionados.length === 0) {
      setValidationError('Debes seleccionar al menos un lote');
      return false;
    }

    if (tipo === 'fumigacion' || tipo === 'drench') {
      const lotesSinCalibracion = lotes_seleccionados.filter(
        (l) => !l.calibracion_litros_arbol || l.calibracion_litros_arbol <= 0 || !l.tamano_caneca,
      );
      if (lotesSinCalibracion.length > 0) {
        setValidationError(
          `Los siguientes lotes necesitan calibración completa (L/árbol y tamaño de caneca): ${lotesSinCalibracion
            .map((l) => l.nombre)
            .join(', ')}`,
        );
        return false;
      }
    }

    if (state.mezclas.length === 0) {
      setValidationError('Debes crear al menos una mezcla');
      return false;
    }

    const mezclasSinProductos = state.mezclas.filter((m) => m.productos.length === 0);
    if (mezclasSinProductos.length > 0) {
      setValidationError('Todas las mezclas deben tener al menos un producto');
      return false;
    }

    // Con 2+ mezclas la asignación de lotes vuelve a ser una decisión real (antes la
    // gateaba el diálogo "Confirmar Mezcla"; al volverse edición directa, esta es la
    // única puerta que queda para no guardar una mezcla sin lotes).
    if (state.mezclas.length > 1) {
      const mezclasSinLotes = state.mezclas.filter((m) => !m.lotes_asignados || m.lotes_asignados.length === 0);
      if (mezclasSinLotes.length > 0) {
        setValidationError(
          `Estas mezclas todavía no tienen lotes asignados: ${mezclasSinLotes.map((m) => m.nombre).join(', ')}`,
        );
        return false;
      }
    }

    const productosSinDosis = state.mezclas
      .flatMap((m) => m.productos)
      .filter((p) => {
        if (tipo === 'fumigacion' || tipo === 'drench') {
          return !p.dosis_por_caneca || p.dosis_por_caneca <= 0;
        }
        return (
          (p.dosis_grandes || 0) === 0 &&
          (p.dosis_medianos || 0) === 0 &&
          (p.dosis_pequenos || 0) === 0 &&
          (p.dosis_clonales || 0) === 0
        );
      });

    if (productosSinDosis.length > 0) {
      setValidationError('Todos los productos deben tener dosis configuradas');
      return false;
    }

    setValidationError('');
    return true;
  };

  // ==========================================================================
  // NAVEGACIÓN — 2 pasos
  // ==========================================================================

  const handleSiguiente = () => {
    if (state.paso_actual === 1 && !validarPasoPlan()) return;

    if (state.paso_actual < 2) {
      setState((prev) => ({ ...prev, paso_actual: (prev.paso_actual + 1) as 1 | 2 }));
      setValidationError('');
    }
  };

  const handleAnterior = () => {
    if (state.paso_actual > 1) {
      setState((prev) => ({ ...prev, paso_actual: (prev.paso_actual - 1) as 1 | 2 }));
      setValidationError('');
    }
  };

  const handleCancelar = () => setShowCancelDialog(true);

  const confirmarCancelar = () => {
    setShowCancelDialog(false);
    clearFormData();
    navigate('/aplicaciones');
  };

  const handleGuardarYFinalizar = async () => {
    if (!state.configuracion || state.mezclas.length === 0) {
      setState((prev) => ({ ...prev, error: 'Datos incompletos' }));
      return;
    }

    try {
      setState((prev) => ({ ...prev, guardando: true, error: null }));

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      let aplicacionId: string;
      let codigoAplicacion: string;

      if (modoEdicion && id) {
        // =============================================================
        // MODO EDICIÓN: ACTUALIZAR APLICACIÓN EXISTENTE
        // =============================================================

        const { data: aplicacionExistente } = await supabase
          .from('aplicaciones')
          .select('codigo_aplicacion')
          .eq('id', id)
          .single();

        codigoAplicacion = aplicacionExistente?.codigo_aplicacion || '';

        const aplicacionData = {
          nombre_aplicacion: state.configuracion.nombre,
          tipo_aplicacion: (state.configuracion.tipo === 'fumigacion'
            ? 'Fumigación'
            : state.configuracion.tipo === 'fertilizacion'
              ? 'Fertilización'
              : 'Drench') as 'Fumigación' | 'Fertilización' | 'Drench',
          proposito: state.configuracion.proposito || null,
          blanco_biologico: state.configuracion.blanco_biologico
            ? JSON.stringify(state.configuracion.blanco_biologico)
            : null,
          fecha_inicio_planeada: state.configuracion.fecha_inicio_planeada,
          fecha_fin_planeada: state.configuracion.fecha_fin_planeada || null,
          fecha_recomendacion: state.configuracion.fecha_recomendacion || null,
          agronomo_responsable: state.configuracion.agronomo_responsable || null,
          updated_at: new Date().toISOString(),
        };

        const { error: errorAplicacion } = await supabase.from('aplicaciones').update(aplicacionData).eq('id', id);
        if (errorAplicacion) throw errorAplicacion;

        // Eliminar relaciones existentes
        await supabase.from('aplicaciones_lotes').delete().eq('aplicacion_id', id!);

        const { data: mezclasExistentes } = await supabase
          .from('aplicaciones_mezclas')
          .select('id')
          .eq('aplicacion_id', id!);

        if (mezclasExistentes && mezclasExistentes.length > 0) {
          const mezclaIds = mezclasExistentes.map((m) => m.id);
          await supabase.from('aplicaciones_productos').delete().in('mezcla_id', mezclaIds);
        }

        await supabase.from('aplicaciones_mezclas').delete().eq('aplicacion_id', id!);
        await supabase.from('aplicaciones_calculos').delete().eq('aplicacion_id', id!);
        await supabase.from('aplicaciones_compras').delete().eq('aplicacion_id', id!);

        aplicacionId = id;
      } else {
        // =============================================================
        // MODO CREACIÓN: INSERTAR NUEVA APLICACIÓN
        // =============================================================

        const fecha = new Date();
        const codigoBase = `APL-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(
          fecha.getDate(),
        ).padStart(2, '0')}`;

        const { data: ultimaAplicacion } = await supabase
          .from('aplicaciones')
          .select('codigo_aplicacion')
          .like('codigo_aplicacion', `${codigoBase}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        codigoAplicacion = `${codigoBase}-001`;
        if (ultimaAplicacion?.codigo_aplicacion) {
          const ultimoNumero = parseInt(ultimaAplicacion.codigo_aplicacion.split('-')[2]) || 0;
          codigoAplicacion = `${codigoBase}-${String(ultimoNumero + 1).padStart(3, '0')}`;
        }

        const aplicacionData = {
          codigo_aplicacion: codigoAplicacion,
          nombre_aplicacion: state.configuracion.nombre,
          tipo_aplicacion: (state.configuracion.tipo === 'fumigacion'
            ? 'Fumigación'
            : state.configuracion.tipo === 'fertilizacion'
              ? 'Fertilización'
              : 'Drench') as 'Fumigación' | 'Fertilización' | 'Drench',
          proposito: state.configuracion.proposito || null,
          blanco_biologico: state.configuracion.blanco_biologico
            ? JSON.stringify(state.configuracion.blanco_biologico)
            : null,
          fecha_inicio_planeada: state.configuracion.fecha_inicio_planeada,
          fecha_fin_planeada: state.configuracion.fecha_fin_planeada || null,
          fecha_recomendacion: state.configuracion.fecha_recomendacion || null,
          agronomo_responsable: state.configuracion.agronomo_responsable || null,
          estado: 'Calculada' as const,
          fecha_inicio_ejecucion: null,
          fecha_fin_ejecucion: null,
        };

        const { data, error: errorAplicacion } = await supabase.from('aplicaciones').insert([aplicacionData]).select();
        if (errorAplicacion) throw errorAplicacion;

        const aplicacion = data?.[0];
        if (!aplicacion) throw new Error('No se pudo crear la aplicación');

        aplicacionId = aplicacion.id;
      }

      // =============================================================
      // INSERTAR LOTES
      // W01-calculadora-v2.md campo #13 / CLAUDE.md: `sublotes_ids` deja de escribirse.
      // Es siempre `lote.sublotes.map(s => s.id)` (todos los sublotes del lote, verificado
      // contra las 87 filas de producción) — no hay un lector real y la columna nullable
      // simplemente queda NULL en filas nuevas; las 87 existentes no se tocan.
      // =============================================================

      const lotesData = state.configuracion.lotes_seleccionados.map((lote) => ({
        aplicacion_id: aplicacionId,
        lote_id: lote.lote_id,
        arboles_grandes: lote.conteo_arboles.grandes,
        arboles_medianos: lote.conteo_arboles.medianos,
        arboles_pequenos: lote.conteo_arboles.pequenos,
        arboles_clonales: lote.conteo_arboles.clonales,
        total_arboles: lote.conteo_arboles.total,
        calibracion_litros_arbol:
          state.configuracion?.tipo === 'fumigacion' || state.configuracion?.tipo === 'drench'
            ? lote.calibracion_litros_arbol
            : null,
        tamano_caneca:
          state.configuracion?.tipo === 'fumigacion' || state.configuracion?.tipo === 'drench'
            ? lote.tamano_caneca
            : null,
      }));

      const { error: errorLotes } = await supabase.from('aplicaciones_lotes').insert(lotesData);
      if (errorLotes) throw errorLotes;

      // =============================================================
      // INSERTAR MEZCLAS Y PRODUCTOS
      // =============================================================

      const loteToMezclaMap: Record<string, string> = {};

      for (const mezcla of state.mezclas) {
        const mezclaData = {
          aplicacion_id: aplicacionId,
          numero_mezcla: mezcla.numero_orden,
          nombre_mezcla: mezcla.nombre,
        };

        const { data: mezclaInsertada, error: errorMezcla } = await supabase
          .from('aplicaciones_mezclas')
          .insert([mezclaData])
          .select()
          .single();

        if (errorMezcla) throw errorMezcla;

        // Con una sola mezcla, `lotes_asignados` es la misma lista que
        // `configuracion.lotes_seleccionados` (heredada, ver PasoMezcla.tsx) — el mapeo se
        // escribe igual que antes.
        const lotesEfectivos =
          state.mezclas.length === 1
            ? state.configuracion.lotes_seleccionados.map((l) => l.lote_id)
            : mezcla.lotes_asignados || [];

        lotesEfectivos.forEach((loteId) => {
          loteToMezclaMap[loteId] = mezclaInsertada.id;
        });

        const productosData = mezcla.productos.map((producto) => ({
          mezcla_id: mezclaInsertada.id,
          producto_id: producto.producto_id,
          dosis_por_caneca:
            state.configuracion?.tipo === 'fumigacion' || state.configuracion?.tipo === 'drench'
              ? producto.dosis_por_caneca
              : null,
          unidad_dosis:
            state.configuracion?.tipo === 'fumigacion' || state.configuracion?.tipo === 'drench'
              ? producto.unidad_dosis
              : null,
          dosis_grandes: state.configuracion?.tipo === 'fertilizacion' ? producto.dosis_grandes : null,
          dosis_medianos: state.configuracion?.tipo === 'fertilizacion' ? producto.dosis_medianos : null,
          dosis_pequenos: state.configuracion?.tipo === 'fertilizacion' ? producto.dosis_pequenos : null,
          dosis_clonales: state.configuracion?.tipo === 'fertilizacion' ? producto.dosis_clonales : null,
          cantidad_total_necesaria: producto.cantidad_total_necesaria,
          producto_nombre: producto.producto_nombre,
          producto_categoria: producto.producto_categoria,
          producto_unidad: producto.producto_unidad,
        }));

        const { error: errorProductos } = await supabase.from('aplicaciones_productos').insert(productosData);
        if (errorProductos) throw errorProductos;
      }

      // =============================================================
      // INSERTAR CÁLCULOS POR LOTE
      // =============================================================

      const calculosData = state.calculos.map((calculo) => {
        const loteConfig = state.configuracion!.lotes_seleccionados.find((l) => l.lote_id === calculo.lote_id);

        return {
          aplicacion_id: aplicacionId,
          lote_id: calculo.lote_id,
          lote_nombre: calculo.lote_nombre,
          area_hectareas: loteConfig?.area_hectareas || null,
          total_arboles: calculo.total_arboles,
          mezcla_id: loteToMezclaMap[calculo.lote_id] || null,
          litros_mezcla:
            state.configuracion?.tipo === 'fumigacion' || state.configuracion?.tipo === 'drench'
              ? calculo.litros_mezcla
              : null,
          numero_canecas:
            state.configuracion?.tipo === 'fumigacion' || state.configuracion?.tipo === 'drench'
              ? calculo.numero_canecas
              : null,
          kilos_totales: state.configuracion?.tipo === 'fertilizacion' ? calculo.kilos_totales : null,
          numero_bultos: state.configuracion?.tipo === 'fertilizacion' ? calculo.numero_bultos : null,
          kilos_grandes: state.configuracion?.tipo === 'fertilizacion' ? calculo.kilos_grandes : null,
          kilos_medianos: state.configuracion?.tipo === 'fertilizacion' ? calculo.kilos_medianos : null,
          kilos_pequenos: state.configuracion?.tipo === 'fertilizacion' ? calculo.kilos_pequenos : null,
          kilos_clonales: state.configuracion?.tipo === 'fertilizacion' ? calculo.kilos_clonales : null,
        };
      });

      const { error: errorCalculos } = await supabase.from('aplicaciones_calculos').insert(calculosData);
      if (errorCalculos) throw errorCalculos;

      // =============================================================
      // INSERTAR LISTA DE COMPRAS
      // =============================================================

      if (state.lista_compras && state.lista_compras.items.length > 0) {
        const comprasData = state.lista_compras.items.map((item) => ({
          aplicacion_id: aplicacionId,
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

        const { error: errorCompras } = await supabase.from('aplicaciones_compras').insert(comprasData);
        if (errorCompras) throw errorCompras;
      }

      // =============================================================
      // ÉXITO - REDIRIGIR
      // =============================================================

      clearFormData();

      navigate('/aplicaciones', {
        state: {
          success: true,
          mensaje: modoEdicion
            ? `Aplicación ${codigoAplicacion} actualizada exitosamente`
            : `Aplicación ${codigoAplicacion} guardada exitosamente`,
        },
      });
    } catch (error) {
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
    setState((prev) => ({ ...prev, configuracion }));
  };

  const updateMezclas = (mezclas: Mezcla[], calculos: CalculosPorLote[]) => {
    setState((prev) => ({ ...prev, mezclas, calculos }));
  };

  const updateListaCompras = (lista_compras: ListaCompras) => {
    setState((prev) => ({ ...prev, lista_compras }));
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (cargandoDatos) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-12 text-center max-w-md">
          <Spinner className="size-10 text-primary mx-auto mb-4" />
          <h2 className="text-xl text-foreground mb-2">Cargando aplicación...</h2>
          <p className="text-sm text-muted-foreground">Estamos recuperando los datos de la aplicación</p>
        </div>
      </div>
    );
  }

  const nombreVisible = state.configuracion?.nombre?.trim() || (modoEdicion ? 'Editar Aplicación' : 'Nueva Aplicación');

  return (
    <AplicacionShell
      titulo={nombreVisible}
      subtitulo={modoEdicion ? undefined : 'Calcula productos, dosis y genera la lista de compras automáticamente'}
      estado={modoEdicion ? estadoAplicacionActual : undefined}
    >
      <FormDraftBanner
        variant="restored"
        show={state.paso_actual > 1 && !modoEdicion}
        onDiscard={clearFormData}
      />

      {/* Antes esto era una tercera tarjeta con sombra y borde propios: encabezado + stepper +
          contenido, tres bloques apilados antes del primer campo. El stepper es orientación, no
          contenido — va como banda ligera, sin competir con la tarjeta del formulario. */}
      <div className="py-2">
        <AplicacionStepper pasos={PASOS} pasoActual={state.paso_actual} />
      </div>

      {validationError && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Error de validación</AlertTitle>
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="bg-card rounded-2xl shadow-sm border border-border p-6 sm:p-8">
        {state.paso_actual === 1 && (
          <PasoConfiguracion
            configuracion={state.configuracion}
            onUpdate={updateConfiguracion}
            mezclas={state.mezclas}
            onUpdateMezclas={updateMezclas}
            estadosAsignacion={estadosAsignacion}
            onReintentarAsignacion={modoEdicion ? cargarAplicacion : undefined}
          />
        )}

        {state.paso_actual === 2 && state.configuracion && (
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button type="button" variant="ghost" onClick={handleCancelar} disabled={state.guardando}>
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">Cancelar</span>
        </Button>

        <ButtonGroup>
          <Button
            type="button"
            variant="outline"
            onClick={handleAnterior}
            disabled={state.paso_actual === 1 || state.guardando}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </Button>

          {state.paso_actual < 2 ? (
            <Button type="button" onClick={handleSiguiente} disabled={state.guardando}>
              <span>Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button type="button" onClick={handleGuardarYFinalizar} disabled={state.guardando}>
              {state.guardando ? (
                <>
                  <Spinner />
                  <span>Guardando…</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Guardar y Finalizar</span>
                </>
              )}
            </Button>
          )}
        </ButtonGroup>
      </div>

      <ConfirmDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        title="¿Cancelar aplicación?"
        description="Se perderán todos los datos ingresados. Esta acción no se puede deshacer."
        confirmLabel="Sí, cancelar"
        cancelLabel="Continuar editando"
        onConfirm={confirmarCancelar}
        destructive
      />
    </AplicacionShell>
  );
}
