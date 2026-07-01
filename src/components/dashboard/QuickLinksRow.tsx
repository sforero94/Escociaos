import { useNavigate } from 'react-router-dom';
import { Sprout, Package, TrendingUp, FileText } from 'lucide-react';

const LINKS = [
  { label: 'Aplicaciones', icon: Sprout, path: '/aplicaciones' },
  { label: 'Inventario', icon: Package, path: '/inventario/dashboard' },
  { label: 'Producción', icon: TrendingUp, path: '/produccion' },
  { label: 'Reportes', icon: FileText, path: '/reportes' },
];

/**
 * QuickLinksRow - Acceso directo a los módulos que no tienen tarjeta
 * propia en el dashboard (su información relevante ya vive en las
 * alertas o no es de consulta frecuente entre tareas de campo).
 */
export function QuickLinksRow() {
  const navigate = useNavigate();

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {LINKS.map(({ label, icon: Icon, path }) => (
        <button
          key={path}
          onClick={() => navigate(path)}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-brand-brown/70 hover:border-primary/40 hover:text-primary transition-colors"
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
