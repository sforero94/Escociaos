import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Droplet,
  Leaf,
  Calendar,
  MapPin,
  MoreVertical,
  Play,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import type { Aplicacion, TipoAplicacion, EstadoAplicacion } from '../../types/aplicaciones';

const TIPOS_LABELS: Record<TipoAplicacion, string> = {
  fumigacion: 'Fumigación',
  fertilizacion: 'Fertilización',
};

const ESTADO_LABELS: Record<EstadoAplicacion, string> = {
  planificada: 'Planificada',
  en_ejecucion: 'En Ejecución',
  cerrada: 'Cerrada',
};

const ESTADO_COLORS: Record<EstadoAplicacion, string> = {
  planificada: 'bg-blue-100 text-blue-700 border-blue-200',
  en_ejecucion: 'bg-green-100 text-green-700 border-green-200',
  cerrada: 'bg-gray-100 text-gray-700 border-gray-200',
};

const ESTADO_ICONS: Record<EstadoAplicacion, typeof Clock> = {
  planificada: Clock,
  en_ejecucion: Play,
  cerrada: CheckCircle2,
};

export function AplicacionesList() {
  const navigate = useNavigate();
  const supabase = getSupabase();

  const [aplicaciones, setAplicaciones] = useState<Aplicacion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoAplicacion | 'todos'>('todos');
  const [filtroEstado, setFiltroEstado] = useState<EstadoAplicacion | 'todos'>('todos');

  useEffect(() => {
    loadAplicaciones();
  }, []);

  const loadAplicaciones = async () => {
    try {
      setIsLoading(true);

      // TODO: Implementar carga desde Supabase
      // const { data, error } = await supabase
      //   .from('aplicaciones')
      //   .select('*')
      //   .order('fecha_inicio', { ascending: false });

      // Por ahora, datos de ejemplo
      const mockData: Aplicacion[] = [];

      setAplicaciones(mockData);
    } catch (error) {
      console.error('Error cargando aplicaciones:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar aplicaciones
  const aplicacionesFiltradas = aplicaciones.filter((app) => {
    const matchSearch =
      searchQuery === '' ||
      app.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.proposito?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchTipo = filtroTipo === 'todos' || app.tipo === filtroTipo;
    const matchEstado = filtroEstado === 'todos' || app.estado === filtroEstado;

    return matchSearch && matchTipo && matchEstado;
  });

  // Estadísticas
  const stats = {
    total: aplicaciones.length,
    planificadas: aplicaciones.filter((a) => a.estado === 'planificada').length,
    en_ejecucion: aplicaciones.filter((a) => a.estado === 'en_ejecucion').length,
    cerradas: aplicaciones.filter((a) => a.estado === 'cerrada').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[#172E08] mb-2">Aplicaciones Fitosanitarias</h1>
          <p className="text-[#4D240F]/70">
            Gestiona fumigaciones, fertilizaciones y aplicaciones del cultivo
          </p>
        </div>

        <button
          onClick={() => navigate('/aplicaciones/calculadora')}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-xl hover:from-[#5f7d17] hover:to-[#9db86d] transition-all shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>Nueva Aplicación</span>
        </button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#4D240F]/70">Total</p>
            <div className="w-10 h-10 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#73991C]" />
            </div>
          </div>
          <p className="text-2xl text-[#172E08]">{stats.total}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#4D240F]/70">Planificadas</p>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl text-[#172E08]">{stats.planificadas}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#4D240F]/70">En Ejecución</p>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Play className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <p className="text-2xl text-[#172E08]">{stats.en_ejecucion}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#4D240F]/70">Cerradas</p>
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-gray-600" />
            </div>
          </div>
          <p className="text-2xl text-[#172E08]">{stats.cerradas}</p>
        </div>
      </div>

      {/* Filtros y búsqueda */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Búsqueda */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4D240F]/40" />
            <input
              type="text"
              placeholder="Buscar aplicación..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
            />
          </div>

          {/* Filtro por tipo */}
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as TipoAplicacion | 'todos')}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
          >
            <option value="todos">Todos los tipos</option>
            <option value="fumigacion">Fumigación</option>
            <option value="fertilizacion">Fertilización</option>
          </select>

          {/* Filtro por estado */}
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoAplicacion | 'todos')}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
          >
            <option value="todos">Todos los estados</option>
            <option value="planificada">Planificada</option>
            <option value="en_ejecucion">En Ejecución</option>
            <option value="cerrada">Cerrada</option>
          </select>
        </div>
      </div>

      {/* Lista de aplicaciones */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#73991C] animate-spin" />
          </div>
        ) : aplicacionesFiltradas.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <Droplet className="w-8 h-8 text-[#73991C]" />
            </div>
            <h3 className="text-lg text-[#172E08] mb-2">
              {searchQuery || filtroTipo !== 'todos' || filtroEstado !== 'todos'
                ? 'No se encontraron aplicaciones'
                : 'No hay aplicaciones registradas'}
            </h3>
            <p className="text-sm text-[#4D240F]/70 mb-6">
              {searchQuery || filtroTipo !== 'todos' || filtroEstado !== 'todos'
                ? 'Intenta ajustar los filtros de búsqueda'
                : 'Comienza creando tu primera aplicación'}
            </p>
            {!searchQuery && filtroTipo === 'todos' && filtroEstado === 'todos' && (
              <button
                onClick={() => navigate('/aplicaciones/calculadora')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-xl hover:from-[#5f7d17] hover:to-[#9db86d] transition-all"
              >
                <Plus className="w-5 h-5" />
                <span>Nueva Aplicación</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {aplicacionesFiltradas.map((aplicacion) => {
              const EstadoIcon = ESTADO_ICONS[aplicacion.estado];
              const TipoIcon = aplicacion.tipo === 'fumigacion' ? Droplet : Leaf;

              return (
                <div
                  key={aplicacion.id}
                  className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/aplicaciones/${aplicacion.id}`)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Icono */}
                      <div className="w-12 h-12 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <TipoIcon className="w-6 h-6 text-[#73991C]" />
                      </div>

                      {/* Información */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-[#172E08] truncate">
                            {aplicacion.nombre}
                          </h3>
                          <span
                            className={`px-2 py-1 text-xs rounded-lg border ${
                              ESTADO_COLORS[aplicacion.estado]
                            }`}
                          >
                            {ESTADO_LABELS[aplicacion.estado]}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-[#4D240F]/70">
                          <span className="flex items-center gap-1">
                            <TipoIcon className="w-4 h-4" />
                            {TIPOS_LABELS[aplicacion.tipo]}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {new Date(aplicacion.fecha_inicio).toLocaleDateString('es-CO')}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {aplicacion.configuracion.lotes_seleccionados.length} lotes
                          </span>
                        </div>

                        {aplicacion.proposito && (
                          <p className="text-sm text-[#4D240F]/70 mt-2 line-clamp-1">
                            {aplicacion.proposito}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Acciones */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: Mostrar menú de opciones
                      }}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <MoreVertical className="w-5 h-5 text-[#4D240F]/70" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
