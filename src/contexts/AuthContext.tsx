import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { getSupabase, getCurrentUser, getUserProfile, signOut as supabaseSignOut } from '../utils/supabase/client';

// Tipos
interface UserProfile {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (allowedRoles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar sesión inicial
  useEffect(() => {
    checkUser();

    // Escuchar cambios en la autenticación
    const supabase = getSupabase();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        
        if (event === 'SIGNED_IN' && session) {
          await loadUserData(session);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          setSession(null);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          setSession(session);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Verificar usuario actual
  const checkUser = async () => {
    try {
      setIsLoading(true);
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        await loadUserData(session);
      }
    } catch (error) {
      console.error('Error verificando usuario:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar datos del usuario
  const loadUserData = async (currentSession: Session) => {
    try {
      const currentUser = currentSession.user;
      setUser(currentUser);
      setSession(currentSession);

      // Obtener perfil
      const userProfile = await getUserProfile(currentUser.id);
      
      if (userProfile) {
        setProfile(userProfile);
      } else {
        // Si no hay perfil, crear uno básico desde auth
        setProfile({
          id: currentUser.id,
          nombre: currentUser.email?.split('@')[0] || 'Usuario',
          email: currentUser.email || '',
          rol: 'Administrador', // Rol por defecto
        });
        console.warn('No se encontró perfil en la tabla usuarios. Usando datos de auth.');
      }
    } catch (error) {
      console.error('Error cargando datos del usuario:', error);
    }
  };

  // Refrescar perfil
  const refreshProfile = async () => {
    if (user) {
      const userProfile = await getUserProfile(user.id);
      if (userProfile) {
        setProfile(userProfile);
      }
    }
  };

  // Cerrar sesión
  const signOut = async () => {
    try {
      await supabaseSignOut();
      setUser(null);
      setProfile(null);
      setSession(null);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  // Verificar rol
  const hasRole = (allowedRoles: string[]): boolean => {
    if (!profile) return false;
    return allowedRoles.includes(profile.rol);
  };

  const value: AuthContextType = {
    user,
    profile,
    session,
    isLoading,
    isAuthenticated: !!user && !!profile,
    signOut,
    refreshProfile,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook personalizado
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
}

// Hook para requerir autenticación
export function useRequireAuth() {
  const auth = useAuth();
  
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      console.warn('Usuario no autenticado. Requiere login.');
    }
  }, [auth.isLoading, auth.isAuthenticated]);

  return auth;
}

// Hook para requerir roles específicos
export function useRequireRole(allowedRoles: string[]) {
  const auth = useRequireAuth();
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    if (!auth.isLoading) {
      const permission = auth.hasRole(allowedRoles);
      setHasPermission(permission);
      
      if (!permission && auth.isAuthenticated) {
        console.warn('Usuario no tiene los permisos necesarios:', allowedRoles);
      }
    }
  }, [auth.isLoading, auth.profile, allowedRoles]);

  return { ...auth, hasPermission };
}
