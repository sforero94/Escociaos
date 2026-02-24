import { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: string[];
  fallback?: ReactNode;
  onUnauthorized?: () => void;
}

export function RoleGuard({ 
  children, 
  allowedRoles, 
  fallback,
  onUnauthorized 
}: RoleGuardProps) {
  const { profile, isLoading, hasRole } = useAuth();

  // Mostrar loader mientras carga
  if (isLoading) {
    return null;
  }

  // Verificar permisos
  const hasPermission = hasRole(allowedRoles);

  if (!hasPermission) {
    // Si hay callback, ejecutarlo
    if (onUnauthorized) {
      onUnauthorized();
    }

    // Mostrar fallback personalizado o mensaje por defecto
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-warning/10 rounded-2xl mb-4 shadow-lg">
            <AlertTriangle className="w-10 h-10 text-warning" />
          </div>
          <h2 className="text-2xl text-foreground mb-2">Acceso Restringido</h2>
          <p className="text-brand-brown/70 mb-6">
            No tienes permisos para acceder a esta sección.
            <br />
            <span className="text-sm">Rol actual: <strong>{profile?.rol || 'Sin rol'}</strong></span>
            <br />
            <span className="text-sm">Se requiere: <strong>{allowedRoles.join(', ')}</strong></span>
          </p>
          <Button
            onClick={() => window.history.back()}
            className="bg-gradient-to-r from-primary to-secondary text-white rounded-xl"
          >
            Volver
          </Button>
        </div>
      </div>
    );
  }

  // Usuario tiene permisos, mostrar contenido
  return <>{children}</>;
}
