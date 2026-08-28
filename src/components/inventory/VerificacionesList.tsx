import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Loader2, Calendar, User, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { InventorySubNav } from './InventorySubNav';
import { formatearFechaCorta } from '../../utils/fechas';

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

      setVerificaciones((data || []) as unknown as Verificacion[]);
    } catch (error) {
      console.error('Failed to load verificaciones:', error);
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
        return <CheckCircle2 className="w-5 h-5 text-primary" />;
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
        return 'bg-muted text-primary border-primary/20';
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

  // Removed - now using formatearFechaCorta from utils/fechas

  /**
   * Determinar la acción principal según el estado.
   *
   * Fase 0 de higiene (docs/plan_verificacion_inventario.md D-5/CA-27):
   * este módulo tenía botones que eran callejones sin salida. "Revisar y
   * Aprobar" enlazaba a `/inventario/verificaciones/revisar/:id`, una ruta
   * que no existe en App.tsx y que caía en el catch-all, redirigiendo al
   * tablero en silencio; "Ver Detalle" enlazaba a `:id`, que hoy solo
   * renderiza un `ComingSoon`.
   *
   * La migración 124 revocó la escritura sobre `verificaciones_inventario` /
   * `verificaciones_detalle`, así que "Continuar Conteo" (que guardaba en
   * `ConteoFisico.tsx`) y "Nueva Verificación" (que insertaba en
   * `NuevaVerificacion.tsx`) dejaron de poder cumplir su promesa también —
   * `App.tsx` ya no enruta ni `nueva` ni `conteo/:id`. Ningún botón visible
   * debe prometer una pantalla que no existe o que va a fallar al escribir,
   * así que no queda ninguna acción con una pantalla real detrás hoy. La
   * pantalla de revisión (y el flujo completo de captura) es el rediseño de
   * `docs/plan_verificacion_inventario.md`, no de esta higiene puntual.
   */
  const getAccionButton = (_verificacion: Verificacion) => {
    return null;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <InventorySubNav />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
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
          <h1 className="text-foreground mb-2 flex items-center gap-3">
            <ClipboardCheck className="w-8 h-8 text-primary" />
            Verificaciones de Inventario
          </h1>
          <p className="text-brand-brown/70">
            {verificaciones.length} verificaciones registradas
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-4 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setEstadoFilter('todas')}
            className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
              estadoFilter === 'todas'
                ? 'bg-primary text-white'
                : 'bg-white text-foreground border border-primary/20 hover:bg-muted/50'
            }`}
          >
            Todas ({verificaciones.length})
          </button>
          <button
            onClick={() => setEstadoFilter('En proceso')}
            className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
              estadoFilter === 'En proceso'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-foreground border border-blue-200 hover:bg-blue-50'
            }`}
          >
            En Proceso ({verificaciones.filter(v => v.estado === 'En proceso').length})
          </button>
          <button
            onClick={() => setEstadoFilter('Pendiente Aprobación')}
            className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
              estadoFilter === 'Pendiente Aprobación'
                ? 'bg-amber-500 text-white'
                : 'bg-white text-foreground border border-amber-200 hover:bg-amber-50'
            }`}
          >
            Pendientes ({verificaciones.filter(v => v.estado === 'Pendiente Aprobación').length})
          </button>
          <button
            onClick={() => setEstadoFilter('Aprobada')}
            className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
              estadoFilter === 'Aprobada'
                ? 'bg-green-600 text-white'
                : 'bg-white text-foreground border border-green-200 hover:bg-green-50'
            }`}
          >
            Aprobadas ({verificaciones.filter(v => v.estado === 'Aprobada').length})
          </button>
        </div>
      </div>

      {/* Lista de Verificaciones */}
      {verificacionesFiltradas.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-12 text-center shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
          <ClipboardCheck className="w-16 h-16 text-brand-brown/40 mx-auto mb-4" />
          <h3 className="text-xl text-foreground mb-2">
            No hay verificaciones
          </h3>
          <p className="text-brand-brown/60 mb-6">
            {estadoFilter === 'todas'
              ? 'Aún no hay verificaciones registradas'
              : `No hay verificaciones con estado "${estadoFilter}"`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {verificacionesFiltradas.map((verificacion) => {
            const accion = getAccionButton(verificacion);
            return (
            <div
              key={verificacion.id}
              className="bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-primary/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200"
            >
              {/* Header de la Card */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getEstadoIcon(verificacion.estado)}
                  <div>
                    <h3 className="text-lg text-foreground">
                      Verificación {formatearFechaCorta(verificacion.fecha_inicio)}
                    </h3>
                    <p className="text-sm text-brand-brown/60">
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
              <div className="flex items-center gap-2 text-sm text-brand-brown/70 mb-4">
                <User className="w-4 h-4" />
                <span>
                  Verificador: {verificacion.usuario_verificador || 'No asignado'}
                </span>
              </div>

              {/* Progreso */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-brand-brown/70">Progreso del Conteo</span>
                  <span className="font-medium text-foreground">
                    {verificacion.productos_contados || 0}/{verificacion.total_productos || 0} productos
                  </span>
                </div>
                <div className="w-full bg-muted/50 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${verificacion.porcentaje_completado || 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Estadísticas */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-brand-brown/60 mb-1">OK</p>
                  <p className="text-lg text-primary">
                    {verificacion.productos_ok || 0}
                  </p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-brand-brown/60 mb-1">Diferencias</p>
                  <p className="text-lg text-amber-600">
                    {verificacion.productos_diferencia || 0}
                  </p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-brand-brown/60 mb-1">Valor Dif.</p>
                  <p className="text-sm text-red-600">
                    {formatCurrency(verificacion.valor_total_diferencias)}
                  </p>
                </div>
              </div>

              {/* Fechas adicionales */}
              {verificacion.fecha_completada && (
                <div className="flex items-center gap-2 text-xs text-brand-brown/60 mb-3">
                  <Calendar className="w-3 h-3" />
                  Completada: {formatearFechaCorta(verificacion.fecha_completada)}
                </div>
              )}

              {verificacion.fecha_revision && (
                <div className="flex items-center gap-2 text-xs text-brand-brown/60 mb-3">
                  <User className="w-3 h-3" />
                  Revisada por {verificacion.revisada_por} el {formatearFechaCorta(verificacion.fecha_revision)}
                </div>
              )}

              {/* Acción principal */}
              {accion && (
                <div className="pt-4 border-t border-primary/10">
                  {accion}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}