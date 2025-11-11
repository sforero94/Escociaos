import { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  // Mostrar loader mientras carga
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAF5] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#73991C] animate-spin mx-auto mb-4" />
          <p className="text-[#4D240F]/70">Verificando autenticación...</p>
        </div>
      </div>
    );
  }

  // Si no está autenticado, mostrar fallback o null
  if (!isAuthenticated) {
    return fallback ? <>{fallback}</> : null;
  }

  // Usuario autenticado, mostrar contenido
  return <>{children}</>;
}
