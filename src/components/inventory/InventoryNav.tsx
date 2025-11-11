import { Link, useLocation } from 'react-router-dom';
import { Package, BarChart3, List, ShoppingCart } from 'lucide-react';

export function InventoryNav() {
  const location = useLocation();

  const navItems = [
    {
      path: '/inventario/dashboard',
      label: 'Dashboard',
      icon: BarChart3,
      description: 'Vista general'
    },
    {
      path: '/inventario/movimientos',
      label: 'Movimientos',
      icon: List,
      description: 'Historial completo'
    },
    {
      path: '/inventario/nueva-compra',
      label: 'Nueva Compra',
      icon: ShoppingCart,
      description: 'Registrar entrada'
    },
    {
      path: '/inventario',
      label: 'Productos',
      icon: Package,
      description: 'Lista de productos'
    },
  ];

  const isActive = (path: string) => {
    if (path === '/inventario') {
      return location.pathname === '/inventario';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 shadow-[0_4px_24px_rgba(115,153,28,0.08)] mb-6 overflow-hidden">
      <div className="flex overflow-x-auto scrollbar-hide">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex-1 min-w-fit px-6 py-4 border-b-4 transition-all duration-200 ${
                active
                  ? 'border-[#73991C] bg-gradient-to-br from-[#F8FAF5] to-[#BFD97D]/20'
                  : 'border-transparent hover:bg-[#F8FAF5]/50'
              }`}
            >
              <div className="flex items-center gap-3 justify-center">
                <Icon 
                  className={`w-6 h-6 transition-colors ${
                    active ? 'text-[#73991C]' : 'text-[#4D240F]/60'
                  }`} 
                />
                <div className="text-left">
                  <p className={`transition-colors ${
                    active ? 'text-[#73991C]' : 'text-[#172E08]'
                  }`}>
                    {item.label}
                  </p>
                  <p className={`text-xs transition-colors ${
                    active ? 'text-[#73991C]/70' : 'text-[#4D240F]/60'
                  }`}>
                    {item.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}