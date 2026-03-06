import { RoleGuard } from '../auth/RoleGuard';
import { FinanzasSubNav } from './components/FinanzasSubNav';
import { DashboardSubNav } from './dashboard/DashboardSubNav';
import { DashboardGeneral } from './dashboard/DashboardGeneral';
import { DashboardNegocio } from './dashboard/DashboardNegocio';
import { DashboardGanado } from './dashboard/DashboardGanado';
import type { DashboardTab, NegocioDashboardConfig } from '../../types/finanzas';

const NEGOCIO_CONFIGS: Record<string, NegocioDashboardConfig> = {
  aguacate: {
    slug: 'aguacate',
    nombre: 'Aguacate Hass',
    negocio_nombre: 'Aguacate Hass',
    donut_label: 'Distribucion de Ingresos',
    ingresos_columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'cosecha', label: 'Cosecha' },
      { key: 'cantidad', label: 'Cantidad', format: 'number' },
      { key: 'precio_unitario', label: 'Precio Promedio', format: 'currency' },
      { key: 'valor', label: 'Precio Total', format: 'currency' },
    ],
  },
  hato: {
    slug: 'hato',
    nombre: 'Hato Lechero',
    negocio_nombre: 'Hato Lechero',
    donut_label: 'Distribucion de Ingresos',
    ingresos_columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'tipo_ingreso', label: 'Tipo ingreso' },
      { key: 'cantidad', label: 'Cantidad', format: 'number' },
      { key: 'precio_unitario', label: 'Precio Promedio', format: 'currency' },
      { key: 'valor', label: 'Precio Total', format: 'currency' },
    ],
  },
  caballos: {
    slug: 'caballos',
    nombre: 'Caballos',
    negocio_nombre: 'Caballos',
    donut_label: 'Distribucion de Ingresos',
    ingresos_columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'tipo_ingreso', label: 'Tipo ingreso' },
      { key: 'cantidad', label: 'Cantidad', format: 'number' },
      { key: 'valor', label: 'Precio Total', format: 'currency' },
    ],
  },
  agricola: {
    slug: 'agricola',
    nombre: 'Agricola',
    negocio_nombre: 'Agricola',
    donut_label: 'Distribucion de Ingresos',
    ingresos_columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'tipo_ingreso', label: 'Tipo ingreso' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'alianza', label: 'Alianza' },
      { key: 'valor', label: 'Precio Total', format: 'currency' },
    ],
  },
};

interface FinanzasDashboardProps {
  tab?: DashboardTab;
}

/**
 * Dashboard Principal de Finanzas
 * Acceso exclusivo para rol Gerencia
 */
export function FinanzasDashboard({ tab = 'general' }: FinanzasDashboardProps) {
  const renderPage = () => {
    if (tab === 'general') return <DashboardGeneral />;
    if (tab === 'ganado') return <DashboardGanado />;
    const config = NEGOCIO_CONFIGS[tab];
    if (config) return <DashboardNegocio config={config} />;
    return <DashboardGeneral />;
  };

  return (
    <RoleGuard allowedRoles={['Gerencia']}>
      <div className="space-y-6">
        <FinanzasSubNav />

        <div className="relative">
          <div className="absolute -top-4 -left-4 w-32 h-32 bg-primary/5 rounded-full blur-2xl"></div>
          <div className="relative">
            <h1 className="text-foreground mb-2">Finanzas</h1>
            <p className="text-brand-brown/70">
              Gestion financiera de Escocia Hass - Dashboard por negocio
            </p>
          </div>
        </div>

        <DashboardSubNav activeTab={tab} />

        {renderPage()}
      </div>
    </RoleGuard>
  );
}