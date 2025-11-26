// ARCHIVO: components/aplicaciones/ReporteAplicacion.tsx
// DESCRIPCIÓN: Reporte completo de aplicación individual con análisis detallado
// TABS: Comparación | Por Lote | Por Productos | Detalle Mano de Obra
// MÉTRICAS: Total aplicado, Desviación, Cambio vs anterior, Costos detallados

import { useState, useEffect } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Droplet,
  Package,
  Users,
  MapPin,
  Calendar,
  Target,
  AlertCircle,
  FileDown,
  Minus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getSupabase } from '../../utils/supabase/client';

// ============================================
// INTERFACES
// ============================================

interface Aplicacion {
  id: string;
  codigo_aplicacion: string;
  nombre_aplicacion: string;
  tipo_aplicacion: 'Fumigación' | 'Fertilización' | 'Drench';
  estado: string;
  proposito: string | null;
  blanco_biologico: string | null;
  fecha_inicio_planeada: string | null;
  fecha_fin_planeada: string | null;
  fecha_inicio_real: string | null;
  fecha_fin_real: string | null;
  area_total_m2: number | null;
  numero_canecas_planificadas: number | null;
  created_at: string;
}

interface ReporteAplicacionProps {
  aplicacionId: string;
  onClose: () => void;
}

type TabReporte = 'comparacion' | 'por-lote' | 'productos' | 'mano-obra';

interface MetricasGenerales {
  total_aplicado: number;
  unidad_aplicado: string;
  total_planeado: number;
  desviacion_porcentaje: number;
  cambio_vs_anterior_porcentaje: number;
  costo_total: number;
  costo_insumos: number;
  costo_mano_obra: number;
  costo_por_unidad: number;
  arboles_tratados: number;
  jornales_totales: number;
  arboles_por_jornal: number;
}

interface DatosLote {
  lote_id: string;
  lote_nombre: string;
  arboles_tratados: number;
  volumen_aplicado: number;
  canecas_usadas: number;
  costo_total: number;
  costo_por_arbol: number;
  jornales: number;
  arboles_por_jornal: number;
  area_m2: number;
}

interface DatosProducto {
  producto_id: string;
  producto_nombre: string;
  cantidad_utilizada: number;
  costo: number;
  unidad: string;
  porcentaje_costo: number;
}

