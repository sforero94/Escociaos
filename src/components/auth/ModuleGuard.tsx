import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface ModuleGuardProps {
  modulo: string;
}

/**
 * Layout-route guard for per-user module visibility (aguacate | hato_lechero | ganado | finanzas).
 * Redirects denied direct-URL access to "/" — the sidebar already hides the item,
 * so a URL a user can't reach should send them home rather than show a restricted-access screen.
 */
export function ModuleGuard({ modulo }: ModuleGuardProps) {
  const { isLoading, hasModulo } = useAuth();

  if (isLoading) return null; // ProtectedRoute already shows the spinner

  if (!hasModulo(modulo)) return <Navigate to="/" replace />;

  return <Outlet />;
}
