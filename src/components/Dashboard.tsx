import { useEffect, useState } from 'react';
import { Package, Sprout, Activity, TrendingUp, DollarSign, MapPin } from 'lucide-react';
import { getSupabase } from '../utils/supabase/client';
import { formatCurrency, formatNumber, formatWeight, formatCompact, formatRelativeTime } from '../utils/format';
import { 
  MetricCard, 
  MetricCardGrid, 
  AlertList, 
  AlertListHeader, 
  AlertListContainer,
  type Alerta 
} from './dashboard';

interface DashboardProps {
  onNavigate: (view: string) => void;
}

/**
 * Métricas principales del dashboard
 */
interface DashboardMetrics {
  inventarioValor: number;           // Valor total del inventario en COP
  aplicacionesActivas: number;       // Aplicaciones en ejecución
  monitoreosCriticos: number;        // Monitoreos críticos (últimos 7 días)
  produccionSemanal: number;         // Producción semanal en kg
  ventasMes: number;                 // Ventas del mes actual en COP
  lotesActivos: number;              // Número de lotes activos
  
  // Datos adicionales para subtítulos
  inventarioAlertas: number;
  proximaAplicacion: string;
  ultimoMonitoreo: string;
  promedioArbol: number;
  clientesActivos: number;
  loteTopNombre: string;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadDashboardData();
    
