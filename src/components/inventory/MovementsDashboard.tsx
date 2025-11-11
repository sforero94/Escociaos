import { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { formatNumber } from '../../utils/format';
import { Link } from 'react-router-dom';
import { 
  Package, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  TrendingUp, 
  BarChart3,
  RefreshCw,
  ExternalLink,
  ShoppingCart,
  Clock
} from 'lucide-react';
import { Button } from '../ui/button';
import { InventoryNav } from './InventoryNav';

interface RecentMovement {
  id: number;
  producto_id: number;
  tipo_movimiento: string;
  cantidad: number;
  created_at: string;
  producto?: {
    nombre: string;
    unidad_medida: string;
  };
}

interface ProductActivity {
  producto_id: number;
  nombre: string;
  total_movimientos: number;
  total_entradas: number;
  total_salidas: number;
  unidad_medida: string;
}

interface DashboardStats {
  totalMovimientos: number;
  totalEntradas: number;
  totalSalidas: number;
  productosActivos: number;
  promedioMovimientosDiarios: number;
}

export function MovementsDashboard() {
  const [recentMovements, setRecentMovements] = useState<RecentMovement[]>([]);
  const [topProducts, setTopProducts] = useState<ProductActivity[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalMovimientos: 0,
    totalEntradas: 0,
    totalSalidas: 0,
    productosActivos: 0,
    promedioMovimientosDiarios: 0,
  });
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('30');

  useEffect(() => {
    loadDashboardData();
  }, [timeRange]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadRecentMovements(),
        loadTopProducts(),
        loadStats(),
      ]);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRecentMovements = async () => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('movimientos_inventario')
        .select(`
          *,
          producto:productos(nombre, unidad_medida)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentMovements(data || []);
    } catch (err) {
      console.error('Error cargando movimientos recientes:', err);
    }
  };

  const loadTopProducts = async () => {
    try {
      const supabase = getSupabase();
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(timeRange));

      const { data, error } = await supabase
        .from('movimientos_inventario')
        .select(`
          producto_id,
          tipo_movimiento,
          cantidad,
          producto:productos(nombre, unidad_medida)
        `)
        .gte('created_at', daysAgo.toISOString());

      if (error) throw error;

      // Agrupar por producto
      const productMap = new Map<number, ProductActivity>();

      data?.forEach((mov: any) => {
        const productId = mov.producto_id;
        if (!productMap.has(productId)) {
          productMap.set(productId, {
            producto_id: productId,
            nombre: mov.producto?.nombre || 'Desconocido',
            total_movimientos: 0,
            total_entradas: 0,
            total_salidas: 0,
            unidad_medida: mov.producto?.unidad_medida || '',
          });
        }

        const product = productMap.get(productId)!;
        product.total_movimientos++;
        
        const isEntrada = mov.tipo_movimiento?.toLowerCase()?.trim() === 'entrada';
        if (isEntrada) {
          product.total_entradas++;
        } else {
          product.total_salidas++;
        }
      });

      // Ordenar por total de movimientos y tomar top 5
      const sorted = Array.from(productMap.values())
        .sort((a, b) => b.total_movimientos - a.total_movimientos)
        .slice(0, 5);

      setTopProducts(sorted);
    } catch (err) {
      console.error('Error cargando productos activos:', err);
    }
  };

  const loadStats = async () => {
    try {
      const supabase = getSupabase();
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(timeRange));

      // Total de movimientos en el rango
      const { data: movements, error: movError } = await supabase
        .from('movimientos_inventario')
        .select('tipo_movimiento, producto_id')
        .gte('created_at', daysAgo.toISOString());

      if (movError) throw movError;

      const totalMovimientos = movements?.length || 0;
      const totalEntradas = movements?.filter(m => m.tipo_movimiento?.toLowerCase()?.trim() === 'entrada').length || 0;
      const totalSalidas = movements?.filter(m => m.tipo_movimiento?.toLowerCase()?.trim() === 'salida').length || 0;
      
      // Productos únicos con movimientos
      const uniqueProducts = new Set(movements?.map(m => m.producto_id)).size;

      // Promedio diario
      const promedioMovimientosDiarios = Math.round(totalMovimientos / parseInt(timeRange));

      setStats({
        totalMovimientos,
        totalEntradas,
        totalSalidas,
        productosActivos: uniqueProducts,
        promedioMovimientosDiarios,
      });
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays < 7) return `Hace ${diffDays} días`;
    
    return date.toLocaleDateString('es-CO', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-12 h-12 text-[#73991C] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de navegación */}
      <InventoryNav />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[#172E08] mb-2">Dashboard de Movimientos</h1>
          <p className="text-[#4D240F]/70">Vista general de la actividad del inventario</p>
        </div>
        
        <Link to="/inventario/movimientos">
          <Button className="bg-[#73991C] hover:bg-[#5f7d17] text-white rounded-xl transition-all duration-200">
            <BarChart3 className="w-4 h-4 mr-2" />
            Ver Todos los Movimientos
          </Button>
        </Link>
      </div>

      {/* Selector de rango de tiempo */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-4 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="text-sm text-[#4D240F]/70">Período:</span>
          <div className="flex gap-2">
            {(['7', '30', '90'] as const).map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`px-4 py-2 rounded-xl text-sm transition-all duration-200 ${
                  timeRange === days
                    ? 'bg-[#73991C] text-white shadow-md'
                    : 'bg-[#F8FAF5] text-[#4D240F]/70 hover:bg-[#BFD97D]/20'
                }`}
              >
                {days === '7' ? 'Última semana' : days === '30' ? 'Último mes' : 'Últimos 3 meses'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Total Movimientos */}
        <div className="bg-gradient-to-br from-[#F8FAF5] to-[#BFD97D]/20 rounded-2xl border border-[#BFD97D] p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#4D240F]/70 uppercase tracking-wide">Total Movimientos</p>
            <Package className="w-5 h-5 text-[#73991C]" />
          </div>
          <p className="text-3xl text-[#73991C]">{stats.totalMovimientos}</p>
          <p className="text-xs text-[#4D240F]/60 mt-1">
            Últimos {timeRange} días
          </p>
        </div>

        {/* Entradas */}
        <div className="bg-gradient-to-br from-[#28A745]/5 to-[#28A745]/10 rounded-2xl border border-[#28A745]/20 p-6 shadow-[0_4px_24px_rgba(40,167,69,0.08)] hover:shadow-[0_6px_28px_rgba(40,167,69,0.12)] transition-all duration-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#28A745]/70 uppercase tracking-wide">Entradas</p>
            <ArrowUpCircle className="w-5 h-5 text-[#28A745]" />
          </div>
          <p className="text-3xl text-[#28A745]">{stats.totalEntradas}</p>
          <p className="text-xs text-[#28A745]/70 mt-1">
            {stats.totalMovimientos > 0 
              ? `${Math.round((stats.totalEntradas / stats.totalMovimientos) * 100)}% del total`
              : '0% del total'}
          </p>
        </div>

        {/* Salidas */}
        <div className="bg-gradient-to-br from-[#DC3545]/5 to-[#DC3545]/10 rounded-2xl border border-[#DC3545]/20 p-6 shadow-[0_4px_24px_rgba(220,53,69,0.08)] hover:shadow-[0_6px_28px_rgba(220,53,69,0.12)] transition-all duration-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#DC3545]/70 uppercase tracking-wide">Salidas</p>
            <ArrowDownCircle className="w-5 h-5 text-[#DC3545]" />
          </div>
          <p className="text-3xl text-[#DC3545]">{stats.totalSalidas}</p>
          <p className="text-xs text-[#DC3545]/70 mt-1">
            {stats.totalMovimientos > 0 
              ? `${Math.round((stats.totalSalidas / stats.totalMovimientos) * 100)}% del total`
              : '0% del total'}
          </p>
        </div>

        {/* Productos Activos */}
        <div className="bg-gradient-to-br from-[#73991C]/5 to-[#73991C]/10 rounded-2xl border border-[#73991C]/20 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#73991C]/70 uppercase tracking-wide">Productos Activos</p>
            <Package className="w-5 h-5 text-[#73991C]" />
          </div>
          <p className="text-3xl text-[#73991C]">{stats.productosActivos}</p>
          <p className="text-xs text-[#4D240F]/60 mt-1">
            Con movimientos
          </p>
        </div>

        {/* Promedio Diario */}
        <div className="bg-gradient-to-br from-[#BFD97D]/20 to-[#BFD97D]/40 rounded-2xl border border-[#BFD97D] p-6 shadow-[0_4px_24px_rgba(191,217,125,0.08)] hover:shadow-[0_6px_28px_rgba(191,217,125,0.12)] transition-all duration-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#73991C]/70 uppercase tracking-wide">Promedio Diario</p>
            <TrendingUp className="w-5 h-5 text-[#73991C]" />
          </div>
          <p className="text-3xl text-[#73991C]">{stats.promedioMovimientosDiarios}</p>
          <p className="text-xs text-[#4D240F]/60 mt-1">
            Movimientos/día
          </p>
        </div>
      </div>

      {/* Grid de 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Movimientos Recientes */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#73991C]" />
              <h2 className="text-xl text-[#172E08]">
                Movimientos Recientes
              </h2>
            </div>
            <Link
              to="/inventario/movimientos"
              className="text-[#73991C] hover:text-[#5f7d17] text-sm flex items-center gap-1 transition-colors"
            >
              Ver todos
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          {recentMovements.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-[#4D240F]/40 mx-auto mb-4" />
              <p className="text-[#4D240F]/60">No hay movimientos recientes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentMovements.map((movement) => {
                const isEntrada = movement.tipo_movimiento?.toLowerCase()?.trim() === 'entrada';
                return (
                  <div
                    key={movement.id}
                    className={`flex items-center justify-between p-3 rounded-lg border-l-4 transition-all duration-200 hover:shadow-md ${
                      isEntrada
                        ? 'bg-[#28A745]/5 border-[#28A745]'
                        : 'bg-[#DC3545]/5 border-[#DC3545]'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {isEntrada ? (
                        <ArrowUpCircle className="w-5 h-5 text-[#28A745] flex-shrink-0" />
                      ) : (
                        <ArrowDownCircle className="w-5 h-5 text-[#DC3545] flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[#172E08] truncate">
                          {movement.producto?.nombre || 'Desconocido'}
                        </p>
                        <p className="text-sm text-[#4D240F]/70">
                          {isEntrada ? '+' : '-'}
                          {formatNumber(Math.abs(movement.cantidad), 2)} {movement.producto?.unidad_medida}
                        </p>
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <p className="text-xs text-[#4D240F]/60 whitespace-nowrap">
                        {formatDate(movement.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Productos Más Activos */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#73991C]" />
              <h2 className="text-xl text-[#172E08]">
                Productos Más Activos
              </h2>
            </div>
            <span className="text-sm text-[#4D240F]/60 bg-[#73991C]/10 px-3 py-1 rounded-lg">
              Top 5
            </span>
          </div>

          {topProducts.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="w-16 h-16 text-[#4D240F]/40 mx-auto mb-4" />
              <p className="text-[#4D240F]/60">No hay datos para mostrar</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topProducts.map((product, index) => (
                <div 
                  key={product.producto_id} 
                  className="border-l-4 border-[#73991C] bg-gradient-to-r from-[#73991C]/5 to-transparent rounded-r-xl p-4 hover:from-[#73991C]/10 transition-all duration-200"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-[#73991C] text-white flex items-center justify-center flex-shrink-0">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[#172E08] truncate">{product.nombre}</p>
                      <p className="text-sm text-[#4D240F]/60">
                        {product.total_movimientos} movimiento{product.total_movimientos !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4 ml-11">
                    <div className="flex items-center gap-2">
                      <ArrowUpCircle className="w-4 h-4 text-[#28A745]" />
                      <span className="text-sm text-[#4D240F]/70">
                        {product.total_entradas} {product.total_entradas === 1 ? 'entrada' : 'entradas'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowDownCircle className="w-4 h-4 text-[#DC3545]" />
                      <span className="text-sm text-[#4D240F]/70">
                        {product.total_salidas} {product.total_salidas === 1 ? 'salida' : 'salidas'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Balance de Movimientos */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="w-5 h-5 text-[#73991C]" />
          <h2 className="text-xl text-[#172E08]">
            Balance de Movimientos
          </h2>
        </div>
        
        <div className="space-y-4">
          {/* Barra de Entradas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4 text-[#28A745]" />
                <span className="text-sm text-[#28A745]/70 uppercase tracking-wide">Entradas</span>
              </div>
              <span className="text-sm text-[#28A745]">{stats.totalEntradas}</span>
            </div>
            <div className="w-full bg-[#F8FAF5] rounded-full h-6 overflow-hidden border border-[#28A745]/20">
              <div
                className="bg-gradient-to-r from-[#28A745] to-[#20c997] h-full rounded-full flex items-center justify-end pr-3 text-white text-xs transition-all duration-500"
                style={{
                  width: stats.totalMovimientos > 0 
                    ? `${(stats.totalEntradas / stats.totalMovimientos) * 100}%`
                    : '0%'
                }}
              >
                {stats.totalMovimientos > 0 && (stats.totalEntradas / stats.totalMovimientos) > 0.15
                  ? `${Math.round((stats.totalEntradas / stats.totalMovimientos) * 100)}%`
                  : ''}
              </div>
            </div>
          </div>

          {/* Barra de Salidas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ArrowDownCircle className="w-4 h-4 text-[#DC3545]" />
                <span className="text-sm text-[#DC3545]/70 uppercase tracking-wide">Salidas</span>
              </div>
              <span className="text-sm text-[#DC3545]">{stats.totalSalidas}</span>
            </div>
            <div className="w-full bg-[#F8FAF5] rounded-full h-6 overflow-hidden border border-[#DC3545]/20">
              <div
                className="bg-gradient-to-r from-[#DC3545] to-[#e74c3c] h-full rounded-full flex items-center justify-end pr-3 text-white text-xs transition-all duration-500"
                style={{
                  width: stats.totalMovimientos > 0 
                    ? `${(stats.totalSalidas / stats.totalMovimientos) * 100}%`
                    : '0%'
                }}
              >
                {stats.totalMovimientos > 0 && (stats.totalSalidas / stats.totalMovimientos) > 0.15
                  ? `${Math.round((stats.totalSalidas / stats.totalMovimientos) * 100)}%`
                  : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Balance Neto */}
        <div className="mt-6 p-4 bg-gradient-to-br from-[#F8FAF5] to-[#BFD97D]/20 rounded-xl border border-[#73991C]/20">
          <div className="flex items-center justify-between">
            <span className="text-[#4D240F]/70">Balance Neto</span>
            <span className={`text-2xl ${
              stats.totalEntradas > stats.totalSalidas 
                ? 'text-[#28A745]' 
                : stats.totalSalidas > stats.totalEntradas
                ? 'text-[#DC3545]'
                : 'text-[#73991C]'
            }`}>
              {stats.totalEntradas > stats.totalSalidas ? '+' : ''}
              {stats.totalEntradas - stats.totalSalidas}
            </span>
          </div>
          <p className="text-sm text-[#4D240F]/60 mt-2">
            {stats.totalEntradas > stats.totalSalidas 
              ? 'Más entradas que salidas (inventario en crecimiento)'
              : stats.totalSalidas > stats.totalEntradas
              ? 'Más salidas que entradas (inventario en disminución)'
              : 'Entradas y salidas equilibradas'}
          </p>
        </div>
      </div>

      {/* Acciones Rápidas */}
      <div className="bg-gradient-to-br from-[#73991C] to-[#5f7d17] rounded-2xl shadow-[0_8px_32px_rgba(115,153,28,0.2)] p-6 text-white">
        <h2 className="text-xl mb-4 flex items-center gap-2">
          <Package className="w-5 h-5" />
          Acciones Rápidas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/inventario/movimientos"
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl p-4 transition-all duration-200 hover:shadow-lg group"
          >
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <p className="font-medium">Ver Todos los Movimientos</p>
            </div>
            <p className="text-sm text-white/90">Accede al historial completo con filtros</p>
          </Link>
          <Link
            to="/inventario"
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl p-4 transition-all duration-200 hover:shadow-lg group"
          >
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <p className="font-medium">Ir a Inventario</p>
            </div>
            <p className="text-sm text-white/90">Ver productos y stock actual</p>
          </Link>
          <Link
            to="/inventario/nueva-compra"
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl p-4 transition-all duration-200 hover:shadow-lg group"
          >
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <p className="font-medium">Registrar Compra</p>
            </div>
            <p className="text-sm text-white/90">Agregar nueva entrada de inventario</p>
          </Link>
        </div>
      </div>
    </div>
  );
}