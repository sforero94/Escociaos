import { useState, useEffect } from 'react';
import { X, Edit, PlayCircle, CheckCircle, Calendar, Droplet, Package, MapPin, Target, TrendingUp, ShoppingCart } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { generarPDFListaCompras } from '../../utils/generarPDFListaCompras';
import type { Aplicacion, ListaCompras } from '../../types/aplicaciones';

interface DetalleAplicacionProps {
  aplicacion: Aplicacion;
  onClose: () => void;
  onEditar: () => void;
  onRegistrarMovimientos: () => void;
  onCerrarAplicacion: () => void;
}

interface ResumenInsumo {
  nombre: string;
  unidad: string;
  planeado: number;
  aplicado: number;
}

export function DetalleAplicacion({
  aplicacion,
  onClose,
  onEditar,
  onRegistrarMovimientos,
  onCerrarAplicacion,
}: DetalleAplicacionProps) {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(true);
  const [resumenInsumos, setResumenInsumos] = useState<ResumenInsumo[]>([]);
  const [canecasPlaneadas, setCanecasPlaneadas] = useState(0);
  const [canecasAplicadas, setCanecasAplicadas] = useState(0);
  const [lotes, setLotes] = useState<string[]>([]);
  const [lotesData, setLotesData] = useState<Array<{id: string, nombre: string}>>([]);
  const [selectedLote, setSelectedLote] = useState<string | null>(null);
  const [blancoBiologico, setBlancoBiologico] = useState<string>('');
  const [fechaFinEstimada, setFechaFinEstimada] = useState<string>('');
  const [descargandoPDF, setDescargandoPDF] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, [aplicacion.id, selectedLote]);

  const cargarDatos = async () => {
    setLoading(true);
    try {

      // 1. Cargar aplicación completa
      const { data: appData, error: appError } = await supabase
        .from('aplicaciones')
        .select(`
          *,
          aplicaciones_lotes (
            lotes (
              id,
              nombre,
              total_arboles
            )
          )
        `)
        .eq('id', aplicacion.id)
        .single();

      if (appError) {
      }


      // Extraer lotes con IDs
      const lotesConId = appData?.aplicaciones_lotes?.map(
        (al: any) => ({id: al.lotes?.id || '', nombre: al.lotes?.nombre || 'Sin nombre'})
      ) || [];
      setLotesData(lotesConId);
      const lotesNombres = lotesConId.map(l => l.nombre);
      setLotes(lotesNombres);

      // Extraer fecha fin estimada
      setFechaFinEstimada(appData?.fecha_fin_planeada || '');

      // Extraer blanco biológico
      if (appData?.blanco_biologico) {
        try {
          const bb = JSON.parse(appData.blanco_biologico);
          if (Array.isArray(bb) && bb.length > 0) {
            const { data: plagas } = await supabase
              .from('plagas_enfermedades_catalogo')
              .select('nombre')
              .in('id', bb);
            
            setBlancoBiologico(plagas?.map(p => p.nombre).join(', ') || 'No especificado');
          } else {
            setBlancoBiologico('No especificado');
          }
        } catch {
          setBlancoBiologico('No especificado');
        }
      } else {
        setBlancoBiologico('No especificado');
      }

      // 2. Cargar canecas/bultos planeados (filtrar por lote si está seleccionado)
      const esFertilizacion = aplicacion.tipo === 'fertilizacion';
      const campoUnidad = esFertilizacion ? 'numero_bultos' : 'numero_canecas';

      let calculosQuery = supabase
        .from('aplicaciones_calculos')
        .select(`${campoUnidad}, lote_id`)
        .eq('aplicacion_id', aplicacion.id);

      if (selectedLote) {
        calculosQuery = calculosQuery.eq('lote_id', selectedLote);
      }

      const { data: calculos, error: errorCalculos } = await calculosQuery;

      if (errorCalculos) {
        console.error('Error loading planeadas:', errorCalculos);
      }

      const totalCanecasPlaneadas = calculos?.reduce(
        (sum: number, calc: any) => sum + (calc[campoUnidad] || 0),
        0
      ) || 0;
      setCanecasPlaneadas(totalCanecasPlaneadas);

      // 3. Cargar canecas/bultos aplicados (filtrar por lote si está seleccionado)
      let movimientosQuery = supabase
        .from('movimientos_diarios')
        .select(`${campoUnidad}, lote_id`)
        .eq('aplicacion_id', aplicacion.id);

      if (selectedLote) {
        movimientosQuery = movimientosQuery.eq('lote_id', selectedLote);
      }

      const { data: movimientosDiarios, error: errorMovimientos } = await movimientosQuery;

      if (errorMovimientos) {
        console.error('Error loading aplicadas:', errorMovimientos);
      }

      const totalCanecasAplicadas = movimientosDiarios?.reduce(
        (sum: number, mov: any) => sum + (mov[campoUnidad] || 0),
        0
      ) || 0;
      setCanecasAplicadas(totalCanecasAplicadas);

      // 4. Cargar productos planeados
      const { data: mezclas, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacion.id);

      if (errorMezclas) {
      }

      let productosPlaneados = null;

      if (mezclas && mezclas.length > 0) {
        const mezclasIds = mezclas.map(m => m.id);
        
        const result = await supabase
          .from('aplicaciones_productos')
          .select('producto_id, producto_nombre, producto_unidad, cantidad_total_necesaria')
          .in('mezcla_id', mezclasIds);
        
        productosPlaneados = result.data;

        if (result.error) {
        }
      }

      // 5. Cargar productos aplicados (de movimientos_diarios_productos, filtrar por lote si está seleccionado)
      let movimientosProductosQuery = supabase
        .from('movimientos_diarios')
        .select('id, lote_id')
        .eq('aplicacion_id', aplicacion.id);

      if (selectedLote) {
        movimientosProductosQuery = movimientosProductosQuery.eq('lote_id', selectedLote);
      }

      const { data: movimientos } = await movimientosProductosQuery;

      let productosAplicados: any[] = [];

      if (movimientos && movimientos.length > 0) {
        const movimientoIds = movimientos.map(m => m.id);

        const { data, error } = await supabase
          .from('movimientos_diarios_productos')
          .select('producto_id, producto_nombre, cantidad_utilizada, unidad')
          .in('movimiento_diario_id', movimientoIds);

        if (!error) {
          productosAplicados = data || [];
        }
      }

      // 6. Consolidar insumos
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

      // Agregar aplicados (convirtiendo a unidad base si es necesario)
      productosAplicados?.forEach((prod) => {
        const key = prod.producto_id;
        
        // Convertir a unidad base (L o Kg)
        let cantidadEnUnidadBase = prod.cantidad_utilizada;
        if (prod.unidad === 'cc') {
          cantidadEnUnidadBase = prod.cantidad_utilizada / 1000;
        } else if (prod.unidad === 'g') {
          cantidadEnUnidadBase = prod.cantidad_utilizada / 1000;
        }
        
        if (!insumosMap.has(key)) {
          // Si no existe en planeados, crear entrada
          insumosMap.set(key, {
            nombre: prod.producto_nombre,
            unidad: prod.unidad === 'cc' || prod.unidad === 'L' ? 'Litros' : 'Kilos',
            planeado: 0,
            aplicado: 0,
          });
        }
        const insumo = insumosMap.get(key)!;
        insumo.aplicado += cantidadEnUnidadBase;
      });

      const insumos = Array.from(insumosMap.values());
      setResumenInsumos(insumos);

    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const formatearFecha = (fecha: string | null) => {
    if (!fecha) return '-';
    // Extraer año, mes, día directamente del string para evitar problemas de zona horaria
    const [year, month, day] = fecha.split('T')[0].split('-');
    
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const mesNombre = meses[parseInt(month) - 1];
    
    return `${parseInt(day)} de ${mesNombre} de ${year}`;
  };

  const getEstadoBadge = (estado: string) => {
    const styles = {
      Calculada: 'bg-blue-50 border-blue-200 text-blue-700',
      Programada: 'bg-purple-50 border-purple-200 text-purple-700',
      'En ejecución': 'bg-amber-50 border-amber-200 text-amber-700',
      Cerrada: 'bg-green-50 border-green-200 text-green-700',
    };
    return styles[estado as keyof typeof styles] || 'bg-gray-50 border-gray-200 text-gray-700';
  };

  const getTipoIcon = () => {
    if (aplicacion.tipo === 'fumigacion') return <Droplet className="w-5 h-5" />;
    if (aplicacion.tipo === 'fertilizacion') return <Package className="w-5 h-5" />;
    return <Target className="w-5 h-5" />;
  };

  const getTipoNombre = () => {
    if (aplicacion.tipo === 'fumigacion') return 'Fumigación';
    if (aplicacion.tipo === 'fertilizacion') return 'Fertilización';
    return 'Drench';
  };

  /**
   * Descargar lista de compras en PDF
   */
  const descargarListaCompras = async () => {
    setDescargandoPDF(true);
    try {
      // Cargar lista de compras desde BD
      const { data: compras, error } = await supabase
        .from('aplicaciones_compras')
        .select('*')
        .eq('aplicacion_id', aplicacion.id);

      if (error) throw error;

      if (!compras || compras.length === 0) {
        alert('No hay lista de compras para exportar');
        return;
      }

      // Construir objeto lista
      const lista: ListaCompras = {
        items: compras.map((c) => ({
          producto_id: c.producto_id,
          producto_nombre: c.producto_nombre,
          unidad: c.unidad,
          inventario_actual: c.inventario_actual,
          cantidad_necesaria: c.cantidad_necesaria,
          cantidad_faltante: c.cantidad_faltante,
          unidades_a_comprar: c.unidades_a_comprar,
          presentacion_comercial: c.presentacion_comercial,
          costo_estimado: c.costo_estimado,
          alerta: c.alerta,
        })),
        costo_total_estimado: compras.reduce((sum, c) => sum + (c.costo_estimado || 0), 0),
        productos_sin_precio: compras.filter(c => !c.costo_estimado || c.costo_estimado === 0).length,
      };

      // ESTO ES LO MISMO QUE exportarPDF() de PasoListaCompras
      const configuracion = {
        nombre_aplicacion: aplicacion.nombre,
        tipo_aplicacion: aplicacion.tipo,
        fecha_inicio: aplicacion.fecha_inicio,
      };

      const datosEmpresa = {
        nombre: 'Escocia Hass',
        nit: '900.XXX.XXX-X',
        direccion: 'Dirección del cultivo',
        telefono: '+57 XXX XXX XXXX',
        email: 'contacto@escocia-hass.com',
      };

      generarPDFListaCompras(lista, configuracion, datosEmpresa);

    } catch (error: any) {
      alert('Error al generar el PDF');
    } finally {
      setDescargandoPDF(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-[#F8FAF5] rounded-3xl shadow-[0_8px_48px_rgba(115,153,28,0.15)] max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER con diseño mejorado */}
        <div className="relative bg-gradient-to-r from-[#73991C] to-[#5f7d17] px-6 py-5">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30"></div>
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-white">
                {getTipoIcon()}
              </div>
              <div>
                <h2 className="text-xl text-white">{aplicacion.nombre}</h2>
                <p className="text-sm text-white/80 mt-0.5">{getTipoNombre()}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-lg text-sm border ${getEstadoBadge(aplicacion.estado)}`}>
                {aplicacion.estado}
              </span>
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* CONTENIDO */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-10 h-10 border-4 border-[#73991C]/20 border-t-[#73991C] rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Card de Información General */}
              <div className="bg-white rounded-2xl border border-[#73991C]/10 shadow-[0_2px_12px_rgba(115,153,28,0.06)] overflow-hidden">
                <div className="px-5 py-3 bg-gradient-to-r from-[#73991C]/5 to-transparent border-b border-[#73991C]/10">
                  <h3 className="text-sm text-[#172E08] flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#73991C]" />
                    Información General
                  </h3>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-[#4D240F]/60">Fecha Inicio (Planeada)</p>
                      <p className="text-sm text-[#172E08]">{formatearFecha(aplicacion.fecha_inicio_planeada)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-[#4D240F]/60">Fecha Fin (Planeada)</p>
                      <p className="text-sm text-[#172E08]">{formatearFecha(fechaFinEstimada)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-[#4D240F]/60">Fecha Inicio (Real)</p>
                      <p className="text-sm text-[#172E08]">{formatearFecha(aplicacion.fecha_inicio_ejecucion)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-[#4D240F]/60">Fecha Fin (Real)</p>
                      <p className="text-sm text-[#172E08]">
                        {aplicacion.fecha_cierre ? formatearFecha(aplicacion.fecha_cierre) : (
                          <span className="text-amber-600">En progreso</span>
                        )}
                      </p>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <p className="text-xs text-[#4D240F]/60">Propósito</p>
                      <p className="text-sm text-[#172E08]">{aplicacion.proposito || 'No especificado'}</p>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <p className="text-xs text-[#4D240F]/60 flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        Blanco Biológico
                      </p>
                      <p className="text-sm text-[#172E08]">{blancoBiologico}</p>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <p className="text-xs text-[#4D240F]/60 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        Lotes {selectedLote && <span className="text-[#73991C] font-medium">(filtrado)</span>}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setSelectedLote(null)}
                          className={`px-2 py-1 rounded-lg text-xs transition-all ${
                            !selectedLote
                              ? 'bg-[#73991C] text-white shadow-sm'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Todos
                        </button>
                        {lotesData.map((lote, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedLote(lote.id)}
                            className={`px-2 py-1 rounded-lg text-xs transition-all ${
                              selectedLote === lote.id
                                ? 'bg-[#73991C] text-white shadow-sm'
                                : 'bg-[#73991C]/10 text-[#73991C] hover:bg-[#73991C]/20'
                            }`}
                          >
                            {lote.nombre}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card de Resumen de Canecas/Bultos */}
              <div className="bg-white rounded-2xl border border-[#73991C]/10 shadow-[0_2px_12px_rgba(115,153,28,0.06)] overflow-hidden">
                <div className="px-5 py-3 bg-gradient-to-r from-[#73991C]/5 to-transparent border-b border-[#73991C]/10">
                  <h3 className="text-sm text-[#172E08] flex items-center gap-2">
                    {aplicacion.tipo === 'fertilizacion' ? (
                      <Package className="w-4 h-4 text-[#73991C]" />
                    ) : (
                      <Droplet className="w-4 h-4 text-[#73991C]" />
                    )}
                    {aplicacion.tipo === 'fertilizacion' ? 'Resumen de Bultos' : 'Resumen de Canecas'}
                  </h3>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-[#F8FAF5] rounded-xl">
                      <p className="text-xs text-[#4D240F]/60 mb-1">Planeado</p>
                      <p className="text-2xl text-[#172E08]">{canecasPlaneadas.toFixed(1)}</p>
                    </div>
                    <div className="text-center p-4 bg-[#73991C]/5 rounded-xl">
                      <p className="text-xs text-[#4D240F]/60 mb-1">Aplicado</p>
                      <p className="text-2xl text-[#73991C]">{canecasAplicadas.toFixed(1)}</p>
                      <p className="text-xs text-[#4D240F]/60 mt-1">
                        ({canecasPlaneadas > 0 ? ((canecasAplicadas / canecasPlaneadas) * 100).toFixed(0) : 0}%)
                      </p>
                    </div>
                    <div className="text-center p-4 bg-[#F8FAF5] rounded-xl">
                      <p className="text-xs text-[#4D240F]/60 mb-1">Diferencia</p>
                      <p className={`text-2xl ${
                        canecasAplicadas > canecasPlaneadas
                          ? 'text-red-600'
                          : canecasAplicadas < canecasPlaneadas
                          ? 'text-amber-600'
                          : 'text-gray-600'
                      }`}>
                        {canecasAplicadas > canecasPlaneadas ? '+' : ''}
                        {(canecasAplicadas - canecasPlaneadas).toFixed(1)}
                      </p>
                      <p className="text-xs text-[#4D240F]/60 mt-1">
                        ({canecasPlaneadas > 0 ? (((canecasAplicadas - canecasPlaneadas) / canecasPlaneadas) * 100).toFixed(0) : 0}%)
                      </p>
                    </div>
                  </div>
                  
                  {/* Barra de progreso */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-[#4D240F]/60">Progreso</span>
                      <span className="text-xs text-[#172E08]">
                        {canecasPlaneadas > 0 ? ((canecasAplicadas / canecasPlaneadas) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          canecasAplicadas > canecasPlaneadas
                            ? 'bg-red-500'
                            : canecasAplicadas >= canecasPlaneadas * 0.9
                            ? 'bg-amber-500'
                            : 'bg-[#73991C]'
                        }`}
                        style={{ 
                          width: `${canecasPlaneadas > 0 ? Math.min((canecasAplicadas / canecasPlaneadas) * 100, 100) : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card de Resumen de Insumos */}
              <div className="bg-white rounded-2xl border border-[#73991C]/10 shadow-[0_2px_12px_rgba(115,153,28,0.06)] overflow-hidden">
                <div className="px-5 py-3 bg-gradient-to-r from-[#73991C]/5 to-transparent border-b border-[#73991C]/10">
                  <h3 className="text-sm text-[#172E08] flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#73991C]" />
                    Resumen de Productos
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#F8FAF5]">
                      <tr>
                        <th className="text-left py-3 px-5 text-xs text-[#4D240F]/70">Producto</th>
                        <th className="text-right py-3 px-4 text-xs text-[#4D240F]/70">Planeado</th>
                        <th className="text-right py-3 px-4 text-xs text-[#4D240F]/70">Aplicado</th>
                        <th className="text-right py-3 px-4 text-xs text-[#4D240F]/70">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#73991C]/5">
                      {resumenInsumos.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center">
                            <Package className="w-10 h-10 text-[#73991C]/20 mx-auto mb-2" />
                            <p className="text-sm text-[#4D240F]/50">No hay productos registrados</p>
                          </td>
                        </tr>
                      ) : (
                        resumenInsumos.map((insumo, index) => {
                          const diferencia = insumo.aplicado - insumo.planeado;
                          const porcentaje = insumo.planeado > 0 ? (insumo.aplicado / insumo.planeado) * 100 : 0;
                          
                          return (
                            <tr key={index} className="hover:bg-[#F8FAF5] transition-colors">
                              <td className="py-3 px-5">
                                <div className="text-sm text-[#172E08]">{insumo.nombre}</div>
                                <div className="text-xs text-[#4D240F]/50 mt-0.5">{insumo.unidad}</div>
                              </td>
                              <td className="py-3 px-4 text-right text-sm text-[#172E08]">
                                {insumo.planeado.toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="text-sm text-[#73991C]">
                                  {insumo.aplicado.toFixed(2)}
                                </div>
                                <div className="text-xs text-[#4D240F]/50 mt-0.5">
                                  {porcentaje.toFixed(0)}%
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm ${
                                  diferencia > 0.1
                                    ? 'bg-red-50 text-red-700'
                                    : diferencia < -0.1
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-gray-50 text-gray-700'
                                }`}>
                                  {diferencia > 0 && <TrendingUp className="w-3 h-3" />}
                                  {diferencia > 0 ? '+' : ''}
                                  {diferencia.toFixed(2)}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER con botones mejorados */}
        <div className="border-t border-[#73991C]/10 p-5 bg-white/50 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Botón de lista de compras a la izquierda */}
            <Button
              onClick={descargarListaCompras}
              variant="outline"
              className="border-[#4D240F]/30 text-[#4D240F] hover:bg-[#4D240F]/10 hover:border-[#4D240F]"
              disabled={descargandoPDF}
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Ver Lista de Compras
            </Button>

            {/* Botones de acción a la derecha */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={onEditar}
                disabled={aplicacion.estado !== 'Calculada'}
                variant="outline"
                className="border-[#73991C]/30 text-[#73991C] hover:bg-[#73991C]/10 hover:border-[#73991C]"
              >
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Button>

              <Button
                onClick={onRegistrarMovimientos}
                disabled={aplicacion.estado === 'Cerrada'}
                className="bg-[#4D240F] hover:bg-[#3d1c0c] text-white"
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                Registrar Movimientos
              </Button>

              <Button
                onClick={onCerrarAplicacion}
                disabled={aplicacion.estado !== 'En ejecución'}
                className="bg-[#73991C] hover:bg-[#5f7d17] text-white"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Cerrar Aplicación
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}