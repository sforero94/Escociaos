import { AlertTriangle, Calendar, Bug, CheckCircle2 } from 'lucide-react';
import { formatRelativeTime } from '../../utils/format';

/**
 * Interfaz para una alerta individual
 */
export interface Alerta {
  /** ID único de la alerta (opcional, útil para keys) */
  id?: string | number;
  /** Tipo de alerta que determina el icono */
  tipo: 'stock' | 'vencimiento' | 'monitoreo';
  /** Mensaje descriptivo de la alerta */
  mensaje: string;
  /** Fecha de la alerta (Date o string ISO) */
  fecha?: string | Date;
  /** Nivel de prioridad que determina el estilo */
  prioridad: 'alta' | 'media' | 'baja';
}

/**
 * Props del componente AlertList
 */
interface AlertListProps {
  /** Array de alertas a mostrar */
  alertas: Alerta[];
  /** Estado de carga */
  loading?: boolean;
  /** Número máximo de alertas a mostrar (default: 5) */
  maxAlertas?: number;
  /** Callback cuando se hace click en una alerta */
  onAlertClick?: (alerta: Alerta) => void;
}

/**
 * AlertList - Componente para mostrar lista de alertas del dashboard
 * 
 * Características:
 * - Muestra hasta 5 alertas (configurable)
 * - Estilos según prioridad (alta/media/baja)
 * - Iconos según tipo (stock/vencimiento/monitoreo)
 * - Fechas relativas ("hace 2 horas")
 * - Loading state con skeletons
 * - Mensaje "Todo en orden" cuando no hay alertas
 * - Hover effects
 * 
 * @example
 * ```tsx
 * <AlertList
 *   alertas={alertas}
 *   loading={false}
 *   onAlertClick={(alerta) => console.log(alerta)}
 * />
 * ```
 */
