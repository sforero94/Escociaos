import { useState, useEffect } from 'react';
import { Save, X, Calendar, Package, Droplet, User, Plus, Trash2, AlertTriangle, FileText, Cloud, Clock } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { obtenerFechaHoy } from '../../utils/fechas';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type {
  Aplicacion,
  MovimientoDiario,
  MovimientoDiarioProducto,
  LoteSeleccionado,
  ProductoEnMezcla,
  UnidadMedida, // 🚨 NUEVO: Importar el tipo ENUM
  FraccionJornal
} from '../../types/aplicaciones';
import type {
  Empleado,
  Contratista,
  Trabajador,
  Lote,
  WorkMatrix,
  ObservacionesMatrix
} from '../../types/shared';
import { TrabajadorMultiSelect } from '../shared/TrabajadorMultiSelect';
import { JornalFractionMatrix } from '../shared/JornalFractionMatrix';
import { calculateLaborCost, calculateContractorCost } from '../../utils/laborCosts';

interface DailyMovementFormProps {
  aplicacion: Aplicacion;
  onSuccess: () => void;
  onCancel: () => void;
}

interface ProductoFormulario {
  producto_id: string;
  producto_nombre: string;
  producto_categoria: string;
  cantidad_utilizada: string;
  unidad_producto: string; // 🚨 CAMBIO: Ahora es la unidad_medida del producto desde BD (Litros o Kilos)
  presentacion_kg_l?: number; // SOLO para fertilización: cuántos Kg por bulto
}

