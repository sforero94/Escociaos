import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, List, Upload, Settings, Hexagon } from 'lucide-react';

/**
 * Submenú horizontal para las páginas de Monitoreo
 */
export function MonitoreoSubNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = [
    {
      id: 'tablero',
      label: 'Tablero',
      subtitle: 'Tendencias e insights',
      icon: BarChart3,
      path: '/monitoreo',
    },
    {
      id: 'registros',
      label: 'Registros de monitoreo',
      subtitle: 'Ver todos',
      icon: List,
      path: '/monitoreo/registros',
    },
    {
      id: 'carga-masiva',
      label: 'Carga Masiva',
      subtitle: 'Importar datos',
      icon: Upload,
      path: '/monitoreo/carga-masiva',
    },
    {
      id: 'catalogo',
      label: 'Modificar catálogo',
      subtitle: 'Plagas y enfermedades',
      icon: Settings,
      path: '/monitoreo/catalogo',
    },
    {
      id: 'apiarios',
      label: 'Apiarios',
      subtitle: 'Colmenas',
      icon: Hexagon,
      path: '/monitoreo/apiarios',
    },
  ];

  const isActive = (path: string) => {
    if (path === '/monitoreo') {
      return location.pathname === '/monitoreo';
    }
    return location.pathname.startsWith(path);
  };

  return (
    // `overflow-hidden` en el envoltorio es un respaldo deliberado, no
    // decorativo: la fila de abajo ya tenía `overflow-x-auto`, pero medido en
    // pantalla a 375px seguía empujando la página entera (scrollWidth 446,
    // "Modificar catálogo" saliéndose hasta 638px — la única de las 45 rutas
    // que empeoró con F1, ver docs/tailwind-spike/auditoria-recorte-medida.md).
    // Este contenedor nunca necesita scroll propio (no es él quien scrollea,
    // es su hijo), así que `overflow-hidden` aquí solo garantiza que el
    // desbordamiento de los tabs jamás se escape hacia el documento, sin
    // importar la causa exacta.
    <div className="bg-white/80 backdrop-blur-xl border-b border-primary/10 mb-6 -mx-4 lg:-mx-8 px-4 lg:px-8 overflow-hidden">
      {/* `min-w-0`: sin esto un contenedor `overflow-x-auto` puede terminar
          pidiendo el ancho de TODO su contenido en vez de limitarse al ancho
          disponible — es el mismo patrón que rompe el recorte de texto en
          flex/grid (ver auditoría, "El caso testigo"). Con `min-w-0` el
          scroll interno es el único lugar donde el desborde puede vivir. */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide min-w-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);

          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`flex items-center gap-2 px-3 lg:px-4 py-3 lg:py-4 border-b-2 transition-all whitespace-nowrap flex-shrink-0 ${
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