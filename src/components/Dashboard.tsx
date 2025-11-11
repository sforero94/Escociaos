import { useEffect, useState } from 'react';
import { Package, Sprout, Activity, TrendingUp, DollarSign, MapPin } from 'lucide-react';
import { MetricCard } from './ui/MetricCard';
import { AlertBanner } from './ui/AlertBanner';
import { getSupabase } from '../utils/supabase/client';

interface DashboardProps {
  onNavigate: (view: string) => void;
}

interface DashboardData {
  inventoryValue: number;
  inventoryAlerts: number;
  applicationsActive: number;
  nextApplication: string;
  criticalIncidents: number;
  lastMonitoring: string;
  weekProduction: number;
  avgPerTree: number;
  monthlySales: number;
  activeClients: number;
  totalLots: number;
  topLot: string;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [data, setData] = useState<DashboardData>({
    inventoryValue: 0,
    inventoryAlerts: 0,
    applicationsActive: 0,
    nextApplication: 'Cargando...',
    criticalIncidents: 0,
    lastMonitoring: 'Cargando...',
    weekProduction: 0,
    avgPerTree: 0,
    monthlySales: 0,
    activeClients: 0,
    totalLots: 8,
    topLot: 'Cargando...',
  });
  const [alerts, setAlerts] = useState<Array<{ type: 'warning' | 'error' | 'success'; message: string; time: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    // Actualizar cada 30 segundos
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const supabase = getSupabase();

      // Cargar todas las métricas en paralelo
      const [
        inventoryData,
        applicationsData,
        monitoringData,
        productionData,
        salesData,
        lotesData,
      ] = await Promise.all([
        loadInventoryMetrics(supabase),
        loadApplicationsMetrics(supabase),
        loadMonitoringMetrics(supabase),
        loadProductionMetrics(supabase),
        loadSalesMetrics(supabase),
        loadLotesMetrics(supabase),
      ]);

      // Actualizar datos
      setData({
        inventoryValue: inventoryData.total / 1000000,
        inventoryAlerts: inventoryData.alerts,
        applicationsActive: applicationsData.count,
        nextApplication: applicationsData.next || 'Sin aplicaciones programadas',
        criticalIncidents: monitoringData.critical,
        lastMonitoring: monitoringData.lastDate || 'Sin registros',
        weekProduction: productionData.total,
        avgPerTree: productionData.total / 12000, // 12,000 árboles
        monthlySales: salesData.total / 1000000,
        activeClients: salesData.clients,
        totalLots: lotesData.count,
        topLot: lotesData.topLot || 'Sin datos',
      });

      // Cargar alertas
      await loadAlerts(supabase, inventoryData.alerts, monitoringData.critical);

    } catch (error) {
      console.error('Error cargando datos del dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Funciones auxiliares para cargar métricas
  const loadInventoryMetrics = async (supabase: any) => {
    const { data, error } = await supabase
      .from('productos')
      .select('cantidad_actual, precio_unitario, stock_minimo')
      .eq('activo', true);

    if (error) {
      console.error('Error cargando inventario:', error);
      return { total: 0, alerts: 0 };
    }

    const total = data?.reduce(
      (sum: number, p: any) => sum + (p.cantidad_actual || 0) * (p.precio_unitario || 0),
      0
    ) || 0;

    const alerts = data?.filter(
      (p: any) => (p.cantidad_actual || 0) < (p.stock_minimo || 0)
    ).length || 0;

    return { total, alerts };
  };

  const loadApplicationsMetrics = async (supabase: any) => {
    const { count, error } = await supabase
      .from('aplicaciones')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'En ejecución');

    if (error) {
      console.error('Error cargando aplicaciones:', error);
      return { count: 0, next: null };
    }

    // Obtener próxima aplicación programada
    const { data: nextApp } = await supabase
      .from('aplicaciones')
      .select('fecha_aplicacion, nombre_aplicacion')
      .eq('estado', 'Programada')
      .order('fecha_aplicacion', { ascending: true })
      .limit(1)
      .single();

    const nextText = nextApp
      ? `${nextApp.nombre_aplicacion} - ${new Date(nextApp.fecha_aplicacion).toLocaleDateString('es-ES')}`
      : null;

    return { count: count || 0, next: nextText };
  };

  const loadMonitoringMetrics = async (supabase: any) => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('monitoreos')
      .select('gravedad_texto, fecha_monitoreo')
      .eq('gravedad_texto', 'Alta')
      .gte('fecha_monitoreo', weekAgo);

    if (error) {
      console.error('Error cargando monitoreos:', error);
      return { critical: 0, lastDate: null };
    }

    // Obtener último monitoreo
    const { data: lastMon } = await supabase
      .from('monitoreos')
      .select('fecha_monitoreo')
      .order('fecha_monitoreo', { ascending: false })
      .limit(1)
      .single();

    const lastDate = lastMon
      ? new Date(lastMon.fecha_monitoreo).toLocaleDateString('es-ES')
      : null;

    return { critical: data?.length || 0, lastDate };
  };

