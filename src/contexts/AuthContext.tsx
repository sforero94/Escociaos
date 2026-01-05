import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
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
  // Use ref instead of state to avoid stale closure issues in onAuthStateChange
  const profileLoadedRef = useRef(false);

  // Cargar sesión inicial
  useEffect(() => {
    console.log('🔐 AuthProvider: Iniciando verificación de usuario...');
    checkUser();

    // Escuchar cambios en la autenticación
    const supabase = getSupabase();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth state changed:', event, session ? 'con sesión' : 'sin sesión');

        if (event === 'SIGNED_IN' && session) {
          // Only show loading spinner if profile isn't loaded yet (initial login)
          // This prevents the spinner from showing on tab switches
          if (!profileLoadedRef.current) {
            setIsLoading(true);
            await loadUserData(session);
          } else {
            // Profile already loaded - just update session silently
            setSession(session);
            console.log('✅ Session refreshed silently (no profile reload)');
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          setSession(null);
          setIsLoading(false);
          profileLoadedRef.current = false;
        } else if (event === 'TOKEN_REFRESHED' && session) {
          // Token refresh should NOT trigger loading spinner
          setSession(session);
          console.log('✅ Token refreshed silently');
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
      console.log('🔍 Verificando usuario actual...');
      setIsLoading(true);
      
      const supabase = getSupabase();
      
      // Timeout de 10 segundos para evitar carga infinita
      const timeoutPromise = new Promise<{ data: { session: null }, error: any }>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout de autenticación (10s)')), 10000);
      });
      
      const sessionPromise = supabase.auth.getSession();
      
      // Race entre la llamada real y el timeout
      const { data: { session }, error } = await Promise.race([
        sessionPromise,
        timeoutPromise
      ]);
      
      if (error) {
        console.error('❌ Error obteniendo sesión:', error);
        setUser(null);
        setProfile(null);
        setSession(null);
        setIsLoading(false);
        return;
      }
      
      if (session) {
        console.log('✅ Sesión encontrada, cargando usuario...');
        await loadUserData(session);
      } else {
        console.log('ℹ️ No hay sesión activa');
        setUser(null);
        setProfile(null);
        setSession(null);
        setIsLoading(false);
      }
    } catch (error: any) {
      console.error('❌ Error verificando usuario:', error);
      // Si hay timeout o error, establecer como no autenticado
      if (error.message?.includes('Timeout')) {
        console.warn('⏱️ Timeout de autenticación alcanzado, continuando sin sesión');
      }
      setUser(null);
      setProfile(null);
      setSession(null);
      setIsLoading(false);
    }
  };

  // Cargar datos del usuario
  const loadUserData = async (currentSession: Session) => {
    try {
      console.log('👤 Cargando datos del usuario...');
      const currentUser = currentSession.user;

      // Establecer user y session INMEDIATAMENTE
      setUser(currentUser);
      setSession(currentSession);

      // Intentar recuperar perfil guardado de localStorage PRIMERO
      let temporalProfile;
      try {
        const savedProfile = localStorage.getItem('userProfile');
        if (savedProfile) {
          temporalProfile = JSON.parse(savedProfile);
          console.log('✅ Perfil recuperado de localStorage:', temporalProfile);
        }
      } catch (e) {
        console.log('ℹ️ No se pudo recuperar perfil de localStorage');
      }

      // Si no hay perfil guardado, crear uno temporal por defecto
      if (!temporalProfile) {
        temporalProfile = {
          id: currentUser.id,
          nombre: currentUser.email?.split('@')[0] || 'Usuario',
          email: currentUser.email || '',
          rol: 'Administrador',
        };
      }

      // Establecer perfil temporal PRIMERO para que la app funcione de inmediato
      setProfile(temporalProfile);
      console.log('✅ Perfil temporal establecido (app lista):', temporalProfile);

      // OPCIONAL: Intentar obtener perfil real de la tabla en background con timeout
      // Si falla o tarda, no importa porque ya tenemos el temporal
      console.log('📋 Intentando obtener perfil real de tabla usuarios (opcional, timeout 2s)...');
      
      try {
        // Timeout de 2 segundos para obtener el perfil
        const profilePromise = getUserProfile(currentUser.id);
        const timeoutPromise = new Promise<null>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout obteniendo perfil (2s)')), 2000);
        });

        const userProfile = await Promise.race([profilePromise, timeoutPromise]);

        if (userProfile) {
          console.log('✅ Perfil real encontrado, actualizando:', userProfile.nombre);
          setProfile(userProfile);
          // Guardar en localStorage para futuras sesiones
          try {
            localStorage.setItem('userProfile', JSON.stringify(userProfile));
            console.log('💾 Perfil guardado en localStorage');
          } catch (e) {
            console.log('⚠️ No se pudo guardar perfil en localStorage');
          }
        } else {
          console.log('ℹ️ Sin perfil en tabla, usando temporal (esto es normal)');
        }
      } catch (profileError: any) {
        // No es crítico, ya tenemos perfil temporal
        if (profileError.message?.includes('Timeout')) {
          console.log('⏱️ Timeout obteniendo perfil, usando temporal (OK)');
        } else {
          console.log('ℹ️ No se pudo obtener perfil real, usando temporal (OK):', profileError?.message);
        }
      }

    } catch (error) {
      console.error('❌ Error cargando datos del usuario:', error);

      // Intentar recuperar de localStorage primero
      let basicProfile;
      try {
        const savedProfile = localStorage.getItem('userProfile');
        if (savedProfile) {
          basicProfile = JSON.parse(savedProfile);
          console.log('✅ Perfil de emergencia recuperado de localStorage:', basicProfile);
        }
      } catch (e) {
        console.log('ℹ️ No se pudo recuperar perfil de localStorage en catch');
      }

      // Si no hay perfil guardado, crear uno básico
      if (!basicProfile) {
        basicProfile = {
          id: currentSession.user.id,
          nombre: currentSession.user.email?.split('@')[0] || 'Usuario',
          email: currentSession.user.email || '',
          rol: 'Administrador',
        };
        console.log('📝 Perfil de emergencia creado desde cero:', basicProfile);
      }

      setUser(currentSession.user);
      setProfile(basicProfile);
    } finally {
      console.log('✅ AuthContext: Carga completada, isLoading = false');
      setIsLoading(false);
      profileLoadedRef.current = true;
    }
  };

  // Refrescar perfil
  const refreshProfile = async () => {
    if (user) {
      const userProfile = await getUserProfile(user.id);
      if (userProfile) {
        setProfile(userProfile);
        // Actualizar localStorage
        try {
          localStorage.setItem('userProfile', JSON.stringify(userProfile));
          console.log('💾 Perfil actualizado en localStorage');
        } catch (e) {
          console.log('⚠️ No se pudo actualizar perfil en localStorage');
        }
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
      profileLoadedRef.current = false;
      // Limpiar localStorage
      try {
        localStorage.removeItem('userProfile');
        console.log('🗑️ Perfil eliminado de localStorage');
      } catch (e) {
        console.log('⚠️ No se pudo eliminar perfil de localStorage');
      }
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

  // Debug: Log del estado cada vez que cambia
  useEffect(() => {
    console.log('🔐 AuthContext - Estado actualizado:', {
      hasUser: !!user,
      hasProfile: !!profile,
      isLoading,
      isAuthenticated: !!user && !!profile,
      profileData: profile ? { nombre: profile.nombre, rol: profile.rol } : null,
    });
  }, [user, profile, isLoading]);

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