import { Link, useLocation } from 'react-router-dom';
import { List } from 'lucide-react';

/**
 * Barra de navegación del módulo de Verificaciones.
 *
 * "Nueva Verificación" se retiró: App.tsx ya no enruta `nueva` (la migración
 * 124 revocó la escritura sobre `verificaciones_inventario` /
 * `verificaciones_detalle`, así que crear una fila nueva ya no puede
 * cumplirse). Ver docs/plan_verificacion_inventario.md CA-27.
 */
export function VerificacionesNav() {
  const location = useLocation();

  const navItems = [
    {
      path: '/inventario/verificaciones',
      label: 'Todas las Verificaciones',
      icon: List,
    },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-2 shadow-[0_4px_24px_rgba(115,153,28,0.08)] mb-6">
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
                  ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg'
                  : 'text-foreground hover:bg-muted/50'
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
