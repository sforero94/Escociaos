import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { getSupabase, getUserProfile, signOut as supabaseSignOut } from '../utils/supabase/client';
import { puedeAccederModulo } from '../utils/modulosAcceso';

interface UserProfile {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  modulos: string[];
  created_at?: string;
  activo?: boolean | null;
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
  hasModulo: (moduloKey: string) => boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
interface AuthState { session: Session | null; profile: UserProfile | null; isLoading: boolean; }

export function AuthProvider({ children }: { children: ReactNode }) {
  // One state transition keeps session/user/profile coherent for every render.
  const [state, setState] = useState<AuthState>({ session: null, profile: null, isLoading: true });
  const sessionRef = useRef<Session | null>(null);
  const generation = useRef(0);
  const invalidateGeneration = useCallback(() => ++generation.current, []);
  const profileDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDeadline = useCallback(() => {
    if (profileDeadline.current !== null) clearTimeout(profileDeadline.current);
    profileDeadline.current = null;
  }, []);

  const loadProfile = useCallback(async (ownerId: string, request: number) => {
    const current = () => generation.current === request && sessionRef.current?.user.id === ownerId;
    if (!current()) return;
    clearDeadline();
    // Stop the spinner, but keep the request alive so late success can recover.
    profileDeadline.current = setTimeout(() => {
      if (current()) setState(prev => ({ ...prev, isLoading: false }));
    }, 2000);
    try {
      const result = await getUserProfile(ownerId);
      if (!current()) return;
      clearDeadline();
      const profile = result && result.id === ownerId ? result as UserProfile : null;
      setState(prev => ({ ...prev, profile, isLoading: false }));
    } catch {
      if (!current()) return;
      clearDeadline();
      setState(prev => ({ ...prev, profile: null, isLoading: false }));
    }
  }, [clearDeadline]);

  const applySession = useCallback((next: Session | null) => {
    const previousId = sessionRef.current?.user.id;
    const nextId = next?.user.id;
    sessionRef.current = next;
    if (next && previousId === nextId) {
      // Same-account token events keep a pending lookup and never flash a spinner.
      setState(prev => ({ ...prev, session: next }));
      return;
    }
    const request = invalidateGeneration();
    clearDeadline();
    setState({ session: next, profile: null, isLoading: !!next });
    if (next) {
      // Do not await SDK work from onAuthStateChange: it runs under the auth lock.
      void Promise.resolve().then(() => loadProfile(next.user.id, request));
    }
  }, [clearDeadline, loadProfile, invalidateGeneration]);

  useEffect(() => {
    const supabase = getSupabase();
    const initialRequest = generation.current;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') applySession(null);
      else if (next) applySession(next);
      else if (event === 'INITIAL_SESSION') applySession(null);
    });
    const sessionDeadline = setTimeout(() => {
      if (generation.current === initialRequest && !sessionRef.current) applySession(null);
    }, 10000);
    void supabase.auth.getSession().then(({ data, error }) => {
      if (generation.current !== initialRequest) return;
      clearTimeout(sessionDeadline);
      applySession(error ? null : data.session);
    }).catch(() => {
      if (generation.current !== initialRequest) return;
      clearTimeout(sessionDeadline);
      applySession(null);
    });
    return () => {
      invalidateGeneration();
      sessionRef.current = null;
      clearDeadline();
      clearTimeout(sessionDeadline);
      subscription.unsubscribe();
    };
  }, [applySession, clearDeadline, invalidateGeneration]);

  const refreshProfile = useCallback(async () => {
    const ownerId = sessionRef.current?.user.id;
    if (!ownerId) return;
    const request = invalidateGeneration();
    clearDeadline();
    setState(prev => ({ ...prev, profile: null, isLoading: true }));
    await loadProfile(ownerId, request);
  }, [clearDeadline, loadProfile, invalidateGeneration]);

  const signOut = useCallback(async () => {
    // Revoke local access before the SDK/network can finish or fail.
    applySession(null);
    try { await supabaseSignOut(); } catch (error) { console.error('Error al cerrar sesión:', error); }
    // No completion write: a newer login may have occurred while signOut awaited.
  }, [applySession]);

  const user = state.session?.user ?? null;
  const profile = state.profile;
  const verified = !!user && profile?.id === user.id && profile.activo === true && !!profile.rol;
  const value: AuthContextType = {
    ...state, user,
    isAuthenticated: !!user,
    signOut, refreshProfile,
    hasRole: roles => verified && roles.includes(profile!.rol),
    hasModulo: modulo => verified && puedeAccederModulo(profile, modulo),
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
  const hasPermission = !auth.isLoading && auth.hasRole(allowedRoles);

  return { ...auth, hasPermission };
}