    // Auto-refresh cada 5 minutos
    const interval = setInterval(loadDashboardData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Carga todos los datos del dashboard en paralelo
   */
  const loadDashboardData = async () => {
    try {
      const supabase = getSupabase();
      
      // Ejecutar todas las queries en paralelo usando Promise.allSettled
      // para que si una falla, las demás continúen
      const results = await Promise.allSettled([
        loadInventarioMetrics(supabase),
        loadAplicacionesMetrics(supabase),
        loadMonitoreosMetrics(supabase),
        loadProduccionMetrics(supabase),
        loadVentasMetrics(supabase),
        loadLotesMetrics(supabase),
      ]);

      // Extraer resultados con valores por defecto si falla
      const [
        inventarioResult,
        aplicacionesResult,
        monitoreosResult,
        produccionResult,
        ventasResult,
        lotesResult,
      ] = results;

      // Determinar qué métricas fallaron
      const newErrors: Record<string, boolean> = {
        inventario: inventarioResult.status === 'rejected',
        aplicaciones: aplicacionesResult.status === 'rejected',
        monitoreos: monitoreosResult.status === 'rejected',
        produccion: produccionResult.status === 'rejected',
        ventas: ventasResult.status === 'rejected',
        lotes: lotesResult.status === 'rejected',
      };
      setErrors(newErrors);

      // Obtener valores o usar defaults
      const inventario = inventarioResult.status === 'fulfilled' 
        ? inventarioResult.value 
        : { valorTotal: 0, alertas: 0 };
      
      const aplicaciones = aplicacionesResult.status === 'fulfilled'
        ? aplicacionesResult.value
        : { activas: 0, proxima: 'Sin datos' };
      
      const monitoreos = monitoreosResult.status === 'fulfilled'
        ? monitoreosResult.value
        : { criticos: 0, ultimo: 'Sin datos' };
      
      const produccion = produccionResult.status === 'fulfilled'
        ? produccionResult.value
        : { semanal: 0, promedio: 0 };
      
      const ventas = ventasResult.status === 'fulfilled'
        ? ventasResult.value
        : { mes: 0, clientes: 0 };
      
      const lotes = lotesResult.status === 'fulfilled'
        ? lotesResult.value
        : { activos: 0, topNombre: 'Sin datos' };

      // Actualizar métricas
      setMetrics({
        inventarioValor: inventario.valorTotal,
        aplicacionesActivas: aplicaciones.activas,
        monitoreosCriticos: monitoreos.criticos,
        produccionSemanal: produccion.semanal,
        ventasMes: ventas.mes,
        lotesActivos: lotes.activos,
        
        inventarioAlertas: inventario.alertas,
        proximaAplicacion: aplicaciones.proxima,
        ultimoMonitoreo: monitoreos.ultimo,
        promedioArbol: produccion.promedio,
        clientesActivos: ventas.clientes,
        loteTopNombre: lotes.topNombre,
      });

      // Cargar alertas (de forma independiente)
      await loadAlertas(supabase);

    } catch (error) {
      console.error('❌ Error general cargando dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 1. INVENTARIO - Valor Total
   * SELECT SUM(cantidad_actual * ultimo_precio_unitario) FROM productos
   */
  const loadInventarioMetrics = async (supabase: any) => {
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('cantidad_actual, precio_unitario, stock_minimo')
        .eq('activo', true);

      if (error) throw error;

      // Calcular valor total
      const valorTotal = data?.reduce(
        (sum: number, p: any) => sum + ((p.cantidad_actual || 0) * (p.precio_unitario || 0)),
        0
      ) || 0;

      // Contar alertas de stock bajo
      const alertas = data?.filter(
        (p: any) => (p.cantidad_actual || 0) <= (p.stock_minimo || 0)
      ).length || 0;

      return { valorTotal, alertas };
    } catch (error) {
      console.error('❌ Error cargando inventario:', error);
      throw error;
    }
  };

  /**
   * 2. APLICACIONES En Ejecución
   * SELECT COUNT(*) FROM aplicaciones WHERE estado = 'en_ejecucion'
   */
  const loadAplicacionesMetrics = async (supabase: any) => {
    try {
      // Contar aplicaciones activas
      const { count, error } = await supabase
        .from('aplicaciones')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'En ejecución');

      if (error) throw error;

      // Obtener próxima aplicación programada
      const { data: proxima, error: errorProxima } = await supabase
        .from('aplicaciones')
        .select('nombre_aplicacion, fecha_aplicacion')
        .eq('estado', 'Programada')
        .order('fecha_aplicacion', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (errorProxima && errorProxima.code !== 'PGRST116') {
        console.warn('⚠️ Error obteniendo próxima aplicación:', errorProxima);
      }

      const proximaTexto = proxima
        ? `${proxima.nombre_aplicacion}`
        : 'Sin aplicaciones programadas';

      return { activas: count || 0, proxima: proximaTexto };
    } catch (error) {
      console.error('❌ Error cargando aplicaciones:', error);
      throw error;
    }
  };

  /**
   * 3. MONITOREOS Críticos (últimos 7 días)
   * SELECT COUNT(*) FROM monitoreos 
   * WHERE gravedad = 'Alta' AND fecha >= NOW() - INTERVAL '7 days'
   */
  const loadMonitoreosMetrics = async (supabase: any) => {
    try {
      const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      // Contar monitoreos críticos de últimos 7 días
      const { data, error } = await supabase
        .from('monitoreos')
        .select('fecha_monitoreo')
        .eq('gravedad_texto', 'Alta')
        .gte('fecha_monitoreo', hace7Dias);

      if (error) throw error;

      // Obtener fecha del último monitoreo
      const { data: ultimo, error: errorUltimo } = await supabase
        .from('monitoreos')
        .select('fecha_monitoreo')
        .order('fecha_monitoreo', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errorUltimo && errorUltimo.code !== 'PGRST116') {
        console.warn('⚠️ Error obteniendo último monitoreo:', errorUltimo);
      }

      const ultimoTexto = ultimo
        ? formatRelativeTime(ultimo.fecha_monitoreo)
        : 'Sin registros';

      return { criticos: data?.length || 0, ultimo: ultimoTexto };
    } catch (error) {
      console.error('❌ Error cargando monitoreos:', error);
      throw error;
    }
  };

  /**
   * 4. PRODUCCIÓN Semanal (kg)
   * SELECT SUM(kilos_cosechados) FROM cosechas
   * WHERE fecha >= NOW() - INTERVAL '7 days'
   */
  const loadProduccionMetrics = async (supabase: any) => {
    try {
      const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const { data, error } = await supabase
        .from('cosechas')
        .select('kilos_cosechados')
        .gte('fecha_cosecha', hace7Dias);

      if (error) throw error;

      const semanal = data?.reduce(
        (sum: number, c: any) => sum + parseFloat(c.kilos_cosechados || 0),
        0
      ) || 0;

      // Promedio por árbol (asumiendo 12,000 árboles)
      const totalArboles = 12000;
      const promedio = semanal > 0 ? semanal / totalArboles : 0;

      return { semanal, promedio };
    } catch (error) {
      console.error('❌ Error cargando producción:', error);
      throw error;
    }
  };

  /**
   * 5. VENTAS del Mes (COP)
   * SELECT SUM(valor_total) FROM despachos
   * WHERE fecha >= DATE_TRUNC('month', NOW())
   */
  const loadVentasMetrics = async (supabase: any) => {
    try {
      // Calcular primer día del mes actual
      const primerDiaMes = new Date();
      primerDiaMes.setDate(1);
      const primerDiaMesISO = primerDiaMes.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('despachos')
        .select('valor_total, cliente_id')
        .gte('fecha_despacho', primerDiaMesISO);

      if (error) throw error;

      // Sumar valor total del mes
      const mes = data?.reduce(
        (sum: number, d: any) => sum + parseFloat(d.valor_total || 0),
        0
      ) || 0;

      // Contar clientes únicos activos este mes
      const clientes = new Set(data?.map((d: any) => d.cliente_id) || []).size;

      return { mes, clientes };
    } catch (error) {
      console.error('❌ Error cargando ventas:', error);
      throw error;
    }
  };

  /**
   * 6. LOTES Activos
   * SELECT COUNT(*) FROM lotes WHERE activo = true
   */
  const loadLotesMetrics = async (supabase: any) => {
    try {
      const { count, error } = await supabase
        .from('lotes')
        .select('*', { count: 'exact', head: true })
        .eq('activo', true);

      if (error) throw error;

      // Obtener lote más grande (por hectáreas)
      const { data: top, error: errorTop } = await supabase
        .from('lotes')
        .select('nombre, hectareas')
        .eq('activo', true)
        .order('hectareas', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errorTop && errorTop.code !== 'PGRST116') {
        console.warn('⚠️ Error obteniendo lote top:', errorTop);
      }

      const topNombre = top
        ? `${top.nombre} (${formatNumber(top.hectareas, 1)} ha)`
        : 'Sin datos';

      return { activos: count || 0, topNombre };
    } catch (error) {
      console.error('❌ Error cargando lotes:', error);
      throw error;
    }
  };

  /**
   * Cargar ALERTAS del sistema
   * 1. Stock bajo
   * 2. Productos por vencer (30 días)
   * 3. Monitoreos críticos recientes
   */
  const loadAlertas = async (supabase: any) => {
    try {
      const nuevasAlertas: Alerta[] = [];

      // 1. ALERTAS DE STOCK BAJO
      const { data: stockBajo, error: errorStock } = await supabase
        .from('productos')
        .select('nombre, cantidad_actual, stock_minimo, fecha_actualizacion')
        .eq('activo', true)
        .order('fecha_actualizacion', { ascending: false });

      if (!errorStock && stockBajo) {
        // Filtrar en JS productos con stock bajo (Supabase no soporta comparación entre columnas)
        const productosBajos = stockBajo
          .filter((p: any) => (p.cantidad_actual || 0) <= (p.stock_minimo || 0))
          .slice(0, 3); // Máximo 3

        productosBajos.forEach((p: any) => {
          nuevasAlertas.push({
            id: `stock-${p.nombre}`,
            tipo: 'stock',
            mensaje: `⚠️ Stock bajo: ${p.nombre} - Solo ${formatNumber(p.cantidad_actual || 0)} unidades`,
            fecha: p.fecha_actualizacion || new Date().toISOString(),
            prioridad: 'alta',
          });
        });
      }

      // 2. ALERTAS DE PRODUCTOS POR VENCER (próximos 30 días)
      const en30Dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const hoy = new Date().toISOString().split('T')[0];

      const { data: porVencer, error: errorVencer } = await supabase
        .from('productos')
        .select('nombre, fecha_vencimiento')
        .lte('fecha_vencimiento', en30Dias)
        .gte('fecha_vencimiento', hoy)
        .order('fecha_vencimiento', { ascending: true })
        .limit(2);

      if (!errorVencer && porVencer && porVencer.length > 0) {
        porVencer.forEach((p: any) => {
          nuevasAlertas.push({
            id: `venc-${p.nombre}`,
            tipo: 'vencimiento',
            mensaje: `📅 Próximo a vencer: ${p.nombre}`,
            fecha: p.fecha_vencimiento,
            prioridad: 'media',
          });
        });
      }

      // 3. ALERTAS DE MONITOREOS CRÍTICOS RECIENTES
      const { data: criticos, error: errorCriticos } = await supabase
        .from('monitoreos')
        .select(`
          id,
          fecha_monitoreo,
          gravedad_texto,
          lote_id,
          plaga_enfermedad_id,
          lotes(nombre),
          plagas_enfermedades_catalogo(nombre)
        `)
        .eq('gravedad_texto', 'Alta')
        .order('fecha_monitoreo', { ascending: false })
        .limit(2);

      if (!errorCriticos && criticos && criticos.length > 0) {
        criticos.forEach((m: any) => {
          const plagaNombre = m.plagas_enfermedades_catalogo?.nombre || 'Incidencia';
          const loteNombre = m.lotes?.nombre || 'lote desconocido';

          nuevasAlertas.push({
            id: `mon-${m.id}`,
            tipo: 'monitoreo',
            mensaje: `🔴 ${plagaNombre}: Nivel crítico en ${loteNombre}`,
            fecha: m.fecha_monitoreo,
            prioridad: 'alta',
          });
        });
      }

      // Limitar a máximo 5 alertas y ordenar por fecha
      const alertasOrdenadas = nuevasAlertas
        .sort((a, b) => {
          if (!a.fecha) return 1;
          if (!b.fecha) return -1;
          return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
        })
        .slice(0, 5);

      setAlertas(alertasOrdenadas);
    } catch (error) {
      console.error('❌ Error cargando alertas:', error);
      setAlertas([]);
    }
  };

  /**
   * Handler para navegación desde alertas
   */
  const handleAlertClick = (alerta: Alerta) => {
    if (alerta.tipo === 'stock') {
      onNavigate('inventory');
    } else if (alerta.tipo === 'monitoreo') {
      onNavigate('monitoring');
    } else if (alerta.tipo === 'vencimiento') {
      onNavigate('inventory');
    }
  };

  /**
   * Obtener valor formateado o placeholder si hay error
   */
  const getValueOrPlaceholder = (
    metricKey: keyof typeof errors,
    value: any,
    formatter?: (v: any) => string
  ) => {
    if (errors[metricKey]) return '--';
    return formatter ? formatter(value) : value;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-[#172E08] mb-2">Dashboard</h1>
          <p className="text-[#4D240F]/70">Cargando datos del cultivo...</p>
        </div>
        
        <MetricCardGrid>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-6 border border-gray-200 animate-pulse"
            >
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
                <div className="h-8 bg-gray-200 rounded w-32"></div>
                <div className="h-3 bg-gray-200 rounded w-40"></div>
              </div>
            </div>
          ))}
        </MetricCardGrid>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative">
        <div className="absolute -top-4 -left-4 w-32 h-32 bg-[#73991C]/5 rounded-full blur-2xl"></div>
        <div className="relative">
          <h1 className="text-[#172E08] mb-2">Dashboard</h1>
          <p className="text-[#4D240F]/70">
            Vista general del cultivo Escocia Hass - 52 hectáreas
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <MetricCardGrid>
        {/* 1. INVENTARIO */}
        <MetricCard
          title="INVENTARIO"
          value={
            metrics
              ? getValueOrPlaceholder(
                  'inventario',
                  formatCurrency(metrics.inventarioValor)
                )
              : '--'
          }
          icon={<Package className="w-6 h-6" />}
          color={metrics && metrics.inventarioAlertas > 0 ? 'yellow' : 'green'}
          subtitle={
            metrics
              ? `${formatNumber(metrics.inventarioAlertas)} productos con stock bajo`
              : 'Cargando...'
          }
          onClick={() => onNavigate('inventory')}
        />

        {/* 2. APLICACIONES */}
        <MetricCard
          title="APLICACIONES"
          value={
            metrics
              ? getValueOrPlaceholder(
                  'aplicaciones',
                  `${formatNumber(metrics.aplicacionesActivas)} activas`
                )
              : '--'
          }
          icon={<Sprout className="w-6 h-6" />}
          color="green"
          subtitle={metrics ? `Próxima: ${metrics.proximaAplicacion}` : 'Cargando...'}
          onClick={() => onNavigate('applications')}
        />

        {/* 3. MONITOREO */}
        <MetricCard
          title="MONITOREO"
          value={
            metrics
              ? getValueOrPlaceholder(
                  'monitoreos',
                  `${formatNumber(metrics.monitoreosCriticos)} críticas`
                )
              : '--'
          }
          icon={<Activity className="w-6 h-6" />}
          color={metrics && metrics.monitoreosCriticos > 0 ? 'red' : 'green'}
          subtitle={metrics ? `Último: ${metrics.ultimoMonitoreo}` : 'Cargando...'}
          onClick={() => onNavigate('monitoring')}
        />

        {/* 4. PRODUCCIÓN */}
        <MetricCard
          title="PRODUCCIÓN"
          value={
            metrics
              ? getValueOrPlaceholder('produccion', formatWeight(metrics.produccionSemanal))
              : '--'
          }
          icon={<TrendingUp className="w-6 h-6" />}
          color="green"
          subtitle={
            metrics
              ? `Promedio: ${formatNumber(metrics.promedioArbol, 3)} kg/árbol`
              : 'Cargando...'
          }
          onClick={() => onNavigate('production')}
        />

        {/* 5. VENTAS */}
        <MetricCard
          title="VENTAS"
          value={
            metrics
              ? getValueOrPlaceholder('ventas', formatCurrency(metrics.ventasMes))
              : '--'
          }
          icon={<DollarSign className="w-6 h-6" />}
          color="blue"
          subtitle={
            metrics
              ? `${formatNumber(metrics.clientesActivos)} clientes activos`
              : 'Cargando...'
          }
          onClick={() => onNavigate('sales')}
        />

        {/* 6. LOTES */}
        <MetricCard
          title="LOTES"
          value={
            metrics ? getValueOrPlaceholder('lotes', formatNumber(metrics.lotesActivos)) : '--'
          }
          icon={<MapPin className="w-6 h-6" />}
          color="gray"
          subtitle={metrics ? `Más grande: ${metrics.loteTopNombre}` : 'Cargando...'}
          onClick={() => onNavigate('lots')}
        />
      </MetricCardGrid>

      {/* Alerts Section */}
      <AlertListContainer>
        <AlertListHeader titulo="Alertas Recientes" count={alertas.length} />
        <AlertList alertas={alertas} onAlertClick={handleAlertClick} maxAlertas={5} />
      </AlertListContainer>
    </div>
  );
}
