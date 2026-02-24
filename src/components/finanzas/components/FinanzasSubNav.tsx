import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingDown,
  TrendingUp,
  FileBarChart,
  Settings
} from 'lucide-react';

/**
 * Submenú horizontal para las páginas de Finanzas
 */
export function FinanzasSubNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = [
    {
      id: 'tablero',
      label: 'Dashboard',
      subtitle: 'Vista general',
      icon: LayoutDashboard,
      path: '/finanzas',
    },
    {
      id: 'gastos',
      label: 'Gastos',
      subtitle: 'Registros de gastos',
      icon: TrendingDown,
      path: '/finanzas/gastos',
    },
    {
      id: 'ingresos',
      label: 'Ingresos',
      subtitle: 'Registros de ingresos',
      icon: TrendingUp,
      path: '/finanzas/ingresos',
    },
    {
      id: 'reportes',
      label: 'Reportes',
      subtitle: 'P&L y análisis',
      icon: FileBarChart,
      path: '/finanzas/reportes',
    },
    {
      id: 'configuracion',
      label: 'Configuración',
      subtitle: 'Catálogos y ajustes',
      icon: Settings,
      path: '/finanzas/configuracion',
    },
  ];

  const isActive = (path: string) => {
    if (path === '/finanzas') {
      return location.pathname === '/finanzas';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl border-b border-primary/10 mb-6 -mx-4 lg:-mx-8 px-4 lg:px-8">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);

          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`flex items-center gap-2 px-4 py-4 border-b-2 transition-all whitespace-nowrap ${
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-brand-brown/60 hover:text-foreground hover:border-primary/30'
              }`}
            >
              <Icon className="w-5 h-5" />
              <div className="text-left">
                <div className={`text-sm ${active ? 'font-medium' : ''}`}>
                  {tab.label}
                </div>
                <div className="text-xs text-brand-brown/50">
                  {tab.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
