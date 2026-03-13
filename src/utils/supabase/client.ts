import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Singleton Supabase client instance
let supabaseInstance: SupabaseClient<Database> | null = null;

export function getSupabase() {
  if (!supabaseInstance) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
    }
    supabaseInstance = createClient<Database>(supabaseUrl, supabaseAnonKey);
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
  
  try {
    console.log('🔍 getUserProfile: Buscando perfil para user ID:', userId);
    
    // Query simple sin timeout race - dejar que Supabase maneje sus propios timeouts
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .maybeSingle(); // maybeSingle() no lanza error si no encuentra registros
    
    if (error) {
      console.error('❌ Error obteniendo perfil:', error);
      return null;
    }
    
    if (!data) {
      console.log('ℹ️ No se encontró perfil en tabla usuarios (esto es normal si no se ha creado)');
      return null;
    }
    
    console.log('✅ Perfil obtenido exitosamente:', data);
    return {
      id: data.id,
      nombre: data.nombre_completo || 'Usuario',
      email: data.email,
      rol: data.rol || 'Administrador',
      created_at: data.created_at
    };
  } catch (error) {
    console.error('❌ Excepción en getUserProfile:', error);
    return null;
  }
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