  const loadProductionMetrics = async (supabase: any) => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('cosechas')
      .select('kilos_cosechados')
      .gte('fecha_cosecha', weekAgo);

    if (error) {
      console.error('Error cargando producción:', error);
      return { total: 0 };
    }

    const total = data?.reduce(
      (sum: number, c: any) => sum + parseFloat(c.kilos_cosechados || 0),
      0
    ) || 0;

    return { total };
  };

  const loadSalesMetrics = async (supabase: any) => {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('despachos')
      .select('valor_total, cliente_id')
      .gte('fecha_despacho', monthAgo);

    if (error) {
      console.error('Error cargando ventas:', error);
      return { total: 0, clients: 0 };
    }

    const total = data?.reduce(
      (sum: number, d: any) => sum + parseFloat(d.valor_total || 0),
      0
    ) || 0;

    const clients = new Set(data?.map((d: any) => d.cliente_id) || []).size;

    return { total, clients };
  };

  const loadLotesMetrics = async (supabase: any) => {
    const { count, error } = await supabase
      .from('lotes')
      .select('*', { count: 'exact', head: true })
      .eq('activo', true);

    if (error) {
      console.error('Error cargando lotes:', error);
      return { count: 0, topLot: null };
    }

    // Obtener lote más productivo (puedes personalizar la lógica)
    const { data: topLote } = await supabase
      .from('lotes')
      .select('nombre')
      .eq('activo', true)
      .order('hectareas', { ascending: false })
      .limit(1)
      .single();

    return { count: count || 8, topLot: topLote?.nombre };
  };

  const loadAlerts = async (supabase: any, lowStockCount: number, criticalCount: number) => {
    const newAlerts: Array<{ type: 'warning' | 'error' | 'success'; message: string; time: string }> = [];

    // Alertas de stock bajo
    if (lowStockCount > 0) {
      const { data: lowStock } = await supabase
        .from('productos')
        .select('nombre')
        .lt('cantidad_actual', supabase.raw('stock_minimo'))
        .limit(3);

      lowStock?.forEach((p: any) => {
        newAlerts.push({
          type: 'warning',
          message: `⚠️ Stock bajo: ${p.nombre}`,
          time: 'Ahora',
        });
      });
    }

    // Alertas de monitoreos críticos
    if (criticalCount > 0) {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const { data: critical } = await supabase
        .from('monitoreos')
        .select(`
          plaga_enfermedad_id,
          plagas_enfermedades_catalogo(nombre),
          lotes(nombre)
        `)
        .eq('gravedad_texto', 'Alta')
        .gte('fecha_monitoreo', weekAgo)
        .limit(2);

      critical?.forEach((m: any) => {
        newAlerts.push({
          type: 'error',
          message: `🔴 ${m.plagas_enfermedades_catalogo?.nombre || 'Incidencia'}: Nivel crítico en ${m.lotes?.nombre || 'lote'}`,
          time: 'Últimos 7 días',
        });
      });
    }

    // Alertas de aplicaciones próximas
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: upcomingApps } = await supabase
      .from('aplicaciones')
      .select('nombre_aplicacion, fecha_aplicacion')
      .eq('estado', 'Programada')
      .lte('fecha_aplicacion', tomorrow)
      .limit(2);

    upcomingApps?.forEach((app: any) => {
      newAlerts.push({
        type: 'warning',
        message: `📅 Aplicación programada: ${app.nombre_aplicacion}`,
        time: new Date(app.fecha_aplicacion).toLocaleDateString('es-ES'),
      });
    });

    // Si no hay alertas, mostrar mensaje positivo
    if (newAlerts.length === 0) {
      newAlerts.push({
        type: 'success',
        message: '✅ No hay alertas pendientes - Todo está en orden',
        time: 'Ahora',
      });
    }

    setAlerts(newAlerts.slice(0, 5)); // Máximo 5 alertas
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[#333333] mb-2">Dashboard</h1>
          <p className="text-[#6B7280]">Cargando datos...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-20 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
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
            Vista general del cultivo de Escocia Hass
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard
          title="INVENTARIO"
          value={`$${data.inventoryValue.toFixed(1)}M`}
          subtitle={`${data.inventoryAlerts} alertas`}
          icon={Package}
          alert={
            data.inventoryAlerts > 0
              ? { count: data.inventoryAlerts, type: 'warning' }
              : undefined
          }
          actionLabel="Ver detalles"
          onAction={() => onNavigate('inventory')}
        />

        <MetricCard
          title="APLICACIONES"
          value={data.applicationsActive}
          subtitle={`Próxima: ${data.nextApplication}`}
          icon={Sprout}
          actionLabel="Nueva aplicación"
          onAction={() => onNavigate('applications')}
        />

        <MetricCard
          title="MONITOREO"
          value={`${data.criticalIncidents} Críticas`}
          subtitle={`Último: ${data.lastMonitoring}`}
          icon={Activity}
          alert={
            data.criticalIncidents > 0
              ? { count: data.criticalIncidents, type: 'error' }
              : undefined
          }
          actionLabel="Registrar monitoreo"
          onAction={() => onNavigate('monitoring')}
        />

        <MetricCard
          title="PRODUCCIÓN"
          value={`${data.weekProduction} kg`}
          subtitle={`Promedio: ${data.avgPerTree.toFixed(3)} kg/árbol`}
          icon={TrendingUp}
          actionLabel="Registrar cosecha"
          onAction={() => onNavigate('production')}
        />

        <MetricCard
          title="VENTAS"
          value={`$${data.monthlySales.toFixed(1)}M`}
          subtitle={`${data.activeClients} clientes activos`}
          icon={DollarSign}
          actionLabel="Nuevo despacho"
          onAction={() => onNavigate('sales')}
        />

        <MetricCard
          title="LOTES"
          value={data.totalLots}
          subtitle={`Más productivo: ${data.topLot}`}
          icon={MapPin}
          alert={{ count: data.totalLots, type: 'success' }}
          actionLabel="Ver lotes"
          onAction={() => onNavigate('lots')}
        />
      </div>

      {/* Alerts Section */}
      <div className="relative">
        <div className="absolute -top-4 -right-4 w-32 h-32 bg-[#BFD97D]/10 rounded-full blur-2xl"></div>
        <div className="relative bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] border border-[#73991C]/5">
          <h2 className="text-[#172E08] mb-4">Alertas Recientes</h2>
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <AlertBanner
                key={index}
                type={alert.type}
                message={alert.message}
                timestamp={alert.time}
                onClick={() => {
                  // Navegar según el tipo de alerta
                  if (alert.message.includes('stock')) {
                    onNavigate('inventory');
                  } else if (alert.message.includes('incidencias')) {
                    onNavigate('monitoring');
                  }
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}