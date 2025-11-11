import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const supabaseUrl = `https://${projectId}.supabase.co`;

// Singleton Supabase client instance
let supabaseInstance: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, publicAnonKey);
  }
  return supabaseInstance;
}

// Función auxiliar para obtener el usuario actual
export async function getCurrentUser() {
  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error) {
    console.error('Error obteniendo usuario:', error);
    return null;
  }
  return user;
}

// Función auxiliar para obtener el perfil completo (con rol)
export async function getUserProfile(userId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error('Error obteniendo perfil:', error);
    return null;
  }
  return data;
}

// Función para cerrar sesión
export async function signOut() {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error('Error al cerrar sesión:', error);
    return false;
  }
  return true;
}

// Función para verificar la sesión activa
export async function checkSession() {
  const supabase = getSupabase();
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.error('Error verificando sesión:', error);
    return null;
  }
  return session;
}

// Función para iniciar sesión
export async function signIn(email: string, password: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) {
    console.error('Error al iniciar sesión:', error);
    return { user: null, session: null, error };
  }
  return { user: data.user, session: data.session, error: null };
}