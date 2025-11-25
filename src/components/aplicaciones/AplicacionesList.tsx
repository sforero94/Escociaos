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
  Edit2,
  Trash2,
  X,
  ClipboardList,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { IniciarEjecucionModal } from './IniciarEjecucionModal';
import { DetalleAplicacion } from './DetalleAplicacion';
import type { Aplicacion, TipoAplicacion, EstadoAplicacion } from '../../types/aplicaciones';

const TIPOS_LABELS: Record<TipoAplicacion, string> = {
  'Fumigación': 'Fumigación',
  'Fertilización': 'Fertilización',
  'Drench': 'Drench',
};

const ESTADO_LABELS: Record<EstadoAplicacion, string> = {
  'Calculada': 'Planificada',
  'En ejecución': 'En Ejecución',
  'Cerrada': 'Cerrada',
};

const ESTADO_COLORS: Record<EstadoAplicacion, string> = {
  'Calculada': 'bg-blue-100 text-blue-700 border-blue-200',
  'En ejecución': 'bg-green-100 text-green-700 border-green-200',
  'Cerrada': 'bg-gray-100 text-gray-700 border-gray-200',
};

const ESTADO_ICONS: Record<EstadoAplicacion, typeof Clock> = {
  'Calculada': Clock,
  'En ejecución': Play,
  'Cerrada': CheckCircle2,
};

