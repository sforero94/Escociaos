/**
 * Dashboard Components
 * 
 * Barrel export para facilitar las importaciones
 */

export { MetricCard, MetricCardGrid, MetricCardSkeleton } from './MetricCard';
export { MetricCardShowcase } from './MetricCard.showcase';

export { 
  AlertList, 
  AlertListHeader, 
  AlertListContainer, 
  AlertEmptyState 
} from './AlertList';
export type { Alerta } from './AlertList';
export { AlertListShowcase } from './AlertList.showcase';

// Re-export de ejemplos (opcional, para desarrollo)
export * as MetricCardExamples from './MetricCard.examples';
export * as AlertListExamples from './AlertList.examples';