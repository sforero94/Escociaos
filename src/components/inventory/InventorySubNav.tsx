import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, History, ShoppingCart, ClipboardCheck, Package } from 'lucide-react';

/**
 * Submenú horizontal para las páginas de Inventario
 */
export function InventorySubNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = [
    {
      id: 'tablero',
      label: 'Tablero',
      subtitle: 'Vista general',
      icon: BarChart3,
      path: '/inventario/dashboard',
    },
    {
      id: 'movimientos',
      label: 'Movimientos',
      subtitle: 'Historial completo',
      icon: History,
      path: '/inventario/movimientos',
    },
    {
      id: 'compras',
      label: 'Compras',
      subtitle: 'Registros de compras',
      icon: ShoppingCart,
      path: '/inventario/compras',
    },
    {
      id: 'verificaciones',
      label: 'Verificaciones',
      subtitle: 'Conteos físicos',
      icon: ClipboardCheck,
      path: '/inventario/verificaciones',
    },
    {
      id: 'productos',
      label: 'Base de Productos',
      subtitle: 'Lista de productos',
      icon: Package,
      path: '/inventario',
    },
  ];

  const isActive = (path: string) => {
    if (path === '/inventario') {
      return location.pathname === '/inventario';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl border-b border-[#73991C]/10 mb-6 -mx-4 lg:-mx-8 px-4 lg:px-8">
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
                  ? 'border-[#73991C] text-[#172E08]'
                  : 'border-transparent text-[#4D240F]/60 hover:text-[#172E08] hover:border-[#73991C]/30'
              }`}
            >
              <Icon className="w-5 h-5" />
              <div className="text-left">
                <div className={`text-sm ${active ? 'font-medium' : ''}`}>
                  {tab.label}
                </div>
                <div className="text-xs text-[#4D240F]/50">
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