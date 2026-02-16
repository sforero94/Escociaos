import { useState, useEffect } from 'react';
import { X, ChevronRight, Check, Users, Calendar, Trash2, Edit3, Plus, AlertTriangle, ChevronDown } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { formatearFecha, obtenerFechaHoy } from '../../utils/fechas';
import { fetchRegistrosTrabajoParaCierre, recalcularCostoJornal } from '../../utils/laborCosts';
import type { Aplicacion, RegistroTrabajoCierre, ResumenLaboresCierre } from '../../types/aplicaciones';

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

interface DatosFinales {
  fechaInicioReal: string;
  fechaFinReal: string;
  observaciones: string;
}

// Fraction options for inline editing
const FRACCION_OPTIONS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];

type Paso = 'revision' | 'datos-finales' | 'confirmacion';

export function CierreAplicacion({ aplicacion, onClose, onCerrado }: CierreAplicacionProps) {
  const supabase = getSupabase();
  const [paso, setPaso] = useState<Paso>('revision');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  // Datos cargados - insumos
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [resumenInsumos, setResumenInsumos] = useState<ResumenInsumo[]>([]);
  const [canecasPlaneadas, setCanecasPlaneadas] = useState(0);
  const [canecasAplicadas, setCanecasAplicadas] = useState(0);
  const [lotes, setLotes] = useState<LoteConArboles[]>([]);
  const [blancoBiologico, setBlancoBiologico] = useState<string>('');

  // Datos de labores (desde registros_trabajo)
  const [resumenLabores, setResumenLabores] = useState<ResumenLaboresCierre | null>(null);
  const [registrosEditados, setRegistrosEditados] = useState<RegistroTrabajoCierre[]>([]);
  const [tieneTarea, setTieneTarea] = useState(false);

  // UI state for labor editing
  const [editandoRegistro, setEditandoRegistro] = useState<string | null>(null);
  const [loteExpandido, setLoteExpandido] = useState<string | null>(null);
  const [mostrarAgregarRegistro, setMostrarAgregarRegistro] = useState(false);
  const [trabajadoresDisponibles, setTrabajadoresDisponibles] = useState<Array<{
    id: string; nombre: string; tipo: 'empleado' | 'contratista';
    salario?: number; prestaciones?: number; auxilios?: number; horas_semanales?: number; tarifa_jornal?: number;
  }>>([]);

  // Nuevo registro temporal
  const [nuevoRegistro, setNuevoRegistro] = useState({
    trabajador_id: '',
    trabajador_tipo: 'empleado' as 'empleado' | 'contratista',
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

  useEffect(() => {
    cargarDatos();
  }, [aplicacion.id]);

  const cargarDatos = async () => {
    setLoading(true);
    setError(null);
    try {

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


      // Extraer lotes con árboles
      const lotesData: LoteConArboles[] = appData?.aplicaciones_lotes?.map((al: any) => ({
        lote_id: al.lotes?.id || '',
        nombre: al.lotes?.nombre || 'Sin nombre',
        arboles: al.lotes?.total_arboles || 0,
      })) || [];

      setLotes(lotesData);

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


        if (productosMovimientos && productosMovimientos.length > 0) {
          // Obtener IDs únicos de productos
          const productosIds = [...new Set(productosMovimientos.map((p) => p.producto_id))];

          // Cargar precios de productos
          const { data: productos, error: errorProductos } = await supabase
            .from('productos')
            .select('id, precio_unitario')
            .in('id', productosIds);


          if (errorProductos) {
            setError(
              `No se pudieron cargar los precios: ${errorProductos.message}. Verifica tus permisos o contacta al administrador.`
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

          // Verificar que los precios no sean nulos
          const productosSinPrecio = productos.filter(
            (p) => !p.precio_unitario || p.precio_unitario === 0
          );
          if (productosSinPrecio.length > 0) {
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
          .select('producto_id, producto_nombre, producto_unidad, cantidad_total_necesaria')
          .in('mezcla_id', mezclasIds);

        productosPlaneados = result.data;
      }


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

      // 6. Cargar registros de trabajo desde la tarea vinculada
      if (appData?.tarea_id) {
        setTieneTarea(true);
        try {
          const resumen = await fetchRegistrosTrabajoParaCierre(supabase, appData.tarea_id);
          setResumenLabores(resumen);
          setRegistrosEditados(resumen.registros.map(r => ({ ...r })));

          // Auto-derive dates from registros if available
          if (resumen.registros.length > 0) {
            const fechas = resumen.registros.map(r => r.fecha_trabajo).sort();
            setDatosFinales(prev => ({
              ...prev,
              fechaInicioReal: prev.fechaInicioReal || fechas[0],
              fechaFinReal: fechas[fechas.length - 1] || prev.fechaFinReal,
            }));
          }
        } catch (err: any) {
          console.error('Error cargando registros de trabajo:', err);
          // Non-blocking: labor data is optional
        }
      } else {
        setTieneTarea(false);
      }

    } catch (err: any) {
      setError('Error al cargar los datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cargar trabajadores disponibles para agregar registros
   */
  const cargarTrabajadores = async () => {
    if (trabajadoresDisponibles.length > 0) return;
    const [empRes, contRes] = await Promise.all([
      supabase.from('empleados').select('id, nombre, salario, prestaciones_sociales, auxilios_no_salariales, horas_semanales').eq('activo', true),
      supabase.from('contratistas').select('id, nombre, tarifa_jornal').eq('activo', true),
    ]);
    const trabajadores: typeof trabajadoresDisponibles = [];
    (empRes.data || []).forEach((e: any) => trabajadores.push({
      id: e.id, nombre: e.nombre, tipo: 'empleado',
      salario: e.salario, prestaciones: e.prestaciones_sociales,
      auxilios: e.auxilios_no_salariales, horas_semanales: e.horas_semanales,
    }));
    (contRes.data || []).forEach((c: any) => trabajadores.push({
      id: c.id, nombre: c.nombre, tipo: 'contratista', tarifa_jornal: c.tarifa_jornal,
    }));
    setTrabajadoresDisponibles(trabajadores);
  };

  /**
   * Editar fracción de un registro
   */
  const editarFraccion = (registroId: string, nuevaFraccion: number) => {
    setRegistrosEditados(prev => prev.map(r => {
      if ((r.id || r._isNew) && (r.id === registroId || `new-${registrosEditados.indexOf(r)}` === registroId)) {
        const nuevoCosto = recalcularCostoJornal(r, nuevaFraccion);
        return { ...r, fraccion_jornal: nuevaFraccion, costo_jornal: nuevoCosto, _modified: true };
      }
      return r;
    }));
    setEditandoRegistro(null);
  };

  /**
   * Marcar registro para eliminar
   */
  const eliminarRegistro = (index: number) => {
    setRegistrosEditados(prev => prev.map((r, i) =>
      i === index ? { ...r, _deleted: true } : r
    ));
  };

  /**
   * Agregar nuevo registro de trabajo
   */
  const agregarRegistro = () => {
    const trabajador = trabajadoresDisponibles.find(t => t.id === nuevoRegistro.trabajador_id);
    if (!trabajador || !nuevoRegistro.lote_id) return;

    const lote = lotes.find(l => l.lote_id === nuevoRegistro.lote_id);

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

    setRegistrosEditados(prev => [...prev, nuevoReg]);
    setMostrarAgregarRegistro(false);
    setNuevoRegistro({ trabajador_id: '', trabajador_tipo: 'empleado', lote_id: '', fecha_trabajo: obtenerFechaHoy(), fraccion_jornal: 1.0 });
  };

  /**
   * CERRAR APLICACIÓN
   */
  const cerrarAplicacion = async () => {
    try {
      setProcesando(true);

      const registrosActivos = registrosEditados.filter(r => !r._deleted);

      // Calcular costos desde registros de trabajo
      const totalJornalesLabor = registrosActivos.reduce((s, r) => s + r.fraccion_jornal, 0);
      const costoManoObraReal = registrosActivos.reduce((s, r) => s + r.costo_jornal, 0);
      const valorJornalPromedio = totalJornalesLabor > 0 ? costoManoObraReal / totalJornalesLabor : 0;

      // Calcular costos de insumos
      const totalArbolesCalc = lotes.reduce((sum, lote) => sum + lote.arboles, 0);
      const costoInsumosCalc = movimientos.reduce(
        (sum, mov) => sum + mov.cantidad_utilizada * mov.costo_unitario,
        0
      );
      const costoTotalCalc = costoInsumosCalc + costoManoObraReal;
      const costoPorArbolCalc = totalArbolesCalc > 0 ? costoTotalCalc / totalArbolesCalc : 0;

      // Calcular días de aplicación
      const fechaInicio = new Date(datosFinales.fechaInicioReal);
      const fechaFin = new Date(datosFinales.fechaFinReal);
      const diasAplicacion = Math.ceil((fechaFin.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser();

      // 0. Persistir ediciones de registros_trabajo
      for (const reg of registrosEditados) {
        if (reg._deleted && reg.id) {
          await supabase.from('registros_trabajo').delete().eq('id', reg.id);
        } else if (reg._isNew && !reg._deleted) {
          await supabase.from('registros_trabajo').insert({
            tarea_id: reg.tarea_id,
            empleado_id: reg.empleado_id || null,
            contratista_id: reg.contratista_id || null,
            lote_id: reg.lote_id,
            fecha_trabajo: reg.fecha_trabajo,
            fraccion_jornal: reg.fraccion_jornal.toString(),
            costo_jornal: reg.costo_jornal,
            valor_jornal_empleado: reg.tarifa_jornal || (reg.salario ? Math.round((reg.salario + (reg.prestaciones || 0) + (reg.auxilios || 0)) / ((reg.horas_semanales || 48) * 4.33) * 8) : 0),
            observaciones: reg.observaciones || null,
          });
        } else if (reg._modified && reg.id && !reg._deleted) {
          await supabase.from('registros_trabajo').update({
            fraccion_jornal: reg.fraccion_jornal.toString(),
            costo_jornal: reg.costo_jornal,
          }).eq('id', reg.id);
        }
      }

      // 1. CREAR REGISTRO EN aplicaciones_cierre
      const { error: errorCierre } = await supabase
        .from('aplicaciones_cierre')
        .insert([
          {
            aplicacion_id: aplicacion.id,
            fecha_cierre: datosFinales.fechaFinReal,
            dias_aplicacion: diasAplicacion,
            valor_jornal: Math.round(valorJornalPromedio),
            observaciones_generales: datosFinales.observaciones || null,
            cerrado_por: user?.email || null,
          },
        ])
        .select()
        .single();

      if (errorCierre) {
        throw new Error('Error al crear registro de cierre: ' + errorCierre.message);
      }

      // 2. ACTUALIZAR TABLA aplicaciones
      const { error: errorUpdate } = await supabase
        .from('aplicaciones')
        .update({
          estado: 'Cerrada',
          fecha_cierre: datosFinales.fechaFinReal,
          fecha_inicio_ejecucion: datosFinales.fechaInicioReal,
          fecha_fin_ejecucion: datosFinales.fechaFinReal,
          jornales_utilizados: totalJornalesLabor,
          valor_jornal: Math.round(valorJornalPromedio),
          observaciones_cierre: datosFinales.observaciones,
          costo_total_insumos: costoInsumosCalc,
          costo_total_mano_obra: costoManoObraReal,
          costo_total: costoTotalCalc,
          costo_por_arbol: costoPorArbolCalc,
        })
        .eq('id', aplicacion.id);

      if (errorUpdate) {
        throw new Error('Error al actualizar la aplicación: ' + errorUpdate.message);
      }

      // 3. Marcar tarea como Completada
      if (aplicacion.tarea_id) {
        await supabase
          .from('tareas')
          .update({ estado: 'Completada', fecha_fin_real: datosFinales.fechaFinReal })
          .eq('id', aplicacion.tarea_id);
      }

      // 4. CONSOLIDAR INVENTARIO DE PRODUCTOS APLICADOS
      if (movimientos.length > 0) {

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


        // Para cada producto: actualizar inventario y crear movimiento
        for (const [productoId, { nombre, cantidad }] of consolidado.entries()) {
          // a) Obtener datos actuales del producto
          const { data: producto, error: errorProd } = await supabase
            .from('productos')
            .select('cantidad_actual, unidad_medida, precio_unitario')
            .eq('id', productoId)
            .single();

          if (errorProd || !producto) {
            throw new Error(`Error obteniendo datos del producto ${nombre}`);
          }

          const saldoAnterior = producto.cantidad_actual || 0;
          const saldoNuevo = saldoAnterior - cantidad;

          // b) Actualizar inventario
          const { error: errorUpdateInv } = await supabase
            .from('productos')
            .update({ cantidad_actual: saldoNuevo })
            .eq('id', productoId);

          if (errorUpdateInv) {
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
            throw new Error(`Error registrando movimiento de ${nombre}`);
          }

        }

      }

      onCerrado();
    } catch (err: any) {
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

  // Cálculos derivados
  const totalArboles = lotes.reduce((sum, lote) => sum + lote.arboles, 0);
  const costoInsumos = movimientos.reduce(
    (sum, mov) => sum + mov.cantidad_utilizada * mov.costo_unitario,
    0
  );
  const registrosActivos = registrosEditados.filter(r => !r._deleted);
  const totalJornales = registrosActivos.reduce((s, r) => s + r.fraccion_jornal, 0);
  const costoManoObra = registrosActivos.reduce((s, r) => s + r.costo_jornal, 0);
  const costoTotal = costoInsumos + costoManoObra;
  const costoPorArbol = totalArboles > 0 ? costoTotal / totalArboles : 0;

  // Agrupar registros activos por lote para display
  const registrosPorLote = new Map<string, { lote_nombre: string; registros: (RegistroTrabajoCierre & { _index: number })[] }>();
  registrosEditados.forEach((r, index) => {
    if (r._deleted) return;
    const key = r.lote_id;
    if (!registrosPorLote.has(key)) {
      registrosPorLote.set(key, { lote_nombre: r.lote_nombre, registros: [] });
    }
    registrosPorLote.get(key)!.registros.push({ ...r, _index: index });
  });

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
              <span className="text-sm hidden sm:inline">Insumos</span>
            </div>

            <ChevronRight className="w-4 h-4 text-gray-400" />

            <div className={`flex items-center gap-2 ${paso === 'datos-finales' ? 'text-[#73991C]' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${paso === 'datos-finales' ? 'bg-[#73991C] text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="text-sm hidden sm:inline">Labores</span>
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
              <p className="font-medium">Error</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          ) : (
            <>
              {/* ========================================= */}
              {/* PASO 1: REVISIÓN DE INSUMOS */}
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

                    {/* Tabla de Insumos */}
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
                                const esCritico = insumo.planeado > 0 && Math.abs(diferencia / insumo.planeado) > 0.15;

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
                                        {esCritico ? 'Desviado' : 'OK'}
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
              {/* PASO 2: REVISIÓN DE LABORES */}
              {/* ========================================= */}
              {paso === 'datos-finales' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg text-[#172E08] mb-2">Revisión de Labores</h3>
                    <p className="text-sm text-[#4D240F]/70 mb-4">
                      Revisa los jornales registrados durante la ejecución. Puedes editar o agregar registros faltantes.
                    </p>

                    {/* Tarjetas resumen */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                      <div className="bg-[#73991C]/5 border border-[#73991C]/20 rounded-xl p-4 text-center">
                        <Users className="w-5 h-5 text-[#73991C] mx-auto mb-1" />
                        <p className="text-2xl text-[#172E08] font-bold">{totalJornales.toFixed(1)}</p>
                        <p className="text-xs text-[#4D240F]/70">Jornales</p>
                      </div>
                      <div className="bg-[#73991C]/5 border border-[#73991C]/20 rounded-xl p-4 text-center">
                        <p className="text-2xl text-[#172E08] font-bold">{formatearMoneda(costoManoObra)}</p>
                        <p className="text-xs text-[#4D240F]/70">Costo Mano de Obra</p>
                      </div>
                      <div className="bg-[#73991C]/5 border border-[#73991C]/20 rounded-xl p-4 text-center">
                        <p className="text-2xl text-[#172E08] font-bold">
                          {new Set(registrosActivos.map(r => r.empleado_id || r.contratista_id)).size}
                        </p>
                        <p className="text-xs text-[#4D240F]/70">Trabajadores</p>
                      </div>
                      <div className="bg-[#73991C]/5 border border-[#73991C]/20 rounded-xl p-4 text-center">
                        <Calendar className="w-5 h-5 text-[#73991C] mx-auto mb-1" />
                        <p className="text-2xl text-[#172E08] font-bold">
                          {new Set(registrosActivos.map(r => r.fecha_trabajo)).size}
                        </p>
                        <p className="text-xs text-[#4D240F]/70">Días trabajados</p>
                      </div>
                    </div>

                    {/* Warning si no hay tarea vinculada */}
                    {!tieneTarea && (
                      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 mb-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                          <div>
                            <p className="text-sm text-yellow-800 font-medium">
                              Esta aplicación no tiene tarea de labor vinculada
                            </p>
                            <p className="text-xs text-yellow-700 mt-1">
                              Los jornales se registraron antes de implementar la vinculación automática.
                              Puedes agregar registros manualmente usando el botón de abajo.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Warning si no hay registros */}
                    {tieneTarea && registrosActivos.length === 0 && (
                      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 mb-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                          <div>
                            <p className="text-sm text-yellow-800 font-medium">
                              No hay jornales registrados para esta aplicación
                            </p>
                            <p className="text-xs text-yellow-700 mt-1">
                              Puedes agregar registros de trabajo manualmente o volver al módulo de Labores para registrarlos antes de cerrar.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tabla de registros por lote */}
                    {registrosPorLote.size > 0 && (
                      <div className="space-y-3 mb-6">
                        {Array.from(registrosPorLote.entries()).map(([loteId, { lote_nombre, registros: regsLote }]) => {
                          const totalLote = regsLote.reduce((s, r) => s + r.fraccion_jornal, 0);
                          const costoLote = regsLote.reduce((s, r) => s + r.costo_jornal, 0);
                          const isExpanded = loteExpandido === loteId || registrosPorLote.size === 1;

                          return (
                            <div key={loteId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                              {/* Lote header */}
                              <button
                                onClick={() => setLoteExpandido(isExpanded && registrosPorLote.size > 1 ? null : loteId)}
                                className="w-full px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  <span className="text-sm text-[#172E08] font-medium">{lote_nombre}</span>
                                  <span className="text-xs text-[#4D240F]/60">
                                    {lotes.find(l => l.lote_id === loteId)?.arboles.toLocaleString()} árboles
                                  </span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-sm text-[#172E08] font-medium">{totalLote.toFixed(1)} jornales</span>
                                  <span className="text-sm text-[#73991C] font-semibold">{formatearMoneda(costoLote)}</span>
                                </div>
                              </button>

                              {/* Registros del lote */}
                              {isExpanded && (
                                <div className="overflow-x-auto">
                                  <table className="w-full">
                                    <thead className="bg-gray-50/50">
                                      <tr>
                                        <th className="px-4 py-2 text-left text-xs text-[#4D240F]/70">Fecha</th>
                                        <th className="px-4 py-2 text-left text-xs text-[#4D240F]/70">Trabajador</th>
                                        <th className="px-4 py-2 text-center text-xs text-[#4D240F]/70">Tipo</th>
                                        <th className="px-4 py-2 text-center text-xs text-[#4D240F]/70">Fracción</th>
                                        <th className="px-4 py-2 text-right text-xs text-[#4D240F]/70">Costo</th>
                                        <th className="px-4 py-2 text-center text-xs text-[#4D240F]/70 w-20">Acciones</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {regsLote.map((reg) => {
                                        const regKey = reg.id || `new-${reg._index}`;
                                        return (
                                          <tr key={regKey} className={`hover:bg-gray-50 transition-colors ${reg._isNew ? 'bg-green-50/30' : ''}`}>
                                            <td className="px-4 py-2 text-sm text-[#172E08]">
                                              {formatearFecha(reg.fecha_trabajo)}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-[#172E08]">
                                              {reg.trabajador_nombre}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                                                reg.trabajador_tipo === 'empleado'
                                                  ? 'bg-blue-100 text-blue-700'
                                                  : 'bg-purple-100 text-purple-700'
                                              }`}>
                                                {reg.trabajador_tipo === 'empleado' ? 'Emp' : 'Cont'}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                              {editandoRegistro === regKey ? (
                                                <select
                                                  autoFocus
                                                  value={reg.fraccion_jornal}
                                                  onChange={(e) => editarFraccion(regKey, parseFloat(e.target.value))}
                                                  onBlur={() => setEditandoRegistro(null)}
                                                  className="w-20 px-1 py-0.5 text-center border border-[#73991C] rounded text-sm"
                                                >
                                                  {FRACCION_OPTIONS.map(f => (
                                                    <option key={f} value={f}>{f}</option>
                                                  ))}
                                                </select>
                                              ) : (
                                                <button
                                                  onClick={() => setEditandoRegistro(regKey)}
                                                  className="text-sm text-[#172E08] font-medium hover:text-[#73991C] transition-colors cursor-pointer"
                                                  title="Clic para editar"
                                                >
                                                  {reg.fraccion_jornal}
                                                </button>
                                              )}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-right text-[#172E08]">
                                              {formatearMoneda(reg.costo_jornal)}
                                              {reg.costo_jornal === 0 && (
                                                <AlertTriangle className="w-3 h-3 text-yellow-500 inline ml-1" />
                                              )}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                              <div className="flex items-center justify-center gap-1">
                                                <button
                                                  onClick={() => setEditandoRegistro(regKey)}
                                                  className="p-1 text-gray-400 hover:text-[#73991C] transition-colors"
                                                  title="Editar fracción"
                                                >
                                                  <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  onClick={() => eliminarRegistro(reg._index)}
                                                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                                  title="Eliminar"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Botón agregar registro */}
                    {!mostrarAgregarRegistro ? (
                      <button
                        onClick={() => { setMostrarAgregarRegistro(true); cargarTrabajadores(); }}
                        className="w-full py-3 border-2 border-dashed border-[#73991C]/30 text-[#73991C] rounded-xl hover:bg-[#73991C]/5 transition-colors flex items-center justify-center gap-2 text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Agregar registro de trabajo faltante
                      </button>
                    ) : (
                      <div className="bg-white border-2 border-[#73991C]/30 rounded-xl p-4">
                        <h4 className="text-sm text-[#172E08] font-medium mb-3">Nuevo Registro de Trabajo</h4>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          <div>
                            <label className="block text-xs text-[#4D240F]/70 mb-1">Trabajador</label>
                            <select
                              value={nuevoRegistro.trabajador_id}
                              onChange={(e) => {
                                const t = trabajadoresDisponibles.find(t => t.id === e.target.value);
                                setNuevoRegistro(prev => ({
                                  ...prev,
                                  trabajador_id: e.target.value,
                                  trabajador_tipo: t?.tipo || 'empleado',
                                }));
                              }}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
                            >
                              <option value="">Seleccionar...</option>
                              <optgroup label="Empleados">
                                {trabajadoresDisponibles.filter(t => t.tipo === 'empleado').map(t => (
                                  <option key={t.id} value={t.id}>{t.nombre}</option>
                                ))}
                              </optgroup>
                              <optgroup label="Contratistas">
                                {trabajadoresDisponibles.filter(t => t.tipo === 'contratista').map(t => (
                                  <option key={t.id} value={t.id}>{t.nombre}</option>
                                ))}
                              </optgroup>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-[#4D240F]/70 mb-1">Lote</label>
                            <select
                              value={nuevoRegistro.lote_id}
                              onChange={(e) => setNuevoRegistro(prev => ({ ...prev, lote_id: e.target.value }))}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
                            >
                              <option value="">Seleccionar...</option>
                              {lotes.map(l => (
                                <option key={l.lote_id} value={l.lote_id}>{l.nombre}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-[#4D240F]/70 mb-1">Fecha</label>
                            <input
                              type="date"
                              value={nuevoRegistro.fecha_trabajo}
                              onChange={(e) => setNuevoRegistro(prev => ({ ...prev, fecha_trabajo: e.target.value }))}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#4D240F]/70 mb-1">Fracción</label>
                            <select
                              value={nuevoRegistro.fraccion_jornal}
                              onChange={(e) => setNuevoRegistro(prev => ({ ...prev, fraccion_jornal: parseFloat(e.target.value) }))}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
                            >
                              {FRACCION_OPTIONS.map(f => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-end gap-2">
                            <button
                              onClick={agregarRegistro}
                              disabled={!nuevoRegistro.trabajador_id || !nuevoRegistro.lote_id}
                              className="px-4 py-1.5 bg-[#73991C] text-white rounded-lg text-sm hover:bg-[#5f7d17] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Agregar
                            </button>
                            <button
                              onClick={() => setMostrarAgregarRegistro(false)}
                              className="px-3 py-1.5 text-[#4D240F]/70 rounded-lg text-sm hover:bg-gray-100 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Fechas y Observaciones */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
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

                    <div className="mt-4">
                      <label className="block text-sm text-[#4D240F]/70 mb-2">
                        Observaciones de Cierre
                      </label>
                      <textarea
                        rows={3}
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

                      {/* Ejecución */}
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
                            <span className="text-[#4D240F]/70">Jornales registrados:</span>
                            <span className="text-[#172E08] font-medium">{totalJornales.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#4D240F]/70">Trabajadores:</span>
                            <span className="text-[#172E08]">
                              {new Set(registrosActivos.map(r => r.empleado_id || r.contratista_id)).size}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#4D240F]/70">Días trabajados:</span>
                            <span className="text-[#172E08]">
                              {new Set(registrosActivos.map(r => r.fecha_trabajo)).size}
                            </span>
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
                          &ldquo;{datosFinales.observaciones}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Advertencia */}
                  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
                    <p className="text-sm text-yellow-800">
                      <strong>Importante:</strong> Al cerrar esta aplicación se descontarán los insumos del inventario,
                      se marcará la tarea de labor como completada y no se podrán realizar más modificaciones.
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
                  Anterior
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
