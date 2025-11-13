import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Sprout, Package, Briefcase, TrendingUp, TrendingDown } from 'lucide-react';
import { getSupabase } from '../utils/supabase/client';
import { formatNumber } from '../utils/format';
import { 
  AlertList, 
  AlertListHeader, 
  AlertListContainer,
  type Alerta 
} from './dashboard';

interface DashboardProps {
  onNavigate?: (view: string) => void;
}

/**
 * Tarjeta de Monitoreo (placeholder)
 */
function MonitoreoCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-[#73991C]/40 transition-all cursor-pointer group shadow-sm hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
          <Eye className="w-6 h-6 text-[#73991C]" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-[#4D240F]/60 mb-1 tracking-wide uppercase">Monitoreo</p>
          <h3 className="text-[#172E08] mb-1">En Desarrollo</h3>
          <p className="text-sm text-[#4D240F]/70">
            Módulo de monitoreo de plagas y enfermedades
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Tarjeta de Aplicaciones con progreso
 */
interface AplicacionProgress {
  id: string;
  nombre: string;
  tipo: string;
  porcentaje: number;
  aplicado: number;
  total: number;
  unidad: string;
}

interface AplicacionesStats {
  planeadas: number;
  activas: number;
  completadas: number;
  aplicacionesEnProgreso: AplicacionProgress[];
}

function AplicacionesCard({ 
  stats, 
  loading, 
  onClick 
}: { 
  stats: AplicacionesStats | null; 
  loading: boolean; 
  onClick: () => void;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-gray-200 animate-pulse">
        <div className="space-y-4">
          <div className="h-4 bg-gray-200 rounded w-24"></div>
          <div className="h-8 bg-gray-200 rounded w-40"></div>
          <div className="h-16 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-[#73991C]/40 transition-all cursor-pointer group shadow-sm hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
          <Sprout className="w-6 h-6 text-[#73991C]" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-[#4D240F]/60 mb-1 tracking-wide uppercase">Aplicaciones</p>
          <h3 className="text-2xl text-[#172E08]">{stats?.activas || 0} Activas</h3>
        </div>
      </div>

      {/* Indicadores sutiles de estado */}
      <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-100">
        <div className="text-xs text-[#4D240F]/60">
          <span className="inline-block w-2 h-2 bg-blue-400 rounded-full mr-1.5"></span>
          {stats?.planeadas || 0} Planeadas
        </div>
        <div className="text-xs text-[#4D240F]/60">
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1.5"></span>
          {stats?.completadas || 0} Completadas
        </div>
      </div>

      {/* Progreso de aplicaciones activas */}
      <div className="space-y-3">
        {stats?.aplicacionesEnProgreso && stats.aplicacionesEnProgreso.length > 0 ? (
          stats.aplicacionesEnProgreso.slice(0, 2).map((app) => (
            <div key={app.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#172E08] truncate">{app.nombre}</span>
                <span className="text-[#73991C] font-medium ml-2">{app.porcentaje}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#73991C] to-[#BFD97D] rounded-full transition-all duration-500"
                  style={{ width: `${app.porcentaje}%` }}
                ></div>
              </div>
              <p className="text-xs text-[#4D240F]/60">
                {app.aplicado} / {app.total} {app.unidad}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-[#4D240F]/50 text-center py-4">
            No hay aplicaciones activas
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Tarjeta de Inventario con valor y estado
 */
interface InventarioStats {
  valorTotal: number;
  porEstado: {
    ok: number;
    sinExistencias: number;
    perdido: number;
    vencido: number;
  };
}

function InventarioCard({ 
  stats, 
  loading, 
  onClick 
}: { 
  stats: InventarioStats | null; 
  loading: boolean; 
  onClick: () => void;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-gray-200 animate-pulse">
        <div className="space-y-4">
          <div className="h-4 bg-gray-200 rounded w-24"></div>
          <div className="h-8 bg-gray-200 rounded w-40"></div>
          <div className="h-16 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  // Formatear valor a millones con 1 decimal
  const valorEnMillones = (stats?.valorTotal || 0) / 1000000;
  const valorFormateado = `$${valorEnMillones.toFixed(1)}M`;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-[#73991C]/40 transition-all cursor-pointer group shadow-sm hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
          <Package className="w-6 h-6 text-[#73991C]" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-[#4D240F]/60 mb-1 tracking-wide uppercase">Inventario</p>
          <h3 className="text-2xl text-[#172E08]">{valorFormateado}</h3>
          <p className="text-xs text-[#4D240F]/50">Valor total en productos</p>
        </div>
      </div>

      {/* Estado de productos */}
      <div className="space-y-2 mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="text-[#4D240F]/70">OK</span>
          </div>
          <span className="text-[#172E08] font-medium">{stats?.porEstado.ok || 0}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-red-500 rounded-full"></span>
            <span className="text-[#4D240F]/70">Sin existencias</span>
          </div>
          <span className="text-[#172E08] font-medium">{stats?.porEstado.sinExistencias || 0}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-gray-400 rounded-full"></span>
            <span className="text-[#4D240F]/70">Perdido</span>
          </div>
          <span className="text-[#172E08] font-medium">{stats?.porEstado.perdido || 0}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-orange-500 rounded-full"></span>
            <span className="text-[#4D240F]/70">Vencido</span>
          </div>
          <span className="text-[#172E08] font-medium">{stats?.porEstado.vencido || 0}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Tarjeta de Labores (placeholder)
 */
function LaboresCard() {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 opacity-60 cursor-not-allowed shadow-sm">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center">
          <Briefcase className="w-6 h-6 text-gray-400" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-[#4D240F]/60 mb-1 tracking-wide uppercase">Labores</p>
          <h3 className="text-[#172E08] mb-1">En Desarrollo</h3>
          <p className="text-sm text-[#4D240F]/70">
            Módulo de gestión de labores culturales
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Dashboard Principal
 */
export function Dashboard({ onNavigate }: DashboardProps) {
  const navigate = useNavigate();
  const [aplicacionesStats, setAplicacionesStats] = useState<AplicacionesStats | null>(null);
  const [inventarioStats, setInventarioStats] = useState<InventarioStats | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    
    // Auto-refresh cada 2 minutos
    const interval = setInterval(loadDashboardData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const supabase = getSupabase();
      
      await Promise.all([
        loadAplicacionesStats(supabase),
        loadInventarioStats(supabase),
        loadAlertas(supabase),
      ]);
    } catch (error) {
      console.error('❌ Error cargando dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Cargar estadísticas de aplicaciones
   */
  const loadAplicacionesStats = async (supabase: any) => {
    try {
      // 1. Contar por estado
      const { data: aplicaciones, error } = await supabase
        .from('aplicaciones')
        .select('id, nombre_aplicacion, tipo_aplicacion, estado');

      if (error) throw error;

      const planeadas = aplicaciones?.filter((a: any) => a.estado === 'Calculada').length || 0;
      const activas = aplicaciones?.filter((a: any) => a.estado === 'En ejecución').length || 0;
      const completadas = aplicaciones?.filter((a: any) => a.estado === 'Cerrada').length || 0;

      // 2. Calcular progreso de aplicaciones activas
      const aplicacionesActivas = aplicaciones?.filter((a: any) => a.estado === 'En ejecución') || [];
      const aplicacionesEnProgreso: AplicacionProgress[] = [];

      for (const app of aplicacionesActivas.slice(0, 2)) {
        let aplicado = 0;
        let total = 0;
        let unidad = '';

        if (app.tipo_aplicacion === 'Fumigación' || app.tipo_aplicacion === 'Drench') {
          // Para fumigación/drench: canecas
          
          // Obtener canecas aplicadas de movimientos_diarios
          const { data: movimientos, error: errorMov } = await supabase
            .from('movimientos_diarios')
            .select('numero_canecas')
            .eq('aplicacion_id', app.id);

          if (errorMov) {
            console.warn('Error cargando movimientos:', errorMov);
            continue;
          }

          aplicado = movimientos?.reduce((sum: number, m: any) => sum + (m.numero_canecas || 0), 0) || 0;

          // Obtener canecas planificadas de aplicaciones_lotes_planificado
          const { data: planificado, error: errorPlan } = await supabase
            .from('aplicaciones_lotes_planificado')
            .select('canecas_planificado')
            .eq('aplicacion_id', app.id);

          if (!errorPlan && planificado) {
            total = planificado.reduce((sum: number, p: any) => sum + (p.canecas_planificado || 0), 0);
          }

          unidad = 'canecas';
        } else if (app.tipo_aplicacion === 'Fertilización') {
          // Para fertilización: bultos (calculados de productos)
          
          // Obtener IDs de movimientos
          const { data: movimientos, error: errorMov } = await supabase
            .from('movimientos_diarios')
            .select('id')
            .eq('aplicacion_id', app.id);

          if (errorMov) {
            console.warn('Error cargando movimientos:', errorMov);
            continue;
          }

          const movimientoIds = movimientos?.map((m: any) => m.id) || [];

          // Obtener productos aplicados
          if (movimientoIds.length > 0) {
            const { data: productos, error: errorProd } = await supabase
              .from('movimientos_diarios_productos')
              .select('cantidad_utilizada, unidad')
              .in('movimiento_diario_id', movimientoIds);

            if (!errorProd && productos) {
              // Convertir a kg y sumar
              aplicado = productos.reduce((sum: number, p: any) => {
                const cantidad = parseFloat(p.cantidad_utilizada || 0);
                // Convertir a kg si está en gramos
                const cantidadKg = p.unidad === 'g' ? cantidad / 1000 : cantidad;
                return sum + cantidadKg;
              }, 0);
            }
          }

          // Obtener total planificado de aplicaciones_productos_planificado
          const { data: planificado, error: errorPlan } = await supabase
            .from('aplicaciones_productos_planificado')
            .select('cantidad_total_planificada, unidad')
            .eq('aplicacion_id', app.id);

          if (!errorPlan && planificado) {
            total = planificado.reduce((sum: number, p: any) => {
              const cantidad = parseFloat(p.cantidad_total_planificada || 0);
              // Convertir a kg si está en gramos
              const cantidadKg = p.unidad === 'g' ? cantidad / 1000 : cantidad;
              return sum + cantidadKg;
            }, 0);
          }

          unidad = 'kg';
        }

        const porcentaje = total > 0 ? Math.round((aplicado / total) * 100) : 0;

        aplicacionesEnProgreso.push({
          id: app.id,
          nombre: app.nombre_aplicacion,
          tipo: app.tipo_aplicacion,
          porcentaje: Math.min(porcentaje, 100),
          aplicado: Math.round(aplicado * 10) / 10,
          total: Math.round(total * 10) / 10,
          unidad,
        });
      }

      setAplicacionesStats({
        planeadas,
        activas,
        completadas,
        aplicacionesEnProgreso,
      });
    } catch (error) {
      console.error('❌ Error cargando aplicaciones:', error);
      setAplicacionesStats({
        planeadas: 0,
        activas: 0,
        completadas: 0,
        aplicacionesEnProgreso: [],
      });
    }
  };

  /**
   * Cargar estadísticas de inventario
   */
  const loadInventarioStats = async (supabase: any) => {
    try {
      const { data: productos, error } = await supabase
        .from('productos')
        .select('cantidad_actual, precio_unitario, estado, fecha_vencimiento')
        .eq('activo', true);

      if (error) throw error;

      // Calcular valor total
      const valorTotal = productos?.reduce(
        (sum: number, p: any) => sum + ((p.cantidad_actual || 0) * (p.precio_unitario || 0)),
        0
      ) || 0;

      // Contar por estado
      const hoy = new Date().toISOString().split('T')[0];
      
      let ok = 0;
      let sinExistencias = 0;
      let perdido = 0;
      let vencido = 0;

      productos?.forEach((p: any) => {
        // Primero verificar el estado explícito
        if (p.estado === 'Perdido') {
          perdido++;
        } else if (p.estado === 'Vencido') {
          vencido++;
        } else if (p.estado === 'Sin existencias') {
          sinExistencias++;
        } else if (p.estado === 'OK') {
          ok++;
        } else {
          // Si no tiene estado explícito, inferir del inventario
          if ((p.cantidad_actual || 0) <= 0) {
            sinExistencias++;
          } else {
            ok++;
          }
        }
      });

      setInventarioStats({
        valorTotal,
        porEstado: {
          ok,
          sinExistencias,
          perdido,
          vencido,
        },
      });
    } catch (error) {
      console.error('❌ Error cargando inventario:', error);
      setInventarioStats({
        valorTotal: 0,
        porEstado: { ok: 0, sinExistencias: 0, perdido: 0, vencido: 0 },
      });
    }
  };

  /**
   * Cargar alertas del sistema
   */
  const loadAlertas = async (supabase: any) => {
    try {
      const nuevasAlertas: Alerta[] = [];

      // 1. Stock bajo
      const { data: stockBajo, error: errorStock } = await supabase
        .from('productos')
        .select('nombre, cantidad_actual, stock_minimo, fecha_actualizacion')
        .eq('activo', true)
        .order('fecha_actualizacion', { ascending: false });

      if (!errorStock && stockBajo) {
        const productosBajos = stockBajo
          .filter((p: any) => (p.cantidad_actual || 0) <= (p.stock_minimo || 0))
          .slice(0, 3);

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

      // 2. Productos próximos a vencer (30 días)
      const en30Dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
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

      // Ordenar y limitar
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

  const handleAlertClick = (alerta: Alerta) => {
    if (alerta.tipo === 'stock' || alerta.tipo === 'vencimiento') {
      navigate('/inventario');
    }
  };

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

      {/* Grilla 2x2 de tarjetas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MonitoreoCard onClick={() => navigate('/monitoreo')} />
        <AplicacionesCard 
          stats={aplicacionesStats} 
          loading={isLoading} 
          onClick={() => navigate('/aplicaciones')} 
        />
        <InventarioCard 
          stats={inventarioStats} 
          loading={isLoading} 
          onClick={() => navigate('/inventario/dashboard')} 
        />
        <LaboresCard />
      </div>

      {/* Alertas */}
      <AlertListContainer>
        <AlertListHeader titulo="Alertas Recientes" count={alertas.length} />
        <AlertList alertas={alertas} onAlertClick={handleAlertClick} maxAlertas={5} />
      </AlertListContainer>
    </div>
  );
}