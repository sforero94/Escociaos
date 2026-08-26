/**
 * Dashboard Components
 *
 * Barrel export para facilitar las importaciones
 */


export {
  AlertList,
  CompactAlertList,
  AlertListHeader,
  AlertListContainer,
  AlertEmptyState
} from './AlertList';
export type { Alerta } from './AlertList';
export { EstadoHeader } from './EstadoHeader';
export type { EstadoHeaderProps } from './EstadoHeader';
export { ClimaCard } from './ClimaCard';
export { FranjaLluvia } from './FranjaLluvia';
export { RachaSinLluvia } from './RachaSinLluvia';
export { QuickLinksRow } from './QuickLinksRow';
export { DashboardKPICard } from './DashboardKPICard';
export { PlagasKPICard } from './PlagasKPICard';
export type { PlagaKPI } from './PlagasKPICard';
export { AccionesRecomendadas } from './AccionesRecomendadas';
export type { AccionesRecomendadasProps } from './AccionesRecomendadas';
export { AccionCard } from './AccionCard';
export type { AccionCardProps } from './AccionCard';
export { Dinero } from './Dinero';
export { SaludDatos } from './SaludDatos';
export { RequiereDecision } from './RequiereDecision';
export type { RequiereDecisionProps } from './RequiereDecision';
export { useRequiereDecision } from './hooks/useRequiereDecision';
export type {
  UseRequiereDecisionParams,
  UseRequiereDecisionResultado,
  FilaRequiereDecision,
  ErrorFuenteRequiereDecision,
} from './hooks/useRequiereDecision';
export { PulsoNegocio } from './PulsoNegocio';
export type { PulsoNegocioProps } from './PulsoNegocio';
export { PulsoHatoCard } from './PulsoHatoCard';
export { PulsoAguacateCard } from './PulsoAguacateCard';
export { PulsoGanadoCard } from './PulsoGanadoCard';