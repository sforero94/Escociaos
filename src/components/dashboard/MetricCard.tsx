import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { ReactNode } from 'react';

interface MetricCardProps {
  /** Título de la métrica */
  title: string;
  /** Valor principal a mostrar */
  value: string | number;
  /** Icono de lucide-react */
  icon: ReactNode;
  /** Tendencia de cambio (opcional) */
  trend?: 'up' | 'down' | 'neutral';
  /** Valor de la tendencia, ej: "+12%" (opcional) */
  trendValue?: string;
  /** Estado de carga */
  loading?: boolean;
  /** Color del tema de la card */
  color?: 'green' | 'blue' | 'yellow' | 'red' | 'gray';
  /** Descripción o subtítulo adicional (opcional) */
  subtitle?: string;
  /** Función onClick para toda la card (opcional) */
  onClick?: () => void;
}

/**
 * MetricCard - Componente reutilizable para mostrar métricas del dashboard
 * 
 * Características:
 * - Diseño moderno con sombras y hover effects
 * - Soporte para indicadores de tendencia
 * - Estados de carga con skeleton
 * - Múltiples variantes de color
 * - Totalmente responsive
 * 
 * @example
 * ```tsx
 * <MetricCard
 *   title="Inventario Total"
 *   value="$4,250,000"
 *   icon={<Package className="w-6 h-6" />}
 *   trend="up"
 *   trendValue="+12%"
 *   color="green"
 * />
 * ```
 */
export function MetricCard({
  title,
  value,
  icon,
  trend,
  trendValue,
  loading = false,
  color = 'green',
  subtitle,
  onClick,
}: MetricCardProps) {
  // Configuración de colores según el tema
  const colorConfig = {
    green: {
      iconBg: 'bg-[#73991C]/10',
      iconColor: 'text-[#73991C]',
      hoverShadow: 'hover:shadow-[0_8px_32px_rgba(115,153,28,0.12)]',
      border: 'border-[#73991C]/10',
      gradient: 'from-[#73991C]/5 to-[#BFD97D]/5',
    },
    blue: {
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600',
      hoverShadow: 'hover:shadow-[0_8px_32px_rgba(59,130,246,0.12)]',
      border: 'border-blue-500/10',
      gradient: 'from-blue-500/5 to-blue-300/5',
    },
    yellow: {
      iconBg: 'bg-yellow-500/10',
      iconColor: 'text-yellow-600',
      hoverShadow: 'hover:shadow-[0_8px_32px_rgba(234,179,8,0.12)]',
      border: 'border-yellow-500/10',
      gradient: 'from-yellow-500/5 to-yellow-300/5',
    },
    red: {
      iconBg: 'bg-red-500/10',
      iconColor: 'text-red-600',
      hoverShadow: 'hover:shadow-[0_8px_32px_rgba(239,68,68,0.12)]',
      border: 'border-red-500/10',
      gradient: 'from-red-500/5 to-red-300/5',
    },
    gray: {
      iconBg: 'bg-gray-500/10',
      iconColor: 'text-gray-600',
      hoverShadow: 'hover:shadow-[0_8px_32px_rgba(107,114,128,0.12)]',
      border: 'border-gray-500/10',
      gradient: 'from-gray-500/5 to-gray-300/5',
    },
  };

  const colors = colorConfig[color];

  // Configuración de tendencias
  const getTrendConfig = () => {
    if (!trend) return null;

    const configs = {
      up: {
        icon: ArrowUpRight,
        color: 'text-green-600',
        bg: 'bg-green-50',
        label: 'Incremento',
      },
      down: {
        icon: ArrowDownRight,
        color: 'text-red-600',
        bg: 'bg-red-50',
        label: 'Disminución',
      },
      neutral: {
        icon: Minus,
        color: 'text-gray-600',
        bg: 'bg-gray-50',
        label: 'Sin cambios',
      },
    };

    return configs[trend];
  };

  const trendConfig = getTrendConfig();

  // Skeleton loader
  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 animate-pulse">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 space-y-3">
            {/* Título skeleton */}
            <div className="h-4 bg-gray-200 rounded w-24"></div>
            {/* Valor skeleton */}
            <div className="h-8 bg-gray-200 rounded w-32"></div>
            {/* Subtitle skeleton */}
            {subtitle && <div className="h-3 bg-gray-200 rounded w-40"></div>}
          </div>
          {/* Icono skeleton */}
          <div className="w-14 h-14 bg-gray-200 rounded-2xl"></div>
        </div>
        {/* Tendencia skeleton */}
        {trend && <div className="h-6 bg-gray-200 rounded-full w-20"></div>}
      </div>
    );
  }

  return (
    <div
      className={`
        group relative bg-white rounded-2xl p-6 
        shadow-[0_2px_8px_rgba(0,0,0,0.04)] 
        ${colors.hoverShadow}
        hover:-translate-y-0.5
        transition-all duration-300
        border ${colors.border}
        ${onClick ? 'cursor-pointer' : ''}
        overflow-hidden
      `}
      onClick={onClick}
    >
      {/* Gradient overlay on hover */}
      <div 
        className={`
          absolute inset-0 
          bg-gradient-to-br ${colors.gradient}
          opacity-0 group-hover:opacity-100
          transition-opacity duration-300
          pointer-events-none
        `}
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Header: Título + Icono */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            {/* Título */}
            <h3 className="text-xs tracking-wide uppercase text-gray-500 mb-2">
              {title}
            </h3>
            
            {/* Valor principal */}
            <p className="text-3xl text-gray-900 tracking-tight mb-1">
              {value}
            </p>

            {/* Subtítulo opcional */}
            {subtitle && (
              <p className="text-sm text-gray-600">
                {subtitle}
              </p>
            )}
          </div>

          {/* Icono */}
          <div 
            className={`
              w-14 h-14 ${colors.iconBg} 
              rounded-2xl flex items-center justify-center
              group-hover:scale-110 
              transition-transform duration-300
            `}
          >
            <div className={colors.iconColor}>
              {icon}
            </div>
          </div>
        </div>

        {/* Indicador de tendencia */}
        {trendConfig && trendValue && (
          <div 
            className={`
              inline-flex items-center gap-1.5 
              px-3 py-1.5 rounded-full
              ${trendConfig.bg}
              ${trendConfig.color}
            `}
          >
            <trendConfig.icon className="w-4 h-4" />
            <span className="text-sm">
              {trendValue}
            </span>
          </div>
        )}
      </div>

      {/* Indicador visual de clickeable */}
      {onClick && (
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-2 h-2 rounded-full bg-gray-400"></div>
        </div>
      )}
    </div>
  );
}

/**
 * MetricCardSkeleton - Skeleton loader para MetricCard
 * Útil para estados de carga optimistas
 */
export function MetricCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 space-y-3">
          <div className="h-4 bg-gray-200 rounded w-24"></div>
          <div className="h-8 bg-gray-200 rounded w-32"></div>
          <div className="h-3 bg-gray-200 rounded w-40"></div>
        </div>
        <div className="w-14 h-14 bg-gray-200 rounded-2xl"></div>
      </div>
      <div className="h-6 bg-gray-200 rounded-full w-20"></div>
    </div>
  );
}

/**
 * MetricCardGrid - Grid container optimizado para MetricCards
 * Responsive: 1 col en mobile, 2 en tablet, 3 en desktop
 */
export function MetricCardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {children}
    </div>
  );
}
