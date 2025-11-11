import { ReactNode, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user, profile } = useAuth();

  // Debug logs
  useEffect(() => {
    console.log('🔒 ProtectedRoute - Estado:', {
      isLoading,
      isAuthenticated,
      hasUser: !!user,
      hasProfile: !!profile,
    });
  }, [isLoading, isAuthenticated, user, profile]);

  // Mostrar loader mientras carga
  if (isLoading) {
    console.log('⏳ ProtectedRoute: Mostrando loader...');
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
    console.log('❌ ProtectedRoute: Usuario NO autenticado, mostrando fallback');
    return fallback ? <>{fallback}</> : null;
  }

  // Usuario autenticado, mostrar contenido
  console.log('✅ ProtectedRoute: Usuario autenticado, mostrando contenido');
  return <>{children}</>;
}