export function AlertList({
  alertas,
  loading = false,
  maxAlertas = 5,
  onAlertClick,
}: AlertListProps) {
  // Limitar alertas a mostrar
  const alertasVisibles = alertas.slice(0, maxAlertas);

  // Configuración de estilos por prioridad
  const getPrioridadConfig = (prioridad: Alerta['prioridad']) => {
    const configs = {
      alta: {
        border: 'border-red-200',
        bg: 'bg-red-50/50',
        badgeBg: 'bg-red-100',
        badgeText: 'text-red-700',
        iconColor: 'text-red-600',
        label: 'Alta',
      },
      media: {
        border: 'border-yellow-200',
        bg: 'bg-yellow-50/50',
        badgeBg: 'bg-yellow-100',
        badgeText: 'text-yellow-700',
        iconColor: 'text-yellow-600',
        label: 'Media',
      },
      baja: {
        border: 'border-gray-200',
        bg: 'bg-gray-50/50',
        badgeBg: 'bg-gray-100',
        badgeText: 'text-gray-700',
        iconColor: 'text-gray-600',
        label: 'Baja',
      },
    };
    return configs[prioridad];
  };

  // Obtener icono según tipo de alerta
  const getTipoIcon = (tipo: Alerta['tipo'], className: string) => {
    const icons = {
      stock: <AlertTriangle className={className} />,
      vencimiento: <Calendar className={className} />,
      monitoreo: <Bug className={className} />,
    };
    return icons[tipo];
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <AlertSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Sin alertas - Todo en orden
  if (alertasVisibles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 bg-green-50/30 rounded-2xl border border-green-200/30">
        <CheckCircle2 className="w-12 h-12 text-[#73991C] mb-3" />
        <p className="text-[#172E08]">Todo en orden</p>
        <p className="text-sm text-[#4D240F]/70 mt-1">
          No hay alertas pendientes en este momento
        </p>
      </div>
    );
  }

  // Lista de alertas
  return (
    <div className="space-y-3">
      {alertasVisibles.map((alerta, index) => {
        const prioridadConfig = getPrioridadConfig(alerta.prioridad);
        const alertaId = alerta.id || index;

        return (
          <div
            key={alertaId}
            className={`
              group relative
              bg-white rounded-xl p-4
              border ${prioridadConfig.border}
              ${prioridadConfig.bg}
              hover:shadow-md hover:-translate-y-0.5
              transition-all duration-200
              ${onAlertClick ? 'cursor-pointer' : ''}
            `}
            onClick={() => onAlertClick?.(alerta)}
          >
            {/* Layout: Badge + Content */}
            <div className="flex items-start gap-3">
              {/* Icono */}
              <div className="flex-shrink-0 mt-0.5">
                {getTipoIcon(alerta.tipo, `w-5 h-5 ${prioridadConfig.iconColor}`)}
              </div>

              {/* Contenido */}
              <div className="flex-1 min-w-0">
                {/* Header: Badge de prioridad */}
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`
                      inline-flex items-center px-2 py-0.5 
                      rounded-full text-xs
                      ${prioridadConfig.badgeBg} 
                      ${prioridadConfig.badgeText}
                    `}
                  >
                    {prioridadConfig.label}
                  </span>

                  {/* Fecha relativa */}
                  {alerta.fecha && (
                    <span className="text-xs text-gray-500">
                      {formatRelativeTime(alerta.fecha)}
                    </span>
                  )}
                </div>

                {/* Mensaje principal */}
                <p className="text-sm text-gray-800 leading-relaxed">
                  {alerta.mensaje}
                </p>
              </div>

              {/* Indicador de clickeable */}
              {onAlertClick && (
                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                </div>
              )}
            </div>

            {/* Barra lateral de prioridad (decorativa) */}
            <div
              className={`
                absolute left-0 top-0 bottom-0 w-1 rounded-l-xl
                ${
                  alerta.prioridad === 'alta'
                    ? 'bg-red-500'
                    : alerta.prioridad === 'media'
                    ? 'bg-yellow-500'
                    : 'bg-gray-400'
                }
              `}
            />
          </div>
        );
      })}

      {/* Indicador si hay más alertas */}
      {alertas.length > maxAlertas && (
        <div className="text-center py-2">
          <p className="text-sm text-gray-500">
            +{alertas.length - maxAlertas} alertas más
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * AlertSkeleton - Skeleton loader para alertas
 */
function AlertSkeleton() {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200 animate-pulse">
      <div className="flex items-start gap-3">
        {/* Icono skeleton */}
        <div className="w-5 h-5 bg-gray-200 rounded"></div>

        {/* Content skeleton */}
        <div className="flex-1 space-y-2">
          {/* Badge + fecha skeleton */}
          <div className="flex items-center gap-2">
            <div className="h-5 w-12 bg-gray-200 rounded-full"></div>
            <div className="h-4 w-20 bg-gray-200 rounded"></div>
          </div>

          {/* Mensaje skeleton */}
          <div className="space-y-1">
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * AlertListHeader - Header opcional para la sección de alertas
 */
export function AlertListHeader({
  titulo = 'Alertas Recientes',
  count,
}: {
  titulo?: string;
  count?: number;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[#172E08]">{titulo}</h2>
      {count !== undefined && count > 0 && (
        <span className="inline-flex items-center justify-center w-6 h-6 text-xs bg-red-100 text-red-700 rounded-full">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </div>
  );
}

/**
 * AlertListContainer - Wrapper con estilos del dashboard
 */
export function AlertListContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] border border-[#73991C]/5">
      {/* Gradient decorativo */}
      <div className="absolute -top-4 -right-4 w-32 h-32 bg-[#BFD97D]/10 rounded-full blur-2xl pointer-events-none"></div>
      
      {/* Contenido */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * AlertEmptyState - Estado vacío personalizable
 */
export function AlertEmptyState({
  titulo = 'Todo en orden',
  descripcion = 'No hay alertas pendientes en este momento',
  icono,
}: {
  titulo?: string;
  descripcion?: string;
  icono?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 bg-green-50/30 rounded-2xl border border-green-200/30">
      {icono || <CheckCircle2 className="w-12 h-12 text-[#73991C] mb-3" />}
      <p className="text-[#172E08]">{titulo}</p>
      <p className="text-sm text-[#4D240F]/70 mt-1 text-center">{descripcion}</p>
    </div>
  );
}
