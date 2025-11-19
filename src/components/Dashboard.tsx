import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Sprout, Package, Briefcase, TrendingUp, TrendingDown } from 'lucide-react';
import { getSupabase } from '../utils/supabase/client';
import { formatNumber } from '../utils/format';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
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
 * Tarjeta de Monitoreo con mini gráfica de tendencias
 */
function MonitoreoCard({ onClick }: { onClick: () => void }) {
  const [tendencias, setTendencias] = useState<TendenciaData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    cargarTendencias();
  }, []);

  const cargarTendencias = async () => {
    try {
      const supabase = getSupabase();

      // Cargar catálogo de plagas de interés
      const { data: catalogoPlagas, error: errorCatalogo } = await supabase
        .from('plagas_enfermedades_catalogo')
        .select('id, nombre')
        .eq('activo', true);

      if (errorCatalogo) throw errorCatalogo;

      // Filtrar IDs de plagas de interés
      const plagasInteresIds = catalogoPlagas
        ?.filter(p => PLAGAS_INTERES.some(nombre => 
          p.nombre.toLowerCase().includes(nombre.toLowerCase())
        ))
        .map(p => p.id) || [];

      if (plagasInteresIds.length === 0) {
        setTendencias([]);
        setIsLoading(false);
        return;
      }

      // Cargar TODOS los monitoreos de plagas de interés ordenados por fecha
      const { data: monitoreos, error } = await supabase
        .from('monitoreos')
        .select(`
          fecha_monitoreo,
          incidencia,
          plaga_enfermedad_id,
          plagas_enfermedades_catalogo!inner(nombre)
        `)
        .in('plaga_enfermedad_id', plagasInteresIds)
        .order('fecha_monitoreo', { ascending: false })
        .limit(500);

      if (error) throw error;

      if (!monitoreos || monitoreos.length === 0) {
        setTendencias([]);
        setIsLoading(false);
        return;
      }

      // Agrupar por semana-año y fecha completa para ordenamiento correcto
      const datosPorSemana: { 
        [semanaKey: string]: { 
          semana: number;
          año: number;
          fechaMasReciente: string;
          plagas: { [plaga: string]: number }
        } 
      } = {};

      monitoreos.forEach(m => {
        const fecha = new Date(m.fecha_monitoreo);
        const semana = getNumeroSemana(fecha);
        const año = fecha.getFullYear();
        const semanaKey = `${año}-S${semana.toString().padStart(2, '0')}`;
        const plagaNombre = (m.plagas_enfermedades_catalogo as any).nombre;

        if (!datosPorSemana[semanaKey]) {
          datosPorSemana[semanaKey] = {
            semana,
            año,
            fechaMasReciente: m.fecha_monitoreo,
            plagas: {}
          };
        }

        // Actualizar fecha más reciente de la semana
        if (m.fecha_monitoreo > datosPorSemana[semanaKey].fechaMasReciente) {
          datosPorSemana[semanaKey].fechaMasReciente = m.fecha_monitoreo;
        }

        // Guardar solo el dato más reciente de cada plaga por semana
        if (!datosPorSemana[semanaKey].plagas[plagaNombre] || 
            m.fecha_monitoreo > datosPorSemana[semanaKey].fechaMasReciente) {
          datosPorSemana[semanaKey].plagas[plagaNombre] = m.incidencia || 0;
        }
      });

      // Ordenar semanas por fecha y tomar las últimas 4
      const semanasOrdenadas = Object.entries(datosPorSemana)
        .sort((a, b) => {
          // Ordenar por año y luego por número de semana
          const [keyA, dataA] = a;
          const [keyB, dataB] = b;
          
          if (dataA.año !== dataB.año) {
            return dataA.año - dataB.año;
          }
          return dataA.semana - dataB.semana;
        })
        .slice(-4); // Últimas 4 semanas con datos

      // Obtener todas las plagas únicas de las últimas 4 semanas
      const todasLasPlagas = new Set<string>();
      semanasOrdenadas.forEach(([_, data]) => {
        Object.keys(data.plagas).forEach(plaga => todasLasPlagas.add(plaga));
      });

      // Formatear para Recharts rellenando con 0 las plagas sin datos
      const datosFormateados: TendenciaData[] = semanasOrdenadas.map(([key, data]) => {
        const punto: TendenciaData = { semana: `S${data.semana}` };
        
        // Agregar todas las plagas, poniendo 0 si no tienen dato
        todasLasPlagas.forEach(plaga => {
          punto[plaga] = data.plagas[plaga] !== undefined 
            ? Math.round(data.plagas[plaga] * 10) / 10 
            : 0;
        });
        
        return punto;
      });

      setTendencias(datosFormateados);
    } catch (error) {
      console.error('Error cargando tendencias de monitoreo:', error);
      setTendencias([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getNumeroSemana = (fecha: Date): number => {
    const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // Obtener plagas únicas para la leyenda
  const plagasEnGrafico = tendencias.length > 0
    ? Object.keys(tendencias[0]).filter(k => k !== 'semana')
    : [];

  const COLORES_PLAGAS = ['#73991C', '#E74C3C', '#3498DB', '#F39C12', '#9B59B6', '#1ABC9C'];

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-[#73991C]/40 transition-all cursor-pointer group shadow-sm hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
          <Eye className="w-6 h-6 text-[#73991C]" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-[#4D240F]/60 mb-1 tracking-wide uppercase">Monitoreo</p>
          <h3 className="text-[#172E08] mb-1">Plagas de Interés</h3>
          <p className="text-xs text-[#4D240F]/60">
            Tendencias últimas 4 semanas
          </p>
        </div>
      </div>

      {/* Mini Gráfica */}
      {isLoading ? (
        <div className="h-32 flex items-center justify-center">
          <div className="w-6 h-6 border-3 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin"></div>
        </div>
      ) : tendencias.length > 0 ? (
        <>
          <div className="h-32 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tendencias} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <XAxis 
                  dataKey="semana" 
                  tick={{ fill: '#4D240F', fontSize: 10 }}
                  stroke="#E5E7EB"
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: '#4D240F', fontSize: 10 }}
                  stroke="#E5E7EB"
                  tickLine={false}
                  domain={[0, 'auto']}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    fontSize: '12px',
                    padding: '8px'
                  }}
                  formatter={(value: any) => `${value}%`}
                />
                {plagasEnGrafico.map((plaga, index) => (
                  <Line
                    key={plaga}
                    type="monotone"
                    dataKey={plaga}
                    stroke={COLORES_PLAGAS[index % COLORES_PLAGAS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Mini leyenda */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
            {plagasEnGrafico.slice(0, 3).map((plaga, index) => (
              <div key={plaga} className="flex items-center gap-1.5">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: COLORES_PLAGAS[index % COLORES_PLAGAS.length] }}
                ></div>
                <span className="text-xs text-[#4D240F]/70">{plaga}</span>
              </div>
            ))}
            {plagasEnGrafico.length > 3 && (
              <span className="text-xs text-[#4D240F]/50">+{plagasEnGrafico.length - 3} más</span>
            )}
          </div>
        </>
      ) : (
        <div className="h-32 flex flex-col items-center justify-center text-[#4D240F]/50">
          <Eye className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-xs">Sin datos de las últimas 4 semanas</p>
        </div>
      )}
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
  promedioTresMeses: number;
  porcentajeCambio: number;
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

  // Determinar si está subiendo o bajando
  const porcentajeCambio = stats?.porcentajeCambio || 0;
  const estaSubiendo = porcentajeCambio > 0;
  const estaBajando = porcentajeCambio < 0;

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
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#4D240F]/60 mb-1 tracking-wide uppercase">Inventario</p>
          
          {/* Dos columnas: Valor e Indicador */}
          <div className="flex items-start justify-between gap-4">
            {/* Columna izquierda: Solo el valor */}
            <div>
              <h3 className="text-2xl text-[#172E08]">{valorFormateado}</h3>
            </div>

            {/* Columna derecha: Indicador de tendencia CON texto descriptivo */}
            {porcentajeCambio !== 0 && (
              <div className="flex flex-col items-end flex-shrink-0">
                <div className={`flex items-center gap-1 mb-0.5 ${
                  estaBajando ? 'text-green-600' : 'text-red-600'
                }`}>
                  {estaBajando ? (
                    <TrendingDown className="w-4 h-4" />
                  ) : (
                    <TrendingUp className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">
                    {Math.abs(porcentajeCambio).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-[#4D240F]/50 text-right">
                  vs. promedio 3 últimos meses
                </p>
              </div>
            )}
          </div>
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

          // Obtener canecas planificadas de aplicaciones_calculos
          const { data: calculos, error: errorCalc } = await supabase
            .from('aplicaciones_calculos')
            .select('numero_canecas')
            .eq('aplicacion_id', app.id);

          if (!errorCalc && calculos) {
            total = calculos.reduce((sum: number, c: any) => sum + (c.numero_canecas || 0), 0);
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

          // Obtener total planificado de aplicaciones_productos
          const { data: mezclas, error: errorMezclas } = await supabase
            .from('aplicaciones_mezclas')
            .select('id')
            .eq('aplicacion_id', app.id);

          if (!errorMezclas && mezclas && mezclas.length > 0) {
            const mezclasIds = mezclas.map((m: any) => m.id);
            
            const { data: productos, error: errorProd } = await supabase
              .from('aplicaciones_productos')
              .select('cantidad_total_necesaria, producto_unidad')
              .in('mezcla_id', mezclasIds);

            if (!errorProd && productos) {
              total = productos.reduce((sum: number, p: any) => {
                const cantidad = parseFloat(p.cantidad_total_necesaria || 0);
                // Convertir a kg si está en gramos
                const cantidadKg = p.producto_unidad === 'gramos' ? cantidad / 1000 : cantidad;
                return sum + cantidadKg;
              }, 0);
            }
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
        .select('cantidad_actual, precio_unitario, estado')
        .eq('activo', true);

      if (error) throw error;

      // Calcular valor total ACTUAL
      const valorTotal = productos?.reduce(
        (sum: number, p: any) => sum + ((p.cantidad_actual || 0) * (p.precio_unitario || 0)),
        0
      ) || 0;

      // Calcular promedio de los últimos 3 meses usando movimientos_inventario
      const fechaActual = new Date();
      const fechaTresMesesAtras = new Date();
      fechaTresMesesAtras.setMonth(fechaActual.getMonth() - 3);

      // Obtener todos los productos activos con sus precios
      const { data: productosConPrecio, error: errorProductos } = await supabase
        .from('productos')
        .select('id, precio_unitario')
        .eq('activo', true);

      if (errorProductos) throw errorProductos;

      // Crear un mapa de precios por producto
      const preciosPorProducto = new Map();
      productosConPrecio?.forEach((p: any) => {
        preciosPorProducto.set(p.id, p.precio_unitario || 0);
      });

      // Obtener movimientos de los últimos 3 meses
      const { data: movimientos, error: errorMovimientos } = await supabase
        .from('movimientos_inventario')
        .select('fecha_movimiento, producto_id, saldo_nuevo')
        .gte('fecha_movimiento', fechaTresMesesAtras.toISOString().split('T')[0])
        .order('fecha_movimiento', { ascending: true });

      let promedioTresMeses = valorTotal; // Default al valor actual si no hay movimientos
      let porcentajeCambio = 0;

      if (!errorMovimientos && movimientos && movimientos.length > 0) {
        // Agrupar por mes y calcular valor de inventario
        const valoresPorMes: { [mes: string]: number } = {};

        movimientos.forEach((mov: any) => {
          const fecha = new Date(mov.fecha_movimiento);
          const mesKey = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
          const precioUnitario = preciosPorProducto.get(mov.producto_id) || 0;
          const valorEnEseMomento = (mov.saldo_nuevo || 0) * precioUnitario;

          // Guardar el último saldo del mes
          if (!valoresPorMes[mesKey]) {
            valoresPorMes[mesKey] = 0;
          }
          valoresPorMes[mesKey] = valorEnEseMomento;
        });

        // Calcular promedio de los valores mensuales
        const valoresMensuales = Object.values(valoresPorMes);
        if (valoresMensuales.length > 0) {
          const sumaValores = valoresMensuales.reduce((sum, val) => sum + val, 0);
          promedioTresMeses = sumaValores / valoresMensuales.length;

          // Calcular porcentaje de cambio
          if (promedioTresMeses > 0) {
            porcentajeCambio = ((valorTotal - promedioTresMeses) / promedioTresMeses) * 100;
          }
        }
      }

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
        promedioTresMeses,
        porcentajeCambio: Math.round(porcentajeCambio * 10) / 10, // Redondear a 1 decimal
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
        promedioTresMeses: 0,
        porcentajeCambio: 0,
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
        .select('nombre, cantidad_actual, stock_minimo, updated_at')
        .eq('activo', true)
        .order('updated_at', { ascending: false });

      if (!errorStock && stockBajo) {
        const productosBajos = stockBajo
          .filter((p: any) => (p.cantidad_actual || 0) <= (p.stock_minimo || 0))
          .slice(0, 5);

        productosBajos.forEach((p: any) => {
          nuevasAlertas.push({
            id: `stock-${p.nombre}`,
            tipo: 'stock',
            mensaje: `⚠️ Stock bajo: ${p.nombre} - Solo ${formatNumber(p.cantidad_actual || 0)} unidades`,
            fecha: p.updated_at || new Date().toISOString(),
            prioridad: 'alta',
          });
        });
      }

      // 2. Productos vencidos (basado en campo estado)
      const { data: productosVencidos, error: errorVencidos } = await supabase
        .from('productos')
        .select('nombre, updated_at')
        .eq('activo', true)
        .eq('estado', 'Vencido')
        .order('updated_at', { ascending: false })
        .limit(2);

      if (!errorVencidos && productosVencidos && productosVencidos.length > 0) {
        productosVencidos.forEach((p: any) => {
          nuevasAlertas.push({
            id: `venc-${p.nombre}`,
            tipo: 'vencimiento',
            mensaje: `📅 Producto vencido: ${p.nombre}`,
            fecha: p.updated_at,
            prioridad: 'alta',
          });
        });
      }

      // Ordenar por prioridad y fecha
      const alertasOrdenadas = nuevasAlertas
        .sort((a, b) => {
          // Primero por prioridad
          if (a.prioridad === 'alta' && b.prioridad !== 'alta') return -1;
          if (a.prioridad !== 'alta' && b.prioridad === 'alta') return 1;
          // Luego por fecha
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

// Plagas de interés para la mini gráfica
const PLAGAS_INTERES = [
  'Monalonion',
  'Ácaro',
  'Huevos de Ácaro',
  'Ácaro Cristalino',
  'Cucarrón marceño',
  'Trips'
];

// Interfaz para datos de tendencias
interface TendenciaData {
  semana: string;
  [plagaNombre: string]: number | string;
}