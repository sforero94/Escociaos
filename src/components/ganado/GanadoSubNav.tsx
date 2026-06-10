import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, ArrowRightLeft } from 'lucide-react';

export function GanadoSubNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = [
    {
      id: 'inventario',
      label: 'Inventario',
      subtitle: 'Cabezas por potrero',
      icon: ClipboardList,
      path: '/ganado',
    },
    {
      id: 'movimientos',
      label: 'Movimientos',
      subtitle: 'Eventos y confirmaciones',
      icon: ArrowRightLeft,
      path: '/ganado/movimientos',
    },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="bg-white/80 border-b border-gray-200 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-6">
      <div className="flex gap-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);

          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`flex-1 px-4 lg:px-6 py-3 lg:py-4 border-b-2 transition-all text-left ${
                active
                  ? 'border-primary border-b-2'
                  : 'border-transparent hover:border-gray-300 hover:bg-gray-50/50'
              }`}
            >
              <div className="flex items-center gap-2 lg:gap-3">
                <Icon className={`w-4 h-4 lg:w-5 lg:h-5 ${active ? 'text-primary' : 'text-gray-400'}`} />
                <div>
                  <div className={`text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-700'}`}>
                    {tab.label}
                  </div>
                  <div className="text-xs text-gray-500 hidden lg:block">{tab.subtitle}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
