import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { obtenerFechaHoy } from '../../utils/fechas';
import { fetchRegistrosTrabajoParaCierre, recalcularCostoJornal } from '../../utils/laborCosts';
import { generarPDFReporteCierre } from '../../utils/generarPDFReporteCierre';
import { formatearMoneda, formatearNumero } from '../../utils/format';
import {
  calcularExcepcionesCierre,
  derivarFechasEjecucionReal,
  agruparRegistrosPorLote,
  calcularKPIsLabores,
  formatearListaConY,
  construirPayloadCierreAplicacion,
} from '../../utils/calculosCierreAplicacion';
import { useFormDraft } from '@/hooks/useFormDraft';
import { FormDraftBanner } from '@/components/shared/FormDraftBanner';
import { AplicacionShell } from './shared/AplicacionShell';
import { SeccionInsumosCierre } from './SeccionInsumosCierre';
import { SeccionLaboresCierre } from './SeccionLaboresCierre';
import type { NuevoRegistroForm, TrabajadorDisponible } from './SeccionLaboresCierre';
import { SeccionConfirmarCierre } from './SeccionConfirmarCierre';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import type { Aplicacion, RegistroTrabajoCierre, ResumenLaboresCierre } from '../../types/aplicaciones';

interface CierreAplicacionProps {
  aplicacion: Aplicacion;
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

interface DatosFinales {
  fechaInicioReal: string;
  fechaFinReal: string;
  observaciones: string;
}

/**
 * Cierre de Aplicación — W03 v2 (`docs/…/W03-cierre-v2.md`). PÁGINA de revisión, no un wizard
 * gateado: ①Insumos ②Labores ③Confirmar son secciones de una sola página con scroll continuo,
 * cada una en su propio archivo (`SeccionInsumosCierre`, `SeccionLaboresCierre`,
 * `SeccionConfirmarCierre`) para que este archivo orqueste datos y NO JSX de 1.500 líneas.
 *
 * Este archivo sigue siendo el único dueño de:
 * - `cargarDatos()` y `cerrarAplicacion()` — el CÁLCULO de lo que se cierra (costos, fechas,
 *   consolidación de insumos) no se tocó, solo se movió a la función pura
 *   `construirPayloadCierreAplicacion` (`calculosCierreAplicacion.ts`). La ESCRITURA dejó de ser
 *   8 llamadas sueltas a Supabase y pasó a ser un único `.rpc('fn_cerrar_aplicacion', …)`
 *   transaccional (migración 106) — mismo orden, mismos valores, ahora todo o nada.
 * - Todo el estado editable de Labores (`registrosEditados`, `datosFinales`, el formulario
 *   "Nuevo Registro") — las secciones son presentacionales, reciben props y callbacks.
 */
export function CierreAplicacion({ aplicacion }: CierreAplicacionProps) {
  const supabase = getSupabase();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // Datos cargados - insumos
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [resumenInsumos, setResumenInsumos] = useState<ResumenInsumo[]>([]);
  const [canecasPlaneadas, setCanecasPlaneadas] = useState(0);
  const [canecasAplicadas, setCanecasAplicadas] = useState(0);
  const [lotes, setLotes] = useState<LoteConArboles[]>([]);

  // Datos de labores (desde registros_trabajo)
  const [resumenLabores, setResumenLabores] = useState<ResumenLaboresCierre | null>(null);
  const [registrosEditados, setRegistrosEditados] = useState<RegistroTrabajoCierre[]>([]);
  const [tieneTarea, setTieneTarea] = useState(false);

  // De dónde salieron fechaInicioReal/fechaFinReal la primera vez que se cargaron los datos —
  // solo para la leyenda "Detectado de…"; el campo sigue siendo 100% editable después.
  const [fuenteFechas, setFuenteFechas] = useState<'registros' | 'movimientos' | 'combinado' | 'ninguna'>(
    'ninguna',
  );

  // UI state for labor editing
  const [editandoRegistro, setEditandoRegistro] = useState<string | null>(null);
  const [mostrarAgregarRegistro, setMostrarAgregarRegistro] = useState(false);
  const [trabajadoresDisponibles, setTrabajadoresDisponibles] = useState<TrabajadorDisponible[]>([]);

  // Nuevo registro temporal
  const [nuevoRegistro, setNuevoRegistro] = useState<NuevoRegistroForm>({
    trabajador_id: '',
    trabajador_tipo: 'empleado',
    lote_id: '',
    fecha_trabajo: obtenerFechaHoy(),
    fraccion_jornal: 1.0,
  });

  // Datos finales del usuario
  const [datosFinales, setDatosFinales] = useState<DatosFinales>({
    fechaInicioReal: aplicacion.fecha_inicio_ejecucion || aplicacion.fecha_inicio_planeada || '',
    fechaFinReal: obtenerFechaHoy(),
    observaciones: '',
  });

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Cargar aplicación completa con lotes
      const { data: appData } = await supabase
        .from('aplicaciones')
        .select(
          `
          *,
          aplicaciones_lotes (
            lote_id,
            lotes (
              id,
              nombre,
              total_arboles,
              arboles_grandes,
              arboles_medianos,
              arboles_pequenos,
              arboles_clonales
            )
          ),
          aplicaciones_calculos (id)
        `,
        )
        .eq('id', aplicacion.id)
        .single();

      // Extraer lotes con árboles
      const lotesData: LoteConArboles[] =
        appData?.aplicaciones_lotes?.map((al: any) => ({
          lote_id: al.lotes?.id || '',
          nombre: al.lotes?.nombre || 'Sin nombre',
          arboles: al.lotes?.total_arboles || 0,
        })) || [];

      setLotes(lotesData);

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

      const movimientosConsolidados: Movimiento[] = [];

      if (movimientosDiarios && movimientosDiarios.length > 0) {
        const totalCanecasAplicadas = movimientosDiarios.reduce(
          (sum, mov) => sum + (mov.numero_canecas || 0),
          0,
        );
        setCanecasAplicadas(totalCanecasAplicadas);

        const movimientosIds = movimientosDiarios.map((m) => m.id);

        const { data: productosMovimientos, error: errorProductosMovimientos } = await supabase
          .from('movimientos_diarios_productos')
          .select('movimiento_diario_id, producto_id, producto_nombre, cantidad_utilizada, unidad')
          .in('movimiento_diario_id', movimientosIds);

        if (errorProductosMovimientos) {
          throw new Error(`Error cargando productos de movimientos: ${errorProductosMovimientos.message}`);
        }

        if (productosMovimientos && productosMovimientos.length > 0) {
          const productosIds = [...new Set(productosMovimientos.map((p) => p.producto_id))];

          const { data: productos, error: errorProductos } = await supabase
            .from('productos')
            .select('id, precio_unitario')
            .in('id', productosIds);

          if (errorProductos) {
            setError(
              `No se pudieron cargar los precios: ${errorProductos.message}. Verifica tus permisos o contacta al administrador.`,
            );
            setMovimientos([]);
            setLoading(false);
            return;
          }

          if (!productos || productos.length === 0) {
            setError('No hay precios configurados para los productos utilizados');
            setMovimientos([]);
            setLoading(false);
            return;
          }

          const productosSinPrecio = productos.filter((p) => !p.precio_unitario || p.precio_unitario === 0);
          if (productosSinPrecio.length > 0) {
            setError(
              `${productosSinPrecio.length} producto(s) no tienen precio asignado. Por favor actualiza los precios en el módulo de Inventario antes de cerrar.`,
            );
            setMovimientos([]);
            setLoading(false);
            return;
          }

          const costosMap = new Map(productos.map((p) => [p.id, p.precio_unitario || 0]));

          movimientosDiarios.forEach((mov) => {
            const productosDeMov = productosMovimientos.filter((p) => p.movimiento_diario_id === mov.id);

            productosDeMov.forEach((prod) => {
              let cantidadEnUnidadBase = prod.cantidad_utilizada;
              if ((prod.unidad as string) === 'cc') {
                cantidadEnUnidadBase = prod.cantidad_utilizada / 1000;
              } else if ((prod.unidad as string) === 'g') {
                cantidadEnUnidadBase = prod.cantidad_utilizada / 1000;
              }

              movimientosConsolidados.push({
                fecha: mov.fecha_movimiento,
                producto_id: prod.producto_id,
                producto_nombre: prod.producto_nombre,
                cantidad_utilizada: cantidadEnUnidadBase,
                numero_canecas_utilizadas: mov.numero_canecas ?? 0,
                costo_unitario: costosMap.get(prod.producto_id) || 0,
              });
            });
          });

          setMovimientos(movimientosConsolidados);
        } else {
          setMovimientos([]);
        }
      } else {
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
          .select(
            'producto_id, producto_nombre, producto_unidad, cantidad_total_necesaria, mezcla_id, dosis_grandes, dosis_medianos, dosis_pequenos, dosis_clonales',
          )
          .in('mezcla_id', mezclasIds);

        productosPlaneados = result.data;

        const hasCalcData = appData?.aplicaciones_calculos && appData.aplicaciones_calculos.length > 0;
        if (!hasCalcData && productosPlaneados && productosPlaneados.length > 0) {
          const appLotes = appData?.aplicaciones_lotes || [];
          productosPlaneados = productosPlaneados.map((prod: any) => {
            let totalKg = 0;
            for (const al of appLotes) {
              const lote = (al as any).lotes;
              if (!lote) continue;
              totalKg += ((lote.arboles_grandes || 0) * (Number(prod.dosis_grandes) || 0)) / 1000;
              totalKg += ((lote.arboles_medianos || 0) * (Number(prod.dosis_medianos) || 0)) / 1000;
              totalKg += ((lote.arboles_pequenos || 0) * (Number(prod.dosis_pequenos) || 0)) / 1000;
              totalKg += ((lote.arboles_clonales || 0) * (Number(prod.dosis_clonales) || 0)) / 1000;
            }
            return { ...prod, cantidad_total_necesaria: Math.round(totalKg * 100) / 100 };
          });
        }
      }

      // 5. Consolidar insumos
      const insumosMap = new Map<string, ResumenInsumo>();

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

      // 6. Cargar registros de trabajo desde la tarea vinculada
      let fechasRegistros: string[] = [];
      if (appData?.tarea_id) {
        setTieneTarea(true);
        try {
          const resumen = await fetchRegistrosTrabajoParaCierre(supabase, appData.tarea_id);
          setResumenLabores(resumen);
          setRegistrosEditados(resumen.registros.map((r) => ({ ...r })));
          fechasRegistros = resumen.registros.map((r) => r.fecha_trabajo);
        } catch (err: any) {
          console.error('Error cargando registros de trabajo:', err);
          // Non-blocking: labor data is optional
        }
      } else {
        setTieneTarea(false);
      }

      // Derivar Fecha Inicio/Fin Real de forma robusta y simétrica (W03-cierre-v2.md §1/§5):
      // unión de fechas de labor y de movimientos diarios, en vez de la lógica ad hoc anterior
      // (Fin caía en obtenerFechaHoy(), Inicio solo se corregía si venía vacío).
      const fechasMovimientos = movimientosConsolidados.map((m) => m.fecha);
      const derivadas = derivarFechasEjecucionReal(fechasRegistros, fechasMovimientos);
      setFuenteFechas(derivadas.fuente);
      if (derivadas.fuente !== 'ninguna') {
        setDatosFinales((prev) => ({
          ...prev,
          fechaInicioReal: derivadas.fechaInicio!,
          fechaFinReal: derivadas.fechaFin!,
        }));
      }
    } catch (err: any) {
      setError('Error al cargar los datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [aplicacion.id, supabase]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ---------------------------------------------------------------------------------------------
  // Borrador — useFormDraft + FormDraftBanner (decisión del dueño, W03-cierre-v2.md §6/§8.6).
  // Solo se observa registrosEditados + datosFinales: NO trabajadoresDisponibles (viene de una
  // query, no de captura del usuario) y NO el formulario "Nuevo Registro" a medio llenar (queda
  // como sub-estado de UI que se pierde en un refresh real, igual que cuál lote está expandido —
  // pregunta explícitamente sin resolver en el documento de diseño, resuelta acá del lado de
  // "menor riesgo": no reabrir un formulario a medias con datos que el usuario no confirmó).
  // `enabled: !loading` evita que la propia carga inicial (que también cambia estas dos
  // variables) se guarde como si fuera una edición del usuario.
  // ---------------------------------------------------------------------------------------------
  const draft = useFormDraft(
    `cierre-aplicacion-${aplicacion.id}-v1`,
    { registrosEditados, datosFinales },
    { enabled: !loading, debounceMs: 1500 },
  );

  const handleRestoreDraft = useCallback(() => {
    if (!draft.draftData) return;
    setRegistrosEditados(draft.draftData.registrosEditados);
    setDatosFinales(draft.draftData.datosFinales);
    draft.acceptDraft();
  }, [draft]);

  /**
   * Cargar trabajadores disponibles para agregar registros
   */
  const cargarTrabajadores = async () => {
    if (trabajadoresDisponibles.length > 0) return;
    const [empRes, contRes] = await Promise.all([
      supabase
        .from('empleados')
        .select('id, nombre, salario, prestaciones_sociales, auxilios_no_salariales, horas_semanales')
        .eq('activo', true),
      supabase.from('contratistas').select('id, nombre, tarifa_jornal').eq('activo', true),
    ]);
    const trabajadores: TrabajadorDisponible[] = [];
    (empRes.data || []).forEach((e: any) =>
      trabajadores.push({
        id: e.id,
        nombre: e.nombre,
        tipo: 'empleado',
        salario: e.salario,
        prestaciones: e.prestaciones_sociales,
        auxilios: e.auxilios_no_salariales,
        horas_semanales: e.horas_semanales,
      }),
    );
    (contRes.data || []).forEach((c: any) =>
      trabajadores.push({ id: c.id, nombre: c.nombre, tipo: 'contratista', tarifa_jornal: c.tarifa_jornal }),
    );
    setTrabajadoresDisponibles(trabajadores);
  };

  const handleAbrirAgregarRegistro = () => {
    setNuevoRegistro((prev) => ({ ...prev, fecha_trabajo: datosFinales.fechaFinReal || obtenerFechaHoy() }));
    setMostrarAgregarRegistro(true);
    cargarTrabajadores();
  };

  /**
   * Editar fracción de un registro
   */
  const editarFraccion = (registroId: string, nuevaFraccion: number) => {
    setRegistrosEditados((prev) =>
      prev.map((r, i) => {
        const key = r.id || `new-${i}`;
        if (key === registroId) {
          const nuevoCosto = recalcularCostoJornal(r, nuevaFraccion);
          return { ...r, fraccion_jornal: nuevaFraccion, costo_jornal: nuevoCosto, _modified: true };
        }
        return r;
      }),
    );
    setEditandoRegistro(null);
  };

  /**
   * Marcar registro para eliminar
   */
  const eliminarRegistro = (index: number) => {
    setRegistrosEditados((prev) => prev.map((r, i) => (i === index ? { ...r, _deleted: true } : r)));
  };

  /**
   * Agregar nuevo registro de trabajo
   */
  const agregarRegistro = () => {
    const trabajador = trabajadoresDisponibles.find((t) => t.id === nuevoRegistro.trabajador_id);
    if (!trabajador || !nuevoRegistro.lote_id) return;

    const lote = lotes.find((l) => l.lote_id === nuevoRegistro.lote_id);

    const nuevoReg: RegistroTrabajoCierre = {
      tarea_id: resumenLabores?.tarea_id || aplicacion.tarea_id || '',
      trabajador_nombre: trabajador.nombre,
      trabajador_tipo: trabajador.tipo,
      lote_id: nuevoRegistro.lote_id,
      lote_nombre: lote?.nombre || '',
      fecha_trabajo: nuevoRegistro.fecha_trabajo,
      fraccion_jornal: nuevoRegistro.fraccion_jornal,
      costo_jornal: 0,
      salario: trabajador.salario,
      prestaciones: trabajador.prestaciones,
      auxilios: trabajador.auxilios,
      horas_semanales: trabajador.horas_semanales,
      tarifa_jornal: trabajador.tarifa_jornal,
      _isNew: true,
    };

    if (trabajador.tipo === 'empleado') {
      nuevoReg.empleado_id = trabajador.id;
    } else {
      nuevoReg.contratista_id = trabajador.id;
    }

    nuevoReg.costo_jornal = recalcularCostoJornal(nuevoReg, nuevoRegistro.fraccion_jornal);

    setRegistrosEditados((prev) => [...prev, nuevoReg]);
    setMostrarAgregarRegistro(false);
    setNuevoRegistro({
      trabajador_id: '',
      trabajador_tipo: 'empleado',
      lote_id: '',
      fecha_trabajo: datosFinales.fechaFinReal || obtenerFechaHoy(),
      fraccion_jornal: 1.0,
    });
  };

  /**
   * CERRAR APLICACIÓN — una sola escritura transaccional vía `.rpc('fn_cerrar_aplicacion', …)`
   * (migración 106). El payload lo arma `construirPayloadCierreAplicacion` (función pura,
   * testeada), con la MISMA aritmética que esta función calculaba inline antes de la migración
   * 106 — el RPC no recalcula nada, solo persiste las 8 escrituras en el orden documentado ahí.
   * Si cualquiera de las 8 falla (incluida la nueva guarda de inventario negativo o de doble
   * cierre), Postgres revierte TODO — nunca queda un cierre a medias.
   */
  const cerrarAplicacion = async () => {
    try {
      setProcesando(true);

      const payload = construirPayloadCierreAplicacion({
        aplicacionId: aplicacion.id,
        registrosEditados,
        datosFinales,
        lotes,
        movimientos,
      });

      // `fn_cerrar_aplicacion` (migración 106) todavía no existe en el `database.ts` generado
      // (desactualizado, ver root CLAUDE.md) — mismo cast puntual que otros RPC nuevos ya usan
      // en el resto del repo (p.ej. `useGanadoInventario.ts`, `useProduccionHato.ts`), acotado
      // acá a esta sola llamada para no perder el tipado del resto del archivo.
      const { error: errorRpc } = await (supabase as any).rpc('fn_cerrar_aplicacion', { payload }); // eslint-disable-line @typescript-eslint/no-explicit-any

      if (errorRpc) {
        throw new Error(errorRpc.message);
      }

      draft.clearDraft();
      setConfirmDialogOpen(false);
      navigate('/aplicaciones');
    } catch (err: any) {
      setError('Error al cerrar la aplicación: ' + err.message);
      setConfirmDialogOpen(false);
    } finally {
      setProcesando(false);
    }
  };

  const handleDescargarPDF = async () => {
    const fechaInicio = new Date(datosFinales.fechaInicioReal);
    const fechaFin = new Date(datosFinales.fechaFinReal);
    const diasCalc = Math.ceil((fechaFin.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const valorJornalProm = totalJornales > 0 ? costoManoObra / totalJornales : 0;
    const arbolesJornal = totalJornales > 0 ? totalArboles / totalJornales : 0;

    await generarPDFReporteCierre({
      nombre: aplicacion.nombre_aplicacion || '',
      tipo_aplicacion: aplicacion.tipo_aplicacion || '',
      proposito: aplicacion.proposito ?? undefined,
      fecha_inicio_planeada: aplicacion.fecha_inicio_planeada ?? undefined,
      fecha_inicio_ejecucion: datosFinales.fechaInicioReal,
      fecha_cierre: datosFinales.fechaFinReal,
      dias_aplicacion: diasCalc,
      lotes: lotes.map((l) => ({ nombre: l.nombre, arboles: l.arboles })),
      total_arboles: totalArboles,
      costo_total_insumos: costoInsumos,
      costo_total_mano_obra: costoManoObra,
      costo_total: costoTotal,
      costo_por_arbol: costoPorArbol,
      jornales_utilizados: totalJornales,
      valor_jornal: Math.round(valorJornalProm),
      arboles_por_jornal: arbolesJornal,
      comparacion_productos: resumenInsumos.map((i) => {
        const diferencia = i.aplicado - i.planeado;
        const porcentajeDesviacion = i.planeado > 0 ? (diferencia / i.planeado) * 100 : 0;
        let costoProducto = 0;
        movimientos.forEach((mov) => {
          if (mov.producto_nombre === i.nombre) {
            costoProducto += mov.cantidad_utilizada * mov.costo_unitario;
          }
        });
        return {
          producto_nombre: i.nombre,
          producto_unidad: i.unidad,
          cantidad_planeada: i.planeado,
          cantidad_real: i.aplicado,
          diferencia,
          porcentaje_desviacion: porcentajeDesviacion,
          costo_total: costoProducto,
        };
      }),
      observaciones_cierre: datosFinales.observaciones || undefined,
    });
  };

  // Cálculos derivados
  const totalArboles = lotes.reduce((sum, lote) => sum + lote.arboles, 0);
  const costoInsumos = movimientos.reduce((sum, mov) => sum + mov.cantidad_utilizada * mov.costo_unitario, 0);
  const registrosActivos = useMemo(() => registrosEditados.filter((r) => !r._deleted), [registrosEditados]);
  const kpis = useMemo(() => calcularKPIsLabores(registrosActivos), [registrosActivos]);
  const { totalJornales, costoManoObra } = kpis;
  const costoTotal = costoInsumos + costoManoObra;
  const costoPorArbol = totalArboles > 0 ? costoTotal / totalArboles : 0;

  const registrosPorLote = useMemo(() => agruparRegistrosPorLote(registrosEditados), [registrosEditados]);

  const excepciones = useMemo(
    () => calcularExcepcionesCierre(resumenInsumos, registrosActivos, lotes, tieneTarea),
    [resumenInsumos, registrosActivos, lotes, tieneTarea],
  );

  const insumosParaDialogo = formatearListaConY(
    resumenInsumos.map((i) => `${i.nombre} (${formatearNumero(i.aplicado, 2)} ${i.unidad})`),
  );

  if (loading) {
    return (
      <AplicacionShell titulo="Cerrar Aplicación" subtitulo={aplicacion.nombre_aplicacion ?? undefined} estado={aplicacion.estado}>
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <Spinner className="size-8 text-primary" />
          <p className="text-sm text-muted-foreground">Cargando datos de la aplicación…</p>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </AplicacionShell>
    );
  }

  if (error) {
    return (
      <AplicacionShell titulo="Cerrar Aplicación" subtitulo={aplicacion.nombre_aplicacion ?? undefined} estado={aplicacion.estado}>
        <Empty>
          <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
            <AlertTriangle />
          </EmptyMedia>
          <EmptyTitle>No pudimos preparar el cierre</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
          <EmptyContent>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={cargarDatos}>
                <RefreshCw className="size-4" />
                Reintentar
              </Button>
              <Button variant="outline" onClick={() => navigate('/aplicaciones')}>
                Volver a Aplicaciones
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </AplicacionShell>
    );
  }

  return (
    <AplicacionShell
      titulo="Cerrar Aplicación"
      subtitulo={aplicacion.nombre_aplicacion ?? undefined}
      estado={aplicacion.estado}
    >
      <div className="space-y-6 pb-6">
        <FormDraftBanner
          variant="available"
          show={draft.hasDraft}
          onRestore={handleRestoreDraft}
          onDiscard={draft.discardDraft}
        />

        <SeccionInsumosCierre
          tipoAplicacion={aplicacion.tipo_aplicacion}
          totalLotes={lotes.length}
          totalArboles={totalArboles}
          proposito={aplicacion.proposito}
          resumenInsumos={resumenInsumos}
          canecasPlaneadas={canecasPlaneadas}
          canecasAplicadas={canecasAplicadas}
        />

        <SeccionLaboresCierre
          lotes={lotes}
          tieneTarea={tieneTarea}
          registrosPorLote={registrosPorLote}
          kpis={kpis}
          excepciones={excepciones}
          editandoRegistro={editandoRegistro}
          onIniciarEdicion={setEditandoRegistro}
          onCancelarEdicion={() => setEditandoRegistro(null)}
          onEditarFraccion={editarFraccion}
          onEliminarRegistro={eliminarRegistro}
          mostrarAgregarRegistro={mostrarAgregarRegistro}
          onAbrirAgregarRegistro={handleAbrirAgregarRegistro}
          onCancelarAgregarRegistro={() => setMostrarAgregarRegistro(false)}
          nuevoRegistro={nuevoRegistro}
          onCambiarNuevoRegistro={(patch) => setNuevoRegistro((prev) => ({ ...prev, ...patch }))}
          onConfirmarAgregarRegistro={agregarRegistro}
          trabajadoresDisponibles={trabajadoresDisponibles}
          fechaInicioReal={datosFinales.fechaInicioReal}
          fechaFinReal={datosFinales.fechaFinReal}
          fuenteFechas={fuenteFechas}
          onCambiarFechaInicio={(v) => setDatosFinales((prev) => ({ ...prev, fechaInicioReal: v }))}
          onCambiarFechaFin={(v) => setDatosFinales((prev) => ({ ...prev, fechaFinReal: v }))}
          observaciones={datosFinales.observaciones}
          onCambiarObservaciones={(v) => setDatosFinales((prev) => ({ ...prev, observaciones: v }))}
        />

        <SeccionConfirmarCierre
          costoInsumos={costoInsumos}
          costoManoObra={costoManoObra}
          costoTotal={costoTotal}
          costoPorArbol={costoPorArbol}
          onDescargarPDF={handleDescargarPDF}
        />
      </div>

      {/* Footer único, sin variantes por paso (W03-cierre-v2.md §2) */}
      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border bg-card/95 px-5 py-3.5 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Total del cierre</p>
          <p className="text-lg font-bold tabular-nums text-primary-dark">{formatearMoneda(costoTotal)}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={confirmDialogOpen || procesando}
            onClick={() => navigate('/aplicaciones')}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1 sm:flex-none"
            disabled={confirmDialogOpen || procesando}
            onClick={() => setConfirmDialogOpen(true)}
          >
            {procesando ? (
              <>
                <Spinner className="size-4" />
                Cerrando...
              </>
            ) : (
              <>
                <Check className="size-4" />
                Cerrar Aplicación
              </>
            )}
          </Button>
        </div>
      </div>

      {/* AlertDialog de confirmación — copia exacta de v1, aprobada por el dueño, sin cambios. */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar esta aplicación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Al confirmar el cierre de &ldquo;
              {aplicacion.nombre_aplicacion}&rdquo;:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex flex-col gap-2.5 border-t pt-4 text-sm">
            {resumenInsumos.length > 0 && (
              <li className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-primary-dark" aria-hidden="true" />
                <span>
                  Se descontarán del inventario los{' '}
                  <b className="font-semibold">{resumenInsumos.length} insumos aplicados</b>:{' '}
                  {insumosParaDialogo}.
                </span>
              </li>
            )}
            {aplicacion.tarea_id && (
              <li className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-primary-dark" aria-hidden="true" />
                <span>
                  La <b className="font-semibold">tarea de labor</b> vinculada se marcará como{' '}
                  <b className="font-semibold">Completada</b>.
                </span>
              </li>
            )}
            <li className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-primary-dark" aria-hidden="true" />
              <span>
                Quedará registrado un costo total de <b className="font-semibold">{formatearMoneda(costoTotal)}</b>{' '}
                ({formatearMoneda(costoInsumos)} en insumos + {formatearMoneda(costoManoObra)} en mano de obra).
              </span>
            </li>
            <li className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-primary-dark" aria-hidden="true" />
              <span>
                La aplicación pasará a estado <b className="font-semibold">Cerrada</b> y no se podrá editar: ni sus
                insumos, ni sus registros de labor, ni las fechas de ejecución.
              </span>
            </li>
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={procesando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={procesando}
              onClick={(e) => {
                e.preventDefault();
                cerrarAplicacion();
              }}
            >
              {procesando ? (
                <>
                  <Spinner className="size-4" />
                  Cerrando...
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  Sí, cerrar aplicación
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AplicacionShell>
  );
}