export function DailyMovementForm({ aplicacion, onSuccess, onCancel }: DailyMovementFormProps) {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🚨 DIAGNÓSTICO - Verificar tipo de aplicación

  // Estados del formulario
  const [fechaMovimiento, setFechaMovimiento] = useState(obtenerFechaHoy());
  const [loteId, setLoteId] = useState('');
  const [numeroCanecas, setNumeroCanecas] = useState(''); // Total para fumigación/drench
  const [numeroBultos, setNumeroBultos] = useState(''); // Total para fertilización
  const [equipoAplicacion, setEquipoAplicacion] = useState(''); // 🆕 NUEVO CAMPO
  const [personal, setPersonal] = useState(''); // 🆕 NUEVO CAMPO
  const [horaInicio, setHoraInicio] = useState('07:20'); // 🆕 NUEVO CAMPO
  const [horaFin, setHoraFin] = useState('15:50'); // 🆕 NUEVO CAMPO
  const [responsable, setResponsable] = useState('');
  const [condicionesMeteorologicas, setCondicionesMeteorologicas] = useState('');
  const [notas, setNotas] = useState('');

  // Productos agregados (lista dinámica)
  const [productosAgregados, setProductosAgregados] = useState<ProductoFormulario[]>([]);
  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState('');

  // Datos de la aplicación
  const [lotes, setLotes] = useState<LoteSeleccionado[]>([]);
  const [productosDisponibles, setProductosDisponibles] = useState<any[]>([]);
  const [canecasPorLote, setCanecasPorLote] = useState<Record<string, number>>({});
  const [bultosPorLote, setBultosPorLote] = useState<Record<string, number>>({});
  const [loteToMezclaMap, setLoteToMezclaMap] = useState<Record<string, string>>({});
  const [productosPorMezcla, setProductosPorMezcla] = useState<Record<string, any[]>>({});

  // Worker tracking (employees + contractors)
  const [empleadosDisponibles, setEmpleadosDisponibles] = useState<Empleado[]>([]);
  const [contratistasDisponibles, setContratistasDisponibles] = useState<Contratista[]>([]);
  const [selectedTrabajadores, setSelectedTrabajadores] = useState<Trabajador[]>([]);
  const [workMatrix, setWorkMatrix] = useState<WorkMatrix>({});
  const [observacionesMatrix, setObservacionesMatrix] = useState<ObservacionesMatrix>({});

  // 🔧 Productos filtrados según el lote seleccionado
  // Si hay un lote seleccionado, mostrar solo productos de su mezcla
  // Si no hay lote seleccionado, mostrar todos
  const productosParaMostrar = (() => {
    if (!loteId || !loteToMezclaMap[loteId]) {
      return productosDisponibles; // Mostrar todos si no hay lote seleccionado
    }

    const mezclaId = loteToMezclaMap[loteId];
    return productosPorMezcla[mezclaId] || [];
  })();

  // Cargar datos al montar
  useEffect(() => {
    cargarDatosAplicacion();
    cargarUsuarioActual();
    cargarTrabajadores();
  }, [aplicacion.id]);

  // 🔧 Precargar productos cuando se selecciona un lote
  useEffect(() => {
    if (loteId && productosParaMostrar.length > 0) {
      precargarProductos(productosParaMostrar);
    }
  }, [loteId, productosParaMostrar]);

  const cargarDatosAplicacion = async () => {
    try {
      // Cargar lotes de la aplicación
      const { data: lotesData, error: errorLotes } = await supabase
        .from('aplicaciones_lotes')
        .select(`
          lote_id,
          lotes (
            id,
            nombre
          )
        `)
        .eq('aplicacion_id', aplicacion.id);

      if (errorLotes) throw errorLotes;

      const lotesFormateados: LoteSeleccionado[] = (lotesData || []).map(l => ({
        lote_id: l.lote_id,
        nombre: l.lotes?.nombre || 'Sin nombre',
        area_hectareas: 0,
        conteo_arboles: { grandes: 0, medianos: 0, pequenos: 0, clonales: 0, total: 0 }
      }));

      setLotes(lotesFormateados);

      // Cargar cálculos por lote según tipo de aplicación (incluyendo mezcla_id)
      const { data: calculosData, error: errorCalculos } = await supabase
        .from('aplicaciones_calculos')
        .select('lote_id, numero_canecas, numero_bultos, mezcla_id')
        .eq('aplicacion_id', aplicacion.id);

      // Map lote_id → mezcla_id
      const loteToMezclaMapTemp: Record<string, string> = {};

      if (!errorCalculos && calculosData) {
        // Build lote → mezcla mapping (with type assertion)
        (calculosData as any[]).forEach((calc: any) => {
          if (calc.mezcla_id) {
            loteToMezclaMapTemp[calc.lote_id] = calc.mezcla_id;
          }
        });

        // Store in state
        setLoteToMezclaMap(loteToMezclaMapTemp);

        if (aplicacion.tipo_aplicacion === 'Fumigación' || aplicacion.tipo_aplicacion === 'Drench') {
          // Cargar canecas planeadas por lote
          const canecasMap: Record<string, number> = {};
          calculosData.forEach(calc => {
            if (calc.numero_canecas) {
              canecasMap[calc.lote_id] = calc.numero_canecas;
            }
          });
          setCanecasPorLote(canecasMap);
        } else if (aplicacion.tipo_aplicacion === 'Fertilización') {
          // Cargar bultos planeados por lote
          const bultosMap: Record<string, number> = {};
          calculosData.forEach(calc => {
            if (calc.numero_bultos) {
              bultosMap[calc.lote_id] = calc.numero_bultos;
            }
          });
          setBultosPorLote(bultosMap);
        }
      }

      // Cargar productos de las mezclas
      const { data: mezclasData, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacion.id);

      if (errorMezclas) throw errorMezclas;

      if (mezclasData && mezclasData.length > 0) {
        const mezclaIds = (mezclasData as any[]).map((m: any) => m.id);

        const { data: productosData, error: errorProductos } = await supabase
          .from('aplicaciones_productos')
          .select(`
            mezcla_id,
            producto_id,
            producto_nombre,
            producto_categoria,
            producto_unidad,
            cantidad_total_necesaria
          `)
          .in('mezcla_id', mezclaIds);

        if (errorProductos) throw errorProductos;

        // Organizar productos por mezcla
        const productosPorMezclaTemp: Record<string, any[]> = {};
        (productosData || []).forEach((p: any) => {
          if (!productosPorMezclaTemp[p.mezcla_id]) {
            productosPorMezclaTemp[p.mezcla_id] = [];
          }
          productosPorMezclaTemp[p.mezcla_id].push({
            producto_id: p.producto_id,
            producto_nombre: p.producto_nombre,
            producto_categoria: p.producto_categoria,
            producto_unidad: p.producto_unidad,
            cantidad_total_necesaria: p.cantidad_total_necesaria,
            mezcla_id: p.mezcla_id
          });
        });

        setProductosPorMezcla(productosPorMezclaTemp);

        // Para compatibilidad, mantener la lista completa de productos disponibles
        const productosUnicos = new Map<string, any>();
        (productosData || []).forEach((p: any) => {
          if (!productosUnicos.has(p.producto_id)) {
            productosUnicos.set(p.producto_id, {
              producto_id: p.producto_id,
              producto_nombre: p.producto_nombre,
              producto_categoria: p.producto_categoria,
              producto_unidad: p.producto_unidad,
              cantidad_total_necesaria: p.cantidad_total_necesaria,
              mezcla_id: p.mezcla_id
            });
          }
        });

        const productosArray = Array.from(productosUnicos.values());
        setProductosDisponibles(productosArray);
      }
    } catch (err: any) {
      setError('Error al cargar los datos de la aplicación');
    }
  };

  // 🆕 NUEVA FUNCIÓN: Precargar todos los productos
  const precargarProductos = async (productos: any[]) => {
    const productosFormulario: ProductoFormulario[] = [];

    for (const producto of productos) {
      // Cargar presentacion_kg_l del producto SOLO para fertilización
      let presentacionKgL: number | undefined;
      if (aplicacion.tipo_aplicacion === 'Fertilización') {
        try {
          const { data: productoData, error: errorProducto } = await supabase
            .from('productos')
            .select('presentacion_kg_l')
            .eq('id', producto.producto_id)
            .single();
          
          if (!errorProducto && productoData) {
            presentacionKgL = productoData.presentacion_kg_l;
          }
        } catch (err) {
        }
      }

      productosFormulario.push({
        producto_id: producto.producto_id,
        producto_nombre: producto.producto_nombre,
        producto_categoria: producto.producto_categoria,
        cantidad_utilizada: '',
        unidad_producto: producto.producto_unidad,
        presentacion_kg_l: presentacionKgL
      });
    }

    setProductosAgregados(productosFormulario);
  };

  const cargarUsuarioActual = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('usuarios')
          .select('nombre_completo')
          .eq('user_id', user.id)
          .single();

        if (profile?.nombre_completo) {
          setResponsable(profile.nombre_completo);
        }
      }
    } catch (err: any) {
    }
  };

  const cargarTrabajadores = async () => {
    try {
      // Load employees
      const { data: empleados, error: errorEmpleados } = await supabase
        .from('empleados')
        .select('*')
        .eq('estado', 'Activo')
        .order('nombre');

      if (!errorEmpleados && empleados) {
        setEmpleadosDisponibles(empleados);
      }

      // Load contractors
      const { data: contratistas, error: errorContratistas } = await supabase
        .from('contratistas')
        .select('*')
        .eq('estado', 'Activo')
        .order('nombre');

      if (!errorContratistas && contratistas) {
        setContratistasDisponibles(contratistas);
      }
    } catch (err: any) {
      console.error('Error al cargar trabajadores:', err);
    }
  };

  const agregarProducto = async () => {
    if (!productoSeleccionadoId) {
      setError('Selecciona un producto para agregar');
      return;
    }

    // Verificar si ya está agregado
    if (productosAgregados.some(p => p.producto_id === productoSeleccionadoId)) {
      setError('Este producto ya fue agregado');
      return;
    }

    const producto = productosDisponibles.find(p => p.producto_id === productoSeleccionadoId);
    if (!producto) return;

    // Cargar presentacion_kg_l del producto SOLO para fertilización
    let presentacionKgL: number | undefined;
    if (aplicacion.tipo_aplicacion === 'Fertilización') {
      try {
        const { data: productoData, error: errorProducto } = await supabase
          .from('productos')
          .select('presentacion_kg_l')
          .eq('id', productoSeleccionadoId)
          .single();
        
        if (errorProducto) {
        } else {
          presentacionKgL = productoData?.presentacion_kg_l;
        }
      } catch (err) {
      }
    }

    const nuevoProducto: ProductoFormulario = {
      producto_id: producto.producto_id,
      producto_nombre: producto.producto_nombre,
      producto_categoria: producto.producto_categoria,
      cantidad_utilizada: '',
      unidad_producto: producto.producto_unidad, // 🚨 CAMBIO: Ahora es la unidad_medida del producto desde BD (Litros o Kilos)
      presentacion_kg_l: presentacionKgL
    };

    setProductosAgregados([...productosAgregados, nuevoProducto]);
    setProductoSeleccionadoId('');
    setError(null);
  };

  const eliminarProducto = (index: number) => {
    setProductosAgregados(productosAgregados.filter((_, i) => i !== index));
  };

  const actualizarCantidadProducto = (index: number, cantidad: string) => {
    const nuevosProductos = [...productosAgregados];
    nuevosProductos[index].cantidad_utilizada = cantidad;
    setProductosAgregados(nuevosProductos);
  };

  const actualizarUnidadProducto = (index: number, unidad: 'cc' | 'L') => {
    const nuevosProductos = [...productosAgregados];
    nuevosProductos[index].unidad_producto = unidad;
    setProductosAgregados(nuevosProductos);
  };

  const validarFormulario = () => {
    if (!fechaMovimiento) {
      setError('La fecha es requerida');
      return false;
    }
    if (!loteId) {
      setError('Debes seleccionar un lote');
      return false;
    }
    
    // Validación según tipo de aplicación
    if (aplicacion.tipo_aplicacion === 'Fumigación' || aplicacion.tipo_aplicacion === 'Drench') {
      if (!numeroCanecas || parseFloat(numeroCanecas) <= 0) {
        setError('El número de canecas debe ser mayor a 0');
        return false;
      }
    }
    
    if (aplicacion.tipo_aplicacion === 'Fertilización') {
      if (!numeroBultos || parseFloat(numeroBultos) <= 0) {
        setError('El número de bultos debe ser mayor a 0');
        return false;
      }
    }
    
    if (!responsable.trim()) {
      setError('El responsable es requerido');
      return false;
    }
    
    if (productosAgregados.length === 0) {
      setError('Debes agregar al menos un producto');
      return false;
    }

    // Validar que todos los productos tengan cantidad
    for (const producto of productosAgregados) {
      if (!producto.cantidad_utilizada || parseFloat(producto.cantidad_utilizada) <= 0) {
        setError(`El producto "${producto.producto_nombre}" necesita una cantidad válida`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validarFormulario()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // Encontrar información del lote
      const lote = lotes.find(l => l.lote_id === loteId);
      if (!lote) throw new Error('Lote no encontrado');

      // 1. Crear movimiento diario (padre)
      const nuevoMovimiento: Omit<MovimientoDiario, 'id' | 'created_at'> = {
        aplicacion_id: aplicacion.id,
        fecha_movimiento: fechaMovimiento,
        lote_id: loteId,
        lote_nombre: lote.nombre,
        numero_canecas: (aplicacion.tipo_aplicacion === 'Fumigación' || aplicacion.tipo_aplicacion === 'Drench') ? parseFloat(numeroCanecas) : undefined,
        numero_bultos: aplicacion.tipo_aplicacion === 'Fertilización' ? parseInt(numeroBultos, 10) : undefined,
        equipo_aplicacion: equipoAplicacion.trim() || undefined, // 🆕 NUEVO CAMPO
        personal: personal.trim() || undefined, //  NUEVO CAMPO
        hora_inicio: horaInicio || undefined, // 🆕 NUEVO CAMPO
        hora_fin: horaFin || undefined, // 🆕 NUEVO CAMPO
        responsable: responsable.trim(),
        condiciones_meteorologicas: condicionesMeteorologicas.trim() || undefined,
        notas: notas.trim() || undefined,
        created_by: user.id,
      };

      const { data: movimientoCreado, error: errorMovimiento } = await supabase
        .from('movimientos_diarios')
        .insert([nuevoMovimiento])
        .select()
        .single();

      if (errorMovimiento) throw errorMovimiento;
      if (!movimientoCreado) throw new Error('No se pudo crear el movimiento');

      // 2. Crear productos del movimiento (hijos)
      // 🚨 NORMALIZACIÓN DE UNIDADES USANDO EL ENUM unidad_medida:
      // - productos.unidad_medida viene como 'Litros', 'Kilos', 'Unidades' (ENUM)
      // - Se guarda en movimientos_diarios_productos.unidad como 'Litros' o 'Kilos'
      // - Fertilización: bultos → Kilos (usando presentacion_kg_l)
      // - Fumigación/Drench: cantidad directa en Litros o Kilos
      const productosParaInsertar: Omit<MovimientoDiarioProducto, 'id' | 'created_at'>[] = productosAgregados.map(p => {
        let cantidadFinal: number;
        let unidadFinal: UnidadMedida;

        if (aplicacion.tipo_aplicacion === 'Fertilización') {
          // Convertir bultos a Kilos
          if (!p.presentacion_kg_l) {
            throw new Error(`El producto ${p.producto_nombre} no tiene presentación en Kg/bulto configurada`);
          }
          cantidadFinal = parseFloat(p.cantidad_utilizada) * p.presentacion_kg_l;
          unidadFinal = 'Kilos';
        } else {
          // Fumigación/Drench: Ya viene en Litros o Kilos desde la BD
          cantidadFinal = parseFloat(p.cantidad_utilizada);
          unidadFinal = p.unidad_producto as UnidadMedida; // Cast seguro porque viene del ENUM
        }

        return {
          movimiento_diario_id: movimientoCreado.id,
          producto_id: p.producto_id,
          producto_nombre: p.producto_nombre,
          producto_categoria: p.producto_categoria,
          cantidad_utilizada: cantidadFinal,
          unidad: unidadFinal
        };
      });

      const { error: errorProductos } = await supabase
        .from('movimientos_diarios_productos')
        .insert(productosParaInsertar);

      if (errorProductos) {
        // Si falla, intentar eliminar el movimiento creado
        await supabase.from('movimientos_diarios').delete().eq('id', movimientoCreado.id);
        throw errorProductos;
      }

      // 3. Save worker tracking data (employees + contractors)
      if (selectedTrabajadores.length > 0) {
        const trabajadoresData = selectedTrabajadores
          .flatMap(trabajador => {
            const trabajadorId = trabajador.data.id;
            const fraccion = workMatrix[trabajadorId]?.[loteId] || '0.0';
            if (parseFloat(fraccion) === 0) return [];

            // Type-aware cost calculation
            let costoJornal: number;
            let valorJornal: number;

            if (trabajador.type === 'empleado') {
              const { totalCost } = calculateLaborCost({
                salary: trabajador.data.salario || 0,
                benefits: trabajador.data.prestaciones_sociales || 0,
                allowances: trabajador.data.auxilios_no_salariales || 0,
                weeklyHours: trabajador.data.horas_semanales || 48,
                fractionWorked: parseFloat(fraccion),
              });
              costoJornal = totalCost;
              valorJornal = trabajador.data.salario || 0;
            } else {
              // Contractor: simple flat rate
              const { totalCost } = calculateContractorCost(
                trabajador.data.tarifa_jornal || 0,
                parseFloat(fraccion)
              );
              costoJornal = totalCost;
              valorJornal = trabajador.data.tarifa_jornal || 0;
            }

            return [{
              movimiento_diario_id: movimientoCreado.id,
              empleado_id: trabajador.type === 'empleado' ? trabajador.data.id : null,
              contratista_id: trabajador.type === 'contratista' ? trabajador.data.id : null,
              lote_id: loteId,
              fraccion_jornal: fraccion as FraccionJornal,
              observaciones: observacionesMatrix[trabajadorId]?.[loteId] || null,
              valor_jornal_trabajador: valorJornal,
              costo_jornal: costoJornal,
            }];
          });

        if (trabajadoresData.length > 0) {
          const { error: errorTrabajadores } = await supabase
            .from('movimientos_diarios_trabajadores')
            .insert(trabajadoresData);

          if (errorTrabajadores) {
            // If worker save fails, delete the movement and products
            await supabase.from('movimientos_diarios').delete().eq('id', movimientoCreado.id);
            throw errorTrabajadores;
          }
        }
      }

      // Limpiar formulario
      setFechaMovimiento(obtenerFechaHoy());
      setLoteId('');
      setNumeroCanecas('');
      setNumeroBultos('');
      setEquipoAplicacion('');
      setPersonal('');
      setHoraInicio('07:20');
      setHoraFin('15:50');
      setCondicionesMeteorologicas('');
      setNotas('');
      setProductosAgregados([]);
      setSelectedTrabajadores([]);
      setWorkMatrix({});
      setObservacionesMatrix({});

      // Notificar éxito
      onSuccess();

    } catch (err: any) {
      setError(err.message || 'Error al guardar el movimiento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#73991C]/10 rounded-xl flex items-center justify-center">
            <Plus className="w-6 h-6 text-[#73991C]" />
          </div>
          <div>
            <h3 className="text-lg text-[#172E08]">Nuevo Movimiento Diario</h3>
            <p className="text-sm text-[#4D240F]/60">
              {aplicacion.tipo_aplicacion === 'Fertilización'
                ? 'Registra bultos totales y bultos aplicados de cada producto'
                : 'Registra canecas totales y canecas aplicadas de cada producto'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-red-800 text-sm mb-1">Error</h4>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Fecha */}
        <div>
          <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#73991C]" />
            Fecha del Movimiento
            <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={fechaMovimiento}
            onChange={(e) => setFechaMovimiento(e.target.value)}
            max={obtenerFechaHoy()}
            disabled={loading}
            className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Lote */}
        <div>
          <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
            <Package className="w-4 h-4 text-[#73991C]" />
            Lote Aplicado
            <span className="text-red-500">*</span>
          </label>
          <select
            value={loteId}
            onChange={(e) => setLoteId(e.target.value)}
            disabled={loading}
            className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Selecciona un lote</option>
            {lotes.map(lote => (
              <option key={lote.lote_id} value={lote.lote_id}>
                {lote.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* 🆕 NUEVO: Equipo de Aplicación */}
        <div>
          <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
            <Droplet className="w-4 h-4 text-[#73991C]" />
            Equipo de Aplicación
          </label>
          <select
            value={equipoAplicacion}
            onChange={(e) => setEquipoAplicacion(e.target.value)}
            disabled={loading}
            className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Selecciona el equipo (opcional)</option>
            <option value="Bomba espalda">🎒 Bomba espalda</option>
            <option value="Bomba estacionaria">⚙️ Bomba estacionaria</option>
            <option value="Fumiducto">🚜 Fumiducto</option>
          </select>
        </div>

        {/* Worker Selection (Employees + Contractors) */}
        <div className="border-t border-[#73991C]/10 pt-6">
          <h4 className="text-sm text-[#172E08] mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-[#73991C]" />
            Selección de Personal
          </h4>

          <TrabajadorMultiSelect
            empleados={empleadosDisponibles}
            contratistas={contratistasDisponibles}
            selectedTrabajadores={selectedTrabajadores}
            onSelectionChange={setSelectedTrabajadores}
            disabled={loading}
          />

          {selectedTrabajadores.length > 0 && loteId && (
            <div className="mt-6">
              <JornalFractionMatrix
                trabajadores={selectedTrabajadores}
                lotes={lotes.filter(l => l.lote_id === loteId).map(l => ({
                  id: l.lote_id,
                  nombre: l.nombre,
                  area_hectareas: l.area_hectareas
                }))}
                workMatrix={workMatrix}
                observaciones={observacionesMatrix}
                onFraccionChange={(trabajadorId, loteId, frac) => {
                  setWorkMatrix(prev => ({
                    ...prev,
                    [trabajadorId]: { ...prev[trabajadorId], [loteId]: frac }
                  }));
                }}
                onObservacionesChange={(trabajadorId, loteId, obs) => {
                  setObservacionesMatrix(prev => ({
                    ...prev,
                    [trabajadorId]: { ...prev[trabajadorId], [loteId]: obs }
                  }));
                }}
                onRemoveTrabajador={(trabajadorId) => {
                  setSelectedTrabajadores(prev =>
                    prev.filter(t => t.data.id !== trabajadorId)
                  );
                }}
                disabled={loading}
                showCostPreview={true}
              />
            </div>
          )}
        </div>

        {/* 🆕 NUEVO: Horario de Trabajo */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#73991C]" />
              Hora de Inicio
            </label>
            <input
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#73991C]" />
              Hora de Fin
            </label>
            <input
              type="time"
              value={horaFin}
              onChange={(e) => setHoraFin(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* Número de Canecas - PARA FUMIGACIÓN Y DRENCH */}
        {(aplicacion.tipo_aplicacion === 'Fumigación' || aplicacion.tipo_aplicacion === 'Drench') && (
          <div>
            <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
              <Droplet className="w-4 h-4 text-[#73991C]" />
              Número TOTAL de Canecas Aplicadas
              <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              <Input
                type="number"
                value={numeroCanecas}
                onChange={(e) => setNumeroCanecas(e.target.value)}
                placeholder="0"
                step="any"
                min="0"
                disabled={loading}
                className="flex-1 bg-white border-[#73991C]/20 focus:border-[#73991C] disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="px-4 py-3 bg-[#E7EDDD] border border-[#73991C]/20 rounded-xl text-[#172E08] min-w-[120px] flex items-center justify-center">
                canecas
              </div>
            </div>
            {loteId && canecasPorLote[loteId] && (
              <div className="mt-2 p-3 bg-[#73991C]/5 border border-[#73991C]/20 rounded-lg">
                <p className="text-xs text-[#4D240F]/70">
                  📊 <strong>Planeado:</strong> {canecasPorLote[loteId]} canecas para este lote
                </p>
              </div>
            )}
          </div>
        )}

        {/* Número de Bultos - SOLO PARA FERTILIZACIÓN */}
        {aplicacion.tipo_aplicacion === 'Fertilización' && (
          <div>
            <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
              <Package className="w-4 h-4 text-[#73991C]" />
              Número TOTAL de Bultos Usados
              <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              <Input
                type="number"
                value={numeroBultos}
                onChange={(e) => setNumeroBultos(e.target.value)}
                placeholder="0"
                step="1"
                min="0"
                disabled={loading}
                className="flex-1 bg-white border-[#73991C]/20 focus:border-[#73991C] disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="px-4 py-3 bg-[#E7EDDD] border border-[#73991C]/20 rounded-xl text-[#172E08] min-w-[120px] flex items-center justify-center">
                bultos
              </div>
            </div>
            {loteId && bultosPorLote[loteId] && (
              <div className="mt-2 p-3 bg-[#73991C]/5 border border-[#73991C]/20 rounded-lg">
                <p className="text-xs text-[#4D240F]/70">
                  📊 <strong>Planeado:</strong> {bultosPorLote[loteId]} bultos para este lote
                </p>
              </div>
            )}
          </div>
        )}

        {/* Productos Utilizados */}
        <div className="border-t border-[#73991C]/10 pt-6">
          <h4 className="text-sm text-[#172E08] mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-[#73991C]" />
            {aplicacion.tipo_aplicacion === 'Fertilización'
              ? 'Bultos Usados de cada Producto'
              : 'Cantidad aplicada de cada producto'
            }
            <span className="text-red-500">*</span>
          </h4>

          {/* Lista de productos precargados */}
          {productosAgregados.length > 0 ? (
            <div className="space-y-3">
              {productosAgregados.map((producto, index) => (
                <div
                  key={index}
                  className="bg-[#F8FAF5] border border-[#73991C]/20 rounded-xl p-4 flex items-center gap-4"
                >
                  <div className="flex-1">
                    <p className="text-sm text-[#172E08] mb-1">
                      {producto.producto_nombre}
                    </p>
                    <p className="text-xs text-[#4D240F]/60">
                      {producto.producto_categoria}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={producto.cantidad_utilizada}
                      onChange={(e) => actualizarCantidadProducto(index, e.target.value)}
                      placeholder="0"
                      step="0.01"
                      min="0"
                      disabled={loading}
                      className="w-32 bg-white border-[#73991C]/20 focus:border-[#73991C] disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    
                    {/* Unidad estática desde BD (no editable) */}
                    {aplicacion.tipo_aplicacion === 'Fertilización' ? (
                      <div className="px-4 py-2 bg-[#E7EDDD] border border-[#73991C]/20 rounded-lg text-[#172E08] text-sm min-w-[80px] flex items-center justify-center">
                        bultos
                      </div>
                    ) : (
                      <div className="px-4 py-2 bg-[#E7EDDD] border border-[#73991C]/20 rounded-lg text-[#172E08] text-sm min-w-[80px] flex items-center justify-center">
                        {producto.unidad_producto}
                      </div>
                    )}
                    
                    <Button
                      type="button"
                      onClick={() => eliminarProducto(index)}
                      disabled={loading}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center border-2 border-dashed border-[#73991C]/20 rounded-xl">
              <Package className="w-12 h-12 text-[#73991C]/30 mx-auto mb-3" />
              <p className="text-sm text-[#4D240F]/50">
                Cargando productos...
              </p>
            </div>
          )}
        </div>

        {/* Responsable */}
        <div>
          <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
            <User className="w-4 h-4 text-[#73991C]" />
            Responsable
            <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            placeholder="Nombre del responsable"
            disabled={loading}
            className="bg-white border-[#73991C]/20 focus:border-[#73991C] disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Condiciones Meteorológicas */}
        <div>
          <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-[#73991C]" />
            Condiciones Meteorológicas
          </label>
          <select
            value={condicionesMeteorologicas}
            onChange={(e) => setCondicionesMeteorologicas(e.target.value)}
            disabled={loading}
            className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Selecciona las condiciones (opcional)</option>
            <option value="soleadas">☀️ Soleadas</option>
            <option value="nubladas">☁️ Nubladas</option>
            <option value="lluvia suave">🌦️ Lluvia Suave</option>
            <option value="lluvia fuerte">⛈️ Lluvia Fuerte</option>
          </select>
        </div>

        {/* Notas */}
        <div>
          <label className="block text-sm text-[#172E08] mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#73991C]" />
            Notas (Opcional)
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Observaciones adicionales..."
            rows={3}
            disabled={loading}
            className="w-full px-4 py-3 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Botones */}
        <div className="flex items-center gap-3 pt-4 border-t border-[#73991C]/10">
          <Button
            type="button"
            onClick={onCancel}
            disabled={loading}
            variant="outline"
            className="flex-1 border-[#73991C]/20 hover:bg-[#73991C]/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#73991C] hover:bg-[#5f7d17] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Registrar Movimiento
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Info de movimiento provisional */}
      <div className="mt-6 p-4 bg-[#73991C]/5 border border-[#73991C]/20 rounded-xl">
        <p className="text-xs text-[#4D240F]/70 flex items-start gap-2">
          <span className="text-[#73991C] mt-0.5">ℹ️</span>
          <span>
            Este es un movimiento <strong>provisional</strong> que no afecta el inventario inmediatamente.
            {aplicacion.tipo_aplicacion === 'Fertilización' 
              ? ' Se registran los bultos totales usados y los bultos de cada producto. Al cerrar la aplicación, se convertirán a Kg según la presentación de cada producto.'
              : ' Se registran las canecas totales aplicadas y las canecas de cada producto. Al cerrar la aplicación, se convertirán a litros.'
            }
          </span>
        </p>
      </div>
    </div>
  );
}