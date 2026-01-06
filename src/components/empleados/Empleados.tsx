import { Outlet } from 'react-router-dom';
import { EmpleadosSubNav } from './EmpleadosSubNav';

/**
 * Wrapper component para el módulo de Empleados
 * Muestra el submenú de navegación y renderiza las vistas hijas
 */
export function Empleados() {
  return (
    <div>
      <EmpleadosSubNav />
      <Outlet />
    </div>
  );
}