interface DatosManoObra {
  fecha: string;
  lote_nombre: string;
  jornales: number;
  arboles_tratados: number;
  arboles_por_jornal: number;
  costo: number;
  hora_inicio: string;
  hora_fin: string;
  aplicadores: string;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function ReporteAplicacion({ aplicacionId, onClose }: ReporteAplicacionProps) {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(true);
  const [tabActual, setTabActual] = useState<TabReporte>('comparacion');

  // Datos principales
  const [aplicacion, setAplicacion] = useState<Aplicacion | null>(null);
  const [metricas, setMetricas] = useState<MetricasGenerales | null>(null);
  const [datosLotes, setDatosLotes] = useState<DatosLote[]>([]);
  const [datosProductos, setDatosProductos] = useState<DatosProducto[]>([]);
  const [datosManoObra, setDatosManoObra] = useState<DatosManoObra[]>([]);
  
  // Comparación
  const [aplicacionComparar, setAplicacionComparar] = useState<Aplicacion | null>(null);
  const [aplicacionesDisponibles, setAplicacionesDisponibles] = useState<Aplicacion[]>([]);
  const [metricasComparacion, setMetricasComparacion] = useState<MetricasGenerales | null>(null);

  const COLORES = ['#73991C', '#BFD97D', '#E7EDDD', '#4D240F', '#172E08', '#F59E0B', '#3B82F6'];

  useEffect(() => {
    cargarDatosCompletos();
  }, [aplicacionId]);

  // ============================================
  // CARGAR DATOS
  // ============================================

  const cargarDatosCompletos = async () => {
    setLoading(true);
    try {
      // 1. Cargar aplicación principal
      const { data: appData, error: errorApp } = await supabase
        .from('aplicaciones')
        .select('*')
        .eq('id', aplicacionId)
        .single();

      if (errorApp) throw errorApp;
      setAplicacion(appData);

      // 2. Cargar aplicaciones del mismo tipo para comparar
      const { data: appsComparar } = await supabase
        .from('aplicaciones')
        .select('*')
        .eq('tipo_aplicacion', appData.tipo_aplicacion)
        .eq('estado', 'Cerrada')
        .neq('id', aplicacionId)
        .order('fecha_inicio_ejecucion', { ascending: false })
        .limit(10);

      setAplicacionesDisponibles(appsComparar || []);

      // Seleccionar la más reciente
      if (appsComparar && appsComparar.length > 0) {
        setAplicacionComparar(appsComparar[0]);
        await calcularMetricas(appsComparar[0], true);
      }

      // 3. Calcular métricas
      await calcularMetricas(appData, false);

      // 4. Cargar datos por lote
      await cargarDatosPorLote(appData);

      // 5. Cargar datos por producto
      await cargarDatosPorProducto(appData);

      // 6. Cargar datos de mano de obra
      await cargarDatosManoObra(appData);
    } catch (error) {
      console.error('Error cargando datos del reporte:', error);
    } finally {
      setLoading(false);
    }
  };

  const calcularMetricas = async (app: Aplicacion, esComparacion: boolean) => {
    try {
      // Calcular totales de productos aplicados
      const { data: mezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', app.id);

      let totalAplicado = 0;
      let totalPlaneado = 0;
      let costoInsumos = 0;

      if (mezclas) {
        for (const mezcla of mezclas) {
          const { data: productos } = await supabase
            .from('aplicaciones_productos')
            .select('cantidad_total_necesaria, productos(precio_unitario)')
            .eq('mezcla_id', mezcla.id);

          if (productos) {
            productos.forEach((p: any) => {
              const cantidad = parseFloat(p.cantidad_total_necesaria) || 0;
              totalAplicado += cantidad;
              const precio = parseFloat(p.productos?.precio_unitario) || 0;
              costoInsumos += cantidad * precio;
            });
          }
        }
      }

      // Calcular jornales y costo mano de obra
      const { data: movimientos } = await supabase
        .from('movimientos_diarios')
        .select('numero_jornales')
        .eq('aplicacion_id', app.id);

      const jornalesTotales = movimientos?.reduce(
        (sum, m) => sum + (m.numero_jornales || 0),
        0
      ) || 0;

      const tarifaJornal = 50000; // COP
      const costoManoObra = jornalesTotales * tarifaJornal;

      // Calcular árboles tratados
      const { data: calculos } = await supabase
        .from('aplicaciones_calculos')
        .select('arboles_tratados_total')
        .eq('aplicacion_id', app.id);

      const arbolesTotales = calculos?.reduce(
        (sum, c) => sum + (c.arboles_tratados_total || 0),
        0
      ) || 0;

      const costoTotal = costoInsumos + costoManoObra;
      const unidad = app.tipo_aplicacion === 'Fertilización' ? 'Kg' : 'Litros';

      // Calcular planeado
      totalPlaneado = app.numero_canecas_planificadas 
        ? app.numero_canecas_planificadas * 200 // Asumiendo canecas de 200L
        : totalAplicado * 1.1; // Fallback: 10% más que lo aplicado

      const desviacion =
        totalPlaneado > 0 ? ((totalAplicado - totalPlaneado) / totalPlaneado) * 100 : 0;

      const metricas: MetricasGenerales = {
        total_aplicado: totalAplicado,
        unidad_aplicado: unidad,
        total_planeado: totalPlaneado,
        desviacion_porcentaje: desviacion,
        cambio_vs_anterior_porcentaje: 0,
        costo_total: costoTotal,
        costo_insumos: costoInsumos,
        costo_mano_obra: costoManoObra,
        costo_por_unidad: totalAplicado > 0 ? costoTotal / totalAplicado : 0,
        arboles_tratados: arbolesTotales,
        jornales_totales: jornalesTotales,
        arboles_por_jornal: jornalesTotales > 0 ? arbolesTotales / jornalesTotales : 0,
      };

      if (esComparacion) {
        setMetricasComparacion(metricas);
      } else {
        setMetricas(metricas);
      }

      // Calcular cambio vs anterior si ambos están disponibles
      if (!esComparacion && metricasComparacion) {
        const cambio =
          metricasComparacion.total_aplicado > 0
            ? ((metricas.total_aplicado - metricasComparacion.total_aplicado) /
                metricasComparacion.total_aplicado) *
              100
            : 0;
        metricas.cambio_vs_anterior_porcentaje = cambio;
        setMetricas({ ...metricas });
      }
    } catch (error) {
      console.error('Error calculando métricas:', error);
    }
  };

  const cargarDatosPorLote = async (app: Aplicacion) => {
    try {
      // Obtener movimientos diarios agrupados por lote
      const { data: movimientos } = await supabase
        .from('movimientos_diarios')
        .select(`
          lote_id,
          numero_canecas,
          numero_jornales,
          lotes(nombre),
          aplicaciones_calculos(arboles_tratados_total)
        `)
        .eq('aplicacion_id', app.id);

      if (!movimientos) return;

      // Agrupar por lote
      const lotesMap = new Map<string, DatosLote>();

      movimientos.forEach((mov: any) => {
        const loteId = mov.lote_id;
        const loteNombre = mov.lotes?.nombre || 'Desconocido';

        if (!lotesMap.has(loteId)) {
          lotesMap.set(loteId, {
            lote_id: loteId,
            lote_nombre: loteNombre,
            arboles_tratados: 0,
            volumen_aplicado: 0,
            canecas_usadas: 0,
            costo_total: 0,
            costo_por_arbol: 0,
            jornales: 0,
            arboles_por_jornal: 0,
            area_m2: 0,
          });
        }

        const lote = lotesMap.get(loteId)!;
        lote.arboles_tratados += mov.aplicaciones_calculos?.arboles_tratados_total || 0;
        lote.canecas_usadas += mov.numero_canecas || 0;
        lote.volumen_aplicado += (mov.numero_canecas || 0) * 200; // Asumiendo 200L
        lote.jornales += mov.numero_jornales || 0;
      });

      // Calcular costos y eficiencia
      const costoJornal = 50000;
      const datosLotes: DatosLote[] = Array.from(lotesMap.values()).map((lote) => {
        const costoManoObra = lote.jornales * costoJornal;
        // Costo insumos proporcional al volumen
        const proporcionVolumen = metricas
          ? lote.volumen_aplicado / metricas.total_aplicado
          : 0;
        const costoInsumosLote = metricas ? metricas.costo_insumos * proporcionVolumen : 0;
        const costoTotal = costoManoObra + costoInsumosLote;

        return {
          ...lote,
          costo_total: costoTotal,
          costo_por_arbol: lote.arboles_tratados > 0 ? costoTotal / lote.arboles_tratados : 0,
          arboles_por_jornal: lote.jornales > 0 ? lote.arboles_tratados / lote.jornales : 0,
        };
      });

      setDatosLotes(datosLotes);
    } catch (error) {
      console.error('Error cargando datos por lote:', error);
    }
  };

  const cargarDatosPorProducto = async (app: Aplicacion) => {
    try {
      const { data: mezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', app.id);

      const productosMap = new Map<string, DatosProducto>();

      if (mezclas) {
        for (const mezcla of mezclas) {
          const { data: productos } = await supabase
            .from('aplicaciones_productos')
            .select(`
              cantidad_total_necesaria,
              productos(id, nombre, precio_unitario, unidad_medida)
            `)
            .eq('mezcla_id', mezcla.id);

          if (productos) {
            productos.forEach((p: any) => {
              const productoId = p.productos.id;
              const cantidad = parseFloat(p.cantidad_total_necesaria) || 0;
              const precio = parseFloat(p.productos.precio_unitario) || 0;
              const costo = cantidad * precio;

              if (!productosMap.has(productoId)) {
                productosMap.set(productoId, {
                  producto_id: productoId,
                  producto_nombre: p.productos.nombre,
                  cantidad_utilizada: 0,
                  costo: 0,
                  unidad: p.productos.unidad_medida || 'L',
                  porcentaje_costo: 0,
                });
              }

              const producto = productosMap.get(productoId)!;
              producto.cantidad_utilizada += cantidad;
              producto.costo += costo;
            });
          }
        }
      }

      // Calcular porcentajes
      const costoTotal = Array.from(productosMap.values()).reduce((sum, p) => sum + p.costo, 0);
      const datosProductos = Array.from(productosMap.values())
        .map((p) => ({
          ...p,
          porcentaje_costo: costoTotal > 0 ? (p.costo / costoTotal) * 100 : 0,
        }))
        .sort((a, b) => b.costo - a.costo);

      setDatosProductos(datosProductos);
    } catch (error) {
      console.error('Error cargando datos por producto:', error);
    }
  };

  const cargarDatosManoObra = async (app: Aplicacion) => {
    try {
      const { data: movimientos } = await supabase
        .from('movimientos_diarios')
        .select(`
          fecha_movimiento,
          numero_jornales,
          hora_inicio,
          hora_fin,
          aplicadores,
          lotes(nombre),
          aplicaciones_calculos(arboles_tratados_total)
        `)
        .eq('aplicacion_id', app.id)
        .order('fecha_movimiento');

      const tarifaJornal = 50000;

      const datosManoObra: DatosManoObra[] =
        movimientos?.map((mov: any) => ({
          fecha: mov.fecha_movimiento,
          lote_nombre: mov.lotes?.nombre || '-',
          jornales: mov.numero_jornales || 0,
          arboles_tratados: mov.aplicaciones_calculos?.arboles_tratados_total || 0,
          arboles_por_jornal:
            mov.numero_jornales > 0
              ? (mov.aplicaciones_calculos?.arboles_tratados_total || 0) / mov.numero_jornales
              : 0,
          costo: (mov.numero_jornales || 0) * tarifaJornal,
          hora_inicio: mov.hora_inicio || '-',
          hora_fin: mov.hora_fin || '-',
          aplicadores: mov.aplicadores || '-',
        })) || [];

      setDatosManoObra(datosManoObra);
    } catch (error) {
      console.error('Error cargando datos de mano de obra:', error);
    }
  };

  // ============================================
  // EXPORTACIÓN
  // ============================================

  const exportarCSV = () => {
    if (!aplicacion || !metricas) return;

    const filas: string[][] = [];

    // Sección: Información General
    filas.push(['=== INFORMACIÓN GENERAL ===']);
    filas.push(['Código', aplicacion.codigo_aplicacion]);
    filas.push(['Tipo', aplicacion.tipo_aplicacion]);
    filas.push(['Estado', aplicacion.estado]);
    filas.push(['Propósito', aplicacion.proposito || '-']);
    filas.push(['Blanco Biológico', aplicacion.blanco_biologico || '-']);
    filas.push([
      'Fecha Inicio',
      formatearFecha(aplicacion.fecha_inicio_real || aplicacion.fecha_inicio_planeada),
    ]);
    filas.push([
      'Fecha Fin',
      formatearFecha(aplicacion.fecha_fin_real || aplicacion.fecha_fin_planeada),
    ]);
    filas.push([]);

    // Sección: Métricas
    filas.push(['=== MÉTRICAS PRINCIPALES ===']);
    filas.push(['Total Aplicado', `${metricas.total_aplicado.toFixed(2)} ${metricas.unidad_aplicado}`]);
    filas.push(['Total Planeado', `${metricas.total_planeado.toFixed(2)} ${metricas.unidad_aplicado}`]);
    filas.push(['Desviación', `${metricas.desviacion_porcentaje.toFixed(2)}%`]);
    filas.push(['Costo Total', `$${metricas.costo_total.toLocaleString()}`]);
    filas.push(['Costo Insumos', `$${metricas.costo_insumos.toLocaleString()}`]);
    filas.push(['Costo Mano de Obra', `$${metricas.costo_mano_obra.toLocaleString()}`]);
    filas.push(['Costo por Unidad', `$${metricas.costo_por_unidad.toFixed(2)}`]);
    filas.push(['Árboles Tratados', metricas.arboles_tratados.toString()]);
    filas.push(['Jornales Totales', metricas.jornales_totales.toString()]);
    filas.push(['Árboles por Jornal', metricas.arboles_por_jornal.toFixed(2)]);
    filas.push([]);

    // Sección: Datos por Lote
    filas.push(['=== DATOS POR LOTE ===']);
    filas.push([
      'Lote',
      'Árboles',
      'Volumen (L)',
      'Canecas',
      'Costo Total',
      'Costo/Árbol',
      'Jornales',
      'Árboles/Jornal',
    ]);
    datosLotes.forEach((lote) => {
      filas.push([
        lote.lote_nombre,
        lote.arboles_tratados.toString(),
        lote.volumen_aplicado.toFixed(2),
        lote.canecas_usadas.toString(),
        lote.costo_total.toFixed(0),
        lote.costo_por_arbol.toFixed(0),
        lote.jornales.toString(),
        lote.arboles_por_jornal.toFixed(2),
      ]);
    });
    filas.push([]);

    // Sección: Productos
    filas.push(['=== PRODUCTOS UTILIZADOS ===']);
    filas.push(['Producto', 'Cantidad', 'Unidad', 'Costo', '% del Total']);
    datosProductos.forEach((prod) => {
      filas.push([
        prod.producto_nombre,
        prod.cantidad_utilizada.toFixed(2),
        prod.unidad,
        prod.costo.toFixed(0),
        prod.porcentaje_costo.toFixed(1) + '%',
      ]);
    });
    filas.push([]);

    // Generar CSV
    const csv = filas
      .map((fila) => fila.map((celda) => `"${celda.toString().replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_${aplicacion.codigo_aplicacion}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // ============================================
  // UTILIDADES
  // ============================================

  const formatearFecha = (fecha: string | null | undefined) => {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="text-[#172E08] mb-1 font-medium">{payload[0].payload.name || payload[0].name}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: <span className="font-medium">{entry.value.toLocaleString()}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading || !aplicacion) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8">
          <div className="w-8 h-8 border-4 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin mx-auto mb-4" />
          <div className="text-center text-[#172E08]">Cargando reporte...</div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'comparacion' as TabReporte, label: 'Comparación', icon: TrendingUp },
    { id: 'por-lote' as TabReporte, label: 'Por Lote', icon: MapPin },
    { id: 'productos' as TabReporte, label: 'Productos', icon: Package },
    { id: 'mano-obra' as TabReporte, label: 'Mano de Obra', icon: Users },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl my-8">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-[#172E08]">
                  {aplicacion.codigo_aplicacion}
                </h2>
                <span className="px-3 py-1 rounded-full text-sm font-medium border bg-purple-50 text-purple-700 border-purple-200">
                  {aplicacion.tipo_aplicacion}
                </span>
                <span className="px-3 py-1 rounded-full text-sm font-medium border bg-green-50 text-green-800 border-green-200">
                  {aplicacion.estado}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-[#4D240F]/70">
                {aplicacion.proposito && (
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    <span>
                      {aplicacion.proposito}
                      {aplicacion.blanco_biologico && ` - ${aplicacion.blanco_biologico}`}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {formatearFecha(aplicacion.fecha_inicio_real || aplicacion.fecha_inicio_planeada)}
                    {' al '}
                    {formatearFecha(aplicacion.fecha_fin_real || aplicacion.fecha_fin_planeada)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportarCSV}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileDown className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar</span>
              </button>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Métricas generales (Grid responsivo) */}
        {metricas && (
          <div className="p-6 border-b border-gray-200 bg-[#F8FAF5]">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
              {/* Total Aplicado */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Droplet className="w-4 h-4 text-[#73991C]" />
                  <div className="text-xs text-[#4D240F]/60">Total Aplicado</div>
                </div>
                <div className="text-xl font-bold text-[#172E08]">
                  {metricas.total_aplicado.toFixed(1)}
                </div>
                <div className="text-xs text-[#4D240F]/60 mt-1">{metricas.unidad_aplicado}</div>
              </div>

              {/* Desviación % */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-[#4D240F]/60 mb-2">Desviación</div>
                <div
                  className={`text-xl font-bold flex items-center gap-1 ${
                    Math.abs(metricas.desviacion_porcentaje) > 15
                      ? 'text-red-600'
                      : Math.abs(metricas.desviacion_porcentaje) > 5
                      ? 'text-amber-600'
                      : 'text-green-600'
                  }`}
                >
                  {metricas.desviacion_porcentaje > 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : metricas.desviacion_porcentaje < 0 ? (
                    <TrendingDown className="w-4 h-4" />
                  ) : (
                    <Minus className="w-4 h-4" />
                  )}
                  {Math.abs(metricas.desviacion_porcentaje).toFixed(1)}%
                </div>
              </div>

              {/* Cambio vs Anterior */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-[#4D240F]/60 mb-2">vs. Anterior</div>
                <div className="text-xl font-bold text-blue-600 flex items-center gap-1">
                  {metricas.cambio_vs_anterior_porcentaje > 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : metricas.cambio_vs_anterior_porcentaje < 0 ? (
                    <TrendingDown className="w-4 h-4" />
                  ) : (
                    <Minus className="w-4 h-4" />
                  )}
                  {Math.abs(metricas.cambio_vs_anterior_porcentaje).toFixed(1)}%
                </div>
              </div>

              {/* Costo Total */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  <div className="text-xs text-[#4D240F]/60">Costo Total</div>
                </div>
                <div className="text-xl font-bold text-[#172E08]">
                  ${(metricas.costo_total / 1000).toFixed(0)}K
                </div>
              </div>

              {/* Costo Insumos */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-[#4D240F]/60 mb-2">Insumos</div>
                <div className="text-xl font-bold text-[#73991C]">
                  ${(metricas.costo_insumos / 1000).toFixed(0)}K
                </div>
                <div className="text-xs text-[#4D240F]/60 mt-1">
                  {((metricas.costo_insumos / metricas.costo_total) * 100).toFixed(0)}%
                </div>
              </div>

              {/* Costo Mano de Obra */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-[#4D240F]/60 mb-2">Mano de Obra</div>
                <div className="text-xl font-bold text-[#73991C]">
                  ${(metricas.costo_mano_obra / 1000).toFixed(0)}K
                </div>
                <div className="text-xs text-[#4D240F]/60 mt-1">
                  {((metricas.costo_mano_obra / metricas.costo_total) * 100).toFixed(0)}%
                </div>
              </div>

              {/* Árboles Tratados */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-[#4D240F]/60 mb-2">Árboles</div>
                <div className="text-xl font-bold text-[#172E08]">
                  {metricas.arboles_tratados.toLocaleString()}
                </div>
              </div>

              {/* Árboles/Jornal */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  <div className="text-xs text-[#4D240F]/60">Árb/Jornal</div>
                </div>
                <div className="text-xl font-bold text-[#172E08]">
                  {metricas.arboles_por_jornal.toFixed(1)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs navegables */}
        <div className="border-b border-gray-200">
          <div className="px-6 flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tabActual === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setTabActual(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 border-b-2 transition-all whitespace-nowrap
                    ${
                      isActive
                        ? 'border-[#73991C] text-[#73991C] bg-[#F8FAF5]'
                        : 'border-transparent text-[#4D240F]/60 hover:text-[#172E08] hover:bg-[#F8FAF5]/50'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium text-sm">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Contenido del tab */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {/* TAB: Comparación */}
          {tabActual === 'comparacion' && (
            <div className="space-y-6">
              {/* Selector */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <label className="text-sm font-medium text-[#172E08] whitespace-nowrap">
                  Comparar con:
                </label>
                <select
                  value={aplicacionComparar?.id || ''}
                  onChange={async (e) => {
                    const app = aplicacionesDisponibles.find((a) => a.id === e.target.value);
                    setAplicacionComparar(app || null);
                    if (app) {
                      await calcularMetricas(app, true);
                    }
                  }}
                  className="flex-1 max-w-md px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]"
                >
                  <option value="">Seleccionar aplicación</option>
                  {aplicacionesDisponibles.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.codigo_aplicacion} -{' '}
                      {formatearFecha(app.fecha_inicio_real || app.fecha_inicio_planeada)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tabla comparativa */}
              {aplicacionComparar && metricasComparacion && metricas ? (
                <div className="space-y-6">
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-[#F8FAF5]">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-[#172E08]">
                            Métrica
                          </th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-[#172E08]">
                            Actual
                          </th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-[#172E08]">
                            Anterior
                          </th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-[#172E08]">
                            Diferencia
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        <tr>
                          <td className="px-4 py-3 text-sm text-[#172E08]">Total Aplicado</td>
                          <td className="px-4 py-3 text-center text-sm font-medium">
                            {metricas.total_aplicado.toFixed(1)} {metricas.unidad_aplicado}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            {metricasComparacion.total_aplicado.toFixed(1)}{' '}
                            {metricasComparacion.unidad_aplicado}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-medium">
                            <span
                              className={
                                metricas.total_aplicado > metricasComparacion.total_aplicado
                                  ? 'text-red-600'
                                  : 'text-green-600'
                              }
                            >
                              {(
                                ((metricas.total_aplicado - metricasComparacion.total_aplicado) /
                                  metricasComparacion.total_aplicado) *
                                100
                              ).toFixed(1)}
                              %
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-sm text-[#172E08]">Costo Total</td>
                          <td className="px-4 py-3 text-center text-sm font-medium">
                            ${metricas.costo_total.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            ${metricasComparacion.costo_total.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-medium">
                            <span
                              className={
                                metricas.costo_total > metricasComparacion.costo_total
                                  ? 'text-red-600'
                                  : 'text-green-600'
                              }
                            >
                              {(
                                ((metricas.costo_total - metricasComparacion.costo_total) /
                                  metricasComparacion.costo_total) *
                                100
                              ).toFixed(1)}
                              %
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-sm text-[#172E08]">Árboles/Jornal</td>
                          <td className="px-4 py-3 text-center text-sm font-medium">
                            {metricas.arboles_por_jornal.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            {metricasComparacion.arboles_por_jornal.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-medium">
                            <span
                              className={
                                metricas.arboles_por_jornal > metricasComparacion.arboles_por_jornal
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }
                            >
                              {(
                                ((metricas.arboles_por_jornal -
                                  metricasComparacion.arboles_por_jornal) /
                                  metricasComparacion.arboles_por_jornal) *
                                100
                              ).toFixed(1)}
                              %
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-sm text-[#172E08]">Costo por Unidad</td>
                          <td className="px-4 py-3 text-center text-sm font-medium">
                            ${metricas.costo_por_unidad.toFixed(0)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            ${metricasComparacion.costo_por_unidad.toFixed(0)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-medium">
                            <span
                              className={
                                metricas.costo_por_unidad > metricasComparacion.costo_por_unidad
                                  ? 'text-red-600'
                                  : 'text-green-600'
                              }
                            >
                              {(
                                ((metricas.costo_por_unidad -
                                  metricasComparacion.costo_por_unidad) /
                                  metricasComparacion.costo_por_unidad) *
                                100
                              ).toFixed(1)}
                              %
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-sm text-[#172E08]">Jornales Totales</td>
                          <td className="px-4 py-3 text-center text-sm font-medium">
                            {metricas.jornales_totales}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            {metricasComparacion.jornales_totales}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-medium">
                            <span
                              className={
                                metricas.jornales_totales > metricasComparacion.jornales_totales
                                  ? 'text-red-600'
                                  : 'text-green-600'
                              }
                            >
                              {metricasComparacion.jornales_totales > 0
                                ? (
                                    ((metricas.jornales_totales -
                                      metricasComparacion.jornales_totales) /
                                      metricasComparacion.jornales_totales) *
                                    100
                                  ).toFixed(1)
                                : '0.0'}
                              %
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Gráfico comparativo de costos */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h4 className="text-sm font-semibold text-[#172E08] mb-4">
                      Comparación de Costos
                    </h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={[
                          {
                            nombre: 'Insumos',
                            Actual: metricas.costo_insumos,
                            Anterior: metricasComparacion.costo_insumos,
                          },
                          {
                            nombre: 'Mano de Obra',
                            Actual: metricas.costo_mano_obra,
                            Anterior: metricasComparacion.costo_mano_obra,
                          },
                          {
                            nombre: 'Total',
                            Actual: metricas.costo_total,
                            Anterior: metricasComparacion.costo_total,
                          },
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7EDDD" />
                        <XAxis dataKey="nombre" stroke="#4D240F" style={{ fontSize: '12px' }} />
                        <YAxis stroke="#4D240F" style={{ fontSize: '12px' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar dataKey="Actual" fill="#73991C" />
                        <Bar dataKey="Anterior" fill="#BFD97D" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-[#4D240F]/60">
                  <AlertCircle className="w-16 h-16 mx-auto mb-4 text-[#4D240F]/30" />
                  <p>Selecciona una aplicación anterior para comparar</p>
                </div>
              )}
            </div>
          )}

          {/* TAB: Por Lote */}
          {tabActual === 'por-lote' && (
            <div className="space-y-6">
              {/* Gráfico de costos por lote */}
              {datosLotes.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h4 className="text-sm font-semibold text-[#172E08] mb-4">
                    Costo Total por Lote
                  </h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={datosLotes}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E7EDDD" />
                      <XAxis dataKey="lote_nombre" stroke="#4D240F" style={{ fontSize: '12px' }} />
                      <YAxis stroke="#4D240F" style={{ fontSize: '12px' }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="costo_total" name="Costo Total" fill="#73991C" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Cards por lote */}
              <div className="space-y-4">
                {datosLotes.map((lote) => (
                  <div
                    key={lote.lote_id}
                    className="bg-white rounded-lg border border-gray-200 p-5"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#73991C]/10 rounded-lg flex items-center justify-center">
                          <MapPin className="w-5 h-5 text-[#73991C]" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-[#172E08]">{lote.lote_nombre}</h3>
                          <p className="text-sm text-[#4D240F]/70">
                            {lote.arboles_tratados.toLocaleString()} árboles
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-[#73991C]">
                          ${(lote.costo_total / 1000).toFixed(1)}K
                        </p>
                        <p className="text-xs text-[#4D240F]/60">Costo total</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-xs text-[#4D240F]/60 mb-1">Volumen</div>
                        <div className="font-medium">{lote.volumen_aplicado.toFixed(1)} L</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#4D240F]/60 mb-1">Canecas</div>
                        <div className="font-medium">{lote.canecas_usadas}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#4D240F]/60 mb-1">Costo/Árbol</div>
                        <div className="font-medium">${lote.costo_por_arbol.toFixed(0)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#4D240F]/60 mb-1">Eficiencia</div>
                        <div className="font-medium text-[#73991C]">
                          {lote.arboles_por_jornal.toFixed(1)} árb/j
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {datosLotes.length === 0 && (
                <div className="text-center py-12 text-[#4D240F]/60">
                  <MapPin className="w-16 h-16 mx-auto mb-4 text-[#4D240F]/30" />
                  <p>No hay datos de lotes disponibles</p>
                </div>
              )}
            </div>
          )}

          {/* TAB: Productos */}
          {tabActual === 'productos' && (
            <div className="space-y-6">
              {/* Gráfico de pastel */}
              {datosProductos.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h4 className="text-sm font-semibold text-[#172E08] mb-4">
                    Distribución de Costos por Producto
                  </h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={datosProductos}
                        dataKey="costo"
                        nameKey="producto_nombre"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={(entry) => `${entry.producto_nombre}: ${entry.porcentaje_costo.toFixed(1)}%`}
                      >
                        {datosProductos.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORES[index % COLORES.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Tabla de productos */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-[#F8FAF5]">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-[#172E08]">
                        Producto
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-[#172E08]">
                        Cantidad
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-[#172E08]">
                        Costo
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-[#172E08]">
                        % del Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {datosProductos.map((producto, idx) => (
                      <tr key={producto.producto_id} className="hover:bg-[#F8FAF5]/50">
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: COLORES[idx % COLORES.length] }}
                            ></div>
                            {producto.producto_nombre}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-medium">
                          {producto.cantidad_utilizada.toFixed(2)} {producto.unidad}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-medium">
                          ${producto.costo.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${producto.porcentaje_costo}%`,
                                  backgroundColor: COLORES[idx % COLORES.length],
                                }}
                              ></div>
                            </div>
                            <span className="font-medium">
                              {producto.porcentaje_costo.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {datosProductos.length === 0 && (
                  <div className="text-center py-12 text-[#4D240F]/60">
                    <Package className="w-16 h-16 mx-auto mb-4 text-[#4D240F]/30" />
                    <p>No hay datos de productos disponibles</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Mano de Obra */}
          {tabActual === 'mano-obra' && (
            <div className="space-y-6">
              {/* Resumen general */}
              {metricas && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="font-semibold text-[#172E08] mb-4">Resumen de Mano de Obra</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Users className="w-8 h-8 text-purple-600" />
                      </div>
                      <div className="text-3xl font-bold text-[#172E08]">
                        {metricas.jornales_totales}
                      </div>
                      <div className="text-sm text-[#4D240F]/60 mt-1">Total Jornales</div>
                    </div>
                    <div className="text-center">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <DollarSign className="w-8 h-8 text-green-600" />
                      </div>
                      <div className="text-3xl font-bold text-[#73991C]">
                        ${(metricas.costo_mano_obra / 1000).toFixed(0)}K
                      </div>
                      <div className="text-sm text-[#4D240F]/60 mt-1">Costo Total</div>
                    </div>
                    <div className="text-center">
                      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <TrendingUp className="w-8 h-8 text-blue-600" />
                      </div>
                      <div className="text-3xl font-bold text-[#172E08]">
                        {metricas.arboles_por_jornal.toFixed(1)}
                      </div>
                      <div className="text-sm text-[#4D240F]/60 mt-1">Árboles/Jornal</div>
                    </div>
                    <div className="text-center">
                      <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <DollarSign className="w-8 h-8 text-amber-600" />
                      </div>
                      <div className="text-3xl font-bold text-[#172E08]">
                        $
                        {metricas.jornales_totales > 0
                          ? (metricas.costo_mano_obra / metricas.jornales_totales).toFixed(0)
                          : '0'}
                      </div>
                      <div className="text-sm text-[#4D240F]/60 mt-1">Valor por Jornal</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabla detallada */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="p-4 bg-[#F8FAF5] border-b border-gray-200">
                  <h4 className="font-semibold text-[#172E08]">Detalle Diario</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#F8FAF5] border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#172E08]">
                          Fecha
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#172E08]">
                          Lote
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[#172E08]">
                          Jornales
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[#172E08]">
                          Árboles
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[#172E08]">
                          Árb/Jornal
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[#172E08]">
                          Costo
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-[#172E08]">
                          Horario
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#172E08]">
                          Aplicadores
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {datosManoObra.map((dato, idx) => (
                        <tr key={idx} className="hover:bg-[#F8FAF5]/50">
                          <td className="px-4 py-3 text-sm">{formatearFecha(dato.fecha)}</td>
                          <td className="px-4 py-3 text-sm">{dato.lote_nombre}</td>
                          <td className="px-4 py-3 text-center text-sm font-medium">
                            {dato.jornales}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            {dato.arboles_tratados}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            <span
                              className={`font-medium ${
                                dato.arboles_por_jornal >= 80
                                  ? 'text-green-600'
                                  : dato.arboles_por_jornal >= 60
                                  ? 'text-amber-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {dato.arboles_por_jornal.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            ${dato.costo.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center text-xs">
                            {dato.hora_inicio} - {dato.hora_fin}
                          </td>
                          <td className="px-4 py-3 text-sm">{dato.aplicadores}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {datosManoObra.length === 0 && (
                    <div className="text-center py-12 text-[#4D240F]/60">
                      <Users className="w-16 h-16 mx-auto mb-4 text-[#4D240F]/30" />
                      <p>No hay datos de mano de obra disponibles</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={exportarCSV}
            className="px-6 py-2.5 bg-[#73991C] text-white rounded-lg hover:bg-[#5C7A16] transition-colors"
          >
            Exportar Reporte
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-white border border-gray-200 text-[#172E08] rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
