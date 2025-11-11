import { Link, useLocation } from 'react-router-dom';
import { List, Plus } from 'lucide-react';

/**
 * Barra de navegación del módulo de Verificaciones
 * Permite navegar entre las diferentes secciones
 */
export function VerificacionesNav() {
  const location = useLocation();

  const navItems = [
    {
      path: '/inventario/verificaciones',
      label: 'Todas las Verificaciones',
      icon: List,
    },
    {
      path: '/inventario/verificaciones/nueva',
      label: 'Nueva Verificación',
      icon: Plus,
    },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-2 shadow-[0_4px_24px_rgba(115,153,28,0.08)] mb-6">
      <nav className="flex flex-wrap gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 font-medium ${
                active
                  ? 'bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white shadow-lg'
                  : 'text-[#172E08] hover:bg-[#E7EDDD]/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
