import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardCheck, Plus, Eye, Loader2, Calendar, User, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import { InventorySubNav } from './InventorySubNav';

interface Verificacion {
  id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: string;
  usuario_verificador: string | null;
  revisada_por: string | null;
  fecha_revision: string | null;
  fecha_completada: string | null;
  observaciones_generales: string | null;
  motivo_rechazo: string | null;
  // Datos de la vista resumen
  total_productos?: number;
  productos_contados?: number;
  productos_ok?: number;
  productos_diferencia?: number;
  valor_total_diferencias?: number;
  porcentaje_completado?: number;
}

/**
 * Lista de todas las verificaciones físicas de inventario
 * Muestra estado, progreso y permite ver detalles o aprobar/rechazar
 */
export function VerificacionesList() {
  const [verificaciones, setVerificaciones] = useState<Verificacion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [estadoFilter, setEstadoFilter] = useState<string>('todas');
  const { profile } = useAuth();
  const navigate = useNavigate();
  const supabase = getSupabase();

  useEffect(() => {
    loadVerificaciones();
  }, []);

  const loadVerificaciones = async () => {
    try {
      setIsLoading(true);

      // Cargar desde la vista que incluye el resumen
      const { data, error } = await supabase
        .from('vista_resumen_verificaciones')
        .select('*')
        .order('fecha_inicio', { ascending: false });

      if (error) throw error;

      setVerificaciones(data || []);
    } catch (error) {
      console.error('Error cargando verificaciones:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Filtrar verificaciones por estado
   */
  const verificacionesFiltradas = verificaciones.filter((v) => {
    if (estadoFilter === 'todas') return true;
    return v.estado === estadoFilter;
  });

  /**
   * Obtener icono según estado
   */
  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case 'En proceso':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'Completada':
        return <CheckCircle2 className="w-5 h-5 text-[#73991C]" />;
      case 'Pendiente Aprobación':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'Aprobada':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'Rechazada':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  /**
   * Obtener color del badge según estado
   */
  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'En proceso':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Completada':
        return 'bg-[#E7EDDD] text-[#73991C] border-[#73991C]/20';
      case 'Pendiente Aprobación':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Aprobada':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'Rechazada':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  /**
   * Formatear moneda
   */
  const formatCurrency = (value: number | undefined | null) => {
    if (!value) return '$0';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  /**
   * Formatear fecha
   */
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  /**
   * Determinar la acción principal según el estado y el rol
   */
  const getAccionButton = (verificacion: Verificacion) => {
    const esGerencia = profile?.rol === 'Administrador' || profile?.rol === 'Gerente';

    // Si está en proceso y el usuario es el verificador, puede continuar
    if (verificacion.estado === 'En proceso') {
      return (
        <Link
          to={`/inventario/verificaciones/conteo/${verificacion.id}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all duration-200 font-medium"
        >
          <Clock className="w-4 h-4" />
          Continuar Conteo
        </Link>
      );
    }

    // Si está pendiente de aprobación y el usuario es gerencia, puede revisar
    if (verificacion.estado === 'Pendiente Aprobación' && esGerencia) {
      return (
        <Link
          to={`/inventario/verificaciones/revisar/${verificacion.id}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg"
        >
          <AlertTriangle className="w-4 h-4" />
          Revisar y Aprobar
        </Link>
      );
    }

    // Para todos los demás casos, solo ver detalle
    return (
      <Link
        to={`/inventario/verificaciones/${verificacion.id}`}
        className="inline-flex items-center gap-2 px-4 py-2 border-2 border-[#73991C] text-[#73991C] hover:bg-[#F8FAF5] rounded-xl transition-all duration-200 font-medium"
      >
        <Eye className="w-4 h-4" />
        Ver Detalle
      </Link>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <InventorySubNav />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-[#73991C] animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navegación */}
      <InventorySubNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[#172E08] mb-2 flex items-center gap-3">
            <ClipboardCheck className="w-8 h-8 text-[#73991C]" />
            Verificaciones de Inventario
          </h1>
          <p className="text-[#4D240F]/70">
            {verificaciones.length} verificaciones registradas
          </p>
        </div>
        <Link
          to="/inventario/verificaciones/nueva"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white hover:from-[#5f7d17] hover:to-[#9db86d] rounded-xl transition-all duration-200 font-medium shadow-lg"
        >
          <Plus className="w-5 h-5" />
          Nueva Verificación
        </Link>
      </div>

      {/* Filtros */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-4 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setEstadoFilter('todas')}
            className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
              estadoFilter === 'todas'
                ? 'bg-[#73991C] text-white'
                : 'bg-white text-[#172E08] border border-[#73991C]/20 hover:bg-[#E7EDDD]/50'
            }`}
          >
            Todas ({verificaciones.length})
          </button>
          <button
            onClick={() => setEstadoFilter('En proceso')}
            className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
              estadoFilter === 'En proceso'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-[#172E08] border border-blue-200 hover:bg-blue-50'
            }`}
          >
            En Proceso ({verificaciones.filter(v => v.estado === 'En proceso').length})
          </button>
          <button
            onClick={() => setEstadoFilter('Pendiente Aprobación')}
            className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
              estadoFilter === 'Pendiente Aprobación'
                ? 'bg-amber-500 text-white'
                : 'bg-white text-[#172E08] border border-amber-200 hover:bg-amber-50'
            }`}
          >
            Pendientes ({verificaciones.filter(v => v.estado === 'Pendiente Aprobación').length})
          </button>
          <button
            onClick={() => setEstadoFilter('Aprobada')}
            className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
              estadoFilter === 'Aprobada'
                ? 'bg-green-600 text-white'
                : 'bg-white text-[#172E08] border border-green-200 hover:bg-green-50'
            }`}
          >
            Aprobadas ({verificaciones.filter(v => v.estado === 'Aprobada').length})
          </button>
        </div>
      </div>

      {/* Lista de Verificaciones */}
      {verificacionesFiltradas.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-12 text-center shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
          <ClipboardCheck className="w-16 h-16 text-[#4D240F]/40 mx-auto mb-4" />
          <h3 className="text-xl text-[#172E08] mb-2">
            No hay verificaciones
          </h3>
          <p className="text-[#4D240F]/60 mb-6">
            {estadoFilter === 'todas'
              ? 'Aún no hay verificaciones registradas'
              : `No hay verificaciones con estado "${estadoFilter}"`}
          </p>
          {estadoFilter === 'todas' && (
            <Link
              to="/inventario/verificaciones/nueva"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white hover:from-[#5f7d17] hover:to-[#9db86d] rounded-xl transition-all duration-200 font-medium"
            >
              <Plus className="w-5 h-5" />
              Iniciar Primera Verificación
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {verificacionesFiltradas.map((verificacion) => (
            <div
              key={verificacion.id}
              className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200"
            >
              {/* Header de la Card */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getEstadoIcon(verificacion.estado)}
                  <div>
                    <h3 className="text-lg text-[#172E08]">
                      Verificación {formatDate(verificacion.fecha_inicio)}
                    </h3>
                    <p className="text-sm text-[#4D240F]/60">
                      ID: {verificacion.id.substring(0, 8)}...
                    </p>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-lg text-xs font-medium border ${getEstadoColor(
                    verificacion.estado
                  )}`}
                >
                  {verificacion.estado}
                </span>
              </div>

              {/* Información del Usuario */}
              <div className="flex items-center gap-2 text-sm text-[#4D240F]/70 mb-4">
                <User className="w-4 h-4" />
                <span>
                  Verificador: {verificacion.usuario_verificador || 'No asignado'}
                </span>
              </div>

              {/* Progreso */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-[#4D240F]/70">Progreso del Conteo</span>
                  <span className="font-medium text-[#172E08]">
                    {verificacion.productos_contados || 0}/{verificacion.total_productos || 0} productos
                  </span>
                </div>
                <div className="w-full bg-[#E7EDDD]/50 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-[#73991C] to-[#BFD97D] h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${verificacion.porcentaje_completado || 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Estadísticas */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-[#E7EDDD]/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-[#4D240F]/60 mb-1">OK</p>
                  <p className="text-lg text-[#73991C]">
                    {verificacion.productos_ok || 0}
                  </p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-[#4D240F]/60 mb-1">Diferencias</p>
                  <p className="text-lg text-amber-600">
                    {verificacion.productos_diferencia || 0}
                  </p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-[#4D240F]/60 mb-1">Valor Dif.</p>
                  <p className="text-sm text-red-600">
                    {formatCurrency(verificacion.valor_total_diferencias)}
                  </p>
                </div>
              </div>

              {/* Fechas adicionales */}
              {verificacion.fecha_completada && (
                <div className="flex items-center gap-2 text-xs text-[#4D240F]/60 mb-3">
                  <Calendar className="w-3 h-3" />
                  Completada: {formatDate(verificacion.fecha_completada)}
                </div>
              )}

              {verificacion.fecha_revision && (
                <div className="flex items-center gap-2 text-xs text-[#4D240F]/60 mb-3">
                  <User className="w-3 h-3" />
                  Revisada por {verificacion.revisada_por} el {formatDate(verificacion.fecha_revision)}
                </div>
              )}

              {/* Acción principal */}
              <div className="pt-4 border-t border-[#73991C]/10">
                {getAccionButton(verificacion)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}