export function AplicacionesList() {
  const navigate = useNavigate();
  const supabase = getSupabase();

  const [aplicaciones, setAplicaciones] = useState<Aplicacion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoAplicacion | 'todos'>('todos');
  const [filtroEstado, setFiltroEstado] = useState<EstadoAplicacion | 'todos'>('todos');
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [iniciarEjecucionId, setIniciarEjecucionId] = useState<string | null>(null);
  const [aplicacionDetalle, setAplicacionDetalle] = useState<Aplicacion | null>(null);

  useEffect(() => {
    loadAplicaciones();
  }, []);

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = () => {
      if (menuAbiertoId) {
        setMenuAbiertoId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuAbiertoId]);

  const loadAplicaciones = async () => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('aplicaciones')
        .select(`
          id,
          codigo_aplicacion,
          nombre_aplicacion,
          tipo_aplicacion,
          proposito,
          blanco_biologico,
          fecha_inicio_planeada,
          fecha_fin_planeada,
          fecha_recomendacion,
          fecha_inicio_ejecucion,
          fecha_fin_ejecucion,
          fecha_cierre,
          agronomo_responsable,
          estado,
          created_at,
          updated_at,
          aplicaciones_lotes (
            lote_id,
            lotes (
              nombre
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error cargando aplicaciones:', error);
        throw error;
      }

      console.log('📊 Datos crudos de Supabase:', data);

      // Mapear datos de BD al formato de la interfaz
      const aplicacionesMapeadas: Aplicacion[] = [];
      
      (data || []).forEach((row: any) => {
        try {
          // Extraer lotes seleccionados
          const lotesSeleccionados = (row.aplicaciones_lotes || []).map((al: any) => ({
            lote_id: al.lote_id,
            nombre: al.lotes?.nombre || 'Lote sin nombre',
            sublotes_ids: [],
            area_hectareas: 0,
            conteo_arboles: {
              grandes: 0,
              medianos: 0,
              pequenos: 0,
              clonales: 0,
              total: 0,
            },
          }));

          // Parsear blanco_biologico de forma segura
          let blancoBiologico: string[] = [];
          if (row.blanco_biologico) {
            try {
              // Intentar parsear como JSON
              blancoBiologico = JSON.parse(row.blanco_biologico);
              // Si no es array, convertirlo a array
              if (!Array.isArray(blancoBiologico)) {
                blancoBiologico = [];
              }
            } catch (e) {
              // Si falla el parse, es texto plano - dejarlo como array vacío
              console.warn(`⚠️  blanco_biologico no es JSON válido para aplicación ${row.id}:`, row.blanco_biologico);
              blancoBiologico = [];
            }
          }

          aplicacionesMapeadas.push({
            id: row.id,
            nombre_aplicacion: row.nombre_aplicacion || 'Sin nombre',
            tipo_aplicacion: row.tipo_aplicacion as TipoAplicacion,
            fecha_inicio_planeada: row.fecha_inicio_planeada,
            fecha_fin_planeada: row.fecha_fin_planeada,
            fecha_recomendacion: row.fecha_recomendacion,
            fecha_inicio_ejecucion: row.fecha_inicio_ejecucion,
            fecha_fin_ejecucion: row.fecha_fin_ejecucion,
            fecha_cierre: row.fecha_cierre,
            estado: row.estado as EstadoAplicacion,
            proposito: row.proposito,
            agronomo_responsable: row.agronomo_responsable,
            created_at: row.created_at,
            updated_at: row.updated_at,
            // Campos legacy para compatibilidad con UI vieja
            nombre: row.nombre_aplicacion || 'Sin nombre',
            tipo: row.tipo_aplicacion === 'Fumigación' 
              ? 'fumigacion' 
              : row.tipo_aplicacion === 'Fertilización'
              ? 'fertilizacion'
              : 'drench',
            fecha_inicio: row.fecha_recomendacion || row.created_at,
            configuracion: {
              nombre: row.nombre_aplicacion || 'Sin nombre',
              tipo_aplicacion: row.tipo_aplicacion as TipoAplicacion,
              fecha_inicio_planeada: row.fecha_recomendacion || row.created_at,
              proposito: row.proposito,
              agronomo_responsable: row.agronomo_responsable,
              blanco_biologico: blancoBiologico,
              lotes_seleccionados: lotesSeleccionados,
            },
            mezclas: [],
            calculos: [],
            lista_compras: {
              items: [],
              costo_total_estimado: 0,
              productos_sin_precio: 0,
              productos_sin_stock: 0,
            },
            creado_en: row.created_at,
            creado_por: '',
            actualizado_en: row.updated_at,
          });
        } catch (rowError) {
          console.error(`❌ Error procesando aplicación ${row.id}:`, rowError);
          // Continuar con el siguiente registro
        }
      });

      console.log('✅ Aplicaciones mapeadas correctamente:', aplicacionesMapeadas.length);
      setAplicaciones(aplicacionesMapeadas);
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

    const matchTipo = filtroTipo === 'todos' || app.tipo_aplicacion === filtroTipo;
    const matchEstado = filtroEstado === 'todos' || app.estado === filtroEstado;

    return matchSearch && matchTipo && matchEstado;
  });

  // Estadísticas
  const stats = {
    total: aplicaciones.length,
    planificadas: aplicaciones.filter((a) => a.estado === 'Calculada').length,
    en_ejecucion: aplicaciones.filter((a) => a.estado === 'En ejecución').length,
    cerradas: aplicaciones.filter((a) => a.estado === 'Cerrada').length,
  };

  /**
   * ELIMINAR APLICACIÓN
   */
  const handleEliminar = async (aplicacionId: string) => {
    try {
      console.log('🗑️ Iniciando eliminación de aplicación:', aplicacionId);

      // 1. Verificar y eliminar movimientos de inventario primero
      console.log('🔍 Verificando movimientos de inventario...');
      const { data: movimientos, error: errorCheckMovimientos } = await supabase
        .from('movimientos_inventario')
        .select('id')
        .eq('aplicacion_id', aplicacionId);

      if (errorCheckMovimientos) {
        console.error('❌ Error verificando movimientos:', errorCheckMovimientos);
        throw errorCheckMovimientos;
      }

      if (movimientos && movimientos.length > 0) {
        console.log(`⚠️ Encontrados ${movimientos.length} movimientos de inventario. Eliminando...`);
        
        const { error: errorDeleteMovimientos } = await supabase
          .from('movimientos_inventario')
          .delete()
          .eq('aplicacion_id', aplicacionId);

        if (errorDeleteMovimientos) {
          console.error('❌ Error eliminando movimientos de inventario:', errorDeleteMovimientos);
          throw errorDeleteMovimientos;
        }
        
        console.log('✅ Movimientos de inventario eliminados');
      } else {
        console.log('ℹ️ No hay movimientos de inventario asociados');
      }

      // 2. Eliminar relaciones con lotes
      const { error: errorLotes } = await supabase
        .from('aplicaciones_lotes')
        .delete()
        .eq('aplicacion_id', aplicacionId);

      if (errorLotes) {
        console.error('❌ Error eliminando relaciones con lotes:', errorLotes);
        throw errorLotes;
      }

      console.log('✅ Lotes eliminados');

      // 3. Obtener IDs de mezclas
      const { data: mezclas, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacionId);

      if (errorMezclas) {
        console.error('❌ Error obteniendo mezclas:', errorMezclas);
        throw errorMezclas;
      }

      console.log('✅ Mezclas obtenidas:', mezclas?.length || 0);

      // 4. Eliminar productos de las mezclas
      if (mezclas && mezclas.length > 0) {
        const mezclaIds = mezclas.map(m => m.id);

        const { error: errorProductosMezcla } = await supabase
          .from('aplicaciones_productos')
          .delete()
          .in('mezcla_id', mezclaIds);

        if (errorProductosMezcla) {
          console.error('❌ Error eliminando productos de mezclas:', errorProductosMezcla);
          throw errorProductosMezcla;
        }

        console.log('✅ Productos de mezclas eliminados');

        // 5. Eliminar mezclas
        const { error: errorDeleteMezclas } = await supabase
          .from('aplicaciones_mezclas')
          .delete()
          .in('id', mezclaIds);

        if (errorDeleteMezclas) {
          console.error('❌ Error eliminando mezclas:', errorDeleteMezclas);
          throw errorDeleteMezclas;
        }

        console.log('✅ Mezclas eliminadas');
      }

      // 6. Eliminar cálculos
      const { error: errorCalculos } = await supabase
        .from('aplicaciones_calculos')
        .delete()
        .eq('aplicacion_id', aplicacionId);

      if (errorCalculos) {
        console.error('❌ Error eliminando cálculos:', errorCalculos);
        throw errorCalculos;
      }

      console.log('✅ Cálculos eliminados');

      // 7. Eliminar lista de compras
      const { error: errorCompras } = await supabase
        .from('aplicaciones_compras')
        .delete()
        .eq('aplicacion_id', aplicacionId);

      if (errorCompras) {
        console.error('❌ Error eliminando lista de compras:', errorCompras);
        throw errorCompras;
      }

      console.log('✅ Lista de compras eliminada');

      // 8. Finalmente, eliminar la aplicación
      const { error: errorAplicacion } = await supabase
        .from('aplicaciones')
        .delete()
        .eq('id', aplicacionId);

      if (errorAplicacion) {
        console.error('❌ Error eliminando aplicación:', errorAplicacion);
        throw errorAplicacion;
      }

      console.log('✅ Aplicación eliminada');

      // Actualizar lista local
      setAplicaciones(aplicaciones.filter(a => a.id !== aplicacionId));
      setEliminando(null);
      
      console.log('🎉 Eliminación completada exitosamente');
      alert('Aplicación eliminada exitosamente');
    } catch (error) {
      console.error('💥 Error eliminando aplicación:', error);
      alert('Error al eliminar la aplicación. Por favor intenta nuevamente.');
    }
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
            <option value="drench">Drench</option>
          </select>

          {/* Filtro por estado */}
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoAplicacion | 'todos')}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73991C]/20 focus:border-[#73991C]"
          >
            <option value="todos">Todos los estados</option>
            <option value="Calculada">Planificada</option>
            <option value="En ejecución">En Ejecución</option>
            <option value="Cerrada">Cerrada</option>
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
              const TipoIcon = aplicacion.tipo_aplicacion === 'Fumigación' ? Droplet : Leaf;

              return (
                <div
                  key={aplicacion.id}
                  className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setAplicacionDetalle(aplicacion)}
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
                            {TIPOS_LABELS[aplicacion.tipo_aplicacion]}
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
                    <div className="flex items-center gap-2">
                      {/* Botón principal según estado */}
                      {aplicacion.estado === 'Calculada' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIniciarEjecucionId(aplicacion.id);
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg hover:from-green-700 hover:to-green-600 transition-all flex items-center gap-2"
                        >
                          <Play className="w-4 h-4" />
                          <span>Iniciar Ejecución</span>
                        </button>
                      )}
                      
                      {aplicacion.estado === 'En ejecución' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/aplicaciones/${aplicacion.id}/movimientos`);
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-[#4D240F] to-[#4D240F]/80 text-white rounded-lg hover:from-[#3d1c0c] hover:to-[#3d1c0c]/80 transition-all flex items-center gap-2"
                        >
                          <ClipboardList className="w-4 h-4" />
                          <span>Registrar Movimientos</span>
                        </button>
                      )}

                      {/* Menú de 3 puntos - solo Editar y Eliminar */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuAbiertoId(
                              menuAbiertoId === aplicacion.id ? null : aplicacion.id
                            );
                            setMenuPosition({
                              top: rect.bottom + window.scrollY,
                              left: rect.left + window.scrollX - 192 + rect.width,
                            });
                          }}
                          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                          <MoreVertical className="w-5 h-5 text-[#4D240F]/70" />
                        </button>

                        {/* Dropdown menu - solo Editar y Eliminar */}
                        {menuAbiertoId === aplicacion.id && menuPosition && (
                          <div
                            className="fixed w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[9999]"
                            style={{
                              top: `${menuPosition.top}px`,
                              left: `${menuPosition.left}px`,
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/aplicaciones/calculadora/${aplicacion.id}`);
                                setMenuAbiertoId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-[#172E08] hover:bg-gray-50 flex items-center gap-2 transition-colors"
                            >
                              <Edit2 className="w-4 h-4 text-gray-500" />
                              Editar
                            </button>
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEliminando(aplicacion.id);
                                setMenuAbiertoId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de confirmación de eliminación */}
      {eliminando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg text-[#172E08]">Eliminar Aplicación</h3>
                <p className="text-sm text-[#4D240F]/70">Esta acción no se puede deshacer</p>
              </div>
            </div>

            <p className="text-sm text-[#4D240F]/70 mb-6">
              ¿Estás seguro de que deseas eliminar esta aplicación? Se eliminarán todos los
              datos asociados incluyendo mezclas, cálculos y relaciones con lotes.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setEliminando(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-[#4D240F] rounded-lg hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleEliminar(eliminando)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de iniciar ejecución */}
      {iniciarEjecucionId && (
        <IniciarEjecucionModal
          aplicacion={aplicaciones.find(a => a.id === iniciarEjecucionId)!}
          onClose={() => setIniciarEjecucionId(null)}
          onSuccess={() => {
            setIniciarEjecucionId(null);
            loadAplicaciones();
          }}
        />
      )}

      {/* Modal de detalle de aplicación */}
      {aplicacionDetalle && (
        <DetalleAplicacion
          aplicacion={aplicacionDetalle}
          onClose={() => setAplicacionDetalle(null)}
          onEditar={() => {
            setAplicacionDetalle(null);
            navigate(`/aplicaciones/${aplicacionDetalle.id}/editar`);
          }}
          onRegistrarMovimientos={() => {
            setAplicacionDetalle(null);
            navigate(`/aplicaciones/${aplicacionDetalle.id}/movimientos`);
          }}
          onCerrarAplicacion={() => {
            setAplicacionDetalle(null);
            navigate(`/aplicaciones/${aplicacionDetalle.id}/cierre`);
          }}
        />
      )}
    </div>
  );
}