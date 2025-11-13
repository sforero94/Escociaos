import { useState, useEffect } from 'react';
import { Save, X, Calendar, Package, Droplet, User, Plus, Trash2, AlertTriangle, FileText, Cloud } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { obtenerFechaHoy } from '../../utils/fechas';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { 
  Aplicacion, 
  MovimientoDiario, 
  MovimientoDiarioProducto,
  LoteSeleccionado,
  ProductoEnMezcla
} from '../../types/aplicaciones';

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
  unidad_producto?: 'cc' | 'L' | 'bultos'; // 🚨 CORREGIDO: Para fumigación/drench usa cc o L, para fertilización usa bultos
  presentacion_kg_l?: number; // SOLO para fertilización: cuántos Kg por bulto
}

export function DailyMovementForm({ aplicacion, onSuccess, onCancel }: DailyMovementFormProps) {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🚨 DIAGNÓSTICO - Verificar tipo de aplicación
  console.log('🚨 TIPO DE APLICACIÓN RECIBIDA:', aplicacion.tipo_aplicacion);
  console.log('🚨 APLICACIÓN COMPLETA:', aplicacion);

  // Estados del formulario
  const [fechaMovimiento, setFechaMovimiento] = useState(obtenerFechaHoy());
  const [loteId, setLoteId] = useState('');
  const [numeroCanecas, setNumeroCanecas] = useState(''); // Total para fumigación/drench
  const [numeroBultos, setNumeroBultos] = useState(''); // Total para fertilización
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

  // Cargar datos al montar
  useEffect(() => {
    cargarDatosAplicacion();
    cargarUsuarioActual();
  }, [aplicacion.id]);

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

      // Cargar cálculos por lote según tipo de aplicación
      const { data: calculosData, error: errorCalculos } = await supabase
        .from('aplicaciones_calculos')
        .select('lote_id, numero_canecas, numero_bultos')
        .eq('aplicacion_id', aplicacion.id);

      if (!errorCalculos && calculosData) {
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
        const mezclaIds = mezclasData.map(m => m.id);

        const { data: productosData, error: errorProductos } = await supabase
          .from('aplicaciones_productos')
          .select(`
            producto_id,
            producto_nombre,
            producto_categoria,
            producto_unidad,
            cantidad_total_necesaria
          `)
          .in('mezcla_id', mezclaIds);

        if (errorProductos) throw errorProductos;

        // Eliminar duplicados por producto_id
        const productosUnicos = new Map<string, any>();
        (productosData || []).forEach(p => {
          if (!productosUnicos.has(p.producto_id)) {
            productosUnicos.set(p.producto_id, {
              producto_id: p.producto_id,
              producto_nombre: p.producto_nombre,
              producto_categoria: p.producto_categoria,
              producto_unidad: p.producto_unidad,
              cantidad_total_necesaria: p.cantidad_total_necesaria
            });
          }
        });

        setProductosDisponibles(Array.from(productosUnicos.values()));
      }
    } catch (err: any) {
      console.error('Error cargando datos:', err);
      setError('Error al cargar los datos de la aplicación');
    }
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
      console.error('Error cargando usuario:', err);
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
          console.error('Error cargando presentacion_kg_l:', errorProducto);
        } else {
          presentacionKgL = productoData?.presentacion_kg_l;
        }
      } catch (err) {
        console.error('Error al cargar presentacion:', err);
      }
    }

    const nuevoProducto: ProductoFormulario = {
      producto_id: producto.producto_id,
      producto_nombre: producto.producto_nombre,
      producto_categoria: producto.producto_categoria,
      cantidad_utilizada: '',
      unidad_producto: aplicacion.tipo_aplicacion === 'Fertilización' ? 'bultos' : 'cc', // 🚨 CORREGIDO: Para fumigación/drench inicia en 'cc'
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

    // Validar que la suma de productos no exceda el total
    const totalProductos = productosAgregados.reduce((sum, p) => sum + parseFloat(p.cantidad_utilizada), 0);
    
    if (aplicacion.tipo_aplicacion === 'Fertilización') {
      const totalBultos = parseFloat(numeroBultos);
      if (totalProductos > totalBultos) {
        setError(`La suma de bultos por producto (${totalProductos}) excede el total de bultos (${totalBultos})`);
        return false;
      }
    } else if (aplicacion.tipo_aplicacion === 'Fumigación' || aplicacion.tipo_aplicacion === 'Drench') {
      const totalCanecas = parseFloat(numeroCanecas);
      if (totalProductos > totalCanecas) {
        setError(`La suma de canecas por producto (${totalProductos}) excede el total de canecas (${totalCanecas})`);
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
        numero_bultos: aplicacion.tipo_aplicacion === 'Fertilización' ? parseFloat(numeroBultos) : undefined,
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
      // 🚨 CONVERSIÓN A UNIDADES BASE SEGÚN /supabase_tablas.md:
      // - Fertilización: bultos → Kg (usando presentacion_kg_l)
      // - Fumigación/Drench: guardar directamente en cc o L (SIN CONVERSIÓN)
      const productosParaInsertar: Omit<MovimientoDiarioProducto, 'id' | 'created_at'>[] = productosAgregados.map(p => {
        let cantidadFinal: number;
        let unidadFinal: 'cc' | 'L' | 'g' | 'Kg';

        if (aplicacion.tipo_aplicacion === 'Fertilización') {
          // Convertir bultos a Kg
          if (!p.presentacion_kg_l) {
            throw new Error(`El producto ${p.producto_nombre} no tiene presentación en Kg/bulto configurada`);
          }
          cantidadFinal = parseFloat(p.cantidad_utilizada) * p.presentacion_kg_l;
          unidadFinal = 'Kg';
          console.log(`✅ Fertilización: ${p.cantidad_utilizada} bultos × ${p.presentacion_kg_l} Kg/bulto = ${cantidadFinal} Kg`);
        } else {
          // Fumigación/Drench: Guardar directamente en cc o L (SIN CONVERSIÓN)
          cantidadFinal = parseFloat(p.cantidad_utilizada);
          unidadFinal = p.unidad_producto as 'cc' | 'L'; // Ya viene correcto desde el selector
          console.log(`✅ Fumigación/Drench: ${cantidadFinal} ${unidadFinal} (sin conversión)`);
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

      console.log('✅ Movimiento diario y productos registrados exitosamente');

      // Limpiar formulario
      setFechaMovimiento(obtenerFechaHoy());
      setLoteId('');
      setNumeroCanecas('');
      setNumeroBultos('');
      setCondicionesMeteorologicas('');
      setNotas('');
      setProductosAgregados([]);

      // Notificar éxito
      onSuccess();

    } catch (err: any) {
      console.error('Error guardando movimiento:', err);
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
                step="0.1"
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
              : 'Canecas Aplicadas de cada Producto'
            }
            <span className="text-red-500">*</span>
          </h4>

          {/* Selector de producto */}
          <div className="flex gap-3 mb-4">
            <select
              value={productoSeleccionadoId}
              onChange={(e) => setProductoSeleccionadoId(e.target.value)}
              disabled={loading}
              className="flex-1 px-4 py-3 border border-[#73991C]/20 rounded-xl bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Selecciona un producto para agregar</option>
              {productosDisponibles
                .filter(p => !productosAgregados.some(pa => pa.producto_id === p.producto_id))
                .map(producto => (
                  <option key={producto.producto_id} value={producto.producto_id}>
                    {producto.producto_nombre} ({producto.producto_categoria})
                  </option>
                ))}
            </select>
            <Button
              type="button"
              onClick={agregarProducto}
              disabled={loading || !productoSeleccionadoId}
              className="bg-[#73991C] hover:bg-[#5f7d17] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar
            </Button>
          </div>

          {/* Lista de productos agregados */}
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
                      step={aplicacion.tipo_aplicacion === 'Fertilización' ? '1' : '0.1'}
                      min="0"
                      disabled={loading}
                      className="w-32 bg-white border-[#73991C]/20 focus:border-[#73991C] disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    
                    {/* 🚨 CORREGIDO: Unidad según tipo de aplicación */}
                    {aplicacion.tipo_aplicacion === 'Fertilización' ? (
                      <div className="px-4 py-2 bg-[#E7EDDD] border border-[#73991C]/20 rounded-lg text-[#172E08] text-sm min-w-[80px] flex items-center justify-center">
                        bultos
                      </div>
                    ) : (
                      <select
                        value={producto.unidad_producto || 'cc'}
                        onChange={(e) => actualizarUnidadProducto(index, e.target.value as 'cc' | 'L')}
                        disabled={loading}
                        className="px-4 py-2 bg-white border border-[#73991C]/20 rounded-lg text-[#172E08] text-sm min-w-[80px] focus:outline-none focus:ring-2 focus:ring-[#73991C] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="cc">cc</option>
                        <option value="L">L</option>
                      </select>
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
                No hay productos agregados. Selecciona un producto arriba para comenzar.
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