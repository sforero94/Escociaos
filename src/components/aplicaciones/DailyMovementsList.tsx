import { useState, useEffect } from 'react';
import { 
  Calendar, 
  Package, 
  User, 
  Trash2, 
  Download,
  Filter,
  X,
  MapPin,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import type { Aplicacion, MovimientoDiario } from '../../types/aplicaciones';
import { 
  exportarMovimientosACSV,
  descargarCSV
} from '../../utils/dailyMovementUtils';

interface DailyMovementsListProps {
  aplicacion: Aplicacion;
  onRefresh: () => void;
}

type VistaAgrupacion = 'ninguno' | 'fecha' | 'lote';
type Ordenamiento = 'fecha-desc' | 'fecha-asc' | 'producto' | 'cantidad';

export function DailyMovementsList({ aplicacion, onRefresh }: DailyMovementsListProps) {
  const supabase = getSupabase();
  const [movimientos, setMovimientos] = useState<MovimientoDiario[]>([]);
  const [loading, setLoading] = useState(true);
  const [vistaAgrupacion, setVistaAgrupacion] = useState<VistaAgrupacion>('fecha');
  const [ordenamiento, setOrdenamiento] = useState<Ordenamiento>('fecha-desc');
  const [filtroProducto, setFiltroProducto] = useState<string>('');
  const [filtroLote, setFiltroLote] = useState<string>('');

  useEffect(() => {
    loadMovimientos();
  }, [aplicacion.id]);

  const loadMovimientos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('movimientos_diarios')
        .select('*')
        .eq('aplicacion_id', aplicacion.id)
        .order('fecha_movimiento', { ascending: false });

      if (error) throw error;
      setMovimientos(data || []);
    } catch (err) {
      console.error('Error cargando movimientos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEliminar = async (movimientoId: string) => {
    if (!confirm('¿Estás seguro de eliminar este movimiento?')) return;

    const { error } = await supabase
      .from('movimientos_diarios')
      .delete()
      .eq('id', movimientoId);

    if (error) {
      console.error('Error eliminando movimiento:', error);
      alert('Error al eliminar el movimiento');
      return;
    }

    await loadMovimientos();
    onRefresh();
  };

  const handleExportarCSV = () => {
    const csv = exportarMovimientosACSV(movimientosFiltrados);
    const nombreArchivo = `movimientos_${aplicacion.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    descargarCSV(csv, nombreArchivo);
  };

  // Filtrar movimientos
  const movimientosFiltrados = movimientos.filter(mov => {
    if (filtroProducto && !mov.producto_nombre.toLowerCase().includes(filtroProducto.toLowerCase())) {
      return false;
    }
    if (filtroLote && !mov.lote_nombre.toLowerCase().includes(filtroLote.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Ordenar movimientos
  const movimientosOrdenados = [...movimientosFiltrados].sort((a, b) => {
    switch (ordenamiento) {
      case 'fecha-desc':
        return new Date(b.fecha_movimiento).getTime() - new Date(a.fecha_movimiento).getTime();
      case 'fecha-asc':
        return new Date(a.fecha_movimiento).getTime() - new Date(b.fecha_movimiento).getTime();
      case 'producto':
        return a.producto_nombre.localeCompare(b.producto_nombre);
      case 'cantidad':
        return b.cantidad_utilizada - a.cantidad_utilizada;
      default:
        return 0;
    }
  });

  // Productos únicos para filtro
  const productosUnicos = Array.from(new Set(movimientos.map(m => m.producto_nombre))).sort();
  const lotesUnicos = Array.from(new Set(movimientos.map(m => m.lote_nombre))).sort();

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#73991C]/10 p-8 text-center">
        <div className="w-8 h-8 border-4 border-[#73991C]/20 border-t-[#73991C] rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-sm text-[#4D240F]/60">Cargando movimientos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="bg-white rounded-2xl border border-[#73991C]/10 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Filtros */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#4D240F]/60 mb-1">
                <Filter className="w-3 h-3 inline mr-1" />
                Filtrar por producto
              </label>
              <select
                value={filtroProducto}
                onChange={(e) => setFiltroProducto(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#73991C]/20 rounded-lg bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C]"
              >
                <option value="">Todos los productos</option>
                {productosUnicos.map(prod => (
                  <option key={prod} value={prod}>{prod}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[#4D240F]/60 mb-1">
                <Filter className="w-3 h-3 inline mr-1" />
                Filtrar por lote
              </label>
              <select
                value={filtroLote}
                onChange={(e) => setFiltroLote(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#73991C]/20 rounded-lg bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C]"
              >
                <option value="">Todos los lotes</option>
                {lotesUnicos.map(lote => (
                  <option key={lote} value={lote}>{lote}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Agrupación y Exportar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div>
              <label className="block text-xs text-[#4D240F]/60 mb-1">Agrupar por</label>
              <select
                value={vistaAgrupacion}
                onChange={(e) => setVistaAgrupacion(e.target.value as VistaAgrupacion)}
                className="w-full px-3 py-2 text-sm border border-[#73991C]/20 rounded-lg bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C]"
              >
                <option value="ninguno">Sin agrupar</option>
                <option value="fecha">Por fecha</option>
                <option value="lote">Por lote</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-[#4D240F]/60 mb-1">Ordenar por</label>
              <select
                value={ordenamiento}
                onChange={(e) => setOrdenamiento(e.target.value as Ordenamiento)}
                className="w-full px-3 py-2 text-sm border border-[#73991C]/20 rounded-lg bg-white text-[#172E08] focus:outline-none focus:ring-2 focus:ring-[#73991C]"
              >
                <option value="fecha-desc">Más reciente</option>
                <option value="fecha-asc">Más antiguo</option>
                <option value="producto">Producto A-Z</option>
                <option value="cantidad">Mayor cantidad</option>
              </select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleExportarCSV}
                variant="outline"
                className="border-[#73991C]/20 hover:bg-[#73991C]/5 text-[#73991C] w-full sm:w-auto"
                disabled={movimientosFiltrados.length === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Filtros activos */}
        {(filtroProducto || filtroLote) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#73991C]/10">
            <span className="text-xs text-[#4D240F]/60">Filtros activos:</span>
            {filtroProducto && (
              <button
                onClick={() => setFiltroProducto('')}
                className="px-2 py-1 bg-[#73991C]/10 text-[#73991C] rounded text-xs flex items-center gap-1 hover:bg-[#73991C]/20"
              >
                {filtroProducto}
                <X className="w-3 h-3" />
              </button>
            )}
            {filtroLote && (
              <button
                onClick={() => setFiltroLote('')}
                className="px-2 py-1 bg-[#73991C]/10 text-[#73991C] rounded text-xs flex items-center gap-1 hover:bg-[#73991C]/20"
              >
                {filtroLote}
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lista de movimientos */}
      <div className="bg-white rounded-2xl border border-[#73991C]/10 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="px-6 py-4 border-b border-[#73991C]/10">
          <h3 className="text-lg text-[#172E08]">
            Movimientos Registrados ({movimientosFiltrados.length})
          </h3>
        </div>

        <div className="p-6">
          {movimientosFiltrados.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-[#73991C]/20 mx-auto mb-3" />
              <p className="text-sm text-[#4D240F]/60">
                {movimientos.length === 0 
                  ? 'No hay movimientos registrados'
                  : 'No hay movimientos que coincidan con los filtros'
                }
              </p>
            </div>
          ) : vistaAgrupacion === 'fecha' ? (
            <VistaAgrupadaPorFecha
              movimientos={movimientosOrdenados}
              onEliminar={handleEliminar}
              puedeEliminar={aplicacion.estado === 'En ejecución'}
            />
          ) : vistaAgrupacion === 'lote' ? (
            <VistaAgrupadaPorLote
              movimientos={movimientosOrdenados}
              onEliminar={handleEliminar}
              puedeEliminar={aplicacion.estado === 'En ejecución'}
            />
          ) : (
            <VistaSinAgrupar
              movimientos={movimientosOrdenados}
              onEliminar={handleEliminar}
              puedeEliminar={aplicacion.estado === 'En ejecución'}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// VISTAS DE AGRUPACIÓN
// ============================================================================

function VistaAgrupadaPorFecha({ 
  movimientos, 
  onEliminar, 
  puedeEliminar 
}: { 
  movimientos: MovimientoDiario[]; 
  onEliminar: (id: string) => void;
  puedeEliminar: boolean;
}) {
  const grupos = agruparMovimientosPorFecha(movimientos);
  const fechasOrdenadas = Array.from(grupos.keys()).sort().reverse();

  return (
    <div className="space-y-6">
      {fechasOrdenadas.map(fecha => {
        const movsDia = grupos.get(fecha) || [];
        const totalDia = movsDia.reduce((sum, mov) => sum + mov.cantidad_utilizada, 0);

        return (
          <div key={fecha} className="border-b border-[#73991C]/10 last:border-0 pb-6 last:pb-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#73991C]" />
                <h4 className="text-sm text-[#172E08]">{formatearFecha(fecha)}</h4>
              </div>
              <span className="text-xs text-[#4D240F]/60">
                {movsDia.length} {movsDia.length === 1 ? 'movimiento' : 'movimientos'}
              </span>
            </div>

            <div className="space-y-2">
              {movsDia.map(mov => (
                <MovimientoCard 
                  key={mov.id} 
                  movimiento={mov} 
                  onEliminar={onEliminar}
                  puedeEliminar={puedeEliminar}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VistaAgrupadaPorLote({ 
  movimientos, 
  onEliminar,
  puedeEliminar 
}: { 
  movimientos: MovimientoDiario[]; 
  onEliminar: (id: string) => void;
  puedeEliminar: boolean;
}) {
  const grupos = agruparMovimientosPorLote(movimientos);
  const lotesOrdenados = Array.from(grupos.keys()).sort();

  return (
    <div className="space-y-6">
      {lotesOrdenados.map(loteId => {
        const movsLote = grupos.get(loteId) || [];
        const loteNombre = movsLote[0]?.lote_nombre || 'Sin nombre';

        return (
          <div key={loteId} className="border-b border-[#73991C]/10 last:border-0 pb-6 last:pb-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#73991C]" />
                <h4 className="text-sm text-[#172E08]">{loteNombre}</h4>
              </div>
              <span className="text-xs text-[#4D240F]/60">
                {movsLote.length} {movsLote.length === 1 ? 'movimiento' : 'movimientos'}
              </span>
            </div>

            <div className="space-y-2">
              {movsLote.map(mov => (
                <MovimientoCard 
                  key={mov.id} 
                  movimiento={mov} 
                  onEliminar={onEliminar}
                  puedeEliminar={puedeEliminar}
                  mostrarLote={false}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VistaSinAgrupar({ 
  movimientos, 
  onEliminar,
  puedeEliminar 
}: { 
  movimientos: MovimientoDiario[]; 
  onEliminar: (id: string) => void;
  puedeEliminar: boolean;
}) {
  return (
    <div className="space-y-3">
      {movimientos.map(mov => (
        <MovimientoCard 
          key={mov.id} 
          movimiento={mov} 
          onEliminar={onEliminar}
          puedeEliminar={puedeEliminar}
        />
      ))}
    </div>
  );
}

// ============================================================================
// CARD DE MOVIMIENTO
// ============================================================================

function MovimientoCard({ 
  movimiento, 
  onEliminar,
  puedeEliminar,
  mostrarLote = true 
}: { 
  movimiento: MovimientoDiario; 
  onEliminar: (id: string) => void;
  puedeEliminar: boolean;
  mostrarLote?: boolean;
}) {
  return (
    <div className="bg-[#73991C]/5 rounded-xl p-4 hover:bg-[#73991C]/10 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-sm text-[#172E08]">{movimiento.producto_nombre}</p>
          {mostrarLote && (
            <p className="text-xs text-[#4D240F]/60 mt-1">{movimiento.lote_nombre}</p>
          )}
        </div>
        {puedeEliminar && (
          <button
            onClick={() => onEliminar(movimiento.id!)}
            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
            title="Eliminar movimiento"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-2 text-[#4D240F]/70">
          <Calendar className="w-3 h-3" />
          {formatearFecha(movimiento.fecha_movimiento)}
        </div>
        <div className="flex items-center gap-2 text-[#4D240F]/70">
          <Package className="w-3 h-3" />
          {movimiento.cantidad_utilizada} {movimiento.producto_unidad}
        </div>
      </div>

      {/* Mostrar canecas si existen */}
      {movimiento.numero_canecas_utilizadas !== undefined && (
        <div className="grid grid-cols-2 gap-3 text-xs mt-2">
          <div className="flex items-center gap-2 text-[#73991C]">
            <BarChart3 className="w-3 h-3" />
            {movimiento.numero_canecas_utilizadas} canecas usadas
          </div>
          {movimiento.numero_canecas_planeadas && (
            <div className="text-[#4D240F]/60">
              (de {movimiento.numero_canecas_planeadas} planeadas)
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-[#4D240F]/70 mt-2">
        <User className="w-3 h-3" />
        {movimiento.responsable}
      </div>

      {movimiento.notas && (
        <div className="mt-3 pt-3 border-t border-[#73991C]/10">
          <p className="text-xs text-[#4D240F]/60 italic">
            "{movimiento.notas}"
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function agruparMovimientosPorFecha(movimientos: MovimientoDiario[]): Map<string, MovimientoDiario[]> {
  const grupos = new Map<string, MovimientoDiario[]>();
  
  movimientos.forEach(mov => {
    const fecha = mov.fecha_movimiento;
    if (!grupos.has(fecha)) {
      grupos.set(fecha, []);
    }
    grupos.get(fecha)!.push(mov);
  });
  
  return grupos;
}

function agruparMovimientosPorLote(movimientos: MovimientoDiario[]): Map<string, MovimientoDiario[]> {
  const grupos = new Map<string, MovimientoDiario[]>();
  
  movimientos.forEach(mov => {
    const loteId = mov.lote_id;
    if (!grupos.has(loteId)) {
      grupos.set(loteId, []);
    }
    grupos.get(loteId)!.push(mov);
  });
  
  return grupos;
}

function formatearFecha(fechaISO: string): string {
  const fecha = new Date(fechaISO + 'T00:00:00');
  return fecha.toLocaleDateString('es-CO', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}