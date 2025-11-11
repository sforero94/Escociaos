/**
 * Type Definitions - MetricCard Component
 * 
 * Tipos compartidos y utilidades para MetricCard
 */

import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

/**
 * Props del componente MetricCard
 */
export interface MetricCardProps {
  /** Título de la métrica (se muestra en mayúsculas pequeñas) */
  title: string;
  
  /** Valor principal a mostrar (puede ser string formateado o número) */
  value: string | number;
  
  /** Icono de lucide-react como ReactNode */
  icon: ReactNode;
  
  /** Dirección de la tendencia (opcional) */
  trend?: 'up' | 'down' | 'neutral';
  
  /** Valor de cambio de la tendencia, ej: "+12%" (opcional) */
  trendValue?: string;
  
  /** Estado de carga - muestra skeleton cuando true */
  loading?: boolean;
  
  /** Color del tema de la card */
  color?: 'green' | 'blue' | 'yellow' | 'red' | 'gray';
  
  /** Descripción o subtítulo adicional debajo del valor */
  subtitle?: string;
  
  /** Función callback cuando se hace click en la card */
  onClick?: () => void;
}

/**
 * Tipo para los datos de una métrica desde la API
 */
export interface MetricData {
  id: string | number;
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: 'green' | 'blue' | 'yellow' | 'red' | 'gray';
  subtitle?: string;
  onClick?: () => void;
}

/**
 * Configuración de color para el tema
 */
export interface ColorConfig {
  iconBg: string;
  iconColor: string;
  hoverShadow: string;
  border: string;
  gradient: string;
}

/**
 * Configuración de tendencia
 */
export interface TrendConfig {
  icon: LucideIcon;
  color: string;
  bg: string;
  label: string;
}

/**
 * Tipo de colores disponibles
 */
export type MetricCardColor = 'green' | 'blue' | 'yellow' | 'red' | 'gray';

/**
 * Tipo de tendencias disponibles
 */
export type MetricCardTrend = 'up' | 'down' | 'neutral';

/**
 * Props para MetricCardGrid
 */
export interface MetricCardGridProps {
  children: ReactNode;
  /** Número de columnas personalizado (opcional, por defecto responsive) */
  columns?: 1 | 2 | 3 | 4;
}

/**
 * Mapa de colores disponibles
 */
export const METRIC_CARD_COLORS = {
  green: 'green',
  blue: 'blue',
  yellow: 'yellow',
  red: 'red',
  gray: 'gray',
} as const;

/**
 * Mapa de tendencias disponibles
 */
export const METRIC_CARD_TRENDS = {
  up: 'up',
  down: 'down',
  neutral: 'neutral',
} as const;

/**
 * Helper type para crear arrays de MetricData
 */
export type MetricDataArray = MetricData[];

/**
 * Props extendidas con className (para casos especiales)
 */
export interface ExtendedMetricCardProps extends MetricCardProps {
  className?: string;
}
