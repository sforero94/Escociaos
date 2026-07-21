import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ListTodo, FileBarChart, Users, UserCheck } from 'lucide-react';

/**
 * Submenú horizontal para las páginas de Labores
 * (Kanban / Reportes / Empleados / Contratistas)
 */
export function LaboresSubNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const vista = searchParams.get('vista');

  const tabs = [
    {
      id: 'kanban',
      label: 'Kanban',
      subtitle: 'Tablero de tareas',
      icon: ListTodo,
      path: '/labores?vista=kanban',
      isActive: () => location.pathname === '/labores' && vista !== 'reportes',
    },
    {
      id: 'reportes',
      label: 'Reportes',
      subtitle: 'Análisis de labores',
      icon: FileBarChart,
      path: '/labores?vista=reportes',
      isActive: () => location.pathname === '/labores' && vista === 'reportes',
    },
    {
      id: 'empleados',
      label: 'Empleados',
      subtitle: 'Personal de planta',
      icon: Users,
      path: '/labores/empleados',
      isActive: () => location.pathname === '/labores/empleados',
    },
    {
      id: 'contratistas',
      label: 'Contratistas',
      subtitle: 'Personal externo',
      icon: UserCheck,
      path: '/labores/contratistas',
      isActive: () => location.pathname.startsWith('/labores/contratistas'),
    },
  ];

  return (
    <div className="bg-white/80 backdrop-blur-xl border-b border-primary/10 mb-6 -mx-4 lg:-mx-8 px-4 lg:px-8">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.isActive();

          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`flex items-center gap-2 px-3 lg:px-4 py-3 lg:py-4 border-b-2 transition-all whitespace-nowrap ${
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-brand-brown/60 hover:text-foreground hover:border-primary/30'
              }`}
            >
              <Icon className="w-4 h-4 lg:w-5 lg:h-5" />
              <div className="text-left">
                <div className={`text-sm ${active ? 'font-medium' : ''}`}>
                  {tab.label}
                </div>
                <div className="text-xs text-brand-brown/50 hidden lg:block">
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
