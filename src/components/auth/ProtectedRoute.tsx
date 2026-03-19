import { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2, Send } from 'lucide-react';
import { Button } from '../ui/button';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, profile, signOut } = useAuth();

  // Mostrar loader mientras carga
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-brand-brown/70">Verificando autenticación...</p>
        </div>
      </div>
    );
  }

  // Si no está autenticado, mostrar fallback o null
  if (!isAuthenticated) {
    return fallback ? <>{fallback}</> : null;
  }

  // Monitor users only have access to the Telegram bot
  if (profile?.rol === 'Monitor') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-teal-100 flex items-center justify-center mx-auto mb-4">
            <Send className="w-8 h-8 text-teal-600" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Acceso solo por Telegram</h2>
          <p className="text-brand-brown/70 mb-6">
            Tu cuenta de Monitor solo tiene acceso al bot de Telegram. Usa el bot para registrar monitoreos y otras actividades.
          </p>
          <Button variant="outline" onClick={signOut}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  // Usuario autenticado, mostrar contenido
  return <>{children}</>;
}