import { Outlet } from 'react-router-dom';
import { LaboresSubNav } from './LaboresSubNav';

/**
 * Wrapper component para el módulo de Labores
 * Muestra el submenú de navegación y renderiza las vistas hijas
 */
export function LaboresLayout() {
  return (
    <div>
      <LaboresSubNav />
      <Outlet />
    </div>
  );
}
